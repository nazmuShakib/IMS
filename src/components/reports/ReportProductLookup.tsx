'use client';
import { useEffect, useState } from 'react';
import { Input, Select } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { reportText } from '@/lib/report-copy';
export type ReportProduct = { id: string; name: string; sku: string };
export function ReportProductLookup({
  value,
  selected,
  onChange,
}: {
  value: string;
  selected: ReportProduct | null;
  onChange: (id: string) => void;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState(''),
    [rows, setRows] = useState<ReportProduct[]>([]),
    [retained, setRetained] = useState<ReportProduct | null>(selected),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (selected) setRetained(selected);
  }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFailed(false);
      fetch(`/api/reports/products?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data) => setRows(data.products))
        .catch((e) => {
          if (e.name !== 'AbortError') setFailed(true);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retry]);
  const options = [
    ...(retained && !rows.some((p) => p.id === retained.id) ? [retained] : []),
    ...rows,
  ];
  return (
    <>
      <label className="block min-w-0">
        <span className="eyebrow mb-1.5 block">{reportText(locale, 'productSearch')}</span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={reportText(locale, 'searchProduct')}
          aria-label={reportText(locale, 'searchProduct')}
          autoComplete="off"
        />
      </label>
      <label className="block min-w-0">
        <span className="eyebrow mb-1.5 block">{t('common.product')}</span>
        <Select
          aria-label={t('common.product')}
          value={value}
          onChange={(e) => {
            const p = options.find((p) => p.id === e.target.value);
            if (p) setRetained(p);
            onChange(e.target.value);
          }}
        >
          <option value="">{t('reports.allProducts')}</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.sku}
            </option>
          ))}
        </Select>
      </label>
      {failed && (
        <p role="alert" className="text-[12px] text-out sm:col-span-2 lg:col-span-4">
          {reportText(locale, 'lookupError')}{' '}
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="underline">
            {reportText(locale, 'retry')}
          </button>
        </p>
      )}
    </>
  );
}
