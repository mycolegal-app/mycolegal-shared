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
  const condPrefixes = ["IF_", "ENDIF_", "ELSE_", "IF ", "ENDIF", "ELSE", "ELSEIF "];
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
  const out: string[] = [];
  let i = 0;
  const n = content.length;
  while (i < n) {
    if (content.substring(i, i + 2) !== "{{") {
      out.push(content[i]);
      i += 1;
      continue;
    }
    const m = /^\{\{([\w\u00C0-\u024F]+):/.exec(content.substring(i));
    if (!m) {
      out.push(content[i]);
      i += 1;
      continue;
    }
    const name = m[1];
    if (isMetadataField(name)) {
      out.push(content[i]);
      i += 1;
      continue;
    }
    const end = tryMatchDirectiveChain(content, i + m[0].length - 1);
    if (end === null) {
      out.push(content[i]);
      i += 1;
      continue;
    }
    out.push("{{" + name + "}}");
    i = end;
  }
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
  content = content.replace(/^[ \t]*\{\{DECLARE\s[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{DECLARE\s[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{TAGS:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{TAGS:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{SUMMARY:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{SUMMARY:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{\s*SCHEMA_ACT\s*:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{\s*SCHEMA_ACT\s*:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{COMMENT:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{COMMENT:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{DEPENDENCY:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{DEPENDENCY:[^}]*\}\}/gi, "");
  content = content.replace(/^[ \t]*\{\{MAP_IUI:[^}]*\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{MAP_IUI:[^}]*\}\}/gi, "");
  // 4. HUMAN_ACTION single-line variants
  content = content.replace(/^[ \t]*\{\{(?:HUMAN_ACTION|HUMAN_ACTION_PRE|HUMAN_ACTION_POST|END_HUMAN_ACTION)(?::[^}]*)?\}\}[ \t]*\n/gim, "");
  content = content.replace(/\{\{(?:HUMAN_ACTION|HUMAN_ACTION_PRE|HUMAN_ACTION_POST|END_HUMAN_ACTION)(?::[^}]*)?\}\}/gi, "");
  // 5. // line comments (whole line including trailing newline)
  content = content.replace(/^[ \t]*\/\/[^\n]*\n?/gm, "");
  return content;
}

// =============================================================================
// extractDeclareFixedValues
// =============================================================================

export function extractDeclareFixedValues(content: string): Record<string, string> {
  const fixed: Record<string, string> = {};
  // `:IUI(path)` (FASE 32 / A9) is XML-mapping metadata; drop it so
  // `{{DECLARE X="v":IUI(A/B)}}` still yields the fixed value `v`.
  content = content.replace(/:IUI\([^()]*\)/gi, "");
  const pattern =
    /\{\{DECLARE\s+([\w\u00C0-\u024F]+)(?:\s+AS\s+[\w\u00C0-\u024F]+)?\s*=\s*(?:"([^"]*)"|(\S+))\s*\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    const fieldName = m[1];
    const value = m[2] !== undefined ? m[2] : m[3];
    fixed[fieldName] = value;
  }
  return fixed;
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

function _renameIfBody(body: string, suffix: string): string {
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
    if (_IF_RESERVED.has(upper)) return token;
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

export function applyFieldSuffix(content: string, suffix: string): string {
  if (!suffix || !content) return content;
  return content.replace(/\{\{([^}]+)\}\}/g, (full, raw: string) => {
    const body = raw.trim();
    const upper = body.toUpperCase();

    if (upper.startsWith("SYSTEM:")) return full;
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
      upper.startsWith("AUTO:") || upper.startsWith("AUTO(") ||
      upper.startsWith("HUMAN_ACTION") || upper.startsWith("END_HUMAN_ACTION") ||
      upper.startsWith("EXIT_INCLUDE")
    ) return full;

    // FOR EACH ITEM IN ARRAY → rename ARRAY only
    let m = body.match(/^(FOR\s+EACH\s+[\w\u00C0-\u024F]+\s+IN\s+)([\w\u00C0-\u024F]+)(\s*)$/i);
    if (m) return `{{${m[1]}${m[2]}${suffix}${m[3]}}}`;

    if (/^(?:ENDFOR|END[\s_]+FOR)\s*$/i.test(body)) return full;

    // COUNT(ARRAY)
    m = body.match(/^(COUNT\s*\(\s*)([\w\u00C0-\u024F]+)(\s*\))\s*$/i);
    if (m) return `{{${m[1]}${m[2]}${suffix}${m[3]}}}`;

    // IF directive (named or spaced form)
    m = body.match(/^(IF[_\s]+)([\s\S]*)$/i);
    if (m) {
      const head = m[1];
      const rest = m[2];
      const newRest = _renameIfBody(rest, suffix);
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

    // DECLARE NAME ... (covers =val, AS TYPE, :INPUT(...), bare DECLARE)
    m = body.match(/^(DECLARE\s+)([\w\u00C0-\u024F]+)([\s\S]*)$/i);
    if (m) return `{{${m[1]}${m[2]}${suffix}${m[3]}}}`;

    // NAME:INPUT(...) / NAME:INPUT_FINAL(...)
    m = body.match(/^([\w\u00C0-\u024F]+)(:INPUT(?:_FINAL)?\()([\s\S]*)$/i);
    if (m) return `{{${m[1]}${suffix}${m[2]}${m[3]}}}`;

    // NAME:HELP(...)
    m = body.match(/^([\w\u00C0-\u024F]+)(:HELP\([\s\S]*\))\s*$/i);
    if (m) return `{{${m[1]}${suffix}${m[2]}}}`;

    // Bare placeholder {{NAME}} (allow dots) — strip operator tail (==, !=, :)
    m = body.match(/^([A-Za-z_][\w.\u00C0-\u024F]*)([\s\S]*)$/);
    if (m && (!m[2] || /^\s*[=!:]/.test(m[2]))) {
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
    /\{\{IF_((?:SYSTEM:)?[\w.\u00C0-\u024F]+)([^}]*)\}\}/gi,
    (_m: string, name: string, tail: string) => `{{IF ${name}${tail}}}`,
  );
  // ELSE_NAME / ELSE NAME → ELSE
  content = content.replace(/\{\{ELSE[_\s]+(?:SYSTEM:)?[\w.\u00C0-\u024F]+\s*\}\}/gi, "{{ELSE}}");
  // ENDIF_NAME / ENDIF NAME → ENDIF
  content = content.replace(/\{\{ENDIF[_\s]+(?:SYSTEM:)?[\w.\u00C0-\u024F]+\s*\}\}/gi, "{{ENDIF}}");
  return content;
}

// =============================================================================
// processConditionals
// =============================================================================

export function processConditionals(
  content: string,
  fields: FieldValues,
  warnings?: ComposeWarning[],
): string {
  // Phase 4: pre-normalize legacy forms so a single regex handles all cases.
  content = normalizeConditionals(content);

  // Innermost-first body: must not contain a nested {{IF }} opening or
  // a {{ENDIF}}. Negative lookahead at each char position lets the
  // engine match the innermost block before any outer wrapper.
  const standardPat = new RegExp(
    "\\{\\{IF\\s+([^}]+)\\}\\}" +
    "((?:(?!\\{\\{IF\\s+|\\{\\{ENDIF\\}\\}).)*?)" +
    "(?:\\{\\{ELSE\\}\\}((?:(?!\\{\\{IF\\s+|\\{\\{ENDIF\\}\\}).)*?))?" +
    "\\{\\{ENDIF\\}\\}",
    "gs",
  );

  // Quote- and paren-aware splitter — splits `expr` by `sep`
  // ("AND" or "OR") when it appears outside quoted strings / IN(...)
  // lists. Mirrors the validator's helper.
  const splitLogical = (expr: string, sep: string): string[] => {
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
  const QUOTE_PAIRS: Record<string, string> = {
    "'": "'",
    '"': '"',
    "\u201c": "\u201d",
    "\u00ab": "\u00bb",
  };
  const quoteCloses = (opener: string, c: string): boolean =>
    (QUOTE_PAIRS[opener] ?? opener) === c;

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
  // ¿Envuelve un único par de paréntesis la expresión ENTERA? `(A OR B)` sí;
  // `(A) AND (B)` no —el primer `(` cierra antes del final—. Consciente de
  // comillas, para no contar un paréntesis que va dentro de un valor.
  const envueltaEnParentesis = (e: string): boolean => {
    if (!e.startsWith("(") || !e.endsWith(")")) return false;
    let depth = 0;
    let quote: string | null = null;
    for (let i = 0; i < e.length; i++) {
      const c = e[i];
      if (quote !== null) { if (quoteCloses(quote, c)) quote = null; continue; }
      if ("'\"\u201c\u00ab".includes(c)) { quote = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0 && i < e.length - 1) return false; }
    }
    return depth === 0;
  };

  const evalExpr = (expr: string): boolean => {
    const e = expr.trim();
    if (!e) return false;
    const orParts = splitLogical(e, "OR");
    if (orParts.length > 1) return orParts.some((p) => evalExpr(p));
    const andParts = splitLogical(e, "AND");
    if (andParts.length > 1) return andParts.every((p) => evalExpr(p));
    // ⚠️ PARCHE A MANO (5-oct-2026). Sin esto un grupo `(…)` llegaba entero a
    // `evalAtom`, que buscaba un campo llamado `(A` y daba FALSO: las 483
    // condiciones con paréntesis de la biblioteca tomaban la rama equivocada.
    if (/^NOT\s*\(/i.test(e) || /^NOT\s+/i.test(e)) return !evalExpr(e.slice(3).trim());
    if (envueltaEnParentesis(e)) return evalExpr(e.slice(1, -1));
    return evalAtom(e);
  };

  const evalStandard = (
    _m: string,
    condition: string,
    trueContent: string,
    falseContent: string | undefined,
  ): string => {
    const fc = falseContent ?? "";
    return evalExpr(condition.trim()) ? trueContent : fc;
  };

  // Era 10, y **la biblioteca real anida más que eso**: medido el 4-oct-2026
  // sobre `0501_ESQUEMA_MAESTRO_VIVIENDA_PH`, sus condiciones llegan a **12
  // niveles** de anidamiento. Con el tope en 10, las ramas más profundas no se
  // resolvían nunca: el aviso `W100` que salía en cada composición no era
  // incidental, era estructural.
  //
  // Carles pidió «al menos 20», y **la medición dijo que 20 no llega**: con el
  // tope en 20, de los 105 esquemas 87 componen limpios y **18 siguen pasándose**
  // —anidan más de veinte niveles—. Así que 50.
  //
  // Un tope alto NO cuesta pasadas: el bucle sale por el `content === prev` en
  // cuanto no hay nada más que sustituir, así que sólo itera lo que la plantilla
  // de verdad necesita. El número es una red contra un bucle infinito, no un
  // presupuesto, y ponerlo justo convertía la red en un techo.
  const maxIterations = 50;
  let iteration = 0;

  while (content.includes("{{IF") && iteration < maxIterations) {
    const prev = content;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content = content.replace(standardPat, evalStandard as any);
    if (content === prev) break;
    iteration++;
  }

  if (
    warnings &&
    iteration >= maxIterations &&
    content.includes("{{IF")
  ) {
    warnings.push({
      code: "W100",
      message:
        "processConditionals reached max_iterations=50; unresolved {{IF ...}} / {{ENDIF}} blocks remain — likely a malformed or deeply nested conditional.",
      iteration,
    });
  }

  return content;
}

// =============================================================================
// expandForEach (Phase 3.2 — re-evaluates conditionals per iteration)
// =============================================================================

export function expandForEach(
  content: string,
  fields: FieldValues,
  warnings?: ComposeWarning[],
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
        const subPat = new RegExp("\\{\\{\\s*" + escapeRe(itUpper) + "\\." + escapeRe(subKey) + "\\s*\\}\\}", "gi");
        elementContent = elementContent.replace(subPat, () => String(subValue));
      }
      const itemPat = new RegExp("\\{\\{\\s*" + escapeRe(itUpper) + "\\s*\\}\\}", "gi");
      elementContent = elementContent.replace(itemPat, () => String(element));
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

const DIRECTIVAS_NO_CAMPO = /^\s*(?:DECLARE|COMMENT|INCLUDE|TAGS|SUMMARY|SCHEMA_ACT|DEPENDENCY|MAP_IUI|HUMAN_ACTION|END_HUMAN_ACTION|LANG|WORD_STYLE|@autonumber|AUTO[:(]|SYSTEM:|FOR\s+EACH|ENDFOR|END[\s_]+FOR|EXIT_INCLUDE)/i;

/** Dentro de las regiones vinculadas a `iterador`, `NOMBRE` → `ITERADOR.NOMBRE`
 *  para los nombres que trae el elemento. Respeta comillas. */
function vincularAlElemento(texto: string, iterador: string, nombres: Set<string>): string {
  const it = iterador.toUpperCase();
  if (nombres.size === 0) return texto.replace(RE_BIND, (m, n: string, cuerpo: string) => (n.toUpperCase() === it ? cuerpo : m));
  return texto.replace(RE_BIND, (m, n: string, cuerpo: string) => {
    if (n.toUpperCase() !== it) return m;
    return cuerpo.replace(/\{\{([^{}]*)\}\}/g, (tok, dentro: string) => {
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

export function substituteFields(content: string, fields: FieldValues): string {
  // First pass: substitute every known field
  for (const [field, value] of Object.entries(fields)) {
    if (!field) continue;
    const escaped = escapeRe(field);
    // Pattern 1: simple {{FIELD}}
    content = content.replace(
      new RegExp("\\{\\{\\s*" + escaped + "\\s*\\}\\}", "g"),
      String(value),
    );
    // Pattern 2: {{FIELD:[instruction]}}
    content = content.replace(
      new RegExp("\\{\\{\\s*" + escaped + ":\\[[^\\]]+\\]\\s*\\}\\}", "g"),
      String(value),
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
      const name = fieldContent.slice(7).trim();
      const val = fields[name] ?? fields[name.toUpperCase()];
      if (val !== undefined && val !== null && String(val) !== "") return String(val);
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
): { text: string; warnings: ComposeWarning[] } {
  const warnings: ComposeWarning[] = [];

  // Step 1: Extract DECLARE fixed values
  const allFields: FieldValues = { ...fields };
  const declareFixed = extractDeclareFixedValues(template);
  Object.assign(allFields, declareFixed);

  // Step 2: Normalize {{NAME:HELP/INPUT/[instr]}} → {{NAME}}
  let content = stripFieldSuffixes(template);

  // Step 3: Strip metadata directives
  content = stripDirectives(content);

  // Step 4: Inject system fields (lower priority than user-provided values)
  const merged: FieldValues = { ...getSystemFields(locale), ...allFields };

  // Step 5: Expand FOR EACH first. Each iteration re-runs
  // processConditionals on its own body with item subkeys in scope.
  content = stripBindMarks(expandForEach(content, merged, warnings));

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
  content = substituteFields(content, merged);

  // Step 10: Resolve {{@autonumber:...}} in document order, last so
  // the numbering reflects the final layout (after IFs prune,
  // FOR EACH expands, and substitutions land).
  content = processAutonumbers(content);

  return { text: content, warnings };
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
  const allFields: FieldValues = { ...fields };
  const declareFixed = extractDeclareFixedValues(template);
  Object.assign(allFields, declareFixed);

  // Phase 3 pipeline order, mirrored from compose():
  //   suffix-strip → metadata-strip → system fields → FOR EACH → IF → COUNT
  let content = stripFieldSuffixes(template);
  content = stripDirectives(content);
  const merged: FieldValues = { ...getSystemFields(locale), ...allFields };

  content = stripBindMarks(expandForEach(content, merged));
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
    const val = merged[fieldContent] ?? merged[fieldContent.toUpperCase()];
    if (val !== undefined && val !== null && String(val) !== "") {
      return wrapForHighlight(String(val), upper);
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
