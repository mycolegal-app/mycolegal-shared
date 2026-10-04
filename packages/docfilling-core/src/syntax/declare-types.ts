// Tipos de un DECLARE: los canónicos y sus sinónimos aceptados.
//
// Fuente única. El motor de referencia en Python sólo admite los cuatro
// canónicos y emite `E051` (error) con cualquier otro — pero la biblioteca real
// escribe sinónimos obvios en 4 ficheros y 10 declaraciones:
//
//   AS BOOLEAN ×7  paragraphs/00_VAR_GLOBALES/09_fiscalidad_autonomica/VAR_ISD_ALA.md:1-7
//   AS NUMBER      06_herencias_y_testamentos/VAR_TEST_CAT_429_9_ALBACEA_UNIVERSAL.md:7
//   AS LIST        09_fiscalidad_autonomica/VAR_ESTIPULACION_3_…_DONACION.md:1
//   AS STRING      09_fiscalidad_autonomica/VAR_ISD_GAL.md:16
//
// Decisión de Carles (2-oct-2026): **se aceptan como sinónimos** en vez de
// curar los ficheros, porque curar 10 líneas no evita que se vuelvan a
// escribir. Y a partir de esa fecha `docfilling-core` **ya no preserva la
// paridad** con el Python: evoluciona libremente y el SaaS se alineará después
// (D25 del plan).
//
// `LIST` merece una nota: quien lo escribió quería «elección de una lista
// cerrada», y eso en este lenguaje se expresa con `TEXT` + `:OPTIONS(...)` —
// que es justo lo que ese DECLARE ya lleva. Así que el sinónimo es `TEXT` y no
// se pierde nada.

/** Los cuatro tipos del lenguaje. */
export const TIPOS_CANONICOS = ['BOOL', 'TEXT', 'NUM', 'DATE'] as const;
export type TipoCanonico = (typeof TIPOS_CANONICOS)[number];

/** Sinónimos aceptados → tipo canónico. */
export const SINONIMOS_DE_TIPO: Record<string, TipoCanonico> = {
  BOOLEAN: 'BOOL',
  NUMBER: 'NUM',
  NUMERIC: 'NUM',
  INT: 'NUM',
  INTEGER: 'NUM',
  FLOAT: 'NUM',
  STRING: 'TEXT',
  STR: 'TEXT',
  // Quien escribe LIST quiere una lista cerrada: eso es TEXT + :OPTIONS(...).
  LIST: 'TEXT',
  ENUM: 'TEXT',
  FECHA: 'DATE',
  TEXTO: 'TEXT',
  NUMERO: 'NUM',
  BOOLEANO: 'BOOL',
};

const CANONICOS = new Set<string>(TIPOS_CANONICOS);

/** ¿Es un tipo que el lenguaje entiende, canónico o sinónimo? */
export function tipoAceptado(tipo: string): boolean {
  if (!tipo) return true;
  const t = tipo.toUpperCase();
  return CANONICOS.has(t) || t in SINONIMOS_DE_TIPO;
}

/**
 * Lleva un tipo a su forma canónica. Lo que no se reconoce se devuelve tal
 * cual (en mayúsculas): así el validador puede seguir avisando de él y el
 * esquema no miente sobre lo que había escrito.
 */
export function tipoCanonico(tipo: string): string {
  if (!tipo) return 'TEXT';
  const t = tipo.toUpperCase();
  if (CANONICOS.has(t)) return t;
  return SINONIMOS_DE_TIPO[t] ?? t;
}
