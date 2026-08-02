'use client';

import { useActionState } from 'react';

import { createCustomerAction } from '@/actions/checkout';
import { Button, Field, Input, MonoInput } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export function CreateCustomerForm() {
  const [state, action, pending] = useActionState(createCustomerAction, {});
  const { t, message } = useI18n();
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label={t('common.name')}><Input name="name" required maxLength={150} /></Field>
      <Field label={t('customers.mobile')}>
        <MonoInput
          name="phone"
          type="tel"
          inputMode="tel"
          required
          maxLength={30}
          placeholder="01712345678"
        />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? t('customers.creating') : t('customers.create')}</Button>
        {state.error && <p className="mt-2 text-[12px] text-out">{message(state.error)}</p>}
        {state.ok && <p className="mt-2 text-[12px] text-ok">{message(state.ok)}</p>}
      </div>
    </form>
  );
}
