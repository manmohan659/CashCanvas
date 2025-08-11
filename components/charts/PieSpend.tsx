import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, Label } from 'recharts';

interface PieSpendProps {
  data: Array<{ category: string; total: number }>;
  onSliceClick?: (category: string) => void;
}

// Curated palette: ensure adjacent slices are visually distinct (pink-led but varied)
const PALETTE = [
  '#ff7096', // pink (brand)
  '#6A5AF9', // violet
  '#FF7849', // orange
  '#26C6DA', // cyan
  '#43A047', // green
  '#FFC857', // amber
  '#7E57C2', // purple
  '#8D6E63', // brown
  '#1E88E5', // blue
  '#F06292', // rose
];

const colorFor = (key: string): string => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export default function PieSpend({ data, onSliceClick }: PieSpendProps) {
  // Always call hooks first
  const processed = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return { rows: [], total: 0 };
    const normalized = data.map((d) => ({ category: d.category || 'Unknown', total: Math.abs(d.total || 0) }));
    const total = normalized.reduce((s, r) => s + r.total, 0);
    if (total === 0) return { rows: [], total: 0 };
    // Aggregate tiny slices into "Other"
    const threshold = total * 0.03; // 3%
    const big = normalized.filter((r) => r.total >= threshold);
    const small = normalized.filter((r) => r.total < threshold);
    const otherTotal = small.reduce((s, r) => s + r.total, 0);
    const rows = [...big];
    if (otherTotal > 0) rows.push({ category: 'Other', total: otherTotal });
    // Sort by value desc for stable, aesthetic layout
    rows.sort((a, b) => b.total - a.total);
    return { rows, total };
  }, [data]);

  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
    if (percent < 0.08) return null; // suppress labels for tiny slices
    const RAD = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RAD);
    const y = cy + radius * Math.sin(-midAngle * RAD);
    const pct = Math.round(percent * 100);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 700 }}>
        {`${pct}%`}
      </text>
    );
  };

  const centerLabel = ({ viewBox }: any) => {
    const { cx, cy } = viewBox;
    const totalStr = `$${processed.total.toFixed(0)}`;
    return (
      <g>
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--muted)" style={{ fontSize: 12 }}>Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text)" style={{ fontSize: 16, fontWeight: 800 }}>{totalStr}</text>
      </g>
    );
  };

  // Assign distinct colors per visible slice to avoid collisions
  const fills = processed.rows.map((r, i) => (r.category === 'Other' ? '#9e9e9e' : PALETTE[i % PALETTE.length]));

  if (processed.rows.length === 0) {
    return <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      No spending data available
    </div>;
  }

  return (
    <div style={{ height: '300px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={processed.rows}
            dataKey="total"
            nameKey="category"
            innerRadius={70}
            outerRadius={110}
            minAngle={2}
            labelLine={false}
            label={renderLabel}
            onClick={(d: any) => {
              if (!onSliceClick) return;
              const name = d && (d.name || d.category || d.payload?.category);
              if (name) onSliceClick(String(name));
            }}
          >
            {processed.rows.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={fills[index]} />
            ))}
            <Label content={centerLabel} position="center" />
          </Pie>
          <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Amount']} />
          <Legend
            payload={processed.rows.map((r, i) => ({ value: r.category, type: 'circle', color: fills[i] as any }))}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
