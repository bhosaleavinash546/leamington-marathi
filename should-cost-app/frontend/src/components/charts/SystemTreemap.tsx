import {
  Treemap, ResponsiveContainer, Tooltip,
} from 'recharts';

interface SystemData {
  system_id: number;
  system_name: string;
  system_code: string;
  total_opportunity: number;
  variance_pct: number;
  part_count: number;
  parts_flagged: number;
  total_should_cost: number;
  total_best_quote: number;
}

interface Props {
  data: SystemData[];
  onSelect: (systemId: number | null) => void;
  selectedId: number | null;
}

// Map variance % to a colour on green→yellow→red scale
function varianceColor(pct: number): string {
  if (pct <= 0)   return '#059669';  // green — at or below target
  if (pct <= 5)   return '#0891b2';  // cyan — acceptable
  if (pct <= 10)  return '#d97706';  // amber — watch
  if (pct <= 20)  return '#ea580c';  // orange — flag
  return '#dc2626';                   // red — critical
}

// recharts CustomContent for treemap cells
interface ContentProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string;
  root?: { value?: number };
  depth?: number;
  value?: number;
  variance_pct?: number;
  part_count?: number;
  system_id?: number;
  isSelected?: boolean;
}

function CustomContent(props: ContentProps & { selectedId: number | null; onSelect: (id: number | null) => void }) {
  const { x = 0, y = 0, width = 0, height = 0, name, depth, value,
          variance_pct = 0, system_id, selectedId, onSelect } = props;
  if (depth !== 1 || width < 10 || height < 10) return null;

  const color   = varianceColor(variance_pct);
  const isSelected = selectedId === system_id;
  const opacity = selectedId !== null && !isSelected ? 0.45 : 1;

  return (
    <g
      onClick={() => onSelect(isSelected ? null : (system_id ?? null))}
      style={{ cursor: 'pointer' }}
      opacity={opacity}
    >
      <rect
        x={x + 2} y={y + 2}
        width={width - 4} height={height - 4}
        rx={8} ry={8}
        fill={color}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={isSelected ? 2.5 : 1}
      />
      {height > 40 && (
        <text
          x={x + width / 2} y={y + height / 2 - (height > 60 ? 12 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize={Math.min(13, width / 8)}
          fontWeight={700}
        >
          {width > 80 ? name : (name ?? '').slice(0, 6)}
        </text>
      )}
      {height > 60 && width > 70 && (
        <text
          x={x + width / 2} y={y + height / 2 + 14}
          textAnchor="middle"
          fill={color}
          fontSize={11}
          opacity={0.85}
        >
          {variance_pct > 0 ? '+' : ''}{variance_pct.toFixed(1)}%
        </text>
      )}
      {height > 80 && width > 80 && (
        <text
          x={x + width / 2} y={y + height / 2 + 30}
          textAnchor="middle"
          fill={color}
          fontSize={10}
          opacity={0.65}
        >
          {value !== undefined ? '$' + (value / 1000).toFixed(1) + 'k opp' : ''}
        </text>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SystemData }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 18px', boxShadow: 'var(--shadow-lg)',
      fontSize: 13, minWidth: 220,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-1)' }}>{d.system_name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-2)' }}>
        <span>Should-Cost: <strong>${d.total_should_cost?.toFixed(2)}</strong></span>
        <span>Best Quote:  <strong>${d.total_best_quote?.toFixed(2)}</strong></span>
        <span>Opportunity: <strong style={{ color: d.total_opportunity > 0 ? 'var(--danger)' : 'var(--success)' }}>
          {d.total_opportunity > 0 ? '+' : ''}${d.total_opportunity?.toFixed(2)}
        </strong></span>
        <span>Variance: <strong style={{ color: varianceColor(d.variance_pct) }}>
          {d.variance_pct > 0 ? '+' : ''}{d.variance_pct?.toFixed(1)}%
        </strong></span>
        <span>{d.part_count} parts · {d.parts_flagged} flagged</span>
      </div>
    </div>
  );
}

export default function SystemTreemap({ data, onSelect, selectedId }: Props) {
  // recharts Treemap needs a single root with children
  const treeData = {
    name: 'root',
    children: data
      .filter((d) => d.total_should_cost > 0 || d.total_best_quote > 0)
      .map((d) => ({
        ...d,
        name:     d.system_name,
        value:    Math.max(Math.abs(d.total_opportunity), d.total_should_cost * 0.01, 1),
      })),
  };

  if (!treeData.children.length) {
    return (
      <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
        No system data yet — publish should-cost records and submit supplier quotes.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'At/Below Target', color: '#059669' },
          { label: 'Acceptable (≤5%)', color: '#0891b2' },
          { label: 'Watch (5–10%)', color: '#d97706' },
          { label: 'Flagged (10–20%)', color: '#ea580c' },
          { label: 'Critical (>20%)', color: '#dc2626' },
        ].map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <Treemap
          data={treeData.children}
          dataKey="value"
          aspectRatio={4 / 3}
          content={(p) => (
            <CustomContent
              {...(p as ContentProps)}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>
      {selectedId && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            onClick={() => onSelect(null)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
          >
            ✕ Clear system filter
          </button>
        </div>
      )}
    </div>
  );
}
