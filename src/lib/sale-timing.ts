import { z } from 'zod';
import { hasPermission } from '@/lib/permissions';
import type { Role } from '@/domain/types';
import type { Sale, SaleSettlement, StockMovement } from '@/domain/types';

export const saleTimingShape = {
  saleTiming: z.enum(['now', 'earlier']).default('now'),
  saleOccurredAt: z.string().default(''),
};
export const saleTimingSchema = z.object(saleTimingShape).superRefine((value, ctx) => {
  if (value.saleTiming === 'earlier' && !parseDhakaSaleTime(value.saleOccurredAt)) {
    ctx.addIssue({ code: 'custom', path: ['saleOccurredAt'], message: 'Enter a valid actual sale date and time.' });
  }
});
export type SaleTiming = z.infer<typeof saleTimingSchema>;

/** A datetime-local control is always interpreted in the shop timezone, never the browser timezone. */
export function parseDhakaSaleTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+06:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const roundTrip = new Date(date.getTime() + 6 * 3600_000).toISOString().slice(0, 16);
  return roundTrip === value ? date.toISOString() : null;
}
export function dhakaLocalInput(date = new Date()): string {
  return new Date(date.getTime() + 6 * 3600_000).toISOString().slice(0, 16);
}
export function resolveSaleTime(raw: Partial<SaleTiming>, role: Role, now = new Date()): string {
  const input = saleTimingSchema.parse(raw);
  if (input.saleTiming === 'now') return now.toISOString();
  let error: string | undefined;
  const occurredAt = parseDhakaSaleTime(input.saleOccurredAt)!;
  const age = now.getTime() - new Date(occurredAt).getTime();
  if (!hasPermission(role, 'RECORD_EARLIER_SALE')) error = 'Only Admins and Managers can record an earlier sale.';
  else if (age < 0) error = 'The actual sale time cannot be in the future.';
  else if (age > 168 * 3600_000) error = 'The actual sale time must be within the last seven days.';
  if (error) throw new z.ZodError([{ code: 'custom', path: ['saleOccurredAt'], message: error }]);
  return occurredAt;
}
export const saleOccurredAt = (sale: Pick<Sale, 'occurredAt' | 'completedAt'>): string => sale.occurredAt ?? sale.completedAt;
export const movementOccurredAt = (movement: Pick<StockMovement, 'occurredAt' | 'createdAt'>): string => movement.occurredAt ?? movement.createdAt;
export const settlementOccurredAt = (settlement: Pick<SaleSettlement, 'occurredAt' | 'recordedAt'>): string => settlement.occurredAt ?? settlement.recordedAt;
