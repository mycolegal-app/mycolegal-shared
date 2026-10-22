// Prueba del lector de Excel: `npx tsx packages/text-extract/xlsx.test.ts`.
//
// Reproduce en un libro sintético lo que tumbaba los Excel reales de las promotoras
// (oct-2026): fórmulas sin resultado guardado (`cell.text` lanzaba y se llevaba el libro
// entero), celdas combinadas, ruido de coma flotante, fechas y el recorte silencioso.
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { extractXlsx, extractXlsxText } from './xlsx';
import { extraerTexto } from './index';

function run(nombre: string, fn: () => Promise<void>) {
  return fn().then(() => console.log(`  ✓ ${nombre}`));
}

async function libro(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Quadre de SUPERFICIES');
  ws.getCell('B6').value = 'SUPERFÍCIES HABITATGES';
  ws.mergeCells('B6:F6'); // combinada: la cabecera de grupo de las promotoras
  ws.getCell('A9').value = 'LLIURE/HPO';
  ws.getCell('B9').value = 'ORDRE';
  ws.getCell('AE9').value = 'Total Sup. Útil Interior';
  ws.getCell('A11').value = 'HPO';
  ws.getCell('B11').value = 1;
  ws.getCell('AE11').value = 80.52000000000001;
  // Fórmula SIN resultado guardado: es lo que hacía lanzar a `cell.text`.
  ws.getCell('AF11').value = { formula: 'AE11*1.15' } as ExcelJS.CellFormulaValue;
  // Fórmula con resultado: vale el resultado.
  ws.getCell('AG11').value = { formula: 'AE11/2', result: 40.26 } as ExcelJS.CellFormulaValue;
  ws.getCell('B2').value = new Date(Date.UTC(2023, 11, 19));
  ws.getCell('C2').value = { richText: [{ text: 'Rich ' }, { text: 'text' }] };
  const vacia = wb.addWorksheet('Hoja2');
  void vacia;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

async function main() {
  const bytes = await libro();

  await run('una fórmula sin valor no tumba el libro: se lee todo lo demás y se avisa', async () => {
    const x = await extractXlsx(bytes);
    assert.ok(x.texto.includes('Fila 11: A=HPO | B=1 | AE=80.52 | AG=40.26'), x.texto);
    assert.ok(!x.texto.includes('AF='), 'la fórmula sin resultado sale vacía, no inventada');
    assert.ok(x.avisos.some((a) => a.includes('1 celda(s) con fórmula')), x.avisos.join(' / '));
    assert.equal(x.recortado, false);
  });

  await run('celda combinada: el valor sale una vez, en la maestra', async () => {
    const t = await extractXlsxText(bytes);
    assert.equal((t.match(/SUPERFÍCIES HABITATGES/g) ?? []).length, 1);
    assert.ok(t.includes('Fila 6: B=SUPERFÍCIES HABITATGES'));
  });

  await run('fechas dd/mm/aaaa, texto enriquecido y números sin ruido', async () => {
    const t = await extractXlsxText(bytes);
    assert.ok(t.includes('Fila 2: B=19/12/2023 | C=Rich text'), t);
    assert.ok(!t.includes('80.52000000000001'));
  });

  await run('si no cabe, recorta por filas enteras y lo DICE (texto + avisos)', async () => {
    const x = await extractXlsx(bytes, { maxChars: 60 });
    assert.equal(x.recortado, true);
    assert.ok(x.texto.includes('[AVISO DEL LECTOR DE EXCEL:'), x.texto);
    assert.ok(/falta desde .*fila \d+/.test(x.avisos[0]), x.avisos[0]);
    // Ninguna fila a medias: todo lo que no es la línea de aviso es una fila entera.
    for (const l of x.texto.split('\n').slice(0, -1)) assert.ok(/^(Fila \d+: .*|# Hoja: .*)$/.test(l), l);
  });

  await run('extraerTexto propaga recortado/avisos y no lanza', async () => {
    const r = await extraerTexto(bytes, { fileName: 'dh.xlsx' });
    assert.equal(r.metodo, 'xlsx');
    assert.equal(r.recortado, false);
    assert.ok(Array.isArray(r.avisos));
  });

  await run('un .xls antiguo (OLE2) no revienta: texto vacío con aviso claro', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const x = await extractXlsx(ole);
    assert.equal(x.texto, '');
    assert.ok(x.avisos[0].includes('.xlsx'));
  });

  await run('bytes basura: texto vacío con aviso, sin lanzar', async () => {
    const x = await extractXlsx(new Uint8Array([1, 2, 3, 4, 5]));
    assert.equal(x.texto, '');
    assert.ok(x.avisos[0].startsWith('No se pudo abrir el Excel'));
  });

  console.log('xlsx: OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
