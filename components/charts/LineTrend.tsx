import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ReferenceLine } from 'recharts';

interface LineTrendProps {
  data: Array<{ date: string; value: number }>;
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v);
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LineTrend({ data }: LineTrendProps) {
  const rows = useMemo(() => {
    const arr = Array.isArray(data) ? [...data] : [];
    arr.sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [data]);

  if (!rows || rows.length === 0) {
    return <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      No trend data available
    </div>;
  }

  return (
    <div style={{ height: '300px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff7096" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#ff7096" stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={formatDateLabel} minTickGap={16} tickMargin={8} tick={{ fill: 'var(--text)' }} />
          <YAxis domain={[`dataMin - 200`, `dataMax + 200`]} tickFormatter={(v) => formatCurrency(Number(v))} width={70} tick={{ fill: 'var(--muted)' }} />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), 'Balance']}
            labelFormatter={(label) => formatDateLabel(String(label))}
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
          <ReferenceLine y={0} stroke="var(--border)" />
          <Area type="monotone" dataKey="value" stroke="#ff7096" strokeWidth={2} fill="url(#trendGradient)" />
          <Line type="monotone" dataKey="value" stroke="#ff7096" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}