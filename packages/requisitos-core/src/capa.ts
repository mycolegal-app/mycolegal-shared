// Las DOS capas del catálogo de requisitos documentales y quién lee cuál.
//
// En `legal_act_documents_global` conviven dos catálogos, discriminados por `origen`:
//
//   · UNIVERSAL (`origen = IA`) — el catálogo universal: todo lo que carga el
//                                 cargador del golden desde el contrato, curado
//                                 contra DocFilling o venido del libro básico de
//                                 Javier. Cuánto está revisada cada regla lo dice
//                                 su `estado`, no su capa.
//   · HEREDADA  (el resto)      — la legacy: lo que había en las copias per-org de
//                                 producción, códigos `MIG:…`: documentos planos
//                                 por acto y CCAA, sin condiciones.
//
// Fueron tres entre el 4 y el 6-oct-2026: el libro iba en una capa propia
// (`BASICO`) que se encendía con CAPA_LIBRO. Decisión de Carles del 6-oct: una
// sola. El cargador ya no escribe `BASICO`; si alguna base lo conserva, cuenta
// como universal.
//
// - **Lo que decide por el expediente** elige por acto: el universal si el acto
//   lo sirve, y si no la heredada.
// - **Las pantallas de curación de la Lista básica** siguen viendo la HEREDADA.
//
// Los nombres con «golden» (`soloGolden`, `actosConGolden`, `capa: 'golden'`) son
// del catálogo universal: se quedan por no romper la interfaz del puerto.
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

/** Origen con que el cargador escribe el catálogo universal. */
export const ORIGEN_GOLDEN = 'IA' as const;
/** Lo que cuenta como catálogo universal: `IA` y el `BASICO` de cuando el libro era otra capa. */
export const ORIGENES_UNIVERSAL = [ORIGEN_GOLDEN, 'BASICO'] as const;

/** La capa que de verdad sirve, ya resuelta. */
export type CapaResuelta = 'UNIVERSAL' | 'HEREDADA';

/** A qué capa pertenece una fila, por su `origen`. */
export function capaDeFila(origen: string): CapaResuelta {
  return (ORIGENES_UNIVERSAL as readonly string[]).includes(origen) ? 'UNIVERSAL' : 'HEREDADA';
}

/**
 * ¿Sirve el catálogo universal este acto?
 *
 * `auto` es lo que usa todo lo que decide por el expediente: el universal si el
 * acto lo tiene, y si no la heredada.
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
 * ⚠️ Una regla de ámbito TODOS, FAMILIA o SUBFAMILIA no lleva acto, así que no hay
 * acto al que preguntarle qué capa le manda y cuenta como HEREDADA — o sea que las
 * transversales del catálogo salen de aquí INVISIBLES. Es lo mismo que pasaba
 * antes y está pendiente a propósito: lo arregla el resolutor de cuatro ámbitos,
 * que es quien sabe a qué actos alcanza cada una.
 */
export function enCapaQueManda(
  fila: { actoCodigo: string | null; origen: string },
  universal: Set<string>,
): boolean {
  const a = fila.actoCodigo;
  const manda: CapaResuelta = a && universal.has(a) ? 'UNIVERSAL' : 'HEREDADA';
  return capaDeFila(fila.origen) === manda;
}
