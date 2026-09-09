'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogPagination, type PageMeta } from '@/components/catalog/CatalogPagination';

/** URL navigation adapter for the shared compact pagination controls. */
export function RoutePagination({ pathname, filters, meta, label }: {
  pathname: string;
  filters: object;
  meta: PageMeta;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.parentElement?.querySelectorAll<HTMLElement>('.contextual-scroll-area').forEach(element => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
  }, [meta.page, meta.pageSize]);

  return <div ref={ref} aria-busy={pending}>
    <CatalogPagination meta={meta} label={label} pending={pending} onChange={next => {
      if (next.page === meta.page && next.pageSize === meta.pageSize) return;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
      }
      params.set('page', String(next.page));
      params.set('pageSize', String(next.pageSize));
      startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
    }} />
  </div>;
}
