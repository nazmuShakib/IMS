'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, UserRound, X } from 'lucide-react';
import { CatalogPagination, type PageMeta } from '@/components/catalog/CatalogPagination';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Badge, Button, Card, EmptyState, Input, PageHeader, TableViewport } from '@/components/ui';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { CreateCustomerForm } from './CreateCustomerForm';
import { customerUrl, type CustomerListRow } from '@/lib/customer-query';
import { useI18n } from '@/components/i18n/I18nProvider';

export function CustomerRegister({ confirmedQuery, customers, meta }: {
  confirmedQuery: string; customers: CustomerListRow[]; meta: PageMeta;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState(confirmedQuery);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const returnTo = customerUrl({ q: confirmedQuery, ...meta });
  const close = () => { if (!saving) setOpen(false); };
  const dialogRef = useModalDialog(open, close, '[name="name"]');
  useEffect(() => { setQuery(confirmedQuery); }, [confirmedQuery]);
  useEffect(() => {
    const restore = () => { setQuery(new URLSearchParams(window.location.search).get('q')?.trim() ?? ''); };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    resultsRef.current?.querySelectorAll('.contextual-scroll-area').forEach(el => { el.scrollTop = 0; });
  }, [confirmedQuery, meta.page, meta.pageSize]);
  function navigate(q: string, page = 1, pageSize = meta.pageSize) {
    if (pending) return;
    const url = customerUrl({ q, page, pageSize });
    if (url === returnTo) return;
    startTransition(() => router.push(url, { scroll: false }));
  }
  function search(event: FormEvent) { event.preventDefault(); setQuery(query.trim()); navigate(query); }
  function clear() { setQuery(''); navigate(''); }
  function href(id: string) { return `/customers/${id}?${new URLSearchParams({ returnTo })}`; }
  const add = <Button onClick={() => setOpen(true)}>{t('customers.add')}</Button>;
  const status = (customer: CustomerListRow) => !customer.isActive && <Badge>{t('customers.inactive')}</Badge>;
  const customerName = (customer: CustomerListRow) => <div className="flex min-w-0 items-center gap-3">
    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-plate/70 text-graphite"><UserRound size={17} /></span>
    <div className="min-w-0"><span className="break-words font-semibold text-ink">{customer.name}</span>{!customer.isActive && <span className="ml-2">{status(customer)}</span>}</div>
  </div>;
  const customerPhone = (customer: CustomerListRow) => <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-rule-soft bg-plate/30 px-2.5 py-1.5 text-[13px] text-charcoal">
    <Phone size={13} aria-hidden="true" className="shrink-0 text-graphite" /><span className="tnum break-all">{customer.phone ?? t('customers.noPhone')}</span>
  </span>;
  return <>
    <PageHeader title={t('customers.title')} count={t(confirmedQuery ? 'customers.matchingCount' : 'customers.count', { count: meta.totalCount })} action={add} />
    {createdId && <div role="status" className="mb-4 flex items-center gap-2 rounded-[3px] border border-rule bg-card p-3 text-[13px]">
      <span>{t('customers.created')}</span><Link className="font-medium text-signal hover:underline" href={href(createdId)}>{t('customers.viewCustomer')}</Link>
      <button type="button" className="ml-auto p-2" aria-label={t('customers.dismiss')} onClick={() => setCreatedId(null)}><X size={16} /></button>
    </div>}
    <Card>
      <form className="flex flex-wrap items-end gap-2 border-b border-rule p-4 sm:p-5" onSubmit={search}>
        <label className="min-w-0 flex-1 basis-56"><span className="eyebrow mb-1.5 block">{t('common.search')}</span>
          <Input type="search" name="q" value={query} onChange={event => setQuery(event.target.value)} disabled={pending} placeholder={t('customers.searchPlaceholder')} />
        </label>
        <Button type="submit" disabled={pending}>{t('common.search')}</Button>
        {(query || confirmedQuery) && <Button type="button" variant="ghost" disabled={pending} onClick={clear}>{t('customers.clearSearch')}</Button>}
      </form>
      <div ref={resultsRef} className="relative" aria-busy={pending}>
        <div inert={pending || undefined}>
          {!customers.length ? <EmptyState title={t(confirmedQuery ? 'customers.noMatch' : 'customers.empty')} action={confirmedQuery ? <Button variant="ghost" onClick={clear}>{t('customers.clearSearch')}</Button> : add} /> : <>
            <div className="divide-y divide-rule-soft md:hidden">{customers.map(customer => <article key={customer.id} className="space-y-2 p-4">
              {customerName(customer)}
              <div>{customerPhone(customer)}</div>
              <Link className="inline-flex min-h-9 items-center text-[13px] font-medium text-signal hover:underline" href={href(customer.id)} aria-label={t('customers.historyFor', { name: customer.name })}>{t('customers.viewHistory')}</Link>
            </article>)}</div>
            <TableViewport className="hidden md:block"><table className="w-full border-collapse text-[13px]">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-rule text-left">{[t('common.customer'), t('common.phone'), t('customers.purchaseHistory')].map(label => <th key={label} scope="col" className="eyebrow px-4 py-3">{label}</th>)}</tr></thead>
              <tbody>{customers.map(customer => <tr key={customer.id} className="border-b border-rule-soft last:border-0 hover:bg-plate/50">
                <td className="max-w-sm px-4 py-3">{customerName(customer)}</td>
                <td className="px-4 py-3">{customerPhone(customer)}</td>
                <td className="px-4 py-3"><Link className="font-medium text-signal hover:underline" href={href(customer.id)} aria-label={t('customers.historyFor', { name: customer.name })}>{t('customers.viewHistory')}</Link></td>
              </tr>)}</tbody>
            </table></TableViewport>
          </>}
        </div>
        {pending && <div className="absolute inset-0 flex items-center justify-center bg-card/90"><LoadingScreen compact label={t('loading.searchCustomers')} /></div>}
      </div>
      <CatalogPagination meta={meta} pending={pending} label={t('customers.pagination')} onChange={next => navigate(confirmedQuery, next.page, next.pageSize)} />
    </Card>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-customer-title" tabIndex={-1} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl">
        <h2 id="add-customer-title" className="mb-5 text-[18px] font-semibold">{t('customers.add')}</h2>
        <CreateCustomerForm stacked onPendingChange={setSaving} onCancel={close} onCreated={id => { setCreatedId(id); setOpen(false); setSaving(false); }} />
      </div>
    </div>}
  </>;
}
