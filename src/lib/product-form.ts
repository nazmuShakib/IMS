import { z } from 'zod';
import { createProductSchema } from '@/schemas';
import { parseBDT } from '@/lib/money';

const amount = z.union([z.number(), z.string().transform((value, context) => {
  try { return value.trim() ? parseBDT(value) : 0; }
  catch { context.addIssue({ code: 'custom', message: 'Enter a valid amount with at most two decimal places.' }); return z.NEVER; }
})]);

/** Browser and server use the same string-to-domain validation boundary. */
export const productFormSchema = z.object({
  sku: z.string().trim().min(1, 'Enter a product code.'), name: z.string().trim().min(1, 'Enter a product name.'),
  barcode: z.string().trim().nullable().optional(),
  description: z.string().nullable().optional(), model: z.string().nullable().optional(),
  categoryId: z.string().uuid('Choose a category.'), brandId: z.string().nullable().optional(),
  trackingType: z.enum(['SERIAL', 'QUANTITY']),
  defaultCostPrice: amount, defaultSalePrice: amount, staffMaxDiscount: amount,
  reorderPoint: z.union([z.number(), z.string().transform((value, context) => {
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) {
      context.addIssue({ code: 'custom', message: 'Enter a whole number of zero or more.' }); return z.NEVER;
    }
    return Number(value);
  })]),
  taxRate: z.number().default(0), imageUrl: z.string().nullable().default(null),
}).transform((value): z.input<typeof createProductSchema> => ({ ...value, barcode: value.barcode || null, brandId: value.brandId || null }))
  .pipe(createProductSchema);

export function productFormErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? '_')] ??= issue.message;
  return errors;
}
