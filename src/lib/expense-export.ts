import type { ExpenseCategory, OperatingExpense } from '@/domain/types';
import { expenseDisplayDate, summarizeExpenses, type ExpenseQuery } from './expense-query';
import { createTranslator, type MessageKey } from './i18n/messages';
import { domainLabel } from './i18n/domain';
import type { Locale } from './i18n/config';
import { formatBDT } from './money';
import type { TabularExport } from './tabular-export';

export function expenseExport(query: ExpenseQuery, rows: OperatingExpense[], categories: ExpenseCategory[], actors: Map<string, string>, locale: Locale, now = new Date()): TabularExport {
  const t = createTranslator(locale), names = new Map(categories.map(c => [c.id, c.name]));
  const summary = summarizeExpenses(rows, categories);
  const fields: Array<[string, MessageKey]> = [['number', 'expenses.expense'], ['date', 'common.date'], ['category', 'expenses.category'], ['description', 'common.description'], ['paidTo', 'expenses.paidTo'], ['method', 'expenses.paymentMethod'], ['reference', 'common.reference'], ['amount', 'expenses.amount'], ['actor', 'expenses.recordedBy'], ['status', 'common.status'], ['voidReason', 'expenses.voidReason']];
  const filterContext: Array<{ label: string; value: string }> = [];
  const add = (key: MessageKey, value: string | undefined) => { if (value) filterContext.push({ label: t(key), value }); };
  add('common.search', query.query);
  add('expenses.from', query.from ? expenseDisplayDate(query.from, locale) : t('expenses.noStart'));
  add('expenses.to', query.to ? expenseDisplayDate(query.to, locale) : t('expenses.noEnd'));
  add('expenses.category', query.categoryId ? names.get(query.categoryId) ?? query.categoryId : undefined);
  add('expenses.paymentMethod', query.paymentMethod ? domainLabel(t, query.paymentMethod) : undefined);
  add('expenses.recordedBy', query.recordedById ? actors.get(query.recordedById) ?? query.recordedById : undefined);
  add('common.status', query.status ? t(query.status === 'ACTIVE' ? 'common.active' : 'expenses.voided') : t('expenses.activeAndVoided'));
  add('expenses.minimum', query.minAmount === undefined ? undefined : formatBDT(query.minAmount));
  add('expenses.maximum', query.maxAmount === undefined ? undefined : formatBDT(query.maxAmount));
  add('expenses.orderBy', t(({ newest: 'expenses.newest', oldest: 'expenses.oldest', 'amount-asc': 'expenses.lowestFirst', 'amount-desc': 'expenses.highestFirst' } as const)[query.order]));
  add('expenses.groupBy', t(query.groupBy === 'category' ? 'expenses.groupCategory' : query.groupBy === 'payment' ? 'expenses.groupPayment' : 'expenses.noGrouping'));
  return {
    title: t('expenses.title'), description: t('expenses.subtitle'), generatedAt: now.toISOString(), note: t('expenses.excluded'), filterContext,
    summaryItems: [{ label: t('expenses.total'), value: formatBDT(summary.activeTotal) }, { label: t('expenses.entries'), value: summary.activeCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB') }, { label: t('expenses.voidedEntries'), value: summary.voidedCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB') }],
    columns: fields.map(([key, label]) => ({ key, label: t(label), type: key === 'amount' ? 'money' : 'text' })),
    rows: rows.map(item => ({ id: item.id, cells: { number: item.expenseNumber, date: expenseDisplayDate(item.expenseDate, locale), category: names.get(item.categoryId) ?? t('expenses.unknownCategory'), description: item.description, paidTo: item.paidTo, method: domainLabel(t, item.paymentMethod), reference: item.reference, amount: item.amount, actor: actors.get(item.recordedById) ?? '—', status: t(item.status === 'ACTIVE' ? 'common.active' : 'expenses.voided'), voidReason: item.voidReason } })),
    totals: { amount: summary.activeTotal },
  };
}
