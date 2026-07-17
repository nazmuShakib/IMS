'use client';

import { useActionState } from 'react';

import { createUserAction, type UserActionState } from '@/actions/users';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserActionState, FormData>(createUserAction, {});

  return (
    <Card className="mb-4 p-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Name" error={state.fieldErrors?.name}>
          <Input name="name" required />
        </Field>
        <Field label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" required />
        </Field>
        <Field label="Temporary password" error={state.fieldErrors?.password}>
          <Input name="password" type="password" minLength={12} required />
        </Field>
        <Field label="Role" error={state.fieldErrors?.role}>
          <Select name="role" defaultValue="STAFF">
            <option value="STAFF">Staff</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Creating…' : 'Create user'}
          </Button>
        </div>
        {(state.error || state.ok) && (
          <p className={`sm:col-span-2 lg:col-span-5 text-[12px] ${state.error ? 'text-out' : 'text-ok'}`}>
            {state.error ?? state.ok}
          </p>
        )}
      </form>
    </Card>
  );
}
