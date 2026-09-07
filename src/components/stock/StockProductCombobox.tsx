'use client';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ProductDTO } from '@/lib/dto';
import { useI18n } from '@/components/i18n/I18nProvider';

export function StockProductCombobox({ products, value, disabled, error, onChange, includeArchived = false, emptyMessage }: {
  products: Pick<ProductDTO, 'id' | 'name' | 'sku' | 'barcode' | 'model' | 'isActive' | 'trackingType'>[];
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (id: string) => void;
  includeArchived?: boolean;
  emptyMessage?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = products.find((item) => item.id === value);
  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((item) => (item.isActive || includeArchived) && terms.every((term) =>
      `${item.name} ${item.sku} ${item.barcode ?? ''} ${item.model ?? ''}`.toLowerCase().includes(term)));
  }, [products, query, includeArchived]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open, id]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function close() { setOpen(false); setQuery(''); }
  function choose(id: string) { close(); onChange(id); }
  function openList() { setQuery(''); setActiveIndex(0); setOpen(true); }

  return <div data-product-picker ref={rootRef} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
  }}>
    <label htmlFor={id} className="eyebrow mb-1.5 block">{t('common.product')}</label>
    <input type="hidden" name="productId" value={value} />
    <div className="relative">
      <div data-product-picker-control className={`flex h-9 items-center rounded-[3px] border bg-card transition-colors focus-within:border-signal ${error ? 'border-out' : 'border-rule'}`}>
        <Search className="ml-2.5 size-4 shrink-0 text-graphite" aria-hidden="true" />
        <input ref={inputRef} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
          aria-autocomplete="list" aria-activedescendant={open && matches[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          data-receipt-field="productId" disabled={disabled || products.length === 0} autoComplete="off"
          className="stock-product-combobox-input h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-graphite"
          value={open ? query : selected ? `${selected.name} · ${selected.sku}` : ''}
          placeholder={t('stock.searchProducts')} onFocus={openList}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) { openList(); return; }
              if (matches.length) setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (open && matches[activeIndex]) choose(matches[activeIndex].id);
              else if (!open) openList();
            } else if (event.key === 'Escape') {
              event.preventDefault(); event.stopPropagation(); close();
            }
          }} />
        {value && !open ? <button type="button" className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[3px] text-graphite hover:bg-plate hover:text-ink" disabled={disabled}
          aria-label={t('stock.clearProduct')} onClick={() => choose('')}><X className="size-4" /></button> : <button type="button" className="mr-1 flex size-7 shrink-0 items-center justify-center text-graphite" disabled={disabled || products.length === 0}
          aria-label={t('stock.chooseProduct')} aria-expanded={open} onClick={() => { if (open) close(); else { inputRef.current?.focus(); openList(); } }}>
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>}
      </div>
      {open && <div id={`${id}-list`} role="listbox" aria-label={t('common.product')}
        className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-[3px] border border-rule bg-card py-1 shadow-lg">
        {matches.length ? matches.map((item, index) => <div key={item.id} id={`${id}-option-${index}`} role="option" aria-selected={item.id === value}
          className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${activeIndex === index ? 'bg-signal/10' : 'hover:bg-plate'}`}
          onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => { event.preventDefault(); choose(item.id); }}>
          <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{item.name}{!item.isActive && ` · ${t('removal.archived')}`}</span>
            <span className="tnum mt-0.5 block truncate text-[11px] text-graphite">{item.sku} · {t(item.trackingType === 'SERIAL' ? 'products.serialTracking' : 'products.bulkTracking')}</span></span>
          {item.id === value && <Check className="size-4 shrink-0 text-signal" aria-hidden="true" />}
        </div>) : <p className="p-5 text-center text-sm text-graphite">{t('stock.noProductResults')}</p>}
      </div>}
    </div>
    {error && <p id={`${id}-error`} className="mt-1 text-xs text-out">{error}</p>}
    {products.length === 0 && <p className="mt-2 text-sm text-graphite">{emptyMessage ?? t('stock.noActiveProducts')}</p>}
  </div>;
}
