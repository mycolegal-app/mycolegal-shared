// Extracción de texto de hojas de cálculo (.xlsx/.xlsm) con `exceljs` (JS puro, sin
// binarios nativos → apto Cloud Run/serverless). Devuelve texto ETIQUETADO POR LETRA DE
// COLUMNA (A, B, …, AE, BN), una línea por fila con las celdas no vacías: así una skill que
// sepa el "diccionario de columnas" del Excel (p.ej. división horizontal: B=entidad,
// AE=sup. útil, BN=coeficiente) puede aplicarlo sobre este texto.
//
// 0.2.0 (oct-2026) — Lo que tumbaba los Excel REALES de las promotoras:
//   · `cell.text` LANZA en una fórmula sin resultado guardado (y en otras celdas raras), y
//     esa excepción, dentro del `eachRow`, se llevaba el libro entero: el usuario recibía
//     «No se pudo extraer texto» con un Excel de 34 entidades perfectamente legible
//     (Girona, 18 celdas así). Ahora se lee el VALOR de cada celda a mano, cada celda y cada
//     hoja con su propio try/catch, y una celda o una hoja que falle no arrastra al resto.
//   · Las celdas COMBINADAS se leen una vez (en la celda maestra), no repetidas.
//   · Los números salen sin ruido de coma flotante (80.52000000000001 → 80.52) y las fechas
//     como dd/mm/aaaa (antes «Tue Dec 19 2023 00:00:00 GMT+0000 …»).
//   · Si el texto no cabe, se RECORTA AVISANDO: una línea visible al final del texto (la
//     lee la IA) y `recortado`/`avisos` en el resultado (los enseña la app). Antes se
//     cortaba en silencio a 20.000 caracteres.
import ExcelJS from 'exceljs';

const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-excel.sheet.macroenabled.12', // .xlsm
]);

/** Tope por defecto del texto de UN Excel. Holgado: el de una DH real ronda 20-150 mil. */
export const XLSX_MAX_CHARS = 400_000;

/** ¿El documento es una hoja de cálculo? Por MIME y, de respaldo, por extensión. */
export function esXlsx(mime: string | null | undefined, fileName: string): boolean {
  if (XLSX_MIMES.has((mime || '').toLowerCase())) return true;
  return /\.(xlsx|xlsm|xls)$/i.test(fileName || '');
}

/** Letra(s) de columna de un índice 1-based (1→A, 27→AA, 66→BN…). */
export function colLetter(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || '?';
}

/** Número sin ruido binario: 12 cifras significativas bastan para superficies y cuotas. */
function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  return String(Number.parseFloat(v.toPrecision(12)));
}

function fmtFecha(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const base = `${dd}/${mm}/${d.getUTCFullYear()}`;
  const h = d.getUTCHours();
  const mi = d.getUTCMinutes();
  return h || mi ? `${base} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : base;
}

interface Contadores {
  formulasSinValor: number;
  celdasIlegibles: number;
}

/** Texto de un valor de exceljs. Nunca lanza. */
function render(v: unknown, cont: Contadores, depth = 0): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (v instanceof Date) return fmtFecha(v);
  if (typeof v === 'object' && depth < 3) {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: unknown }>).map((r) => (typeof r?.text === 'string' ? r.text : '')).join('');
    }
    if ('formula' in o || 'sharedFormula' in o) {
      // Fórmula: vale su RESULTADO guardado. Sin resultado (libro guardado sin recalcular
      // o fórmula compartida mal resuelta) no hay valor que leer — se cuenta y se avisa.
      if (o.result === undefined || o.result === null) {
        cont.formulasSinValor++;
        return '';
      }
      return render(o.result, cont, depth + 1);
    }
    if ('error' in o) return String(o.error ?? '');
    if ('text' in o) return render(o.text, cont, depth + 1); // hipervínculo
    if ('result' in o) return render(o.result, cont, depth + 1);
  }
  cont.celdasIlegibles++;
  return '';
}

export interface XlsxHoja {
  nombre: string;
  filas: number;
  /** Motivo si la hoja entera no se pudo leer. */
  error?: string;
}

export interface XlsxExtraccion {
  texto: string;
  /** El texto no cabía y se ha cortado (lo dice también una línea al final del texto). */
  recortado: boolean;
  /** Avisos legibles para el usuario (recorte, fórmulas sin valor, hojas ilegibles…). */
  avisos: string[];
  hojas: XlsxHoja[];
}

const esOle2 = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/**
 * Lee un libro y devuelve su texto etiquetado por columna + avisos. Nunca lanza: un libro
 * que no se puede abrir devuelve `texto: ''` con el motivo en `avisos`.
 */
export async function extractXlsx(bytes: Uint8Array, opts: { maxChars?: number } = {}): Promise<XlsxExtraccion> {
  const maxChars = opts.maxChars ?? XLSX_MAX_CHARS;
  const avisos: string[] = [];
  const hojas: XlsxHoja[] = [];
  if (esOle2(bytes)) {
    return {
      texto: '',
      recortado: false,
      avisos: ['Es un Excel antiguo (.xls, Excel 97-2003) y no se puede leer: ábrelo en Excel y guárdalo como .xlsx.'],
      hojas,
    };
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch (e) {
    return {
      texto: '',
      recortado: false,
      avisos: [`No se pudo abrir el Excel (${e instanceof Error ? e.message.slice(0, 120) : 'formato no válido'}).`],
      hojas,
    };
  }

  const cont: Contadores = { formulasSinValor: 0, celdasIlegibles: 0 };
  const lines: string[] = [];
  const multi = wb.worksheets.length > 1;
  for (const ws of wb.worksheets) {
    const hoja: XlsxHoja = { nombre: ws.name, filas: 0 };
    hojas.push(hoja);
    const propias: string[] = [];
    try {
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const cells: string[] = [];
        try {
          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            try {
              // Combinada: el valor vive en la celda maestra; las demás lo repetirían.
              if (cell.type === ExcelJS.ValueType.Merge) return;
              // Fórmula: `cell.value` (exceljs 4.4) DESCARTA un resultado 0 —copia el
              // modelo con `if (value)`— y la celda salía vacía (109 en el Excel de Girona,
              // todos los coeficientes 0 de locales y plazas). `cell.result` lo conserva.
              const v =
                cell.type === ExcelJS.ValueType.Formula
                  ? { formula: true, result: (cell as unknown as { result?: unknown }).result }
                  : cell.value;
              const txt = render(v, cont).replace(/\s+/g, ' ').trim();
              if (txt) cells.push(`${colLetter(colNumber)}=${txt}`);
            } catch {
              cont.celdasIlegibles++;
            }
          });
        } catch {
          cont.celdasIlegibles++;
        }
        if (cells.length) {
          propias.push(`Fila ${rowNumber}: ${cells.join(' | ')}`);
          hoja.filas++;
        }
      });
    } catch (e) {
      hoja.error = e instanceof Error ? e.message.slice(0, 120) : 'error';
      avisos.push(`La hoja «${ws.name}» no se pudo leer entera (${hoja.error}); se incluye lo leído hasta ahí.`);
    }
    if (!propias.length && !hoja.error) continue;
    if (multi) lines.push(`# Hoja: ${ws.name}${ws.state && ws.state !== 'visible' ? ' (oculta)' : ''}`);
    lines.push(...propias);
  }

  if (cont.formulasSinValor) {
    avisos.push(
      `${cont.formulasSinValor} celda(s) con fórmula no tienen valor calculado guardado y salen vacías: ` +
        'abre el Excel, deja que recalcule, guárdalo y vuelve a adjuntarlo si esas celdas importan.',
    );
  }
  if (cont.celdasIlegibles) avisos.push(`${cont.celdasIlegibles} celda(s) con un contenido que no se pudo leer se han dejado vacías.`);

  // Recorte AVISADO, por líneas enteras (nunca a media celda).
  let texto = lines.join('\n');
  let recortado = false;
  if (texto.length > maxChars) {
    recortado = true;
    let acum = 0;
    let n = 0;
    for (; n < lines.length; n++) {
      if (acum + lines[n].length + 1 > maxChars) break;
      acum += lines[n].length + 1;
    }
    const primeraFuera = lines[n] ?? '';
    const donde = /^Fila (\d+)/.exec(primeraFuera)?.[1];
    const hojaFuera = [...lines.slice(0, n + 1)].reverse().find((l) => l.startsWith('# Hoja: '))?.slice(8);
    const desde = `${hojaFuera ? `la hoja «${hojaFuera}», ` : ''}${donde ? `fila ${donde}` : 'la línea siguiente'}`;
    const aviso =
      `El Excel no cabe entero: se ha recortado a ${maxChars.toLocaleString('es-ES')} caracteres y falta desde ${desde} en adelante. ` +
      'Quita las hojas o filas que no hagan falta (o divídelo) y vuelve a adjuntarlo.';
    avisos.unshift(aviso);
    texto = `${lines.slice(0, n).join('\n')}\n[AVISO DEL LECTOR DE EXCEL: ${aviso}]`;
  }
  return { texto, recortado, avisos, hojas };
}

/**
 * Texto etiquetado por columna de un XLSX ('' si no se puede abrir). Compatibilidad: si
 * se recorta, el propio texto lleva al final la línea de aviso. Para los avisos
 * estructurados, `extractXlsx`.
 */
export async function extractXlsxText(bytes: Uint8Array, maxChars = XLSX_MAX_CHARS): Promise<string> {
  return (await extractXlsx(bytes, { maxChars })).texto;
}
