// Extracción de texto de hojas de cálculo (.xlsx/.xlsm/.xls) con `exceljs` (JS puro, sin
// binarios nativos → apto Cloud Run/serverless). Devuelve texto ETIQUETADO POR LETRA DE
// COLUMNA (A, B, …, AE, BN), una línea por fila con las celdas no vacías: así una skill que
// sepa el "diccionario de columnas" del Excel (p.ej. división horizontal: B=entidad,
// AE=sup. útil, BN=coeficiente) puede aplicarlo sobre este texto.
import ExcelJS from 'exceljs';

const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-excel.sheet.macroenabled.12', // .xlsm
]);

/** ¿El documento es una hoja de cálculo? Por MIME y, de respaldo, por extensión. */
export function esXlsx(mime: string | null | undefined, fileName: string): boolean {
  if (XLSX_MIMES.has((mime || '').toLowerCase())) return true;
  return /\.(xlsx|xlsm|xls)$/i.test(fileName || '');
}

/** Letra(s) de columna de un índice 1-based (1→A, 27→AA, 66→BN…). */
function colLetter(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || '?';
}

/** Texto etiquetado por columna de un XLSX. '' si falla. `cell.text` resuelve fórmulas/formato. */
export async function extractXlsxText(bytes: Uint8Array, maxChars = 20000): Promise<string> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const lines: string[] = [];
    for (const ws of wb.worksheets) {
      if (wb.worksheets.length > 1) lines.push(`# Hoja: ${ws.name}`);
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const txt = String(cell.text ?? '').replace(/\s+/g, ' ').trim();
          if (txt) cells.push(`${colLetter(colNumber)}=${txt}`);
        });
        if (cells.length) lines.push(`Fila ${rowNumber}: ${cells.join(' | ')}`);
      });
      if (lines.join('\n').length > maxChars) break;
    }
    const out = lines.join('\n');
    return out.length > maxChars ? out.slice(0, maxChars) : out;
  } catch {
    return '';
  }
}
