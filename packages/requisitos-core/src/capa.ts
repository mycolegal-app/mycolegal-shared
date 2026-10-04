// Las TRES capas del catálogo de requisitos documentales y quién lee cuál.
//
// En `legal_act_documents_global` conviven tres catálogos, discriminados por `origen`:
//
//   · GOLDEN   (`origen = IA`)     — 34 actos contrastados uno a uno contra su
//                                    plantilla de DocFilling. Reglas con hechos,
//                                    casos y fundamento.
//   · LIBRO    (`origen = BASICO`) — el libro básico de Javier convertido a
//                                    golden-files: 925 reglas, 154 actos y 292
//                                    transversales. **Sin revisar.**
//   · HEREDADA (el resto)          — lo que había en las copias per-org de
//                                    producción, códigos `MIG:…`: documentos
//                                    planos por acto y CCAA, sin condiciones.
//
// Eran dos hasta el 4-oct-2026; el libro entró con capa propia por decisión de
// Carles (§7 bis del diseño) y no reutilizando `MIGRADA`, porque no cabía: el
// índice único parcial de la básica impone una regla por coordenada y las 925 del
// libro chocaban con las heredadas.
//
// - **Lo que decide por el expediente** (Notaría, Revisor, DocFilling) elige por
//   acto y por especificidad: golden si el acto está curado, si no el libro si lo
//   cubre, si no la heredada.
// - **Las pantallas de curación de la Lista básica** siguen viendo la HEREDADA.
//   Apuntarlas al libro es otra decisión: hoy el libro está sin revisar.
//
// ⚠️ ESTE FICHERO VA UN PASO POR DETRÁS de los gemelos de las apps mientras el
// paquete no se publique. Los adaptadores llevan `BASICO` declarado en local; al
// publicar, que lo tomen de aquí.
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

/** Origen que marca una regla del golden curado. */
export const ORIGEN_GOLDEN = 'IA' as const;
/** Origen que marca una regla del libro básico convertido (§7 bis, 4-oct-2026). */
export const ORIGEN_LIBRO = 'BASICO' as const;

/** La capa que de verdad sirve, ya resuelta. De más específica a más genérica. */
export type CapaResuelta = 'GOLDEN' | 'LIBRO' | 'HEREDADA';

/** A qué capa pertenece una fila, por su `origen`. */
export function capaDeFila(origen: string): CapaResuelta {
  if (origen === ORIGEN_GOLDEN) return 'GOLDEN';
  if (origen === ORIGEN_LIBRO) return 'LIBRO';
  return 'HEREDADA';
}

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
 * ⚠️ Una regla de ámbito TODOS, FAMILIA o SUBFAMILIA no lleva acto, así que no hay
 * acto al que preguntarle qué capa le manda y cuenta como HEREDADA — o sea que las
 * 292 transversales del libro salen de aquí INVISIBLES. Es lo mismo que pasaba
 * antes y está pendiente a propósito: lo arregla el resolutor de cuatro ámbitos,
 * que es quien sabe a qué actos alcanza cada una.
 */
export function enCapaQueManda(
  fila: { actoCodigo: string | null; origen: string },
  golden: Set<string>,
  libro: Set<string>,
): boolean {
  const a = fila.actoCodigo;
  const manda: CapaResuelta = a && golden.has(a) ? 'GOLDEN' : a && libro.has(a) ? 'LIBRO' : 'HEREDADA';
  return capaDeFila(fila.origen) === manda;
}
