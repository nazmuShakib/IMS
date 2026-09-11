import { describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { readSnapshot } from '@/repositories/prisma/read-snapshot';

describe('read-only page snapshots', () => {
  const expired = () => Object.assign(new Error('Transaction not found'), { code: 'P2028' });
  it('restarts all reads in a fresh snapshot after an expired transaction', async () => {
    const stale = {} as Prisma.TransactionClient, fresh = {} as Prisma.TransactionClient;
    const transaction = vi.fn().mockImplementationOnce(read => read(stale)).mockImplementationOnce(read => read(fresh));
    const read = vi.fn().mockRejectedValueOnce(expired()).mockResolvedValueOnce({ rows: ['fresh'], totalCount: 1 });
    await expect(readSnapshot({ $transaction: transaction } as unknown as PrismaClient, read)).resolves.toEqual({ rows: ['fresh'], totalCount: 1 });
    expect(read.mock.calls).toEqual([[stale], [fresh]]);
    expect(transaction).toHaveBeenCalledWith(read, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 });
  });
  it('bounds retries and surfaces persistent transaction failures', async () => {
    const error = expired(), transaction = vi.fn().mockRejectedValue(error);
    await expect(readSnapshot({ $transaction: transaction } as unknown as PrismaClient, vi.fn())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it('does not retry unrelated database errors', async () => {
    const error = Object.assign(new Error('invalid query'), { code: 'P2010' });
    const transaction = vi.fn().mockRejectedValue(error);
    await expect(readSnapshot({ $transaction: transaction } as unknown as PrismaClient, vi.fn())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it('leaves an existing transaction under its caller’s control', async () => {
    const tx = {} as Prisma.TransactionClient, error = expired(), read = vi.fn().mockRejectedValue(error);
    await expect(readSnapshot(tx, read)).rejects.toBe(error);
    expect(read).toHaveBeenCalledExactlyOnceWith(tx);
  });
});
