'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Button, Card, EmptyState, Input, TableViewport } from '@/components/ui';
import type { Customer } from '@/domain/types';

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
      <form className="mb-4 flex gap-2" onSubmit={search}>
        <Input
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={pending}
          placeholder="Search customer name or phone"
          aria-label="Search customers"
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'Searching…' : 'Search'}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => navigate('')}>
          Reset
        </Button>
      </form>

      {pending ? (
        <Card>
          <LoadingScreen compact label="Searching customers…" />
        </Card>
      ) : (
        <Card>
          {customers.length === 0 ? (
            <EmptyState title={confirmedQuery ? 'No customers match this search.' : 'No saved customers yet.'} />
          ) : (
            <TableViewport>
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-rule text-left">
                    <th className="eyebrow px-4 py-2.5">Name</th>
                    <th className="eyebrow px-4 py-2.5">Phone</th>
                    <th className="eyebrow px-4 py-2.5"><span className="sr-only">History</span></th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/customers/${customer.id}`} className="text-signal">
                          {customer.name}
                        </Link>
                      </td>
                      <td className="tnum px-4 py-3">{customer.phone ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/customers/${customer.id}`} className="text-signal">
                          Purchase history
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      )}
    </>
  );
}
