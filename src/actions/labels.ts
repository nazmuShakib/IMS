'use server';

import { writeAudit } from '@/lib/audit';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import { labelFieldErrors, labelPrintSchema, type LabelPrintState, type LabelScanState } from '@/lib/label-print';
import { prepareLabelJob, resolveLabelIdentifier } from '@/services/labels';
export type { LabelPrintState } from '@/lib/label-print';

export async function recordLabelPrintAction(_previous: LabelPrintState, fd: FormData): Promise<LabelPrintState> {
  const actor = await requireCapability('PRINT_LABELS');
  let unitIds: unknown;
  try { unitIds = JSON.parse(String(fd.get('unitIds') ?? '[]')); }
  catch { return { error: 'labels.fixErrors', fieldErrors: { unitIds: 'labels.invalidUnits' } }; }
  const parsed = labelPrintSchema.safeParse({ productId: fd.get('productId'), unitIds, copies: fd.get('copies'), layout: fd.get('layout') });
  if (!parsed.success) return { error: 'labels.fixErrors', fieldErrors: labelFieldErrors(parsed.error) };
  try {
    const result = await prepareLabelJob(parsed.data, actor.role, db);
    if (!result.job) return result;
    const { job } = result;
    await writeAudit({
      actorId: actor.id, action: 'label.print',
      entity: job.product.trackingType === 'SERIAL' ? 'ProductUnit' : 'Product',
      entityId: job.units.length === 1 ? job.units[0]!.id : job.product.id,
      after: { productId: job.product.id, sku: job.product.sku, layout: job.layout, copiesPerItem: job.copies,
        labelCount: job.labelCount, unitIds: job.units.map(unit => unit.id), statuses: job.units.map(unit => unit.status), event: 'print.requested' },
    });
    return { job, printNonce: crypto.randomUUID() };
  } catch (error) {
    console.error('Label preparation failed', error);
    return { error: 'labels.prepareFailed' };
  }
}

export async function resolveLabelIdentifierAction(value: string): Promise<LabelScanState> {
  const actor = await requireCapability('PRINT_LABELS');
  try { return await resolveLabelIdentifier(value, actor.role, db); }
  catch (error) { console.error('Label scan failed', error); return { error: 'labels.scanFailed' }; }
}
