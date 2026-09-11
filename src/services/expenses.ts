import type { OperatingExpense } from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { db } from '@/repositories';
import type { Repositories } from '@/repositories';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  voidExpenseFieldsSchema,
} from '@/schemas';

export { parseExpenseQuery, summarizeExpenses, expenseRepositoryFilters } from '@/lib/expense-query';
export type { ExpenseQuery, ExpenseSummary } from '@/lib/expense-query';
import type { ExpenseQuery } from '@/lib/expense-query';
export async function listExpenses(query: ExpenseQuery, repositories: Repositories = db): Promise<OperatingExpense[]> {
  return repositories.operatingExpenses.findForExport(query);
}
export async function getExpensePage(query: ExpenseQuery, repositories: Repositories = db) {
  return repositories.operatingExpenses.findPage(query);
}

function expenseDateIso(value: string): string {
  return new Date(`${value}T00:00:00+06:00`).toISOString();
}

export async function createExpense(raw: unknown, repositories: Repositories = db) {
  const input = createExpenseSchema.parse(raw);
  return repositories.transaction(async (tx) => {
    const category = await tx.expenseCategories.findById(input.categoryId);
    if (!category?.isActive) throw new Error('Choose an active expense category.');
    const now = new Date();
    const timestamp = now.toISOString();
    const value: OperatingExpense = {
      id: uuidv7(),
      expenseNumber: await tx.operatingExpenses.nextExpenseNumber(now),
      expenseDate: expenseDateIso(input.expenseDate),
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      paidTo: input.paidTo,
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      note: input.note,
      status: 'ACTIVE',
      recordedById: input.actorId,
      updatedById: input.actorId,
      voidedById: null,
      voidedAt: null,
      voidReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return tx.operatingExpenses.create(value);
  });
}

export async function updateExpense(raw: unknown, repositories: Repositories = db) {
  const input = updateExpenseSchema.parse(raw);
  const existing = await repositories.operatingExpenses.findById(input.expenseId);
  if (!existing) throw new Error('Expense not found.');
  if (existing.status !== 'ACTIVE') throw new Error('A voided expense cannot be edited.');
  const category = await repositories.expenseCategories.findById(input.categoryId);
  if (!category || (!category.isActive && category.id !== existing.categoryId)) {
    throw new Error('Choose an active expense category.');
  }
  return repositories.operatingExpenses.update(existing.id, {
    expenseDate: expenseDateIso(input.expenseDate),
    categoryId: input.categoryId,
    description: input.description,
    amount: input.amount,
    paidTo: input.paidTo,
    paymentMethod: input.paymentMethod,
    reference: input.reference,
    note: input.note,
    updatedById: input.actorId,
    updatedAt: new Date().toISOString(),
  });
}

export async function voidExpense(
  raw: { expenseId: string; actorId: string; reason: string; confirmed: boolean },
  repositories: Repositories = db,
) {
  const fields = voidExpenseFieldsSchema.parse({ reason: raw.reason, confirmed: raw.confirmed });
  const existing = await repositories.operatingExpenses.findById(raw.expenseId);
  if (!existing) throw new Error('Expense not found.');
  if (existing.status !== 'ACTIVE') throw new Error('This expense is already voided.');
  const now = new Date().toISOString();
  return repositories.operatingExpenses.void(existing.id, {
    status: 'VOIDED',
    voidedById: raw.actorId,
    voidedAt: now,
    voidReason: fields.reason,
    updatedById: raw.actorId,
    updatedAt: now,
  });
}

export async function createExpenseCategory(
  raw: unknown,
  _actorId: string,
  repositories: Repositories = db,
) {
  const input = createExpenseCategorySchema.parse(raw);
  const existing = await repositories.expenseCategories.findAll();
  if (existing.some((item) => item.name.localeCompare(input.name, undefined, { sensitivity: 'accent' }) === 0)) {
    throw new Error('An expense category with this name already exists.');
  }
  const timestamp = new Date().toISOString();
  return repositories.expenseCategories.create({
    id: uuidv7(), name: input.name, isActive: true, createdAt: timestamp, updatedAt: timestamp,
  });
}

export async function updateExpenseCategory(
  raw: { categoryId: string; name: string; isActive: boolean },
  repositories: Repositories = db,
) {
  const input = createExpenseCategorySchema.parse({ name: raw.name });
  const current = await repositories.expenseCategories.findById(raw.categoryId);
  if (!current) throw new Error('Expense category not found.');
  const existing = await repositories.expenseCategories.findAll();
  if (existing.some((item) => item.id !== current.id && item.name.localeCompare(input.name, undefined, { sensitivity: 'accent' }) === 0)) {
    throw new Error('An expense category with this name already exists.');
  }
  return repositories.expenseCategories.update(current.id, {
    name: input.name,
    isActive: raw.isActive,
    updatedAt: new Date().toISOString(),
  });
}

/** PostgreSQL rolls back mutation and audit together. JSON uses its existing process
 * lock; its multi-file writes are not crash-safe transactions. */
export async function withExpenseAudit<T extends { id: string }>(
  context: { actorId: string; ip: string | null; action: string; entity: 'OperatingExpense' | 'ExpenseCategory'; entityId?: string },
  mutate: (tx: Repositories) => Promise<T>,
  repositories: Repositories = db,
): Promise<T> {
  return repositories.transaction(async tx => {
    const repository = context.entity === 'OperatingExpense' ? tx.operatingExpenses : tx.expenseCategories;
    const before = context.entityId ? await repository.findById(context.entityId) : null;
    const after = await mutate(tx);
    await tx.auditLogs.create({ id: uuidv7(), ...context, entityId: after.id, before, after, createdAt: new Date().toISOString() });
    return after;
  }, { isolationLevel: 'Serializable' });
}
