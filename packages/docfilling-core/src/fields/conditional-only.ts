// Campos que sólo gobiernan un IF (o son DECLARE auxiliares) y nunca se pintan.
//
// Port de `identify_conditional_only_fields` de `filler.py`. Importa porque es
// **el mismo criterio que usa el procesado para decidir si una tarea está
// completa**: un campo conditional-only que falte NO deja la tarea `incomplete`.
// Si este cálculo se desvía, la frontera pedirá datos que no hacen falta (o
// dejará de pedir los que sí).

/** `{{IF …}}`, `{{IF_X}}`, `{{ELSE}}`, `{{ELSE_X}}`, `{{ENDIF}}`, `{{ENDIF_X}}`, `{{END IF}}`,
 *  `{{END_IF}}`: la palabra va AL PRINCIPIO del cuerpo. */
import { extractIfFieldRefs } from '../syntax/validator';

const ES_CONDICIONAL = /^(?:IF|ELSE|ENDIF|END[\s_]+IF)(?:[\s_]|$)/i;

/** Quita el sufijo `:HELP(fichero)` del cuerpo de un campo. */
function quitarHelp(cuerpo: string): string {
  return cuerpo.replace(/:HELP\([^)]*\)/gi, '');
}

export interface ContextoCampos {
  /** Campos de sistema (DIA, MES, AÑO, ANO…): los resuelve el motor. */
  camposDeSistema: Set<string>;
  /** Campos predefinidos por la organización. En el SaaS vienen de la tabla
   *  `Settings`; aquí los aporta el `SettingsProvider` de la app. */
  camposPredefinidos: Set<string>;
}

export function camposSoloCondicionales(
  plantilla: string,
  ctx: ContextoCampos,
): Set<string> {
  const { camposDeSistema, camposPredefinidos } = ctx;
  const esConocido = (n: string) => camposDeSistema.has(n) || camposPredefinidos.has(n);

  // 1) Los que se PINTAN: cualquier {{...}} que no sea directiva.
  const pintados = new Set<string>();
  for (const m of plantilla.matchAll(/\{\{([^}]+)\}\}/g)) {
    const cuerpo = quitarHelp(m[1]);
    if (
      // ⚠️ La palabra condicional tiene que ABRIR la directiva. Antes era
      // `includes`, y `NIF_` contiene `IF_`: `{{PJ_NIF_VEND}}` se tomaba por un
      // condicional, no contaba como pintado y el campo —que sí se imprime— se
      // marcaba «sólo condicional»: salía en blanco y nunca se preguntaba. 264
      // apariciones en la biblioteca (6-oct-2026, F5.22). Lo mismo con una
      // instrucción que mencione «el NIF del…» (`NIF ` contiene `IF `).
      ES_CONDICIONAL.test(cuerpo.trim())
    ) continue;
    if (cuerpo.startsWith('@autonumber:')) continue;
    if (cuerpo.startsWith('DECLARE ')) continue;
    if (cuerpo.toUpperCase().startsWith('MAP_IUI:')) continue;
    if (cuerpo.toUpperCase().startsWith('DEPENDENCY:')) continue;

    const nombre = cuerpo.split('==')[0].split('!=')[0].split(':')[0].trim();
    if (!esConocido(nombre)) pintados.add(nombre);
  }

  // 2) Los que aparecen en condicionales.
  // Con la lectura del validador (`extractIfFieldRefs`): `{{IF A AND B == "x"}}` son dos
  // variables, A y B. La de antes partía por `==` y se quedaba con «A AND B» como un solo
  // nombre, que no existe: A y B no contaban como condición (F2.5 del plan
  // REQ_CATALOGO_IUI; medido sobre `_PROD` el 9-oct-2026).
  const condicionales = new Set<string>();
  for (const m of plantilla.matchAll(/\{\{(IF[_\s][^}]+)\}\}/g)) {
    for (const ref of extractIfFieldRefs(m[1])) {
      // `SYSTEM:X` lo resuelve el motor; `COUNT` es la función de `IF COUNT(LISTA) > 1`.
      if (/^SYSTEM:/i.test(ref) || ref.toUpperCase() === 'COUNT') continue;
      if (!esConocido(ref)) condicionales.add(ref);
    }
  }

  // 3) Los DECLARE: auxiliares por definición, siempre conditional-only.
  const declarados = new Set<string>();
  const reDeclare = /\{\{DECLARE\s+([\p{L}\p{N}_]+)(?:\s+AS\s+[\p{L}\p{N}_]+)?(?:\s*[=:][^}]*)?\}\}/giu;
  for (const m of plantilla.matchAll(reDeclare)) {
    declarados.add(m[1]);
    condicionales.add(m[1]);
  }

  const salida = new Set<string>();
  for (const n of condicionales) if (!pintados.has(n)) salida.add(n);
  // ⚠️ UN `DECLARE` QUE ADEMÁS SE PINTA **NO** ES AUXILIAR, y esto es una
  // divergencia deliberada con `filler.py` (que añadía todos los declarados sin
  // mirar si se pintaban).
  //
  // El criterio del Python dejaba fuera de «lo que se pregunta» a cualquier
  // campo declarado, incluidos los que el documento IMPRIME. Resultado medido en
  // la biblioteca real el 5-oct-2026: **809 campos declarados y pintados a la
  // vez** —2.381 declarados, 975 pintados— que salían en blanco en la escritura
  // y que nadie podía rellenar porque la pantalla no los ofrecía.
  //
  // El caso que lo destapó: `0505_ESQUEMA_MAESTRO_CUMPLIMIENTO_PERMUTA` figura
  // COMPLETO y su antecedente de cesión sale «Que mediante escritura autorizada
  // por el Notario de , Don/Doña , el día , bajo el número ,…», con la finca, el
  // CRU y el catastro vacíos.
  //
  // Con esta línea el invariante queda cierto: **lo que el documento imprime se
  // pregunta**. Y lo que sólo gobierna un `{{IF}}` sigue siendo auxiliar, que es
  // para lo que `DECLARE` existe.
  for (const n of declarados) if (!pintados.has(n)) salida.add(n);
  return salida;
}
