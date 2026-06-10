import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';

interface TrendRow {
  version:       number;
  quote_price:   number;
  should_cost:   number;
  supplier_name: string;
  supplier_id:   number;
  submitted_at:  string;
}

interface Props { data: TrendRow[]; }

// Generate a stable colour per supplier
const PALETTE = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4'];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string; payload: TrendRow }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 16px', boxShadow: 'var(--shadow-lg)', fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-1)' }}>Version {payload[0].payload.version}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 4, color: 'var(--text-2)' }}>
          <span style={{ color: p.color }}>● {p.name}</span>
          <strong>${p.value.toFixed(2)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function VersionTrendChart({ data }: Props) {
  if (!data.length) return (
    <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      Select a part above to see its quote price trend.
    </div>
  );

  // Group by version, pivot suppliers as separate keys
  const supplierNames = [...new Set(data.map((d) => d.supplier_name))];
  const versions      = [...new Set(data.map((d) => d.version))].sort();
  const shouldCost    = data.find((d) => d.should_cost > 0)?.should_cost ?? 0;

  const chartData = versions.map((v) => {
    const row: Record<string, number | string> = { version: `v${v}` };
    for (const sn of supplierNames) {
      const entry = data.find((d) => d.version === v && d.supplier_name === sn);
      if (entry) row[sn] = entry.quote_price;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="version" tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
        <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {shouldCost > 0 && (
          <ReferenceLine
            y={shouldCost} stroke="#4f46e5" strokeDasharray="5 3"
            label={{ value: 'Should-Cost', fill: '#4f46e5', fontSize: 11, position: 'right' }}
          />
        )}
        {supplierNames.map((sn, i) => (
          <Line
            key={sn} dataKey={sn}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2.5}
            dot={{ r: 5, fill: PALETTE[i % PALETTE.length] }}
            activeDot={{ r: 7 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
