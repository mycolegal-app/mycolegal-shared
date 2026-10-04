// `{{LANG=xx}}` — el idioma en que está redactada la plantilla.
//
// Port de `extract_template_lang` de `composer.py` (residuo de F1.3).
//
// No es una preferencia de interfaz: es un dato de la PLANTILLA, y lo consume
// el formateador de fechas del motor —`{{FECHA}}`, `{{DIA_LETRAS}}`, `{{MES}}`
// salen en el idioma del documento, no en el del oficial que lo rellena. Una
// escritura en catalán con el oficial en castellano tiene que decir «de març»,
// no «de marzo».

/** El idioma por defecto cuando la plantilla no lo declara. */
export const IDIOMA_POR_DEFECTO = 'es';

const LANG = /\{\{\s*LANG\s*=\s*([A-Za-z][A-Za-z0-9_-]*)\s*\}\}/;

/**
 * Devuelve el código de idioma del primer `{{LANG=xx}}`, en minúsculas.
 *
 * Si no hay directiva, o está mal escrita, devuelve `porDefecto`. Se queda con
 * la PRIMERA: una plantilla con dos declaraciones es un error de contenido, y
 * elegir la primera es lo que hace el Python.
 */
export function idiomaDePlantilla(texto: string, porDefecto = IDIOMA_POR_DEFECTO): string {
  const m = texto.match(LANG);
  return m ? m[1].trim().toLowerCase() : porDefecto;
}
