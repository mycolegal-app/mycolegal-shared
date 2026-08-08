// Cliente del servicio de OCR compartido de platform (`POST /internal/ocr`).
//
// Espejo de `pdf-client.ts`: la app/servidor delega en platform el "leer texto de
// un escaneo" (PDF sin capa de texto o imagen) vía visión de Gemini, igual que
// delega el "pintar a PDF". Así ninguna app embebe el acceso a Vertex.
//
// Uso (server-side): pasar `PLATFORM_INTERNAL_URL` + `APPS_REGISTER_SECRET` (los
// mismos que ya usa la app para otros inter de platform) y los bytes del documento.

export interface OcrViaPlatformArgs {
  /** URL interna de platform (p.ej. `PLATFORM_INTERNAL_URL`/`PLATFORM_SERVICE_URL`). */
  platformUrl: string;
  /** Clave de servicio (`APPS_REGISTER_SECRET`), va como `X-Service-Key`. */
  serviceKey: string;
  /** Bytes del documento (Uint8Array; un Buffer también lo es). */
  bytes: Uint8Array;
  /** MIME, p.ej. 'application/pdf' o 'image/jpeg'. Default 'application/pdf'. */
  mimeType?: string;
}

/**
 * Transcribe un documento escaneado a texto llamando al servicio de platform.
 * Devuelve `null` si platform no tiene OCR configurado (503, degradación suave)
 * o si no hay `platformUrl`/`serviceKey`. Lanza ante otros errores del servicio.
 */
export async function ocrViaPlatform(args: OcrViaPlatformArgs): Promise<{ texto: string; chars: number } | null> {
  if (!args.platformUrl || !args.serviceKey) return null;
  const base = args.platformUrl.replace(/\/+$/, '');
  const base64 = Buffer.from(args.bytes).toString('base64');
  const res = await fetch(`${base}/internal/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': args.serviceKey },
    body: JSON.stringify({ base64, mimeType: args.mimeType ?? 'application/pdf' }),
  });
  if (res.status === 503) return null; // OCR no configurado en ese entorno → degrada
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Servicio OCR de platform devolvió ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { texto?: string; chars?: number };
  return { texto: data.texto ?? '', chars: data.chars ?? (data.texto ?? '').length };
}
