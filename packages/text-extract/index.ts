// @mycolegal-app/text-extract — extracción de texto de documentos (fuente única).
//
// Punto de entrada de alto nivel: `extraerTexto(bytes, opts)` despacha por
// formato y devuelve el texto plano + el método usado:
//   · Word (.doc/.docx) → word-extractor (texto embebido; sin coste IA)
//   · PDF               → capa de texto (unpdf); si es escaneo y hay `ocr` → OCR
//   · imagen / otros     → OCR (si se provee config)
//
// También reexporta las piezas de bajo nivel por si una app quiere una sola:
//   extractText / extractPdfText (PDF), extractWordText (Word), ocrViaPlatform.
export * from './pdf';
export * from './ocr-client';
export { extractWordText, esWord } from './word';
export { extractXlsxText, esXlsx } from './xlsx';

import { extractText as extractPdfLayer } from './pdf';
import { extractWordText, esWord } from './word';
import { extractXlsxText, esXlsx } from './xlsx';
import { ocrViaPlatform } from './ocr-client';

/** Config para el fallback OCR (PDF escaneado / imágenes). Los mismos valores
 *  que la app usa para otros inter de platform. Omitir = sin fallback OCR. */
export interface OcrConfig {
  platformUrl: string;
  serviceKey: string;
}

export type ExtraerMetodo = 'word' | 'xlsx' | 'pdf-text-layer' | 'ocr' | 'empty';

export interface ExtraerTextoResult {
  texto: string;
  chars: number; // caracteres no-espacio
  metodo: ExtraerMetodo;
}

export interface ExtraerTextoOpts {
  /** MIME del documento (del navegador / almacenamiento). */
  mime?: string | null;
  /** Nombre de fichero (para decidir por extensión si el MIME es ambiguo). */
  fileName?: string | null;
  /** Config OCR para escaneos/imágenes. Sin ella no hay fallback OCR. */
  ocr?: OcrConfig;
}

const noEspacios = (s: string) => s.replace(/\s/g, '').length;

/**
 * Extrae el texto de un documento eligiendo el procedimiento según su formato.
 * Nunca lanza por formato no soportado: devuelve `{ metodo: 'empty', texto: '' }`.
 */
export async function extraerTexto(bytes: Uint8Array, opts: ExtraerTextoOpts = {}): Promise<ExtraerTextoResult> {
  const mime = opts.mime ?? null;
  const fileName = opts.fileName ?? '';
  const ocr = opts.ocr;

  // 0) XLSX → texto etiquetado por columna (sin OCR).
  if (esXlsx(mime, fileName)) {
    const texto = await extractXlsxText(bytes);
    return { texto, chars: noEspacios(texto), metodo: texto ? 'xlsx' : 'empty' };
  }

  // 1) Word → texto embebido (sin OCR).
  if (esWord(mime, fileName)) {
    const texto = await extractWordText(bytes);
    return { texto, chars: noEspacios(texto), metodo: texto ? 'word' : 'empty' };
  }

  // 2) PDF → capa de texto; si es escaneo (needsOcr) y hay config OCR, se OCR-iza.
  const esPdf = !mime || /pdf/i.test(mime) || /\.pdf$/i.test(fileName);
  if (esPdf) {
    const r = await extractPdfLayer(bytes, mime);
    if (!r.needsOcr) return { texto: r.texto, chars: r.chars, metodo: 'pdf-text-layer' };
    if (ocr) {
      const o = await ocrViaPlatform({ platformUrl: ocr.platformUrl, serviceKey: ocr.serviceKey, bytes, mimeType: mime ?? 'application/pdf' });
      const t = o?.texto?.trim();
      if (t) return { texto: t, chars: noEspacios(t), metodo: 'ocr' };
    }
    return { texto: r.texto, chars: r.chars, metodo: r.texto ? 'pdf-text-layer' : 'empty' };
  }

  // 3) Imagen / otros formatos → OCR (si se provee config).
  if (ocr) {
    const o = await ocrViaPlatform({ platformUrl: ocr.platformUrl, serviceKey: ocr.serviceKey, bytes, mimeType: mime ?? 'application/octet-stream' });
    const t = o?.texto?.trim();
    if (t) return { texto: t, chars: noEspacios(t), metodo: 'ocr' };
  }
  return { texto: '', chars: 0, metodo: 'empty' };
}
