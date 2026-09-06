import { z } from 'zod';
import { acceptUsedDeviceSchema } from '@/schemas';
import { parseReceiptCost } from '@/lib/stock-receipt';
import { usedDeviceInspectionGroups } from '@/lib/used-device-inspection';
import { cosmeticFormInput } from '@/lib/cosmetic-condition';

export function usedDeviceFormInput(data: FormData, mode: 'purchase' | 'trade-in', actorId = 'form') {
  const text = (key: string) => String(data.get(key) ?? '').trim();
  const optional = (key: string) => text(key) || null;
  const warrantyUnit = text('warrantyUnit') || 'MONTHS';
  const duration = text('warrantyDuration') ? Number(text('warrantyDuration')) : null;
  return {
    productId: text('productId'), serialNo: text('serialNo'), grade: text('grade'),
    batteryHealth: text('batteryHealth') ? Number(text('batteryHealth')) : null,
    cosmeticCondition: cosmeticFormInput(data),
    inspectionResults: Object.fromEntries(usedDeviceInspectionGroups.flatMap(group => group.items.map(([key]) => [key, text(`inspection.${key}`) || 'NOT_TESTED']))),
    knownDefects: optional('knownDefects'), includedAccessories: optional('includedAccessories'),
    acquisitionType: mode === 'trade-in' ? 'TRADE_IN' : 'DIRECT_PURCHASE',
    acquisitionValue: parseReceiptCost(text('acquisitionValue')), askingPrice: parseReceiptCost(text('askingPrice')),
    warrantyMonths: warrantyUnit === 'MONTHS' ? duration : null,
    warrantyDays: warrantyUnit === 'DAYS' ? duration : null, warrantyUnit,
    sellerName: text('sellerName'), sellerPhone: text('sellerPhone'),
    identificationType: optional('identificationType'), identificationNumber: optional('identificationNumber'),
    ownershipConfirmed: data.get('ownershipConfirmed') === 'on',
    location: optional('location'), reference: optional('reference'), note: optional('note'),
    actorId, idempotencyKey: text('idempotencyKey'),
  };
}
export const usedDeviceFieldsSchema = acceptUsedDeviceSchema.safeExtend({ warrantyUnit: z.enum(['DAYS', 'MONTHS']) });
export function usedDeviceFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    let key = issue.path.join('.') || '_';
    if (key === 'warrantyMonths' || key === 'warrantyDays') key = 'warrantyDuration';
    if (key.startsWith('cosmeticCondition.')) key = key.replace('cosmeticCondition.', 'cosmetic.');
    fields[key] ??= ['acquisitionValue', 'askingPrice'].includes(key) ? 'used.validMoneyRequired' : issue.message;
  }
  return fields;
}
export function tradeInEmiError(credit: number, context?: { isEmi: boolean; total: number; downPayment: number }): 'used.emiWhole' | 'used.emiLimit' | null {
  if (!context?.isEmi) return null;
  if (credit % 100 !== 0) return 'used.emiWhole';
  if (credit + context.downPayment > context.total) return 'used.emiLimit';
  return null;
}
