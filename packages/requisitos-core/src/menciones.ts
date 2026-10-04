/**
 * Qué reglas del golden son MENCIONES: lo que el Revisor comprueba en el texto de la
 * escritura, frente a lo que solo se recaba para el expediente.
 *
 * El golden ya distingue las dos cosas sin que haya que inventar un catálogo aparte
 * (D2 del plan de registrabilidad):
 *
 *   · `tratamientoInstrumento ≠ NINGUNO` — el documento se reseña, incorpora, testimonia
 *     o protocoliza, así que TIENE que constar en el instrumento.
 *   · `modoCumplimiento` del tipo ∈ {MANIFESTACION, ACTUACION, COMPARECENCIA, CONSULTA} —
 *     no es un papel que se aporta sino algo que se manifiesta, se hace o se consulta y de
 *     lo que la escritura deja constancia.
 *
 * Lo que es APORTACION sin tratamiento (una nota simple que se pide y ya) sigue siendo
 * solo un documento requerido: no hay nada que buscar en el texto.
 */

export const MODOS_MENCION = new Set(['MANIFESTACION', 'ACTUACION', 'COMPARECENCIA', 'CONSULTA']);

export interface ReglaMencionable {
  tratamientoInstrumento: string | null;
  modoCumplimiento: string | null;
}

export function esMencion(r: ReglaMencionable): boolean {
  if (r.tratamientoInstrumento && r.tratamientoInstrumento !== 'NINGUNO') return true;
  return Boolean(r.modoCumplimiento && MODOS_MENCION.has(r.modoCumplimiento));
}
