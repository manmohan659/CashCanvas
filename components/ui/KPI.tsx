import React from 'react';

interface KPIProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'violet' | 'teal' | 'amber';
}

export default function KPI({ label, value, sub, tone = 'violet' }: KPIProps) {
  const className = `kpi tone-${tone}`;
  return (
    <div className={className}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}


