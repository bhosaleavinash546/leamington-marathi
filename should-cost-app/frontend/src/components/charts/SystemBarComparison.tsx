import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts';

interface SystemRow {
  system_name: string;
  system_code: string;
  total_should_cost: number;
  total_best_quote:  number;
  total_avg_quote:   number;
  variance_pct:      number;
}

interface Props { data: SystemRow[]; }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const sc  = payload.find((p) => p.name === 'Should-Cost')?.value ?? 0;
  const bq  = payload.find((p) => p.name === 'Best Quote')?.value ?? 0;
  const aq  = payload.find((p) => p.name === 'Avg Quote')?.value ?? 0;
  const opp = bq - sc;
  const pct = sc > 0 ? ((opp / sc) * 100).toFixed(1) : '0';

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 16px', boxShadow: 'var(--shadow-lg)', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-1)' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 4, color: 'var(--text-2)' }}>
          <span style={{ color: p.color }}>● {p.name}</span>
          <strong>${p.value.toFixed(2)}</strong>
        </div>
      ))}
      {sc > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
          <span style={{ color: opp > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
            Opportunity: {opp > 0 ? '+' : ''}${opp.toFixed(2)} ({pct}%)
          </span>
        </div>
      )}
      {aq > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Avg Quote: ${aq.toFixed(2)}</div>}
    </div>
  );
}

export default function SystemBarComparison({ data }: Props) {
  const filtered = data.filter((d) => d.total_should_cost > 0 || d.total_best_quote > 0);

  if (!filtered.length) return (
    <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      No comparison data yet.
    </div>
  );

  const formatted = filtered.map((d) => ({
    name: d.system_code,
    fullName: d.system_name,
    'Should-Cost': Number(d.total_should_cost.toFixed(2)),
    'Best Quote':  Number(d.total_best_quote.toFixed(2)),
    'Avg Quote':   Number(d.total_avg_quote.toFixed(2)),
    variance_pct:  d.variance_pct,
  }));

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={formatted} margin={{ top: 8, right: 16, bottom: 50, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="name"
          tick={{ fill: 'var(--text-3)', fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
          iconType="circle"
        />
        <ReferenceLine y={0} stroke="var(--border-2)" />
        <Bar dataKey="Should-Cost" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {formatted.map((_, i) => <Cell key={i} fillOpacity={0.85} />)}
        </Bar>
        <Bar dataKey="Best Quote" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {formatted.map((entry, i) => (
            <Cell key={i} fill={entry.variance_pct > 10 ? '#dc2626' : entry.variance_pct > 0 ? '#d97706' : '#059669'} fillOpacity={0.85} />
          ))}
        </Bar>
        <Bar dataKey="Avg Quote" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={24} opacity={0.6} />
      </BarChart>
    </ResponsiveContainer>
  );
}
