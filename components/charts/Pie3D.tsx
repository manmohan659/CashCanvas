import React from 'react';

// Robust 2.5D donut using SVG arcs (cross‑browser). Clickable slices.

type Pie3DProps = {
  data: Array<{ category: string; total: number }>;
  onSliceClick?: (category: string) => void;
  size?: number; // diameter, px
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const largeArc = end - start > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, end);
  const p2 = polarToCartesian(cx, cy, rOuter, start);
  const p3 = polarToCartesian(cx, cy, rInner, start);
  const p4 = polarToCartesian(cx, cy, rInner, end);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

export default function Pie3D({ data, onSliceClick, size = 320 }: Pie3DProps) {
  const total = data.reduce((s, r) => s + Math.max(0, Math.abs(r.total || 0)), 0);
  const rows = data
    .filter((r) => r && r.category && isFinite(r.total) && Math.abs(r.total) > 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const colors = ['#6A5AF9', '#00C2A8', '#FF7849', '#FFC857', '#1E88E5', '#43A047', '#F06292', '#8D6E63', '#26C6DA', '#7E57C2'];

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.45;
  const rInner = size * 0.25;

  let acc = 0;
  const slices = rows.map((r, i) => {
    const value = Math.max(0, Math.abs(r.total));
    const angle = total > 0 ? (value / total) * 360 : 0;
    const start = acc;
    const end = acc + angle;
    acc = end;
    return { ...r, start, end, color: colors[i % colors.length] };
  });

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div style={{ transform: 'perspective(800px) rotateX(20deg)' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="3D spending pie">
          <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* base disc (theme-aware) */}
          <circle cx={cx} cy={cy} r={rOuter} fill="var(--panel-2)" />

          {/* slices */}
          {slices.map((s, idx) => (
            <path
              key={idx}
              d={arcPath(cx, cy, rOuter, rInner, s.start, s.end)}
              fill={s.color}
              filter="url(#shadow)"
              style={{ cursor: 'pointer' }}
              onClick={() => onSliceClick?.(s.category)}
            >
              <title>{`${s.category}: $${Math.round(Math.abs(s.total)).toLocaleString()}`}</title>
            </path>
          ))}

          {/* center labels (undo tilt visually) */}
          <g style={{ transform: 'rotateX(-20deg)', transformOrigin: `${cx}px ${cy}px` as any }}>
            <text x={cx} y={cy - 6} fontSize={12} textAnchor="middle" fill="var(--muted)">Total</text>
            <text x={cx} y={cy + 12} fontSize={18} fontWeight={800} textAnchor="middle" fill="var(--text)">
              {`$${Math.round(total).toLocaleString()}`}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}


