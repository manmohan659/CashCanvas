import React, { useEffect, useMemo, useRef, useState } from 'react';

type MonthCoverage = {
  month: string; // YYYY-MM
  days: number; // distinct days present in this month
  daysInMonth: number; // calendar days in the month
  pct: number; // completeness 0..1
  hasPdf?: boolean; // whether any rows in this month came from PDF imports
};

interface MonthRingProps {
  coverage: MonthCoverage[];
  year?: number; // optional filter, defaults to current year
  size?: number; // diameter (if not provided, component auto-sizes)
  onMonthClick?: (month: string) => void; // YYYY-MM
  since?: string; // ISO date for earliest data (YYYY-MM-DD)
  through?: string; // ISO date for latest data (YYYY-MM-DD)
  showLegend?: boolean;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  const a = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const p1 = polar(cx, cy, r, end);
  const p2 = polar(cx, cy, r, start);
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 0 ${p2.x} ${p2.y}`;
}

export default function MonthRing({ coverage, year, size: sizeProp = 0, onMonthClick, since, through, showLegend = true }: MonthRingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(320);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(Math.floor(w));
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  const size = sizeProp > 0 ? sizeProp : Math.max(220, Math.min(420, Math.floor(containerWidth * 0.72)));
  const rows = useMemo(() => {
    if (!coverage) return [] as MonthCoverage[];
    return coverage
      .filter((c) => /\d{4}-\d{2}/.test(c.month))
      .filter((c) => !year || Number(c.month.slice(0, 4)) === year)
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [coverage, year]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const ticks = 12;
  const baseColor = 'var(--border)'; // none
  const fullColor = '#6A5AF9'; // full month (violet)
  const partialColor = '#ff7096'; // partial month (pink)
  const pdfColor = '#FF7849'; // indicator

  const byMonthIndex = new Map<number, MonthCoverage>();
  for (const row of rows) {
    const m = Number(row.month.slice(5, 7)) - 1; // 0-11
    byMonthIndex.set(m, row);
  }

  const colorForPct = (pct: number): string => {
    if (pct >= 0.95) return fullColor;
    if (pct > 0) return partialColor;
    return baseColor;
  };

  const items = Array.from({ length: ticks }, (_, i) => i);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const formatDate = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const fmt = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return fmt;
  };
  
  // Scale month label size with chart size so labels look more legible
  const labelFontSize = Math.max(12, Math.min(14, Math.round(size * 0.045)));

  return (
    <div ref={containerRef} style={{ width: '100%', display: 'grid', placeItems: 'center' }}>
      <div style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Month coverage">
        {/* base ring */}
        <circle cx={cx} cy={cy} r={r} stroke={baseColor} strokeWidth={10} fill="none" />
        {items.map((i) => {
          const start = (i * 360) / ticks;
          const end = ((i + 1) * 360) / ticks - 2; // small gap
          const info = byMonthIndex.get(i);
          const color = colorForPct(info?.pct || 0);
          const month = String(i + 1).padStart(2, '0');
          const y = year || new Date().getFullYear();
          const label = `${y}-${month}`;
          return (
            <g key={i} onClick={() => onMonthClick?.(label)} style={{ cursor: 'pointer' }}>
              <path d={arc(cx, cy, r, start, end)} stroke={color} strokeWidth={10} fill="none" />
              {/* pdf indicator as a thin inner tick */}
              {info?.hasPdf && (
                <path d={arc(cx, cy, r - 6, start, end)} stroke={pdfColor} strokeWidth={2} fill="none" />
              )}
              {/* label */}
              {(() => {
                const outward = Math.max(18, Math.round(size * 0.08));
                const labelRadius = Math.min(r + outward, cx - 6);
                const p = polar(cx, cy, labelRadius, (start + end) / 2);
                return (
                  <text
                    x={p.x}
                    y={p.y}
                    fontSize={labelFontSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--muted)"
                  >
                    {monthNames[i]}
                  </text>
                );
              })()}
              <title>
                {`${monthNames[i]} ${y} — ${info ? `${info.days}/${info.daysInMonth} days (${Math.round((info.pct || 0)*100)}%)` : 'No data'}`}
              </title>
            </g>
          );
        })}
        {/* center information */}
        {through ? (
          <>
            <text x={cx} y={cy - 12} fontSize={11} textAnchor="middle" fill="var(--muted)">Data through</text>
            <text x={cx} y={cy + 6} fontSize={16} fontWeight={800} textAnchor="middle" fill="var(--text)">
              {formatDate(through)}
            </text>
            {since && (
              <text x={cx} y={cy + 24} fontSize={10} textAnchor="middle" fill="var(--muted)">Since {formatDate(since)}</text>
            )}
          </>
        ) : (
          <>
            <text x={cx} y={cy - 6} fontSize={12} textAnchor="middle" fill="var(--muted)">Coverage</text>
            <text x={cx} y={cy + 12} fontSize={16} fontWeight={800} textAnchor="middle" fill="var(--text)">
              {year || new Date().getFullYear()}
            </text>
          </>
        )}
      </svg>
      </div>
      {showLegend && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11 }}>
            <span style={{ width: 10, height: 10, background: fullColor, display: 'inline-block', borderRadius: 2 }} /> Full
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11 }}>
            <span style={{ width: 10, height: 10, background: partialColor, display: 'inline-block', borderRadius: 2 }} /> Partial
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11 }}>
            <span style={{ width: 10, height: 10, background: baseColor, display: 'inline-block', borderRadius: 2 }} /> None
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11 }}>
            <span style={{ width: 10, height: 4, background: pdfColor, display: 'inline-block', borderRadius: 2 }} /> PDF present
          </span>
        </div>
      )}
    </div>
  );
}


