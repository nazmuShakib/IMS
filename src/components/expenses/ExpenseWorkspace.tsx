'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, FileDown, FileText, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { createExpenseAction, createExpenseCategoryAction, updateExpenseAction, updateExpenseCategoryAction, voidExpenseAction, type ExpenseActionState } from '@/actions/expenses';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { CatalogPagination } from '@/components/catalog/CatalogPagination';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { Badge, Button, Card, Field, Input, Select, TableViewport, Textarea } from '@/components/ui';
import { PAYMENT_METHODS, type ExpenseCategory, type OperatingExpense, type Role } from '@/domain/types';
import { domainLabel } from '@/lib/i18n/domain';
import type { MessageKey } from '@/lib/i18n/messages';
import { formatBDT } from '@/lib/money';
import { createExpenseCategorySchema, expenseFieldsSchema, voidExpenseFieldsSchema } from '@/schemas';
import { ExpenseQueryError, expenseDateKey, expenseDisplayDate, expenseUrl, parseExpenseQuery, type ExpenseQuery, type ExpensePage } from '@/lib/expense-query';
import type { RawParams } from '@/lib/catalog-query';

type NamedUser = { id: string; name: string };
const defaults = { query: '', from: '', to: '', categoryId: '', paymentMethod: '', recordedById: '', status: '', minAmount: '', maxAmount: '', order: 'newest', groupBy: 'none' };
type FilterValues = typeof defaults;
function filtersFrom(query: ExpenseQuery): FilterValues {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const value = query[key as keyof ExpenseQuery];
    return [key, value === undefined ? fallback : String(key === 'minAmount' || key === 'maxAmount' ? Number(value) / 100 : value)];
  })) as FilterValues;
}
const filterLabels: Record<keyof FilterValues, MessageKey> = { query: 'common.search', from: 'expenses.from', to: 'expenses.to', categoryId: 'expenses.category', paymentMethod: 'expenses.paymentMethod', recordedById: 'expenses.recordedBy', status: 'common.status', minAmount: 'expenses.minimum', maxAmount: 'expenses.maximum', order: 'expenses.orderBy', groupBy: 'expenses.groupBy' };

export function ExpenseWorkspace({ role, query, result, categories, users, initialErrors = {}, invalidValues }: {
  role: Role; query: ExpenseQuery; result: ExpensePage; categories: ExpenseCategory[]; users: NamedUser[];
  initialErrors?: Record<string, string>; invalidValues?: RawParams;
}) {
  const { t, message, locale } = useI18n(), router = useRouter();
  const [values, setValues] = useState<FilterValues>(() => ({ ...filtersFrom(query), ...invalidValues } as FilterValues));
  const [errors, setErrors] = useState(initialErrors);
  const [pending, startNavigation] = useTransition();
  const [editing, setEditing] = useState<OperatingExpense | 'new' | null>(null), [voiding, setVoiding] = useState<OperatingExpense | null>(null), [viewing, setViewing] = useState<OperatingExpense | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const filterSignature = expenseUrl(query, false);
  const lastFilter = useRef(filterSignature);
  const invalidSignature = JSON.stringify(invalidValues ?? {});
  const lastInvalid = useRef(invalidSignature);
  useEffect(() => {
    if (lastFilter.current !== filterSignature || lastInvalid.current !== invalidSignature) {
      setValues({ ...filtersFrom(query), ...invalidValues } as FilterValues); setErrors(initialErrors);
      lastFilter.current = filterSignature; lastInvalid.current = invalidSignature;
    }
  }, [filterSignature, query, invalidSignature, invalidValues, initialErrors]);
  const categoryById = new Map(categories.map(item => [item.id, item.name]));
  const userById = new Map(users.map(item => [item.id, item.name]));
  function navigate(next: ExpenseQuery) {
    const url = expenseUrl(next);
    if (formInvalid || url !== expenseUrl({ ...query, page: result.page })) startNavigation(() => router.push(url, { scroll: false }));
  }
  function apply(next: FilterValues) {
    try { const parsed = parseExpenseQuery({ ...next, pageSize: String(query.pageSize) }); setErrors({}); setValues(filtersFrom(parsed)); navigate(parsed); }
    catch (error) { if (error instanceof ExpenseQueryError) { setErrors(error.details); requestAnimationFrame(() => document.querySelector<HTMLElement>('#expense-filters [aria-invalid="true"]')?.focus()); } else throw error; }
  }
  const exportParams = new URLSearchParams(filterSignature.split('?')[1]);
  const summary = result.summary;
  const grouped = query.groupBy === 'category' ? summary.byCategory.map(item => ({ id: item.categoryId, label: item.name || t('expenses.unknownCategory'), amount: item.amount })) : summary.byPaymentMethod.map(item => ({ id: item.paymentMethod, label: domainLabel(t, item.paymentMethod), amount: item.amount }));
  const hasFilters = Object.entries(filtersFrom(query)).some(([key, value]) => !['order', 'groupBy'].includes(key) && value !== '');
  const formInvalid = Object.keys(initialErrors).length > 0;
  function actions(item: OperatingExpense) { return <div className="inline-flex items-center gap-1.5">
    <button type="button" className="rounded border border-rule p-2 text-signal hover:bg-plate" title={t('expenses.details')} aria-label={`${t('expenses.details')} ${item.expenseNumber}`} onClick={() => setViewing(item)}><Eye size={15} aria-hidden="true" /></button>
    {item.status === 'ACTIVE' && <><button type="button" className="rounded border border-rule p-2 hover:bg-plate" aria-label={`${t('expenses.edit')} ${item.expenseNumber}`} onClick={() => setEditing(item)}><Pencil size={15} /></button>{role === 'ADMIN' && <button type="button" className="rounded border border-out/30 p-2 text-out hover:bg-out-wash" aria-label={`${t('expenses.void')} ${item.expenseNumber}`} onClick={() => setVoiding(item)}><Trash2 size={15} /></button>}</>}
  </div>; }
  return <>
    <header className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div><h1 className="text-[22px] font-semibold tracking-tight">{t('expenses.title')}</h1><p className="mt-1 text-[12px] text-graphite">{t('expenses.subtitle')}</p></div>
      <div className="flex flex-wrap gap-2" inert={pending || undefined}>
        <Button onClick={() => setEditing('new')} disabled={pending}><Plus size={16} className="mr-1.5" />{t('expenses.add')}</Button>
        <button type="button" className="inline-flex h-9 items-center rounded-[3px] border border-graphite bg-graphite px-3.5 text-[13px] font-medium text-white hover:bg-ink disabled:opacity-50" onClick={() => setCategoriesOpen(true)} disabled={pending}><Settings2 size={16} className="mr-1.5" />{t('expenses.manageCategories')}</button>
        {(['csv', 'pdf'] as const).map(format => { const params = new URLSearchParams(exportParams); params.set('format', format); const Icon = format === 'csv' ? FileDown : FileText; return <a key={format} href={pending || formInvalid ? undefined : `/api/expenses/export?${params}`} aria-disabled={pending || formInvalid || undefined} className={`inline-flex h-9 items-center rounded-[3px] px-3.5 text-[13px] font-medium text-white aria-disabled:opacity-50 ${format === 'csv' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'}`}><Icon size={16} className="mr-1.5" />{t(format === 'csv' ? 'expenses.exportCsv' : 'expenses.exportPdf')}</a>; })}
      </div>
    </header>

    <Card className="mb-4 p-4"><form id="expense-filters" noValidate onSubmit={e => { e.preventDefault(); apply(values); }}>
      {Object.keys(errors).length > 0 && <p role="alert" className="mb-3 text-[13px] text-out">{t('expenses.invalidFilters')}</p>}
      <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(defaults) as Array<keyof FilterValues>).map(key => {
          const options: Array<[string, string]> | undefined = key === 'categoryId' ? [['', t('expenses.allCategories')], ...categories.map(c => [c.id, `${c.name}${c.isActive ? '' : ` (${t('common.inactive')})`}`] as [string, string])] : key === 'paymentMethod' ? [['', t('expenses.allMethods')], ...PAYMENT_METHODS.map(m => [m, domainLabel(t, m)] as [string, string])] : key === 'recordedById' ? [['', t('expenses.allUsers')], ...users.map(u => [u.id, u.name] as [string, string])] : key === 'status' ? [['', t('expenses.activeAndVoided')], ['ACTIVE', t('common.active')], ['VOIDED', t('expenses.voided')]] : key === 'order' ? [['newest', t('expenses.newest')], ['oldest', t('expenses.oldest')], ['amount-desc', t('expenses.highestFirst')], ['amount-asc', t('expenses.lowestFirst')]] : key === 'groupBy' ? [['none', t('expenses.noGrouping')], ['category', t('expenses.groupCategory')], ['payment', t('expenses.groupPayment')]] : undefined;
          return <ExpenseField key={key} name={key} label={t(filterLabels[key])} error={errors[key] ? message(errors[key]) : undefined}>{attrs => options ? <Select {...attrs} value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select> : <Input {...attrs} value={values[key]} type={key === 'from' || key === 'to' ? 'date' : key === 'query' ? 'search' : 'text'} inputMode={key.endsWith('Amount') ? 'decimal' : undefined} placeholder={key === 'query' ? t('expenses.searchPlaceholder') : undefined} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />}</ExpenseField>;
        })}
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4"><Button>{t('common.applyFilters')}</Button><Button type="button" variant="ghost" onClick={() => apply(defaults)}>{t('common.reset')}</Button></div>
      </fieldset>
    </form></Card>
    {!formInvalid && <div className="relative" aria-busy={pending}>
      <div inert={pending || undefined}>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <SummaryCard label={t('expenses.total')} value={formatBDT(summary.activeTotal)} tone="amber" />
          <SummaryCard label={t('expenses.entries')} value={summary.activeCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')} tone="blue" />
          <SummaryCard label={t('expenses.voidedEntries')} value={summary.voidedCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')} tone="rose" />
        </div>
        {query.groupBy !== 'none' && <Card className="mb-4"><h2 className="border-b border-rule px-4 py-3 text-[13px] font-semibold">{t(query.groupBy === 'category' ? 'expenses.byCategory' : 'expenses.byPayment')}</h2><div className="max-h-48 overflow-y-auto">{grouped.length ? grouped.map(item => <div key={item.id} className="flex justify-between gap-4 border-b border-rule-soft px-4 py-2 text-[13px] last:border-0"><span>{item.label}</span><span className="tnum shrink-0 font-medium">{formatBDT(item.amount)}</span></div>) : <p className="p-4 text-[13px] text-graphite">{t('expenses.noBreakdown')}</p>}</div></Card>}
        <Card>
          {!result.rows.length ? <div className="space-y-3 px-4 py-10 text-center"><p>{t(hasFilters ? 'expenses.empty' : 'expenses.noExpenses')}</p><Button type="button" variant="ghost" onClick={() => hasFilters ? apply(defaults) : setEditing('new')}>{t(hasFilters ? 'common.reset' : 'expenses.add')}</Button></div> : <>
            <div className="hidden md:block"><TableViewport><table className="w-full min-w-[720px] border-collapse text-left text-[12px]"><thead><tr className="border-b border-rule">{(['expenses.expense', 'common.date', 'expenses.category', 'expenses.detailsColumn', 'expenses.recordedBy', 'expenses.amount', 'common.actions'] as MessageKey[]).map(key => <th key={key} className={`eyebrow px-4 py-3 ${key === 'expenses.amount' ? 'text-right' : key === 'common.actions' ? 'w-px whitespace-nowrap' : ''}`}>{t(key)}</th>)}</tr></thead><tbody>{result.rows.map(item => <tr key={item.id} className="border-b border-rule-soft last:border-0 hover:bg-plate/50"><td className="px-4 py-3"><p className="tnum font-medium">{item.expenseNumber}</p>{item.status === 'VOIDED' && <Badge tone="out">{t('expenses.voided')}</Badge>}</td><td className="whitespace-nowrap px-4 py-3">{expenseDisplayDate(item.expenseDate, locale)}</td><td className="px-4 py-3">{categoryById.get(item.categoryId) ?? t('expenses.unknownCategory')}</td><td className="max-w-sm break-words px-4 py-3"><p className="font-medium">{item.description}</p>{item.paidTo && <p className="mt-1 text-graphite">{t('expenses.paidTo')}: {item.paidTo}</p>}</td><td className="break-words px-4 py-3">{userById.get(item.recordedById) ?? '—'}</td><td className="tnum whitespace-nowrap px-4 py-3 text-right font-semibold">{formatBDT(item.amount)}</td><td className="w-px whitespace-nowrap px-4 py-3">{actions(item)}</td></tr>)}</tbody></table></TableViewport></div>
            <div className="divide-y divide-rule-soft md:hidden">{result.rows.map(item => <article key={item.id} className="space-y-2 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><span className="tnum text-[12px] font-medium">{item.expenseNumber}</span>{item.status === 'VOIDED' && <Badge tone="out">{t('expenses.voided')}</Badge>}</div><p className="break-words text-[14px] font-medium">{item.description}</p><p className="text-[12px] text-graphite">{expenseDisplayDate(item.expenseDate, locale)} · {categoryById.get(item.categoryId) ?? t('expenses.unknownCategory')}</p><p className="break-words text-[12px] text-graphite">{t('expenses.recordedBy')}: {userById.get(item.recordedById) ?? '—'}</p><p className="tnum text-[18px] font-semibold">{formatBDT(item.amount)}</p>{actions(item)}</article>)}</div>
          </>}
          <CatalogPagination meta={result} pending={pending} onChange={page => navigate({ ...query, ...page })} />
        </Card>
      </div>
      {pending && <div className="absolute inset-0 z-20 bg-card/90"><div className="sticky top-24 flex min-h-40 items-center justify-center"><LoadingScreen compact /></div></div>}
    </div>}
    {editing && <ExpenseDialog item={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
    {voiding && <VoidExpenseDialog item={voiding} onClose={() => setVoiding(null)} />}
    {categoriesOpen && <CategoryDialog categories={categories} onClose={() => setCategoriesOpen(false)} />}
    {viewing && <Modal title={viewing.expenseNumber} onClose={() => setViewing(null)}><dl className="grid gap-4 sm:grid-cols-2">{([
      ['common.date', expenseDisplayDate(viewing.expenseDate, locale)], ['common.status', t(viewing.status === 'ACTIVE' ? 'common.active' : 'expenses.voided')], ['expenses.category', categoryById.get(viewing.categoryId)], ['expenses.amount', formatBDT(viewing.amount)], ['common.description', viewing.description], ['expenses.paidTo', viewing.paidTo], ['expenses.paymentMethod', domainLabel(t, viewing.paymentMethod)], ['common.reference', viewing.reference], ['common.note', viewing.note], ['expenses.recordedBy', userById.get(viewing.recordedById)], ...(viewing.status === 'VOIDED' ? [['expenses.voidReason', viewing.voidReason], ['expenses.voidedBy', userById.get(viewing.voidedById ?? '')], ['expenses.voidedAt', viewing.voidedAt ? expenseDisplayDate(viewing.voidedAt, locale) : null]] : []),
    ] as Array<[MessageKey, string | null | undefined]>).map(([key, value]) => <div key={key} className="min-w-0"><dt className="eyebrow mb-1">{t(key)}</dt><dd className="whitespace-pre-wrap break-words text-[14px]">{value || '—'}</dd></div>)}</dl></Modal>}
  </>;
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'blue' | 'rose' }) {
  const styles = { amber: 'border-amber-700/25 bg-amber-50 text-amber-950', blue: 'border-blue-700/25 bg-blue-50 text-blue-950', rose: 'border-rose-700/25 bg-rose-50 text-rose-950' };
  return <div className={`rounded-[3px] border px-4 py-3 ${styles[tone]}`}><p className="eyebrow">{label}</p><p className="tnum mt-1 break-words text-[20px] font-semibold">{value}</p></div>;
}

type FieldAttrs = { id: string; name: string; 'aria-invalid'?: true; 'aria-describedby'?: string };
function ExpenseField({ name, label, error, children }: { name: string; label: string; error?: string; children: (attrs: FieldAttrs) => ReactNode }) {
  const id = useId();
  return <Field label={label} inputId={id} errorId={`${id}-error`} error={error}>{children({ id, name, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined })}</Field>;
}

type Action = (state: ExpenseActionState, data: FormData) => Promise<ExpenseActionState>;
type Validation = { success: true } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
function useExpenseForm(action: Action, validate: (values: Record<string, FormDataEntryValue>) => Validation, onSuccess?: (state: ExpenseActionState) => void) {
  const formRef = useRef<HTMLFormElement>(null), busy = useRef(false), focusErrors = useRef(false);
  const [pending, setPending] = useState(false), [state, setState] = useState<ExpenseActionState>({});
  useEffect(() => { if (focusErrors.current && state.fieldErrors) { focusErrors.current = false; formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); } }, [state]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    setState({});
    const parsed = validate(Object.fromEntries(data));
    if (!parsed.success) { focusErrors.current = true; setState({ fieldErrors: Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])) }); return; }
    busy.current = true; setPending(true);
    try { const next = await action({}, data); focusErrors.current = Boolean(next.fieldErrors); setState(next); if (next.ok) onSuccess?.(next); }
    catch { setState({ error: 'Could not save changes. Please try again.' }); }
    finally { busy.current = false; setPending(false); }
  }
  function changed(event: FormEvent<HTMLFormElement>) {
    const name = (event.target as HTMLInputElement).name;
    setState(current => ({ ...current, error: undefined, fieldErrors: Object.fromEntries(Object.entries(current.fieldErrors ?? {}).filter(([key]) => key !== name)) }));
  }
  return { formRef, pending, state, submit, changed };
}
function FormFailure({ state }: { state: ExpenseActionState }) { const { message } = useI18n(); return state.error ? <p role="alert" className="mb-4 rounded border border-out/20 bg-out-wash p-3 text-[13px] text-out">{message(state.error)}</p> : state.fieldErrors && Object.keys(state.fieldErrors).length ? <p role="alert" className="sr-only">{Object.values(state.fieldErrors).map(message).join(' ')}</p> : null; }

function ExpenseCompletion({ state, onClose }: { state: ExpenseActionState; onClose: () => void }) {
  const { t, message } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <div className="py-5 text-center"><CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-700" aria-hidden="true" /><p role="status" className="text-[16px] font-medium">{message(state.ok ?? '')}</p>{state.reference && !state.ok?.includes(state.reference) && <p className="tnum mt-2 text-[14px] text-graphite">{state.reference}</p>}<button ref={closeRef} type="button" onClick={onClose} className="mt-5 rounded-[3px] border border-rule bg-card px-5 py-2 text-[13px] font-medium hover:bg-plate">{t('common.close')}</button></div>;
}

function ExpenseDialog({ item, categories, onClose }: { item: OperatingExpense | null; categories: ExpenseCategory[]; onClose: () => void }) {
  const { t, message } = useI18n();
  const form = useExpenseForm(item ? updateExpenseAction : createExpenseAction, values => expenseFieldsSchema.safeParse(values));
  if (form.state.ok) return <Modal title={t(item ? 'expenses.edit' : 'expenses.add')} onClose={onClose}><ExpenseCompletion state={form.state} onClose={onClose} /></Modal>;
  const values = { expenseDate: item ? expenseDateKey(item.expenseDate) : expenseDateKey(new Date()), categoryId: item?.categoryId ?? '', description: item?.description ?? '', amount: item ? String(item.amount / 100) : '', paidTo: item?.paidTo ?? '', paymentMethod: item?.paymentMethod ?? 'CASH', reference: item?.reference ?? '', note: item?.note ?? '' };
  const labels: Record<keyof typeof values, MessageKey> = { expenseDate: 'common.date', categoryId: 'expenses.category', description: 'common.description', amount: 'expenses.amount', paidTo: 'expenses.paidTo', paymentMethod: 'expenses.paymentMethod', reference: 'common.reference', note: 'common.note' };
  return <Modal title={t(item ? 'expenses.edit' : 'expenses.add')} onClose={onClose} pending={form.pending} initialFocus='[name="expenseDate"]'><form noValidate ref={form.formRef} onSubmit={form.submit} onChange={form.changed}><input type="hidden" name="expenseId" value={item?.id ?? ''} /><FormFailure state={form.state} /><fieldset disabled={form.pending} className="min-w-0">
    <div className="grid gap-4 sm:grid-cols-2">{(Object.keys(values) as Array<keyof typeof values>).map(key => <ExpenseField key={key} name={key} label={t(labels[key])} error={form.state.fieldErrors?.[key] ? message(form.state.fieldErrors[key]) : undefined}>{attrs => key === 'categoryId' ? <Select {...attrs} defaultValue={values[key]} required><option value="">{t('expenses.chooseCategory')}</option>{categories.filter(c => c.isActive || c.id === item?.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ` (${t('common.inactive')})`}</option>)}</Select> : key === 'paymentMethod' ? <Select {...attrs} required defaultValue={values[key]}>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{domainLabel(t, m)}</option>)}</Select> : key === 'note' ? <Textarea {...attrs} defaultValue={values[key]} maxLength={1000} /> : <Input {...attrs} defaultValue={values[key]} required={['expenseDate', 'description', 'amount'].includes(key)} type={key === 'expenseDate' ? 'date' : 'text'} inputMode={key === 'amount' ? 'decimal' : undefined} maxLength={key === 'description' ? 300 : key === 'paidTo' ? 150 : key === 'reference' ? 120 : undefined} />}</ExpenseField>)}</div>
    <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button>{t(form.pending ? 'common.saving' : 'common.save')}</Button></div>
  </fieldset></form></Modal>;
}
function VoidExpenseDialog({ item, onClose }: { item: OperatingExpense; onClose: () => void }) {
  const { t, message } = useI18n();
  const form = useExpenseForm(voidExpenseAction, values => voidExpenseFieldsSchema.safeParse({ reason: values.reason, confirmed: values.confirmed === 'true' }));
  const confirmedId = useId();
  if (form.state.ok) return <Modal title={t('expenses.void')} onClose={onClose}><ExpenseCompletion state={form.state} onClose={onClose} /></Modal>;
  return <Modal title={`${t('expenses.void')} ${item.expenseNumber}`} onClose={onClose} pending={form.pending} size="large" initialFocus='[name="reason"]'><form noValidate ref={form.formRef} onSubmit={form.submit} onChange={form.changed}><input type="hidden" name="expenseId" value={item.id} /><FormFailure state={form.state} /><p className="mb-4 text-[13px] text-graphite">{t('expenses.voidHelp')}</p><fieldset disabled={form.pending}><ExpenseField name="reason" label={t('expenses.voidReason')} error={form.state.fieldErrors?.reason ? message(form.state.fieldErrors.reason) : undefined}>{attrs => <Textarea {...attrs} required maxLength={1000} />}</ExpenseField><div className="mt-4"><label htmlFor={confirmedId} className="flex items-start gap-3 text-[13px] leading-relaxed"><input id={confirmedId} className="mt-1 shrink-0" name="confirmed" type="checkbox" value="true" required aria-invalid={form.state.fieldErrors?.confirmed ? true : undefined} aria-describedby={form.state.fieldErrors?.confirmed ? `${confirmedId}-error` : undefined} /><span>{t('expenses.voidConfirm')}</span></label>{form.state.fieldErrors?.confirmed && <p id={`${confirmedId}-error`} className="mt-1 text-[12px] text-out">{message(form.state.fieldErrors.confirmed)}</p>}</div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger">{t(form.pending ? 'common.saving' : 'expenses.confirmVoid')}</Button></div></fieldset></form></Modal>;
}
function CategoryDialog({ categories, onClose }: { categories: ExpenseCategory[]; onClose: () => void }) {
  const { t } = useI18n(); const [search, setSearch] = useState(''), [busyForms, setBusyForms] = useState<Set<string>>(() => new Set());
  const setPending = useCallback((id: string, busy: boolean) => setBusyForms(current => { const next = new Set(current); if (busy) next.add(id); else next.delete(id); return next; }), []);
  const pending = busyForms.size > 0;
  const matches = categories.filter(c => c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Modal title={t('expenses.manageCategories')} onClose={onClose} pending={pending} size="medium" initialFocus='[name="name"]'><p className="mb-4 text-[12px] text-graphite">{t('expenses.categoryDeleteHelp')}</p><fieldset disabled={pending} className="min-w-0"><CategoryForm onPending={setPending} /><div className="mt-4"><Field label={t('expenses.searchCategories')}><Input type="search" value={search} onChange={e => setSearch(e.target.value)} /></Field></div><div className="mt-4 max-h-80 space-y-3 overflow-y-auto">{matches.map(c => <CategoryForm key={c.id} category={c} onPending={setPending} />)}{!matches.length && <p className="p-4 text-[13px] text-graphite">{t('expenses.noCategories')}</p>}</div></fieldset></Modal>;
}
function CategoryForm({ category, onPending }: { category?: ExpenseCategory; onPending: (id: string, pending: boolean) => void }) {
  const { t, message } = useI18n();
  const form = useExpenseForm(category ? updateExpenseCategoryAction : createExpenseCategoryAction, values => createExpenseCategorySchema.safeParse(values), () => { if (!category) form.formRef.current?.reset(); });
  const formId = useId();
  useEffect(() => { onPending(formId, form.pending); }, [formId, form.pending, onPending]);
  return <form noValidate ref={form.formRef} onSubmit={form.submit} onChange={form.changed} className="rounded border border-rule bg-plate/40 p-3"><input type="hidden" name="categoryId" value={category?.id ?? ''} /><FormFailure state={form.state} />{form.state.ok && <p role="status" className="mb-2 text-[12px] text-emerald-800">{t('expenses.saved', { reference: form.state.reference ?? '' })}</p>}<ExpenseField name="name" label={category ? `${t('expenses.category')}: ${category.name}` : t('expenses.newCategory')} error={form.state.fieldErrors?.name ? message(form.state.fieldErrors.name) : undefined}>{attrs => <Input {...attrs} defaultValue={category?.name ?? ''} required minLength={2} maxLength={100} />}</ExpenseField><div className="mt-2 flex flex-wrap items-center gap-2"><Button name="isActive" value={String(category?.isActive ?? true)} variant={category ? 'ghost' : 'primary'} disabled={form.pending}>{t(category ? 'common.save' : 'common.add')}</Button>{category && <><Button name="isActive" value={String(!category.isActive)} variant={category.isActive ? 'danger' : 'ghost'} disabled={form.pending}>{t(category.isActive ? 'expenses.deleteCategory' : 'expenses.restore')}</Button>{!category.isActive && <Badge>{t('common.inactive')}</Badge>}</>}</div></form>;
}
function Modal({ title, onClose, pending = false, initialFocus, size = 'large', children }: { title: string; onClose: () => void; pending?: boolean; initialFocus?: string; size?: 'small' | 'medium' | 'large'; children: ReactNode }) {
  const { t } = useI18n(), id = useId(); const ref = useModalDialog(true, () => { if (!pending) onClose(); }, initialFocus);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3" onMouseDown={event => { if (!pending && event.target === event.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} aria-busy={pending} className={`max-h-[90dvh] w-full overflow-y-auto rounded-[3px] border border-rule bg-card shadow-xl ${size === 'small' ? 'max-w-md' : size === 'medium' ? 'max-w-xl' : 'max-w-2xl'}`}><div className="flex items-center justify-between gap-3 border-b border-rule p-4"><h2 id={id} className="text-[18px] font-semibold">{title}</h2><button type="button" disabled={pending} onClick={onClose} aria-label={t('common.close')} className="rounded p-2 hover:bg-plate disabled:opacity-40"><X size={20} /></button></div><div className="p-4">{children}</div></div></div>;
}
