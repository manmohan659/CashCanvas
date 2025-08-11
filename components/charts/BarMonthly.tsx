import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Line } from 'recharts';

type MonthlyDatum = {
  month: string; // YYYY-MM
  income: number; // positive
  spend: number; // negative (expenses)
  net?: number; // income + spend
};

interface BarMonthlyProps {
  data: MonthlyDatum[];
}

function formatMonthLabel(ym: string): string {
  // ym expected as YYYY-MM
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (isNaN(d.getTime())) return ym;
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

export default function BarMonthly({ data }: BarMonthlyProps) {
  const processed = useMemo(() => {
    const rows = Array.isArray(data) ? data.map((d) => ({ ...d, net: (d.net ?? d.income + d.spend) })) : [];
    // Sort by month ascending
    rows.sort((a, b) => a.month.localeCompare(b.month));
    return rows;
  }, [data]);

  const domain = useMemo(() => {
    if (!processed.length) return [0, 1] as [number, number];
    let minV = 0;
    let maxV = 0;
    for (const r of processed) {
      minV = Math.min(minV, r.income, r.spend, r.net ?? 0);
      maxV = Math.max(maxV, r.income, r.spend, r.net ?? 0);
    }
    const range = Math.max(1, Math.abs(maxV - minV));
    const pad = Math.max(50, Math.round(range * 0.08));
    return [minV - pad, maxV + pad] as [number, number];
  }, [processed]);

  if (!processed || processed.length === 0) {
    return (
      <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        No monthly data available
      </div>
    );
  }

  return (
    <div style={{ height: '300px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={processed} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            minTickGap={12}
            tickMargin={8}
            tick={{ fill: 'var(--text)' }}
          />
          <YAxis domain={domain} tickFormatter={(v) => formatCurrency(v)} width={70} tick={{ fill: 'var(--muted)' }} />
          <Tooltip
            formatter={(value: any, _name: any, entry: any) => {
              const key = String(entry?.dataKey ?? '').toLowerCase();
              const label = key === 'income' ? 'Income' : key === 'spend' ? 'Spend' : 'Net';
              const v = key === 'spend' ? Math.abs(Number(value)) : Number(value);
              return [formatCurrency(v), label];
            }}
            labelFormatter={(label) => formatMonthLabel(String(label))}
            contentStyle={{
              background: 'rgba(18,24,38,0.9)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--text)',
              boxShadow: 'var(--shadow)',
              backdropFilter: 'blur(8px)'
            }}
            itemStyle={{ color: 'var(--text)' }}
            labelStyle={{ color: 'var(--text)', fontWeight: 700 }}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          />
          <Legend />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar name="Income" dataKey="income" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar name="Spend" dataKey="spend" stackId="a" fill="#ff7096" radius={[0, 0, 4, 4]} />
          <Line name="Net" type="monotone" dataKey="net" stroke="#6A5AF9" strokeWidth={2} dot={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}