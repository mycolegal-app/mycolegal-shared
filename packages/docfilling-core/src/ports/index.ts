// Los PUERTOS: lo único que un consumidor tiene que implementar.
//
// Están aparte y con su propio subpath porque son el contrato que el SaaS
// cumple contra su base de datos (F8.1) y la app contra su catálogo efectivo
// —override de la organización sobre el global—, cada uno con su
// almacenamiento. El motor no sabe de dónde salen los párrafos: sólo los pide.
export type { ParrafoRepository } from '../compose/expand-includes';
export { repositorioDeMapa, normalizarNombre } from '../compose/expand-includes';
export type { IncludeResolver } from '../syntax/validator';
