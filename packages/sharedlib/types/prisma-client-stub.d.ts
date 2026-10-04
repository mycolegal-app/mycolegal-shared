// SHIM DE TIPOS PARA EL TYPECHECK DE ESTE PAQUETE. **No se publica.**
//
// EL PROBLEMA
//
// `db.ts` hace `import { PrismaClient } from '@prisma/client'`, y en el
// workspace de sharedlib eso no resuelve a nada:
// `node_modules/@prisma/client/default.d.ts` es un **stub** cuyo contenido
// entero es `export * from '.prisma/client/default'`, y `.prisma/client` sólo
// existe **después de un `prisma generate` contra un schema**. El monorepo no
// tiene schema —ni debe tenerlo—, así que el re-export no exporta nada y
// `tsc` dice «has no exported member 'PrismaClient'».
//
// No era un bug: `db.ts` está escrito para resolver el cliente generado **de la
// app consumidora** (cada una tiene su propio espejo del schema canónico), y en
// su propia casa no hay cliente que resolver. Viene así desde la migración al
// monorepo, y el coste era que el `typecheck` de sharedlib arrancaba con un
// error de fondo: con un error permanente en la salida, el siguiente error de
// verdad se confunde con el ruido.
//
// LO QUE NO SE HIZO, Y POR QUÉ
//
// · **Generar un cliente aquí** exigiría un segundo `schema.prisma` en el
//   monorepo, que es exactamente la deriva que la flota evita teniendo UNO
//   canónico en `mycolegal-platform`.
// · **Aflojar el tipo de `prisma`** (a `any` o a una forma estructural) haría
//   compilar esto a costa de que las 10 apps consumidoras perdieran el tipado
//   de sus modelos. El error se iría de aquí y aparecería, en silencio, allí.
//
// POR QUÉ ES SEGURO
//
// Este fichero **no está en el `files` del package.json**, así que no viaja en
// el paquete. En una app consumidora, `@prisma/client` resuelve a SU cliente
// generado, con sus modelos y sus tipos; esta declaración no existe allí y no
// puede taparlos. Si se publicara, sí sería un problema — de ahí el aviso.
//
// EL ÍNDICE ABIERTO ES EL DATO, NO UN ATAJO
//
// Empecé declarando sólo lo que `db.ts` usa, y cambió 1 error por 9: con un
// `PrismaClient` concreto, `document-templates.ts` dejaba de compilar porque
// accede a `prisma.documentoPlantilla`, un modelo del espejo de la app.
//
// Y ahí está la cuestión: **en esta capa es verdad que no se sabe qué modelos
// hay**. Cada app genera su cliente desde su propio espejo, y sharedlib accede
// a los que su consumidora tenga. El índice abierto dice eso y no finge otra
// cosa.
//
// Lo que se gana y lo que se pierde, dicho: el acceso a MODELOS dentro de
// sharedlib **no queda tipado** —ya no lo estaba, era un error directo— y todo
// lo demás sí: la sintaxis, sus propios tipos, sus firmas. O sea que el
// `typecheck` del paquete pasa a decir algo, que es lo que no hacía mientras
// arrastraba un error permanente: con un error fijo en la salida, el siguiente
// error de verdad se confunde con el ruido.

declare module '@prisma/client' {
  export class PrismaClient {
    constructor(opciones?: unknown);
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    /** Con opciones: `safe-transaction.ts` pasa `{ isolationLevel }`, que es la
     *  razón de que esta firma exista en vez de dejarla al índice abierto. */
    $transaction<T>(fn: (tx: PrismaClient) => Promise<T>, opciones?: unknown): Promise<T>;
    /** Los modelos del espejo de la app consumidora: aquí no se pueden conocer.
     *  eslint-disable-next-line @typescript-eslint/no-explicit-any */
    [modelo: string]: any;
  }
  export namespace Prisma {
    type JsonValue = unknown;
    type InputJsonValue = unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type TransactionClient = any;
  }
}
