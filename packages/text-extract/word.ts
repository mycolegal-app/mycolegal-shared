/// <reference path="./types/word-extractor.d.ts" />
// Extracción de texto de documentos Word (.doc legacy OLE y .docx OOXML) con
// `word-extractor` (JS puro, sin binarios nativos → apto Cloud Run/serverless).
// No hace OCR ni llama a servicios: el texto ya vive dentro del documento.
//
// El triple-slash `reference` de arriba hace que el .d.ts ambient (word-extractor
// no publica tipos) viaje y lo resuelva TAMBIÉN el tsc del consumidor, que compila
// este .ts desde node_modules (el paquete se distribuye como TS fuente).
import WordExtractor from 'word-extractor';

// MIMEs que envía el navegador para Word.
const WORD_MIMES = new Set([
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]);

/** ¿El documento es Word? Decide por MIME y, como respaldo, por extensión
 *  (el navegador a veces manda octet-stream / vacío para .doc/.docx). */
export function esWord(mime: string | null | undefined, fileName: string): boolean {
  if (WORD_MIMES.has((mime || '').toLowerCase())) return true;
  return /\.docx?$/i.test(fileName);
}

/** Texto plano de un .doc/.docx: cuerpo + notas + cabeceras/pies. '' si falla. */
export async function extractWordText(bytes: Uint8Array): Promise<string> {
  try {
    const doc = await new WordExtractor().extract(Buffer.from(bytes));
    return [doc.getBody(), doc.getFootnotes(), doc.getEndnotes(), doc.getHeaders(), doc.getFooters()]
      .filter(Boolean)
      .join('\n')
      .trim();
  } catch (e) {
    console.warn('[text-extract] fallo extrayendo texto de Word:', e instanceof Error ? e.message : e);
    return '';
  }
}
