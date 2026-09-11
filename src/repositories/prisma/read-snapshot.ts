import type { Prisma, PrismaClient } from '@prisma/client';

/** Only for read-only page loaders: retry the entire snapshot, never a mutation
 * or an individual query against an expired transaction client. */
export async function readSnapshot<T>(client: PrismaClient | Prisma.TransactionClient, read: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!('$transaction' in client)) return read(client);
  const root = client as PrismaClient;
  for (let attempt = 0; ; attempt++) {
    try {
      return await root.$transaction(read, { isolationLevel: 'RepeatableRead', maxWait: 5_000, timeout: 15_000 });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
      if (attempt >= 1 || code !== 'P2028') throw error;
    }
  }
}
