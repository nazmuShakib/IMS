import Link from 'next/link';
import { requireCapability } from '@/lib/session';
import { inspectWarrantySerial } from '@/services/warranty';
import { Badge, Card, Money, PageHeader, SerialChip } from '@/components/ui';
import { WarrantyIntakeForm, WarrantyLookup } from '@/components/warranty/WarrantyForms';

export const dynamic = 'force-dynamic';
export default async function NewWarrantyPage({ searchParams }: { searchParams: Promise<{ serial?: string }> }) {
  await requireCapability('CREATE_RMA'); const { serial = '' } = await searchParams;
  let inspected: Awaited<ReturnType<typeof inspectWarrantySerial>> | null = null; let error = '';
  if (serial) { try { inspected = await inspectWarrantySerial(serial); } catch (e) { error = e instanceof Error ? e.message : 'Could not inspect serial.'; } }
  return <><PageHeader title="Open warranty claim" count="Scanning a claim does not move inventory" /><Card className="p-5"><WarrantyLookup initialSerial={serial} />{error && <p className="mt-3 text-[12px] text-out">{error}</p>}</Card>
    {inspected && <>{inspected.activeClaim ? <Card className="mt-4 p-5"><p className="text-[13px]">An active claim already exists: <Link className="text-signal" href={`/warranty/${inspected.activeClaim.id}`}>{inspected.activeClaim.claimNumber}</Link></p></Card> : <>
      <Card className="mt-4 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[16px] font-medium">{inspected.product.name}</p><p className="mt-1"><SerialChip serial={inspected.unit.serialNo} /></p></div><Badge tone={inspected.coverage === 'IN_WARRANTY' ? 'ok' : 'low'}>{inspected.coverage}</Badge></div><dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-3"><div><dt className="eyebrow">Sold</dt><dd>{new Date(inspected.sale.createdAt).toLocaleDateString('en-GB')}</dd></div><div><dt className="eyebrow">Sale price</dt><dd><Money value={inspected.sale.unitPrice} /></dd></div><div><dt className="eyebrow">Warranty expires</dt><dd>{inspected.unit.warrantyExpiresAt ? new Date(inspected.unit.warrantyExpiresAt).toLocaleDateString('en-GB') : 'Not recorded'}</dd></div></dl></Card>
      <WarrantyIntakeForm serialNo={inspected.unit.serialNo} customerName={inspected.sale.customerName} customerPhone={inspected.sale.customerPhone} />
    </>}</>}
  </>;
}
