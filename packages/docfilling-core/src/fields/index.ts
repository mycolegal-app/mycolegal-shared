// Capa de CAMPOS: qué pide una plantilla y quién lo rellena.
export { esquemaDeCampos, etiquetaPorDefecto, QUIEN } from './schema';
export type { Campo, Subcampo, EsquemaDePlantilla, OpcionesEsquema, Quien } from './schema';
export { camposSoloCondicionales } from './conditional-only';
export type { ContextoCampos } from './conditional-only';
export { instruccionesDeCampo } from './instructions';
export { inferirTipoDeNombre } from './inferir-tipo';
export type { TipoInferido } from './inferir-tipo';
export { normalizarValor, implicaciones, inversa, tieneVuelta } from './req';
export type { Implicacion, HechoConOpciones } from './req';
export { pesoDeCondiciones, puntuacion, PUNTOS_POR_CONDICION_TUMBADA } from './peso';
export type { PesoCondicion } from './peso';
