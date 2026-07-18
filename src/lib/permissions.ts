import type { Role } from '@/domain/types';

export const CAPABILITIES = [
  'VIEW_STOCK',
  'MOVE_STOCK',
  'VIEW_COSTS',
  'VIEW_REPORTS',
  'MANAGE_CATALOG',
  'CORRECT_STOCK',
  'MANAGE_USERS',
  'ARCHIVE_PRODUCTS',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** PLAN.md §9.1. This is the canonical role matrix for every security boundary. */
export const CAPABILITY_ROLES: Record<Capability, readonly Role[]> = {
  VIEW_STOCK: ['ADMIN', 'MANAGER', 'STAFF'],
  MOVE_STOCK: ['ADMIN', 'MANAGER', 'STAFF'],
  VIEW_COSTS: ['ADMIN', 'MANAGER'],
  VIEW_REPORTS: ['ADMIN', 'MANAGER'],
  MANAGE_CATALOG: ['ADMIN', 'MANAGER'],
  CORRECT_STOCK: ['ADMIN', 'MANAGER'],
  MANAGE_USERS: ['ADMIN'],
  ARCHIVE_PRODUCTS: ['ADMIN'],
};

export function hasPermission(role: Role, capability: Capability): boolean {
  return CAPABILITY_ROLES[capability].includes(role);
}

export function canSeeCosts(role: Role): boolean {
  return hasPermission(role, 'VIEW_COSTS');
}

export function canUseAccount(account: { isActive: boolean; banned: boolean }): boolean {
  return account.isActive && !account.banned;
}
