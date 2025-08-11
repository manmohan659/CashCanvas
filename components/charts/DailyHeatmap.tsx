import React, { useEffect, useMemo, useRef, useState } from 'react';

type HeatmapDatum = { date: string; value: number };

interface DailyHeatmapProps {
  data: HeatmapDatum[];
  year?: number;
  month?: number; // 1-12 optional filter
  onDayClick?: (date: string) => void;
  height?: number; // optional fixed height; otherwise computed from cell size
}

function parseDate(iso: string): Date | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function DailyHeatmap({ data, year, month, onDayClick, height }: DailyHeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  const rafRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{
    date: string;
    value: number;
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);

  // Observe width to size cells so the grid fills the section
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
    setContainerWidth(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  const effectiveYear = year || new Date().getFullYear();

  const { grid, maxValue, weeks } = useMemo(() => {
    if (!data || data.length === 0) return { grid: [] as Array<Array<{ date: string; value: number }>>, maxValue: 0, weeks: 0 };

    const map = new Map<string, number>();
    for (const r of data) {
      if (!r || typeof r.value !== 'number' || !r.date) continue;
      const d = parseDate(r.date);
      if (!d) continue;
      if (year && d.getFullYear() !== year) continue;
      if (month && d.getMonth() + 1 !== month) continue;
      const iso = formatIso(d);
      const v = Math.max(0, Math.abs(r.value));
      map.set(iso, (map.get(iso) || 0) + v);
    }

    // Build a full-year range by default, or a single month if provided
    let rangeStart = new Date(effectiveYear, 0, 1);
    let rangeEnd = new Date(effectiveYear, 11, 31);
    if (month) {
      rangeStart = new Date(effectiveYear, month - 1, 1);
      rangeEnd = new Date(effectiveYear, month, 0);
    }

    const gridStart = startOfWeek(rangeStart);
    const gridEnd = endOfWeek(rangeEnd);

    const days: Array<{ date: string; value: number }> = [];
    const cur = new Date(gridStart);
    let maxValue = 0;
    while (cur <= gridEnd) {
      const iso = formatIso(cur);
      const v = map.get(iso) || 0;
      if (v > maxValue) maxValue = v;
      days.push({ date: iso, value: v });
      cur.setDate(cur.getDate() + 1);
    }

    // Arrange into rows by weekday (Sun..Sat), columns by week
    const weeks = Math.ceil(days.length / 7);
    const grid: Array<Array<{ date: string; value: number }>> = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < days.length; i++) {
      const row = i % 7; // weekday
      grid[row].push(days[i]);
    }
    return { grid, maxValue, weeks };
  }, [data, year, month, effectiveYear]);

  const gap = 2;
  // Compute cell size to fill available width
  const dayLabelWidth = 28;
  const minCell = 10;
  const maxCell = 28;
  const cellSize = Math.max(
    minCell,
    Math.min(
      maxCell,
      Math.floor((containerWidth - dayLabelWidth - gap * Math.max(0, weeks - 1)) / Math.max(1, weeks))
    )
  );
  const computedHeight = height || cellSize * 7 + gap * 6 + 8;

  // Pink color scale (brand-led) with higher contrast for low-but-nonzero values
  const colorFor = (v: number): string => {
    if (v <= 0) return 'var(--heatmap-empty)';
    const t = maxValue > 0 ? v / maxValue : 0;
    // Five stops for clearer separation, especially at the low end
    if (t < 0.15) return '#ffc2d1';      // low (more visible than the previous near-white)
    if (t < 0.35) return '#ff9fb6';      // light-mid
    if (t < 0.6) return '#ff7096';       // mid
    if (t < 0.85) return '#e64980';      // mid-high
    return '#c2255c';                    // high
  };

  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div ref={containerRef} style={{ height: computedHeight, overflowX: 'auto', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: '100%' }}>
        <div style={{ display: 'grid', gridTemplateRows: `repeat(7, ${cellSize}px)`, rowGap: gap, marginRight: 8 }}>
          {dayNames.map((d, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateRows: `repeat(7, ${cellSize}px)`, gridAutoFlow: 'column', columnGap: gap, rowGap: gap, width: '100%' }}>
          {grid.map((row, rIdx) =>
            row.map((cell, cIdx) => (
              <div
                key={`${rIdx}-${cIdx}`}
                onMouseEnter={(e) => {
                  const { clientX, clientY } = e;
                  setHover({ date: cell.date, value: cell.value, x: clientX, y: clientY, visible: true });
                }}
                onMouseMove={(e) => {
                  const { clientX, clientY } = e;
                  // Coalesce rapid mousemove with rAF to avoid excessive re-renders
                  if (rafRef.current) cancelAnimationFrame(rafRef.current);
                  rafRef.current = requestAnimationFrame(() => {
                    setHover((h) => (h ? { ...h, x: clientX, y: clientY, visible: true } : h));
                  });
                }}
                onMouseLeave={() => {
                  setHover((h) => (h ? { ...h, visible: false } : h));
                }}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  if (!t) return;
                  setHover({ date: cell.date, value: cell.value, x: t.clientX, y: t.clientY, visible: true });
                }}
                onTouchMove={(e) => {
                  const t = e.touches[0];
                  if (!t) return;
                  if (rafRef.current) cancelAnimationFrame(rafRef.current);
                  rafRef.current = requestAnimationFrame(() => {
                    setHover((h) => (h ? { ...h, x: t.clientX, y: t.clientY, visible: true } : h));
                  });
                }}
                onTouchEnd={() => setHover((h) => (h ? { ...h, visible: false } : h))}
                onClick={() => cell.value > 0 && onDayClick?.(cell.date)}
                role="button"
                aria-label={`${cell.date} spent $${Math.round(cell.value)}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  background: colorFor(cell.value),
                  borderRadius: 3,
                  border: '1px solid var(--heatmap-border)',
                  cursor: cell.value > 0 ? 'pointer' : 'default',
                }}
              />
            ))
          )}
        </div>
      </div>
      {/* Instant tooltip overlay */}
      <div
        ref={tooltipRef}
        aria-hidden={!hover?.visible}
        style={{
          position: 'fixed',
          left: (hover?.x ?? 0) + 12,
          top: (hover?.y ?? 0) + 12,
          transform: 'translateZ(0)',
          background: 'var(--panel)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 12,
          boxShadow: 'var(--shadow)',
          pointerEvents: 'none',
          opacity: hover?.visible ? 1 : 0,
          transition: 'opacity 80ms linear',
          zIndex: 1000,
          whiteSpace: 'nowrap',
        }}
      >
        {hover && (
          <span>
            {hover.date}: ${Math.round(hover.value).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}


