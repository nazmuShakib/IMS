'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  recordLabelPrintAction,
  type LabelPrintState,
} from '@/actions/labels';
import { Barcode128 } from '@/components/labels/Barcode128';
import { ScannerInput } from '@/components/search/ScannerInput';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  TableViewport,
} from '@/components/ui';
import type { Role, TrackingType, UnitStatus } from '@/domain/types';
import type { SearchResponse } from '@/lib/search';

export interface LabelProductOption {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  model: string | null;
  trackingType: TrackingType;
  brandName: string | null;
  quantityOnHand: number;
  isActive: boolean;
}

export interface LabelUnitOption {
  id: string;
  serialNo: string;
  status: UnitStatus;
  receivedAt: string;
}

function ProductLabel({
  shopName,
  product,
  serialNo,
}: {
  shopName: string;
  product: LabelProductOption;
  serialNo?: string;
}) {
  const barcodeValue = serialNo ?? product.barcode ?? product.sku;
  const descriptor = [product.brandName, product.model].filter(Boolean).join(' · ');

  return (
    <article className="stock-label">
      <div className="stock-label-heading">
        <span className="stock-label-shop">{shopName}</span>
        <strong className="stock-label-name">{product.name}</strong>
      </div>
      <div className="stock-label-meta">
        <span className="tnum">SKU {product.sku}</span>
        {descriptor && <span>{descriptor}</span>}
      </div>
      <div className="stock-label-bars">
        <Barcode128 value={barcodeValue} />
      </div>
      <div className="stock-label-code tnum">
        {serialNo ? `S/N ${serialNo}` : barcodeValue}
      </div>
    </article>
  );
}

export function StockLabelStudio({
  products,
  product,
  units,
  initialUnitIds,
  initialCopies,
  role,
  shopName,
}: {
  products: LabelProductOption[];
  product: LabelProductOption | null;
  units: LabelUnitOption[];
  initialUnitIds: string[];
  initialCopies: number;
  role: Role;
  shopName: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(initialUnitIds));
  const [copies, setCopies] = useState(Math.max(1, initialCopies));
  const [layout, setLayout] = useState<'thermal' | 'a4'>('thermal');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'ALL'>(
    initialUnitIds.length > 0 ? 'ALL' : 'IN_STOCK',
  );
  const [scanError, setScanError] = useState('');
  const [state, formAction, pending] = useActionState<LabelPrintState, FormData>(
    recordLabelPrintAction,
    {},
  );

  useEffect(() => {
    if (state.printNonce) window.print();
  }, [state.printNonce]);

  const visibleUnits = useMemo(
    () => units.filter((unit) => statusFilter === 'ALL' || unit.status === statusFilter),
    [statusFilter, units],
  );
  const selectedUnits = useMemo(
    () => units.filter((unit) => selected.has(unit.id)),
    [selected, units],
  );
  const labelCount = product?.trackingType === 'SERIAL'
    ? selectedUnits.length * copies
    : product
      ? copies
      : 0;

  const labels = useMemo(() => {
    if (!product) return [];
    if (product.trackingType === 'QUANTITY') {
      return Array.from({ length: copies }, (_, index) => ({
        key: `quantity-${index}`,
        serialNo: undefined,
      }));
    }
    return selectedUnits.flatMap((unit) =>
      Array.from({ length: copies }, (_, index) => ({
        key: `${unit.id}-${index}`,
        serialNo: unit.serialNo,
      })),
    );
  }, [copies, product, selectedUnits]);

  function navigateToProduct(productId: string, unitId?: string) {
    const params = new URLSearchParams({ product: productId });
    if (unitId) params.set('unit', unitId);
    router.push(`/stock/labels?${params.toString()}`);
  }

  async function scan(value: string) {
    const normalized = value.trim().toLowerCase();
    const exactProduct = products.find(
      (item) =>
        item.sku.toLowerCase() === normalized ||
        item.barcode?.toLowerCase() === normalized,
    );
    if (exactProduct) {
      navigateToProduct(exactProduct.id);
      setScanError('');
      return;
    }

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`);
      const result = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Search failed.');
      if (result.units[0]) {
        navigateToProduct(result.units[0].productId, result.units[0].id);
        setScanError('');
        return;
      }
      if (result.products.length === 1) {
        navigateToProduct(result.products[0]!.id);
        setScanError('');
        return;
      }
      setScanError(
        result.products.length > 1
          ? 'More than one product matches. Choose the product manually.'
          : 'No product or unit matches that identifier.',
      );
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Could not search inventory.');
    }
  }

  function toggleUnit(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="stock-label-print-root" data-layout={layout}>
      <div className="label-screen-only">
        <Card className="mb-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Scan barcode, SKU or serial" hint="Scanner and keyboard entry are both supported">
              <ScannerInput
                placeholder="Scan, then press Enter"
                onScan={scan}
                onValueChange={() => setScanError('')}
              />
            </Field>
            <Field label="Product">
              <Select
                value={product?.id ?? ''}
                onChange={(event) => navigateToProduct(event.target.value)}
              >
                <option value="" disabled>Choose a product</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name}{item.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {scanError && <p className="mt-2 text-[12px] text-out">{scanError}</p>}
        </Card>

        {!product ? (
          <Card>
            <EmptyState title="Choose or scan a product to prepare its labels." />
          </Card>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="unitIds" value={JSON.stringify(selectedUnits.map((unit) => unit.id))} />
            <input type="hidden" name="layout" value={layout} />

            <Card className="mb-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[16px] font-semibold">{product.name}</p>
                  <p className="tnum mt-0.5 text-[12px] text-graphite">
                    {product.sku} · {product.trackingType}
                    {product.brandName ? ` · ${product.brandName}` : ''}
                    {product.model ? ` · ${product.model}` : ''}
                  </p>
                </div>
                <p className="tnum text-[12px] text-graphite">
                  {labelCount} {labelCount === 1 ? 'label' : 'labels'}
                </p>
              </div>

              {product.trackingType === 'SERIAL' ? (
                <div className="mt-5">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="w-52">
                      <Field label="Unit status">
                        <Select
                          value={statusFilter}
                          onChange={(event) => setStatusFilter(event.target.value as UnitStatus | 'ALL')}
                        >
                          <option value="IN_STOCK">In stock</option>
                          {role !== 'STAFF' && <option value="ALL">All statuses</option>}
                          {role !== 'STAFF' && [...new Set(units.map((unit) => unit.status))]
                            .filter((status) => status !== 'IN_STOCK')
                            .map((status) => (
                              <option key={status} value={status}>
                                {status.replaceAll('_', ' ')}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSelected((current) => {
                          const next = new Set(current);
                          visibleUnits.forEach((unit) => next.add(unit.id));
                          return next;
                        })}
                      >
                        Select visible
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  <TableViewport className="max-h-64 border border-rule">
                    <table className="w-full border-collapse text-[12px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-rule text-left">
                          <th className="w-10 px-3 py-2"><span className="sr-only">Select</span></th>
                          <th className="eyebrow px-3 py-2">Serial / IMEI</th>
                          <th className="eyebrow px-3 py-2">Status</th>
                          <th className="eyebrow px-3 py-2">Received</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleUnits.map((unit) => (
                          <tr key={unit.id} className="border-b border-rule-soft last:border-0">
                            <td className="px-3 py-2">
                              <input
                                aria-label={`Select ${unit.serialNo}`}
                                type="checkbox"
                                checked={selected.has(unit.id)}
                                onChange={() => toggleUnit(unit.id)}
                              />
                            </td>
                            <td className="tnum px-3 py-2">{unit.serialNo}</td>
                            <td className="px-3 py-2">{unit.status.replaceAll('_', ' ')}</td>
                            <td className="tnum px-3 py-2">
                              {new Intl.DateTimeFormat('en-BD', {
                                timeZone: 'Asia/Dhaka',
                                dateStyle: 'medium',
                              }).format(new Date(unit.receivedAt))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {visibleUnits.length === 0 && (
                      <p className="p-5 text-center text-[12px] text-graphite">
                        No units have this status.
                      </p>
                    )}
                  </TableViewport>
                </div>
              ) : (
                <p className="mt-4 text-[12px] text-graphite">
                  Quantity-tracked items use {product.barcode ? 'the product barcode' : 'the SKU'}.
                  Enter the number of identical labels required.
                </p>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <Field
                  label={product.trackingType === 'SERIAL' ? 'Copies per selected unit' : 'Number of labels'}
                >
                  <Input
                    name="copies"
                    type="number"
                    min={1}
                    max={500}
                    value={copies}
                    onChange={(event) => setCopies(Math.max(1, Math.min(500, Number(event.target.value) || 1)))}
                  />
                </Field>
                <Field label="Print layout">
                  <Select value={layout} onChange={(event) => setLayout(event.target.value as 'thermal' | 'a4')}>
                    <option value="thermal">Thermal — 50 × 25 mm</option>
                    <option value="a4">A4 adhesive sheet</option>
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={pending || labelCount === 0 || labelCount > 500}
                  >
                    {pending ? 'Preparing…' : `Print ${labelCount || ''} label${labelCount === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </div>
              {state.error && <p className="mt-3 text-[12px] text-out">{state.error}</p>}
              {labelCount > 500 && (
                <p className="mt-3 text-[12px] text-out">A print job may contain at most 500 labels.</p>
              )}
              {role === 'STAFF' && (
                <p className="mt-3 text-[11px] text-graphite">
                  STAFF can print and reprint labels for in-stock items only.
                </p>
              )}
              <p className="mt-1 text-[11px] text-graphite">
                In the browser print dialog, use 100% scale and disable headers and footers.
              </p>
            </Card>

            {labels.length > 0 && (
              <Card className="mb-4 overflow-auto p-4">
                <p className="eyebrow mb-3">Print preview</p>
                <div className="label-preview-grid">
                  {labels.slice(0, 12).map((label) => (
                    <ProductLabel
                      key={`preview-${label.key}`}
                      shopName={shopName}
                      product={product}
                      serialNo={label.serialNo}
                    />
                  ))}
                </div>
                {labels.length > 12 && (
                  <p className="mt-3 text-[11px] text-graphite">
                    Preview shows the first 12 of {labels.length} labels.
                  </p>
                )}
              </Card>
            )}
          </form>
        )}
      </div>

      {product && labels.length > 0 && (
        <div className="label-print-area" aria-hidden="true">
          <div className="label-print-grid">
            {labels.map((label) => (
              <ProductLabel
                key={`print-${label.key}`}
                shopName={shopName}
                product={product}
                serialNo={label.serialNo}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
