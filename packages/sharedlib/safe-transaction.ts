// @mycolegal-app/sharedlib/safe-transaction — transacción Prisma con retry
// automático (bloque byte-idéntico extraído de las apps que generan números
// secuenciales o requieren aislamiento Serializable).
//
// Usa el singleton `prisma` de @mycolegal-app/sharedlib/db (la misma instancia
// que la app re-exporta como `@/lib/db`). `@prisma/client` es peerDependency
// OPCIONAL: en runtime resuelve al cliente generado por la app consumidora.

import { prisma } from './db';

// Tipos derivados del cliente SIN depender del namespace `Prisma` generado:
// este paquete se tipa también en aislamiento (`npm run typecheck`), donde
// `@prisma/client` es el stub sin `prisma generate` y `PrismaClient` es `any`.
//   · Con cliente generado: `infer TX` toma la última sobrecarga de
//     `$transaction` (la interactiva), igual que hacía `Parameters<…>`.
//   · Con el stub: `any` distribuye y el resultado es `any`, sin error.
// `Parameters<Parameters<…>[0]>[0]` reventaba en el stub con TS2344 porque
// `Parameters<any>[0]` es `unknown`.
type TransactionClient = typeof prisma extends {
  $transaction: (fn: (tx: infer TX) => any, ...rest: any[]) => any;
}
  ? TX
  : any;
type TransactionFn<T> = (tx: TransactionClient) => Promise<T>;

// Literal idéntico al enum `Prisma.TransactionIsolationLevel` del cliente
// generado; el stub no lo exporta.
type IsolationLevel = 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';

interface SafeTransactionOptions {
  isolationLevel?: IsolationLevel;
  maxRetries?: number;
}

/**
 * Runs a Prisma interactive transaction with automatic retry on serialization
 * failures (P2034) and unique constraint violations (P2002).
 *
 * Use this for operations that generate sequential numbers or need
 * Serializable isolation to prevent TOCTOU races.
 */
export async function safeTransaction<T>(
  fn: TransactionFn<T>,
  options: SafeTransactionOptions = {},
): Promise<T> {
  const { isolationLevel = 'Serializable', maxRetries = 3 } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel });
    } catch (error: any) {
      const retryable =
        error?.code === 'P2034' || // serialization failure
        error?.code === 'P2002';   // unique constraint (sequence collision)

      if (!retryable || attempt === maxRetries - 1) throw error;

      // Exponential backoff: 50ms, 100ms, 200ms
      await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt)));
    }
  }
  throw new Error('safeTransaction: max retries exhausted');
}
