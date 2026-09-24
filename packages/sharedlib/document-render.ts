// Capa de PLANTILLAS de documento, común a toda la flota.
//
// POR QUÉ ESTÁ AQUÍ
//
// Cada app tenía su `src/lib/printers/render-pdf.ts` con las mismas 25 líneas.
// Archivo y LegiFirma eran IDÉNTICOS byte por byte; Notaría, un subconjunto;
// Pólizas, una variante. Lo grave no era repetir código: era tener `escapeHtml`
// copiada CUATRO veces. Es la función que impide que el nombre de un cliente
// inyecte etiquetas en un documento notarial, y cuatro copias son cuatro sitios
// donde arreglarla el día que aparezca un caso raro, y tres que se olvidan.
//
// (Síntoma de la deriva que ya había: Notaría la exportaba y las otras dos la
// tenían privada. La misma función con tres visibilidades distintas.)
//
// Lo que NO sube aquí: los `DOC_CSS` y los catálogos de texto por defecto. Son
// de cada app —su tipografía, sus márgenes, su redacción— y compartirlos sería
// pasarse de rosca en el sentido contrario.

import { marked } from 'marked';

/** Formato en que la notaría edita el cuerpo de la plantilla. */
export type BodyFormat = 'HTML' | 'MARKDOWN';

/**
 * Escapa los caracteres con significado en HTML.
 *
 * Se aplica a los VALORES que se meten en una plantilla (nombres de clientes,
 * conceptos, direcciones): datos que escribe un usuario y que sin esto podrían
 * colar etiquetas en el documento.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapa los caracteres con significado en Markdown, incluidos los que abren
 * HTML embebido (`marked` lo deja pasar por defecto).
 *
 * Es el gemelo de `escapeHtml` para las plantillas que la notaría edita en
 * markdown: un nombre con `*` o `_` alteraría el formato, y uno con `<` podría
 * colar etiquetas igual que en el caso HTML.
 */
export function escapeMarkdown(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!<>&"']/g, (c) => `\\${c}`);
}

/**
 * Sustituye las macros `{{clave}}` de una plantilla por los valores de `data`.
 *
 * Las macros sin valor quedan en cadena vacía, y no con el literal `{{...}}`: un
 * campo que la notaría no ha configurado no debe aparecer como código en un
 * documento que se entrega a un cliente.
 *
 * El escape depende del formato de la plantilla, y por eso se pide: aplicar el
 * de HTML sobre markdown dejaría `&amp;` a la vista, y aplicar el de markdown
 * sobre HTML llenaría el documento de contrabarras.
 */
export function applyTemplateMacros(
  cuerpo: string,
  data: Record<string, string | number | null | undefined>,
  formato: BodyFormat = 'HTML',
): string {
  const escapar = formato === 'MARKDOWN' ? escapeMarkdown : escapeHtml;
  return cuerpo.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const value = data[key];
    if (value === null || value === undefined) return '';
    return escapar(String(value));
  });
}

/**
 * Cuerpo de plantilla (ya con macros sustituidas) → documento HTML completo,
 * listo para `renderPdfViaPlatform` o `renderDocxViaPlatform`.
 *
 * `formato` decide si el cuerpo hay que convertirlo desde markdown o ya es HTML.
 * El CSS lo pone cada app: es lo único que de verdad las distingue.
 */
export function componerDocumento(args: {
  cuerpo: string;
  formato?: BodyFormat;
  css: string;
  cssOverride?: string | null;
  lang?: string;
}): string {
  const { cuerpo, formato = 'HTML', css, cssOverride, lang = 'es' } = args;
  // `async: false` fuerza la firma síncrona de marked (según las extensiones
  // cargadas, por defecto podría devolver una promesa).
  const body =
    formato === 'MARKDOWN'
      ? (marked.parse(cuerpo, { async: false, gfm: true, breaks: false }) as string)
      : cuerpo;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<style>${css}${cssOverride ?? ''}</style>
</head>
<body>
${body}
</body>
</html>`;
}
