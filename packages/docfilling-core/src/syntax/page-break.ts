// `{{PAGEBREAK}}` — el salto de página como directiva del lenguaje (D23).
//
// EL NOMBRE, Y POR QUÉ CAMBIÓ
// ---------------------------
// Nació el 2-oct-2026 como `{{SALTO_PAGINA}}` y Carles lo renombró a
// `{{PAGEBREAK}}` el 3-oct (D38). Es lo coherente: **todas** las palabras clave
// del lenguaje están en inglés —`DECLARE`, `INCLUDE`, `IF`, `FOR EACH`, `SET`,
// `AUTO`, `COUNT`, `HUMAN_ACTION`, `DEPENDENCY`, `COMMENT`, `WORD_STYLE`— y
// ésta era la única en castellano. El momento de arreglarlo es ahora: la biblioteca
// **no la usa ni una vez** (medido el 3-oct sobre los 1.615 párrafos y los 105
// esquemas de `_PROD`), así que el renombrado no migra nada.
//
// LA GRAFÍA VIEJA SE SIGUE ACEPTANDO, Y SE AVISA
// ----------------------------------------------
// No por compatibilidad con la biblioteca —que no la usa— sino por el manual: se
// publicó con `{{SALTO_PAGINA}}` y Doku y Javier lo tienen. Y porque la razón
// de existir de esta directiva es justamente que **una directiva que el motor
// no reconoce no falla: sale `[NO DISPONIBLE]` en medio de la escritura**.
// Dejar de reconocerla reintroduciría ese defecto exacto. Así que se reconoce,
// hace su trabajo, y el validador emite **`W905`** con su `fix`. Mismo criterio
// que `W903` con `{{END IF}}`.
//
// POR QUÉ ES UNA DIRECTIVA Y NO MARKDOWN
// --------------------------------------
// Markdown no tiene salto de página, y al autor no se le puede pedir que
// escriba OOXML. D23 lo resuelve haciéndolo directiva: el autor escribe
// `{{PAGEBREAK}}` y la fusión lo convierte en
// `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` (§8.3 del plan).
//
// QUÉ HACE EL MOTOR CON ELLA, Y QUÉ NO
// ------------------------------------
// El motor es texto→texto: su salida es markdown, no OOXML. Así que **no la
// traduce: la deja pasar intacta** hasta el markdown final, y es la fusión
// quien la reconoce y emite el salto. Con `{{WORD_STYLE:…}}`, son las dos
// únicas directivas que sobreviven a `compose`, y es deliberado — todas las
// demás o se sustituyen por un valor o se retiran.
//
// EL DEFECTO QUE ESTO ARREGLA (medido el 2-oct-2026)
// -------------------------------------------------
// Sin tipo propio, `classifyField` la clasificaba como `EXTRACTED` —un campo
// de datos cualquiera— con tres consecuencias, las tres silenciosas:
//
//   · `substituteFields` no encontraba valor y emitía **`[NO DISPONIBLE]`** en
//     medio de la escritura;
//   · el validador avisaba **W056** «campo usado sin DECLARE explícito»,
//     pidiendo declarar algo que no es un dato;
//   · `applyFieldSuffix` la **renombraba** a `{{PAGEBREAK_A}}` al incluir el
//     párrafo con `FIELDS:_A`, de modo que dentro de un INCLUDE con sufijo ni
//     siquiera se reconocería.

/** La grafía canónica, tal como la escribe el autor. */
export const PAGEBREAK = 'PAGEBREAK';

/** La grafía heredada del 2-oct. Se acepta y se avisa (`W905`). */
export const PAGEBREAK_HEREDADO = 'SALTO_PAGINA';

/** La directiva completa, para generarla desde código. */
export const PAGEBREAK_DIRECTIVA = `{{${PAGEBREAK}}}`;

/** Las dos grafías, con llaves, tolerando espacios y mayúsculas.
 *
 *  Está aquí y no en quien la use para que la fusión parta el párrafo por el
 *  **mismo** criterio con el que el motor la reconoce. Antes la fusión partía
 *  por la cadena literal `'{{SALTO_PAGINA}}'`, que no toleraba ni un espacio:
 *  `{{ SALTO_PAGINA }}` pasaba la clasificación del motor y la fusión no lo
 *  partía, así que la directiva **salía escrita en la escritura**. */
export const PAGEBREAK_PATTERN_G = new RegExp(
  `\\{\\{\\s*(?:${PAGEBREAK}|${PAGEBREAK_HEREDADO})\\s*\\}\\}`, 'gi',
);

/** ¿El cuerpo de un `{{...}}` es el salto de página, en cualquiera de sus dos
 *  grafías?
 *
 *  Recibe el interior de las llaves, ya sin ellas (`PAGEBREAK`), como lo pasan
 *  `classifyField`, `applyFieldSuffix` y `substituteFields`. Tolera espacios y
 *  mayúsculas porque el resto del lenguaje también lo hace. */
export function esPageBreak(cuerpo: string): boolean {
  const c = cuerpo.trim().toUpperCase();
  return c === PAGEBREAK || c === PAGEBREAK_HEREDADO;
}

/** ¿Está escrito con la grafía vieja? Es lo que dispara `W905`. */
export function esPageBreakHeredado(cuerpo: string): boolean {
  return cuerpo.trim().toUpperCase() === PAGEBREAK_HEREDADO;
}
