import { notFound } from 'next/navigation';
import { db } from '@/repositories';
import { getAuthUserNames, getSession, requireCapability } from '@/lib/session';
import { Badge, Card, Money, PageHeader, SerialChip, TableViewport } from '@/components/ui';
import {
  PrintButton, SupplierWarrantyForm, WarrantyHandoverForm, WarrantyNoteForm,
  WarrantyResolutionForm, WarrantyTransitionForm,
} from '@/components/warranty/WarrantyForms';

export const dynamic = 'force-dynamic';
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase();
const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });

export default async function WarrantyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('VIEW_RMA'); const { role } = await getSession(); const { id } = await params;
  const claim = await db.warranties.findById(id); if (!claim) notFound();
  const [unit, sale, events, supplierCase, suppliers, users] = await Promise.all([
    db.units.findById(claim.unitId), db.movements.findById(claim.saleMovementId),
    db.warranties.findEvents(claim.id), db.warranties.findSupplierCase(claim.id),
    db.suppliers.findAll(), db.users.findAll(),
  ]);
  const product = unit ? await db.products.findById(unit.productId) : null;
  const names = await getAuthUserNames([claim.openedById, claim.assignedToId, ...events.map((e) => e.actorId)]);
  for (const user of users) names.set(user.id, user.name);
  const manage = role === 'ADMIN' || role === 'MANAGER';
  const canResolve = claim.status === 'APPROVED' || claim.status === 'READY_FOR_COLLECTION';
  const terminal = ['REPLACED', 'COMPLETED', 'CANCELLED'].includes(claim.status);

  return <div className="print:max-w-none"><PageHeader title={claim.claimNumber} count="Warranty / RMA acknowledgement" action={<PrintButton />} />
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-4">
        <Card className="p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-[17px] font-medium">{product?.name ?? 'Missing product'}</p>{unit && <p className="mt-1"><SerialChip serial={unit.serialNo} /></p>}</div><div className="text-right"><Badge tone={terminal ? 'ok' : 'signal'}>{claim.status}</Badge><p className="mt-1 text-[11px] text-graphite">Customer: {label(claim.coverage)}</p></div></div>
          <dl className="mt-5 grid gap-4 text-[12px] sm:grid-cols-2"><div><dt className="eyebrow">Claimant</dt><dd>{claim.claimantName ?? 'Not recorded'}{claim.claimantPhone && <span className="block tnum">{claim.claimantPhone}</span>}</dd></div><div><dt className="eyebrow">Custody</dt><dd className="capitalize">{label(claim.custody)}</dd></div><div><dt className="eyebrow">Original sale</dt><dd>{sale ? stamp(sale.createdAt) : 'Missing movement'}{sale && <span className="ml-2"><Money value={sale.unitPrice} /></span>}</dd></div><div><dt className="eyebrow">Warranty expiry</dt><dd>{unit?.warrantyExpiresAt ? stamp(unit.warrantyExpiresAt) : 'Not recorded'}</dd></div><div className="sm:col-span-2"><dt className="eyebrow">Reported issue</dt><dd className="whitespace-pre-wrap">{claim.reportedIssue}</dd></div>{claim.physicalCondition && <div className="sm:col-span-2"><dt className="eyebrow">Condition received</dt><dd className="whitespace-pre-wrap">{claim.physicalCondition}</dd></div>}{claim.resolution && <div className="sm:col-span-2"><dt className="eyebrow">Resolution</dt><dd>{claim.resolution}</dd></div>}</dl>
        </Card>

        <Card><div className="border-b border-rule px-5 py-3"><p className="eyebrow">Append-only timeline</p></div><TableViewport className="max-h-96"><ol className="divide-y divide-rule-soft">{events.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((event) => <li key={event.id} className="px-5 py-3"><div className="flex justify-between gap-3"><p className="text-[12px] font-medium">{label(event.eventType)}</p><time className="tnum text-[10px] text-graphite">{stamp(event.createdAt)}</time></div><p className="mt-1 text-[12px] text-graphite">{event.note ?? 'No note'} · {names.get(event.actorId) ?? 'Unknown user'}</p>{event.fromStatus !== event.toStatus && <p className="mt-1 text-[10px] text-graphite">{event.fromStatus ? label(event.fromStatus) : 'new'} → {event.toStatus ? label(event.toStatus) : '—'}</p>}</li>)}</ol></TableViewport></Card>
        <Card className="p-5 print:hidden"><WarrantyNoteForm claimId={claim.id} /></Card>
        {!terminal && <Card className="p-5 print:hidden"><WarrantyHandoverForm claimId={claim.id} status={claim.status} custody={claim.custody} /></Card>}
      </div>

      <div className="space-y-4 print:hidden">
        <Card className="p-5"><p className="eyebrow mb-3">Ownership</p><dl className="grid gap-3 text-[12px]"><div><dt className="text-graphite">Opened by</dt><dd>{names.get(claim.openedById) ?? 'Unknown user'}</dd></div><div><dt className="text-graphite">Assigned to</dt><dd>{claim.assignedToId ? names.get(claim.assignedToId) ?? 'Unknown user' : 'Unassigned'}</dd></div><div><dt className="text-graphite">Opened</dt><dd>{stamp(claim.openedAt)}</dd></div></dl></Card>
        {manage && !terminal && <Card className="p-5"><p className="eyebrow mb-3">Claim workflow</p><WarrantyTransitionForm claimId={claim.id} status={claim.status} coverage={claim.coverage} users={users} /></Card>}
        {manage && canResolve && <Card className="p-5"><p className="eyebrow mb-2">Inventory resolution</p><p className="mb-3 text-[11px] text-graphite">Claim intake itself did not alter stock. Only this decision writes movements.</p><WarrantyResolutionForm claimId={claim.id} status={claim.status} /></Card>}
        {manage && <Card className="p-5"><p className="eyebrow mb-2">Supplier warranty</p><p className="mb-3 text-[11px] text-graphite">Tracked separately from the customer coverage above.</p><SupplierWarrantyForm claimId={claim.id} suppliers={suppliers} value={supplierCase} /></Card>}
      </div>
    </div>
  </div>;
}
