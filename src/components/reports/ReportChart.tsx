'use client';
import { useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, Select, TableViewport } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { ReportFilters, ReportResult } from '@/lib/report-query';
import { reportParams } from '@/lib/report-query';
import { columnLabel, presentCell, reportPeriod } from '@/lib/report-presentation';
import { reportText, reportEnum } from '@/lib/report-copy';
import { outwardNiceAxisDomain } from '@/lib/chart-axis';
import { formatBDT } from '@/lib/money';
export function ReportChart({ report, filters }: { report: ReportResult; filters: ReportFilters }) {
  const { locale, t } = useI18n(),
    [hidden, setHidden] = useState(false),
    [range, setRange] = useState<[number, number]>([
      0,
      Math.max(0, (report.chartRows?.length ?? 1) - 1),
    ]);
  const key = reportParams(filters, false).toString();
  useEffect(() => {
    setRange([0, Math.max(0, (report.chartRows?.length ?? 1) - 1)]);
  }, [key, report.chartRows?.length]);
  const temporal = report.kind === 'sales' && ['day', 'month'].includes(filters.groupBy ?? 'day');
  const keys =
    report.kind === 'sales'
      ? ['revenue', 'cogs', 'profit']
      : report.kind === 'shrinkage'
        ? ['damage', 'loss']
        : report.kind === 'movements'
          ? ['added', 'removed']
          : report.kind === 'profit'
            ? ['profit']
            : report.kind === 'purchases'
              ? ['spend']
              : ['value'];
  const colors: Record<string, string> = {
    revenue: '#2e4bd8',
    cogs: '#626c76',
    profit: '#1b7f5c',
    damage: '#b3261e',
    loss: '#b66b12',
    added: '#1b7f5c',
    removed: '#b3261e',
    value: '#2e4bd8',
    spend: '#2e4bd8',
  };
  const labelKey =
    report.kind === 'movements'
      ? 'reason'
      : report.kind === 'aging'
        ? 'bucket'
        : report.kind === 'profit' || report.kind === 'shrinkage'
          ? 'product'
          : report.kind === 'purchases'
            ? 'supplier'
            : 'group';
  const all = (report.chartRows ?? []).map((row) => ({
    ...row.cells,
    id: row.id,
    label: temporal
      ? reportPeriod(row.id, locale)
      : labelKey === 'reason'
        ? reportEnum(locale, String(row.cells.reason))
        : presentCell(
            row.cells[labelKey] ?? '',
            { key: labelKey, label: '', type: 'text' },
            locale,
          ),
  }));
  const data = temporal ? all.slice(range[0], range[1] + 1) : all;
  const numeric = report.kind === 'movements';
  const values = data.flatMap((row) =>
    keys.map((k) => Number((row as Record<string, unknown>)[k] ?? 0)),
  );
  if (report.kind === 'shrinkage')
    for (const row of data) {
      values.push(
        keys.reduce((n, k) => n + Math.max(0, Number((row as Record<string, unknown>)[k])), 0),
        keys.reduce((n, k) => n + Math.min(0, Number((row as Record<string, unknown>)[k])), 0),
      );
    }
  const domain = outwardNiceAxisDomain(values);
  const money = (value: number) =>
    numeric ? value.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD') : formatBDT(value);
  const label = (k: string) =>
    k === 'added' || k === 'removed'
      ? reportText(locale, k)
      : columnLabel(t, report.kind, { key: k, label: k, type: 'money' });
  const nonzero = all.some((row) =>
    keys.some((k) => Number((row as Record<string, unknown>)[k]) !== 0),
  );
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-medium">{reportText(locale, 'chart')}</h2>
        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          aria-expanded={!hidden}
          className="text-[12px] text-signal"
        >
          {reportText(locale, hidden ? 'show' : 'hide')}
        </button>
      </div>
      {!hidden && (
        <>
          {!temporal && (report.chartTotalCount ?? 0) > all.length && (
            <p className="mb-2 text-[11px] text-graphite">
              {reportText(locale, 'top', { count: all.length, total: report.chartTotalCount ?? 0 })}
            </p>
          )}
          {!nonzero ? (
            <p className="py-5 text-[12px] text-graphite">{reportText(locale, 'emptyChart')}</p>
          ) : (
            <>
              {temporal && all.length > 60 && (
                <fieldset className="mb-3 flex flex-wrap gap-2">
                  <legend className="mb-1 text-[12px]">{reportText(locale, 'range')}</legend>
                  {(['start', 'end'] as const).map((which, i) => (
                    <label key={which} className="min-w-0 max-w-56 flex-1">
                      <span className="sr-only">{reportText(locale, which)}</span>
                      <Select
                        aria-label={reportText(locale, which)}
                        value={range[i]}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setRange(
                            i === 0 ? [n, Math.max(n, range[1])] : [Math.min(n, range[0]), n],
                          );
                        }}
                      >
                        {all.map((row, index) => (
                          <option key={row.id} value={index}>
                            {row.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ))}
                </fieldset>
              )}
              <div
                className="w-full min-w-0"
                style={{ height: temporal ? 300 : Math.max(220, data.length * 42 + 60) }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data}
                    layout={temporal ? 'horizontal' : 'vertical'}
                    margin={{ left: 0, right: 16, top: 8, bottom: 8 }}
                    stackOffset="sign"
                    accessibilityLayer
                  >
                    <CartesianGrid
                      stroke="#d5dade"
                      strokeDasharray="3 3"
                      horizontal={temporal}
                      vertical={!temporal}
                    />
                    {temporal ? (
                      <>
                        <XAxis dataKey="label" minTickGap={35} tick={{ fontSize: 11 }} />
                        <YAxis
                          domain={domain}
                          tickFormatter={money}
                          width={90}
                          tick={{ fontSize: 10 }}
                        />
                        <ReferenceLine y={0} stroke="#626c76" />
                      </>
                    ) : (
                      <>
                        <XAxis
                          type="number"
                          domain={domain}
                          tickFormatter={money}
                          allowDecimals={!numeric}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={112}
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) =>
                            String(v).length > 17 ? `${String(v).slice(0, 16)}…` : String(v)
                          }
                        />
                        <ReferenceLine x={0} stroke="#626c76" />
                      </>
                    )}
                    <Tooltip
                      formatter={(value) => money(Number(value))}
                      labelStyle={{ color: '#14181d' }}
                      contentStyle={{ fontSize: 12, borderColor: '#d5dade', borderRadius: 3 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {keys.map((k) =>
                      temporal ? (
                        <Line
                          key={k}
                          type="linear"
                          dataKey={k}
                          name={label(k)}
                          stroke={colors[k]}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      ) : (
                        <Bar
                          key={k}
                          dataKey={k}
                          name={label(k)}
                          fill={colors[k]}
                          stackId={report.kind === 'shrinkage' ? 'shrinkage' : undefined}
                          maxBarSize={22}
                          isAnimationActive={false}
                        />
                      ),
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-2">
                <summary className="w-fit cursor-pointer text-[12px] text-graphite">
                  {reportText(locale, 'data')}
                </summary>
                <TableViewport>
                  <table className="w-full text-[12px]">
                    <caption className="sr-only">{reportText(locale, 'data')}</caption>
                    <thead>
                      <tr>
                        <th className="p-2 text-left">
                          {columnLabel(t, report.kind, {
                            key: labelKey,
                            label: labelKey,
                            type: 'text',
                          })}
                        </th>
                        {keys.map((k) => (
                          <th key={k} className="p-2 text-right">
                            {label(k)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row) => (
                        <tr key={row.id}>
                          <th className="p-2 text-left font-normal">{row.label}</th>
                          {keys.map((k) => (
                            <td key={k} className="p-2 text-right tnum">
                              {money(Number((row as Record<string, unknown>)[k]))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableViewport>
              </details>
            </>
          )}
        </>
      )}
    </Card>
  );
}
