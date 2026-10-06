// EL ADAPTADOR PRISMA DEL MOTOR DE REQUISITOS — uno para toda la flota.
//
// POR QUÉ VIVE AQUÍ Y NO EN CADA APP
//
// `@mycolegal-app/requisitos-core` pide un puerto de cuatro métodos y **no sabe
// de Prisma a propósito** (D30): así el motor no arrastra el tipado ni la
// versión de Prisma a sus consumidores. Pero entonces alguien tiene que
// implementar ese puerto contra la base, y ese alguien era **cada app**: lo
// escribí primero dentro de DocFilling y Carles lo paró con la pregunta
// correcta —«¿por qué tienes esto en la app?»—. Consultor, Notaría y LegiFirma
// lo habrían reescrito igual, y tres copias del mismo `include` acaban
// discrepando en el detalle que importa: el ORDEN.
//
// Aquí es su sitio porque `sharedlib` es la fontanería que sí conoce Prisma.
//
// EL CLIENTE SE RECIBE ESTRUCTURALMENTE, no como `PrismaClient`
//
// Misma razón que el puerto: pedir `PrismaClient` ataría este módulo al cliente
// generado de UNA app, y cada app genera el suyo desde su propio espejo. Se
// piden los tres modelos que el motor lee y nada más, así que vale cualquier
// cliente que los tenga —y un `fake` en un test—.
// `@mycolegal-app/requisitos-core` es peerDependency **OPCIONAL**, igual que
// `@prisma/client`: sólo la necesita quien importe este módulo. Marcarla sin el
// `optional` fue un error mío —npm la instaló en las **14** apps que usan
// sharedlib cuando sólo DocFilling la declara y la usa—, y el coste no es el
// disco: un cambio incompatible en el motor podría romper el `npm install` de
// trece apps que no lo tocan.
import type { RepositorioRequisitos, ReglaGolden, NodoTipo } from '@mycolegal-app/requisitos-core';
import { ORIGEN_GOLDEN } from '@mycolegal-app/requisitos-core';

/**
 * Lo que el adaptador necesita del cliente: tres modelos, sólo lectura.
 *
 * ⚠️ `args: any`, y no es pereza: el `findMany` que Prisma GENERA es genérico
 * (`<T extends …FindManyArgs>(args?: SelectSubset<T, …>)`), y por la
 * contravarianza del parámetro **ningún tipo estructural concreto le encaja** —
 * un `Record<string, unknown>` exige aceptar cualquier clave y el de Prisma
 * sólo acepta las suyas, así que el compilador lo rechaza. Lo comprobé
 * pasándole el cliente de verdad.
 *
 * Lo que sí queda tipado es lo que importa: el RETORNO se afirma contra
 * `ReglaGolden` y `NodoTipo`, que es el contrato que el motor consume. Si el
 * espejo de una app no tiene estos tres modelos, falla al construir el objeto,
 * no al leer una fila.
 */
export interface ClienteGolden {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  legalActDocumentGlobal: { findMany(args: any): Promise<any[]> };
  objetoTipoGlobal: { findMany(args: any): Promise<any[]> };
  sujetoTipoGlobal: { findMany(args: any): Promise<any[]> };
  rolSujetoGlobal: { findMany(args: any): Promise<any[]> };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * El `include` del golden. **Es parte del contrato, no una preferencia.**
 *
 * `puerto.ts` promete que los fundamentos llegan ordenados por `orden` y los
 * documentos del grupo de evidencia por `prioridad`, porque **el orden ES el
 * dato**: el primer fundamento es el que se cita. Si cada app escribiera su
 * propio `include`, la que olvidara un `orderBy` citaría otro artículo sin que
 * nada fallara. Por eso está escrito una vez y aquí.
 */
const INCLUDE_GOLDEN = {
  condiciones: { include: { atributoDef: true } },
  roles: true,
  objetos: true,
  obtencion: true,
  fundamentos: { orderBy: { orden: 'asc' } },
  evidenciaGrupo: { include: { documentos: { orderBy: { prioridad: 'asc' } } } },
} as const;

/** Golden = `origen IA`; básica = todo lo demás. Es el filtro de capa, y vive
 *  en el adaptador porque es una cláusula `where`, no una decisión del motor. */
function whereCapa(golden: boolean): Record<string, unknown> {
  return golden ? { origen: ORIGEN_GOLDEN } : { origen: { not: ORIGEN_GOLDEN } };
}

/**
 * Un `RepositorioRequisitos` sobre un cliente Prisma.
 *
 * ```ts
 * import { prisma } from '@/lib/db';
 * const repo = crearRepositorioRequisitos(prisma);
 * const r = await resolverRequisitos(repo, '0501', hechos);
 * ```
 */
export function crearRepositorioRequisitos(client: ClienteGolden): RepositorioRequisitos {
  return {
    async reglasDeActo({ actoCodigo, estados, soloGolden }) {
      const filas = await client.legalActDocumentGlobal.findMany({
        where: {
          actoCodigo,
          active: true,
          ...whereCapa(soloGolden),
          ...(estados ? { estado: { in: estados } } : {}),
        },
        include: INCLUDE_GOLDEN,
      });
      return filas as ReglaGolden[];
    },

    async tiposDeObjeto() {
      const filas = await client.objetoTipoGlobal.findMany({
        select: { codigo: true, parentCodigo: true },
      });
      return filas as NodoTipo[];
    },

    async tiposDeSujeto() {
      const filas = await client.sujetoTipoGlobal.findMany({
        select: { codigo: true, parentCodigo: true },
      });
      return filas as NodoTipo[];
    },

    async tiposDeRol() {
      const filas = await client.rolSujetoGlobal.findMany({
        select: { codigo: true, parentCodigo: true },
      });
      return filas as NodoTipo[];
    },

    async actosConGolden(actoCodigos) {
      if (actoCodigos.length === 0) return new Set();
      const filas = await client.legalActDocumentGlobal.findMany({
        where: { actoCodigo: { in: actoCodigos }, origen: ORIGEN_GOLDEN, active: true },
        select: { actoCodigo: true },
        distinct: ['actoCodigo'],
      }) as { actoCodigo: string | null }[];
      // El `in` no casa NULL, así que ninguna regla sin acto (#823/C1: las de
      // ámbito FAMILIA o TODOS) llega aquí; el filtro sólo estrecha el tipo.
      return new Set(filas.flatMap((f) => (f.actoCodigo ? [f.actoCodigo] : [])));
    },
  };
}
