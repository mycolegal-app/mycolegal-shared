/**
 * ⚠️  AUTO-GENERATED — DO NOT EDIT MANUALLY.
 *
 * Source: docfilling-syntax/docfilling_syntax/constants.py
 * Generator: scripts/gen-ts.py
 *
 * Re-generate with:  python scripts/gen-ts.py
 */

// =============================================================================
// System fields (auto-filled at processing time)
// =============================================================================

export const SYSTEM_FIELDS: Record<string, string> = {
  DIA: "Day of month as a number (1-31)",
  DIA_LETRAS: "Day of month spelled out (locale-dependent)",
  MES: "Month name (locale-dependent)",
  MES_NUM: "Month number zero-padded (01-12)",
  AÑO: "Current year (4 digits)",
  ANO: "Current year (4 digits, alias of AÑO without tilde)",
  FECHA: "Full date in locale-formatted form",
  FECHA_ISO: "ISO 8601 date (YYYY-MM-DD)",
  HORA: "Current time HH:MM",
};

// =============================================================================
// Conditional directive prefixes
// =============================================================================

export const CONDITIONAL_PREFIXES = ["IF_", "IF ", "ELSE", "ENDIF"] as const;

// =============================================================================
// Regex patterns
// =============================================================================

/** Generic: any {{...}} placeholder */
export const FIELD_PATTERN = /\{\{([^}]+)\}\}/g;

/** INCLUDE directive variants: {{INCLUDE name}}, {{INCLUDE(name)}}, {{INCLUDE_name}} */
// ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py.
//
// Python usa `\w` en modo Unicode; en JavaScript `\w` es ASCII. Con el `\w`
// que emite el generador, `{{INCLUDE PARR_LEY_CATALUÑA}}` capturaba
// `PARR_LEY_CATALU` y se paraba en la Ñ — y la biblioteca real usa esos nombres
// (PARR_LEY_ANDALUCÍA, PARR_LEY_ARAGÓN, PARR_LEY_CASTILLA_LEÓN, AÑOS_ANTIGUEDAD,
// CONOCIMIENTO_IDIOMA_ESPAÑOL, TIPO_PH_CATALUÑA). Los 139 casos de paridad son
// todos ASCII, así que no lo veían: lo destapó expandir los INCLUDE contra la
// biblioteca real (2-oct-2026).
//
// Traducción fiel de `\w` de Python: `[\p{L}\p{N}_]` con flag `u`. El arreglo
// de raíz va en `gen-ts.py`; mientras no esté, este parche se re-aplica tras
// cada regeneración y lo guardan los tests de `tests/unicode.test.ts`.
const W = String.raw`[\p{L}\p{N}_]`;
export const INCLUDE_PATTERN = new RegExp(
  String.raw`INCLUDE[\s_:]*\(?['"]?(` + W + String.raw`+)['"]?\)?\s*(?:FIELDS\s*:\s*([A-Za-z_]` + W + String.raw`*))?\s*`,
  'iu',
);

/** DEPENDENCY directive: {{DEPENDENCY:law-name:url}} */
export const DEPENDENCY_PATTERN = /\{\{DEPENDENCY:([^:}]+):([^}]+)\}\}/g;

/** MAP_IUI directive: {{MAP_IUI:FIELD:/path}} */
export const MAP_IUI_PATTERN = /\{\{MAP_IUI:([^:}]+):([^}]+)\}\}/g;

/** DOCUBOT directive: {{DOCUBOT(MODE, "prompt")}} or {{DOCUBOT(MODE, "prompt") -> FIELD}} */
export const DOCUBOT_PATTERN = /\{\{DOCUBOT\s*\(\s*(\w+)\s*,\s*[\"']([^\"']+)[\"']\s*\)(?:\s*->\s*(\w+))?\s*\}\}/g;

/** HELP suffix: :HELP(filename) */
export const HELP_SUFFIX_PATTERN = /:HELP\(([^)]+)\)/;

/** INPUT / INPUT_FINAL: {{FIELD:INPUT(desc|opt1,opt2)}} */
export const INPUT_PATTERN = /\{\{([^:]+):(INPUT(?:_FINAL)?)\(([^)]+)\)\}\}/gi;

/** DECLARE: {{DECLARE FIELD:[instruction]}} */
export const DECLARE_PATTERN = new RegExp(String.raw`\{\{DECLARE\s+(` + W + String.raw`+)`, 'iu');

/** AUTO directive: {{AUTO:opt1|opt2}} or {{AUTO(HINT):opt1|opt2}} */
export const AUTO_PATTERN = /\{\{AUTO(?:\(([^)]*)\))?:([^}]+)\}\}/gi;

// =============================================================================
// Limits
// =============================================================================

/** How deep an INCLUDE chain may nest before it is cut off. */
export const MAX_INCLUDE_DEPTH = 10;

// =============================================================================
// Directive table — generated from constants.py::_DIRECTIVES_RAW
// =============================================================================

export type RuntimeOwner = "composer" | "backend" | "editor";

export interface DirectiveSpec {
  name: string;
  prefixes: readonly string[];
  isMetadata: boolean;
  isBlock: boolean;
  endDirective: string | null;
  runtimeOwner: RuntimeOwner;
}

export const DIRECTIVES: readonly DirectiveSpec[] = [
  {
    name: "DECLARE",
    prefixes: ["DECLARE "],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "SET",
    prefixes: ["SET "],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "TAGS",
    prefixes: ["TAGS:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "SUMMARY",
    prefixes: ["SUMMARY:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  // ⚠️ PARCHE A MANO — NO QUITAR AL REGENERAR CON gen-ts.py. F1.9, ver schema-act.ts.
  {
    name: "SCHEMA_ACT",
    prefixes: ["SCHEMA_ACT:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "COMMENT",
    prefixes: ["COMMENT:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "COMMENT_BLOCK",
    prefixes: ["COMMENT_BEGIN"],
    isMetadata: true,
    isBlock: true,
    endDirective: "COMMENT_END",
    runtimeOwner: "composer",
  },
  {
    name: "SYSTEM",
    prefixes: ["SYSTEM:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "INCLUDE",
    prefixes: ["INCLUDE"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "editor",
  },
  {
    name: "EXIT_INCLUDE",
    prefixes: ["EXIT_INCLUDE"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "editor",
  },
  {
    name: "DEPENDENCY",
    prefixes: ["DEPENDENCY:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "backend",
  },
  {
    name: "MAP_IUI",
    prefixes: ["MAP_IUI:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "backend",
  },
  {
    name: "DOCUBOT",
    prefixes: ["DOCUBOT"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "backend",
  },
  {
    name: "LANG",
    prefixes: ["LANG=", "LANG ="],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "HUMAN_ACTION_BLOCK",
    prefixes: ["HUMAN_ACTION_INIT:"],
    isMetadata: true,
    isBlock: true,
    endDirective: "END_HUMAN_ACTION",
    runtimeOwner: "backend",
  },
  {
    name: "HUMAN_ACTION",
    prefixes: ["HUMAN_ACTION:", "HUMAN_ACTION_PRE:", "HUMAN_ACTION_POST:"],
    isMetadata: true,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "backend",
  },
  {
    name: "IF",
    prefixes: ["IF_", "IF "],
    isMetadata: false,
    isBlock: true,
    endDirective: "ENDIF",
    runtimeOwner: "composer",
  },
  {
    name: "FOR_EACH",
    prefixes: ["FOR EACH "],
    isMetadata: false,
    isBlock: true,
    endDirective: "ENDFOR",
    runtimeOwner: "composer",
  },
  {
    name: "COUNT",
    prefixes: ["COUNT("],
    isMetadata: false,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
  {
    name: "AUTO",
    prefixes: ["AUTO:", "AUTO("],
    isMetadata: false,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "backend",
  },
  {
    name: "AUTONUMBER",
    prefixes: ["@autonumber:"],
    isMetadata: false,
    isBlock: false,
    endDirective: null,
    runtimeOwner: "composer",
  },
] as const;

// =============================================================================
// Known directive prefixes (used for typo detection / W001 suppression)
// Derived from DIRECTIVES at generation time.
// =============================================================================

export const KNOWN_DIRECTIVE_PREFIXES = [
  "DECLARE ",
  "SET ",
  "TAGS:",
  "SUMMARY:",
  "SCHEMA_ACT:",
  "COMMENT:",
  "COMMENT_BEGIN",
  "SYSTEM:",
  "INCLUDE",
  "EXIT_INCLUDE",
  "DEPENDENCY:",
  "MAP_IUI:",
  "DOCUBOT",
  "LANG=",
  "LANG =",
  "HUMAN_ACTION_INIT:",
  "HUMAN_ACTION:",
  "HUMAN_ACTION_PRE:",
  "HUMAN_ACTION_POST:",
  "IF_",
  "IF ",
  "FOR EACH ",
  "COUNT(",
  "AUTO:",
  "AUTO(",
  "@autonumber:",
  "COMMENT_END",
  "END_HUMAN_ACTION",
  "ENDIF",
  "ENDFOR",
] as const;

// =============================================================================
// Metadata prefixes (composer strips these from the rendered output)
// =============================================================================

export const METADATA_PREFIXES = [
  "DECLARE ",
  "SET ",
  "TAGS:",
  "SUMMARY:",
  "SCHEMA_ACT:",
  "COMMENT:",
  "COMMENT_BEGIN",
  "SYSTEM:",
  "INCLUDE",
  "EXIT_INCLUDE",
  "DEPENDENCY:",
  "MAP_IUI:",
  "DOCUBOT",
  "LANG=",
  "LANG =",
  "HUMAN_ACTION_INIT:",
  "HUMAN_ACTION:",
  "HUMAN_ACTION_PRE:",
  "HUMAN_ACTION_POST:",
] as const;

// =============================================================================
// Block directives mapping: opening prefix → closing directive
// =============================================================================

export const BLOCK_DIRECTIVES: Readonly<Record<string, string>> = {
  "COMMENT_BEGIN": "COMMENT_END",
  "HUMAN_ACTION_INIT:": "END_HUMAN_ACTION",
  "IF_": "ENDIF",
  "IF ": "ENDIF",
  "FOR EACH ": "ENDFOR",
};

// =============================================================================
// Common typos of directives
// =============================================================================

export const TYPO_PATTERNS: Record<string, string> = {
  "INCLUD[^E]": "INCLUDE",
  "INCUDE": "INCLUDE",
  "INLCUDE": "INCLUDE",
  "SYTEM:": "SYSTEM:",
  "SYSTME:": "SYSTEM:",
  "DEPEDENCY:": "DEPENDENCY:",
  "DEPENDECY:": "DEPENDENCY:",
  "DECLARAR ": "DECLARE ",
  "EDIF_": "ENDIF_",
  "EDNIF_": "ENDIF_",
  "AUOT[:(]": "AUTO",
  "ATUO[:(]": "AUTO",
};
