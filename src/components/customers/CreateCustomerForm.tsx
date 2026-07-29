'use client';

import { useActionState } from 'react';

import { createCustomerAction } from '@/actions/checkout';
import { Button, Field, Input, MonoInput } from '@/components/ui';

export function CreateCustomerForm() {
  const [state, action, pending] = useActionState(createCustomerAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Name"><Input name="name" required maxLength={150} /></Field>
      <Field label="Bangladeshi mobile">
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
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create customer'}</Button>
        {state.error && <p className="mt-2 text-[12px] text-out">{state.error}</p>}
        {state.ok && <p className="mt-2 text-[12px] text-ok">{state.ok}</p>}
      </div>
    </form>
  );
}
