import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend,
} from 'recharts';

interface SupplierRow {
  supplier_id:         number;
  supplier_name:       string;
  country?:            string;
  quote_count:         number;
  avg_variance_pct:    number;
  parts_at_or_below_target: number;
  parts_over_10pct:    number;
  total_variance:      number;
}

interface Props { data: SupplierRow[]; }

const PALETTE = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6'];

export default function SupplierRadar({ data }: Props) {
  if (data.length < 2) return (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      Need at least 2 suppliers with quotes for radar comparison.
    </div>
  );

  // Dimensions for radar (normalised 0-100, lower is better for variance)
  const metrics = [
    { key: 'Avg Variance %',    getValue: (s: SupplierRow) => Math.max(0, 100 - Math.abs(s.avg_variance_pct) * 3) },
    { key: 'Quote Coverage',    getValue: (s: SupplierRow) => Math.min(100, s.quote_count * 20) },
    { key: 'At-Target Parts %', getValue: (s: SupplierRow) => s.quote_count > 0 ? (s.parts_at_or_below_target / s.quote_count) * 100 : 0 },
    { key: 'Consistency',       getValue: (s: SupplierRow) => Math.max(0, 100 - s.parts_over_10pct * 20) },
    { key: 'Value Score',       getValue: (s: SupplierRow) => Math.max(0, 100 - Math.abs(s.total_variance) / 10) },
  ];

  const radarData = metrics.map((m) => {
    const row: Record<string, unknown> = { metric: m.key };
    data.slice(0, 5).forEach((s) => { row[s.supplier_name] = Math.round(m.getValue(s)); });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={radarData} margin={{ top: 8, right: 48, bottom: 8, left: 48 }}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
        <Tooltip
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {data.slice(0, 5).map((s, i) => (
          <Radar
            key={s.supplier_id}
            name={s.supplier_name}
            dataKey={s.supplier_name}
            stroke={PALETTE[i]}
            fill={PALETTE[i]}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}
