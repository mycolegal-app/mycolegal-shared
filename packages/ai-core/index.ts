// @mycolegal-app/ai-core — la fontanería de IA de la flota.
//
// POR QUÉ ES UN PAQUETE
//
// Tres piezas que estaban mal repartidas:
//
//   · `modeloDeTarea` (qué modelo usa cada tarea, conmutable desde Admin) estaba
//     **copiado en cuatro apps**, y sus propios comentarios lo decían: «calco
//     reducido de consultor/tributos».
//   · el mecanismo del catálogo de prompts (default del código, override de
//     Admin, caída al código si la BD falla), copiado también.
//   · y el **bucle agéntico con herramientas**, que no estaba copiado: estaba
//     DENTRO de Consultor, pegado a sus resoluciones. Era lo que hacía imposible
//     que otra app tuviera un MycoBot sin reescribirlo.
//
// Lo que NO sube: el transporte de Vertex (`sharedlib/vertex`, ya compartido),
// la resolución del endpoint por modelo (`sharedlib/server/model-endpoint`, ya
// compartida) y el CONTENIDO de los prompts, que es de cada app.
//
// Los puertos son ESTRUCTURALES: se pide lo mínimo que se usa del cliente de
// Prisma, no `PrismaClient`, para no arrastrar su tipado ni su versión a los
// consumidores.

export {
  createTaskModelResolver,
  type CatalogoTareas,
  type ResolutorDeModelo,
  type ResolutorDeModeloConfig,
} from './src/modelo';

export {
  createPromptCatalog,
  type PromptDef,
  type CatalogoPrompts,
  type CatalogoPromptsConfig,
  type ResolutorDePrompts,
} from './src/prompts';

export {
  conversarConHerramientas,
  type DeclaracionHerramienta,
  type EjecutarHerramienta,
  type OpcionesAgente,
  type PasoAgente,
  type ResultadoAgente,
} from './src/agente';
