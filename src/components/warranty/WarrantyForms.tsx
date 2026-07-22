'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  addWarrantyNoteAction,
  createWarrantyClaimAction,
  resolveWarrantyClaimAction,
  recordWarrantyHandoverAction,
  transitionWarrantyClaimAction,
  updateSupplierWarrantyCaseAction,
  type WarrantyActionState,
} from '@/actions/warranty';
import { ScannerInput } from '@/components/search/ScannerInput';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import {
  RMA_COVERAGES, RMA_CUSTODIES, RMA_STATUS_TRANSITIONS, SUPPLIER_WARRANTY_STATUSES,
  type RmaCoverage, type RmaCustody, type RmaStatus, type Supplier, type SupplierWarrantyCase, type User,
} from '@/domain/types';

function useKey(ok?: string) {
  const [key, setKey] = useState('pending');
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => { if (ok) setKey(crypto.randomUUID()); }, [ok]);
  return key;
}
function Feedback({ state }: { state: WarrantyActionState }) {
  if (!state.error && !state.ok) return null;
  return <p className={`mb-3 rounded-[3px] border px-3 py-2 text-[12px] ${state.error ? 'border-out/20 bg-out-wash text-out' : 'border-ok/20 bg-ok-wash text-ok'}`}>{state.error ?? state.ok}</p>;
}

export function WarrantyLookup({ initialSerial = '' }: { initialSerial?: string }) {
  return (
    <form method="get" action="/warranty/new" className="flex max-w-xl items-end gap-2">
      <div className="flex-1"><Field label="Scan or enter sold serial / IMEI"><ScannerInput name="serial" defaultValue={initialSerial} autoFocus required placeholder="Scan, then press Enter" /></Field></div>
      <Button type="submit">Look up</Button>
    </form>
  );
}

export function WarrantyIntakeForm({ serialNo, customerName, customerPhone }: { serialNo: string; customerName: string | null; customerPhone: string | null }) {
  const [state, action, pending] = useActionState(createWarrantyClaimAction, {});
  const key = useKey(state.ok);
  return (
    <form action={action}>
      <input type="hidden" name="serialNo" value={serialNo} /><input type="hidden" name="idempotencyKey" value={key} />
      <Feedback state={state} />
      <Card className="mt-4 p-5"><p className="eyebrow mb-4">Claim intake</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name"><Input name="claimantName" defaultValue={customerName ?? ''} /></Field>
          <Field label="Customer phone"><Input name="claimantPhone" defaultValue={customerPhone ?? ''} /></Field>
          <div className="sm:col-span-2"><Field label="Reported issue"><Textarea name="reportedIssue" required minLength={5} placeholder="Describe the fault and symptoms" /></Field></div>
          <div className="sm:col-span-2"><Field label="Physical condition" hint="Record scratches, dents, missing parts and included accessories"><Textarea name="physicalCondition" /></Field></div>
        </div>
        <Button className="mt-4" disabled={pending || key === 'pending'}>{pending ? 'Opening…' : 'Open claim'}</Button>
      </Card>
    </form>
  );
}

export function WarrantyNoteForm({ claimId }: { claimId: string }) {
  const [state, action, pending] = useActionState(addWarrantyNoteAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><Field label="Add timeline note"><Textarea name="note" required /></Field><Button className="mt-2" variant="ghost" disabled={pending || key === 'pending'}>Add note</Button></form>;
}

export function WarrantyHandoverForm({ claimId, status, custody }: { claimId: string; status: RmaStatus; custody: RmaCustody }) {
  const [state, action, pending] = useActionState(recordWarrantyHandoverAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="expectedStatus" value={status} /><input type="hidden" name="expectedCustody" value={custody} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><Field label="New custody"><Select name="custody" required defaultValue=""> <option value="" disabled>Choose handover destination</option>{RMA_CUSTODIES.filter((value) => value !== custody).map((value) => <option key={value}>{value}</option>)}</Select></Field><div className="mt-3"><Field label="Handover note"><Textarea name="note" required placeholder="Who received it and why" /></Field></div><Button className="mt-2" variant="ghost" disabled={pending || key === 'pending'}>Record handover</Button></form>;
}

export function WarrantyTransitionForm({ claimId, status, coverage, users }: { claimId: string; status: RmaStatus; coverage: RmaCoverage; users: User[] }) {
  const [state, action, pending] = useActionState(transitionWarrantyClaimAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="expectedStatus" value={status} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><div className="grid gap-3 sm:grid-cols-2">
    <Field label="Next status"><Select name="nextStatus" required>{RMA_STATUS_TRANSITIONS[status].map((value) => <option key={value}>{value}</option>)}</Select></Field>
    <Field label="Custody"><Select name="custody" defaultValue=""><option value="">Keep current</option>{RMA_CUSTODIES.map((value) => <option key={value}>{value}</option>)}</Select></Field>
    <Field label="Customer coverage"><Select name="coverage" defaultValue={coverage}>{RMA_COVERAGES.map((value) => <option key={value}>{value}</option>)}</Select></Field>
    <Field label="Assign to"><Select name="assignedToId" defaultValue=""><option value="">Unassigned</option>{users.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
    <div className="sm:col-span-2"><Field label="Reason / note"><Textarea name="note" required /></Field></div>
  </div><Button className="mt-3" disabled={pending || key === 'pending'}>Update claim</Button></form>;
}

export function WarrantyResolutionForm({ claimId, status }: { claimId: string; status: RmaStatus }) {
  const [state, action, pending] = useActionState(resolveWarrantyClaimAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="expectedStatus" value={status} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><div className="grid gap-3 sm:grid-cols-2">
    <Field label="Inventory outcome"><Select name="outcome"><option value="RESTOCK">Returned and fit for stock</option><option value="WRITEOFF">Returned and damaged</option><option value="REPLACEMENT">Issue replacement unit</option></Select></Field>
    <Field label="Replacement serial" hint="Required only for replacement; must be the same product"><ScannerInput name="replacementSerial" /></Field>
    <div className="sm:col-span-2"><Field label="Resolution note"><Textarea name="note" required /></Field></div>
  </div><Button className="mt-3" disabled={pending || key === 'pending'}>Apply stock resolution</Button></form>;
}

export function SupplierWarrantyForm({ claimId, suppliers, value }: { claimId: string; suppliers: Supplier[]; value: SupplierWarrantyCase | null }) {
  const [state, action, pending] = useActionState(updateSupplierWarrantyCaseAction, {}); const key = useKey(state.ok);
  return <form action={action}><input type="hidden" name="claimId" value={claimId} /><input type="hidden" name="idempotencyKey" value={key} /><Feedback state={state} /><div className="grid gap-3 sm:grid-cols-2">
    <Field label="Supplier"><Select name="supplierId" required defaultValue={value?.supplierId ?? ''}><option value="" disabled>Choose supplier</option>{suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
    <Field label="Supplier status"><Select name="status" defaultValue={value?.status ?? 'DRAFT'}>{SUPPLIER_WARRANTY_STATUSES.map((status) => <option key={status}>{status}</option>)}</Select></Field>
    <Field label="Supplier coverage"><Select name="coverage" defaultValue={value?.coverage ?? 'UNKNOWN_PROOF_OF_PURCHASE'}>{RMA_COVERAGES.map((coverage) => <option key={coverage}>{coverage}</option>)}</Select></Field>
    <Field label="Supplier reference"><Input name="reference" defaultValue={value?.reference ?? ''} /></Field>
    <div className="sm:col-span-2"><Field label="Supplier resolution"><Textarea name="resolution" defaultValue={value?.resolution ?? ''} /></Field></div>
  </div><Button className="mt-3" variant="ghost" disabled={pending || key === 'pending'}>Save supplier case</Button></form>;
}

export function PrintButton() { return <Button variant="ghost" type="button" onClick={() => window.print()} className="print:hidden">Print acknowledgement</Button>; }
