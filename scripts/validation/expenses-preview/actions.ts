// Browser-only fixture actions. These never call the application or its database.
import { categories } from './data';
async function save(_state: unknown, data: FormData) {
  await new Promise(resolve => setTimeout(resolve, 600));
  if (data.get('description') === 'Reject') return { error: 'Could not save changes. Please try again.' };
  return { ok: 'Saved', reference: 'EXP-2026-99999' };
}
export const createExpenseAction = save, updateExpenseAction = save, voidExpenseAction = save;
export async function createExpenseCategoryAction(_state: unknown, data: FormData) {
  await new Promise(resolve => setTimeout(resolve, 600));
  const name = String(data.get('name'));
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return { fieldErrors: { name: 'An expense category with this name already exists.' } };
  categories.push({ ...categories[0]!, id: crypto.randomUUID(), name });
  dispatchEvent(new PopStateEvent('popstate'));
  return { ok: 'Saved', reference: name };
}
export async function updateExpenseCategoryAction(_state: unknown, data: FormData) {
  await new Promise(resolve => setTimeout(resolve, 600));
  const category = categories.find(c => c.id === data.get('categoryId'))!;
  category.name = String(data.get('name')); category.isActive = data.get('isActive') === 'true';
  dispatchEvent(new PopStateEvent('popstate'));
  return { ok: 'Saved', reference: category.name };
}
