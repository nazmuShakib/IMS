import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { parseReportFilters, reportRaw } from '@/lib/report-query';
import { calculateReport } from '@/lib/report-calculations';
import { finishReport } from '@/lib/report-results';
import { reportFixture, reportNow } from '../../../tests/report-fixtures';
import '@/app/globals.css';
const ctx = reportFixture();
function App() {
  const [url, setUrl] = useState(location.search);
  useEffect(() => {
    const sync = () => setUrl(location.search);
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  const q = parseReportFilters(reportRaw(new URLSearchParams(url))),
    locale = sessionStorage.getItem('locale') === 'bn' ? 'bn' : 'en';
  return (
    <I18nProvider locale={locale}>
      <main className="dashboard-content mx-auto max-w-[1440px] p-3 sm:p-6">
        <h1 className="mb-4 text-[22px] font-semibold">
          {locale === 'bn' ? 'আর্থিক প্রতিবেদন' : 'Financial reports'}
        </h1>
        <ReportWorkspace
          filters={q}
          report={finishReport(calculateReport(ctx, q, reportNow), q)}
          options={{
            categories: [...ctx.categoryNames].map(([id, name]) => ({ id, name })),
            brands: [...ctx.brandNames].map(([id, name]) => ({ id, name })),
            suppliers: [...ctx.supplierNames].map(([id, name]) => ({ id, name })),
            actors: [...ctx.actorNames].map(([id, name]) => ({ id, name })),
          }}
          selectedProduct={
            q.productId ? (ctx.products.find((p) => p.id === q.productId) ?? null) : null
          }
        />
      </main>
    </I18nProvider>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
