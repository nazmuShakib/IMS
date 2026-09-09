'use client';

import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { createCustomerAction, type CustomerActionState } from '@/actions/checkout';
import { Button, Field, Input, MonoInput } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { createCustomerSchema, type CreateCustomerInput } from '@/schemas';

type CustomerFields = Pick<CreateCustomerInput, 'name' | 'phone'>;
type CustomerFieldErrors = Partial<Record<keyof CustomerFields, string>>;

const EMPTY_VALUES: CustomerFields = { name: '', phone: '' };

export function CreateCustomerForm({
  stacked = false,
  onCreated,
  submitLabel,
  onCancel,
  onPendingChange,
}: {
  submitLabel?: string;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  stacked?: boolean;
  onCreated?: (customerId: string) => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(true);
  const handled = useRef<string | undefined>(undefined);
  const [state, action, pending] = useActionState<CustomerActionState, FormData>(createCustomerAction, {});
  const { t, message } = useI18n();
  const [values, setValues] = useState<CustomerFields>(EMPTY_VALUES);
  const onCreatedRef = useRef(onCreated);
  const [clientErrors, setClientErrors] = useState<CustomerFieldErrors>({});
  const [clearedServerErrors, setClearedServerErrors] = useState<Set<keyof CustomerFields>>(() => new Set());

  useEffect(() => { onPendingChange?.(pending); }, [pending, onPendingChange]);

  useEffect(() => {
    setFeedbackVisible(true);
  }, [state]);

  useEffect(() => {
    setClearedServerErrors(new Set());
  }, [state.fieldErrors]);

  useEffect(() => {
    if (!pending && state.fieldErrors && clearedServerErrors.size === 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [pending, state.fieldErrors, clearedServerErrors]);

  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    if (!pending && state.ok && state.customerId !== handled.current) {
      handled.current = state.customerId;
      setValues(EMPTY_VALUES);
      setClientErrors({});
      if (state.customerId) onCreatedRef.current?.(state.customerId);
    }
  }, [pending, state.customerId, state.ok]);

  function update(field: keyof CustomerFields, value: string) {
    setFeedbackVisible(false);
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => ({ ...current, [field]: undefined }));
    setClearedServerErrors((current) => new Set(current).add(field));
  }

  function validate(event: FormEvent<HTMLFormElement>) {
    setFeedbackVisible(false);
    if (pending) { event.preventDefault(); return; }
    const parsed = createCustomerSchema.safeParse(values);
    if (parsed.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    const fields = parsed.error.flatten().fieldErrors;
    setClientErrors({ name: fields.name?.[0], phone: fields.phone?.[0] });
    formRef.current?.querySelector<HTMLElement>(fields.name ? '[name="name"]' : '[name="phone"]')?.focus();
  }

  const fieldError = (field: keyof CustomerFields) => {
    const error = clientErrors[field]
      ?? (clearedServerErrors.has(field) ? undefined : state.fieldErrors?.[field]);
    return error ? message(error) : undefined;
  };

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={validate}
      noValidate
    >
      <fieldset disabled={pending} className={stacked ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}>
        <Field label={t('common.name')} inputId={`${id}-name`} errorId={`${id}-name-error`} error={fieldError('name')}>
          <Input
            id={`${id}-name`} required autoComplete="name" aria-describedby={fieldError('name') ? `${id}-name-error` : undefined}
            name="name"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            aria-invalid={Boolean(fieldError('name'))}
            maxLength={150}
          />
        </Field>
        <Field label={t('customers.mobile')} inputId={`${id}-phone`} errorId={`${id}-phone-error`} error={fieldError('phone')}>
          <MonoInput
            id={`${id}-phone`} required autoComplete="tel" aria-describedby={`${id}-phone-hint${fieldError('phone') ? ` ${id}-phone-error` : ''}`}
            name="phone"
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(event) => update('phone', event.target.value)}
            aria-invalid={Boolean(fieldError('phone'))}
            maxLength={30}
            placeholder="01712345678"
          />
          <span id={`${id}-phone-hint`} className="mt-1 block text-[12px] text-graphite">{t('customers.mobileHint')}</span>
        </Field>
        <div className={stacked ? '' : 'sm:col-span-2'}>
          <Button type="submit" disabled={pending}>
            {pending ? t('customers.creating') : submitLabel ?? t('customers.create')}
          </Button>
          {onCancel && <Button type="button" variant="ghost" className="ml-2" onClick={onCancel} disabled={pending}>{t('common.cancel')}</Button>}
          {feedbackVisible && state.error && <p role="alert" className="mt-2 text-[12px] text-out">{message(state.error)}</p>}
          {feedbackVisible && state.ok && <p role="status" className="mt-2 text-[12px] text-ok">{message(state.ok)}</p>}
        </div>
      </fieldset>
    </form>
  );
}
