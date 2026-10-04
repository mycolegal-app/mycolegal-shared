// Simulación: ¿qué pasaría si renombráramos los enrutadores fiscales de la
// convención `VAR_FISCAL_<CCAA>_ENRUTADOR` a `PARR_ENRUTADOR_FISCAL_<CCAA>_DONACION`?
// No toca el Drive: añade los nombres nuevos al índice en memoria y mide.
import { it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expandirIncludes, repositorioDeMapa } from '../index';

const ESQUEMAS = process.env.DOCFILLING_ESQUEMAS;
const PARRAFOS = process.env.DOCFILLING_PARRAFOS;

function todos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) todos(p, acc);
    else if (e.endsWith('.md')) acc.push(p);
  }
  return acc;
}

/** Los renombrados que se proponen: nombre nuevo → nombre actual del fichero. */
const RENOMBRES: Record<string, string> = {
  PARR_ENRUTADOR_FISCAL_ANDALUCIA_DONACION: 'VAR_FISCAL_ANDALUCIA_ENRUTADOR',
  PARR_ENRUTADOR_FISCAL_ARAGON_DONACION: 'VAR_FISCAL_ARAGON_ENRUTADOR',
  PARR_ENRUTADOR_FISCAL_ASTURIAS_DONACION: 'VAR_FISCAL_ASTURIAS_ENRUTADOR',
  PARR_ENRUTADOR_FISCAL_BALEARES_DONACION: 'VAR_FISCAL_BALEARES_ENRUTADOR',
  PARR_ENRUTADOR_FISCAL_CANARIAS_DONACION: 'VAR_FISCAL_CANARIAS_ENRUTADOR',
  PARR_ENRUTADOR_FISCAL_CANTABRIA_DONACION: 'VAR_FISCAL_CANTABRIA_ENRUTADOR',
  // La Rioja: el maestro pide LARIOJA y el fichero se llama RIOJA.
  PARR_ENRUTADOR_FISCAL_LARIOJA_DONACION: 'PARR_ENRUTADOR_FISCAL_RIOJA_DONACION',
};

it.skipIf(!ESQUEMAS || !PARRAFOS)('efecto del renombrado', async () => {
  const L: string[] = [];
  const log = (x: string) => L.push(x);

  const base = new Map<string, string>();
  for (const f of todos(PARRAFOS!)) {
    const n = f.split('/').pop()!.replace(/\.md$/, '');
    if (!base.has(n)) base.set(n, readFileSync(f, 'utf-8'));
  }

  const conRenombres = new Map(base);
  const aplicados: string[] = [];
  for (const [nuevo, actual] of Object.entries(RENOMBRES)) {
    const contenido = base.get(actual);
    if (contenido === undefined) {
      log(`  ⚠️ no encuentro el fichero actual: ${actual}`);
      continue;
    }
    conRenombres.set(nuevo, contenido);
    aplicados.push(`${actual} → ${nuevo}`);
  }

  const esquemas = todos(ESQUEMAS!);
  async function medir(mapa: Map<string, string>) {
    const repo = repositorioDeMapa(mapa);
    let conFaltantes = 0;
    const nombres = new Set<string>();
    for (const f of esquemas) {
      const r = await expandirIncludes(readFileSync(f, 'utf-8'), repo);
      if (r.faltantes.length) {
        conFaltantes++;
        r.faltantes.forEach((n) => nombres.add(n));
      }
    }
    return { conFaltantes, distintos: nombres.size, nombres };
  }

  const antes = await medir(base);
  const despues = await medir(conRenombres);

  log(`renombrados simulados: ${aplicados.length}`);
  for (const a of aplicados) log(`   ${a}`);
  log('');
  log(`esquemas con INCLUDE sin resolver: ${antes.conFaltantes} → ${despues.conFaltantes} (de ${esquemas.length})`);
  log(`nombres distintos sin resolver:    ${antes.distintos} → ${despues.distintos}`);
  log('');
  const resueltos = [...antes.nombres].filter((n) => !despues.nombres.has(n)).sort();
  log(`se resuelven ${resueltos.length}: ${resueltos.join(', ')}`);
  log('');
  const quedan = [...despues.nombres].sort();
  log(`siguen faltando ${quedan.length}:`);
  for (const n of quedan.slice(0, 25)) log(`   ${n}`);
  writeFileSync(process.env.DOCFILLING_INFORME!, L.join('\n') + '\n');
}, 300000);
