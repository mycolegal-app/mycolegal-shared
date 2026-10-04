// Las DOS capas del catálogo de requisitos documentales y quién lee cuál.
//
// En `legal_act_documents_global` conviven, por acto, la lista de siempre (origen
// MIGRADA, MANUAL, NORMATIVA: documentos planos por acto y CCAA, sin condiciones)
// y el catálogo validado (origen IA: las reglas del golden, con hechos, casos y
// fundamento). Decisión de Carles (15-sep-2026):
//
// - **Lista básica** enseña SIEMPRE la lista de siempre, tenga o no golden el acto.
// - **Todo lo que decide por el expediente** (Notaría, Revisor, y ahora la
//   generación de DocFilling) elige por acto: si hay golden, manda el golden; si
//   no, la lista de siempre.
//
// Las dos capas están activas a la vez y cada lector filtra por origen.
//
// ⚠️ QUÉ CAMBIA AL SUBIR A PAQUETE, Y POR QUÉ
//
// La versión de Consultor tiene aquí `whereCapa()` y `whereCapaActo()`, que
// devuelven un `Prisma.LegalActDocumentGlobalWhereInput`. **Eso no puede vivir en
// el paquete**: construir una cláusula de Prisma es exactamente el acoplamiento
// del que D30 quiere salir, y además es trabajo del adaptador, que es quien sabe
// con qué cliente consulta.
//
// Así que el reparto queda: el paquete **decide la capa** (`soloGolden`, un
// booleano) y el adaptador **la traduce** a su filtro. `ORIGEN_GOLDEN` se exporta
// para que el adaptador no tenga que recordar que la marca es `'IA'`.
import type { RepositorioRequisitos } from './puerto';

export type Capa = 'auto' | 'golden' | 'basica';

/** Origen que marca una regla del golden. Todo lo demás es la lista básica. */
export const ORIGEN_GOLDEN = 'IA' as const;

/**
 * ¿Se sirve el golden para este acto?
 *
 * `auto` es lo que usa todo lo que decide por el expediente: golden si el acto lo
 * tiene, y si no la lista de siempre. Que el fallback exista es lo que permite
 * servir los 33 actos y no sólo los curados.
 */
export async function decidirCapa(
  repo: RepositorioRequisitos,
  actoCodigo: string,
  capa: Capa = 'auto',
): Promise<boolean> {
  if (capa === 'golden') return true;
  if (capa === 'basica') return false;
  return (await repo.actosConGolden([actoCodigo])).has(actoCodigo);
}

/**
 * Para lecturas de varios actos a la vez: ¿esta fila está en la capa que manda
 * para su acto?
 *
 * #823/C1 — una regla de ámbito FAMILIA o TODOS no tiene acto, y por tanto no hay
 * acto al que preguntarle si tiene golden: cuenta como «sin golden», que es la
 * lista básica. Hoy eso es exacto (el ámbito nació con el catálogo básico y el
 * golden es siempre por acto); si algún día el golden cura reglas transversales,
 * esta función necesitará saber de familias.
 */
export function enCapaQueManda(
  fila: { actoCodigo: string | null; origen: string },
  golden: Set<string>,
): boolean {
  return (fila.origen === ORIGEN_GOLDEN) === (fila.actoCodigo !== null && golden.has(fila.actoCodigo));
}
