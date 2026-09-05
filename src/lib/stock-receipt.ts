import { z } from 'zod';
import { parseBDT } from '@/lib/money';

export const MAX_RECEIPT_SERIALS = 500;
export const serialKey = (value: string) => value.trim().toLowerCase();
export const splitReceiptSerials = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
export const serialBatchSchema = z.array(z.string().trim().min(1).max(120))
  .min(1).max(MAX_RECEIPT_SERIALS)
  .refine((items) => new Set(items.map(serialKey)).size === items.length, 'Duplicate serial numbers in this batch');

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const receiptBase = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid().nullable().optional(),
  unitCost: z.number().int().nonnegative(),
  reason: z.enum(['PURCHASE', 'INITIAL_STOCK', 'CUSTOMER_RETURN']).default('PURCHASE'),
  serialNumbers: serialBatchSchema.optional(),
  quantity: z.number().int().positive().optional(),
  warrantyMonths: z.number().int().min(0).max(120).nullable().optional(),
  warrantyDays: z.number().int().min(0).max(3650).nullable().optional(),
  unitCondition: z.enum(['NEW', 'REFURBISHED']).default('NEW'),
  location: optionalText(100),
  reference: optionalText(100),
  note: optionalText(1000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});

function receiptRules(input: z.infer<typeof receiptBase>, context: z.RefinementCtx) {
  if (Boolean(input.serialNumbers?.length) === Boolean(input.quantity)) {
    context.addIssue({ code: 'custom', path: ['serialNumbers'], message: 'Provide device numbers/IMEIs for individually tracked products or a quantity for bulk/count-based products.' });
  }
  if (input.warrantyMonths != null && input.warrantyDays != null) {
    context.addIssue({ code: 'custom', path: ['warrantyDays'], message: 'Choose either days or months for the warranty.' });
  }
  const count = input.serialNumbers?.length ?? input.quantity ?? 0;
  if (!Number.isSafeInteger(input.unitCost * count)) {
    context.addIssue({ code: 'custom', path: ['unitCost'], message: 'The receipt total is too large.' });
  }
}

export const receiveStockSchema = receiptBase.superRefine(receiptRules);
export type ReceiveStockInput = z.input<typeof receiveStockSchema>;

// The public receiving form deliberately excludes customer returns. RMA and
// historical movements retain their own CUSTOMER_RETURN handling.
export const receiptFieldsSchema = receiptBase.omit({ actorId: true }).extend({
  reason: z.enum(['PURCHASE', 'INITIAL_STOCK']),
  trackingType: z.enum(['SERIAL', 'QUANTITY']),
  warrantyUnit: z.enum(['DAYS', 'MONTHS']),
}).superRefine((input, context) => {
  receiptRules({ ...input, actorId: 'form' }, context);
  const field = input.trackingType === 'SERIAL' ? 'serialNumbers' : 'quantity';
  if (input[field] == null) context.addIssue({ code: 'custom', path: [field], message: 'Enter the received units.' });
});

/** Strict receipt-only money parsing; do not silently strip letters or signs. */
export function parseReceiptCost(value: string): number {
  if (!/^(?:৳\s*)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value.trim())) return Number.NaN;
  return parseBDT(value);
}

export function receiptFormInput(data: FormData, trackingType: 'SERIAL' | 'QUANTITY') {
  const text = (name: string) => String(data.get(name) ?? '').trim();
  const nullable = (name: string) => text(name) || null;
  const duration = text('warrantyDuration') ? Number(text('warrantyDuration')) : null;
  const warrantyUnit = text('warrantyUnit') || 'MONTHS';
  return {
    productId: text('productId'), supplierId: nullable('supplierId'),
    unitCost: parseReceiptCost(text('unitCost')), reason: text('reason') || 'PURCHASE',
    serialNumbers: trackingType === 'SERIAL' ? splitReceiptSerials(text('serialNumbers')) : undefined,
    quantity: trackingType === 'QUANTITY' ? Number(text('quantity')) : undefined,
    warrantyMonths: trackingType === 'SERIAL' && warrantyUnit === 'MONTHS' ? duration : null,
    warrantyDays: trackingType === 'SERIAL' && warrantyUnit === 'DAYS' ? duration : null,
    warrantyUnit, unitCondition: trackingType === 'SERIAL' ? text('unitCondition') || 'NEW' : 'NEW',
    location: trackingType === 'SERIAL' ? nullable('location') : null,
    reference: nullable('reference'), note: nullable('note'),
    idempotencyKey: text('idempotencyKey'), trackingType,
  };
}

export function receiptFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    const field = key === 'warrantyDays' || key === 'warrantyMonths' ? 'warrantyDuration' : key;
    errors[field] ??= issue.message;
  }
  return errors;
}

export interface StockReceipt {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  trackingType: 'SERIAL' | 'QUANTITY';
  count: number;
  unitCost: number;
  totalCost: number;
  supplierId: string | null;
  reason: 'PURCHASE' | 'INITIAL_STOCK' | 'CUSTOMER_RETURN';
  reference: string | null;
  location: string | null;
  note: string | null;
  serials: string[];
  warrantyMonths: number | null;
  warrantyDays: number | null;
  unitCondition: 'NEW' | 'REFURBISHED';
}
