'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requestAuditIp } from '@/lib/audit';
import { requireCapability } from '@/lib/session';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  voidExpenseFieldsSchema,
} from '@/schemas';
import {
  createExpense,
  createExpenseCategory,
  updateExpense,
  updateExpenseCategory,
  voidExpense,
  withExpenseAudit,
} from '@/services/expenses';

export interface ExpenseActionState {
  ok?: string;
  reference?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function failure(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
    return 'This record changed while saving. Please try again.';
  }
  return error instanceof Error ? error.message : fallback;
}

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function errors(error: z.ZodError): Record<string, string> {
  const output: Record<string, string> = {};
  for (const issue of error.issues) output[issue.path.join('.') || '_'] ??= issue.message;
  return output;
}

function expenseForm(data: FormData) {
  return {
    expenseDate: text(data, 'expenseDate'),
    categoryId: text(data, 'categoryId'),
    description: text(data, 'description'),
    amount: text(data, 'amount'),
    paidTo: text(data, 'paidTo'),
    paymentMethod: text(data, 'paymentMethod'),
    reference: text(data, 'reference'),
    note: text(data, 'note'),
  };
}

export async function createExpenseAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const parsed = createExpenseSchema.safeParse({ ...expenseForm(data), actorId: actor.id });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  try {
    const created = await withExpenseAudit({ actorId: actor.id, ip: await requestAuditIp(), action: 'operating_expense.create', entity: 'OperatingExpense' }, tx => createExpense(parsed.data, tx));
    revalidatePath('/expenses');
    revalidatePath('/');
    return { ok: `Recorded ${created.expenseNumber}.`, reference: created.expenseNumber };
  } catch (error) {
    return { error: failure(error, 'Could not record the expense.') };
  }
}

export async function updateExpenseAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const parsed = updateExpenseSchema.safeParse({
    ...expenseForm(data), expenseId: text(data, 'expenseId'), actorId: actor.id,
  });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  try {
    const updated = await withExpenseAudit({ actorId: actor.id, ip: await requestAuditIp(), action: 'operating_expense.update', entity: 'OperatingExpense', entityId: parsed.data.expenseId }, tx => updateExpense(parsed.data, tx));
    revalidatePath('/expenses');
    revalidatePath('/');
    return { ok: `Updated ${updated.expenseNumber}.`, reference: updated.expenseNumber };
  } catch (error) {
    return { error: failure(error, 'Could not update the expense.') };
  }
}

export async function voidExpenseAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('VOID_EXPENSES');
  const fields = voidExpenseFieldsSchema.safeParse({
    reason: text(data, 'reason'), confirmed: data.get('confirmed') === 'true',
  });
  if (!fields.success) return { fieldErrors: errors(fields.error) };
  const expenseId = text(data, 'expenseId');
  if (!expenseId) return { fieldErrors: { expenseId: 'Expense is required.' } };
  try {
    const updated = await withExpenseAudit({ actorId: actor.id, ip: await requestAuditIp(), action: 'operating_expense.void', entity: 'OperatingExpense', entityId: expenseId }, tx => voidExpense({ expenseId, actorId: actor.id, ...fields.data }, tx));
    revalidatePath('/expenses');
    revalidatePath('/');
    return { ok: `Voided ${updated.expenseNumber}.`, reference: updated.expenseNumber };
  } catch (error) {
    return { error: failure(error, 'Could not void the expense.') };
  }
}

export async function createExpenseCategoryAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const parsed = createExpenseCategorySchema.safeParse({ name: text(data, 'name') });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  try {
    const category = await withExpenseAudit({ actorId: actor.id, ip: await requestAuditIp(), action: 'expense_category.create', entity: 'ExpenseCategory' }, tx => createExpenseCategory(parsed.data, actor.id, tx));
    revalidatePath('/expenses');
    return { ok: 'Expense category added.', reference: category.name };
  } catch (error) {
    return { error: failure(error, 'Could not add the category.') };
  }
}

export async function updateExpenseCategoryAction(
  _previous: ExpenseActionState,
  data: FormData,
): Promise<ExpenseActionState> {
  const actor = await requireCapability('MANAGE_EXPENSES');
  const categoryId = text(data, 'categoryId');
  const parsed = createExpenseCategorySchema.safeParse({ name: text(data, 'name') });
  if (!parsed.success) return { fieldErrors: errors(parsed.error) };
  if (!categoryId) return { fieldErrors: { categoryId: 'Category is required.' } };
  try {
    const category = await withExpenseAudit({ actorId: actor.id, ip: await requestAuditIp(), action: 'expense_category.update', entity: 'ExpenseCategory', entityId: categoryId }, tx => updateExpenseCategory({ categoryId, name: parsed.data.name, isActive: text(data, 'isActive') === 'true' }, tx));
    revalidatePath('/expenses');
    return { ok: 'Expense category updated.', reference: category.name };
  } catch (error) {
    return { error: failure(error, 'Could not update the category.') };
  }
}
