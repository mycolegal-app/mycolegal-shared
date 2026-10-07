// Expansión recursiva de `{{INCLUDE nombre}}`.
//
// Port de `_expand_includes_in_text` de `filler.py` (el camino de texto, no el
// de .docx: con todo en markdown el de .docx deja de hacer falta). La expansión
// es CRUDA a propósito: inserta el texto del párrafo aplicando sólo el
// renombrado `FIELDS:_sfx`, y deja variables, campos y condicionales intactos —
// de resolverlos se encarga `compose`.
//
// TRES DIFERENCIAS DELIBERADAS CON EL PYTHON, las tres a mejor:
//
// 1. **Inserta los centinelas** `INC_BEGIN`/`INC_END` alrededor de cada párrafo
//    insertado. En el Python nadie los inserta —sólo el editor, en `main.ts`—
//    así que `{{EXIT_INCLUDE}}` funciona en la previsualización y NO al generar
//    (verificado el 2-oct-2026; se usa en 2 ficheros de la biblioteca real). Con los
//    centinelas, `processExitIncludes` hace su trabajo y previsualizar y generar
//    dan lo mismo.
// 2. **Detecta ciclos** con una pila de nombres en curso. El Python sólo se
//    apoya en el tope de profundidad, así que un párrafo que se incluye a sí
//    mismo se expande 5 veces antes de parar, en silencio.
// 3. **Usa `MAX_INCLUDE_DEPTH`** (10, la constante canónica) en vez del 5
//    hardcodeado del camino de texto del Python, que diverge de su propio
//    camino .docx.
// 4. **Normaliza el texto de entrada a NFC.** Los ficheros del Drive llegan en
//    NFD (macOS descompone la Ñ en `N` + tilde combinante) y entonces la tilde,
//    que es categoría Mark y no Letter, corta el nombre: tanto el Python como
//    el TS capturan `PARR_LEY_ARAGO` en vez de `PARR_LEY_ARAGÓN` (comprobado en
//    los dos, 2-oct-2026). Normalizar en la frontera lo arregla para los dos y
//    no toca la semántica del lenguaje: es una cuestión de codificación.
//
// El `\n` tras `INC_BEGIN` NO es decorativo: `stripDirectives` ancla los
// comentarios `//` al principio de línea, y sin ese salto la primera línea del
// párrafo se pega al contenido anterior, el ancla se rompe y los comentarios se
// cuelan en la salida. `processExitIncludes` lo quita al retirar los centinelas.

import { MAX_INCLUDE_DEPTH } from '../syntax/constants';
import { parseFields, FieldType } from '../syntax/parser';
import { applyFieldSuffix, INC_BEGIN_MARK, INC_END_MARK, BIND_END_MARK, bindBeginMark } from './engine';

/** De dónde salen los párrafos. Lo implementa la app contra su catálogo
 *  efectivo —override de la organización > global— y **filtrando por derecho de
 *  uso**: ese invariante es del adaptador, nunca del motor. */
export interface ParrafoRepository {
  /** Markdown del párrafo, o `null` si no existe o la org no tiene derecho.
   *
   *  El nombre llega **normalizado a NFC**. Quien implemente el puerto debe
   *  normalizar también sus claves: los ficheros del Drive llegan en **NFD**
   *  (macOS descompone la Ñ en `N` + tilde combinante), mientras las directivas
   *  de las plantillas vienen en NFC, así que comparar byte a byte falla —
   *  `PARR_LEY_CATALUÑA` no encontraba su propio fichero (2-oct-2026). */
  getByName(nombre: string): Promise<string | null>;
}

/** Normaliza un nombre de párrafo para compararlo. NFC más recorte: es el único
 *  sitio donde se decide qué significa «el mismo nombre». */
export function normalizarNombre(nombre: string): string {
  return nombre.normalize('NFC').trim();
}

/** Adapta un mapa en memoria al puerto. Para tests, para el editor y para
 *  cuando la app ya tiene el conjunto cargado. */
export function repositorioDeMapa(mapa: Map<string, string> | Record<string, string>): ParrafoRepository {
  // Se reindexa normalizando: así da igual en qué forma vengan las claves.
  const normalizado = new Map<string, string>();
  const entradas = mapa instanceof Map ? mapa.entries() : Object.entries(mapa);
  for (const [k, v] of entradas) {
    const clave = normalizarNombre(k);
    if (!normalizado.has(clave)) normalizado.set(clave, v);
  }
  return { getByName: async (n) => normalizado.get(normalizarNombre(n)) ?? null };
}

export interface ResultadoExpansion {
  /** El texto con los INCLUDE sustituidos. */
  texto: string;
  /** Nombres que no resolvieron, sin repetidos y en orden de aparición. La
   *  frontera los traduce a `422 PLANTILLA_INCOMPLETA` (o `402` si el párrafo
   *  es de un pack no contratado) **antes** de abrir tarea. */
  faltantes: string[];
  /** Ciclos detectados, como la cadena que los cierra (`A → B → A`). */
  ciclos: string[];
  /** Nombres efectivamente insertados, sin repetidos. La app lo cachea en
   *  `docfilling_plantillas.includes` por `(nombre, huella)`. */
  usados: string[];
}

export interface OpcionesExpansion {
  /** Tope de anidamiento. Por defecto `MAX_INCLUDE_DEPTH`. */
  profundidadMaxima?: number;
  /** Texto que se deja donde un párrafo no resuelve. Por defecto, el mismo
   *  marcador que pone el Python, para no cambiar lo que ve el oficial. */
  marcadorFaltante?: (nombre: string) => string;
  /** Envolver cada párrafo insertado con los centinelas de EXIT_INCLUDE.
   *  Por defecto sí (ver cabecera). */
  centinelas?: boolean;
}

/** ¿Cae `offset` en una línea `//`? `stripDirectives` borrará esa línea entera, así
 *  que un `{{INCLUDE}}` comentado no se expande ni cuenta como faltante: es como
 *  la biblioteca retira una inclusión sin borrarla. */
function enLineaComentada(texto: string, offset: number): boolean {
  const inicio = texto.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*\/\//.test(texto.slice(inicio, offset));
}

export async function expandirIncludes(
  texto: string,
  repo: ParrafoRepository,
  opciones: OpcionesExpansion = {},
): Promise<ResultadoExpansion> {
  const profundidadMaxima = opciones.profundidadMaxima ?? MAX_INCLUDE_DEPTH;
  const marcador = opciones.marcadorFaltante ?? ((n: string) => `[Párrafo '${n}' no encontrado]`);
  const centinelas = opciones.centinelas ?? true;

  const faltantes: string[] = [];
  const ciclos: string[] = [];
  const usados: string[] = [];

  async function expandir(actual: string, profundidad: number, enCurso: string[]): Promise<string> {
    if (profundidad > profundidadMaxima) return actual;

    const directivas = parseFields(actual).filter(
      (f) => f.fieldType === FieldType.INCLUDE && f.includeTarget && !enLineaComentada(actual, f.offset),
    );
    if (directivas.length === 0) return actual;

    let salida = actual;
    // En orden INVERSO: así cada sustitución no invalida los offsets de las
    // anteriores. Es lo que hace el Python, y por el mismo motivo.
    for (const d of [...directivas].reverse()) {
      const nombre = normalizarNombre(d.includeTarget);
      let reemplazo: string;

      if (enCurso.includes(nombre)) {
        const cadena = [...enCurso, nombre].join(' → ');
        if (!ciclos.includes(cadena)) ciclos.push(cadena);
        reemplazo = `[Ciclo de INCLUDE: ${cadena}]`;
      } else {
        const contenido = await repo.getByName(nombre);
        if (contenido === null) {
          if (!faltantes.includes(nombre)) faltantes.push(nombre);
          reemplazo = marcador(nombre);
        } else {
          if (!usados.includes(nombre)) usados.push(nombre);
          let cuerpo = contenido;
          // El sufijo se aplica ANTES de recursar: así la directiva anidada ya
          // lleva el sufijo compuesto y sus campos hoja salen bien renombrados.
          if (d.includeSuffix) cuerpo = applyFieldSuffix(cuerpo, d.includeSuffix);
          cuerpo = await expandir(cuerpo, profundidad + 1, [...enCurso, nombre]);
          reemplazo = centinelas ? `${INC_BEGIN_MARK}\n${cuerpo}${INC_END_MARK}` : cuerpo;
          // `INCLUDE X(ITEM)` / `INCLUDE X FIELDS:(ITEM)`: vinculado al elemento
          // de la vuelta (ver `vincularAlElemento` en engine.ts).
          const vinc = d.raw.match(/\(\s*([A-Za-z_][\w\u00C0-\u024F]*)\s*\)\s*\}\}\s*$/);
          if (vinc) reemplazo = `${bindBeginMark(vinc[1])}${reemplazo}${BIND_END_MARK}`;
        }
      }

      salida = salida.slice(0, d.offset) + reemplazo + salida.slice(d.offset + d.raw.length);
    }
    return salida;
  }

  // NFC en la frontera: ver la nota 4 de la cabecera.
  const texto2 = await expandir(texto.normalize('NFC'), 0, []);
  return { texto: texto2, faltantes, ciclos, usados };
}
