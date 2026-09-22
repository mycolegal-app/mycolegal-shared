// @mycolegal-app/sharedlib/idiomas-documento — idioma del DOCUMENTO que se
// imprime (#653). Extraído de Pólizas, que fue quien lo necesitó primero, al
// pasar a gestionarse el idioma en todas las apps con plantillas de documento.
//
// OJO, son DOS cosas distintas que se parecen: esto es el idioma del DOCUMENTO
// que se imprime, no el idioma de la interfaz (`src/i18n/*.json`). Una notaría
// puede trabajar con la aplicación en castellano y emitir la diligencia en
// catalán, y al revés. No se deben acoplar.
//
// La lista es la que pidió la notaría. Solo castellano y catalán van a tener
// modelo propio de momento; los demás quedan disponibles en el selector y
// recaen en castellano hasta que alguien redacte el suyo.

export const IDIOMAS_DOCUMENTO = ['CAST', 'CAT', 'GAL', 'EUS', 'VAL', 'OTRO'] as const;

export type IdiomaDocumento = (typeof IDIOMAS_DOCUMENTO)[number];

/** Idioma por defecto de toda póliza y de todo modelo. Lo pidió así la notaría. */
export const IDIOMA_DEFECTO: IdiomaDocumento = 'CAST';

/**
 * Normaliza lo que venga de la base de datos o del cliente a un idioma conocido.
 * Una fila antigua, un valor manipulado o un idioma retirado del catálogo caen
 * en castellano en vez de dejar el documento sin modelo.
 */
export function normalizarIdioma(valor: string | null | undefined): IdiomaDocumento {
  const v = (valor ?? '').trim().toUpperCase();
  return (IDIOMAS_DOCUMENTO as readonly string[]).includes(v)
    ? (v as IdiomaDocumento)
    : IDIOMA_DEFECTO;
}

/**
 * Locale con el que se formatean las fechas y los importes DEL DOCUMENTO.
 *
 * Sin esto, un modelo en catalán imprimiría «27 de agosto de 2026» en medio de
 * un texto catalán: la fecha se formateaba siempre en castellano porque hasta
 * ahora no había otro idioma posible.
 *
 * El valenciano usa el locale catalán: `ca-ES-valencia` no está garantizado en
 * todos los runtimes y recaer en castellano sería peor. «Otros» se queda en
 * castellano, que es a lo que recae también su modelo.
 */
const LOCALE_POR_IDIOMA: Record<IdiomaDocumento, string> = {
  CAST: 'es-ES',
  CAT: 'ca-ES',
  GAL: 'gl-ES',
  EUS: 'eu-ES',
  VAL: 'ca-ES',
  OTRO: 'es-ES',
};

export function localeDocumento(idioma: IdiomaDocumento): string {
  return LOCALE_POR_IDIOMA[idioma];
}

/**
 * Idiomas que hay que traer de la base de datos para poder resolver el modelo de
 * `idioma`: el suyo y el castellano al que recae. Existe para que la consulta y
 * la elección no se desincronicen — pedir solo uno y luego intentar recaer al
 * otro es el fallo evidente de esta pareja de funciones.
 */
export function idiomasCandidatos(idioma: IdiomaDocumento): IdiomaDocumento[] {
  return idioma === IDIOMA_DEFECTO ? [IDIOMA_DEFECTO] : [idioma, IDIOMA_DEFECTO];
}

/**
 * Elige el modelo con el que se imprime un documento en `idioma`.
 *
 * El orden es: el del idioma pedido → el castellano de la notaría → `null`, que
 * el llamante traduce al texto de fábrica del catálogo.
 *
 * La recaída no es un adorno: el modelo de un idioma nuevo NO EXISTE hasta que
 * la notaría lo redacta, así que la primera póliza en catalán se emitiría en
 * blanco si no hubiera a qué recaer. Se prefiere un documento en castellano —
 * que el oficial ve y puede corregir— a uno vacío.
 */
export function elegirPlantilla<T extends { idioma: string }>(
  candidatas: T[],
  idioma: IdiomaDocumento,
): T | null {
  return (
    candidatas.find((c) => c.idioma === idioma) ??
    candidatas.find((c) => c.idioma === IDIOMA_DEFECTO) ??
    null
  );
}
