import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExpenseWorkspace } from '@/components/expenses/ExpenseWorkspace';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { expensePageFromRows, orderExpenses, parseExpenseQuery } from '@/lib/expense-query';
import { rows, categories } from './data';
import '@/app/globals.css';
function App() {
  const [, refresh] = useState(0);
  useEffect(() => { const sync = () => refresh(n => n + 1); addEventListener('popstate', sync); return () => removeEventListener('popstate', sync); }, []);
  const q = parseExpenseQuery(Object.fromEntries(new URLSearchParams(location.search)));
  const locale = sessionStorage.getItem('locale') === 'bn' ? 'bn' : 'en';
  const filtered = rows.filter(r => (!q.query || r.description.toLowerCase().includes(q.query.toLowerCase())) && (!q.status || r.status === q.status) && (!q.categoryId || r.categoryId === q.categoryId)).sort((a, b) => orderExpenses(a, b, q.order));
  return <I18nProvider locale={locale}><main className="dashboard-content mx-auto max-w-[1440px] p-3 sm:p-6"><ExpenseWorkspace role="ADMIN" query={q} result={expensePageFromRows(filtered, categories, q)} categories={[...categories]} users={[{ id: 'user1', name: 'Manager / ব্যবস্থাপক' }]} /></main></I18nProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
