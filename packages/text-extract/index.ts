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

/** MIME que no dice NADA del formato: hay que mirar los bytes. */
const MIME_GENERICO = /^(?:application|binary)\/octet-stream$/i;

/**
 * MIME real por número mágico, para cuando el declarado no sirve.
 *
 * Importa por dos motivos, los dos vistos en producción (oct-2026):
 * (1) el navegador manda a veces `application/octet-stream`, y Vertex RECHAZA
 *     ese valor de `mimeType` — el OCR devolvía 502 y subía como 500 al usuario;
 * (2) mejora el ENRUTADO: un PDF declarado octet-stream pasa por su capa de
 *     texto (gratis) en vez de irse directo al OCR.
 *
 * Devuelve `null` si no reconoce la firma (incluido el `PK` de los contenedores
 * ZIP —docx/xlsx—, que resuelven `esWord`/`esXlsx` por extensión).
 */
function sniffMime(bytes: Uint8Array): string | null {
  const empieza = (...sig: number[]) => sig.every((v, i) => bytes[i] === v);
  if (empieza(0x25, 0x50, 0x44, 0x46)) return 'application/pdf'; // %PDF
  if (empieza(0x89, 0x50, 0x4e, 0x47)) return 'image/png'; // \x89PNG
  if (empieza(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (empieza(0x47, 0x49, 0x46, 0x38)) return 'image/gif'; // GIF8
  if (empieza(0x49, 0x49, 0x2a, 0x00) || empieza(0x4d, 0x4d, 0x00, 0x2a)) return 'image/tiff';
  // RIFF????WEBP: los bytes 4-7 son el tamaño, se saltan.
  const enPos = (pos: number, ...sig: number[]) => sig.every((v, i) => bytes[pos + i] === v);
  if (empieza(0x52, 0x49, 0x46, 0x46) && enPos(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

/**
 * OCR que NO lanza. `/internal/ocr` de platform traduce CUALQUIER fallo del OCR
 * a un 502 genérico —incluido un 400 de Vertex por entrada inválida: PDF de cero
 * páginas, `mimeType` no soportado…— y `ocrViaPlatform` lo lanza. Si eso escapa
 * de aquí, rompe el contrato de `extraerTexto` ("nunca lanza") y el llamante
 * responde un 500 en vez del 422 legible que ya tiene previsto para "no se pudo
 * extraer texto". Pasó en producción con `/api/revisor` y
 * `/api/resoluciones/doc-context` (sep-2026).
 */
async function ocrTolerante(args: Parameters<typeof ocrViaPlatform>[0]): Promise<string | null> {
  try {
    const o = await ocrViaPlatform(args);
    const t = o?.texto?.trim();
    return t ? t : null;
  } catch (e) {
    console.warn('[text-extract] OCR descartado:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Extrae el texto de un documento eligiendo el procedimiento según su formato.
 * Nunca lanza por formato no soportado ni por un fallo del OCR: devuelve
 * `{ metodo: 'empty', texto: '' }` y el llamante decide qué contestar.
 */
export async function extraerTexto(bytes: Uint8Array, opts: ExtraerTextoOpts = {}): Promise<ExtraerTextoResult> {
  const fileName = opts.fileName ?? '';
  const ocr = opts.ocr;

  // MIME de confianza: el declarado solo si dice algo; si no, el de los bytes.
  // Puede quedar en `null` (→ se trata como PDF, el caso dominante).
  const declarado = opts.mime?.trim() || null;
  const mime = declarado && !MIME_GENERICO.test(declarado) ? declarado : sniffMime(bytes);

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
      const t = await ocrTolerante({ platformUrl: ocr.platformUrl, serviceKey: ocr.serviceKey, bytes, mimeType: mime ?? 'application/pdf' });
      if (t) return { texto: t, chars: noEspacios(t), metodo: 'ocr' };
    }
    return { texto: r.texto, chars: r.chars, metodo: r.texto ? 'pdf-text-layer' : 'empty' };
  }

  // 3) Imagen / otros formatos → OCR (si se provee config). Aquí `mime` siempre
  //    tiene valor (sin MIME se habría tratado como PDF arriba) y nunca es
  //    octet-stream: se manda tal cual, sin inventar un valor que Vertex rechace.
  if (ocr && mime) {
    const t = await ocrTolerante({ platformUrl: ocr.platformUrl, serviceKey: ocr.serviceKey, bytes, mimeType: mime });
    if (t) return { texto: t, chars: noEspacios(t), metodo: 'ocr' };
  }
  return { texto: '', chars: 0, metodo: 'empty' };
}
