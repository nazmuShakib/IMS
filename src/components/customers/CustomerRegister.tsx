'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Button, Card, EmptyState, Input } from '@/components/ui';
import type { Customer } from '@/domain/types';
import { useI18n } from '@/components/i18n/I18nProvider';

export function CustomerRegister({
  confirmedQuery,
  customers,
  resultVersion,
}: {
  confirmedQuery: string;
  customers: Customer[];
  resultVersion: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState(confirmedQuery);
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = filtering || refreshPending;

  useEffect(() => {
    setQuery(confirmedQuery);
    setFiltering(false);
  }, [confirmedQuery, resultVersion]);

  function navigate(nextQuery: string) {
    setQuery(nextQuery);
    setFiltering(true);
    const trimmed = nextQuery.trim();
    window.history.pushState(
      null,
      '',
      trimmed ? `/customers?q=${encodeURIComponent(trimmed)}` : '/customers',
    );
    startRefreshing(() => {
      router.refresh();
    });
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(query);
  }

  return (
    <>
      <Card className="mb-4 p-4 sm:p-5">
        <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={search}>
          <Input
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={pending}
            placeholder={t('customers.searchPlaceholder')}
            aria-label={t('nav.customers')}
          />
          <Button type="submit" disabled={pending}>
            {pending ? t('customers.searching') : t('common.search')}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => navigate('')}>
            {t('common.reset')}
          </Button>
        </form>
      </Card>

      {pending ? (
        <Card>
          <LoadingScreen compact label={t('loading.searchCustomers')} />
        </Card>
      ) : (
        <Card className="p-3 sm:p-4">
          {customers.length === 0 ? (
            <EmptyState title={confirmedQuery ? t('customers.noMatch') : t('customers.empty')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {customers.map((customer) => (
                <article
                  key={customer.id}
                  className="rounded-[3px] border border-rule-soft p-4 transition-colors hover:border-rule hover:bg-canvas/60 sm:p-5"
                >
                  <p className="eyebrow mb-1.5">{t('common.name')}</p>
                  <Link href={`/customers/${customer.id}`} className="font-medium text-signal">
                    {customer.name}
                  </Link>
                  <p className="eyebrow mb-1.5 mt-4">{t('common.phone')}</p>
                  <p className="tnum text-[13px]">{customer.phone ?? '—'}</p>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="mt-4 inline-flex text-[12px] font-medium text-signal hover:underline"
                  >
                    {t('customers.purchaseHistory')}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
