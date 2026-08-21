/**
 * Extracción de la CAPA DE TEXTO de un PDF (sin OCR). Si el PDF es un escaneo
 * sin capa de texto, `needsOcr=true` → el caller decide caer a OCR (ver el
 * `extraerTexto` del index, que orquesta capa-de-texto → OCR).
 *
 * Usa `unpdf` (pdfjs empaquetado, JS puro, apto serverless/Cloud Run — sin deps
 * nativas ni el landmine de import de `pdf-parse`).
 *
 * (Movido desde @mycolegal-app/sharedlib/text-extract al consolidar toda la
 * extracción de texto en @mycolegal-app/text-extract.)
 */

export type ExtractMethod = 'text-layer' | 'ocr-documentai' | 'empty';

export interface ExtractResult {
  texto: string;
  chars: number; // nº de caracteres NO-espacio (heurística de "tiene texto")
  metodo: ExtractMethod;
  needsOcr: boolean;
}

const MIN_CHARS = 40; // por debajo → se considera escaneo sin capa de texto

/** Extrae el texto de un PDF (capa de texto). No hace OCR. */
export async function extractPdfText(buffer: Uint8Array): Promise<ExtractResult> {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const texto = (typeof text === 'string' ? text : (text as string[]).join('\n')).trim();
  const chars = texto.replace(/\s/g, '').length;
  const needsOcr = chars < MIN_CHARS;
  return { texto, chars, metodo: needsOcr ? 'empty' : 'text-layer', needsOcr };
}

/**
 * Extrae la capa de texto según el mime. Hoy solo PDF; otros formatos →
 * needsOcr / vacío. El orquestador (`extraerTexto`) enruta Word y OCR.
 */
export async function extractText(buffer: Uint8Array, mime?: string | null): Promise<ExtractResult> {
  if (!mime || mime.includes('pdf')) {
    try {
      return await extractPdfText(buffer);
    } catch {
      return { texto: '', chars: 0, metodo: 'empty', needsOcr: true };
    }
  }
  return { texto: '', chars: 0, metodo: 'empty', needsOcr: true };
}
