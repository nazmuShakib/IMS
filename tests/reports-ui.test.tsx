// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { parseReportFilters, reportHref, type ReportFilters } from '@/lib/report-query';
import { calculateReport } from '@/lib/report-calculations';
import { finishReport } from '@/lib/report-results';
import { reportFixture, reportNow } from './report-fixtures';
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/reports/ReportChart', () => ({
  ReportChart: () => <div data-chart>Chart</div>,
}));
let root: Root, container: HTMLDivElement;
const node = <T extends HTMLElement = HTMLElement>(q: string) => container.querySelector<T>(q)!;
const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
const click = async (el: HTMLElement) => act(async () => el.click());
const change = async (q: string, value: string) => {
  const el = node<HTMLInputElement>(q);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const fixture = reportFixture();
async function mount(filters: ReportFilters, locale: 'en' | 'bn' = 'en') {
  window.history.replaceState(null, '', reportHref(filters));
  await act(async () =>
    root.render(
      <I18nProvider locale={locale}>
        <ReportWorkspace
          filters={filters}
          report={finishReport(calculateReport(fixture, filters, reportNow), filters)}
          options={{
            categories: [{ id: 'c1', name: 'Category 1' }],
            brands: [],
            suppliers: [],
            actors: [],
          }}
          selectedProduct={null}
        />
      </I18nProvider>,
    ),
  );
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.push.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ products: [] }) })),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('submits explicitly, avoids duplicate history, and preserves unfinished filters across paging and refresh', async () => {
  const q = parseReportFilters({ report: 'sales' });
  window.history.replaceState(null, '', reportHref(q));
  await mount(q);
  await click(button('Apply filters'));
  expect(mocks.push).not.toHaveBeenCalled();
  await change('input[type=date]', '2026-08-01');
  expect(mocks.push).not.toHaveBeenCalled();
  await click(button('Next'));
  expect(mocks.push).toHaveBeenLastCalledWith(reportHref({ ...q, page: 2 }), { scroll: false });
  await mount({ ...q, page: 2 });
  expect(node<HTMLInputElement>('input[type=date]').value).toBe('2026-08-01');
  await mount({ ...q, page: 2 });
  expect(node<HTMLInputElement>('input[type=date]').value).toBe('2026-08-01');
  await click(button('Apply filters'));
  expect(mocks.push).toHaveBeenLastCalledWith(reportHref({ ...q, from: '2026-08-01', page: 1 }), {
    scroll: false,
  });
});
it('switches reports with compatible applied filters and restores drafts when the applied URL changes', async () => {
  const q = parseReportFilters({
    report: 'sales',
    from: '2026-08-01',
    categoryId: 'c1',
    groupBy: 'month',
  });
  await mount(q);
  await change('input[type=date]', '2026-08-04');
  await click(node('a[href*="report=aging"]'));
  const target = new URL(mocks.push.mock.calls.at(-1)![0], 'http://localhost');
  expect(target.searchParams.get('categoryId')).toBe('c1');
  expect(target.searchParams.has('from')).toBe(false);
  expect(target.searchParams.has('groupBy')).toBe(false);
  await mount({ ...q, from: '2026-08-02' });
  expect(node<HTMLInputElement>('input[type=date]').value).toBe('2026-08-02');
  await mount(q);
  expect(node<HTMLInputElement>('input[type=date]').value).toBe('2026-08-01');
});
it('reset clears current filters without introducing dates; validation retains the rejected draft', async () => {
  const q = parseReportFilters({
    report: 'sales',
    from: '2026-08-01',
    to: '2026-08-31',
    categoryId: 'c1',
  });
  await mount(q);
  await change('input[type=date]', '2026-09-02');
  await click(button('Apply filters'));
  expect(node('[role=alert]')).not.toBeNull();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(node<HTMLInputElement>('input[type=date]').value).toBe('2026-09-02');
  await click(button('Reset'));
  expect(node('[role=alert]')).toBeNull();
  expect(mocks.push).toHaveBeenLastCalledWith(reportHref(parseReportFilters({ report: 'sales' })), {
    scroll: false,
  });
});
it('keeps results mounted but inactive during navigation and exports only applied filters', async () => {
  let resolve!: () => void;
  mocks.push.mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const q = parseReportFilters({ report: 'sales', from: '2026-08-01', page: '2' });
  await mount(q);
  await change('input[type=date]', '2026-08-04');
  expect(node<HTMLAnchorElement>('a[href*="format=csv"]').href).toContain('from=2026-08-01');
  expect(node<HTMLAnchorElement>('a[href*="format=csv"]').href).not.toContain('page=');
  await click(button('Apply filters'));
  expect(node('[aria-busy=true]')).not.toBeNull();
  expect(node('table')).not.toBeNull();
  expect(node('fieldset[inert]')).not.toBeNull();
  expect(button('Apply filters').matches(':disabled')).toBe(true);
  await act(async () => resolve());
  expect(node('[aria-busy=true]')).toBeNull();
});
it('provides all seven reports in a labelled mobile selector and localized summaries', async () => {
  await mount(parseReportFilters({ report: 'movements' }), 'bn');
  expect(node<HTMLSelectElement>('select').options).toHaveLength(7);
  expect(container.textContent).toContain('নিট পরিবর্তন');
  expect(container.textContent).toContain('যোগ হওয়া ইউনিট');
});

it('does not add history when submitting equivalent default URLs', async () => {
  await mount(parseReportFilters({ report: 'valuation' }));
  window.history.replaceState(null, '', '/reports');
  await click(button('Apply filters'));
  expect(mocks.push).not.toHaveBeenCalled();
});

it('shows filters and both exports directly without report charts', async () => {
  await mount(parseReportFilters({ report: 'movements' }));
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('[data-chart]')).toBeNull();
  expect(container.textContent).not.toContain('Hide chart');
  expect(node('a[href*="format=csv"]').textContent).toBe('Export CSV');
  expect(node('a[href*="format=pdf"]').textContent).toBe('Export PDF');
  expect(container.querySelectorAll('select').length).toBeGreaterThan(5);
});
