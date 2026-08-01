import { z } from 'zod';
import {
  ROLES,
  TRACKING_TYPES,
  UNIT_STATUSES,
  MOVEMENT_REASONS,
  RMA_STATUSES,
  RMA_CUSTODIES,
  RMA_COVERAGES,
  SUPPLIER_WARRANTY_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '@/domain/types';
import { isBangladeshMobile } from '@/lib/phone';

/**
 * ONE schema per input, shared by the client form (react-hook-form) and the
 * server action. Define once, import both places. PLAN.md §3.
 */

const paisa = z
  .number()
  .int('Money must be an integer number of paisa — never a float')
  .nonnegative();

export const createProductSchema = z
  .object({
    sku: z.string().min(1).max(64).trim(),
    barcode: z.string().trim().optional().nullable(),
    name: z.string().min(1).max(200).trim(),
    description: z.string().max(2000).optional().nullable(),
    model: z.string().max(120).optional().nullable(),
    trackingType: z.enum(TRACKING_TYPES).default('SERIAL'),
    categoryId: z.string().uuid(),
    brandId: z.string().uuid().optional().nullable(),
    defaultCostPrice: paisa.default(0),
    defaultSalePrice: paisa.default(0),
    taxRate: z.number().int().min(0).max(10_000).default(0), // basis points
    reorderPoint: z.number().int().nonnegative().default(5),
    imageUrl: z.string().url().optional().nullable(),
  })
  .refine((p) => p.defaultSalePrice === 0 || p.defaultSalePrice >= p.defaultCostPrice, {
    message: 'Selling price is below cost price — is that intentional?',
    path: ['defaultSalePrice'],
  });
export type CreateProductInput = z.input<typeof createProductSchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  parentId: z.string().uuid().optional().nullable(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createBrandSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(150).trim(),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine(
      isBangladeshMobile,
      'Enter a valid Bangladeshi mobile number, such as 01712345678 or +8801712345678.',
    )
    .optional()
    .nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

/**
 * STOCK IN.
 * SERIAL products take a list of serials (one unit each).
 * QUANTITY products take a count.
 */
export const receiveStockSchema = z
  .object({
    productId: z.string().uuid(),
    supplierId: z.string().uuid().optional().nullable(),
    unitCost: paisa,
    reason: z.enum(['PURCHASE', 'INITIAL_STOCK', 'CUSTOMER_RETURN']).default('PURCHASE'),

    // SERIAL path
    serialNumbers: z.array(z.string().min(1).max(120).trim()).optional(),
    warrantyMonths: z.number().int().min(0).max(120).optional().nullable(),
    location: z.string().max(100).optional().nullable(),

    // QUANTITY path
    quantity: z.number().int().positive().optional(),

    reference: z.string().max(100).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
    actorId: z.string(),
    idempotencyKey: z.string().min(8),
  })
  .refine((i) => Boolean(i.serialNumbers?.length) !== Boolean(i.quantity), {
    message: 'Provide device numbers/IMEIs for individually tracked products or a quantity for bulk/count-based products.',
  })
  .refine(
    (i) => !i.serialNumbers || new Set(i.serialNumbers).size === i.serialNumbers.length,
    { message: 'Duplicate serial numbers in this batch', path: ['serialNumbers'] },
  );
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;

/**
 * STOCK OUT. A "sale" is just this, with reason=SALE and a salePrice. PLAN.md §1.1.
 */
export const stockOutSchema = z
  .object({
    productId: z.string().uuid(),
    reason: z.enum(['SALE', 'DAMAGE', 'LOSS', 'INTERNAL_USE', 'RETURN_TO_SUPPLIER']),

    serialNo: z.string().min(1).optional(), // SERIAL products
    quantity: z.number().int().positive().optional(), // QUANTITY products

    salePrice: paisa.optional(),
    customerName: z.string().max(150).optional().nullable(),
    customerPhone: z.string().max(30).optional().nullable(),
    reference: z.string().max(100).optional().nullable(),
    note: z.string().max(1000).optional().nullable(),
    actorId: z.string(),
    idempotencyKey: z.string().min(8),
  })
  .refine((i) => Boolean(i.serialNo) !== Boolean(i.quantity), {
    message: 'Provide a device number/IMEI for an individually tracked product or a quantity for a bulk/count-based product.',
  })
  .refine((i) => i.reason !== 'SALE' || i.salePrice !== undefined, {
    message: 'A SALE needs a selling price — the financial reports depend on it',
    path: ['salePrice'],
  });
export type StockOutInput = z.infer<typeof stockOutSchema>;

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(150).trim(),
  phone: z
    .string()
    .trim()
    .min(1, 'A mobile number is required.')
    .max(30)
    .refine(
      isBangladeshMobile,
      'Enter a valid Bangladeshi mobile number, such as 01712345678 or +8801712345678.',
    ),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const cartItemUpdateSchema = z.object({
  quantity: z.number().int().positive().max(10_000),
  actualUnitPrice: paisa,
});

export const cartDetailsSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  reference: z.string().max(100).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export const checkoutSchema = z.object({
  cartId: z.string().uuid(),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200),
});

/** Corrections: never edit a movement, write an opposing one. PLAN.md §8.3. */
export const correctionSchema = z.object({
  movementId: z.string().uuid(),
  note: z.string().min(1, 'A correction must say why').max(1000),
  actorId: z.string(),
  idempotencyKey: z.string().min(8),
});
export type CorrectionInput = z.infer<typeof correctionSchema>;

export const createUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email(),
  role: z.enum(ROLES).default('STAFF'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const searchSchema = z.object({
  q: z.string().min(1).max(120).trim(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const unitStatusSchema = z.enum(UNIT_STATUSES);
export const movementReasonSchema = z.enum(MOVEMENT_REASONS);

export const createWarrantyClaimSchema = z.object({
  serialNo: z.string().min(1).max(120).trim(),
  claimantName: z.string().max(150).optional().nullable(),
  claimantPhone: z.string().max(30).optional().nullable(),
  reportedIssue: z.string().min(5).max(2000).trim(),
  physicalCondition: z.string().max(1000).optional().nullable(),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type CreateWarrantyClaimInput = z.infer<typeof createWarrantyClaimSchema>;

export const transitionWarrantyClaimSchema = z.object({
  claimId: z.string().uuid(),
  expectedStatus: z.enum(RMA_STATUSES),
  nextStatus: z.enum(RMA_STATUSES),
  custody: z.enum(RMA_CUSTODIES).optional(),
  coverage: z.enum(RMA_COVERAGES).optional(),
  assignedToId: z.string().optional().nullable(),
  resolution: z.string().max(2000).optional().nullable(),
  note: z.string().min(1).max(2000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type TransitionWarrantyClaimInput = z.infer<typeof transitionWarrantyClaimSchema>;

export const warrantyHandoverSchema = z.object({
  claimId: z.string().uuid(),
  expectedStatus: z.enum(RMA_STATUSES),
  expectedCustody: z.enum(RMA_CUSTODIES),
  custody: z.enum(RMA_CUSTODIES),
  note: z.string().min(1).max(2000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type WarrantyHandoverInput = z.infer<typeof warrantyHandoverSchema>;

export const warrantyResolutionSchema = z.object({
  claimId: z.string().uuid(),
  expectedStatus: z.enum(RMA_STATUSES),
  outcome: z.enum(['REPLACEMENT', 'RESTOCK', 'WRITEOFF']),
  replacementSerial: z.string().max(120).optional(),
  note: z.string().min(1).max(2000),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type WarrantyResolutionInput = z.infer<typeof warrantyResolutionSchema>;

export const supplierWarrantyCaseSchema = z.object({
  claimId: z.string().uuid(),
  supplierId: z.string().uuid(),
  reference: z.string().max(100).optional().nullable(),
  status: z.enum(SUPPLIER_WARRANTY_STATUSES),
  coverage: z.enum(RMA_COVERAGES),
  resolution: z.string().max(2000).optional().nullable(),
  actorId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});
export type SupplierWarrantyCaseInput = z.infer<typeof supplierWarrantyCaseSchema>;
