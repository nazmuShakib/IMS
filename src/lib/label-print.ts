import { z } from 'zod';
import { encodeCode128 } from '@/lib/code128';
import type { TrackingType, UnitStatus } from '@/domain/types';

export const MAX_LABELS = 500;
export const LABEL_WIDTH_DOTS = 304;
export const DOT_WIDTH_MM = 25.4 / 203;

export const labelCopiesSchema = z.string().trim()
  .regex(/^\d+$/, 'labels.invalidCopies')
  .transform(Number)
  .pipe(z.number().int('labels.invalidCopies').min(1, 'labels.invalidCopies').max(MAX_LABELS, 'labels.invalidCopies'));
export const labelPrintSchema = z.object({
  productId: z.string().trim().min(1, 'labels.chooseHelp'),
  unitIds: z.array(z.string().trim().min(1)).max(MAX_LABELS, 'labels.maxError'),
  copies: labelCopiesSchema,
  layout: z.enum(['thermal', 'a4'], { error: 'labels.invalidLayout' }),
});
export type LabelPrintRequest = z.infer<typeof labelPrintSchema>;
export type LabelFieldErrors = Partial<Record<'productId' | 'unitIds' | 'copies' | 'layout', string>>;
export function labelFieldErrors(error: z.ZodError): LabelFieldErrors {
  const errors: LabelFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof LabelFieldErrors;
    errors[field] ??= field === 'unitIds' && issue.message !== 'labels.maxError' ? 'labels.invalidUnits' : issue.message;
  }
  return errors;
}
export interface LabelUnitOption { id: string; serialNo: string; status: UnitStatus; receivedAt: string }
export interface LabelProductOption {
  id: string; sku: string; barcode: string | null; name: string; model: string | null;
  trackingType: TrackingType; brandName: string | null; quantityOnHand: number; isActive: boolean;
}
export interface PreparedLabelJob {
  product: Pick<LabelProductOption, 'id' | 'name' | 'sku' | 'barcode' | 'trackingType'>;
  units: LabelUnitOption[];
  copies: number;
  layout: 'thermal' | 'a4';
  labelCount: number;
}
export interface LabelPrintState { error?: string; fieldErrors?: LabelFieldErrors; printNonce?: string; job?: PreparedLabelJob }
export interface LabelScanState { error?: string; productId?: string; unit?: LabelUnitOption }

/** Preserve the encoder and its established IMEI geometry; reject overflow instead of scaling it. */
export function labelBarcodeFit(value: string) {
  try {
    const encoding = encodeCode128(value);
    if (encoding.modules.length > LABEL_WIDTH_DOTS) return { error: 'labels.barcodeTooWide' as const };
    const moduleDots = Math.floor(LABEL_WIDTH_DOTS / encoding.modules.length);
    return { encoding, moduleDots, widthMm: encoding.modules.length * moduleDots * DOT_WIDTH_MM, warning: moduleDots === 1 ? 'labels.narrowBarcode' as const : undefined };
  } catch {
    return { error: 'labels.barcodeInvalid' as const };
  }
}
