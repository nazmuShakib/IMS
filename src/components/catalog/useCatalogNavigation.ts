'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { catalogUrl, type PageRequest, type ProductFilterValues, type UnitFilterValues } from '@/lib/catalog-query';

export function useCatalogNavigation<T extends ProductFilterValues | UnitFilterValues>(path: string, confirmed: T, version: string) {
  const router = useRouter();
  const [values, setValues] = useState(confirmed);
  const [filtering, setFiltering] = useState(false);
  const [transitionPending, startTransition] = useTransition();
  const previous = useRef(JSON.stringify(confirmed));
  const traversing = useRef(false);
  useEffect(() => {
    const next = JSON.stringify(confirmed);
    if (previous.current !== next || traversing.current) setValues(confirmed);
    previous.current = next;
    traversing.current = false;
    setFiltering(false);
  }, [confirmed, version]);
  useEffect(() => {
    const restore = () => {
      traversing.current = true;
      setFiltering(true);
      startTransition(() => router.refresh());
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [router]);
  const pending = filtering || transitionPending;
  function navigate(next: T, page: PageRequest, unit?: string, replace = false) {
    if (pending) return;
    setFiltering(true);
    const url = catalogUrl(path, next, page, unit);
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url + (unit ? `#unit-${unit}` : ''));
    startTransition(() => router.refresh());
  }
  return { values, setValues, pending, navigate };
}
