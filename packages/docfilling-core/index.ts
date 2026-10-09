// @mycolegal-app/docfilling-core — superficie pública del motor.
//
// QUÉ ES
//
// El motor DocFilling, texto→texto: recibe markdown con directivas y valores, y
// devuelve markdown final. NO escribe `.docx`: eso lo hace la fusión con la
// plantilla de referencia de la notaría (`platform POST /internal/docx`).
//
// DE DÓNDE VIENE
//
// La capa de sintaxis (`src/syntax/*`) y el composer (`src/compose/engine.ts`)
// se trajeron de `DocFilling/docfilling-editor`, donde `scripts/gen-ts.py` los
// GENERA desde el paquete Python `docfilling-syntax`. Mientras el SaaS siga en
// Python, el Python manda y estos ficheros se regeneran; cuando el SaaS pase a
// TypeScript, este paquete es la fuente única y el generador se retira.
// Ver `mycolegal-docfilling/PLAN_TECNICO_DOCFILLING_CORE.md` §4.1 y D7.
//
// LA RED: los 139 casos de `tests/parity` son los MISMOS que corre el Python.
// Si uno falla, el motor TS se ha desviado del de referencia.

export {
  // Composición
  compose,
  composeWithDiagnostics,
  composeForPreview,
  formatNotarial,
  // Etapas, expuestas porque la app las necesita por separado (previsualización,
  // depuración y el camino de `formato: "md"` de la frontera)
  stripFieldSuffixes,
  stripDirectives,
  extractDeclareFixedValues,
  applyFieldSuffix,
  normalizeConditionals,
  processConditionals,
  expandForEach,
  processExitIncludes,
  processSets,
  processAutonumbers,
  substituteCount,
  substituteFields,
  getSystemFields,
  DEFAULT_LOCALE,
  INC_BEGIN_MARK,
  BIND_END_MARK,
  bindBeginMark,
  stripBindMarks,
  INC_END_MARK,
} from './src/compose/engine';
export type { FieldValues, ComposeWarning } from './src/compose/engine';

export { parseFields, classifyField, offsetToLineCol, FieldType } from './src/syntax/parser';
export type { ParsedField } from './src/syntax/parser';

// `validateText` sale de la ENVOLTURA (`src/syntax/validate.ts`), no del fichero
// generado: añade las tres comprobaciones que `gen-ts.py` no emite. Ver
// `src/syntax/checks-pendientes.ts`.
export { validateText } from './src/syntax/validate';
export { collectAllDeclares } from './src/syntax/validator';
export { TIPOS_CANONICOS, SINONIMOS_DE_TIPO, tipoAceptado, tipoCanonico } from './src/syntax/declare-types';
// `{{PAGEBREAK}}` (D23, renombrada por D38). La fusión necesita las grafías, el
// patrón y el predicado para
// reconocer la única directiva que el motor deja pasar intacta a su salida.
export {
  PAGEBREAK, PAGEBREAK_HEREDADO, PAGEBREAK_DIRECTIVA, PAGEBREAK_PATTERN_G,
  esPageBreak, esPageBreakHeredado,
} from './src/syntax/page-break';
// `{{WORD_STYLE:Nombre}}` (3-oct): el estilo de párrafo de la plantilla. La
// fusión lo consume; `estilosUsados` deja validar una plantilla contra lo que
// el catálogo necesita de verdad.
export {
  WORD_STYLE, WORD_STYLE_PATTERN, WORD_STYLE_PATTERN_G,
  esWordStyle, nombreDeEstilo, directivaWordStyle, estilosUsados,
} from './src/syntax/word-style';
// Comparaciones numéricas del `{{IF}}` (3-oct): `<=`, `>=`, `<`, `>`, con el
// parseo de importes en formato español.
export {
  OPERADORES_NUMERICOS, parseComparacion, parseNumero, compararNumerico,
} from './src/syntax/comparar';
export type { OperadorNumerico, AtomoComparacion, ResultadoComparacion } from './src/syntax/comparar';
export type { TipoCanonico } from './src/syntax/declare-types';
export type { Diagnostic, DiagnosticFix, ValidationResult, IncludeResolver } from './src/syntax/validator';

export * from './src/syntax/constants';

export { includesDe } from './src/compose/includes';

// Esquema de campos (F1.5): lo que alimenta `faltantes[]` y el formulario del oficial.
export { esquemaDeCampos, etiquetaPorDefecto, QUIEN } from './src/fields/schema';
export type { Campo, Subcampo, EsquemaDePlantilla, OpcionesEsquema, Quien } from './src/fields/schema';
export { camposSoloCondicionales } from './src/fields/conditional-only';
export type { ContextoCampos } from './src/fields/conditional-only';
export { instruccionesDeCampo } from './src/fields/instructions';
// F1.7 — lo determinista y neutro de idioma del `input_humanizer`. Las 41
// preguntas en castellano del SaaS NO están aquí a propósito: ver el fichero.
export { inferirTipoDeNombre } from './src/fields/inferir-tipo';
export type { TipoInferido } from './src/fields/inferir-tipo';
// `:REQ` / `:DOC`: enlace de los campos con el catálogo universal (plan REQ_CATALOGO_IUI).
export { pelarReqDoc, leerReq, leerDoc, quitarReqDoc } from './src/syntax/req-doc';
export type { ReqDecl, ReqDoc } from './src/syntax/req-doc';
export { normalizarValor, implicaciones, inversa, tieneVuelta } from './src/fields/req';
export type { Implicacion, HechoConOpciones } from './src/fields/req';
export { pesoDeCondiciones, puntuacion, PUNTOS_POR_CONDICION_TUMBADA } from './src/fields/peso';
export type { PesoCondicion } from './src/fields/peso';
export { catalogoDesdeJson } from './src/ports/catalogo';
export type {
  CatalogoReq, CatalogoReqJson, AtributoCatalogo, DocumentoCatalogo, RolCatalogo, IuiAtributo, ClaseAtributo,
} from './src/ports/catalogo';
export type { OpcionesValidacion } from './src/syntax/validate';
// F1.3 (residuo) — `{{LANG=xx}}`: el idioma de la PLANTILLA, que decide en qué
// idioma salen las fechas del motor.
export { idiomaDePlantilla, IDIOMA_POR_DEFECTO } from './src/syntax/template-lang';
export { metadatosDeEsquema, metadatosDeParrafo, esSchemaAct, CODIGO_ACTO } from './src/syntax/schema-act';
export type { MetadatosDeEsquema, MetadatosDeParrafo } from './src/syntax/schema-act';
export { checkInputConOptions, checkIncludeConRuta, checkDosPuntosEnPalabraClave, checkEndIfNoCanonico } from './src/syntax/checks-pendientes';
export { expandirIncludes, repositorioDeMapa, normalizarNombre } from './src/compose/expand-includes';

// Análisis de la biblioteca completa (F1.9b): huérfanos, vacíos y condiciones
// sin declaración alcanzable — los tres defectos que no dan diagnóstico.
export { analizarBiblioteca } from './src/biblioteca/analizar';
export { enlacesDeEsquema } from './src/biblioteca/enlaces';
export type { EnlaceDeCampo, EnlacesDeEsquema } from './src/biblioteca/enlaces';

// F1.6 — IUI/CTN: mapeos de la plantilla y generación del XML del Índice Único.
// La validación contra el XSD NO está aquí a propósito: ver `src/iui/generar.ts`.
export { generarIui, valorUtil, IUI_NAMESPACE } from './src/iui/generar';
export type { MapeosIui, MapeoArray, OpcionesIui } from './src/iui/generar';
export type { AnalisisBiblioteca, Documento, CondicionSospechosa, OpcionesAnalisis, DeclaracionDivergente } from './src/biblioteca/analizar';
export type { ParrafoRepository, ResultadoExpansion, OpcionesExpansion } from './src/compose/expand-includes';
export { listasDeLaPlantilla, marcarListasParaSonda, type ListaDeducida, type ResultadoListas } from './src/fields/listas';
