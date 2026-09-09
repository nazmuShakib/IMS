'use client';

import { useActionState, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { ActionState } from '@/actions/catalog';
import { Button, Card, Field, Input } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { taxonomyNameError } from '@/lib/taxonomy-form';

export interface FieldSpec { name: string; label: string; placeholder?: string; type?: string; required?: boolean }
/** Also used by Suppliers: taxonomy-specific validation/layout is opt-in. */
export function QuickCreateForm({ action, fields, submitLabel, taxonomyKind }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields: FieldSpec[]; submitLabel: string; taxonomyKind?: 'category' | 'brand';
}) {
  const { t, message } = useI18n();
  const id = useId(); const ref = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd);
    setErrors(result.fieldErrors ?? {});
    if (!result.error && !result.fieldErrors) { setValues({}); requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>('input')?.focus()); }
    else requestAnimationFrame(() => ref.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
    return result;
  }, {});
  function validate(event: FormEvent) {
    if (!taxonomyKind) return;
    const error = taxonomyNameError(values.name ?? '');
    if (error) { event.preventDefault(); setErrors({ name: error }); ref.current?.querySelector<HTMLInputElement>('input')?.focus(); }
  }
  const path = taxonomyKind === 'category' ? '/categories' : '/brands';
  return <Card className="p-4">
    <form ref={ref} action={formAction} onSubmit={validate}>
      {state.error && <p role="alert" className="mb-3 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">{message(state.error)}</p>}
      <fieldset disabled={pending} className={taxonomyKind ? 'grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]' : ''}>
        <div className={taxonomyKind ? '' : 'grid gap-3 sm:grid-cols-2'}>{fields.map(f => <Field key={f.name} inputId={`${id}-${f.name}`} label={f.label} error={errors[f.name] && message(errors[f.name]!)} errorId={`${id}-${f.name}-error`}>
          <Input id={`${id}-${f.name}`} name={f.name} type={f.type ?? 'text'} required={f.required} placeholder={f.placeholder} maxLength={taxonomyKind ? 100 : undefined}
            value={values[f.name] ?? ''} aria-invalid={Boolean(errors[f.name])} aria-describedby={errors[f.name] ? `${id}-${f.name}-error` : undefined}
            onChange={event => { const value = event.target.value; setValues(current => ({ ...current, [f.name]: value })); if (taxonomyKind && errors[f.name]) setErrors(current => ({ ...current, [f.name]: taxonomyNameError(value) ?? '' })); }} />
        </Field>)}</div>
        <div className={taxonomyKind ? 'sm:pt-[23px]' : 'mt-4'}><Button type="submit" disabled={pending}>{pending ? t('common.saving') : submitLabel}</Button></div>
      </fieldset>
      {state.existing && !state.existing.isActive && taxonomyKind && <Link className="mt-3 inline-block text-[12px] text-signal underline" href={`${path}?status=removed&query=${encodeURIComponent(state.existing.name)}`}>{t('taxonomy.showRemoved')}</Link>}
      {state.ok && <div className="mt-3 text-[12px] text-ok" role="status">{message(state.ok)} {state.savedName}<Link href={path} className="ml-3 text-signal underline">{t('taxonomy.showActive')}</Link></div>}
    </form>
  </Card>;
}
