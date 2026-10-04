// Capa de CAMPOS: qué pide una plantilla y quién lo rellena.
export { esquemaDeCampos, etiquetaPorDefecto, QUIEN } from './schema';
export type { Campo, Subcampo, EsquemaDePlantilla, OpcionesEsquema, Quien } from './schema';
export { camposSoloCondicionales } from './conditional-only';
export type { ContextoCampos } from './conditional-only';
export { instruccionesDeCampo } from './instructions';
export { inferirTipoDeNombre } from './inferir-tipo';
export type { TipoInferido } from './inferir-tipo';
