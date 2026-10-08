// @mycolegal-app/requisitos-core — el motor de requisitos notariales, sin base de datos.
//
// Qué hay aquí y qué NO:
//
//   · `puerto.ts`   — lo que el motor necesita que alguien le sirva: cuatro métodos y
//                     las filas campo a campo. Quien lo implemente decide con qué
//                     (Prisma, una caché, un fichero, un `fake` de test).
//   · `motor.ts`    — la resolución: jurisdicción → deltas → condiciones ternarias →
//                     tipos is-a → instancias. Tres bloques de salida y las preguntas.
//   · `capa.ts`     — las tres capas (golden, libro, heredada) y el `auto` que elige.
//   · `menciones.ts`— qué reglas tiene que comprobar el Revisor EN EL TEXTO (D2).
//
// NO hay `whereCapa`/`whereCapaActo`: devuelven `Prisma.…WhereInput` y por tanto son del
// adaptador, no del motor. Cada consumidora las conserva junto a su cliente.
export {
  resolverRequisitos,
  evaluar,
  FACT_TIPO_OBJETO,
  FACT_TIPO_SUJETO,
  FACT_MEDIO_PAGO,
  FACT_CAUSA,
  NO_APLICA,
  type Hechos,
  type Pregunta,
  type RequisitoResuelto,
  type Resultado,
  type OpcionesMotor,
  type Ternario,
  type Cond,
} from './src/motor';

export {
  type RepositorioRequisitos,
  type ReglaGolden,
  type NodoTipo,
} from './src/puerto';

export { decidirCapa, enCapaQueManda, capaDeFila, ORIGEN_GOLDEN, ORIGENES_UNIVERSAL, type Capa, type CapaResuelta } from './src/capa';

export { esMencion, MODOS_MENCION, type ReglaMencionable } from './src/menciones';

export {
  evaluarCaso,
  evaluarRequisitos,
  anadirDatos,
  numerarFuentes,
  normalizarRespuesta,
  citaEnFuente,
  huellaContexto,
  cabeceraDelMensaje,
  loteDelMensaje,
  PROMPT_EVALUAR_REQUISITOS,
  CODIGO_DATOS,
  mensajeDeDatos,
  type ModoEvaluacion,
  type FuenteCaso,
  type ContextoEvaluacion,
  type CatalogoDatos,
  type RequisitoAEvaluar,
  type EvaluacionRequisito,
  type EvaluacionDelCaso,
  type DatoLeido,
  type Prueba,
  type Veredicto,
  type Confianza,
  type Llm,
  type OpcionesEvaluacion,
} from './src/evaluador';
