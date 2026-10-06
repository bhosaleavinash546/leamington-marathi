import type { ReactNode } from 'react';
import type { ChartTheme } from '../../lib/chart-theme';

/**
 * The pieces every chart shares, so the four chart files cannot drift apart
 * again: the card, the axis/grid props, the tooltip and the legend.
 * Marks follow the dataviz spec: bars <= 24 px with a 4 px rounded data end,
 * solid 1 px grid, recessive axes, a value at the bar tip.
 */
export const BAR_MAX = 24;
export const RADIUS_V: [number, number, number, number] = [4, 4, 0, 0];
export const RADIUS_H: [number, number, number, number] = [0, 4, 4, 0];

export function axisProps(t: ChartTheme) {
  return { tick: { fill: t.muted, fontSize: 11, fontFamily: t.font }, axisLine: false, tickLine: false } as const;
}
export function categoryAxisProps(t: ChartTheme) {
  return { tick: { fill: t.ink2, fontSize: 12, fontFamily: t.font }, axisLine: { stroke: t.baseline }, tickLine: false } as const;
}
export function gridProps(t: ChartTheme, horizontal = true) {
  return { stroke: t.grid, strokeDasharray: undefined, vertical: !horizontal, horizontal } as const;
}
export function valueLabelStyle(t: ChartTheme) {
  return { fill: t.ink, fontSize: 11, fontWeight: 600, fontFamily: t.font } as const;
}

export function ChartCard({ title, subtitle, children, action }: { title: string; subtitle?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-navy-900 p-5 shadow-card">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A themed Recharts tooltip: label in muted ink, rows with a colour key, values in primary ink. */
export function ChartTooltip({ active, payload, label, t, format, unit }: {
  active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; fill?: string; dataKey?: string; payload?: Record<string, unknown> }>;
  label?: string | number; t: ChartTheme; format?: (v: number, row?: Record<string, unknown>) => string; unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 10, padding: '8px 10px', fontFamily: t.font, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.35)' }}>
      {label !== undefined && label !== '' && <div style={{ color: t.muted, fontSize: 11, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => {
        const key = (p.payload?.fill as string) || p.fill || p.color || t.accent;
        const v = Number(p.value ?? 0);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: key, flexShrink: 0 }} />
            <span style={{ color: t.ink2 }}>{p.name ?? p.dataKey}</span>
            <span style={{ color: t.ink, fontWeight: 600, marginLeft: 'auto', paddingLeft: 12 }}>{format ? format(v, p.payload) : `${v.toLocaleString('en-GB')}${unit ?? ''}`}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A legend whose text stays in ink; identity rides on the swatch beside it. */
export function ChartLegend({ items }: { items: Array<{ name: string; color: string; value?: string }> }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-1.5 text-xs">
      {items.map(it => (
        <li key={it.name} className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: it.color }} aria-hidden="true" />
          <span className="text-slate-400 truncate">{it.name}</span>
          {it.value && <span className="ml-auto font-mono text-slate-200">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}
