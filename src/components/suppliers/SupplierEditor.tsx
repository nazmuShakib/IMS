'use client';

import { useActionState, useEffect, useState } from 'react';

import { updateSupplier } from '@/actions/catalog';
import { Button, Field, Input } from '@/components/ui';
import type { Supplier } from '@/domain/types';
import { useI18n } from '@/components/i18n/I18nProvider';

export function SupplierEditor({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  const { t, message } = useI18n();
  const [state, action, pending] = useActionState(updateSupplier, {});

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, pending]);

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {t('suppliers.editAction')}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-supplier-${supplier.id}`}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl"
          >
            <h2 id={`edit-supplier-${supplier.id}`} className="text-[16px] font-semibold">
              {t('suppliers.edit')}
            </h2>
            <p className="mt-1 text-[12px] text-graphite">
              {t('suppliers.editHelp')}
            </p>

            <form action={action} className="mt-5">
              <input type="hidden" name="id" value={supplier.id} />
              {state.error && (
                <p className="mb-3 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
                  {message(state.error)}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('common.name')} error={state.fieldErrors?.name}>
                  <Input name="name" required defaultValue={supplier.name} />
                </Field>
                <Field
                  label={t('customers.mobile')}
                  hint={t('customers.mobileHint')}
                  error={state.fieldErrors?.phone}
                >
                  <Input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="01712345678"
                    defaultValue={supplier.phone ?? ''}
                  />
                </Field>
                <Field label={t('common.email')} error={state.fieldErrors?.email}>
                  <Input name="email" type="email" defaultValue={supplier.email ?? ''} />
                </Field>
                <Field label={t('common.address')} error={state.fieldErrors?.address}>
                  <Input name="address" defaultValue={supplier.address ?? ''} />
                </Field>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? t('common.saving') : t('common.saveChanges')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
