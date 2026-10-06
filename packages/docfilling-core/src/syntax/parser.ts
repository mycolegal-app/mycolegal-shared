/**
 * ⚠️  AUTO-GENERATED — DO NOT EDIT MANUALLY.
 *
 * Source: docfilling-syntax/docfilling_syntax/parser.py
 * Generator: scripts/gen-ts.py
 *
 * Re-generate with:  python scripts/gen-ts.py
 */

import {
  FIELD_PATTERN,
  SYSTEM_FIELDS,
  CONDITIONAL_PREFIXES,
  INCLUDE_PATTERN,
  HELP_SUFFIX_PATTERN,
} from "./constants";
// ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
import { esPageBreak } from "./page-break";
import { esWordStyle, nombreDeEstilo } from "./word-style";
import { esSchemaAct, codigoDeSchemaAct } from "./schema-act";

// =============================================================================
// FieldType enum
// =============================================================================

export enum FieldType {
  SYSTEM = "system",
  CONDITIONAL = "conditional",
  INCLUDE = "include",
  DEPENDENCY = "dependency",
  MAP_IUI = "map_iui",
  DOCUBOT = "docubot",
  DECLARE = "declare",
  DECLARE_ARRAY = "declare_array",
  COMMENT = "comment",
  TAGS = "tags",
  SUMMARY = "summary",
  INPUT = "input",
  INPUT_FINAL = "input_final",
  EXTRACTED = "extracted",
  EXIT_INCLUDE = "exit_include",
  AUTO = "auto",
  FOR_EACH = "for_each",
  END_FOR = "end_for",
  COUNT = "count",
  LANG = "lang",
  SET = "set",
  ALLOW_UNDECLARED = "allow_undeclared",
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
  // `{{PAGEBREAK}}` (D23). Sin tipo propio caía en EXTRACTED y salía como
  // `[NO DISPONIBLE]`. Ver `src/syntax/page-break.ts`.
  PAGE_BREAK = "page_break",
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
  // `{{WORD_STYLE:Nombre}}`: el estilo de párrafo de la plantilla. Ver
  // `src/syntax/word-style.ts`.
  WORD_STYLE = "word_style",
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
  // `{{SCHEMA_ACT:1104}}` (F1.9): el acto IUI del esquema. Ver `src/syntax/schema-act.ts`.
  SCHEMA_ACT = "schema_act",
  UNKNOWN = "unknown",
}

// =============================================================================
// ParsedField interface
// =============================================================================

export interface ParsedField {
  /** Full match including {{ }} */
  raw: string;
  /** Inner content (without {{ }}) */
  content: string;
  fieldType: FieldType;
  /** Field/directive name */
  name: string;
  /** Character offset in source text */
  offset: number;
  /** 1-based line number */
  line: number;
  /** 1-based column number */
  col: number;

  // Type-specific attributes
  /** For INCLUDE: paragraph name */
  includeTarget: string;
  /** For INCLUDE: optional FIELDS:_sfx renaming suffix */
  includeSuffix: string;
  /** For DECLARE :OPTIONS(...): closed value list the AI must pick from */
  extractionOptions: string[];
  /** For SET: the literal value being assigned */
  setValue: string;
  /** For INPUT: description text */
  inputDescription: string;
  /** For INPUT: option list */
  inputOptions: string[];
  /** For DEPENDENCY: law name */
  depName: string;
  /** For DEPENDENCY: URL */
  depUrl: string;
  /** :HELP(file) if present */
  helpFile: string;
  /** For IF_X / ENDIF_X: the "X" part */
  conditionName: string;
  /** For AUTO: list of options */
  autoOptions: string[];
  /** For AUTO: optional hint field name */
  autoHint: string;
  /** For DECLARE: fixed value if =value specified */
  declareValue: string;
  /** For DECLARE: AS TYPE if specified (BOOL/TEXT/NUM/DATE) */
  declareType: string;
  /** For DECLARE: bracketed AI extraction hint, captured from `:[…]`. Surfaced by the wizard as the AI instruction body. */
  declareInstruction: string;
  /** For DECLARE: IU2007 path from `:IUI(...)`, normalised to `DOCS_NOT/DOC_NOT/SUJS/SUJ[1]/PER/NOM` (dots → `/`, no leading/trailing `/`). For DECLARE ARRAY: path of the repeated element (`DOCS_NOT/DOC_NOT/SUJS/SUJ`). */
  iuiPath: string;
  /** For INPUT/INPUT_FINAL: default value if =value suffix specified */
  inputDefault: string;
  langCode: string;
  tagsList: string[];
  summaryText: string;
  isArray: boolean;
  /** For DECLARE ARRAY: subfield specs (name, type, instruction, and `iuiPath` — relative to the array element — when the subfield declares `:IUI(...)`). */
  arraySubfields: Record<string, string>[];
  forFieldName: string;
  countField: string;
  allowUndeclaredNames: string[];
  /** For DECLARE ARRAY: a `:IUI(...)` inside the `:[…]` bracket list, which can't be applied (subfield paths only come from `NAME(SUB:IUI(ruta), …)`). Surfaced via W057. */
  iuiIgnored: boolean;
  /** For DECLARE: leftover tail when the parser fell back to name-only (e.g. ';INPUT(' typo). Surfaced via W055. */
  malformedResidue: string;
}

function createParsedField(partial: Partial<ParsedField> & Pick<ParsedField, "raw" | "content" | "fieldType" | "offset" | "line" | "col">): ParsedField {
  return {
    name: "",
    includeTarget: "",
    includeSuffix: "",
    extractionOptions: [],
    setValue: "",
    inputDescription: "",
    inputOptions: [],
    depName: "",
    depUrl: "",
    helpFile: "",
    conditionName: "",
    autoOptions: [],
    autoHint: "",
    declareValue: "",
    declareType: "",
    declareInstruction: "",
    iuiPath: "",
    inputDefault: "",
    langCode: "",
    tagsList: [],
    summaryText: "",
    isArray: false,
    arraySubfields: [],
    forFieldName: "",
    countField: "",
    allowUndeclaredNames: [],
    iuiIgnored: false,
    malformedResidue: "",
    ...partial,
  };
}

// =============================================================================
// classifyField
// =============================================================================

export function classifyField(content: string): FieldType {
  const upper = content.toUpperCase().trim();

  if (upper.startsWith("SYSTEM:")) return FieldType.SYSTEM;
  if (upper in SYSTEM_FIELDS) return FieldType.SYSTEM;
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py. Ver page-break.ts.
  if (esPageBreak(content)) return FieldType.PAGE_BREAK;
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py. Ver word-style.ts.
  if (esWordStyle(content)) return FieldType.WORD_STYLE;
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py. Ver schema-act.ts.
  if (esSchemaAct(content)) return FieldType.SCHEMA_ACT;
  if (upper.startsWith("COMMENT:")) return FieldType.COMMENT;
  // DECLARE ARRAY must be checked before plain DECLARE (longer-prefix wins).
  if (upper.startsWith("DECLARE ARRAY ") || upper === "DECLARE ARRAY") return FieldType.DECLARE_ARRAY;
  if (upper.startsWith("DECLARE ")) return FieldType.DECLARE;
  if (upper.startsWith("SET ")) return FieldType.SET;
  if (upper === "EXIT_INCLUDE") return FieldType.EXIT_INCLUDE;
  if (upper.startsWith("DEPENDENCY:")) return FieldType.DEPENDENCY;
  if (upper.startsWith("MAP_IUI:")) return FieldType.MAP_IUI;
  if (upper.startsWith("DOCUBOT")) return FieldType.DOCUBOT;
  if (upper.startsWith("AUTO:") || upper.startsWith("AUTO(")) return FieldType.AUTO;

  // Conditionals: IF_FIELD, IF FIELD (space), ELSE, ENDIF, ENDIF_FIELD
  if (CONDITIONAL_PREFIXES.some((p) => upper.startsWith(p))) {
    return FieldType.CONDITIONAL;
  }
  if (/^IF\s+\w/.test(upper)) return FieldType.CONDITIONAL;
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
  // `{{END IF}}` y `{{END_IF}}`: el lenguaje ya aceptaba `{{END FOR}}` y
  // `{{END_FOR}}` junto al canónico `{{ENDFOR}}`, pero de los condicionales
  // sólo `{{ENDIF}}`. No tolerarlo era una asimetría, no una decisión: el
  // bloque no se cerraba y el texto protegido se emitía SIEMPRE (12 casos en
  // 6 ficheros de `_PROD`, medido el 3-oct-2026). Se avisa con W903.
  if (/^END[\s_]+IF$/.test(upper)) return FieldType.CONDITIONAL;

  // INCLUDE (before INPUT check)
  if (upper.startsWith("INCLUDE")) return FieldType.INCLUDE;

  // INPUT / INPUT_FINAL
  if (/:INPUT_FINAL\(/i.test(content)) return FieldType.INPUT_FINAL;
  if (/:INPUT\(/i.test(content)) return FieldType.INPUT;

  // TAGS / SUMMARY / DECLARE_ARRAY / FOR_EACH / END_FOR / COUNT
  if (upper.startsWith("TAGS:")) return FieldType.TAGS;
  if (upper.startsWith("SUMMARY:")) return FieldType.SUMMARY;
  if (upper.startsWith("DECLARE ARRAY ")) return FieldType.DECLARE_ARRAY;
  if (upper.startsWith("FOR EACH ") || upper === "FOR EACH") return FieldType.FOR_EACH;
  // Canonical: ENDFOR (mirrors ENDIF). Legacy END FOR / END_FOR
  // still recognised; validator emits W082 for the legacy forms.
  if (upper === "ENDFOR" || /^END[\s_]+FOR$/i.test(upper)) return FieldType.END_FOR;
  if (upper.startsWith("COUNT(")) return FieldType.COUNT;

  return FieldType.EXTRACTED;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Línea y columna (1-based) de un desplazamiento.
 *
 * ⚠️ Con ÍNDICE de inicios de línea y búsqueda binaria, no recontando desde el principio:
 * `parseFields` la llama una vez por campo, y la versión que cortaba el texto y contaba los
 * `\n` en cada llamada era CUADRÁTICA. Medido el 6-oct-2026 con la compraventa 0501
 * expandida (2,7 MB, 1.341 campos): 7,4 s de los 7,6 s de `esquemaDeCampos`, con el
 * proceso de Redactor bloqueado entero mientras tanto (hasta 22 s sin atender a nadie
 * durante una generación). El índice se guarda para el último texto: las llamadas de un
 * mismo análisis comparten texto.
 */
let indiceDe: { text: string; inicios: number[] } | null = null;
function iniciosDeLinea(text: string): number[] {
  if (indiceDe && indiceDe.text === text) return indiceDe.inicios;
  const inicios = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) inicios.push(i + 1);
  indiceDe = { text, inicios };
  return inicios;
}

export function offsetToLineCol(text: string, offset: number): [number, number] {
  const inicios = iniciosDeLinea(text);
  // La última línea cuyo inicio es <= offset.
  let lo = 0, hi = inicios.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (inicios[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return [lo + 1, offset - inicios[lo] + 1];
}

function _scanParenBody(
  text: string,
  marker: string,
  searchFrom = 0,
): { start: number; end: number; body: string } | null {
  const idx = text.toLowerCase().indexOf(marker.toLowerCase(), searchFrom);
  if (idx < 0) return null;
  const openParen = idx + marker.length;
  if (openParen >= text.length || text[openParen] !== "(") return null;
  let depth = 1;
  let i = openParen + 1;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
  }
  if (depth !== 0) return null;
  const body = text.slice(openParen + 1, i - 1).trim();
  return { start: idx, end: i, body };
}

function _maybeUnquote(s: string): string {
  const t = s.trim();
  if (
    t.length >= 2 &&
    t[0] === t[t.length - 1] &&
    (t[0] === '"' || t[0] === "'")
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function _splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let quote: string | null = null;
  let depth = 0;
  for (const ch of body) {
    if (quote !== null) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === "(") { depth++; buf += ch; continue; }
    if (ch === ")") { if (depth > 0) depth--; buf += ch; continue; }
    if (ch === "," && depth === 0) {
      const chunk = buf.trim();
      if (chunk) parts.push(chunk);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

function _normalizeIuiPath(raw: string): string {
  let path = _maybeUnquote(raw).trim().replace(/\./g, "/");
  path = path.replace(/\s*\/\s*/g, "/");
  return path.replace(/^\/+|\/+$/g, "");
}

function _peelIui(
  text: string,
  peelAll = false,
): { text: string; body: string | null } {
  let first: string | null = null;
  for (;;) {
    const m = /:IUI\(/i.exec(text);
    if (!m) break;
    const scan = _scanParenBody(text, ":IUI", m.index);
    if (!scan) break;
    if (first === null) first = scan.body;
    text = text.slice(0, scan.start) + text.slice(scan.end);
    if (!peelAll) break;
  }
  return { text, body: first };
}

// First `:IUI(...)` outside any `(...)` / `[...]` group — the
// array-level path of a DECLARE ARRAY (subfield paths live inside
// the `NAME(...)` list). Mirrors Python `_find_top_level_iui`.
function _findTopLevelIui(
  text: string,
): { start: number; end: number; body: string } | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") {
      if (depth > 0) depth--;
    } else if (ch === ":" && depth === 0 && text.slice(i, i + 5).toUpperCase() === ":IUI(") {
      return _scanParenBody(text, ":IUI", i);
    }
  }
  return null;
}

// Mirrors Python `_parse_array_subfields`: comma split respecting
// `[...]` and `(...)`; each entry {name, type, instruction} plus
// `iuiPath` (relative to the array element, no prefix baked in)
// when the subfield declares `:IUI(...)`.
function _parseArraySubfields(body: string): Record<string, string>[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of body) {
    if (c === "[" || c === "(") {
      depth++;
      cur += c;
    } else if (c === "]" || c === ")") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  const out: Record<string, string>[] = [];
  for (const raw of parts) {
    if (!raw.trim()) continue;
    const peel = _peelIui(raw.trim());
    const part = peel.text.trim();
    const m = part.match(/^([\w\u00C0-\u024F]+)(?:\s+AS\s+([\w\u00C0-\u024F]+))?(?:\s*:\[([^\]]*)\])?/i);
    if (!m) continue;
    const entry: Record<string, string> = {
      name: m[1].toUpperCase(),
      type: (m[2] || "TEXT").toUpperCase(),
      instruction: m[3] || "",
    };
    if (peel.body !== null) entry.iuiPath = _normalizeIuiPath(peel.body);
    out.push(entry);
  }
  return out;
}

// =============================================================================
// parseFields
// =============================================================================

export function parseFields(text: string): ParsedField[] {
  const fields: ParsedField[] = [];

  // Reset lastIndex for global regex
  const re = new RegExp(FIELD_PATTERN.source, "g");

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const content = m[1].trim();
    const offset = m.index;
    const [line, col] = offsetToLineCol(text, offset);

    const ftype = classifyField(content);
    const pf = createParsedField({
      raw,
      content,
      fieldType: ftype,
      offset,
      line,
      col,
    });

    const upper = content.toUpperCase().trim();

    // --- :HELP suffix (can appear on any directive) ---
    const helpMatch = HELP_SUFFIX_PATTERN.exec(content);
    if (helpMatch) {
      pf.helpFile = helpMatch[1].trim();
    }

    // --- Populate type-specific attributes ---
    switch (ftype) {
      case FieldType.SYSTEM:
        pf.name = upper.startsWith("SYSTEM:")
          ? content.slice(7).trim()
          : content.trim();
        break;

      case FieldType.CONDITIONAL: {
        const condMatch = upper.match(/^(?:END)?IF[_ ]([\w\u00C0-\u024F]+)|^ELSE[_ ]([\w\u00C0-\u024F]+)/);
        if (condMatch) {
          pf.conditionName = (condMatch[1] || condMatch[2] || "").trim();
        }
        pf.name = content.trim();
        break;
      }

      case FieldType.SET: {
        // SET NAME=value  /  SET NAME="value with spaces"
        // Imperative assignment applied at compose time (see
        // composer.processSets). Position-sensitive: lives only
        // in IF branches that survive evaluation.
        const setMatch = content.match(/^SET\s+([\w\u00C0-\u024F]+)\s*=\s*(?:"([^"]*)"|(\S[\s\S]*?))\s*$/i);
        if (setMatch) {
          pf.name = setMatch[1];
          pf.setValue = setMatch[2] !== undefined
            ? setMatch[2]
            : (setMatch[3] || "").trim();
        } else {
          const nameOnly = content.match(/^SET\s+([\w\u00C0-\u024F]+)/i);
          pf.name = nameOnly ? nameOnly[1] : content.trim();
        }
        break;
      }

      // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
      case FieldType.WORD_STYLE: {
        pf.name = nombreDeEstilo(content) ?? "";
        break;
      }

      // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
      case FieldType.SCHEMA_ACT: {
        pf.name = codigoDeSchemaAct(content) ?? "";
        break;
      }

      case FieldType.INCLUDE: {
        const incMatch = content.match(INCLUDE_PATTERN);
        if (incMatch) {
          pf.includeTarget = incMatch[1];
          if (incMatch[2]) pf.includeSuffix = incMatch[2];
          pf.name = `INCLUDE ${pf.includeTarget}`;
        } else {
          pf.name = content.trim();
        }
        break;
      }

      case FieldType.DEPENDENCY: {
        const parts = content.split(":");
        pf.depName = parts.length > 1 ? parts[1].trim() : "";
        pf.depUrl = parts.length > 2 ? parts.slice(2).join(":").trim() : "";
        pf.name = content.trim();
        break;
      }

      case FieldType.INPUT:
      case FieldType.INPUT_FINAL: {
        // Match the head only; scan forward with a paren counter to
        // find the matching close. The prompt may contain nested
        // parens (e.g. "¿Caso especial (firma fuera)?") and a naive
        // `[^)]+` stops at the first `)` and silently drops the
        // `|options` tail.
        const inpHead = content.match(/^([^:]+):(INPUT(?:_FINAL)?)\(/i);
        if (inpHead) {
          pf.name = inpHead[1].trim();
          const openIdx = inpHead.index! + inpHead[0].length;
          let depth = 1;
          let i = openIdx;
          for (; i < content.length && depth > 0; i++) {
            if (content[i] === "(") depth++;
            else if (content[i] === ")") depth--;
          }
          if (depth === 0) {
            const inpBody = content.slice(openIdx, i - 1).trim();
            const pipeIdx = inpBody.indexOf("|");
            if (pipeIdx >= 0) {
              pf.inputDescription = inpBody.slice(0, pipeIdx).trim();
              // Quote-aware split — commas inside `"…"` are part of
              // the option, not separators.
              pf.inputOptions = _splitTopLevelCommas(
                inpBody.slice(pipeIdx + 1),
              ).map(_maybeUnquote);
            } else {
              pf.inputDescription = inpBody;
            }
            // Optional default-value suffix after `)`. Two
            // equivalent forms accepted:
            //   • `=value`            — short (quoted or bare)
            //   • `:DEFAULT(value)`   — explicit (parens may
            //                          contain spaces / commas)
            // Either may precede a trailing `:HELP(...)`.
            const tail = content.slice(i);
            const defMatch = tail.match(/^\s*=\s*(?:"([^"]*)"|([^\s:]+))/);
            if (defMatch) {
              pf.inputDefault = defMatch[1] !== undefined ? defMatch[1] : defMatch[2];
            } else {
              // `:DEFAULT(value)` — paren-counted so values may
              // contain nested parens (e.g. "Obtenida (CCDG)").
              const lead = tail.match(/^\s*/)![0].length;
              const scan = _scanParenBody(tail, ":DEFAULT", lead);
              if (scan && scan.start === lead) {
                pf.inputDefault = _maybeUnquote(scan.body);
              }
            }
          } else {
            pf.name = content.trim();
          }
        } else {
          pf.name = content.trim();
        }
        break;
      }

      case FieldType.EXTRACTED: {
        // Strip operator suffixes like ==, !=, :
        const bare = content.split("==")[0].split("!=")[0].split(":")[0].trim();
        pf.name = bare;
        break;
      }

      case FieldType.DECLARE: {
        // Supports:
        //   DECLARE NAME
        //   DECLARE NAME=value  /  DECLARE NAME="value with spaces"
        //   DECLARE NAME AS TYPE
        //   DECLARE NAME AS TYPE=value  /  DECLARE NAME AS TYPE:[instruction]
        //   DECLARE NAME:INPUT(prompt|opts) [:HELP(...)]
        //   DECLARE NAME:INPUT_FINAL(...) [:HELP(...)]
        //     — inputDescription / inputOptions land on the DECLARE
        //       node so the wizard can pick them up at the field's
        //       first use site (placeholder or IF), keeping order
        //       aligned with the document body rather than the
        //       DECLARE block at the top of an include.
        let inputDeclHandled = false;
        // `:IUI(path)` — IU2007 mapping for the CTN XML. Peeled
        // off first (any position among the suffixes, INPUT form
        // included) so the rest of the parse never sees it.
        const iuiPeel = _peelIui(content);
        const declContent = iuiPeel.text;
        if (iuiPeel.body !== null) pf.iuiPath = _normalizeIuiPath(iuiPeel.body);
        // Allow optional `AS TYPE` before `:INPUT(...)`, e.g.
        //   DECLARE FOO AS BOOL:INPUT(prompt|opts)
        // The captured type is preserved on the node so the
        // wizard / writer can pick it up alongside the prompt
        // and options.
        const inputDeclHead = declContent.match(
          /^DECLARE\s+([\w\u00C0-\u024F]+)(?:\s+AS\s+([\w\u00C0-\u024F]+))?\s*:(INPUT(?:_FINAL)?)\(/i,
        );
        if (inputDeclHead) {
          const openIdx = inputDeclHead.index! + inputDeclHead[0].length;
          let depth = 1;
          let i = openIdx;
          for (; i < declContent.length && depth > 0; i++) {
            if (declContent[i] === "(") depth++;
            else if (declContent[i] === ")") depth--;
          }
          if (depth === 0) {
            pf.name = inputDeclHead[1];
            if (inputDeclHead[2]) pf.declareType = inputDeclHead[2].toUpperCase();
            const inpBody = declContent.slice(openIdx, i - 1).trim();
            const pipeIdx = inpBody.indexOf("|");
            if (pipeIdx >= 0) {
              pf.inputDescription = inpBody.slice(0, pipeIdx).trim();
              // Quote-aware split — commas inside `"…"` are part of
              // the option, not separators.
              pf.inputOptions = _splitTopLevelCommas(
                inpBody.slice(pipeIdx + 1),
              ).map(_maybeUnquote);
            } else {
              pf.inputDescription = inpBody;
            }
            // Optional default-value suffix after `)` — short
            // (`=value`) or explicit (`:DEFAULT(value)`).
            const tail = declContent.slice(i);
            const defMatch = tail.match(/^\s*=\s*(?:"([^"]*)"|([^\s:]+))/);
            if (defMatch) {
              pf.inputDefault = defMatch[1] !== undefined ? defMatch[1] : defMatch[2];
            } else {
              // `:DEFAULT(value)` — paren-counted so values may
              // contain nested parens (e.g. "Obtenida (CCDG)").
              const lead = tail.match(/^\s*/)![0].length;
              const scan = _scanParenBody(tail, ":DEFAULT", lead);
              if (scan && scan.start === lead) {
                pf.inputDefault = _maybeUnquote(scan.body);
              }
            }
            inputDeclHandled = true;
          }
        }
        if (!inputDeclHandled) {
          // DECLARE NAME [AS TYPE] supports any combination of
          // suffixes (peeled individually, any order):
          //   :[instruction]        — AI extraction hint
          //   :OPTIONS(a, b, c)     — closed value list (combo
          //                            in wizard, constraint for AI)
          //   =value | :DEFAULT(value)
          //                          — preselected default
          //
          // After peeling, the leftover must be exactly the head
          // (`DECLARE NAME [AS TYPE]`); anything else is malformed
          // and falls through to the name-only fallback.
          let scanContent = declContent;

          const optionsScan = _scanParenBody(scanContent, ":OPTIONS");
          if (optionsScan) {
            // Quote-aware split — commas inside `"…"` keep the
            // option intact instead of fragmenting it.
            pf.extractionOptions = _splitTopLevelCommas(
              optionsScan.body,
            ).map(_maybeUnquote);
            scanContent =
              scanContent.slice(0, optionsScan.start) +
              scanContent.slice(optionsScan.end);
          }

          const explicitDefaultScan = _scanParenBody(scanContent, ":DEFAULT");
          let explicitDefaultValue: string | undefined;
          if (explicitDefaultScan) {
            // Unquote so `:DEFAULT("Sí, foo")` matches its
            // corresponding (also unquoted) OPTIONS entry.
            explicitDefaultValue = _maybeUnquote(explicitDefaultScan.body);
            scanContent =
              scanContent.slice(0, explicitDefaultScan.start) +
              scanContent.slice(explicitDefaultScan.end);
          }

          // Unquoted value stops at `:` so a trailing
          // `:[instr]`/`:OPTIONS(...)`/`:HELP(...)` doesn't get
          // gobbled into the default. Quoted values may contain
          // `:` between the quotes.
          //
          // Special case: when `:OPTIONS(…)` was already extracted,
          // the `=value` may name a multi-word option (e.g.
          // `:OPTIONS(Persona Física Única,…)=Persona Física Única`).
          // The narrow regex captures only `Persona`, breaks
          // `headMatch`, and silently drops the default. Try
          // matching `=` against the parsed options first,
          // longest-first so an option that's a prefix of another
          // (`Persona` vs `Persona Física Única`) never wins wrongly.
          let eqValueMatch: RegExpMatchArray | null = null;
          let capturedEqValue: string | undefined;
          if (pf.extractionOptions.length > 0) {
            const sortedOpts = [...pf.extractionOptions].sort(
              (a, b) => b.length - a.length,
            );
            for (const opt of sortedOpts) {
              const optEsc = opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const m = scanContent.match(new RegExp("=\\s*" + optEsc));
              if (m) {
                eqValueMatch = m;
                capturedEqValue = opt;
                scanContent =
                  scanContent.slice(0, m.index!) +
                  scanContent.slice(m.index! + m[0].length);
                break;
              }
            }
          }
          if (eqValueMatch === null) {
            eqValueMatch = scanContent.match(/=\s*(?:"([^"]*)"|([^\s:]+))/);
            if (eqValueMatch) {
              capturedEqValue =
                eqValueMatch[1] !== undefined ? eqValueMatch[1] : eqValueMatch[2];
              scanContent =
                scanContent.slice(0, eqValueMatch.index!) +
                scanContent.slice(eqValueMatch.index! + eqValueMatch[0].length);
            }
          }

          const instrMatch = scanContent.match(/:\[([^\]]+)\]/);
          if (instrMatch) {
            // Stash the bracketed instruction so consumers don't
            // need to re-scan `content` with a regex that may
            // not anticipate trailing suffixes after `]`.
            pf.declareInstruction = instrMatch[1].trim();
            scanContent =
              scanContent.slice(0, instrMatch.index!) +
              scanContent.slice(instrMatch.index! + instrMatch[0].length);
          }

          const headMatch = scanContent.match(
            /^DECLARE\s+([\w\u00C0-\u024F]+)(?:\s+AS\s+([\w\u00C0-\u024F]+))?\s*$/i,
          );
          if (headMatch) {
            pf.name = headMatch[1];
            if (headMatch[2]) pf.declareType = headMatch[2].toUpperCase();
            let captured: string | undefined;
            if (capturedEqValue !== undefined) {
              captured = capturedEqValue;
            } else if (explicitDefaultValue !== undefined) {
              captured = explicitDefaultValue;
            }
            if (captured !== undefined) {
              // With OPTIONS → wizard-preselect (input_default).
              // Without → fixed value (composer-substituted).
              if (pf.extractionOptions.length > 0) {
                pf.inputDefault = captured;
              } else {
                pf.declareValue = captured;
              }
            }
            // instruction text remains accessible via `content`
          } else {
            // Malformed DECLARE — extract just the name so
            // downstream name-keyed bookkeeping (wizard scope,
            // required_fields, etc.) still matches. Without
            // this, `pf.name` would hold the whole malformed
            // content blob and silently mismatch references.
            // We also stash the leftover so the validator
            // (W055) can surface it as a warning.
            const nameOnly = declContent.match(/^DECLARE\s+([\w\u00C0-\u024F]+)/i);
            if (nameOnly) {
              pf.name = nameOnly[1];
              const tail = declContent.slice(nameOnly[0].length);
              const typeMatch = tail.match(/\bAS\s+([\w\u00C0-\u024F]+)\b/i);
              if (typeMatch) pf.declareType = typeMatch[1].toUpperCase();
            } else {
              pf.name = content.trim();
            }
            // Strip `DECLARE NAME [AS TYPE]` from `scanContent`
            // (which has had any successfully-peeled suffixes
            // already removed); the remainder is the unparseable
            // tail that surfaces to W055.
            const headStrip = scanContent.match(
              /^\s*DECLARE\s+[\w\u00C0-\u024F]+(?:\s+AS\s+[\w\u00C0-\u024F]+)?\s*/i,
            );
            const residue = headStrip
              ? scanContent.slice(headStrip[0].length)
              : scanContent;
            pf.malformedResidue = residue.trim();
          }
        }
        break;
      }

      case FieldType.MAP_IUI: {
        const parts = content.split(":");
        pf.name = parts.length > 1 ? parts[1].trim() : content.trim();
        break;
      }

      case FieldType.AUTO: {
        const autoMatch = content.match(/^AUTO(?:\(([^)]*)\))?:(.*)/i);
        if (autoMatch) {
          pf.autoHint = (autoMatch[1] || "").trim();
          pf.autoOptions = autoMatch[2].split("|");
          pf.name = content.trim();
        } else {
          pf.name = content.trim();
        }
        break;
      }

      case FieldType.FOR_EACH: {
        const feMatch = content.match(/^FOR\s+EACH\s+([\w\u00C0-\u024F]+)\s+IN\s+([\w\u00C0-\u024F]+)/i);
        if (feMatch) {
          pf.name = feMatch[1].toUpperCase();
          pf.forFieldName = feMatch[2].toUpperCase();
        } else {
          pf.name = content.trim();
        }
        break;
      }

      case FieldType.END_FOR:
        // Canonical name (mirrors ENDIF). Parser normalises legacy
        // "END FOR" / "END_FOR" to "ENDFOR" for consistency.
        pf.name = "ENDFOR";
        break;

      case FieldType.COUNT: {
        const countMatch = content.match(/^COUNT\s*\(\s*([\w\u00C0-\u024F]+)\s*\)/i);
        if (countMatch) {
          pf.countField = countMatch[1].toUpperCase();
          pf.name = `COUNT(${pf.countField})`;
        } else {
          pf.name = content.trim();
        }
        break;
      }

      case FieldType.DECLARE_ARRAY: {
        // `:IUI(...)` (FASE 32 / A9) — the array-level one points at
        // the repeated element (`…/SUJS/SUJ`); each subfield hangs
        // from it by name (`…/SUJ[n]/NOMBRE`) unless it declares its
        // own relative path (`NOMBRE:IUI(PER/NOM)`).
        let rest = content.replace(/^DECLARE\s+ARRAY\s+/i, "").trim();
        pf.isArray = true;
        const topIui = _findTopLevelIui(rest);
        if (topIui) {
          pf.iuiPath = _normalizeIuiPath(topIui.body);
          rest = (rest.slice(0, topIui.start) + rest.slice(topIui.end)).trim();
        }
        const nameMatch = rest.match(/^([\w\u00C0-\u024F]+)/);
        if (nameMatch) {
          pf.name = nameMatch[1].toUpperCase();
          let tail = rest.slice(nameMatch[0].length);
          // Subfield list NAME(...) — paren-counted so a subfield's
          // `:IUI(...)` doesn't close the list early.
          const sfOpen = tail.match(/^\s*\(/);
          if (sfOpen) {
            let depth = 1;
            let i = sfOpen[0].length;
            for (; i < tail.length && depth > 0; i++) {
              if (tail[i] === "(") depth++;
              else if (tail[i] === ")") depth--;
            }
            if (depth === 0) {
              pf.arraySubfields = _parseArraySubfields(tail.slice(sfOpen[0].length, i - 1));
              tail = tail.slice(i);
            }
          }
          // Any `:IUI` left (e.g. inside `:[…]`) can't be applied.
          const stray = _peelIui(tail, true);
          tail = stray.text;
          if (stray.body !== null) pf.iuiIgnored = true;
          // Optional AS TYPE / :[instr] / =value tail
          tail = tail.trim();
          const asTail = tail.match(/^AS\s+([\w\u00C0-\u024F]+)(.*)$/i);
          if (asTail) {
            pf.declareType = asTail[1].toUpperCase();
            tail = (asTail[2] || "").trim();
          }
          // Pull out :[instruction] before parsing =value so the
          // bracketed body doesn't get folded into the fixed value.
          const arrInstrMatch = tail.match(/:\[([^\]]+)\]/);
          if (arrInstrMatch) {
            pf.declareInstruction = arrInstrMatch[1].trim();
            tail = (
              tail.slice(0, arrInstrMatch.index!) +
              tail.slice(arrInstrMatch.index! + arrInstrMatch[0].length)
            ).trim();
          }
          const eqTail = tail.match(/^=\s*(.+)$/);
          if (eqTail) {
            pf.declareValue = eqTail[1].trim();
          }
        } else {
          pf.name = rest.toUpperCase();
        }
        break;
      }

      default:
        pf.name = content.trim();
    }

    fields.push(pf);
  }

  return fields;
}
