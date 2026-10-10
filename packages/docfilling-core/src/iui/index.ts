// Capa IUI/CTN: el XML del Índice Único.
export { generarIui, valorUtil, IUI_NAMESPACE } from './generar';
export type { MapeosIui, MapeoArray, OpcionesIui, ValorCampo } from './generar';
// F5 (plan REQ_CATALOGO_IUI): el modelo —sujetos, objetos y operaciones que los citan— y su XML.
export { serializarIui, fechaIso, decimalXsd } from './modelo';
export type { ModeloIui, SujetoIui, ObjetoIui, OperacionIui, ObjetoIntervinienteIui, EntradaIui, ResultadoIui } from './modelo';
export { RUTAS_CTN } from './rutas-ctn';
export type { RutaCtn } from './rutas-ctn';
