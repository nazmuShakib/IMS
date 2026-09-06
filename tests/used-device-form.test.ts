import { describe, expect, it } from 'vitest';
import { usedDeviceFieldsSchema, usedDeviceFormInput, usedDeviceFieldErrors, tradeInEmiError } from '@/lib/used-device-form';
import { cosmeticSummary } from '@/lib/cosmetic-condition';
import { createTranslator } from '@/lib/i18n/messages';

function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ productId: '11111111-1111-4111-8111-111111111111', serialNo: 'USED-1', grade: 'GRADE_A', sellerName: 'Seller', sellerPhone: '01712345678', acquisitionValue: '20,000.50', askingPrice: '25000', ownershipConfirmed: 'on', 'inspection.imeiMatches': 'WORKING', 'inspection.activationLockClear': 'WORKING', warrantyUnit: 'MONTHS', idempotencyKey: 'used-device-test' })) data.set(key, value);
  return data;
}
describe('shared used phone form rules', () => {
  it.each(['purchase', 'trade-in'] as const)('strictly parses money for %s on the shared server/client boundary', mode => {
    const data = form();
    expect(usedDeviceFieldsSchema.parse(usedDeviceFormInput(data, mode))).toMatchObject({ acquisitionValue: 2000050, askingPrice: 2500000 });
    for (const field of ['acquisitionValue', 'askingPrice']) for (const invalid of ['12abc34', '1e3', '1,2', '-10', '1.234', '']) {
      const invalidData = form(); invalidData.set(field, invalid);
      const result = usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(invalidData, mode));
      expect(result.success, `${field}: ${invalid}`).toBe(false);
      if (!result.success) expect(usedDeviceFieldErrors(result.error)[field]).toBeTruthy();
    }
  });
  it('requires a separate resale price without falling back to credit', () => {
    const data = form(); data.delete('askingPrice');
    expect(usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(data, 'trade-in')).success).toBe(false);
  });
  it('records appearance independently and leaves all grades manual', () => {
    for (const grade of ['GRADE_A', 'GRADE_B', 'GRADE_C', 'REFURBISHED']) {
      const data = form(); data.set('grade', grade); data.set('cosmetic.screen', 'LIGHT_SCRATCHES'); data.set('cosmetic.back', 'DAMAGED');
      data.set('knownDefects', 'Repair and condition disclosed');
      const value = usedDeviceFieldsSchema.parse(usedDeviceFormInput(data, 'purchase'));
      expect(value.grade).toBe(grade);
      expect(value.cosmeticCondition).toEqual({ screen: 'LIGHT_SCRATCHES', frame: null, back: 'DAMAGED', note: null });
      expect(value.inspectionResults.display).toBe('NOT_TESTED');
    }
  });
  it('does not invent appearance or measured battery health on old or empty forms', () => {
    const data = form();
    expect(usedDeviceFieldsSchema.parse(usedDeviceFormInput(data, 'purchase'))).toMatchObject({ cosmeticCondition: null, batteryHealth: null });
    data.set('batteryHealth', '0');
    expect(usedDeviceFieldsSchema.parse(usedDeviceFormInput(data, 'purchase')).batteryHealth).toBe(0);
    expect(cosmeticSummary(undefined)).toBe('');
  });
  it('normalizes day/month validation paths and rejects invalid units', () => {
    const data = form(); data.set('warrantyDuration', '121');
    const result = usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(data, 'purchase'));
    expect(result.success).toBe(false);
    if (!result.success) expect(usedDeviceFieldErrors(result.error).warrantyDuration).toBeTruthy();
    data.set('warrantyUnit', 'INVALID');
    expect(usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(data, 'purchase')).success).toBe(false);
  });
  it('uses the server-selected mode rather than trusting a posted acquisition type', () => {
    const data = form(); data.set('acquisitionType', 'TRADE_IN');
    expect(usedDeviceFormInput(data, 'purchase').acquisitionType).toBe('DIRECT_PURCHASE');
  });
  it('keeps mandatory acceptance gates and existing defect notes', () => {
    const data = form(); data.set('inspection.activationLockClear', 'NOT_APPLICABLE');
    expect(usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(data, 'trade-in')).success).toBe(false);
    data.set('inspection.activationLockClear', 'WORKING'); data.set('inspection.display', 'DEFECTIVE');
    expect(usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(data, 'trade-in')).success).toBe(false);
    data.set('knownDefects', 'Display flickers');
    expect(usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(data, 'trade-in')).success).toBe(true);
  });
  it('shows EMI constraints without preventing ordinary excess-credit payouts', () => {
    expect(tradeInEmiError(10001, { isEmi: true, total: 20000, downPayment: 0 })).toBe('used.emiWhole');
    expect(tradeInEmiError(15000, { isEmi: true, total: 20000, downPayment: 6000 })).toBe('used.emiLimit');
    expect(tradeInEmiError(15000, { isEmi: true, total: 20000, downPayment: 5000 })).toBeNull();
    expect(tradeInEmiError(25000, { isEmi: false, total: 20000, downPayment: 0 })).toBeNull();
  });
  it('summarizes appearance in either interface language', () => {
    const appearance = { screen: 'LIGHT_SCRATCHES' as const, frame: null, back: null, note: 'Near the edge' };
    expect(cosmeticSummary(appearance)).toContain('Screen: Light scratches');
    expect(cosmeticSummary(appearance, createTranslator('bn'))).toContain('স্ক্রিন: হালকা আঁচড়');
  });
});
