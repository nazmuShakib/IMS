'use client';

import { cosmeticSummary } from '@/lib/cosmetic-condition';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';

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
  unitProfit,
} from '@/lib/unit-filters';
import { RefurbishmentExpenseForm } from '@/components/stock/RefurbishmentExpenseForm';
import { UsedDeviceDetailsForm } from '@/components/stock/UsedDeviceDetailsForm';
import { usedDeviceInspectionGroups } from '@/lib/used-device-inspection';

import { UNIT_DEFAULTS, catalogUrl, unitRangeErrors, type UnitFilterValues, type UsedUnitDetail, type UnitPageResult } from '@/lib/catalog-query';
import { CatalogPagination, CatalogResults, type PageMeta } from './CatalogPagination';
import { useCatalogNavigation } from './useCatalogNavigation';
import { useModalDialog } from '@/components/ui/useModalDialog';
export type { UsedUnitDetail } from '@/lib/catalog-query';

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


export function SerializedUnitRegister({
  units,
  productId,
  showCosts,
  locale,
  usedDetails = [],
  canManageUsedDevices = false,
  productActive, confirmedFilters, meta, unitCount, inStock, targetStatus, targetUnit, resultVersion,
}: {
  units: ProductUnitDTO[];
  productId: string;
  showCosts: boolean;
  locale: Locale;
  usedDetails?: UsedUnitDetail[];
  canManageUsedDevices?: boolean;
  productActive: boolean;
  confirmedFilters: UnitFilterValues;
  meta: PageMeta;
  unitCount: number;
  inStock: number;
  targetStatus: UnitPageResult['targetStatus'];
  targetUnit: string;
  resultVersion: string;
}) {
  const { t } = useI18n();
  const path = `/products/${productId}`;
  const { values, setValues, pending, navigate } = useCatalogNavigation(path, confirmedFilters, resultVersion);
  const [errors, setErrors] = useState<Record<string, string>>(() => unitRangeErrors(confirmedFilters));
  const { query, location, status, receivedFrom, receivedTo, minCost, maxCost, order, grade, acquisitionType } = values;
  function update(key: keyof UnitFilterValues, value: string) { setValues(current => ({ ...current, [key]: value })); }
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = unitRangeErrors(values); setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) navigate(values, { page: 1, pageSize: meta.pageSize });
  }
  const handledTarget = useRef('');
  useEffect(() => {
    setErrors(unitRangeErrors(confirmedFilters));
    const hash = window.location.hash;
    const target = targetUnit || (hash.startsWith('#unit-') ? hash.slice(6) : '');
    if (!target) return;
    const row = document.getElementById(`unit-${target}`);
    if (targetUnit) {
      handledTarget.current = target;
      window.history.replaceState(null, '', catalogUrl(path, confirmedFilters, meta) + `#unit-${target}`);
    }
    if (row) {
      handledTarget.current = target;
      const frame = requestAnimationFrame(() => {
        const viewport = row.closest<HTMLElement>('.contextual-scroll-area');
        if (viewport) viewport.scrollTop += row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 48;
        row.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!targetUnit && handledTarget.current !== target) {
      handledTarget.current = target;
      navigate(confirmedFilters, meta, target, true);
    }
  }, [resultVersion]);
  const [detailsUnitId, setDetailsUnitId] = useState<string | null>(null);
  const usedByUnit = useMemo(() => new Map(usedDetails.map((detail) => [detail.unitId, detail])), [usedDetails]);
  const detailsUnit = detailsUnitId ? units.find((unit) => unit.id === detailsUnitId) ?? null : null;
  const detailsAcquisition = detailsUnit ? usedByUnit.get(detailsUnit.id) : undefined;

  const dialogRef = useModalDialog(Boolean(detailsUnit), () => setDetailsUnitId(null));
  const filtered = units;
  const reset = () => { setValues(UNIT_DEFAULTS); setErrors({}); navigate(UNIT_DEFAULTS, { page: 1, pageSize: meta.pageSize }, targetStatus === 'filtered' ? targetUnit : undefined); };
  const activeCount = Object.entries(confirmedFilters).filter(([key, value]) => value !== UNIT_DEFAULTS[key as keyof UnitFilterValues]).length;

  return (
    <Card>
      <div className="border-b border-rule px-4 py-3">
        <p className="text-[13px] font-medium">{t('stock.units')}</p>
        <p className="tnum mt-0.5 text-[11px] text-graphite">
          {t('products.unitsSummary', { stock: inStock, total: unitCount })}
        </p>
      </div>

          <div className="border-b border-rule bg-plate/20 p-4">
            <form onSubmit={apply}><fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('products.unitSearch')}>
                <MonoInput
                  value={query}
                  onChange={(event) => update('query', event.target.value)}
                  placeholder={t('products.unitSearchPlaceholder')}
                />
              </Field>
              <Field label={t('common.status')}>
                <Select value={status} onChange={(event) => update('status', event.target.value)}>
                  <option value="all">{t('products.allUnitStatuses')}</option>
                  {STATUSES.map((value) => <option key={value} value={value}>{domainLabel(t, value)}</option>)}
                </Select>
              </Field>
              <Field label={t('used.grade')}>
                <Select value={grade} onChange={(event) => update('grade', event.target.value)}>
                  <option value="all">{t('common.all')}</option>
                  <option value="NEW">{t('used.newStock')}</option>
                  <option value="GRADE_A">{t('used.gradeA')}</option>
                  <option value="GRADE_B">{t('used.gradeB')}</option>
                  <option value="GRADE_C">{t('used.gradeC')}</option>
                  <option value="REFURBISHED">{t('used.refurbished')}</option>
                </Select>
              </Field>
              {showCosts && <Field label={t('used.acquisitionType')}>
                <Select value={acquisitionType} onChange={(event) => update('acquisitionType', event.target.value)}>
                  <option value="all">{t('common.all')}</option>
                  <option value="DIRECT_PURCHASE">{t('used.directPurchase')}</option>
                  <option value="TRADE_IN">{t('used.tradeIn')}</option>
                </Select>
              </Field>}
              <Field label={t('products.receivedFrom')} error={errors.receivedFrom ? t(errors.receivedFrom as import('@/lib/i18n/messages').MessageKey) : undefined} errorId="unit-receivedFrom-error">
                <Input type="date" aria-invalid={Boolean(errors.receivedFrom)} aria-describedby={errors.receivedFrom ? 'unit-receivedFrom-error' : undefined} value={receivedFrom} onChange={(event) => update('receivedFrom', event.target.value)} />
              </Field>
              <Field label={t('products.receivedTo')} error={errors.receivedTo ? t(errors.receivedTo as import('@/lib/i18n/messages').MessageKey) : undefined} errorId="unit-receivedTo-error">
                <Input type="date" aria-invalid={Boolean(errors.receivedTo)} aria-describedby={errors.receivedTo ? 'unit-receivedTo-error' : undefined} value={receivedTo} onChange={(event) => update('receivedTo', event.target.value)} />
              </Field>
              <Field label={t('stock.location')}>
                <Input
                  value={location}
                  onChange={(event) => update('location', event.target.value)}
                  placeholder={t('products.locationPlaceholder')}
                />
              </Field>
              {showCosts && (
                <Field label={t('products.minimumCost')} error={errors.minCost ? t(errors.minCost as import('@/lib/i18n/messages').MessageKey) : undefined} errorId="unit-minCost-error">
                  <MonoInput inputMode="decimal" aria-invalid={Boolean(errors.minCost)} aria-describedby={errors.minCost ? 'unit-minCost-error' : undefined} value={minCost} onChange={(event) => update('minCost', event.target.value)} placeholder="0.00" />
                </Field>
              )}
              {showCosts && (
                <Field label={t('products.maximumCost')} error={errors.maxCost ? t(errors.maxCost as import('@/lib/i18n/messages').MessageKey) : undefined} errorId="unit-maxCost-error">
                  <MonoInput inputMode="decimal" aria-invalid={Boolean(errors.maxCost)} aria-describedby={errors.maxCost ? 'unit-maxCost-error' : undefined} value={maxCost} onChange={(event) => update('maxCost', event.target.value)} placeholder={t('products.noMaximum')} />
                </Field>
              )}
              <Field label={t('catalog.orderBy')}>
                <Select value={order} onChange={(event) => update('order', event.target.value)}>
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
            </fieldset>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="tnum text-[12px] text-graphite">
                {t('catalog.appliedFilters', { count: activeCount })}
              </p>
              <div className="flex gap-2"><Button type="submit" disabled={pending}>{t('common.applyFilters')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={reset}>{t('common.reset')}</Button></div>
            </div></form>
          </div>

          {targetStatus && targetStatus !== 'found' && <p role="status" className="px-4 py-3 text-[13px] text-low">{t(targetStatus === 'filtered' ? 'catalog.targetFiltered' : 'catalog.targetMissing')}</p>}
          <CatalogResults pending={pending} version={resultVersion}>
          {filtered.length === 0 ? (
            <EmptyState title={t(unitCount === 0 ? 'products.noUnits' : 'products.noUnitMatches')}
              action={unitCount === 0 && productActive ? <Link className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3.5 text-[13px] hover:bg-plate" href={`/stock/in?product=${productId}`}>{t('stock.receiveTitle')}</Link> : undefined} />
          ) : (
            <TableViewport>
              <table className="w-full min-w-[64rem] table-auto">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2.5 text-left">{t('term.deviceNumber')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('common.status')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('labels.received')}</th>
                    <th className="eyebrow px-4 py-2.5 text-right">{t('used.askingPrice')}</th>
                    {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('common.cost')}</th>}
                    <th className="eyebrow px-4 py-2.5 text-right">{t('products.soldFor')}</th>
                    {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('products.profit')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((unit) => {
                    const profit = showCosts ? unitProfit(unit) : null;
                    return (
                      <tr id={`unit-${unit.id}`} tabIndex={-1} key={unit.id} className="scroll-mt-4 border-b border-rule-soft transition-colors last:border-0 hover:bg-plate/50 target:bg-signal-wash">
                        <td className="px-4 py-2.5">
                          <SerialChip serial={unit.serialNo} dim={unit.status !== 'IN_STOCK'} />
                          {unit.usedGrade && <Badge tone="signal">{unit.usedGrade === 'REFURBISHED' ? t('used.refurbished') : unit.usedGrade.replace('GRADE_', `${t('used.grade')} `)}</Badge>}
                          {unit.status === 'IN_STOCK' && productActive && (
                            <>
                              {unit.location && <span className="ml-2 text-[11px] text-graphite">{unit.location}</span>}
                              <Link href={`/checkout?serial=${encodeURIComponent(unit.serialNo)}`} className="ml-2 text-[11px] text-signal underline underline-offset-2">
                                {t('products.sell')}
                              </Link>
                            </>
                          )}
                          {unit.usedGrade && (
                            <button type="button" onClick={() => setDetailsUnitId(unit.id)} className="mt-2 flex items-center gap-1.5 rounded-[3px] border border-rule px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-plate">
                              <Info size={13} aria-hidden="true" />
                              {t('used.viewInspectionAcquisition')}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[unit.status]}>{domainLabel(t, unit.status)}</Badge></td>
                        <td className="tnum px-4 py-2.5 text-[12px] text-graphite">{dhaka(unit.receivedAt, locale)}</td>
                        <td className="px-4 py-2.5 text-right"><Money value={unit.askingPrice ?? (unit.usedGrade === 'REFURBISHED' ? unit.costPrice ?? null : null)} /></td>
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
          </CatalogResults>
      <CatalogPagination meta={meta} pending={pending} onChange={page => navigate(confirmedFilters, page)} />
      {detailsUnit && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3" onMouseDown={(event) => event.target === event.currentTarget && setDetailsUnitId(null)}>
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="unit-inspection-title" className="flex max-h-[92dvh] w-full max-w-6xl flex-col rounded-[3px] border border-rule bg-card shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rule p-4 sm:p-5">
              <div>
                <h2 id="unit-inspection-title" className="text-[18px] font-semibold">{detailsUnit.usedGrade === 'REFURBISHED' ? t('used.refurbished') : t('used.usedPhone')}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2"><SerialChip serial={detailsUnit.serialNo} /><Badge tone="signal">{detailsUnit.usedGrade === 'REFURBISHED' ? t('used.refurbished') : detailsUnit.usedGrade?.replace('GRADE_', `${t('used.grade')} `)}</Badge><Badge tone={STATUS_TONE[detailsUnit.status]}>{domainLabel(t, detailsUnit.status)}</Badge></div>
              </div>
              <button type="button" aria-label={t('common.close')} onClick={() => setDetailsUnitId(null)} className="flex size-9 shrink-0 items-center justify-center rounded-[3px] border border-rule hover:bg-plate"><X size={18} /></button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="eyebrow">{t('used.batteryHealth')}</dt><dd className="mt-1">{detailsUnit.batteryHealth !== null ? `${detailsUnit.batteryHealth}%` : t('common.notRecorded')}</dd></div>
                <div><dt className="eyebrow">{t('used.warrantyDuration')}</dt><dd className="mt-1">{detailsUnit.warrantyDays ? `${detailsUnit.warrantyDays} ${detailsUnit.warrantyDays === 1 ? t('used.warrantyDay') : t('used.warrantyDays')}` : detailsUnit.warrantyMonths ? `${detailsUnit.warrantyMonths} ${detailsUnit.warrantyMonths === 1 ? t('used.warrantyMonth') : t('used.warrantyMonths')}` : t('common.notRecorded')}</dd></div>
                <div><dt className="eyebrow">{t('common.location')}</dt><dd className="mt-1">{detailsUnit.location || t('common.notRecorded')}</dd></div>
                <div><dt className="eyebrow">{t('labels.received')}</dt><dd className="mt-1">{dhaka(detailsUnit.receivedAt, locale)}</dd></div>
                <div className="sm:col-span-2"><dt className="eyebrow">{t('used.appearance')}</dt><dd className="mt-1 whitespace-pre-wrap">{cosmeticSummary(detailsUnit.cosmeticCondition, t) || t('common.notRecorded')}</dd></div>
                <div className="sm:col-span-2"><dt className="eyebrow">{t('used.knownDefects')}</dt><dd className="mt-1 whitespace-pre-wrap">{detailsUnit.knownDefects || t('common.notRecorded')}</dd></div>
                <div className="sm:col-span-2"><dt className="eyebrow">{t('used.accessories')}</dt><dd className="mt-1 whitespace-pre-wrap">{detailsUnit.includedAccessories || t('common.notRecorded')}</dd></div>
              </dl>
              {detailsUnit.inspectionResults && (
                <section className="mt-5 border-t border-rule pt-5">
                  <h3 className="text-[14px] font-semibold">{t('used.inspectionChecklist')}</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {usedDeviceInspectionGroups.map((group) => (
                      <div key={group.title} className="rounded-[3px] border border-rule bg-plate/25 p-3">
                        <h4 className="eyebrow mb-2">{t(group.title)}</h4>
                        <dl className="space-y-1.5 text-[11px]">
                          {group.items.map(([keyName, label]) => {
                            const value = detailsUnit.inspectionResults?.[keyName] ?? 'NOT_TESTED';
                            const result = value === 'WORKING' ? t('used.working') : value === 'DEFECTIVE' ? t('used.defective') : value === 'NOT_APPLICABLE' ? t('used.notApplicable') : t('used.notTested');
                            return <div key={keyName} className="flex items-start justify-between gap-3"><dt>{t(label)}</dt><dd className={`shrink-0 font-medium ${value === 'DEFECTIVE' ? 'text-out' : value === 'WORKING' ? 'text-ok' : 'text-graphite'}`}>{result}</dd></div>;
                          })}
                        </dl>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <dl className="mt-5 grid gap-4 border-t border-rule pt-5 sm:grid-cols-2 lg:grid-cols-4">
                {showCosts && detailsAcquisition?.acquisitionType ? <>
                  <div><dt className="eyebrow">{t('used.acquisitionType')}</dt><dd className="mt-1">{detailsAcquisition.acquisitionType === 'TRADE_IN' ? t('used.tradeIn') : t('used.directPurchase')}</dd></div>
                  <div><dt className="eyebrow">{t('used.sellerName')}</dt><dd className="mt-1">{detailsAcquisition.sellerName}</dd></div>
                  <div><dt className="eyebrow">{t('used.sellerPhone')}</dt><dd className="tnum mt-1">{detailsAcquisition.sellerPhone}</dd></div>
                  <div><dt className="eyebrow">{t('used.acquisitionValue')}</dt><dd className="mt-1"><Money value={detailsAcquisition.acquisitionValue} /></dd></div>
                  <div><dt className="eyebrow">{t('used.identificationType')}</dt><dd className="mt-1">{detailsAcquisition.identificationType || t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('used.identificationNumber')}</dt><dd className="tnum mt-1">{detailsAcquisition.identificationNumber || t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('labels.received')}</dt><dd className="mt-1">{detailsAcquisition.acquiredAt ? dhaka(detailsAcquisition.acquiredAt, locale) : t('common.notRecorded')}</dd></div>
                  <div><dt className="eyebrow">{t('common.reference')}</dt><dd className="mt-1">{detailsAcquisition.reference || t('common.notRecorded')}</dd></div>
                  <div className="sm:col-span-2"><dt className="eyebrow">{t('common.note')}</dt><dd className="mt-1 whitespace-pre-wrap">{detailsAcquisition.note || t('common.notRecorded')}</dd></div>
                </> : showCosts ? <div className="sm:col-span-2"><dt className="eyebrow">{t('used.acquisitionType')}</dt><dd className="mt-1">{t(detailsUnit.supplierId ? 'used.supplierRefurbishedPurchase' : 'used.standardRefurbishedReceipt')}</dd></div> : null}
                {showCosts && detailsAcquisition && detailsAcquisition.refurbishmentTotal > 0 && <div><dt className="eyebrow">{t('used.refurbishmentTotal')}</dt><dd className="mt-1"><Money value={detailsAcquisition.refurbishmentTotal} /></dd></div>}
              </dl>
              {canManageUsedDevices && detailsUnit.status === 'IN_STOCK' && (
                <div className="mt-5 grid items-start gap-3 border-t border-rule pt-5 lg:grid-cols-2 [&>details[open]]:lg:col-span-2">
                  <RefurbishmentExpenseForm unitId={detailsUnit.id} />
                  <UsedDeviceDetailsForm unit={detailsUnit} />
                </div>
              )}
            </div>
          </div>
        </div>, document.body,
      )}
    </Card>
  );
}
