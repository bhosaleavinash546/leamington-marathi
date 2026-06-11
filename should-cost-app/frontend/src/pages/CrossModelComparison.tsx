import { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';

interface Family { family_code: string; family_name: string; members: number }
interface Member {
  part_id: number;
  part_number: string;
  program_code: string;
  program_name: string;
  segment: string | null;
  model_year: number | null;
  annual_volume: number;
  should_cost: number;
  current_price: number;
  best_quote: number | null;
  categories: Record<string, number>;
}
interface Driver { category: string; label: string; min: number; max: number; spread: number }
interface Analysis {
  headline: string;
  cheapest: { program: string; total: number } | null;
  costliest: { program: string; total: number } | null;
  spreadPct: number;
  driver: Driver | null;
  overpayers: { program: string; program_code: string; overpayPct: number; amount: number; annual: number }[];
  savings: { program: string; program_code: string; vsCurrentPct: number; bestQuote: number; annual: number }[];
  recommendations: string[];
}
interface FamilyData {
  family_code: string;
  family_name: string;
  currency: string;
  members: Member[];
  analysis: Analysis;
}

const CAT_ORDER = ['RAW_MATERIAL', 'BOP', 'MANUFACTURING', 'OVERHEAD', 'LOGISTICS', 'TOOLING', 'PROFIT'];
const CAT_LABEL: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material', BOP: 'Bought-Out Parts', MANUFACTURING: 'Manufacturing', OVERHEAD: 'Overhead',
  LOGISTICS: 'Logistics', TOOLING: 'Tooling', PROFIT: 'Profit',
};

export default function CrossModelComparison() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [code, setCode]         = useState<string>('');
  const [data, setData]         = useState<FamilyData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    api.get<Family[]>('/cross-model/families')
      .then((r) => { setFamilies(r.data); if (r.data.length) setCode(r.data[0].family_code); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!code) { setData(null); return; }
    setLoadingData(true);
    api.get<FamilyData>(`/cross-model/family/${code}`)
      .then((r) => setData(r.data))
      .finally(() => setLoadingData(false));
  }, [code]);

  const cur = data?.currency ?? 'GBP';
  const fmt = (n: number | null | undefined) => n == null ? '—' : `${cur} ${Number(n).toFixed(2)}`;

  const cheapestSc = useMemo(
    () => data ? Math.min(...data.members.filter((m) => m.should_cost > 0).map((m) => m.should_cost)) : 0,
    [data]
  );
  const catsPresent = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    data.members.forEach((m) => Object.keys(m.categories).forEach((c) => s.add(c)));
    return CAT_ORDER.filter((c) => s.has(c));
  }, [data]);

  if (loading) return <div className="loading">Loading cross-model families…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cross-Model Comparison</h1>
          <div className="sub">
            Compare the same component across vehicle programs and let AI pinpoint where the cost gap is.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Component family</label>
          <select value={code} onChange={(e) => setCode(e.target.value)} style={{ minWidth: 240 }}>
            {families.map((f) => (
              <option key={f.family_code} value={f.family_code}>
                {f.family_name} ({f.members} models)
              </option>
            ))}
          </select>
        </div>
      </div>

      {families.length === 0 ? (
        <div className="card"><div className="empty">No multi-model component families found.</div></div>
      ) : loadingData || !data ? (
        <div className="card"><div className="loading">Analysing…</div></div>
      ) : (
        <>
          {/* AI Gap headline */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, var(--accent-glow), transparent)',
            border: '1px solid var(--accent)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)' }}>
                🤖 AI Gap Analysis
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>
              {data.analysis.headline}
            </div>
            {data.analysis.driver && (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Largest cross-model spread is in <strong>{data.analysis.driver.label}</strong>:{' '}
                {fmt(data.analysis.driver.min)} → {fmt(data.analysis.driver.max)} per part.
              </div>
            )}
          </div>

          {/* Comparison matrix */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 16px' }}>Program</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Should-Cost</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Δ vs lowest</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Current Price</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Overpay</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Best Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => {
                    const delta = m.should_cost - cheapestSc;
                    const deltaPct = cheapestSc ? (delta / cheapestSc) * 100 : 0;
                    const overpay = m.current_price - m.should_cost;
                    const overpayPct = m.should_cost ? (overpay / m.should_cost) * 100 : 0;
                    return (
                      <tr key={m.part_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '11px 16px' }}>
                          <div style={{ fontWeight: 700 }}>{m.program_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {m.program_code}{m.model_year ? ` · ${m.model_year}` : ''}{m.segment ? ` · ${m.segment}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700 }}>{fmt(m.should_cost)}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', color: delta > 0.005 ? 'var(--danger)' : 'var(--success)' }}>
                          {delta > 0.005 ? `+${deltaPct.toFixed(0)}%` : '— lowest'}
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right' }}>{fmt(m.current_price)}</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', color: overpayPct > 0 ? 'var(--danger)' : 'var(--text-3)' }}>
                          {overpayPct > 0 ? `+${overpayPct.toFixed(0)}%` : '—'}
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{fmt(m.best_quote)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category gap matrix */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
              Should-Cost by Category (per part)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 16px' }}>Category</th>
                    {data.members.map((m) => (
                      <th key={m.part_id} style={{ padding: '10px 16px', textAlign: 'right' }}>{m.program_code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catsPresent.map((c) => {
                    const vals = data.members.map((m) => m.categories[c] ?? 0);
                    const min = Math.min(...vals), max = Math.max(...vals);
                    const isDriver = data.analysis.driver?.category === c;
                    return (
                      <tr key={c} style={{ borderTop: '1px solid var(--border)', background: isDriver ? 'var(--accent-glow)' : undefined }}>
                        <td style={{ padding: '9px 16px', fontWeight: isDriver ? 800 : 600 }}>
                          {CAT_LABEL[c] ?? c}{isDriver && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6 }}>● gap driver</span>}
                        </td>
                        {data.members.map((m, i) => {
                          const v = vals[i];
                          const hot = v === max && max !== min;
                          const cold = v === min && max !== min;
                          return (
                            <td key={m.part_id} style={{
                              padding: '9px 16px', textAlign: 'right',
                              color: hot ? 'var(--danger)' : cold ? 'var(--success)' : 'var(--text-2)',
                              fontWeight: hot || cold ? 700 : 400,
                            }}>
                              {v ? v.toFixed(2) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI recommendations */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>AI Recommendations</h3>
              <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                {data.analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Biggest Savings Opportunities</h3>
              {data.analysis.savings.length === 0 ? (
                <div className="empty" style={{ fontSize: 13 }}>No savings vs current price detected.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.analysis.savings.slice(0, 5).map((s) => (
                    <div key={s.program_code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{s.program}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.vsCurrentPct.toFixed(0)}% below current price</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: 'var(--success)' }}>~£{Math.round(s.annual).toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>per year</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
