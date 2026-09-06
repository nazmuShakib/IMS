import { z } from 'zod';
import { COSMETIC_WEAR, type CosmeticCondition } from '@/domain/types';
import { createTranslator, type MessageKey } from '@/lib/i18n/messages';

export const cosmeticConditionSchema = z.object({
  screen: z.enum(COSMETIC_WEAR).nullable(),
  frame: z.enum(COSMETIC_WEAR).nullable(),
  back: z.enum(COSMETIC_WEAR).nullable(),
  note: z.string().trim().max(1000).nullable(),
});
export const cosmeticParts = ['screen', 'frame', 'back'] as const;
export const cosmeticLabels: Record<(typeof COSMETIC_WEAR)[number], MessageKey> = {
  NO_VISIBLE_WEAR: 'used.appearance.clean', LIGHT_SCRATCHES: 'used.appearance.light',
  NOTICEABLE_WEAR: 'used.appearance.noticeable', HEAVY_WEAR: 'used.appearance.heavy', DAMAGED: 'used.appearance.damaged',
};
export function cosmeticFormInput(data: FormData) {
  const text = (name: string) => String(data.get(`cosmetic.${name}`) ?? '').trim() || null;
  const value = { screen: text('screen'), frame: text('frame'), back: text('back'), note: text('note') };
  return Object.values(value).some(Boolean) ? value : null;
}
export function cosmeticSummary(value: CosmeticCondition | null | undefined, t = createTranslator('en')): string {
  if (!value) return '';
  return [...cosmeticParts.flatMap(part => value[part] ? [`${t(`used.appearance.${part}`)}: ${t(cosmeticLabels[value[part]])}`] : []), ...(value.note ? [value.note] : [])].join(' · ');
}
