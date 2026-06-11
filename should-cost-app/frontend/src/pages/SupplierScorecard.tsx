import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';

interface ScorecardRow {
  supplier_id: number;
  supplier_name: string;
  country?: string;
  total_quotes: number;
  accepted_quotes: number;
  rejected_quotes: number;
  unique_parts: number;
  win_rate_pct: number | null;
  avg_overpay_pct: number | null;
  avg_response_days: number | null;
  last_quote_at?: string;
}

interface SupplierDetail {
  supplier: { id: number; name: string; country?: string; contact_email?: string };
  recentQuotes: Array<{
    id: number; part_number: string; part_description?: string;
    status: string; total_price: number; currency: string;
    submitted_at?: string; variance_pct?: number;
  }>;
  topParts: Array<{ part_number: string; description?: string; best_price: number; currency: string; quote_count: number }>;
  monthlyTrend: Array<{ month: string; quote_count: number }>;
}

const pct = (n: number | null) => n == null ? '—' : `${Number(n).toFixed(1)}%`;
const days = (n: number | null) => n == null ? '—' : `${Number(n).toFixed(1)}d`;
const winColor = (v: number | null) => !v ? 'var(--text-3)' : v >= 50 ? 'var(--success)' : 'var(--danger)';
const overpayColor = (v: number | null) => !v ? 'var(--text-3)' : v > 10 ? 'var(--danger)' : v > 5 ? '#f59e0b' : 'var(--success)';

export default function SupplierScorecard() {
  const [selected, setSelected] = useState<number | null>(null);

  const { data: scorecard = [], isLoading } = useQuery({
    queryKey: ['supplier-scorecard'],
    queryFn: () => api.get<ScorecardRow[]>('/supplier-scorecard').then((r) => r.data),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['supplier-detail', selected],
    queryFn: () => api.get<SupplierDetail>(`/supplier-scorecard/${selected}`).then((r) => r.data),
    enabled: selected != null,
  });

  if (isLoading) return <div className="loading">Loading scorecard…</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 20 }}>
      {/* ── Left: supplier list ── */}
      <div>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h1>Supplier Scorecard</h1>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                  <th style={{ padding: '11px 14px' }}>Supplier</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Quotes</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Win Rate</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Avg Overpay</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Resp. Days</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Parts</th>
                </tr>
              </thead>
              <tbody>
                {scorecard.map((s) => (
                  <tr
                    key={s.supplier_id}
                    style={{
                      borderTop: '1px solid var(--border)', cursor: 'pointer',
                      background: selected === s.supplier_id ? 'var(--accent-glow)' : undefined,
                    }}
                    onClick={() => setSelected(selected === s.supplier_id ? null : s.supplier_id)}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700 }}>{s.supplier_name}</div>
                      {s.country && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.country}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{s.total_quotes}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: winColor(s.win_rate_pct) }}>
                      {pct(s.win_rate_pct)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: overpayColor(s.avg_overpay_pct) }}>
                      {pct(s.avg_overpay_pct)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-2)' }}>
                      {days(s.avg_response_days)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{s.unique_parts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 16 }}>
          <span><span style={{ color: 'var(--success)' }}>●</span> Win Rate ≥ 50%</span>
          <span><span style={{ color: 'var(--danger)' }}>●</span> Win Rate &lt; 50%</span>
          <span><span style={{ color: 'var(--danger)' }}>●</span> Overpay &gt; 10%</span>
          <span><span style={{ color: '#f59e0b' }}>●</span> Overpay 5-10%</span>
        </div>
      </div>

      {/* ── Right: supplier detail panel ── */}
      {selected && (
        <div>
          {loadingDetail ? (
            <div className="loading" style={{ marginTop: 60 }}>Loading…</div>
          ) : detail ? (
            <>
              <div className="page-header" style={{ marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{detail.supplier.name}</h2>
                  {detail.supplier.country && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{detail.supplier.country}</div>}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>✕</button>
              </div>

              {/* Monthly trend sparkline */}
              {detail.monthlyTrend.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Quote Activity (12 months)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 52 }}>
                    {detail.monthlyTrend.map((m) => {
                      const max = Math.max(...detail.monthlyTrend.map((x) => x.quote_count));
                      const h = max ? Math.max(4, (m.quote_count / max) * 48) : 4;
                      return (
                        <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <div style={{ width: '100%', height: h, background: 'var(--accent)', borderRadius: 3 }} title={`${m.month}: ${m.quote_count}`} />
                          <div style={{ fontSize: 9, color: 'var(--text-3)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{m.month}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top parts */}
              {detail.topParts.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Most Quoted Parts</div>
                  {detail.topParts.map((p) => (
                    <div key={p.part_number} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{p.part_number}</span>
                        {p.description && <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 8 }}>{p.description}</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>{p.currency} {Number(p.best_price).toFixed(2)}</span>
                        <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 6 }}>best · {p.quote_count} quotes</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent quotes */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Recent Quotes</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Part</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Var %</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recentQuotes.map((q) => (
                      <tr key={q.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{q.part_number}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{q.currency} {Number(q.total_price).toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: (q.variance_pct ?? 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {q.variance_pct != null ? `${(q.variance_pct ?? 0) > 0 ? '+' : ''}${Number(q.variance_pct).toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className={`badge badge-${q.status}`}>{q.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
