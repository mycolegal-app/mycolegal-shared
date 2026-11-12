/**
 * EL MOTOR DE COMPOSICIÓN. Código nuestro: se edita como cualquier otro.
 *
 * Nació generado desde `docfilling-syntax/composer.py` con `scripts/gen-ts.py`,
 * y su cabecera decía «AUTO-GENERATED — DO NOT EDIT MANUALLY». **Ya no.** El
 * SaaS en Python se retira (D1/D4) y el vínculo con él no existe: este fichero
 * es la fuente, no una copia.
 *
 * Se deja dicho porque la cabecera vieja tenía un coste real: invitaba a no
 * tocar el motor, o a tocarlo con rodeos marcando «parche a mano». El tope de
 * iteraciones de los condicionales estuvo en 10 mientras la biblioteca anidaba
 * 12 niveles, y el aviso `W100` salía en cada composición.
 */

import { METADATA_PREFIXES } from "../syntax/constants";
// ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
import { esPageBreak } from "../syntax/page-break";
import { esWordStyle } from "../syntax/word-style";
import { parseComparacion, compararNumerico } from "../syntax/comparar";
import { quitarReqDoc } from "../syntax/req-doc";
import { aplicarFormatos, partirFormatos } from "../format/formats";
import { idiomaDePlantilla } from "../syntax/template-lang";
import { marcarBloqueos, bloqueosVivos, quitarMarcasDeBloqueo } from "./bloqueos";
import { resolverSeccionesDeLengua } from "../syntax/lang-section";
import {
  conValoresDeSchema, evaluarAtomoSchema, MARCA_SCHEMA, quitarDeclaracionesSchema, sustituirLecturasSchema,
  valoresDeSchema,
} from "../syntax/schema-meta";

export type FieldValues = Record<string, unknown>;

/** Non-fatal issue surfaced by composeWithDiagnostics(). */
export interface ComposeWarning {
  /** "W100" cond iter limit, "W101" for_each iter limit. */
  code: string;
  message: string;
  iteration: number;
}

// =============================================================================
// Internal helpers
// =============================================================================

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveFieldValue(fields: FieldValues, fieldName: string): string {
  if (fieldName in fields) return String(fields[fieldName]);
  // SYSTEM:NAME refers to the bare NAME field — the SYSTEM: prefix is a
  // language namespace, not part of the storage key.
  if (fieldName.toUpperCase().startsWith("SYSTEM:")) {
    const bare = fieldName.slice(7).trim();
    if (bare in fields) return String(fields[bare]);
    const up = bare.toUpperCase();
    if (up in fields) return String(fields[up]);
  }
  return "";
}

function isTruthy(fields: FieldValues, fieldName: string): boolean {
  const sv = resolveFieldValue(fields, fieldName);
  if (sv === "") return false;
  if (sv.toUpperCase() === "NO DISPONIBLE") return false;
  // ⚠️ Comparación SIN mayúsculas, y es un arreglo, no una variante: esta línea
  // decía `sv === "FALSE"`, así que `"false"` en minúscula era VERDADERO. No es
  // teórico — lo levantó la extracción con IA de F5, que propuso
  // `ES_ACTO_SUCESORIO = "false"`: aceptarlo habría metido una cláusula de
  // sucesión en una compraventa. Un valor booleano mal leído no deja hueco ni
  // aviso, mete o quita una cláusula entera.
  if (sv.trim().toUpperCase() === "FALSE") return false;
  // Spanish boolean idiom: DocFilling templates commonly use
  // `:INPUT(...|No,Sí)` for bool prompts, so a literal "No"
  // must gate IFs as falsy. Match Python composer's _is_truthy.
  if (sv.trim().toUpperCase() === "NO") return false;
  return true;
}

// Strip leading/trailing quote chars (Phase 3.4 — extends to curly + guillemets)
const QUOTE_RE = /^['"\u201c\u201d\u00ab\u00bb]+|['"\u201c\u201d\u00ab\u00bb]+$/g;

function isMetadataField(content: string): boolean {
  const upper = content.trim().toUpperCase();
  for (const p of METADATA_PREFIXES) {
    if (upper.startsWith(p.toUpperCase())) return true;
  }
  const condPrefixes = ["IF_", "ENDIF_", "ELSE_", "IF ", "ENDIF", "ELSE"];
  for (const p of condPrefixes) {
    const up = p.toUpperCase();
    if (upper.startsWith(up) || upper === up.trim()) return true;
  }
  return false;
}

// =============================================================================
// System fields (Phase 2 canonical set + locale support)
// =============================================================================

export const DEFAULT_LOCALE = "es";

interface LocaleData {
  months: readonly string[];
  dayLetters: Readonly<Record<number, string>>;
  fechaFormat: string;
}

const LOCALES: Readonly<Record<string, LocaleData>> = {
  es: {
    months: [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ],
    dayLetters: {
      1: "uno", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco",
      6: "seis", 7: "siete", 8: "ocho", 9: "nueve", 10: "diez",
      11: "once", 12: "doce", 13: "trece", 14: "catorce", 15: "quince",
      16: "dieciséis", 17: "diecisiete", 18: "dieciocho", 19: "diecinueve", 20: "veinte",
      21: "veintiuno", 22: "veintidós", 23: "veintitrés", 24: "veinticuatro",
      25: "veinticinco", 26: "veintiséis", 27: "veintisiete", 28: "veintiocho",
      29: "veintinueve", 30: "treinta", 31: "treinta y uno",
    },
    fechaFormat: "{dia} de {mes} de {anio}",
  },
};

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function getSystemFields(locale: string = DEFAULT_LOCALE): Record<string, string> {
  const now = new Date();
  const loc = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE];

  const dia = String(now.getDate());
  const diaLetras = loc.dayLetters[now.getDate()] ?? dia;
  const mes = loc.months[now.getMonth()];
  const mesNum = pad2(now.getMonth() + 1);
  const anio = String(now.getFullYear());
  const fecha = loc.fechaFormat
    .replace("{dia}", dia)
    .replace("{mes}", mes)
    .replace("{anio}", anio);
  const fechaIso = `${anio}-${mesNum}-${pad2(now.getDate())}`;
  const hora = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  return {
    DIA: dia,
    DIA_LETRAS: diaLetras,
    MES: mes,
    MES_NUM: mesNum,
    "AÑO": anio,
    ANO: anio,
    FECHA: fecha,
    FECHA_ISO: fechaIso,
    HORA: hora,
  };
}

// =============================================================================
// stripFieldSuffixes — Phase 3.1 normalization
// =============================================================================

// Scan a balanced `open...close` block. content[start] must be open.
// Returns the index just past the matching close, or null if
// unbalanced or out of bounds.
function scanBalanced(content: string, start: number, openCh: string, closeCh: string): number | null {
  if (start >= content.length || content[start] !== openCh) return null;
  let depth = 1;
  let i = start + 1;
  while (i < content.length && depth > 0) {
    const c = content[i];
    if (c === openCh) depth += 1;
    else if (c === closeCh) depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return i;
}

// Directive keywords accepted as `:KEYWORD(...)` suffixes on a placeholder.
// Order matters for longest-prefix match (INPUT_FINAL before INPUT).
const PLACEHOLDER_PAREN_DIRECTIVES = [
  "INPUT_FINAL", "INPUT", "HELP", "DEFAULT", "OPTIONS",
];

// Walk forward from `pos` (which should be at `:`) consuming any
// chain of `:INPUT(...)` / `:INPUT_FINAL(...)` / `:HELP(...)` /
// `:DEFAULT(...)` / `:OPTIONS(...)` / `:[instruction]` segments,
// plus an optional trailing `=value`. Returns the index just past
// the closing `}}` if the chain is well-formed, else null.
function tryMatchDirectiveChain(content: string, pos: number): number | null {
  const n = content.length;
  while (pos < n) {
    if (content.substring(pos, pos + 2) === "}}") return pos + 2;
    // `{{NOMBRE:[instrucción]#formato}}`: el formato de salida cierra la cadena.
    if (content[pos] === "#") {
      const end = content.indexOf("}}", pos);
      if (end < 0) return null;
      return end + 2;
    }
    if (content[pos] === "=") {
      const end = content.indexOf("}}", pos);
      if (end < 0) return null;
      return end + 2;
    }
    if (content[pos] !== ":") return null;
    pos += 1;
    if (pos >= n) return null;
    const upperTail = content.substring(pos, pos + 12).toUpperCase();
    let matched = false;
    for (const kw of PLACEHOLDER_PAREN_DIRECTIVES) {
      if (upperTail.startsWith(kw + "(")) {
        const parenStart = pos + kw.length;
        const newPos = scanBalanced(content, parenStart, "(", ")");
        if (newPos === null) return null;
        pos = newPos;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (content[pos] === "[") {
      const newPos = scanBalanced(content, pos, "[", "]");
      if (newPos === null) return null;
      pos = newPos;
      continue;
    }
    return null;
  }
  return null;
}

export function stripFieldSuffixes(content: string): string {
  // Salta de «{{» en «{{» (indexOf) y copia los tramos de en medio enteros: avanzar carácter a carácter, con un
  // `substring` y un `push` por carácter y el resto del texto copiado en cada «{{», era lo que más tiempo propio se
  // llevaba al calcular el expediente de un esquema expandido de ~3 MB (perfil de Redactor, 10-nov-2026). Mismo
  // resultado: lo que no es una declaración se copia tal cual y se sigue buscando desde el carácter siguiente.
  const out: string[] = [];
  const declaracion = /\{\{([\w\u00C0-\u024F]+):/y;
  let i = 0;
  let copiado = 0;
  for (;;) {
    const k = content.indexOf("{{", i);
    if (k < 0) break;
    declaracion.lastIndex = k;
    const m = declaracion.exec(content);
    const end = m && !isMetadataField(m[1]) ? tryMatchDirectiveChain(content, k + m[0].length - 1) : null;
    if (!m || end === null) { i = k + 1; continue; }
    out.push(content.slice(copiado, k));
    // El formato de salida (`#amount`) no es un sufijo de declaración: se conserva.
    const formato = /(#[^}]*)\}\}$/.exec(content.substring(k, end));
    out.push("{{" + m[1] + (formato ? formato[1].trim() : "") + "}}");
    i = copiado = end;
  }
  out.push(content.slice(copiado));
  return out.join("");
}

// =============================================================================
// stripDirectives
// =============================================================================

export function stripDirectives(content: string): string {
  // 1. Multiline comment blocks
  content = content.replace(/\{\{COMMENT_BEGIN\}\}[\s\S]*?\{\{COMMENT_END\}\}/gi, "");
  // 2. HUMAN_ACTION blocks (HUMAN_ACTION_INIT...END_HUMAN_ACTION)
  content = content.replace(/\{\{HUMAN_ACTION_INIT:[^}]*\}\}[\s\S]*?\{\{END_HUMAN_ACTION\}\}/gi, "");
  // 3. Single-line metadata directives — when a directive is the only
  // thing on its line, consume the whole line incl. trailing \n so it
  // doesn't leave a blank line behind. Generic fallbacks afterwards
  // strip inline directives in the middle of text.
  content = content.replace(/^[ \t]*\{\{DECLARE(?:_UNDEF)?\s[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{DECLARE(?:_UNDEF)?\s[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{TAGS:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{TAGS:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{SUMMARY:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{SUMMARY:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{\s*SCHEMA_ACT\s*:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{\s*SCHEMA_ACT\s*:[^}]*\}\}/gi, "");
  content = quitarDeclaracionesSchema(content);
  content = content.replace(/^[ \t]*\{\{COMMENT:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{COMMENT:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{DEPENDENCY:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{DEPENDENCY:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{MAP_IUI:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{MAP_IUI:[^}]*\}\}/gi, "");
  // 4. HUMAN_ACTION single-line variants
  content = content.replace(/^[ \t]*\{\{(?:HUMAN_ACTION|HUMAN_ACTION_PRE|HUMAN_ACTION_POST|END_HUMAN_ACTION)(?::[^}]*)?\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{(?:HUMAN_ACTION|HUMAN_ACTION_PRE|HUMAN_ACTION_POST|END_HUMAN_ACTION)(?::[^}]*)?\}\}/gi, "");
  // `{{BLOQUEO: …}}` no se imprime nunca (`composeWithDiagnostics` los marca antes y devuelve los vivos).
  content = content.replace(/^[ \t]*\{\{\s*BLOQUEO\s*:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{\s*BLOQUEO\s*:[^}]*\}\}/gi, "");
  // 5. // line comments (whole line including trailing newline)
  content = content.replace(/^[ \t]*\/\/[^\n]*\n?/gm, "");
  return content;
}

// =============================================================================
// extractDeclareFixedValues
// =============================================================================

/** Una declaración con valor fijo (`{{DECLARE X=v}}` o `{{DECLARE_UNDEF X=v}}`), en el orden del texto. */
interface DeclaracionFija {
  nombre: string;
  valor: string;
  soloSiIndefinido: boolean;
  desde: number;
  hasta: number;
}

/** Las declaraciones con valor fijo, sobre el texto con `:IUI` / `:REQ` / `:DOC` pelados (posiciones en ESE texto). */
function declaracionesFijas(content: string): { texto: string; decls: DeclaracionFija[] } {
  // `:IUI(path)` (FASE 32 / A9) is XML-mapping metadata; drop it so
  // `{{DECLARE X="v":IUI(A/B)}}` still yields the fixed value `v`.
  content = content.replace(/:IUI\([^()]*\)/gi, "");
  // `:REQ(…)` / `:DOC(…)` tampoco son valor: `{{DECLARE X=v:REQ(A.B)}}` da `v`.
  content = content.replace(/\{\{DECLARE(?:_UNDEF)?\s[^}]*\}\}/gi, (d) => quitarReqDoc(d));
  // El valor sin comillas acaba en la primera `}`: con `\S+` un DECLARE pegado a la directiva siguiente
  // (`{{DECLARE X=TRUE}}{{ENDIF}}`) daba el valor «TRUE}}{{ENDIF» (9-nov-2026).
  const pattern =
    /\{\{DECLARE(_UNDEF)?\s+([\w\u00C0-\u024F]+)(?:\s+AS\s+[\w\u00C0-\u024F]+)?\s*=\s*(?:"([^"]*)"|([^\s}]+))\s*\}\}/gi;
  const decls: DeclaracionFija[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    decls.push({
      nombre: m[2],
      valor: m[3] !== undefined ? m[3] : m[4],
      soloSiIndefinido: m[1] !== undefined,
      desde: m.index,
      hasta: m.index + m[0].length,
    });
  }
  return { texto: content, decls };
}

/**
 * Los valores fijos del texto, sin datos del caso ni condiciones: el último `DECLARE X=v` de cada campo, y un
 * `DECLARE_UNDEF X=v` sólo si antes no hay ninguna declaración fija de X. Es lo que dice el esquema por sí solo
 * (las constantes que nadie pregunta). Lo que se compone de verdad lo decide `resolverDeclarados`, que además
 * mira las ramas vivas y los datos del caso.
 */
export function extractDeclareFixedValues(content: string): Record<string, string> {
  const fixed: Record<string, string> = {};
  const declarados = new Set<string>();
  for (const d of declaracionesFijas(content).decls) {
    const clave = d.nombre.toUpperCase();
    if (d.soloSiIndefinido && declarados.has(clave)) continue;
    declarados.add(clave);
    fixed[d.nombre] = d.valor;
  }
  return fixed;
}

/**
 * Los valores fijos que el motor pone ENCIMA de los datos del caso al componer.
 *
 * `DECLARE X=v` no cambia: vale siempre, esté donde esté, y gana el último. `DECLARE_UNDEF X=v` (9-nov-2026, 0405
 * ACT-253) es un respaldo: sólo da valor a X si en ese punto del documento expandido nadie se lo ha dado:
 *   1. «antes» es el orden del texto expandido, con los INCLUDE dentro;
 *   2. una declaración en una rama que no se toma (IF falso, o tras un EXIT_INCLUDE) no cuenta, ni para declarar
 *      ni para respaldar;
 *   3. un dato del caso (lo contestado, no vacío) cuenta como declarado y no se pisa;
 *   4. un `DECLARE` vivo POSTERIOR sigue pisando al respaldo.
 * Las ramas dependen de los valores y los valores de las ramas: se repite hasta que no cambia (como mucho 4 veces).
 */
/**
 * Lo de `resolverDeclarados` que SÓLO depende de la plantilla —las declaraciones y el texto reducido a directivas y
 * marcas—, guardado por plantilla (10-nov-2026). Redactor lo pide con cada cambio de valores (cada tanda de una lectura,
 * cada respuesta) sobre el mismo esquema expandido de ~3 MB, y rehacerlo era la mitad del coste. Es una función pura
 * del texto: guardarlo no cambia el resultado.
 */
const PREPARADOS = new Map<string, { decls: DeclaracionFija[]; marcado: string; cond: CondicionalesPreparadas }>();
const PREPARADOS_MAX = 16;
function preparacionDeDeclarados(template: string): { decls: DeclaracionFija[]; marcado: string; cond: CondicionalesPreparadas } {
  const hecho = PREPARADOS.get(template);
  if (hecho) return hecho;
  const { texto, decls } = declaracionesFijas(template);
  // Cada declaración, sustituida por una marca: las que sobreviven a las condiciones están vivas.
  let marcado = "";
  let pos = 0;
  decls.forEach((d, i) => {
    marcado += texto.slice(pos, d.desde) + `\u0007${i}\u0007`;
    pos = d.hasta;
  });
  // Para saber qué rama se toma basta con las directivas, los centinelas de INCLUDE y las marcas: sin el texto
  // corrido, cada vuelta cuesta una fracción (esquema 0405 expandido, 3 MB). Las líneas `//` se quitan antes,
  // como hace `stripDirectives`, para no dejar viva una directiva comentada.
  marcado = (marcado + texto.slice(pos)).replace(/^[ \t]*\/\/[^\n]*\n?/gm, "");
  marcado = (marcado.match(/\{\{[\s\S]*?\}\}|\x00[^\x00]*\x00|\u0007\d+\u0007/g) ?? []).join("\n");
  marcado = stripDirectives(stripFieldSuffixes(marcado));
  const r = { decls, marcado, cond: prepararCondicionales(marcado) };
  if (PREPARADOS.size >= PREPARADOS_MAX) PREPARADOS.delete(PREPARADOS.keys().next().value!);
  PREPARADOS.set(template, r);
  return r;
}

export function resolverDeclarados(
  template: string,
  fields: FieldValues = {},
  locale: string = DEFAULT_LOCALE,
): Record<string, string> {
  const { decls, cond } = preparacionDeDeclarados(template);
  let fijos: Record<string, string> = {};
  for (const d of decls) if (!d.soloSiIndefinido) fijos[d.nombre] = d.valor;
  // Sin condiciones no hay ramas muertas: todos valen.
  if (!cond.raiz && !decls.some((d) => d.soloSiIndefinido)) return fijos;

  const tieneDato = (n: string): boolean => {
    const v = fields[n] ?? fields[n.toUpperCase()];
    return v !== undefined && v !== null && String(v) !== "";
  };
  const sistema = getSystemFields(locale);
  // Los metadatos del esquema raíz, para las condiciones sobre `SCHEMA:` (constantes), salvo que ya vengan.
  const conMeta = conValoresDeSchema(fields, template, idiomaDePlantilla(template, locale.slice(0, 2).toLowerCase()));
  let aplicados: Record<string, string> = {};
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const valores: FieldValues = { ...sistema, ...conMeta, ...fijos, ...aplicados };
    const vivas = new Set(
      [...processExitIncludes(resolverCondicionales(cond, valores)).matchAll(/\u0007(\d+)\u0007/g)].map((m) => Number(m[1])),
    );
    const declarado = new Set<string>();
    const respaldo = new Map<string, DeclaracionFija>();
    // Un `DECLARE X=v` en una rama que no se toma tampoco cuenta (Carles, 10-nov-2026): antes valía siempre.
    const fijosVivos: Record<string, string> = {};
    decls.forEach((d, i) => {
      if (!vivas.has(i)) return;
      const clave = d.nombre.toUpperCase();
      if (!d.soloSiIndefinido) {
        fijosVivos[d.nombre] = d.valor;
        declarado.add(clave);
        respaldo.delete(clave);
        return;
      }
      if (declarado.has(clave) || tieneDato(d.nombre)) return;
      declarado.add(clave);
      respaldo.set(clave, d);
    });
    const siguientes: Record<string, string> = {};
    for (const d of respaldo.values()) siguientes[d.nombre] = d.valor;
    const mismos = (a: Record<string, string>, b: Record<string, string>) =>
      Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
    const igual = mismos(siguientes, aplicados) && mismos(fijosVivos, fijos);
    aplicados = siguientes;
    fijos = fijosVivos;
    if (igual) break;
  }

  // El respaldo aplicado sustituye a lo que dijera un DECLARE muerto del mismo campo.
  const out: Record<string, string> = {};
  const conRespaldo = new Set(Object.keys(aplicados).map((k) => k.toUpperCase()));
  for (const [k, v] of Object.entries(fijos)) if (!conRespaldo.has(k.toUpperCase())) out[k] = v;
  return { ...out, ...aplicados };
}

// =============================================================================
// applyFieldSuffix — rename every field reference inside the resolved
// content of {{INCLUDE foo FIELDS:_sfx}} so the same paragraph can
// be reused (comprador / vendedor / etc.) without name collisions.
// Mirrors composer.apply_field_suffix in the Python package.
// =============================================================================

const _IF_RESERVED = new Set([
  "AND", "OR", "NOT", "IN", "IF", "ELSE", "ENDIF", "TRUE", "FALSE",
]);

// Set of canonical SYSTEM field names (DIA/MES/FECHA/...) that must
// never be renamed because they're injected globally by the composer.
const _SYSTEM_FIELDS_SET: ReadonlySet<string> = new Set([
  "DIA", "DIA_LETRAS", "MES", "MES_NUM", "AÑO", "ANO",
  "FECHA", "FECHA_ISO", "HORA",
]);

/** ¿`name` (`ITEM`, `ITEM.NOMBRE`, `ITEM.DOMICILIO.CALLE`) es la variable de un FOR EACH abierto, o algo suyo? */
function _esDeBucle(name: string, loopVars: ReadonlySet<string>): boolean {
  return loopVars.size > 0 && loopVars.has(name.split(".")[0].toUpperCase());
}

function _renameIfBody(body: string, suffix: string, loopVars: ReadonlySet<string> = new Set()): string {
  if (!suffix) return body;
  // Mask quoted strings so identifiers inside them aren't touched.
  const quoted: string[] = [];
  const masked = body.replace(/"[^"]*"|'[^']*'/g, (m) => {
    quoted.push(m);
    return `\u0000${quoted.length - 1}\u0000`;
  });
  const renameOne = (token: string): string => {
    const m = token.match(/^(\s*)((?:SYSTEM:)?[A-Za-z_][\w.\u00C0-\u024F]*)([\s\S]*)$/);
    if (!m) return token;
    const [, leading, name, rest] = m;
    const upper = name.toUpperCase();
    if (upper.startsWith("SYSTEM:")) return token;
    // `SCHEMA:GROUP == "X"`: los metadatos del esquema no son campos y no llevan sufijo.
    if (upper === "SCHEMA" && rest.trimStart().startsWith(":")) return token;
    if (_IF_RESERVED.has(upper)) return token;
    // `{{IF ITEM.CASADO == "Sí"}}` dentro de un bucle: el subcampo es del elemento, no un campo del párrafo.
    if (_esDeBucle(name, loopVars)) return token;
    return `${leading}${name}${suffix}${rest}`;
  };
  const parts = masked.split(/(\bAND\b|\bOR\b|\bNOT\b|[()])/i);
  const out = parts
    .map((p) => {
      if (!p) return p;
      if (/^\s*(?:AND|OR|NOT|[()])\s*$/i.test(p)) return p;
      return renameOne(p);
    })
    .join("");
  return out.replace(/\u0000(\d+)\u0000/g, (_, idx) => quoted[parseInt(idx, 10)]);
}

function _composeSuffix(inner: string, outer: string): string {
  if (!outer) return inner;
  if (!inner) return outer;
  return inner + outer;
}

/**
 * Los nombres de campo que un texto USA fuera de `AUTO` (pintados, declarados o en una condición): son los que el
 * sufijo de un INCLUDE renombra. Sirve para saber si la pista de un `{{AUTO(PISTA):…}}` es uno de ellos.
 */
function camposQueRenombra(content: string): Set<string> {
  const s = new Set<string>();
  for (const m of content.matchAll(/\{\{([^}]+)\}\}/g)) {
    const body = m[1].trim();
    const upper = body.toUpperCase();
    if (upper.startsWith("AUTO") || upper.startsWith("SYSTEM:") || upper.startsWith("@")) continue;
    const decl = body.match(/^DECLARE(?:_UNDEF)?\s+(?:ARRAY\s+)?([A-Za-z_][\w\u00C0-\u024F]*)/i);
    if (decl) { s.add(decl[1].toUpperCase()); continue; }
    const cond = body.match(/^(?:IF|ELSE)[_\s]+([\s\S]*)$/i);
    if (cond) {
      for (const n of cond[1].replace(/"[^"]*"|'[^']*'/g, " ").matchAll(/[A-Za-z_][\w\u00C0-\u024F]*/g)) s.add(n[0].toUpperCase());
      continue;
    }
    const campo = body.match(/^([A-Za-z_][\w\u00C0-\u024F]*)\s*(?:$|[=!:#])/);
    if (campo) s.add(campo[1].toUpperCase());
  }
  return s;
}

export function applyFieldSuffix(content: string, suffix: string): string {
  if (!suffix || !content) return content;
  // La pista de una concordancia (`AUTO(COMP_PF_NOMBRE)`) sigue al campo: si el campo se renombra
  // (`COMP_PF_NOMBRE_VEND`), la pista también; si apunta a un campo de fuera (`AUTO(FINCAS)`), no.
  // Sin esto, la pista de un párrafo incluido con `FIELDS:_VEND` apuntaba a un campo que no existe y la
  // concordancia decidía sólo por el contexto (certificación del 0507, 15-oct-2026).
  const renombrados = camposQueRenombra(content);
  // Las variables de los FOR EACH abiertos, en orden: lo que cuelga de ellas (`ITEM.NOMBRE`) es un SUBCAMPO del
  // elemento, declarado en el `DECLARE ARRAY LISTA(NOMBRE)`, y no lleva sufijo. Sólo lo lleva la lista. Permuta 0503
  // (12-nov-2026): `{{ITEM.NOMBRE}}` pasaba a `{{ITEM.NOMBRE_PERMUTANTE_1}}`, E090 y nombres en blanco.
  const bucles: string[] = [];
  const loopVars = () => new Set(bucles);
  return content.replace(/\{\{([^}]+)\}\}/g, (full, raw: string) => {
    const body = raw.trim();
    const upper = body.toUpperCase();

    if (upper.startsWith("SYSTEM:")) return full;
    if (/^SCHEMA\s*:/.test(upper)) return full;
    if (/^BLOQUEO\s*:/.test(upper)) return full;
    if (_SYSTEM_FIELDS_SET.has(upper)) return full;
    // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
    // El salto de página no es un campo: renombrarlo con el sufijo del INCLUDE
    // lo convertía en `{{PAGEBREAK_A}}` y la fusión ya no lo reconocía.
    if (esPageBreak(body)) return full;
    // El estilo tampoco es un campo: el sufijo del INCLUDE no debe tocarlo.
    if (esWordStyle(body)) return full;
    if (
      upper.startsWith("COMMENT:") || upper.startsWith("COMMENT_BEGIN") ||
      upper.startsWith("COMMENT_END") || upper.startsWith("TAGS:") ||
      upper.startsWith("SUMMARY:") || upper.startsWith("SCHEMA_ACT") || upper.startsWith("LANG=") ||
      upper.startsWith("LANG ") || upper.startsWith("DEPENDENCY:") ||
      upper.startsWith("MAP_IUI:") || upper.startsWith("DOCUBOT") ||
      upper.startsWith("AUTO:") ||
      upper.startsWith("HUMAN_ACTION") || upper.startsWith("END_HUMAN_ACTION") ||
      upper.startsWith("EXIT_INCLUDE")
    ) return full;

    // AUTO(PISTA):… → la pista, si es un campo que este texto renombra.
    const auto = body.match(/^(AUTO\s*\(\s*)([A-Za-z_][\w\u00C0-\u024F]*)(\s*\)[\s\S]*)$/i);
    if (auto) return renombrados.has(auto[2].toUpperCase()) ? `{{${auto[1]}${auto[2]}${suffix}${auto[3]}}}` : full;
    if (upper.startsWith("AUTO(")) return full;

    // FOR EACH ITEM IN ARRAY → rename ARRAY only
    let m = body.match(/^(FOR\s+EACH\s+[\w\u00C0-\u024F]+\s+IN\s+)([\w\u00C0-\u024F]+)(\s*)$/i);
    if (m) {
      bucles.push(String(body.match(/^FOR\s+EACH\s+([\wÀ-ɏ]+)/i)![1]).toUpperCase());
      return `{{${m[1]}${m[2]}${suffix}${m[3]}}}`;
    }
    // La lista con punto (`FOR EACH H IN ITEM.HIJOS`, la de un bucle anidado) no se renombra —como antes—, pero su
    // variable también es de bucle.
    m = body.match(/^FOR\s+EACH\s+([\wÀ-ɏ]+)\s+IN\s+[\wÀ-ɏ]+\.[\w.À-ɏ]+\s*$/i);
    if (m) { bucles.push(m[1].toUpperCase()); return full; }

    if (/^(?:ENDFOR|END[\s_]+FOR)\s*$/i.test(body)) { bucles.pop(); return full; }

    // COUNT(ARRAY)
    m = body.match(/^(COUNT\s*\(\s*)([\w\u00C0-\u024F]+)(\s*\))\s*$/i);
    if (m) return `{{${m[1]}${m[2]}${suffix}${m[3]}}}`;

    // IF directive (named or spaced form)
    m = body.match(/^(IF[_\s]+)([\s\S]*)$/i);
    if (m) {
      const head = m[1];
      const rest = m[2];
      const newRest = _renameIfBody(rest, suffix, loopVars());
      return `{{${head}${newRest}}}`;
    }

    // ELSE_NAME / ELSE NAME / bare ELSE
    m = body.match(/^(ELSE)([_\s]+)([\w\u00C0-\u024F]+)\s*$/i);
    if (m) return `{{${m[1]}${m[2]}${m[3]}${suffix}}}`;
    if (/^ELSE\s*$/i.test(body)) return full;

    // ENDIF / ENDIF_NAME / ENDIF NAME
    m = body.match(/^(ENDIF)([_\s]+)([\w\u00C0-\u024F]+)\s*$/i);
    if (m) return `{{${m[1]}${m[2]}${m[3]}${suffix}}}`;
    if (/^ENDIF\s*$/i.test(body)) return full;

    // Nested INCLUDE with optional own FIELDS suffix → compound.
    m = body.match(
      /^INCLUDE([\s_:]*\(?['"]?)([\w\u00C0-\u024F]+)(['"]?\)?\s*)(?:(FIELDS\s*:\s*)([A-Za-z_][\w\u00C0-\u024F]*))?\s*$/i,
    );
    if (m) {
      const [, head, target, mid, fieldsKw, innerSfx] = m;
      const combined = _composeSuffix(innerSfx || "", suffix);
      let sep: string;
      if (fieldsKw) sep = mid;
      else if (mid.endsWith(" ") || mid.endsWith("\t")) sep = mid;
      else sep = mid + " ";
      return `{{INCLUDE${head}${target}${sep}FIELDS:${combined}}}`;
    }

    // DECLARE ARRAY NAME ...
    m = body.match(/^(DECLARE\s+ARRAY\s+)([\w\u00C0-\u024F]+)([\s\S]*)$/i);
    if (m) return `{{${m[1]}${m[2]}${suffix}${m[3]}}}`;

    // DECLARE NAME ... (covers =val, AS TYPE, :INPUT(...), bare DECLARE) — y DECLARE_UNDEF NAME …
    m = body.match(/^(DECLARE(?:_UNDEF)?\s+)([\w\u00C0-\u024F]+)([\s\S]*)$/i);
    if (m) return `{{${m[1]}${m[2]}${suffix}${m[3]}}}`;

    // NAME:INPUT(...) / NAME:INPUT_FINAL(...)
    m = body.match(/^([\w\u00C0-\u024F]+)(:INPUT(?:_FINAL)?\()([\s\S]*)$/i);
    if (m) return `{{${m[1]}${suffix}${m[2]}${m[3]}}}`;

    // NAME:HELP(...)
    m = body.match(/^([\w\u00C0-\u024F]+)(:HELP\([\s\S]*\))\s*$/i);
    if (m) return `{{${m[1]}${suffix}${m[2]}}}`;

    // Bare placeholder {{NAME}} (allow dots) — strip operator tail (==, !=, :)
    m = body.match(/^([A-Za-z_][\w.\u00C0-\u024F]*)([\s\S]*)$/);
    if (m && (!m[2] || /^\s*[=!:#]/.test(m[2]))) {
      if (_esDeBucle(m[1], loopVars())) return full;
      return `{{${m[1]}${suffix}${m[2] || ""}}}`;
    }

    return full;
  });
}

// =============================================================================
// normalizeConditionals — Phase 4.2: rewrite legacy IF_X / ELSE_X / ENDIF_X
//   to canonical IF X / ELSE / ENDIF before processing.
// =============================================================================

export function normalizeConditionals(content: string): string {
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
  // `{{END IF}}` / `{{END_IF}}` → `{{ENDIF}}`. Va PRIMERO: así todo lo de
  // abajo y todo el compositor ven ya la forma canónica, y no hay que tocar
  // `processConditionals`. Simétrico con `{{END FOR}}`, que ya se aceptaba.
  content = content.replace(/\{\{END[_\s]+IF\s*\}\}/gi, "{{ENDIF}}");
  // IF_NAME tail → IF NAME tail. Field-name allows an optional
  // `SYSTEM:` namespace prefix so legacy
  // `{{IF_SYSTEM:COMUNIDAD == "Cataluña"}}` normalises correctly.
  content = content.replace(
    /\{\{IF_((?:SYSTEM:|SCHEMA:)?[\w.\u00C0-\u024F]+)([^}]*)\}\}/gi,
    (_m: string, name: string, tail: string) => `{{IF ${name}${tail}}}`,
  );
  // ELSE_NAME / ELSE NAME → ELSE
  content = content.replace(/\{\{ELSE[_\s]+(?:SYSTEM:|SCHEMA:)?[\w.\u00C0-\u024F]+\s*\}\}/gi, "{{ELSE}}");
  // ENDIF_NAME / ENDIF NAME → ENDIF
  content = content.replace(/\{\{ENDIF[_\s]+(?:SYSTEM:|SCHEMA:)?[\w.\u00C0-\u024F]+\s*\}\}/gi, "{{ENDIF}}");
  return content;
}

// =============================================================================
// processConditionals
// =============================================================================

/**
 * El evaluador de condiciones del motor, fuera de `processConditionals` para poder usarlo también por partes
 * (`condicionTriestado`). El código es el que había dentro, tal cual: un solo evaluador del lenguaje.
 */
  // Quote- and paren-aware splitter — splits `expr` by `sep`
  // ("AND" or "OR") when it appears outside quoted strings / IN(...)
  // lists. Mirrors the validator's helper.
function splitLogicalCond(expr: string, sep: string): string[] {
    const parts: string[] = [];
    let buf: string[] = [];
    let quote: string | null = null;
    let parenDepth = 0;
    const sepUp = sep.toUpperCase();
    let i = 0;
    while (i < expr.length) {
      const c = expr[i];
      if (quote !== null) {
        buf.push(c);
        if (c === quote) quote = null;
        i++; continue;
      }
      if (c === "'" || c === '"') { quote = c; buf.push(c); i++; continue; }
      if (c === "(") { parenDepth++; buf.push(c); i++; continue; }
      if (c === ")") { if (parenDepth > 0) parenDepth--; buf.push(c); i++; continue; }
      if (parenDepth === 0 && /\s/.test(c)) {
        let j = i + 1;
        while (j < expr.length && /\s/.test(expr[j])) j++;
        if (expr.slice(j, j + sepUp.length).toUpperCase() === sepUp) {
          const k = j + sepUp.length;
          if (k >= expr.length || /\s/.test(expr[k])) {
            parts.push(buf.join("").trim());
            buf = [];
            i = k;
            continue;
          }
        }
      }
      buf.push(c);
      i++;
    }
    parts.push(buf.join("").trim());
    return parts;
  };

  // Map each opening quote → closer. Asymmetric pairs (curly /
  // guillemet) close with their partner; symmetric ones close
  // with themselves. Mirrors composer._QUOTE_PAIRS.
const QUOTE_PAIRS_COND: Record<string, string> = {
    "'": "'",
    '"': '"',
    "\u201c": "\u201d",
    "\u00ab": "\u00bb",
  };
function quoteClosesCond(opener: string, c: string): boolean {
  return (QUOTE_PAIRS_COND[opener] ?? opener) === c;
}

  // ¿Envuelve un único par de paréntesis la expresión ENTERA? `(A OR B)` sí;
  // `(A) AND (B)` no —el primer `(` cierra antes del final—. Consciente de
  // comillas, para no contar un paréntesis que va dentro de un valor.
function envueltaEnParentesisCond(e: string): boolean {
    if (!e.startsWith("(") || !e.endsWith(")")) return false;
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < e.length; i++) {
      const c = e[i];
      if (quote !== null) { if (quoteClosesCond(quote, c)) quote = null; continue; }
      if ("'\"\u201c\u00ab".includes(c)) { quote = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0 && i < e.length - 1) return false; }
    }
    return depth === 0;
  };

/** La estructura de una condición, sin valores: lo que se puede guardar por texto. */
type NodoCondicion =
  | { t: "vacia" } | { t: "or"; hijos: NodoCondicion[] } | { t: "and"; hijos: NodoCondicion[] }
  | { t: "not"; h: NodoCondicion } | { t: "atomo"; atomo: string };

/**
 * Analizar el texto de una condición (partir por OR y AND fuera de comillas y paréntesis, carácter a carácter) era la
 * mitad del coste de evaluar las condiciones de un esquema de miles de IF, y se repetía en cada evaluación con cada
 * juego de valores (perfil de Redactor, 10-nov-2026). No depende de los valores: se hace una vez por texto.
 */
const ESTRUCTURAS = new Map<string, NodoCondicion>();
const ESTRUCTURAS_MAX = 50_000;
function estructuraDeCondicion(expr: string): NodoCondicion {
  const hecha = ESTRUCTURAS.get(expr);
  if (hecha) return hecha;
  const e = expr.trim();
  let n: NodoCondicion;
  if (!e) n = { t: "vacia" };
  else {
    const orParts = splitLogicalCond(e, "OR");
    if (orParts.length > 1) n = { t: "or", hijos: orParts.map(estructuraDeCondicion) };
    else {
      const andParts = splitLogicalCond(e, "AND");
      if (andParts.length > 1) n = { t: "and", hijos: andParts.map(estructuraDeCondicion) };
      else if (/^NOT\s*\(/i.test(e) || /^NOT\s+/i.test(e)) n = { t: "not", h: estructuraDeCondicion(e.slice(3).trim()) };
      else if (envueltaEnParentesisCond(e)) n = estructuraDeCondicion(e.slice(1, -1));
      else n = { t: "atomo", atomo: e };
    }
  }
  if (ESTRUCTURAS.size >= ESTRUCTURAS_MAX) ESTRUCTURAS.clear();
  ESTRUCTURAS.set(expr, n);
  return n;
}

function crearEvaluador(fields: FieldValues, warnings?: ComposeWarning[]) {
  const splitLogical = splitLogicalCond;
  const quoteCloses = quoteClosesCond;
  // Quote-aware split of an IN-list body by top-level commas.
  const splitTopCommas = (body: string): string[] => {
    const parts: string[] = [];
    let buf: string[] = [];
    let quote: string | null = null;
    for (const c of body) {
      if (quote !== null) {
        buf.push(c);
        if (quoteCloses(quote, c)) quote = null;
        continue;
      }
      if ("'\"\u201c\u201d\u00ab\u00bb".includes(c)) { quote = c; buf.push(c); continue; }
      if (c === ",") { parts.push(buf.join("")); buf = []; continue; }
      buf.push(c);
    }
    parts.push(buf.join(""));
    return parts;
  };

  // Quote-aware parse of a `CAMPO [NOT] IN (...)` atom. Tolerates
  // parens / commas inside quoted values.
  const parseInAtom = (atom: string): { fn: string; isNot: boolean; body: string } | null => {
    const m = atom.match(/^((?:SYSTEM:)?[\w.\u00C0-\u024F]+)\s+(NOT\s+)?IN\s*\(/i);
    if (!m) return null;
    const start = m[0].length;
    let quote: string | null = null;
    for (let i = start; i < atom.length; i++) {
      const c = atom[i];
      if (quote !== null) { if (quoteCloses(quote, c)) quote = null; continue; }
      if ("'\"\u201c\u201d\u00ab\u00bb".includes(c)) { quote = c; continue; }
      if (c === ")") {
        const body = atom.slice(start, i);
        const tail = atom.slice(i + 1).trim();
        if (tail !== "") return null;
        return { fn: m[1], isNot: !!m[2], body };
      }
    }
    return null;
  };

  // Evaluate a single non-logical atom (no AND / OR / NOT).
  const evalAtom = (atom: string): boolean => {
    // `SCHEMA:ACT == "…"`, `SCHEMA:GROUP IN (…)`: los metadatos del esquema raíz (`schema-meta.ts`).
    const meta = evaluarAtomoSchema(atom, fields);
    if (meta !== null) return meta;
    // ⚠️ PARCHE A MANO (5-oct-2026): `COUNT(ARRAY) <op> número`. La plantilla
    // necesita saber si hay una finca o varias («FINCA HIPOTECADA» / «FINCAS
    // HIPOTECADAS»); las de cancelaciones lo escribían `LEN(FINCAS) > 1`, que
    // no existe y daba siempre falso. COUNT es la función que ya define la
    // sintaxis (§ COUNT); aquí sólo se admite también dentro de un IF.
    const mCount = atom.trim().match(/^COUNT\s*\(\s*([\w.\u00C0-\u024F]+)\s*\)\s*(<=|>=|==|!=|<|>)\s*(\d+)\s*$/i);
    if (mCount) {
      const arr = fields[mCount[1].toUpperCase()];
      const n = Array.isArray(arr) ? arr.length : 0;
      const k = Number(mCount[3]);
      switch (mCount[2]) {
        case "<=": return n <= k; case ">=": return n >= k; case "<": return n < k;
        case ">": return n > k; case "==": return n === k; default: return n !== k;
      }
    }
    const inAtom = parseInAtom(atom);
    if (inAtom !== null) {
      const vals = splitTopCommas(inAtom.body).map((v) => v.trim().replace(QUOTE_RE, ""));
      const present = vals.includes(resolveFieldValue(fields, inAtom.fn.trim()));
      return inAtom.isNot ? !present : present;
    }
    // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
    // Comparaciones numéricas `<=`, `>=`, `<`, `>`. Van ANTES de `==`/`!=`
    // porque son átomos distintos, y el parseo del número es consciente del
    // formato español (`500.000,00`). Ver `src/syntax/comparar.ts`.
    const cmp = parseComparacion(atom);
    if (cmp !== null) {
      const r = compararNumerico(resolveFieldValue(fields, cmp.campo), cmp.operador, cmp.literal);
      if (r.problema && warnings) {
        // No se da por falsa en silencio: ésta es la clase de fallo mudo que
        // la biblioteca arrastraba. `W904` en el rango propio (D25).
        warnings.push({
          code: "W904",
          message: `IF ${cmp.campo} ${cmp.operador} ${cmp.literal}: ${r.problema}. ` +
            "La condición se toma como no cumplida.",
          iteration: 0,
        });
      }
      return r.resultado;
    }
    if (atom.includes("==")) {
      const idx = atom.indexOf("==");
      const fn = atom.slice(0, idx).trim();
      const val = atom.slice(idx + 2).trim().replace(QUOTE_RE, "");
      return resolveFieldValue(fields, fn) === val;
    }
    if (atom.includes("!=")) {
      const idx = atom.indexOf("!=");
      const fn = atom.slice(0, idx).trim();
      const val = atom.slice(idx + 2).trim().replace(QUOTE_RE, "");
      if (val === "") return isTruthy(fields, fn);
      return resolveFieldValue(fields, fn) !== val;
    }
    return isTruthy(fields, atom.trim());
  };

  // Recursive evaluator — precedence: NOT (highest) > AND > OR (lowest).
  const envueltaEnParentesis = envueltaEnParentesisCond;

  // La ESTRUCTURA de cada condición (OR / AND / NOT / paréntesis / comparación) se analiza una vez y se guarda por
  // texto (`estructuraDeCondicion`); aquí sólo se recorre con estos valores. Mismo orden y mismos cortocircuitos que
  // el evaluador recursivo de antes, y cada comparación la sigue evaluando `evalAtom`.
  const evalNodo = (n: NodoCondicion): boolean => {
    switch (n.t) {
      case "vacia": return false;
      case "or": return n.hijos.some(evalNodo);
      case "and": return n.hijos.every(evalNodo);
      case "not": return !evalNodo(n.h);
      default: return evalAtom(n.atomo);
    }
  };
  const evalExpr = (expr: string): boolean => evalNodo(estructuraDeCondicion(expr));
  return { evalExpr, evalAtom, splitLogical, envueltaEnParentesis };
}

/** El campo de una comparación (`X == "a"`, `X IN (…)`, `X > 3`, `COUNT(X) > 1` o `X` a secas), en mayúsculas. */
function campoDelAtomo(atomo: string): string | null {
  const a = atomo.trim();
  const m = a.match(/^COUNT\s*\(\s*([\w.\u00C0-\u024F]+)/i) ?? a.match(/^(?:SYSTEM:)?([A-Za-z_][\w.\u00C0-\u024F]*)/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * ¿Qué vale una condición sabiendo sólo parte de los campos? Lógica de tres valores (cierto, falso, no se sabe) sobre
 * el mismo `AND` / `OR` / `NOT` / paréntesis del motor, y cada comparación la evalúa el motor. `valor` es `null` si
 * depende de lo que falta; `faltan`, los campos que todavía pueden cambiar el resultado (no todos los vacíos: en
 * `CA == "Baleares" AND X`, con la comunidad en Andalucía, `X` ya no hace falta).
 *
 * Para quien pregunta (Redactor): la condición del justificante de fondos de la donación de dinero junta veintidós
 * beneficios de siete comunidades, y se preguntaban todas las casillas vacías aunque la comunidad ya las descartara
 * (certificación del 0701, 15-oct-2026).
 */
export function condicionTriestado(
  condicion: string,
  fields: FieldValues,
  desconocido: (campo: string) => boolean,
): { valor: boolean | null; faltan: string[] } {
  const { evalAtom, splitLogical, envueltaEnParentesis } = crearEvaluador(fields);
  type R = { valor: boolean | null; faltan: string[] };
  const union = (rs: R[]) => [...new Set(rs.filter((r) => r.valor === null).flatMap((r) => r.faltan))];
  const ev = (expr: string): R => {
    const e = expr.trim();
    if (!e) return { valor: false, faltan: [] };
    const orParts = splitLogical(e, "OR");
    if (orParts.length > 1) {
      const rs = orParts.map(ev);
      if (rs.some((r) => r.valor === true)) return { valor: true, faltan: [] };
      return rs.every((r) => r.valor === false) ? { valor: false, faltan: [] } : { valor: null, faltan: union(rs) };
    }
    const andParts = splitLogical(e, "AND");
    if (andParts.length > 1) {
      const rs = andParts.map(ev);
      if (rs.some((r) => r.valor === false)) return { valor: false, faltan: [] };
      return rs.every((r) => r.valor === true) ? { valor: true, faltan: [] } : { valor: null, faltan: union(rs) };
    }
    if (/^NOT\s*\(/i.test(e) || /^NOT\s+/i.test(e)) {
      const r = ev(e.slice(3).trim());
      return r.valor === null ? r : { valor: !r.valor, faltan: [] };
    }
    if (envueltaEnParentesis(e)) return ev(e.slice(1, -1));
    // Los metadatos del esquema son constantes: nunca «no se sabe».
    const meta = evaluarAtomoSchema(e, fields);
    if (meta !== null) return { valor: meta, faltan: [] };
    const campo = campoDelAtomo(e);
    if (campo && desconocido(campo)) return { valor: null, faltan: [campo] };
    return { valor: evalAtom(e), faltan: [] };
  };
  return ev(condicion);
}

/**
 * Los IF/ELSE/ENDIF, en UNA pasada (10-nov-2026). Antes: una expresión regular que resolvía los bloques más internos
 * y releía el texto entero por cada nivel de anidamiento (hasta 50 vueltas), y `resolverDeclarados` la repetía hasta 4
 * veces: con el esquema expandido de una 0405 (~3 MB) era casi todo el tiempo de calcular el expediente.
 *
 * Ahora se emparejan los IF y los ENDIF con una pila y cada bloque se resuelve con sus hijos ya resueltos. El resultado
 * es el MISMO carácter a carácter (condición de Carles; comparado con toda la biblioteca de _PROD), porque se imitan
 * las reglas de la expresión regular, incluidas las de las plantillas mal formadas:
 *
 *   · un bloque sólo se resuelve si su cuerpo, con los hijos ya resueltos, no contiene ningún «{{IF » ni «{{ENDIF}}»:
 *     un hijo que se queda sin resolver (un «{{IF » mal cerrado, uno sin ENDIF) deja literal a todos sus antecesores;
 *   · el cuerpo se parte por el PRIMER «{{ELSE}}» que contenga (también uno que traiga un hijo ya resuelto);
 *   · un bloque se resuelve en la vuelta «1 + la del hijo más profundo», y nada pasa de la vuelta 50 (W100 igual).
 *
 * Lo único que cambia es el ORDEN en que se evalúan las condiciones (de dentro afuera bloque a bloque, no nivel a nivel
 * en todo el texto), y con él el orden de los avisos de evaluación.
 */
export function processConditionals(
  content: string,
  fields: FieldValues,
  warnings?: ComposeWarning[],
): string {
  return resolverCondicionales(prepararCondicionales(content), conValoresDeSchema(fields, content), warnings);
}

/** Un IF (o un «{{IF » que no llega a serlo, `cond: null`) con su ENDIF (-1 si no lo tiene) y los bloques de dentro. */
interface BloqueIf { ini: number; finTok: number; cond: string | null; cierreIni: number; cierreFin: number; hijos: BloqueIf[] }

/**
 * Lo de `processConditionals` que SÓLO depende del texto: normalizarlo y emparejar sus IF/ENDIF (10-nov-2026). Quien
 * evalúa el mismo texto con muchos juegos de valores (`resolverDeclarados`: hasta 4 vueltas por llamada, y una llamada
 * por cada cambio de valores en Redactor) lo prepara una vez y lo guarda.
 */
export interface CondicionalesPreparadas { texto: string; raiz: BloqueIf[] | null }
export function prepararCondicionales(content: string): CondicionalesPreparadas {
  // Phase 4: pre-normalize legacy forms so a single regex handles all cases.
  const texto = normalizeConditionals(content);
  return { texto, raiz: texto.includes("{{IF") ? emparejarIfs(texto) : null };
}

function emparejarIfs(content: string): BloqueIf[] {
  // Las marcas que gobiernan el emparejamiento, como las ve la expresión regular de antes: un IF bien formado, un
  // «{{IF » que no llega a serlo (abre y nunca se resuelve) y un ENDIF.
  const raiz: BloqueIf[] = [];
  const pila: BloqueIf[] = [];
  const marca = /\{\{IF\s+([^}]+)\}\}|\{\{IF\s+|\{\{ENDIF\}\}/g;
  for (let m = marca.exec(content); m; m = marca.exec(content)) {
    if (m[0] === "{{ENDIF}}") {
      const b = pila.pop();
      if (b) { b.cierreIni = m.index; b.cierreFin = m.index + m[0].length; }
      continue;
    }
    const b: BloqueIf = { ini: m.index, finTok: m.index + m[0].length, cond: m[1] ?? null, cierreIni: -1, cierreFin: -1, hijos: [] };
    (pila.length ? pila[pila.length - 1].hijos : raiz).push(b);
    pila.push(b);
  }

  return raiz;
}

/** Evalúa unas condicionales ya preparadas con unos valores. Mismo resultado que `processConditionals`. */
export function resolverCondicionales(
  prep: CondicionalesPreparadas,
  fields: FieldValues,
  warnings?: ComposeWarning[],
): string {
  let content = prep.texto;
  if (!prep.raiz) return content;

  // LOS SET EN ORDEN DE DOCUMENTO (Carles, 10-nov-2026): un `{{SET X=v}}` de una rama viva cambia lo que ven los IF
  // que van DETRÁS. Las condiciones se deciden recorriendo el texto de arriba abajo (`decidir`), con una copia de los
  // valores a la que se aplican los SET según se encuentran; el texto se sigue resolviendo como antes, de dentro
  // afuera, con esas decisiones. Lo impreso no cambia: `processSets` sigue aplicando los SET vivos después.
  const vals: FieldValues = { ...fields };
  const { evalExpr } = crearEvaluador(vals, warnings);
  const MAX_VUELTAS = 50;
  let decision = decidir(content, prep.raiz);
  // Resolver un bloque puede FORMAR uno nuevo con lo que tenía al lado («{{» + «IF B}}…» que deja un bloque resuelto):
  // la expresión regular lo veía en la vuelta siguiente. Se repite la pasada mientras cambie algo, con lo que quede de
  // las 50 vueltas; en una plantilla normal la segunda no encuentra nada y sale enseguida.
  let usadas = 0;
  let raiz: BloqueIf[] = prep.raiz;
  for (;;) {
    const r = unaPasada(content, raiz, MAX_VUELTAS - usadas);
    if (r.texto === content) break;
    content = r.texto;
    usadas += r.vueltas;
    if (usadas >= MAX_VUELTAS || !content.includes("{{IF")) break;
    raiz = emparejarIfs(content);
    for (const k of Object.keys(vals)) delete vals[k];
    Object.assign(vals, fields);
    decision = decidir(content, raiz);
  }

  if (warnings && usadas >= MAX_VUELTAS && content.includes("{{IF")) {
    warnings.push({
      code: "W100",
      message:
        "processConditionals reached max_iterations=50; unresolved {{IF ...}} / {{ENDIF}} blocks remain — likely a malformed or deeply nested conditional.",
      iteration: usadas,
    });
  }
  return content;

  function unaPasada(content: string, raiz: BloqueIf[], MAX_VUELTAS: number): { texto: string; vueltas: number } {
  let vueltas = 0;
  const quedaMarca = /\{\{IF\s+|\{\{ENDIF\}\}/;
  /** El tramo [desde, hasta) con sus bloques resueltos; `vuelta` = la del más profundo; `ok` = todos resueltos. */
  const tramo = (desde: number, hasta: number, hijos: BloqueIf[]): { texto: string; vuelta: number; ok: boolean } => {
    let texto = "";
    let vuelta = 0;
    let ok = true;
    let pos = desde;
    for (const h of hijos) {
      texto += content.slice(pos, h.ini);
      const r = bloque(h);
      texto += r.texto;
      vuelta = Math.max(vuelta, r.vuelta);
      ok = ok && r.ok;
      pos = h.cierreFin >= 0 ? h.cierreFin : hasta;
    }
    return { texto: texto + content.slice(pos, hasta), vuelta, ok };
  };
  const bloque = (b: BloqueIf): { texto: string; vuelta: number; ok: boolean } => {
    const cerrado = b.cierreIni >= 0;
    const cuerpo = tramo(b.finTok, cerrado ? b.cierreIni : content.length, b.hijos);
    const literal = () => ({
      texto: content.slice(b.ini, b.finTok) + cuerpo.texto + (cerrado ? "{{ENDIF}}" : ""), vuelta: cuerpo.vuelta, ok: false,
    });
    if (b.cond === null || !cerrado || !cuerpo.ok) return literal();
    const vuelta = cuerpo.vuelta + 1;
    if (vuelta > MAX_VUELTAS || quedaMarca.test(cuerpo.texto)) return literal();
    vueltas = Math.max(vueltas, vuelta);
    const corte = cuerpo.texto.indexOf("{{ELSE}}");
    const si = corte < 0 ? cuerpo.texto : cuerpo.texto.slice(0, corte);
    const no = corte < 0 ? "" : cuerpo.texto.slice(corte + "{{ELSE}}".length);
    return { texto: (decision.get(b) ?? evalExpr(b.cond.trim())) ? si : no, vuelta, ok: true };
  };
  return { texto: tramo(0, content.length, raiz).texto, vueltas };
  }

  /**
   * Decide cada IF al que se llega en orden de documento, con los SET vivos de antes aplicados a `vals`. Un IF que no
   * se resolverá (mal formado, sin ENDIF, o con un hijo así) queda literal con sus dos ramas, y sus SET cuentan, como
   * en lo impreso. Los IF de una rama muerta no se deciden: su texto se descarta.
   */
  function decidir(content: string, raiz: BloqueIf[]): Map<BloqueIf, boolean> {
    const out = new Map<BloqueIf, boolean>();
    const resoluble = new Map<BloqueIf, number>(); // la vuelta en que se resuelve; 0 = nunca
    const vuelta = (b: BloqueIf): number => {
      const hecho = resoluble.get(b);
      if (hecho !== undefined) return hecho;
      let max = 0;
      let ok = b.cond !== null && b.cierreIni >= 0;
      for (const h of b.hijos) { const v = vuelta(h); if (!v) ok = false; max = Math.max(max, v); }
      const r = ok && max + 1 <= MAX_VUELTAS ? max + 1 : 0;
      resoluble.set(b, r);
      return r;
    };
    const asignar = (texto: string): void => {
      if (!texto.includes("SET")) return;
      for (const m of texto.matchAll(SET_PATRON)) {
        const v = m[2] !== undefined ? m[2] : (m[3] || "").trim();
        vals[m[1]] = v;
        vals[m[1].toUpperCase()] = v;
      }
    };
    const recorrer = (desde: number, hasta: number, hijos: BloqueIf[]): void => {
      let pos = desde;
      for (const h of hijos) {
        if (h.ini < desde || h.ini >= hasta) continue;
        asignar(content.slice(pos, h.ini));
        entrar(h);
        pos = h.cierreFin >= 0 ? h.cierreFin : hasta;
      }
      if (pos < hasta) asignar(content.slice(pos, hasta));
    };
    const entrar = (b: BloqueIf): void => {
      const fin = b.cierreIni >= 0 ? b.cierreIni : content.length;
      if (!vuelta(b)) { recorrer(b.finTok, fin, b.hijos); return; }
      const si = evalExpr(b.cond!.trim());
      out.set(b, si);
      // El ELSE de este bloque: el primero de su cuerpo que no está dentro de un hijo.
      let corte = -1;
      for (let p = content.indexOf("{{ELSE}}", b.finTok); p >= 0 && p < fin; p = content.indexOf("{{ELSE}}", p + 1)) {
        if (!b.hijos.some((h) => p >= h.ini && p < h.cierreFin)) { corte = p; break; }
      }
      if (si) recorrer(b.finTok, corte < 0 ? fin : corte, b.hijos);
      else if (corte >= 0) recorrer(corte + "{{ELSE}}".length, fin, b.hijos);
    };
    recorrer(0, content.length, raiz);
    return out;
  }
}

/** `{{SET NOMBRE=valor}}` / `{{SET NOMBRE="valor"}}`: el mismo patrón que `processSets`. */
const SET_PATRON = /\{\{\s*SET\s+([\wÀ-ɏ]+)\s*=\s*(?:"([^"]*)"|([^}]+?))\s*\}\}/gi;

/** El texto sin comentarios ni directivas (un `// {{SET …}}` no asigna), con sus IF emparejados; uno por texto. */
const ASIGNACIONES = new Map<string, CondicionalesPreparadas>();
function preparacionDeAsignaciones(texto: string): CondicionalesPreparadas {
  const hecha = ASIGNACIONES.get(texto);
  if (hecha) return hecha;
  const r = prepararCondicionales(stripDirectives(texto));
  if (ASIGNACIONES.size >= 8) ASIGNACIONES.delete(ASIGNACIONES.keys().next().value!);
  ASIGNACIONES.set(texto, r);
  return r;
}

/**
 * Lo que dejan los SET con lo que se sabe hasta ahora, para quien pregunta antes de componer (Redactor, 10-nov-2026).
 * Se recorre el texto en orden de documento como `resolverCondicionales`, pero con tres valores (`condicionTriestado`):
 *   · un SET en una rama que se toma seguro da su valor (el último gana);
 *   · un SET en una rama de un IF aún sin decidir deja su campo INCIERTO: depende de lo que falta por contestar, y
 *     no hay que preguntarlo — se sabrá al contestar esa condición;
 *   · un IF que lee un campo incierto tampoco se decide.
 * `desconocido(campo)` dice qué campos están por contestar. Devuelve los valores ciertos, en mayúsculas, y los inciertos.
 */
export function asignacionesEnOrden(
  texto: string,
  fields: FieldValues,
  desconocido: (campo: string) => boolean,
): { valores: Record<string, string>; inciertos: Set<string> } {
  const valores: Record<string, string> = {};
  const inciertos = new Set<string>();
  if (!/\{\{\s*SET\s/i.test(texto)) return { valores, inciertos };
  const prep = preparacionDeAsignaciones(texto);
  const content = prep.texto;
  const vals: FieldValues = { ...fields };
  const asignar = (tramo: string, seguro: boolean): void => {
    if (!tramo.includes("SET")) return;
    for (const m of tramo.matchAll(SET_PATRON)) {
      const n = m[1].toUpperCase();
      if (!seguro) { inciertos.add(n); delete valores[n]; delete vals[m[1]]; delete vals[n]; continue; }
      const v = m[2] !== undefined ? m[2] : (m[3] || "").trim();
      valores[n] = v;
      inciertos.delete(n);
      vals[m[1]] = v;
      vals[n] = v;
    }
  };
  const recorrer = (desde: number, hasta: number, hijos: BloqueIf[], seguro: boolean): void => {
    let pos = desde;
    for (const h of hijos) {
      if (h.ini < desde || h.ini >= hasta) continue;
      asignar(content.slice(pos, h.ini), seguro);
      entrar(h, seguro);
      pos = h.cierreFin >= 0 ? h.cierreFin : hasta;
    }
    if (pos < hasta) asignar(content.slice(pos, hasta), seguro);
  };
  const entrar = (b: BloqueIf, seguro: boolean): void => {
    const fin = b.cierreIni >= 0 ? b.cierreIni : content.length;
    // Mal formado o sin cerrar: el motor lo deja literal con sus dos ramas, y sus SET valen.
    if (b.cond === null || b.cierreIni < 0) { recorrer(b.finTok, fin, b.hijos, seguro); return; }
    let corte = -1;
    for (let p = content.indexOf("{{ELSE}}", b.finTok); p >= 0 && p < fin; p = content.indexOf("{{ELSE}}", p + 1)) {
      if (!b.hijos.some((h) => p >= h.ini && p < h.cierreFin)) { corte = p; break; }
    }
    const r = seguro ? condicionTriestado(b.cond.trim(), vals, (c) => desconocido(c) || inciertos.has(c.toUpperCase())) : { valor: null };
    const rama = (si: boolean, conSeguro: boolean) => {
      if (si) recorrer(b.finTok, corte < 0 ? fin : corte, b.hijos, conSeguro);
      else if (corte >= 0) recorrer(corte + "{{ELSE}}".length, fin, b.hijos, conSeguro);
    };
    if (r.valor === null) { rama(true, false); rama(false, false); }
    else rama(r.valor, true);
  };
  if (prep.raiz) recorrer(0, content.length, prep.raiz, true);
  else asignar(content, true);
  return { valores, inciertos };
}

/**
 * Los campos que el texto sólo declara con valor fijo (`DECLARE X = v`, ni `DECLARE_UNDEF` ni pregunta): constantes de
 * la plantilla. Desde que un DECLARE en una rama que no se toma no cuenta (0.1.42), una constante puede quedarse sin
 * valor; para el motor eso es lo mismo que su valor falso, pero no es una pregunta y quien pregunta no debe hacerla.
 */
export function constantesFijas(texto: string): Set<string> {
  const todas = new Map<string, number>();
  for (const m of texto.matchAll(/\{\{DECLARE(?:_UNDEF)?\s+(?:ARRAY\s+)?([\wÀ-ɏ]+)/gi)) {
    const n = m[1].toUpperCase();
    todas.set(n, (todas.get(n) ?? 0) + 1);
  }
  const fijas = new Map<string, number>();
  for (const d of declaracionesFijas(texto).decls) {
    if (d.soloSiIndefinido) continue;
    const n = d.nombre.toUpperCase();
    fijas.set(n, (fijas.get(n) ?? 0) + 1);
  }
  return new Set([...fijas].filter(([n, k]) => todas.get(n) === k).map(([n]) => n));
}

// =============================================================================
// expandForEach (Phase 3.2 — re-evaluates conditionals per iteration)
// =============================================================================

export function expandForEach(
  content: string,
  fields: FieldValues,
  warnings?: ComposeWarning[],
  idioma: string = DEFAULT_LOCALE,
): string {
  // ⚠️ PARCHE A MANO (5-oct-2026) — reescrito. Antes era una regex perezosa:
  // emparejaba el primer FOR con el primer ENDFOR (el del bucle INTERIOR), no
  // reconocía `IN ITEM.ANEJOS` (el punto no entraba en el nombre) y dejaba un
  // ENDFOR suelto que, con IF alrededor, se comía texto. Ahora se empareja por
  // profundidad y cada bucle interior se expande DENTRO del ámbito de su
  // elemento, antes de sustituir los `{{ITEM.X}}` del exterior —si no, el
  // ITEM interior se pisaba con los valores del exterior.
  const TOKEN = /\{\{(?:FOR\s+EACH\s+([\w\u00C0-\u024F]+)\s+IN\s+([\w.\u00C0-\u024F]+)(\|ENUM)?|(ENDFOR|END[\s_]+FOR))\}\}/gi;
  const MAX_PROFUNDIDAD = 20;

  const expandir = (texto: string, scope: FieldValues, prof: number): string => {
    if (prof > MAX_PROFUNDIDAD) {
      warnings?.push({ code: "W101", message: `FOR EACH anidado más de ${MAX_PROFUNDIDAD} niveles; se deja sin expandir.`, iteration: prof });
      return texto;
    }
    let out = "";
    let cursor = 0;
    TOKEN.lastIndex = 0;
    const tokens = [...texto.matchAll(TOKEN)];
    let k = 0;
    while (k < tokens.length) {
      const t = tokens[k];
      if (!t[1]) { k++; continue; }            // ENDFOR suelto a este nivel: se deja
      // Buscar su ENDFOR por profundidad.
      let depth = 0; let cierre = -1;
      for (let q = k; q < tokens.length; q++) {
        if (tokens[q][1]) depth++; else { depth--; if (depth === 0) { cierre = q; break; } }
      }
      if (cierre < 0) {
        warnings?.push({ code: "W101", message: `{{FOR EACH ${t[1]} IN ${t[2]}}} sin ENDFOR; se deja sin expandir.`, iteration: prof });
        break;
      }
      const ini = t.index!; const finApertura = ini + t[0].length;
      const cierreTok = tokens[cierre]; const finCierre = cierreTok.index! + cierreTok[0].length;
      const cuerpo = texto.slice(finApertura, cierreTok.index!);
      out += texto.slice(cursor, ini) + expandirBloque(t[1], t[2], cuerpo, scope, prof, Boolean(t[3]));
      cursor = finCierre;
      k = cierre + 1;
    }
    return out + texto.slice(cursor);
  };

  const expandirBloque = (iteratorName: string, arrayName: string, body: string, scope: FieldValues, prof: number, enumerar = false): string => {
    const itUpper = iteratorName.toUpperCase();
    const arrayValue = scope[arrayName.toUpperCase()];
    if (!Array.isArray(arrayValue)) return "";
    const parts: string[] = [];
    for (const element of arrayValue as unknown[]) {
      // Ámbito de la iteración: lo de fuera + ITERADOR + ITERADOR.SUB. Un
      // iterador interior con el mismo nombre sombrea al exterior.
      const iterScope: FieldValues = { ...scope };
      for (const key of Object.keys(iterScope)) if (key.startsWith(itUpper + ".")) delete iterScope[key];
      const upperEl: Record<string, unknown> = {};
      if (element !== null && typeof element === "object" && !Array.isArray(element)) {
        // Aplanado: `{{ITEM.LINDEROS.FRENTE}}` también se resuelve.
        Object.assign(upperEl, aplanar(element as Record<string, unknown>));
        iterScope[itUpper] = String(element);
        for (const [subKey, subValue] of Object.entries(upperEl)) iterScope[`${itUpper}.${subKey}`] = subValue as never;
      } else {
        iterScope[itUpper] = String(element);
      }
      // 0) párrafos vinculados a este iterador: sus campos son los del elemento;
      const nombresElemento = new Set(Object.keys(upperEl).filter((k) => !k.includes(".")));
      // 1) bucles interiores, con el ámbito de este elemento;
      let elementContent = expandir(vincularAlElemento(body, itUpper, nombresElemento), iterScope, prof + 1);
      // 2) condicionales (Phase 3.2: ven el valor de este elemento);
      elementContent = processConditionals(elementContent, iterScope, warnings);
      // 3) sustitución de {{ITEM.SUB}} y {{ITEM}}.
      for (const [subKey, subValue] of Object.entries(upperEl).sort((x, y) => y[0].length - x[0].length)) {
        if (subValue !== null && typeof subValue === "object") continue;
        const subPat = new RegExp("\\{\\{\\s*" + escapeRe(itUpper) + "\\." + escapeRe(subKey) + "\\s*(?:#([^}]*))?\\}\\}", "gi");
        elementContent = elementContent.replace(subPat, (_m: string, f?: string) => conFormato(subValue, f, idioma, warnings));
      }
      // 4) la pista de una concordancia del elemento (`AUTO(ITEM.NOMBRE)`) pasa a ser su valor, como pista literal
      //    (`AUTO("Inés")`): la concordancia se resuelve después de componer, cuando ya no se sabe de qué elemento era.
      elementContent = elementContent.replace(
        new RegExp("(\\{\\{\\s*AUTO\\s*\\(\\s*)" + escapeRe(itUpper) + "\\.([\\w\\u00C0-\\u024F.]+)(\\s*\\))", "gi"),
        (m: string, ini: string, sub: string, fin: string) => {
          const v = upperEl[sub.toUpperCase()];
          if (v === undefined || v === null || typeof v === "object" || String(v).trim() === "") return m;
          return `${ini}"${String(v).replace(/["(){}|:]/g, " ").trim()}"${fin}`;
        });
      const itemPat = new RegExp("\\{\\{\\s*" + escapeRe(itUpper) + "\\s*(?:#([^}]*))?\\}\\}", "gi");
      elementContent = elementContent.replace(itemPat, (_m: string, f?: string) => conFormato(element, f, idioma, warnings));
      parts.push(elementContent);
    }
    // `IN LISTA|ENUM`: enumeración en prosa —«A, B y C»—. Lo usaban las
    // cancelaciones para los solicitantes; sin esto salían pegados.
    if (enumerar) {
      const items = parts.map((x) => x.trim()).filter(Boolean);
      return items.length <= 1 ? (items[0] ?? "") : items.slice(0, -1).join(", ") + " y " + items[items.length - 1];
    }
    return parts.join("");
  };

  return expandir(content, fields, 0);
}

// Sentinels wrapping each inlined include's body. The editor's
// `expandAllIncludes` writes these around every resolved
// `{{INCLUDE …}}` so the compose pipeline can locate each
// include's scope and truncate at its `{{EXIT_INCLUDE}}`. ASCII
// control bytes — never in user-authored text, survive every
// other transform (parser only matches `{{…}}`).
export const INC_BEGIN_MARK = "\x00INC_BEGIN\x00";
// ⚠️ PARCHE A MANO (5-oct-2026): vinculación de un párrafo a un elemento de
// lista. `{{INCLUDE X(ITEM)}}` y `{{INCLUDE X FIELDS:(ITEM)}}` —las dos formas
// que usa la biblioteca— querían decir «los campos de X son los del elemento de
// esta vuelta». El expansor envuelve el cuerpo con estas marcas y
// `expandForEach` reescribe, dentro, `{{CAMPO}}` → `{{ITEM.CAMPO}}` para los
// campos que el elemento trae; los demás siguen siendo globales.
export const BIND_END_MARK = "\x00/BIND\x00";
export const bindBeginMark = (iterador: string): string => `\x00BIND:${iterador.toUpperCase()}\x00`;
const RE_BIND = /\x00BIND:([\w\u00C0-\u024F]+)\x00([\s\S]*?)\x00\/BIND\x00/g;

/** Quita las marcas de vinculación que hayan quedado fuera de un bucle. */
export function stripBindMarks(content: string): string {
  return content.replace(/\x00BIND:[\w\u00C0-\u024F]+\x00/g, "").split(BIND_END_MARK).join("");
}

const DIRECTIVAS_NO_CAMPO = /^\s*(?:DECLARE|COMMENT|INCLUDE|TAGS|SUMMARY|SCHEMA_ACT|SCHEMA\s*:|BLOQUEO\s*:|DEPENDENCY|MAP_IUI|HUMAN_ACTION|END_HUMAN_ACTION|LANG|WORD_STYLE|@autonumber|AUTO[:(]|SYSTEM:|FOR\s+EACH|ENDFOR|END[\s_]+FOR|EXIT_INCLUDE)/i;

/** Dentro de las regiones vinculadas a `iterador`, `NOMBRE` → `ITERADOR.NOMBRE`
 *  para los nombres que trae el elemento. Respeta comillas. */
function vincularAlElemento(texto: string, iterador: string, nombres: Set<string>): string {
  const it = iterador.toUpperCase();
  if (nombres.size === 0) return texto.replace(RE_BIND, (m, n: string, cuerpo: string) => (n.toUpperCase() === it ? cuerpo : m));
  return texto.replace(RE_BIND, (m, n: string, cuerpo: string) => {
    if (n.toUpperCase() !== it) return m;
    return cuerpo.replace(/\{\{([^{}]*)\}\}/g, (tok, dentro: string) => {
      // La pista de una concordancia (`AUTO(COMP_PF_NOMBRE):soltero|soltera`) también es del elemento: sin esto la
      // concordancia buscaba después el campo suelto, que en una lista es de otra persona o no existe.
      const auto = dentro.match(/^(\s*AUTO\s*\(\s*)([A-Za-z_][\w\u00C0-\u024F]*)(\s*\)[\s\S]*)$/i);
      if (auto && nombres.has(auto[2].toUpperCase())) return `{{${auto[1]}${it}.${auto[2]}${auto[3]}}}`;
      if (DIRECTIVAS_NO_CAMPO.test(dentro)) return tok;
      // separar literales entre comillas para no tocarlos
      const trozos = dentro.split(/("[^"]*"|'[^']*'|\u201c[^\u201d]*\u201d|\u00ab[^\u00bb]*\u00bb)/);
      const nuevo = trozos.map((t, i) => (i % 2 === 1 ? t : t.replace(/(^|[^\w.@])([A-Za-z_][\w\u00C0-\u024F]*)(?![\w.(])/g,
        (x, pre: string, nom: string) => (nombres.has(nom.toUpperCase()) ? `${pre}${it}.${nom}` : x)))).join("");
      return `{{${nuevo}}}`;
    });
  });
}

/** Aplana un objeto anidado: {LINDEROS:{FRENTE:'x'}} → {'LINDEROS.FRENTE':'x', LINDEROS: …}. */
function aplanar(obj: Record<string, unknown>, prefijo = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const clave = prefijo + k.toUpperCase();
    out[clave] = v;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) aplanar(v as Record<string, unknown>, clave + ".", out);
  }
  return out;
}
export const INC_END_MARK = "\x00INC_END\x00";

/**
 * Truncate each include's body at its first `{{EXIT_INCLUDE}}`.
 * Mirror of `composer.process_exit_includes` in the Python package.
 *
 * Walks innermost pair first (lastIndexOf → matching indexOf), so
 * nested includes are processed before their parents. Strips the
 * sentinels regardless of EXIT_INCLUDE presence — callers without
 * sentinels (tests, FastAPI, the CLI) get a clean no-op.
 *
 * A trailing pass removes any stray `{{EXIT_INCLUDE}}` left at
 * master level — the directive is meaningful only inside an
 * included paragraph; outside, it's a no-op per the syntax docs.
 */
export function processExitIncludes(content: string): string {
  while (true) {
    const begin = content.lastIndexOf(INC_BEGIN_MARK);
    if (begin < 0) break;
    const end = content.indexOf(INC_END_MARK, begin + INC_BEGIN_MARK.length);
    if (end < 0) {
      // Unbalanced — strip orphan opener(s) and bail.
      content = content.split(INC_BEGIN_MARK).join("");
      break;
    }
    let inner = content.slice(begin + INC_BEGIN_MARK.length, end);
    // The editor injects a single helper `\n` right after
    // INC_BEGIN so the include's first line is at column 0
    // (needed for stripDirectives' line-anchored regexes —
    // `// comments`, the `^…\n` DECLARE pass, etc.). Strip it
    // here, otherwise we leak an extra blank line into output.
    if (inner.startsWith("\n")) inner = inner.slice(1);
    const m = inner.match(/\{\{\s*EXIT_INCLUDE\s*\}\}/i);
    if (m) {
      inner = inner.slice(0, m.index!).replace(/\s+$/, "");
    }
    content = content.slice(0, begin) + inner + content.slice(end + INC_END_MARK.length);
  }
  // ⚠️ PARCHE A MANO (6-oct-2026): también los CIERRES huérfanos. Un INCLUDE que abre dentro de
  // un IF descartado y cierra fuera deja su `INC_END` sin pareja; quedaba en la salida, y sus
  // `\x00` hacían inválido el XML del .docx (medido con la donación 0701: Word/LibreOffice no
  // lo abrían).
  content = content.split(INC_END_MARK).join("");
  return content.replace(/\{\{\s*EXIT_INCLUDE\s*\}\}/gi, "");
}

// =============================================================================
// processSets — apply {{SET NAME=value}} assignments in document order
// (mirror of composer.process_sets in the Python package). Runs AFTER
// conditionals so SETs in dead branches don't leak, and BEFORE
// substitution so assigned values are visible.
// =============================================================================

export function processSets(
  content: string,
  fields: FieldValues,
): { content: string; fields: FieldValues } {
  const pattern = /\{\{\s*SET\s+([\w\u00C0-\u024F]+)\s*=\s*(?:"([^"]*)"|([^}]+?))\s*\}\}/gi;
  const out = content.replace(pattern, (_m: string, name: string, qVal: string | undefined, bareVal: string | undefined): string => {
    const value = qVal !== undefined ? qVal : (bareVal || "").trim();
    // Mutate the working dict — both the original key and uppercase
    // variant so case-insensitive lookups in substituteFields hit.
    fields[name] = value;
    fields[name.toUpperCase()] = value;
    return "";
  });
  return { content: out, fields };
}

// =============================================================================
// processAutonumbers — resolve {{@autonumber:tipo[:fmt]}} sequentially.
// Mirror of composer.process_autonumbers in the Python package.
// Counters are local to each call (no state leaks between composes).
// =============================================================================

const SPANISH_ORDINALS = [
  "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA",
  "SEXTA", "S\u00c9PTIMA", "OCTAVA", "NOVENA", "D\u00c9CIMA",
  "UND\u00c9CIMA", "DUOD\u00c9CIMA", "DECIMOTERCERA", "DECIMOCUARTA", "DECIMOQUINTA",
  "DECIMOSEXTA", "DECIMOS\u00c9PTIMA", "DECIMOCTAVA", "DECIMONOVENA", "VIG\u00c9SIMA",
];

function autonumberSpanishOrdinal(num: number): string {
  if (num >= 1 && num <= SPANISH_ORDINALS.length) return SPANISH_ORDINALS[num - 1];
  return `${num}\u00aa`;
}

function autonumberUppercaseLetter(num: number): string {
  if (num <= 0) return "";
  if (num <= 26) return String.fromCharCode("A".charCodeAt(0) + num - 1);
  const first = String.fromCharCode("A".charCodeAt(0) + Math.floor((num - 1) / 26) - 1);
  const second = String.fromCharCode("A".charCodeAt(0) + ((num - 1) % 26));
  return first + second;
}

function autonumberRoman(num: number): string {
  if (num <= 0) return "";
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const symbols = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  const out: string[] = [];
  let n = num;
  for (let i = 0; i < values.length; i++) {
    const count = Math.floor(n / values[i]);
    if (count > 0) {
      out.push(symbols[i].repeat(count));
      n -= values[i] * count;
    }
  }
  return out.join("");
}

// ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
// Modificadores de caja admitidos como TERCER segmento del autonumber.
const AUTONUMBER_CAJA: Record<string, (s: string) => string> = {
  uppercase: (s) => s.toUpperCase(),
  lowercase: (s) => s.toLowerCase(),
};

export function processAutonumbers(content: string): string {
  const counters: Record<string, number> = {};
  const hierarchical: Record<string, Record<string, number>> = {};
  const knownFormats = new Set(["ordinal", "alpha", "roman", "reset"]);

  return content.replace(
    // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
    // El TERCER segmento. Sin él, `{{@autonumber:OTORG:ordinal:uppercase}}` no
    // casaba y la directiva **se quedaba literal en la escritura final** — lo
    // destapó la rodaja de la fusión, al ver `{{@autonumber:…}}` dentro del
    // `.docx` generado. Son 4 casos en 3 ficheros de `_PROD`, y no daban ningún
    // aviso: el campo no existe, así que nadie lo echaba de menos.
    /\{\{@autonumber:([\w\u00C0-\u024F]+)(?::([\w\u00C0-\u024F]+))?(?::([\w\u00C0-\u024F]+))?\}\}/g,
    (_m: string, counterType: string, formatType: string | undefined, caseType?: string): string => {
      // La caja se aplica al resultado, sea cual sea la rama.
      const caja = (s: string) =>
        caseType && AUTONUMBER_CAJA[caseType.toLowerCase()]
          ? AUTONUMBER_CAJA[caseType.toLowerCase()](s)
          : s;
      if (formatType === "reset") {
        counters[counterType] = 0;
        delete hierarchical[counterType];
        return "";
      }
      if (formatType && !knownFormats.has(formatType)) {
        // Hierarchical: parent.child
        if (!hierarchical[counterType]) hierarchical[counterType] = {};
        hierarchical[counterType][formatType] =
          (hierarchical[counterType][formatType] || 0) + 1;
        const parentNum = counters[counterType] || 0;
        const childNum = hierarchical[counterType][formatType];
        return caja(`${parentNum}.${childNum}`);
      }
      counters[counterType] = (counters[counterType] || 0) + 1;
      const current = counters[counterType];
      delete hierarchical[counterType];
      if (formatType === "ordinal") return caja(autonumberSpanishOrdinal(current));
      if (formatType === "alpha") return caja(autonumberUppercaseLetter(current));
      if (formatType === "roman") return caja(autonumberRoman(current));
      return caja(String(current));
    },
  );
}

// =============================================================================
// substituteCount
// =============================================================================

export function substituteCount(content: string, fields: FieldValues): string {
  const pattern = /\{\{\s*COUNT\s*\(\s*([\w\u00C0-\u024F]+)\s*\)\s*\}\}/gi;
  return content.replace(pattern, (_m: string, arrayName: string): string => {
    const value = fields[arrayName.toUpperCase()];
    return Array.isArray(value) ? String(value.length) : "0";
  });
}

// =============================================================================
// substituteFields
// =============================================================================

/**
 * El valor de un campo con los formatos de salida de su referencia (`{{PRECIO#amount}}`), en el
 * idioma de la plantilla. Ver `src/format/formats.ts`. Un formato que no se puede aplicar deja el
 * valor tal cual y lo avisa (W110).
 */
function conFormato(valor: unknown, formatos: string | undefined, idioma: string, warnings?: ComposeWarning[]): string {
  const v = String(valor);
  if (!formatos || !formatos.trim()) return v;
  const r = aplicarFormatos(v, partirFormatos("#" + formatos).formatos, idioma);
  if (r.problema) warnings?.push({ code: "W110", message: r.problema, iteration: 0 });
  return r.texto;
}

export function substituteFields(
  content: string,
  fields: FieldValues,
  idioma: string = DEFAULT_LOCALE,
  warnings?: ComposeWarning[],
): string {
  // First pass: substitute every known field — {{FIELD}}, {{FIELD:[instruction]}} and, with
  // output formats, {{FIELD#amount}} / {{FIELD:[instruction]#amount}}.
  for (const [field, value] of Object.entries(fields)) {
    if (!field) continue;
    const escaped = escapeRe(field);
    content = content.replace(
      new RegExp("\\{\\{\\s*" + escaped + "\\s*(?::\\[[^\\]]+\\]\\s*)?(?:#([^}]*))?\\}\\}", "g"),
      (_m: string, formatos?: string) => conFormato(value, formatos, idioma, warnings),
    );
  }

  // Second pass: handle remaining {{...}} patterns
  const fieldPat = /\{\{([^}]+)\}\}/g;
  return content.replace(fieldPat, (_m: string, fieldContent: string): string => {
    fieldContent = fieldContent.trim();

    // Leave autonumber patterns for post-processing
    if (fieldContent.startsWith("@autonumber:")) return _m;

    // Leave AUTO directives for LLM resolver
    const upper = fieldContent.toUpperCase();
    if (upper.startsWith("AUTO:") || upper.startsWith("AUTO(")) return _m;

    // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
    // El salto de página (D23) es la ÚNICA directiva que sobrevive intacta a
    // `compose`: el motor devuelve markdown y es la fusión quien la traduce a
    // `<w:br w:type="page"/>`. Sin esto caía en el `[NO DISPONIBLE]` de abajo.
    if (esPageBreak(fieldContent)) return _m;
    // Igual que el salto de página: sobrevive al markdown y la traduce la
    // fusión, que es la única que sabe de estilos de Word.
    if (esWordStyle(fieldContent)) return _m;

    // SYSTEM:NAME — substitute by the underlying NAME field. SYSTEM:
    // is a metadata namespace at the language level but a substitutable
    // value at compose time (the editor's wizard collects it).
    if (upper.startsWith("SYSTEM:")) {
      const { nombre, formatos } = partirFormatos(fieldContent.slice(7));
      const name = nombre.trim();
      const val = fields[name] ?? fields[name.toUpperCase()];
      if (val !== undefined && val !== null && String(val) !== "") return conFormato(val, formatos.join("#"), idioma, warnings);
      return "[NO DISPONIBLE]";
    }

    // Metadata/directive patterns → remove
    if (isMetadataField(fieldContent)) return "";

    return "[NO DISPONIBLE]";
  });
}

// =============================================================================
// composeWithDiagnostics & compose (Phase 3 pipeline)
// =============================================================================

export function composeWithDiagnostics(
  template: string,
  fields: FieldValues,
  locale: string = DEFAULT_LOCALE,
): { text: string; warnings: ComposeWarning[]; bloqueos: string[] } {
  const warnings: ComposeWarning[] = [];
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py. Un texto que llegue sin expandir: una sola lengua, nunca
  // las dos con «[NO DISPONIBLE]» en medio (`lang-section.ts`).
  template = resolverSeccionesDeLengua(template, idiomaDePlantilla(template, locale.slice(0, 2).toLowerCase())).texto;

  // Step 1: Extract DECLARE fixed values (y los DECLARE_UNDEF que apliquen, ver `resolverDeclarados`)
  const allFields: FieldValues = { ...fields };
  const declareFixed = resolverDeclarados(template, fields, locale);
  Object.assign(allFields, declareFixed);

  // El idioma de la plantilla: lo usan los formatos de salida (`{{FECHA#date_words}}`).
  const idioma = idiomaDePlantilla(template, locale.slice(0, 2).toLowerCase());

  // Step 2: Normalize {{NAME:HELP/INPUT/[instr]}} → {{NAME}}
  let content = stripFieldSuffixes(template);

  // Step 2b: `{{BLOQUEO: …}}` → marca: las que sobrevivan a IF y FOR EACH son los bloqueos vivos (`bloqueos.ts`).
  const marcados = marcarBloqueos(content);
  content = marcados.texto;

  // Step 3: Strip metadata directives
  content = stripDirectives(content);

  // Step 4: Inject system fields (lower priority than user-provided values). Y ENCIMA, los metadatos del esquema
  // raíz (`SCHEMA:ACT`…): son constantes y ningún dato del caso los pisa. Si ya vienen (Redactor), se respetan.
  const merged: FieldValues = {
    ...getSystemFields(locale), ...allFields, ...(MARCA_SCHEMA in fields ? {} : valoresDeSchema(template, idioma)),
  };
  content = sustituirLecturasSchema(content, merged);

  // Step 5: Expand FOR EACH first. Each iteration re-runs
  // processConditionals on its own body with item subkeys in scope.
  content = stripBindMarks(expandForEach(content, merged, warnings, idioma));

  // Step 6: Resolve remaining (top-level) IF blocks
  content = processConditionals(content, merged, warnings);

  // Step 6b: Honour {{EXIT_INCLUDE}} per inlined include. Runs AFTER
  // processConditionals so an EXIT_INCLUDE inside a now-pruned IF
  // doesn't truncate. No-op when the input has no INC_BEGIN/END
  // sentinels (web previews, CLI, tests).
  content = processExitIncludes(content);

  // Step 7: Apply SET assignments in document order. Runs AFTER
  // conditionals so SETs in dead branches are dropped; BEFORE
  // substitution so assigned values are visible.
  content = processSets(content, merged).content;

  // Step 8: Replace COUNT() patterns
  content = substituteCount(content, merged);

  // Step 9: Substitute field values and clean up
  content = substituteFields(content, merged, idioma, warnings);

  // Step 10: Resolve {{@autonumber:...}} in document order, last so
  // the numbering reflects the final layout (after IFs prune,
  // FOR EACH expands, and substitutions land).
  content = processAutonumbers(content);

  const bloqueos = bloqueosVivos(content, marcados.textos);
  return { text: quitarMarcasDeBloqueo(content), warnings, bloqueos };
}

export function compose(
  template: string,
  fields: FieldValues,
  locale: string = DEFAULT_LOCALE,
): string {
  return composeWithDiagnostics(template, fields, locale).text;
}

// =============================================================================
// formatNotarial
// =============================================================================

export function formatNotarial(text: string, lineWidth = 80): string {
  return text.split("\n").map((line) => {
    if (line.length >= lineWidth) return line;
    return line + "-".repeat(lineWidth - line.length);
  }).join("\n");
}

// =============================================================================
// composeForPreview — like compose() but unfilled fields stay as {{FIELD}}
// instead of being replaced with [NO DISPONIBLE].
// =============================================================================

export function composeForPreview(
  template: string,
  fields: FieldValues,
  locale: string = DEFAULT_LOCALE,
  /**
   * Optional name of the wizard's *current* field. When given, the
   * substituted value of that field (and only that field) gets
   * wrapped with `\x01…\x02` sentinels so the editor can locate
   * the substitution position exactly without scanning the doc by
   * regex (which falsely matched every other "No"/"Sí"). The
   * sentinels are inserted ONLY at the substitution step — IF /
   * SET / COUNT all see the unwrapped value, so comparisons like
   * `{{IF X == "Persona Física Única"}}` still match.
   */
  highlightField?: string,
): string {
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py. Ver `composeWithDiagnostics`.
  template = resolverSeccionesDeLengua(template, idiomaDePlantilla(template, locale.slice(0, 2).toLowerCase())).texto;
  const allFields: FieldValues = { ...fields };
  const declareFixed = resolverDeclarados(template, fields, locale);
  Object.assign(allFields, declareFixed);

  // Phase 3 pipeline order, mirrored from compose():
  //   suffix-strip → metadata-strip → system fields → FOR EACH → IF → COUNT
  const idioma = idiomaDePlantilla(template, locale.slice(0, 2).toLowerCase());
  let content = stripFieldSuffixes(template);
  content = stripDirectives(content);
  const merged: FieldValues = {
    ...getSystemFields(locale), ...allFields, ...(MARCA_SCHEMA in fields ? {} : valoresDeSchema(template, idioma)),
  };
  content = sustituirLecturasSchema(content, merged);

  content = stripBindMarks(expandForEach(content, merged, undefined, idioma));
  content = processConditionals(content, merged);
  // Honour {{EXIT_INCLUDE}} per inlined include scope, after IFs
  // have run (so a conditional EXIT_INCLUDE only fires when its
  // branch survives). Also strips the INC_BEGIN/END sentinels
  // the editor injects around each `{{INCLUDE …}}` body — without
  // this they bleed through the preview as visible text.
  content = processExitIncludes(content);
  // Apply SET assignments AFTER conditionals (dead branches drop
  // their SETs) and BEFORE substitution (assigned values must be
  // visible). Mirrors compose()'s pipeline. processSets mutates
  // `merged` in place and returns the SET-stripped content.
  content = processSets(content, merged).content;
  content = substituteCount(content, merged);

  const highlightUpper = highlightField ? highlightField.toUpperCase() : "";
  const wrapForHighlight = (val: string, fieldUpper: string): string =>
    highlightUpper && fieldUpper === highlightUpper
      ? "\x01" + val + "\x02"
      : val;

  // Replace known fields, leave unknown ones as-is (don't emit [NO DISPONIBLE])
  const fieldPat = /\{\{([^}]+)\}\}/g;
  content = content.replace(fieldPat, (_m: string, fieldContent: string): string => {
    fieldContent = fieldContent.trim();
    // Autonumbers are resolved AFTER all field substitution so the
    // numbering reflects the final layout. Leave them literal here
    // — `processAutonumbers` (run below) does the substitution.
    if (fieldContent.startsWith("@autonumber:")) return _m;
    const upper = fieldContent.toUpperCase();
    if (upper.startsWith("AUTO:") || upper.startsWith("AUTO(")) return _m;
    // SYSTEM:NAME — substitute via the NAME field if filled; keep
    // the placeholder otherwise so the wizard sees it as pending.
    if (upper.startsWith("SYSTEM:")) {
      const name = fieldContent.slice(7).trim();
      const val = merged[name] ?? merged[name.toUpperCase()];
      if (val !== undefined && val !== null && String(val) !== "") {
        return wrapForHighlight(String(val), name.toUpperCase());
      }
      return _m;
    }
    if (isMetadataField(fieldContent)) return "";
    const { nombre, formatos } = partirFormatos(fieldContent);
    const campo = nombre.trim();
    const val = merged[campo] ?? merged[campo.toUpperCase()];
    if (val !== undefined && val !== null && String(val) !== "") {
      return wrapForHighlight(formatos.length ? aplicarFormatos(String(val), formatos, idioma).texto : String(val), campo.toUpperCase());
    }
    return _m;
  });

  // Resolve {{@autonumber:...}} sequentially — last so the numbering
  // reflects the final preview layout (after IFs prune & substitutions
  // land). On every keystroke the preview rebuilds from scratch, so
  // counters stay consistent without needing per-call reset logic.
  content = processAutonumbers(content);

  return content;
}
