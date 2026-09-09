import { z } from 'zod';
export const taxonomyNameSchema = z.string().trim().min(1, 'Enter a name.').max(100, 'Use 100 characters or fewer.').refine(value => /[\p{L}\p{N}]/u.test(value), 'Include at least one letter or number.');
export const taxonomyFormSchema = z.object({ name: taxonomyNameSchema });
export function taxonomyNameError(value: string): string | undefined {
  const parsed = taxonomyNameSchema.safeParse(value);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}
export function taxonomySlug(name: string, id: string, occupied: ReadonlySet<string>): string {
  const base = name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `item-${id}`;
  let result = base; let suffix = 0;
  while (occupied.has(result)) result = `${base}-${id}${suffix++ ? `-${suffix}` : ''}`;
  return result;
}
