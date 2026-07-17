import type { Paisa } from '@/lib/money';

/**
 * These mirror prisma/schema.prisma exactly (PLAN.md §6). When the Prisma client
 * is generated in Phase 1, these can be replaced by its generated types — but the
 * shapes must stay identical, or the repository swap stops being a one-liner.
 */

export const ROLES = ['ADMIN', 'MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const TRACKING_TYPES = ['SERIAL', 'QUANTITY'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const UNIT_STATUSES = [
  'IN_STOCK',
  'RESERVED',
  'SOLD',
  'RETURNED',
  'DAMAGED',
  'LOST',
  /** Created in error and reversed out. Never counted as stock, never as a sale. */
  'VOID',
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_REASONS = [
  'INITIAL_STOCK',
  'PURCHASE',
  'CUSTOMER_RETURN',
  'SALE',
  'RETURN_TO_SUPPLIER',
  'DAMAGE',
  'LOSS',
  'INTERNAL_USE',
  'CORRECTION',
  'STOCK_COUNT',
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/** Which reasons put stock IN vs take it OUT. The sign of `quantity` follows from this. */
export const INBOUND_REASONS: readonly MovementReason[] = [
  'INITIAL_STOCK',
  'PURCHASE',
  'CUSTOMER_RETURN',
];
export const OUTBOUND_REASONS: readonly MovementReason[] = [
  'SALE',
  'RETURN_TO_SUPPLIER',
  'DAMAGE',
  'LOSS',
  'INTERNAL_USE',
];

/** Where a unit ends up after an outbound movement. */
export const OUTBOUND_UNIT_STATUS: Record<string, UnitStatus> = {
  SALE: 'SOLD',
  DAMAGE: 'DAMAGED',
  LOSS: 'LOST',
  RETURN_TO_SUPPLIER: 'RETURNED',
  INTERNAL_USE: 'SOLD',
};

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  model: string | null;
  trackingType: TrackingType;
  categoryId: string;
  brandId: string | null;
  defaultCostPrice: Paisa;
  defaultSalePrice: Paisa;
  taxRate: number; // basis points; unused in v1
  reorderPoint: number;
  /** CACHE. Authoritative only for trackingType = QUANTITY. See PLAN.md §5.2. */
  quantityOnHand: number;
  /** Maintained only for trackingType = QUANTITY. */
  avgCostPrice: Paisa;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductUnit {
  id: string;
  serialNo: string;
  productId: string;
  status: UnitStatus;
  costPrice: Paisa;
  salePrice: Paisa | null;
  supplierId: string | null;
  receivedAt: string;
  soldAt: string | null;
  warrantyMonths: number | null;
  warrantyExpiresAt: string | null;
  location: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  type: MovementType;
  reason: MovementReason;
  productId: string;
  unitId: string | null;
  /** SIGNED. Positive = into stock, negative = out. Never zero. PLAN.md §5.1. */
  quantity: number;
  unitCost: Paisa;
  unitPrice: Paisa | null;
  supplierId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  reference: string | null;
  note: string | null;
  actorId: string | null;
  idempotencyKey: string | null;
  reversesId: string | null;
  createdAt: string;
  /** NOTE: no updatedAt. Append-only. */
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}
