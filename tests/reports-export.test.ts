import { beforeEach, describe, it, expect, vi } from 'vitest';
import { reportFixture, reportNow } from './report-fixtures';
import { calculateReport } from '@/lib/report-calculations';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  report: vi.fn(),
  pdf: vi.fn(),
  lookup: vi.fn(),
  context: vi.fn(),
}));
vi.mock('@/lib/session', () => ({ getOptionalSession: mocks.session }));
vi.mock('@/services/reports', async () => ({
  ...(await vi.importActual('@/lib/report-query')),
  getReport: mocks.report,
}));
vi.mock('@/lib/report-pdf', () => ({ reportToPdf: mocks.pdf }));
vi.mock('@/lib/report-export-context', () => ({ reportExportContext: mocks.context }));
vi.mock('@/repositories', () => ({ db: { reports: { products: mocks.lookup } } }));
import { GET } from '@/app/api/reports/export/route';
import { GET as products } from '@/app/api/reports/products/route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ role: 'MANAGER', locale: 'bn' });
  mocks.report.mockResolvedValue(calculateReport(reportFixture(), { report: 'profit' }, reportNow));
  mocks.pdf.mockResolvedValue(Buffer.from('%PDF-fixture'));
  mocks.context.mockResolvedValue([]);
  mocks.lookup.mockResolvedValue([{ id: 'p1', name: 'বাংলা', sku: 'S1' }]);
});
describe('Report export and lookup boundaries', () => {
  it.each([
    ['csv', 401, null],
    ['pdf', 403, { role: 'STAFF', locale: 'en' }],
  ])('protects %s export', async (format, status, session) => {
    mocks.session.mockResolvedValue(session);
    const response = await GET(new Request(`http://localhost/api/reports/export?format=${format}`));
    expect(response.status).toBe(status);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each(['2026-02-30', '2026-13-01'])('returns 400 and details for %s', async (from) => {
    const response = await GET(
      new Request(`http://localhost/api/reports/export?report=sales&from=${from}`),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).details.from).toBeTruthy();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it('uses first repeated values, strips unsupported fields, and exports all rows with localized labels', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/reports/export?report=profit&from=2026-08-01&from=invalid&supplierId=ignored&page=2&format=csv',
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.report).toHaveBeenCalledWith(
      expect.objectContaining({ report: 'profit', from: '2026-08-01', supplierId: undefined }),
      { export: true },
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const body = await response.text();
    expect(body).toContain('বাংলা');
    expect(body).toContain('লাভ');
  });
  it('returns localized PDF using the same confirmed query and includes filter context', async () => {
    const response = await GET(
      new Request('http://localhost/api/reports/export?report=profit&format=pdf'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ filterContext: [] }), 'bn');
  });
  it('protects and bounds the minimal product lookup', async () => {
    mocks.session.mockResolvedValue({ role: 'STAFF' });
    expect(
      (await products(new Request('http://localhost/api/reports/products?q=phone'))).status,
    ).toBe(403);
    expect(mocks.lookup).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({ role: 'ADMIN' });
    const response = await products(
      new Request('http://localhost/api/reports/products?q=%20phone%20&q=ignored'),
    );
    expect(mocks.lookup).toHaveBeenCalledWith('phone');
    expect(await response.json()).toEqual({ products: [{ id: 'p1', name: 'বাংলা', sku: 'S1' }] });
  });
});
