// Comprobaciones del validador que el generador NO emite.
//
// POR QUÉ ESTE FICHERO EXISTE
//
// `src/syntax/validator.ts` se genera desde `docfilling_syntax/validator.py` con
// `gen-ts.py`, pero el generador no cubre todas sus comprobaciones: el Python
// conoce 51 códigos de diagnóstico y el TS generado 37. Verificado el 2-oct-2026
// contra los 1.727 markdown de producción: de ahí salían 72 de las 77
// divergencias, y `gen-ts.py --check` daba verde — el guardia comprueba que lo
// generado coincida con lo que el generador produciría, NO que el generador
// cubra todo lo que hace el Python.
//
// Estas tres funciones son el port fiel de las que faltaban. Van APARTE y no
// dentro de `validator.ts` precisamente para que una regeneración no se las
// lleve por delante. El punto de entrada público es `validate.ts`.
//
// Lo que NO está aquí, a propósito, porque no es de un solo fichero y
// `validateText(texto)` no puede decidirlo: `E000`/`W000` (lectura de fichero),
// `E030` (INCLUDE que no resuelve) y `E031` (ciclos) necesitan la biblioteca; y
// `W050`/`W051` (mismo campo con tipos u opciones distintas) son cross-file —
// comparan ocurrencias del MISMO nombre en VARIOS ficheros.

// RANGO DE CÓDIGOS PROPIO: `W9xx` / `E9xx`.
//
// Desde el 2-oct-2026 este paquete evoluciona libre del motor Python (D25 del
// plan), así que puede añadir comprobaciones que allí no existen. Para que
// nunca choquen con su numeración —que usa W0xx–W1xx y E0xx–E1xx— las nuestras
// viven en el rango 900+. El Python no tiene ningún W9xx/E9xx (comprobado).

import { FieldType, type ParsedField } from './parser';
import { Severity, type Diagnostic } from './validator';

// Los tipos y sus sinónimos viven en `declare-types.ts`.
import { tipoAceptado, TIPOS_CANONICOS } from './declare-types';
import { esPageBreakHeredado, PAGEBREAK_DIRECTIVA } from './page-break';

/** @deprecated Usa `TIPOS_CANONICOS` de `declare-types.ts`. */
export const DECLARE_TYPES = TIPOS_CANONICOS;

function diag(
  line: number,
  col: number,
  length: number,
  severity: Severity,
  code: string,
  message: string,
): Diagnostic {
  return { line, col, endLine: line, endCol: col + length, severity, code, message };
}

/**
 * `{{SET NOMBRE=valor}}`.
 *
 * - **E110** SET malformado (sin `=`, sin nombre…).
 * - **W110** SET sobre un campo de sistema: el composer sólo honra la asignación
 *   dentro del ámbito de su propia plantilla; fuera, los valores auto-calculados
 *   (DIA/MES/FECHA…) se reinyectan y ganan.
 */
export function checkSetDirectives(
  fields: ParsedField[],
  clavesDeSistema: Set<string>,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fields) {
    if (f.fieldType !== FieldType.SET) continue;
    const contenido = f.content.trim();
    if (!/^SET\s+\w+\s*=/i.test(contenido)) {
      out.push(
        diag(f.line, f.col, f.raw.length, Severity.ERROR, 'E110',
          'SET malformado — sintaxis: {{SET NOMBRE=valor}} o {{SET NOMBRE="valor con espacios"}}'),
      );
      continue;
    }
    if (f.name && clavesDeSistema.has(f.name.toUpperCase())) {
      out.push(
        diag(f.line, f.col, f.raw.length, Severity.WARNING, 'W110',
          `SET sobre campo de sistema '${f.name}' — los valores auto-computados (DIA/MES/FECHA/...) se reinyectan al componer`),
      );
    }
  }
  return out;
}

/**
 * Equilibrio `FOR EACH` / `ENDFOR`, con pila para soportar anidamiento.
 *
 * - **E060** FOR EACH sin ENDFOR · **E061** ENDFOR sin FOR EACH
 * - **W082** forma de cierre no canónica (`{{END FOR}}`, `{{END_FOR}}`): el
 *   parser normaliza `name` a `ENDFOR`, así que se mira el contenido crudo.
 */
export function checkForEachBalance(fields: ParsedField[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const pila: ParsedField[] = [];
  for (const f of fields) {
    if (f.fieldType === FieldType.FOR_EACH) {
      pila.push(f);
    } else if (f.fieldType === FieldType.END_FOR) {
      if (f.content.toUpperCase().trim() !== 'ENDFOR') {
        const d = diag(f.line, f.col, f.raw.length, Severity.WARNING, 'W082',
          'Forma no canónica de cierre de bucle — prefiera {{ENDFOR}}');
        d.fix = { title: 'Migrar a {{ENDFOR}}', replacement: '{{ENDFOR}}' };
        out.push(d);
      }
      if (pila.length) pila.pop();
      else {
        out.push(diag(f.line, f.col, f.raw.length, Severity.ERROR, 'E061',
          'ENDFOR sin FOR EACH correspondiente'));
      }
    }
  }
  for (const f of pila) {
    out.push(diag(f.line, f.col, f.raw.length, Severity.ERROR, 'E060',
      `FOR EACH IN ${f.forFieldName} sin ENDFOR correspondiente`));
  }
  return out;
}

/**
 * Sintaxis de `DECLARE ARRAY` y referencias de `FOR EACH`.
 *
 * - **E070** tipo principal inválido · **E071** subcampo con tipo inválido
 * - **W070** DECLARE ARRAY sin instrucción de extracción, valor fijo ni subcampos
 * - **W071** FOR EACH que apunta a algo que no está declarado como DECLARE ARRAY
 *
 * (El Python calcula aquí un conjunto `plain_declares` que no usa; no se porta.)
 */
export function checkDeclareArraySyntax(fields: ParsedField[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const arraysDeclarados = new Set<string>();

  for (const f of fields) {
    if (f.fieldType !== FieldType.DECLARE_ARRAY) continue;
    arraysDeclarados.add(f.name.toUpperCase());

    if (f.declareType && !tipoAceptado(f.declareType)) {
      out.push(diag(f.line, f.col, f.raw.length, Severity.ERROR, 'E070',
        `DECLARE ARRAY ${f.name}: tipo '${f.declareType}' inválido. Válidos: ${[...TIPOS_CANONICOS].sort().join(', ')}`));
    }
    for (const sf of f.arraySubfields) {
      if (sf.type && !tipoAceptado(sf.type)) {
        out.push(diag(f.line, f.col, f.raw.length, Severity.ERROR, 'E071',
          `DECLARE ARRAY ${f.name}: subcampo '${sf.name}' tiene tipo inválido '${sf.type}'`));
      }
    }
    const tieneInstruccion = f.content.includes(':[');
    const tieneValorFijo = Boolean(f.declareValue);
    const tieneSubcampos = f.arraySubfields.length > 0;
    if (!tieneInstruccion && !tieneValorFijo && !tieneSubcampos) {
      out.push(diag(f.line, f.col, f.raw.length, Severity.WARNING, 'W070',
        `DECLARE ARRAY ${f.name} sin instrucción de extracción ni valor fijo`));
    }
  }

  for (const f of fields) {
    if (f.fieldType === FieldType.FOR_EACH && f.forFieldName) {
      if (!arraysDeclarados.has(f.forFieldName.toUpperCase())) {
        out.push(diag(f.line, f.col, f.raw.length, Severity.WARNING, 'W071',
          `FOR EACH IN ${f.forFieldName}: '${f.forFieldName}' no está declarado como DECLARE ARRAY`));
      }
    }
  }
  return out;
}

/**
 * **W900** — un `DECLARE` que lleva a la vez `:INPUT(...)` y `:OPTIONS(...)`.
 *
 * El parser de referencia, con las dos cosas en el mismo DECLARE, **pierde en
 * silencio la lista de opciones Y el valor por defecto** (comprobado en los dos
 * motores el 2-oct-2026; afecta a 4 declaraciones en 2 ficheros de la biblioteca, y
 * su `W053` —«:OPTIONS está vacío»— es el síntoma, no la causa).
 *
 * No hace falta escribirlo dos veces: `:INPUT(pregunta|a,b,c)` ya dice
 * «pregúntalo a una persona y que elija de esta lista». Ésa es la forma buena.
 */
export function checkInputConOptions(fields: ParsedField[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fields) {
    if (f.fieldType !== FieldType.DECLARE && f.fieldType !== FieldType.DECLARE_ARRAY) continue;
    const c = f.content.toUpperCase();
    if (!c.includes(':INPUT(') || !c.includes(':OPTIONS(')) continue;
    const d = diag(f.line, f.col, f.raw.length, Severity.ERROR, 'W900',
      `DECLARE ${f.name}: lleva :INPUT(...) y :OPTIONS(...) a la vez, y así el motor ` +
      'pierde las opciones y el valor por defecto. Usa una sola forma: ' +
      ':INPUT(pregunta|opción 1,opción 2) ya expresa las dos cosas.');
    d.fix = {
      title: 'Fundir :OPTIONS en :INPUT(pregunta|opciones)',
      replacement: '',
    };
    out.push(d);
  }
  return out;
}

/**
 * `E901` — `{{INCLUDE}}` escrito con RUTA, que el lenguaje no admite.
 *
 * **El lenguaje no tiene rutas.** La clase de caracteres del nombre en
 * `INCLUDE_PATTERN` es `[\p{L}\p{N}_]`, que no incluye `/`. Así que
 *
 *     {{INCLUDE FISCALIDAD_CCAA/09_CATALUNA/PARR_EXENCIONES_CATALUNA_EMPRESA}}
 *
 * **no** referencia a `PARR_EXENCIONES_CATALUNA_EMPRESA`: el parser lee el
 * nombre `FISCALIDAD_CCAA`, no lo encuentra, y **el texto de la cláusula
 * desaparece**. Y no da ningún error, porque `{{INCLUDE FISCALIDAD_CCAA}}` es
 * una directiva perfectamente válida — el fallo es de omisión.
 *
 * Tampoco funcionaba en el SaaS: el Python resuelve con `Paragraph.name == name`,
 * coincidencia exacta, sin tocar la ruta.
 *
 * Medido el 2-oct-2026 en `_PROD`: **219 directivas en 40 ficheros**, 211 de
 * ellas con el prefijo `FISCALIDAD_CCAA`, todas colapsando al mismo nombre
 * inexistente. Se corrigieron 428 (contando `_DEV`); esta comprobación existe
 * para que no vuelvan a entrar.
 *
 * Es `E901` y no un aviso porque **siempre** es una errata: no hay ningún caso
 * en que escribir una ruta ahí signifique algo. El arreglo es mecánico —el
 * último segmento, sin `.md`—, así que el editor puede ofrecerlo.
 */
export function checkIncludeConRuta(fields: ParsedField[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fields) {
    if (f.fieldType !== FieldType.INCLUDE) continue;
    // Sobre el CONTENIDO crudo, no sobre `includeTarget`: el parser ya ha
    // cortado el nombre en la primera barra, que es justo el problema.
    // Cualquier cosa con una barra: también las rutas RELATIVAS (`../..`), que
    // la primera versión de esta comprobación no cazaba porque exigía que el
    // primer segmento empezara por letra. Son 8 ficheros de `_PROD`, y encima
    // apuntan fuera del árbol, a carpetas del legado.
    // ⚠️ La clase del segmento es UNICODE (`\w` de JS es ASCII, §4.8). La
    // primera versión usaba `[A-Za-z0-9_.]` y se le escapaba
    // `05_Borradores_Párrafos/…` por la **á** — el mismo fallo que ya nos costó
    // los nombres con Ñ, cometido otra vez.
    const m = f.content.match(/^INCLUDE:?\s+((?:\.{1,2}\/|[\w\u00C0-\u024F.]+\/)[^\s}]*)/iu);
    if (!m) continue;
    const ruta = m[1];
    const ultimo = ruta.slice(ruta.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    // Con una ruta relativa el parser no lee ni eso: `..` no es un nombre
    // válido, así que la directiva no referencia nada en absoluto.
    const primer = ruta.slice(0, ruta.indexOf('/'));
    const leido = /^\.{1,2}$/.test(primer) ? '(nada: `..` no es un nombre)' : primer;
    const canonica = `{{INCLUDE ${ultimo}}}`;
    const d = diag(f.line, f.col, f.raw.length, Severity.ERROR, 'E901',
      `INCLUDE con ruta: el lenguaje no admite rutas, así que esto NO incluye ` +
      `'${ultimo}' — el motor lee ${leido === '(nada: \`..\` no es un nombre)' ? leido : `el nombre '${leido}'`}, ` +
      `no lo encuentra, y la cláusula desaparece sin avisar. Escribe ${canonica}.`);
    d.fix = { title: `Dejar sólo el nombre: ${canonica}`, replacement: canonica };
    out.push(d);
  }
  return out;
}

/** Palabras del lenguaje que van seguidas de ESPACIO, nunca de dos puntos, con
 *  la forma correcta para el `fix`. No están aquí las que sí llevan dos puntos
 *  —`COMMENT:`, `DEPENDENCY:`, `MAP_IUI:`, `TAGS:`, `SUMMARY:`, `SYSTEM:`,
 *  `AUTO:`, `HUMAN_ACTION:`— ni `INCLUDE:`, que se tolera y ya avisa con W081. */
const CON_ESPACIO: ReadonlyArray<readonly [RegExp, string]> = [
  [/^DECLARE\s+ARRAY\s*:/i, 'DECLARE ARRAY'],
  [/^DECLARE\s*:/i, 'DECLARE'],
  [/^IF\s*:/i, 'IF'],
  [/^ELSEIF\s*:/i, 'ELSEIF'],
  [/^SET\s*:/i, 'SET'],
  [/^FOR\s+EACH\s*:/i, 'FOR EACH'],
];

/**
 * `E902` — palabra del lenguaje escrita con **dos puntos** donde va un espacio.
 *
 * `{{IF: CAMPO}}` **no es un condicional**. `classifyField` exige
 * `/^IF\s+\w/`, así que con los dos puntos la directiva cae en `EXTRACTED` y se
 * trata como un campo de datos llamado «IF: CAMPO». Las consecuencias, las tres
 * silenciosas:
 *
 *   · **la cláusula se emite SIEMPRE**, porque la condición que debía
 *     protegerla no es una condición;
 *   · donde iba la directiva aparece **`[NO DISPONIBLE]`**, porque el campo no
 *     tiene valor;
 *   · el `{{ENDIF}}` de abajo queda huérfano (`E011`).
 *
 * Medido el 3-oct-2026 en `_PROD`: **10 apariciones en 6 ficheros**, de los
 * cuales **5 son los párrafos de reducciones de donación de Cantabria, y están
 * enrutados** — así que toda donación cántabra reclamaba esas reducciones
 * cumpliera o no los requisitos. Lo mismo con `{{DECLARE: X}}` (11 en 2
 * ficheros): el campo nunca se declara y aparece otro fantasma.
 *
 * El validador ya daba pistas —`W056` por el campo sin DECLARE y `E011` por el
 * ENDIF huérfano—, pero ninguna decía lo que pasa de verdad. Esta sí, y trae el
 * arreglo hecho.
 */
export function checkDosPuntosEnPalabraClave(fields: ParsedField[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fields) {
    const c = f.content.trim();
    for (const [re, canonica] of CON_ESPACIO) {
      if (!re.test(c)) continue;
      const resto = c.replace(re, '').trim();
      const arreglo = `{{${canonica} ${resto}}}`;
      const d = diag(f.line, f.col, f.raw.length, Severity.ERROR, 'E902',
        `'${canonica}' va seguido de un ESPACIO, no de dos puntos. Así escrito no es ` +
        `una directiva: el motor lo trata como un campo de datos, de modo que ` +
        (canonica === 'IF' || canonica === 'ELSEIF'
          ? 'el texto que debía proteger se emite SIEMPRE y además sale «[NO DISPONIBLE]». '
          : 'el campo nunca se declara y sale «[NO DISPONIBLE]». ') +
        `Escribe ${arreglo}.`);
      d.fix = { title: `Quitar los dos puntos: ${arreglo}`, replacement: arreglo };
      out.push(d);
      break;
    }
  }
  return out;
}

/**
 * `W903` — cierre de condicional en forma heredada: `{{END IF}}` / `{{END_IF}}`.
 *
 * El lenguaje **las acepta** desde el 3-oct-2026, por simetría con
 * `{{END FOR}}` y `{{END_FOR}}`, que ya se aceptaban junto al canónico. Antes
 * no, y el daño era mudo: `{{END IF}}` no cerraba el bloque, así que el texto
 * que debía proteger el `{{IF}}` **se emitía siempre** y además salía un
 * `[NO DISPONIBLE]`. 12 casos en 6 ficheros de `_PROD`, tres de ellos
 * enrutados.
 *
 * Es aviso y no error porque ya funciona; sólo empuja a la forma canónica, como
 * hace `W082` con el `{{END FOR}}`.
 */
export function checkEndIfNoCanonico(fields: ParsedField[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fields) {
    if (f.fieldType !== FieldType.CONDITIONAL) continue;
    if (!/^END[\s_]+IF$/i.test(f.content.trim())) continue;
    const d = diag(f.line, f.col, f.raw.length, Severity.WARNING, 'W903',
      'Forma de cierre no canónica — prefiera {{ENDIF}}. Funciona, pero conviene ' +
      'unificar: la forma con espacio se aceptó por simetría con {{END FOR}}.');
    d.fix = { title: 'Migrar a {{ENDIF}}', replacement: '{{ENDIF}}' };
    out.push(d);
  }
  return out;
}

/**
 * `W905` — salto de página con la grafía heredada `{{SALTO_PAGINA}}`.
 *
 * La directiva nació así el 2-oct-2026 y se renombró a `{{PAGEBREAK}}` el 3-oct
 * (D38), para que no fuese la única palabra clave del lenguaje en castellano.
 * El renombrado no migró nada —la biblioteca no la usaba ni una vez— pero el manual
 * ya estaba publicado con el nombre viejo.
 *
 * Se sigue **aceptando y haciendo su trabajo**, y es aviso y no error por la
 * razón que justifica que la directiva exista: una directiva que el motor no
 * reconoce **no falla**, sale `[NO DISPONIBLE]` en medio de la escritura.
 * Rechazar la grafía vieja reintroduciría ese defecto exacto.
 */
export function checkPageBreakHeredado(fields: ParsedField[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fields) {
    if (f.fieldType !== FieldType.PAGE_BREAK) continue;
    if (!esPageBreakHeredado(f.content)) continue;
    const d = diag(f.line, f.col, f.raw.length, Severity.WARNING, 'W905',
      'Grafía heredada del salto de página — prefiera {{PAGEBREAK}}. Funciona, pero ' +
      'el resto de palabras clave del lenguaje están en inglés.');
    d.fix = { title: 'Migrar a {{PAGEBREAK}}', replacement: PAGEBREAK_DIRECTIVA };
    out.push(d);
  }
  return out;
}
