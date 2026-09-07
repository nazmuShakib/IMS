import { z } from 'zod';
import { SUPPLIER_RETURN_REASONS } from '@/domain/types';

export const REMOVAL_REASONS = ['DAMAGE', 'LOSS', 'SHOP_USE', 'GIFT', 'RETURN_TO_SUPPLIER'] as const;
export const removalSerialSchema = z.string().trim().min(1, 'removal.serialRequired').max(120, 'removal.serialLong');
const optionalText = (max: number, message: string) => z.string().trim().max(max, message).transform(value => value || null);
export const removalFieldsSchema = z.object({
  mode: z.enum(['serial', 'bulk'], { error: 'removal.invalid' }),
  productId: z.string().uuid('removal.productRequired'),
  serialNo: z.string().default(''),
  quantity: z.string().default(''),
  reason: z.enum(REMOVAL_REASONS, { error: 'removal.reasonRequired' }),
  supplierId: z.string().default(''),
  returnReason: z.string().default(''),
  reference: optionalText(100, 'removal.referenceLong'),
  note: optionalText(1000, 'removal.noteLong'),
  idempotencyKey: z.string().min(8, 'removal.requestInvalid'),
}).superRefine((input, context) => {
  if (input.mode === 'serial') {
    const serial = removalSerialSchema.safeParse(input.serialNo);
    if (!serial.success) for (const issue of serial.error.issues) context.addIssue({ code: 'custom', path: ['serialNo'], message: issue.message });
  } else if (!/^\d+$/.test(input.quantity.trim()) || !Number.isSafeInteger(Number(input.quantity)) || Number(input.quantity) <= 0) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'removal.quantityInvalid' });
  }
  if (input.reason === 'RETURN_TO_SUPPLIER') {
    if (!z.string().uuid().safeParse(input.supplierId).success) context.addIssue({ code: 'custom', path: ['supplierId'], message: 'removal.supplierRequired' });
    if (!z.enum(SUPPLIER_RETURN_REASONS).safeParse(input.returnReason).success) context.addIssue({ code: 'custom', path: ['returnReason'], message: 'removal.returnReasonRequired' });
  }
}).transform(input => ({
  ...input,
  serialNo: input.mode === 'serial' ? input.serialNo.trim() : undefined,
  quantity: input.mode === 'bulk' ? Number(input.quantity) : undefined,
  supplierId: input.reason === 'RETURN_TO_SUPPLIER' ? input.supplierId : null,
  returnReason: input.reason === 'RETURN_TO_SUPPLIER' ? input.returnReason as typeof SUPPLIER_RETURN_REASONS[number] : null,
}));
export type RemovalInput = z.output<typeof removalFieldsSchema>;
export type RemovalFields = z.input<typeof removalFieldsSchema>;
export function removalFormInput(data: FormData) {
  return Object.fromEntries(['mode', 'productId', 'serialNo', 'quantity', 'reason', 'supplierId', 'returnReason', 'reference', 'note', 'idempotencyKey'].map(key => [key, String(data.get(key) ?? '')]));
}
export function removalFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) result[issue.path.join('.') || '_'] ??= issue.message;
  return result;
}
export interface RemovalReceipt {
  movementId: string;
  productId: string;
  productName: string;
  sku: string;
  serialNo: string | null;
  quantity: number;
  reason: string;
  reference: string | null;
  note: string | null;
  supplierReturn?: { id: string; returnNumber: string; supplierName: string; returnReason: string };
}
export interface RemovalActionState {
  receipt?: RemovalReceipt;
  replayed?: boolean;
  fieldErrors?: Record<string, string>;
  error?: string;
  outcome?: 'rejected' | 'unconfirmed';
  available?: number;
  unavailableSerial?: boolean;
}
export class RemovalValidationError extends Error {
  constructor(public field: string, message: string, public available?: number) { super(message); }
}
