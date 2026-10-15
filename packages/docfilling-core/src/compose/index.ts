// Capa de COMPOSICIÓN: de plantilla + datos a markdown final.
export * from './engine';
export { includesDe } from './includes';
export { expandirIncludes, repositorioDeMapa, normalizarNombre } from './expand-includes';
export type { ResultadoExpansion, OpcionesExpansion } from './expand-includes';
export { marcaParrafo } from './expand-includes';
export { marcarRamas, ramasRecorridas, sinMarcasDeCobertura, ramasAlcanzables } from './cobertura';
export type { RamaIf, PreguntaConOpciones, TextoMarcado } from './cobertura';
