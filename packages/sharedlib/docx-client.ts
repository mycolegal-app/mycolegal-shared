// Cliente del servicio de .docx compartido de platform (`POST /internal/docx`).
//
// GEMELO de `pdf-client`: misma frontera, mismo contrato, misma clave. La app
// compone su HTML (plantilla + macros, que son SUYAS) y delega solo el
// "convertir a Word" en platform.
//
// POR QUÉ NO SE GENERA EN CADA APP
//
// Antes, el único "Word" del ecosistema se fabricaba sirviendo el HTML con la
// cabecera de Office y extensión `.doc`. Word lo abre, pero avisa de que el
// formato no casa con la extensión, pierde el tamaño y los márgenes de página, y
// no es OOXML — así que ninguna herramienta que parsee `.docx` lo acepta. Esto
// produce el paquete de verdad, y lo hace en UN sitio para toda la flota.
//
// Lo natural es llamar a este cliente con EL MISMO html que se le pasa a
// `renderPdfViaPlatform`: así el PDF y el Word son el mismo documento en dos
// envases y no pueden divergir.

export interface RenderDocxOptions {
  /** Orientación del documento. Default: 'portrait'. */
  orientation?: 'portrait' | 'landscape';
  /**
   * Márgenes en TWIPs (1 mm ≈ 56,69; 1 pulgada = 1440). Default: 25 mm arriba y
   * abajo, 20 mm a los lados. OJO: son TWIPs, no la cadena CSS que admite el PDF.
   */
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Título que queda en las propiedades del fichero. */
  title?: string;
}

export interface RenderDocxViaPlatformArgs {
  /** URL interna de platform (p.ej. `PLATFORM_INTERNAL_URL` de la app). */
  platformUrl: string;
  /** Clave de servicio (`APPS_REGISTER_SECRET`), va como `X-Service-Key`. */
  serviceKey: string;
  /**
   * HTML COMPLETO, ya con las macros sustituidas. Las imágenes deben ir como
   * `data:` URI: el servicio RECHAZA los `src` remotos (un 400), porque
   * descargarlos convertiría la conversión en una petición saliente a donde
   * diga el HTML.
   */
  html: string;
  opts?: RenderDocxOptions;
}

/** Media type del .docx; útil para la cabecera de la descarga en la app. */
export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Convierte `html` en un `.docx` (Uint8Array) llamando al servicio de platform.
 * Lanza si el servicio responde con error.
 */
export async function renderDocxViaPlatform(args: RenderDocxViaPlatformArgs): Promise<Uint8Array> {
  const base = args.platformUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/internal/docx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': args.serviceKey,
    },
    body: JSON.stringify({ html: args.html, opts: args.opts }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Servicio DOCX de platform devolvió ${res.status}: ${text.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
