// «Descargar PDF» del manual de una app (#29 de Peticiones; lo usan también LegiFirma y
// Pólizas, plan de lanzamiento 5.7). Extraído de mycolegal-peticiones/src/lib/manual-pdf.ts
// el 28-nov-2026 para no copiarlo en cada app.
//
// La vista de impresión (`ManualPrintView` del paquete ui, con `pdfEndpoint`)
// manda a `POST /api/manual/pdf` el HTML del manual YA paginado y autocontenido:
// CSS, fuentes e imágenes incrustadas como `data:`. Ese HTML lo ha construido el
// NAVEGADOR del usuario, así que aquí se trata como entrada no fiable antes de
// dárselo al Chromium de platform:
//
//  1. Aquí se rechaza cualquier referencia a la red o al disco (`http(s):`,
//     `file:`, `//host`) en atributos que cargan recursos, en `url(...)` y en
//     `@import`. Un manual bien construido no lleva ninguna: si aparece, no es
//     el manual.
//  2. platform pinta con `blockNetwork: true`: su Chromium aborta toda petición
//     que no sea `data:`/`about:blank`. Es la defensa de verdad contra SSRF; lo
//     de (1) es la primera línea y da un error claro.
//
// Solo server-side.

/** Tope del cuerpo (JSON `{ html, fileName }`). platform admite 12 MiB en
 *  `/internal/pdf`; se deja margen para el sobre del JSON que se le reenvía. */
export const MANUAL_PDF_MAX_BYTES = 12 * 1024 * 1024 - 64 * 1024;

/** Esquemas que salen del proceso. `//host` (relativo al protocolo) también. */
const EXTERNA_RE = /^(?:https?:|file:|ftp:|wss?:|\/\/|\\\\)/i;

/** Decodifica lo justo para que `&#104;ttp:` o `http&colon;` no esquiven el filtro. */
function decodificarEntidades(v: string): string {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&bsol;/gi, '\\')
    .replace(/&newline;|&tab;/gi, '')
    .replace(/&amp;/gi, '&');
}

/** ¿Este valor apunta fuera (red o disco)? Ignora blancos y controles, como el navegador. */
export function esReferenciaExterna(valor: string): boolean {
  // eslint-disable-next-line no-control-regex
  const limpio = decodificarEntidades(valor).replace(/[\u0000- \u007f]+/g, '');
  return EXTERNA_RE.test(limpio);
}

/** Atributos que hacen que el navegador CARGUE algo. `href` cuenta salvo en `<a>`
 *  (un enlace del manual a una web no se descarga al pintar el PDF). */
const ATRIBUTOS_DE_CARGA = new Set([
  'src', 'srcset', 'href', 'xlink:href', 'data', 'poster', 'background', 'action', 'formaction', 'codebase', 'manifest',
]);

const TAG_RE = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([^\s"'=<>/]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))/gi;
// Cadenas sueltas del CSS: `@import "…"` e `image-set("…" 1x)` cargan sin `url()`.
const CSS_CADENA_RE = /"([^"]*)"|'([^']*)'/g;
const STYLE_RE = /<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi;

export type MotivoRechazo = { motivo: string };

/**
 * Primera referencia externa del HTML, o `null` si es autocontenido. Mira
 * atributos de carga (incluido `srcset`, que es una lista), `<meta http-equiv=
 * refresh>`, los `url(...)` (en `<style>` y en `style=`) y los `@import`.
 */
export function primeraReferenciaExterna(html: string): MotivoRechazo | null {
  for (const m of html.matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase();
    const resto = m[2] ?? '';
    const attrs = new Map<string, string>();
    for (const a of resto.matchAll(ATTR_RE)) {
      attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? '');
    }
    for (const [nombre, valor] of attrs) {
      if (nombre === 'style') {
        const r = primeraUrlCssExterna(decodificarEntidades(valor), true);
        if (r) return { motivo: `style en <${tag}>: ${r}` };
        continue;
      }
      if (!ATRIBUTOS_DE_CARGA.has(nombre)) continue;
      if (nombre === 'href' && tag === 'a') continue;
      const candidatos = nombre === 'srcset' ? valor.split(',').map((s) => s.trim().split(/\s+/)[0] ?? '') : [valor];
      if (candidatos.some(esReferenciaExterna)) return { motivo: `${nombre} en <${tag}>` };
    }
    if (tag === 'meta' && (attrs.get('http-equiv') ?? '').toLowerCase() === 'refresh') {
      return { motivo: '<meta http-equiv="refresh">' };
    }
  }
  // `url(...)` en cualquier parte del documento; cadenas sueltas, solo dentro de <style>.
  const url = primeraUrlCssExterna(html, false);
  if (url) return { motivo: url };
  for (const m of html.matchAll(STYLE_RE)) {
    const r = primeraUrlCssExterna(m[1] ?? '', true);
    if (r) return { motivo: `<style>: ${r}` };
  }
  return null;
}

function primeraUrlCssExterna(texto: string, cadenas: boolean): string | null {
  for (const m of texto.matchAll(CSS_URL_RE)) {
    if (esReferenciaExterna(m[1] ?? m[2] ?? m[3] ?? '')) return 'url(...) externa';
  }
  if (cadenas) {
    for (const m of texto.matchAll(CSS_CADENA_RE)) {
      if (esReferenciaExterna(m[1] ?? m[2] ?? '')) return 'cadena externa en CSS (@import / image-set)';
    }
  }
  return null;
}

/**
 * Nombre del fichero para `Content-Disposition`: sin rutas ni caracteres de
 * control/cabecera, con `.pdf`, y en dos formas —ASCII para `filename` y UTF-8
 * (RFC 5987) para `filename*`—, que es lo que entienden todos los navegadores.
 */
export function nombreFicheroPdf(bruto: unknown): { ascii: string; utf8: string } {
  let base = typeof bruto === 'string' ? bruto : '';
  base = base
    .replace(/\.pdf$/i, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|;]+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/^\.+/, '')
    .trim();
  if (!base) base = 'Manual';
  const ascii = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_');
  return { ascii: `${ascii}.pdf`, utf8: `${base}.pdf` };
}

export function contentDisposition(bruto: unknown): string {
  const { ascii, utf8 } = nombreFicheroPdf(bruto);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}

/**
 * Lee el cuerpo con tope: corta en cuanto se pasa (no lo acumula entero para
 * luego medirlo). `null` = excede el tope.
 */
export async function leerCuerpoConTope(req: Request, max: number): Promise<string | null> {
  const declarado = Number(req.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos).toString('utf8');
}

export interface PlatformPdf {
  /** URL interna de platform (`PLATFORM_INTERNAL_URL` de la app). */
  platformUrl: string;
  /** Clave de servicio (`APPS_REGISTER_SECRET`). */
  serviceKey: string;
}

/**
 * Pinta el HTML en platform (`POST /internal/pdf`) con la red del Chromium
 * BLOQUEADA. Se llama a mano y no con `renderPdfViaPlatform` porque su tipo de
 * opciones aún no conoce `blockNetwork`.
 */
export async function renderManualPdf(html: string, p: PlatformPdf): Promise<Uint8Array> {
  const base = p.platformUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/internal/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': p.serviceKey },
    body: JSON.stringify({ html, opts: { format: 'a4', blockNetwork: true } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Servicio PDF de platform devolvió ${res.status}: ${text.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function errorJson(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * El handler entero de `POST /api/manual/pdf` (`{ html, fileName }` → PDF). La app pone
 * la comprobación de sesión (el manual no lleva datos de ninguna notaría: la sesión está
 * para que esto no sea un conversor HTML→PDF abierto a internet) y su platform:
 *
 *   export const POST = manualPdfPost({ platformUrl: PLATFORM_INTERNAL_URL,
 *     serviceKey: APPS_REGISTER_SECRET, verificarSesion: async () => { await getAuthContext(); } });
 */
export function manualPdfPost(
  opts: PlatformPdf & { verificarSesion: () => Promise<unknown> },
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      await opts.verificarSesion();
    } catch {
      return errorJson('UNAUTHORIZED', 'Sesión requerida', 401);
    }
    const texto = await leerCuerpoConTope(req, MANUAL_PDF_MAX_BYTES);
    if (texto === null) {
      return errorJson('PAYLOAD_TOO_LARGE', 'El manual es demasiado grande para generar el PDF', 413);
    }
    let body: { html?: unknown; fileName?: unknown } | null = null;
    try {
      body = JSON.parse(texto) as { html?: unknown; fileName?: unknown };
    } catch {
      return errorJson('VALIDATION_ERROR', 'Cuerpo no válido', 422);
    }
    const html = typeof body?.html === 'string' ? body.html : '';
    if (!html.trim()) return errorJson('VALIDATION_ERROR', 'Falta el contenido del manual', 422);

    const externa = primeraReferenciaExterna(html);
    if (externa) {
      console.warn(`[manual/pdf] HTML rechazado: referencia externa (${externa.motivo})`);
      return errorJson('VALIDATION_ERROR', 'El contenido del manual no es válido para generar el PDF', 422);
    }

    let pdf: Uint8Array;
    try {
      pdf = await renderManualPdf(html, opts);
    } catch (err) {
      console.error('[manual/pdf] fallo al generar el PDF en platform', err);
      return errorJson('UPSTREAM_ERROR', 'No se ha podido generar el PDF. Inténtelo de nuevo.', 502);
    }

    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(body?.fileName),
        'Content-Length': String(pdf.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
}
