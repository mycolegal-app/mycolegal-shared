// `{{SCHEMA:LANG=xx}}` (antes `{{LANG=xx}}`) — el idioma en que está redactada la plantilla.
//
// Port de `extract_template_lang` de `composer.py` (residuo de F1.3).
//
// No es una preferencia de interfaz: es un dato de la PLANTILLA, y lo consume
// el formateador de fechas del motor —`{{FECHA}}`, `{{DIA_LETRAS}}`, `{{MES}}`
// salen en el idioma del documento, no en el del oficial que lo rellena. Una
// escritura en catalán con el oficial en castellano tiene que decir «de març»,
// no «de marzo».
//
// Desde el 12-nov-2026 la forma es `{{SCHEMA:LANG=xx}}` (`schema-meta.ts`); la antigua sigue valiendo.

/** El idioma por defecto cuando la plantilla no lo declara. */
export const IDIOMA_POR_DEFECTO = 'es';

const LANG = /\{\{\s*(?:SCHEMA\s*:\s*)?LANG\s*=\s*([A-Za-z][A-Za-z0-9_-]*)\s*\}\}/i;

/** Las dos formas de declarar el idioma, para quien tenga que reescribirlo (la traducción). */
export const DECLARACION_DE_IDIOMA = /\{\{\s*(SCHEMA\s*:\s*)?LANG\s*=\s*[A-Za-z][A-Za-z0-9_-]*\s*\}\}/gi;

/**
 * Devuelve el código de idioma de la primera declaración (`{{SCHEMA:LANG=xx}}` o
 * `{{LANG=xx}}`), en minúsculas.
 *
 * Si no hay directiva, o está mal escrita, devuelve `porDefecto`. Se queda con
 * la PRIMERA: una plantilla con dos declaraciones es un error de contenido, y
 * elegir la primera es lo que hace el Python.
 */
export function idiomaDePlantilla(texto: string, porDefecto = IDIOMA_POR_DEFECTO): string {
  const m = texto.match(LANG);
  return m ? m[1].trim().toLowerCase() : porDefecto;
}

/** El texto con su idioma declarado cambiado a `idioma`, en la forma en que esté escrito (al traducir). */
export function cambiarIdiomaDePlantilla(texto: string, idioma: string): string {
  return texto.replace(DECLARACION_DE_IDIOMA, (_t, nuevo?: string) => (nuevo ? `{{SCHEMA:LANG=${idioma}}}` : `{{LANG=${idioma}}}`));
}
