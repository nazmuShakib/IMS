import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ audit: vi.fn(), capability: vi.fn(), findProduct: vi.fn(), units: vi.fn() }));
vi.mock('@/lib/audit', () => ({ writeAudit: mocks.audit }));
vi.mock('@/lib/session', () => ({ requireCapability: mocks.capability }));
vi.mock('@/repositories', () => ({ db: { products: { findById: mocks.findProduct }, units: { findByProduct: mocks.units } } }));
import { recordLabelPrintAction } from '@/actions/labels';
function data(copies = '2') { const fd = new FormData(); for (const [key, value] of Object.entries({ productId: 'bulk', copies, unitIds: '[]', layout: 'thermal' })) fd.set(key, value); return fd; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.capability.mockResolvedValue({ id: 'actor', role: 'STAFF' }); mocks.audit.mockResolvedValue(undefined);
  mocks.findProduct.mockResolvedValue({ id: 'bulk', sku: 'SKU', name: 'Cable', barcode: '12345678', trackingType: 'QUANTITY', quantityOnHand: 3 });
});
describe('label preparation action', () => {
  it('returns a server snapshot and nonce only after recording the request', async () => {
    const result = await recordLabelPrintAction({}, data());
    expect(mocks.capability).toHaveBeenCalledWith('PRINT_LABELS');
    expect(result).toMatchObject({ printNonce: expect.any(String), job: { copies: 2, labelCount: 2, product: { barcode: '12345678' } } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'label.print', after: expect.objectContaining({ event: 'print.requested', labelCount: 2 }) }));
  });
  it('returns field errors for invalid input without auditing', async () => {
    expect((await recordLabelPrintAction({}, data('1.5'))).fieldErrors?.copies).toBe('labels.invalidCopies');
    const invalid = data(); invalid.set('unitIds', '{');
    expect((await recordLabelPrintAction({}, invalid)).fieldErrors?.unitIds).toBe('labels.invalidUnits');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('does not expose a printable job when audit fails and allows retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.audit.mockRejectedValueOnce(new Error('offline'));
    expect(await recordLabelPrintAction({}, data())).toEqual({ error: 'labels.prepareFailed' });
    expect((await recordLabelPrintAction({}, data())).job?.labelCount).toBe(2); log.mockRestore();
  });
});
