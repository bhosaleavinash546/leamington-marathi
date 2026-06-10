interface ElementRow {
  cost_element:    string;
  category?:       string;
  avg_should_cost: number;
  avg_quote:       number;
  avg_variance_pct: number;
  sample_count:    number;
  total_variance:  number;
}

interface Props {
  data: ElementRow[];
  onSelect?: (element: string) => void;
}

function heatColor(pct: number): string {
  const abs = Math.abs(pct);
  if (pct < -10)  return { bg: 'var(--success-bg)',   text: 'var(--success)' } as unknown as string;
  if (pct < 0)    return { bg: '#d1fae5',              text: '#059669' } as unknown as string;
  if (abs <= 5)   return { bg: 'var(--bg-alt)',         text: 'var(--text-2)' } as unknown as string;
  if (abs <= 10)  return { bg: 'var(--warn-bg)',        text: 'var(--warn)' } as unknown as string;
  if (abs <= 20)  return { bg: '#fff0e0',               text: '#ea580c' } as unknown as string;
  return           { bg: 'var(--danger-bg)',             text: 'var(--danger)' } as unknown as string;
}

function getColors(pct: number): { bg: string; text: string } {
  if (pct < -10) return { bg: 'var(--success-bg)', text: 'var(--success)' };
  if (pct <   0) return { bg: '#d1fae5',            text: '#059669'       };
  if (pct <=  5) return { bg: 'var(--bg-alt)',       text: 'var(--text-2)' };
  if (pct <= 10) return { bg: 'var(--warn-bg)',      text: 'var(--warn)'   };
  if (pct <= 20) return { bg: '#fff0e0',             text: '#ea580c'       };
  return               { bg: 'var(--danger-bg)',     text: 'var(--danger)' };
}

void heatColor; // suppress unused warning

export default function ElementHeatmap({ data, onSelect }: Props) {
  if (!data.length) return (
    <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      No element data yet. Create comparison snapshots first.
    </div>
  );

  const sorted = [...data].sort((a, b) => Math.abs(b.avg_variance_pct) - Math.abs(a.avg_variance_pct));

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Below target', bg: 'var(--success-bg)', text: 'var(--success)' },
          { label: 'On target (0-5%)', bg: 'var(--bg-alt)', text: 'var(--text-2)' },
          { label: 'Watch (5-10%)', bg: 'var(--warn-bg)', text: 'var(--warn)' },
          { label: 'High (10-20%)', bg: '#fff0e0', text: '#ea580c' },
          { label: 'Critical (>20%)', bg: 'var(--danger-bg)', text: 'var(--danger)' },
        ].map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: l.bg, border: `1px solid ${l.text}` }} />
            <span style={{ color: 'var(--text-3)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {sorted.map((el) => {
          const { bg, text } = getColors(el.avg_variance_pct);
          return (
            <div
              key={el.cost_element}
              onClick={() => onSelect?.(el.cost_element)}
              style={{
                background: bg,
                border: `1px solid ${text}`,
                borderRadius: 10,
                padding: '12px 14px',
                cursor: onSelect ? 'pointer' : 'default',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: text, marginBottom: 6, lineHeight: 1.3 }}>
                {el.cost_element}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: text, lineHeight: 1 }}>
                {el.avg_variance_pct > 0 ? '+' : ''}{el.avg_variance_pct.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: text, opacity: 0.7, marginTop: 4 }}>
                avg over {el.sample_count} snapshot{el.sample_count !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 11, color: text, marginTop: 6, opacity: 0.85 }}>
                SC: {el.avg_should_cost.toFixed(2)} → {el.avg_quote.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
