'use client';

import { useActionState, useState } from 'react';
import { CosmeticConditionFields } from './CosmeticConditionFields';
import { updateUsedDeviceAction } from '@/actions/used-devices';
import { Button, Field, MonoInput, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { ProductUnitDTO } from '@/lib/dto';
import type { MessageKey } from '@/lib/i18n/messages';
import { toTaka } from '@/lib/money';

export function UsedDeviceDetailsForm({ unit }: { unit: ProductUnitDTO }) {
  const { t, message } = useI18n();
  const localize = (value: string) => value.startsWith('used.') ? t(value as MessageKey) : message(value);
  const [state, action, pending] = useActionState(updateUsedDeviceAction, {});
  const [batteryHealth, setBatteryHealth] = useState(unit.batteryHealth === null ? '' : String(unit.batteryHealth));
  const [warrantyUnit, setWarrantyUnit] = useState(unit.warrantyDays != null ? 'DAYS' : 'MONTHS');
  const warrantyDuration = unit.warrantyDays ?? unit.warrantyMonths ?? '';
  const effectiveAskingPrice = unit.askingPrice
    ?? (unit.usedGrade === 'REFURBISHED' ? unit.costPrice ?? null : null);
  return (
    <details className="mt-2 w-full rounded-[3px] border border-rule bg-card">
      <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-medium">{t('used.editDetails')}</summary>
      <form action={action} className="grid gap-2 border-t border-rule p-2.5 sm:grid-cols-2">
        <input type="hidden" name="unitId" value={unit.id} />
        <Field label={t('used.grade')}><Select name="grade" defaultValue={unit.usedGrade ?? 'GRADE_B'}><option value="GRADE_A">{t('used.gradeA')}</option><option value="GRADE_B">{t('used.gradeB')}</option><option value="GRADE_C">{t('used.gradeC')}</option><option value="REFURBISHED">{t('used.refurbished')}</option></Select></Field>
        <Field label={t('used.askingPrice')} error={state.fieldErrors?.askingPrice ? localize(state.fieldErrors.askingPrice) : undefined}><MonoInput name="askingPrice" required inputMode="decimal" defaultValue={effectiveAskingPrice === null ? '' : toTaka(effectiveAskingPrice)} placeholder={t('used.askingPricePlaceholder')} /></Field>
        <Field label={t('used.batteryHealth')} error={state.fieldErrors?.batteryHealth ? localize(state.fieldErrors.batteryHealth) : undefined}>
          <MonoInput name="batteryHealth" type="number" min={0} max={100} value={batteryHealth} placeholder={t('common.notRecorded')} onChange={event => setBatteryHealth(event.target.value)} />
        </Field>
        <Field label={t('used.warrantyDuration')} error={state.fieldErrors?.warrantyDuration ? localize(state.fieldErrors.warrantyDuration) : undefined}>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <MonoInput name="warrantyDuration" type="number" min={0} max={warrantyUnit === 'DAYS' ? 3650 : 120} defaultValue={warrantyDuration} placeholder={t('used.warrantyPlaceholder')} />
            <Select name="warrantyUnit" value={warrantyUnit} onChange={event => setWarrantyUnit(event.target.value)}><option value="DAYS">{t('used.warrantyDays')}</option><option value="MONTHS">{t('used.warrantyMonths')}</option></Select>
          </div>
        </Field>
        <div className="sm:col-span-2"><CosmeticConditionFields value={unit.cosmeticCondition} errors={state.fieldErrors} /></div>
        <Field label={t('used.faults')} error={state.fieldErrors?.knownDefects ? localize(state.fieldErrors.knownDefects) : undefined}><Textarea name="knownDefects" defaultValue={unit.knownDefects ?? ''} rows={2} placeholder={t('used.knownDefectsPlaceholder')} /></Field>
        <Field label={t('used.accessories')}><Textarea name="includedAccessories" defaultValue={unit.includedAccessories ?? ''} rows={2} placeholder={t('used.accessoriesPlaceholder')} /></Field>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? t('common.saving') : t('common.saveChanges')}</Button>{(state.error || state.ok) && <p className={`mt-2 text-[11px] ${state.error ? 'text-out' : 'text-ok'}`}>{message(state.error ?? state.ok ?? '')}</p>}</div>
      </form>
    </details>
  );
}
