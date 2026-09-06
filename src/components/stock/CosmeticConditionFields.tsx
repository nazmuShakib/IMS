'use client';
import { useId } from 'react';
import type { MessageKey } from '@/lib/i18n/messages';
import type { CosmeticCondition } from '@/domain/types';
import { COSMETIC_WEAR } from '@/domain/types';
import { cosmeticLabels, cosmeticParts } from '@/lib/cosmetic-condition';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Select, Textarea } from '@/components/ui';

export function CosmeticConditionFields({ value, errors = {}, errorIdPrefix }: { value?: CosmeticCondition | null; errors?: Record<string, string>; errorIdPrefix?: string }) {
  const { t, message } = useI18n();
  const generatedId = useId();
  const id = errorIdPrefix ?? generatedId;
  const localize = (value: string) => value.startsWith('used.') ? t(value as MessageKey) : message(value);
  return <div className="space-y-3">
    <p className="text-sm text-graphite">{t('used.appearance.help')}</p>
    <div className="grid gap-3 sm:grid-cols-3">{cosmeticParts.map(part => <label key={part} className="block text-sm">
      <span className="mb-1.5 block font-medium">{t(`used.appearance.${part}`)}</span>
      <Select name={`cosmetic.${part}`} defaultValue={value?.[part] ?? ''} aria-invalid={Boolean(errors[`cosmetic.${part}`])} aria-describedby={errors[`cosmetic.${part}`] ? `${id}-cosmetic.${part}-error` : undefined}>
        <option value="">{t('common.notRecorded')}</option>
        {COSMETIC_WEAR.map(wear => <option key={wear} value={wear}>{t(cosmeticLabels[wear])}</option>)}
      </Select>
      {errors[`cosmetic.${part}`] && <span id={`${id}-cosmetic.${part}-error`} className="mt-1 block text-xs text-out">{localize(errors[`cosmetic.${part}`] ?? '')}</span>}
    </label>)}</div>
    <label className="block text-sm"><span className="mb-1.5 block font-medium">{t('used.appearance.note')}</span>
      <Textarea name="cosmetic.note" maxLength={1000} rows={2} defaultValue={value?.note ?? ''} placeholder={t('used.appearance.placeholder')} aria-invalid={Boolean(errors['cosmetic.note'])} aria-describedby={errors['cosmetic.note'] ? `${id}-cosmetic.note-error` : undefined} />
      {errors['cosmetic.note'] && <span id={`${id}-cosmetic.note-error`} className="mt-1 block text-xs text-out">{localize(errors['cosmetic.note'])}</span>}
    </label>
  </div>;
}
