'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DailyFinancialPoint, DailyOperationsPoint } from '@/services/dashboard';
import { useI18n } from '@/components/i18n/I18nProvider';

const shortDate = (value: string) => value.slice(5);
const taka = (value: number) => Math.round(value / 100);
const moneyTick = (value: number) => `৳${Math.round(value / 1000)}k`;

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[3px] border border-rule bg-card p-4">
      <h2 className="mb-4 text-[13px] font-medium">{title}</h2>
      <div className="h-56">{children}</div>
    </section>
  );
}

export function DashboardCharts({
  operations,
  financials,
}: {
  operations: DailyOperationsPoint[];
  financials?: DailyFinancialPoint[];
}) {
  const { t } = useI18n();
  const moneyData = financials?.map((point) => ({
    ...point,
    stockValue: taka(point.stockValue),
    revenue: taka(point.revenue),
    margin: taka(point.margin),
  }));
  const operationsData = operations.map((point) => ({
    ...point,
    stockOut: -point.stockOut,
    net: point.stockIn - point.stockOut,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartShell title={t('dashboard.chartMovement')}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={operationsData}
            margin={{ left: -20, right: 8, top: 4, bottom: 0 }}
            barCategoryGap="20%"
            stackOffset="sign"
          >
            <CartesianGrid stroke="#e6e9eb" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => [Math.abs(Number(value)).toLocaleString('en-BD'), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#9ca3af" />
            <Bar dataKey="stockIn" name={t('dashboard.stockIn')} fill="#1b7f5c" stackId="movement" maxBarSize={22} />
            <Bar dataKey="stockOut" name={t('dashboard.stockOut')} fill="#b3261e" stackId="movement" maxBarSize={22} />
            <Line type="monotone" dataKey="net" name={t('dashboard.net')} stroke="#626c76" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartShell>

      {moneyData && (
        <ChartShell title={t('dashboard.chartStockValue')}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={moneyData} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e6e9eb" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10 }} width={54} />
              <Tooltip formatter={(value) => `৳${Number(value).toLocaleString('en-BD')}`} />
              <Line type="monotone" dataKey="stockValue" name={t('dashboard.stockValue')} stroke="#2e4bd8" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      )}

      {moneyData && (
        <ChartShell title={t('dashboard.chartRevenue')}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={moneyData} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#e6e9eb" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10 }} width={54} />
              <Tooltip formatter={(value) => `৳${Number(value).toLocaleString('en-BD')}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="revenue" name={t('dashboard.revenue')} stroke="#2e4bd8" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="margin" name={t('dashboard.salesMargin')} stroke="#1b7f5c" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      )}
    </div>
  );
}
