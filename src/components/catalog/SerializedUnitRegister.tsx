'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import type { UnitStatus } from '@/domain/types';
import type { ProductUnitDTO } from '@/lib/dto';
import type { Locale } from '@/lib/i18n/config';
import { domainLabel } from '@/lib/i18n/domain';
import { useI18n } from '@/components/i18n/I18nProvider';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Money,
  MonoInput,
  Select,
  SerialChip,
  TableViewport,
} from '@/components/ui';
import {
  filterAndOrderUnits,
  unitProfit,
  type UnitOrder,
  type UnitStatusFilter,
} from '@/lib/unit-filters';

const STATUS_TONE: Record<UnitStatus, 'ok' | 'neutral' | 'out' | 'low'> = {
  IN_STOCK: 'ok',
  RESERVED: 'low',
  SOLD: 'neutral',
  RETURNED: 'low',
  DAMAGED: 'out',
  LOST: 'out',
  VOID: 'neutral',
};

const STATUSES: UnitStatus[] = [
  'IN_STOCK',
  'RESERVED',
  'SOLD',
  'RETURNED',
  'DAMAGED',
  'LOST',
  'VOID',
];

const dhaka = (iso: string, _locale: Locale) =>
  new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const paisa = (value: string): number | null => {
  if (value.trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
};

export function SerializedUnitRegister({
  units,
  productId,
  showCosts,
  locale,
}: {
  units: ProductUnitDTO[];
  productId: string;
  showCosts: boolean;
  locale: Locale;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<UnitStatusFilter>('all');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [receivedTo, setReceivedTo] = useState('');
  const [minCost, setMinCost] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [order, setOrder] = useState<UnitOrder>('in-stock-first');

  const filtered = useMemo(
    () => filterAndOrderUnits(units, {
      query,
      location,
      status,
      receivedFrom,
      receivedTo,
      minCost: showCosts ? paisa(minCost) : null,
      maxCost: showCosts ? paisa(maxCost) : null,
      order,
    }),
    [units, query, location, status, receivedFrom, receivedTo, minCost, maxCost, order, showCosts],
  );
  const inStock = units.filter((unit) => unit.status === 'IN_STOCK').length;

  const reset = () => {
    setQuery('');
    setLocation('');
    setStatus('all');
    setReceivedFrom('');
    setReceivedTo('');
    setMinCost('');
    setMaxCost('');
    setOrder('in-stock-first');
  };

  return (
    <Card>
      <div className="border-b border-rule px-4 py-3">
        <p className="text-[13px] font-medium">{t('stock.units')}</p>
        <p className="tnum mt-0.5 text-[11px] text-graphite">
          {t('products.unitsSummary', { stock: inStock, total: units.length })}
        </p>
      </div>

      {units.length === 0 ? (
        <EmptyState
          title={t('products.noUnits')}
          action={
            <Link href={`/stock/in?product=${productId}`}>
              <Button variant="ghost">{t('stock.receiveTitle')}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="border-b border-rule bg-plate/20 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label={t('products.unitSearch')}>
                <MonoInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('products.unitSearchPlaceholder')}
                />
              </Field>
              <Field label={t('common.status')}>
                <Select value={status} onChange={(event) => setStatus(event.target.value as UnitStatusFilter)}>
                  <option value="all">{t('products.allUnitStatuses')}</option>
                  {STATUSES.map((value) => <option key={value} value={value}>{domainLabel(t, value)}</option>)}
                </Select>
              </Field>
              <Field label={t('products.receivedFrom')}>
                <Input type="date" value={receivedFrom} onChange={(event) => setReceivedFrom(event.target.value)} />
              </Field>
              <Field label={t('products.receivedTo')}>
                <Input type="date" value={receivedTo} onChange={(event) => setReceivedTo(event.target.value)} />
              </Field>
              <Field label={t('stock.location')}>
                <Input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder={t('products.locationPlaceholder')}
                />
              </Field>
              {showCosts && (
                <Field label={t('products.minimumCost')}>
                  <MonoInput inputMode="decimal" value={minCost} onChange={(event) => setMinCost(event.target.value)} placeholder="0.00" />
                </Field>
              )}
              {showCosts && (
                <Field label={t('products.maximumCost')}>
                  <MonoInput inputMode="decimal" value={maxCost} onChange={(event) => setMaxCost(event.target.value)} placeholder={t('products.noMaximum')} />
                </Field>
              )}
              <Field label={t('catalog.orderBy')}>
                <Select value={order} onChange={(event) => setOrder(event.target.value as UnitOrder)}>
                  <option value="in-stock-first">{t('products.orderInStock')}</option>
                  <option value="newest">{t('products.orderNewest')}</option>
                  <option value="oldest">{t('products.orderOldest')}</option>
                  {showCosts && <option value="profit-desc">{t('products.orderProfitHigh')}</option>}
                  {showCosts && <option value="profit-asc">{t('products.orderProfitLow')}</option>}
                  {showCosts && <option value="cost-desc">{t('products.orderCostHigh')}</option>}
                  {showCosts && <option value="cost-asc">{t('products.orderCostLow')}</option>}
                  <option value="serial-asc">{t('products.orderDeviceNumber')}</option>
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="tnum text-[12px] text-graphite">
                {t('products.filteredUnits', { shown: filtered.length, total: units.length })}
              </p>
              <Button type="button" variant="ghost" onClick={reset}>{t('common.reset')}</Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title={t('products.noUnitMatches')} />
          ) : (
            <TableViewport>
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2.5 text-left">{t('term.deviceNumber')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('common.status')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('labels.received')}</th>
                    {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('common.cost')}</th>}
                    <th className="eyebrow px-4 py-2.5 text-right">{t('products.soldFor')}</th>
                    {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('products.profit')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((unit) => {
                    const profit = showCosts ? unitProfit(unit) : null;
                    return (
                      <tr id={`unit-${unit.id}`} key={unit.id} className="scroll-mt-4 border-b border-rule-soft transition-colors last:border-0 hover:bg-plate/50 target:bg-signal-wash">
                        <td className="px-4 py-2.5">
                          <SerialChip serial={unit.serialNo} dim={unit.status !== 'IN_STOCK'} />
                          {unit.status === 'IN_STOCK' && (
                            <>
                              {unit.location && <span className="ml-2 text-[11px] text-graphite">{unit.location}</span>}
                              <Link href={`/checkout?serial=${encodeURIComponent(unit.serialNo)}`} className="ml-2 text-[11px] text-signal underline underline-offset-2">
                                {t('products.sell')}
                              </Link>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[unit.status]}>{domainLabel(t, unit.status)}</Badge></td>
                        <td className="tnum px-4 py-2.5 text-[12px] text-graphite">{dhaka(unit.receivedAt, locale)}</td>
                        {showCosts && <td className="px-4 py-2.5 text-right"><Money value={unit.costPrice ?? null} muted /></td>}
                        <td className="px-4 py-2.5 text-right"><Money value={unit.salePrice} /></td>
                        {showCosts && (
                          <td className="px-4 py-2.5 text-right">
                            {profit === null ? <span className="text-graphite">—</span> : (
                              <span className={`tnum text-[13px] font-medium ${profit >= 0 ? 'text-ok' : 'text-out'}`}>
                                {profit >= 0 ? '+' : ''}<Money value={profit} />
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableViewport>
          )}
        </>
      )}
    </Card>
  );
}
