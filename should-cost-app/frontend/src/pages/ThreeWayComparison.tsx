import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Program { id: number; code: string; name: string; part_count: string; }
interface PartMeta {
  id: number; part_number: string; description: string;
  program_code: string; program_name: string; system_name: string;
  has_sc: boolean; has_cp: boolean; quote_count: string;
}
interface CompRow {
  cost_element: string; category: string; category_label: string;
  sc_value: number; cp_value: number;
  cp_vs_sc: { delta: number; pct: number };
  quotes: { supplier_name: string; value: number; vs_sc: { delta: number; pct: number }; vs_cp: { delta: number; pct: number } }[];
  best_quote_value: number; best_supplier: string;
}
interface CatBreakdown { category: string; label: string; sc: number; cp: number; best_quote: number; sc_pct: number; cp_pct: number; }
interface ThreeWayData {
  part: { id: number; part_number: string; description: string; commodity: string; system_name: string; program: { code: string; name: string } | null };
  shouldCost: { total: number; version: number; currency: string } | null;
  currentPrice: { total: number; supplier_name: string; effective_date: string } | null;
  supplierQuotes: { supplier_id: number; supplier_name: string; total_price: number }[];
  rows: CompRow[];
  analysis: {
    totals: { sc: number; cp: number; best_quote: number; cp_vs_sc: { delta: number; pct: number }; best_vs_sc: { delta: number; pct: number }; best_vs_cp: { delta: number; pct: number } };
    topCostDrivers: { cost_element: string; category: string; sc_value: number; pct_of_total: number }[];
    biggestOverpayments: { cost_element: string; category: string; delta: number; pct: number }[];
    savingsOpportunities: { cost_element: string; category: string; best_supplier: string; current_value: number; best_value: number; savings: number; savings_pct: number }[];
    categoryBreakdown: CatBreakdown[];
    riskFlags: { element: string; reason: string; severity: string }[];
    recommendations: string[];
  };
}

// Same-origin by default — nginx (Docker) and the Vite dev server both proxy /api
const API = import.meta.env.VITE_API_URL ?? '';
const token = () => localStorage.getItem('sc_token') ?? '';

function pctColor(pct: number): string {
  if (pct > 20) return 'var(--danger)';
  if (pct > 10) return '#ea580c';
  if (pct > 0)  return 'var(--warn)';
  if (pct < -5) return 'var(--success)';
  return 'var(--text-2)';
}

function DeltaBadge({ delta, pct }: { delta: number; pct: number }) {
  const color = pctColor(pct);
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
      {delta > 0 ? '+' : ''}{delta.toFixed(2)} ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
    </span>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = { high: 'var(--danger)', medium: 'var(--warn)', low: 'var(--info)' };
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors[severity] ?? 'var(--text-3)', marginRight: 6 }} />;
}

const CATEGORY_COLORS: Record<string, string> = {
  RAW_MATERIAL: '#6366f1', BOP: '#f59e0b', MANUFACTURING: '#10b981',
  OVERHEAD: '#8b5cf6', LOGISTICS: '#06b6d4', TOOLING: '#ef4444', PROFIT: '#ec4899', UNCATEGORIZED: '#94a3b8',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ThreeWayComparison() {
  const [programs, setPrograms]     = useState<Program[]>([]);
  const [parts, setParts]           = useState<PartMeta[]>([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedPart, setSelectedPart]       = useState('');
  const [searchPart, setSearchPart] = useState('');
  const [data, setData]             = useState<ThreeWayData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [sortCol, setSortCol]       = useState<'element' | 'sc' | 'cp' | 'delta'>('element');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetch(`${API}/api/programs`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(setPrograms).catch(console.error);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (selectedProgram) qs.set('programId', selectedProgram);
    if (searchPart) qs.set('search', searchPart);
    fetch(`${API}/api/three-way/parts?${qs}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(setParts).catch(console.error);
  }, [selectedProgram, searchPart]);

  const loadComparison = useCallback(async (partId: string) => {
    if (!partId) return;
    setLoading(true); setError(''); setData(null);
    try {
      const r = await fetch(`${API}/api/three-way/compare/${partId}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedPart) loadComparison(selectedPart); }, [selectedPart, loadComparison]);

  const sortedRows = data ? [...data.rows].sort((a, b) => {
    let va = 0, vb = 0;
    if (sortCol === 'element') return sortDir === 'asc' ? a.cost_element.localeCompare(b.cost_element) : b.cost_element.localeCompare(a.cost_element);
    if (sortCol === 'sc')    { va = a.sc_value;          vb = b.sc_value; }
    if (sortCol === 'cp')    { va = a.cp_value;          vb = b.cp_value; }
    if (sortCol === 'delta') { va = a.cp_vs_sc.pct;      vb = b.cp_vs_sc.pct; }
    return sortDir === 'asc' ? va - vb : vb - va;
  }) : [];

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const suppliers = data?.supplierQuotes ?? [];
  const an = data?.analysis;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1600, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚖</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Three-Way Cost Analysis</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Should-Cost · Current Live Price · New Supplier Quotes — side by side</p>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', padding: '16px 20px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
        <div style={{ flex: '1 1 180px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Vehicle Program</label>
          <select value={selectedProgram} onChange={e => { setSelectedProgram(e.target.value); setSelectedPart(''); setData(null); }}
            style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)', fontSize: 13 }}>
            <option value="">All Programs</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Search Part</label>
          <input value={searchPart} onChange={e => setSearchPart(e.target.value)} placeholder="Part number or description…"
            style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: '2 1 300px' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Select Part</label>
          <select value={selectedPart} onChange={e => setSelectedPart(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)', fontSize: 13 }}>
            <option value="">— choose a part —</option>
            {parts.map(p => (
              <option key={p.id} value={p.id}>
                {p.part_number} – {p.description}{!p.has_sc ? ' ⚠SC' : ''}{!p.has_cp ? ' ⚠CP' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚙</div>
          Building three-way comparison…
        </div>
      )}

      {error && <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}

      {!data && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)', background: 'var(--surface)', borderRadius: 16, border: '2px dashed var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚖</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Select a part to begin the three-way cost analysis</div>
          <div style={{ fontSize: 13 }}>Should-Cost · Current Live Price · New Supplier Quotes will appear side by side</div>
        </div>
      )}

      {data && an && (
        <>
          {/* ── Part Info ── */}
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-1)' }}>{data.part.part_number}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{data.part.description}</div>
            </div>
            {data.part.program && <span className="badge" style={{ background: 'var(--accent)', color: '#fff', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{data.part.program.code}</span>}
            {data.part.system_name && <span style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-alt)', borderRadius: 20, padding: '4px 12px' }}>{data.part.system_name}</span>}
            {data.part.commodity && <span style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-alt)', borderRadius: 20, padding: '4px 12px' }}>{data.part.commodity}</span>}
          </div>

          {/* ── KPI Summary ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 24 }}>
            {[
              {
                label: 'Should Cost', icon: '🏗',
                total: an.totals.sc, sub: data.shouldCost ? `v${data.shouldCost.version} · ${data.shouldCost.currency}` : 'No data',
                color: '#6366f1', delta: null,
              },
              {
                label: 'Current Live Price', icon: '💼',
                total: an.totals.cp,
                sub: data.currentPrice ? `${data.currentPrice.supplier_name} · ${data.currentPrice.effective_date ?? ''}` : 'No data',
                color: an.totals.cp_vs_sc.pct > 15 ? 'var(--danger)' : an.totals.cp_vs_sc.pct > 5 ? 'var(--warn)' : '#10b981',
                delta: an.totals.cp_vs_sc,
              },
              {
                label: 'Best New Quote', icon: '🏆',
                total: an.totals.best_quote,
                sub: an.totals.best_quote > 0 ? `${suppliers.sort((a, b) => a.total_price - b.total_price)[0]?.supplier_name ?? '—'}` : 'No quotes',
                color: an.totals.best_vs_cp.pct < -5 ? '#10b981' : 'var(--text-2)',
                delta: an.totals.best_vs_cp,
              },
              {
                label: 'Opportunity vs Current', icon: '🎯',
                total: Math.abs(an.totals.best_vs_cp.delta),
                sub: an.totals.best_vs_cp.delta < 0 ? 'Potential saving per unit' : 'New quotes above current',
                color: an.totals.best_vs_cp.delta < 0 ? '#10b981' : 'var(--warn)',
                delta: null,
              },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{kpi.icon} {kpi.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: kpi.color, lineHeight: 1.1 }}>
                  ${kpi.total > 0 ? kpi.total.toFixed(2) : '—'}
                </div>
                {kpi.delta && kpi.total > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <DeltaBadge delta={kpi.delta.delta} pct={kpi.delta.pct} />
                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>vs should-cost</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Category Breakdown Bar Chart ── */}
          {an.categoryBreakdown.length > 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Cost Category Breakdown</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={an.categoryBreakdown} margin={{ top: 4, right: 16, bottom: 40, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="sc"         name="Should Cost"     fill="#6366f1" radius={[4,4,0,0]} maxBarSize={28} />
                  <Bar dataKey="cp"         name="Current Price"   fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={28} />
                  <Bar dataKey="best_quote" name="Best New Quote"  fill="#10b981" radius={[4,4,0,0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Detailed Element Table ── */}
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Element-Level Comparison</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {[
                      { key: 'element', label: 'Cost Element' },
                      { key: 'cat',     label: 'Category', noSort: true },
                      { key: 'sc',      label: '🏗 Should Cost' },
                      { key: 'cp',      label: '💼 Current Price' },
                      { key: 'delta',   label: 'Δ CP vs SC' },
                      ...suppliers.map(s => ({ key: s.supplier_name, label: `📋 ${s.supplier_name}`, noSort: true })),
                      { key: 'best',    label: '🏆 Best Quote', noSort: true },
                    ].map(col => (
                      <th key={col.key}
                        onClick={() => !col.noSort && toggleSort(col.key as typeof sortCol)}
                        style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, cursor: col.noSort ? 'default' : 'pointer', background: 'var(--bg-alt)', whiteSpace: 'nowrap' }}
                      >
                        {col.key === 'element' || col.key === 'cat' ? <span style={{ textAlign: 'left', display: 'block' }}>{col.label}</span> : col.label}
                        {!col.noSort && sortCol === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, idx) => {
                    const cpPct  = row.cp_vs_sc.pct;
                    const rowBg  = idx % 2 === 0 ? 'transparent' : 'var(--bg-alt)';
                    const catColor = CATEGORY_COLORS[row.category] ?? 'var(--text-3)';
                    return (
                      <tr key={row.cost_element} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{row.cost_element}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: catColor, background: catColor + '20', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            {row.category_label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-1)' }}>
                          {row.sc_value > 0 ? `$${row.sc_value.toFixed(2)}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: cpPct > 15 ? 'var(--danger)' : cpPct > 5 ? 'var(--warn)' : 'var(--text-1)' }}>
                          {row.cp_value > 0 ? `$${row.cp_value.toFixed(2)}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {row.cp_value > 0 && row.sc_value > 0
                            ? <DeltaBadge delta={row.cp_vs_sc.delta} pct={row.cp_vs_sc.pct} />
                            : <span style={{ color: 'var(--text-3)' }}>—</span>
                          }
                        </td>
                        {suppliers.map(s => {
                          const q = row.quotes.find(q => q.supplier_name === s.supplier_name);
                          const isBest = q && row.best_supplier === s.supplier_name;
                          return (
                            <td key={s.supplier_name} style={{ padding: '10px 12px', textAlign: 'right' }}>
                              {q ? (
                                <div>
                                  <span style={{ fontWeight: isBest ? 800 : 500, color: isBest ? '#10b981' : 'var(--text-1)' }}>
                                    {isBest ? '★ ' : ''}${q.value.toFixed(2)}
                                  </span>
                                  <div><DeltaBadge delta={q.vs_cp.delta} pct={q.vs_cp.pct} /></div>
                                </div>
                              ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </td>
                          );
                        })}
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {row.best_quote_value > 0 ? (
                            <div>
                              <span style={{ fontWeight: 700, color: '#10b981' }}>${row.best_quote_value.toFixed(2)}</span>
                              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{row.best_supplier}</div>
                            </div>
                          ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Totals row */}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 800, background: 'var(--bg-alt)' }}>
                    <td colSpan={2} style={{ padding: '12px 12px', color: 'var(--text-1)' }}>TOTAL</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: '#6366f1' }}>${an.totals.sc.toFixed(2)}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: an.totals.cp_vs_sc.pct > 10 ? 'var(--danger)' : 'var(--text-1)' }}>${an.totals.cp.toFixed(2)}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                      <DeltaBadge delta={an.totals.cp_vs_sc.delta} pct={an.totals.cp_vs_sc.pct} />
                    </td>
                    {suppliers.map(s => (
                      <td key={s.supplier_name} style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-1)' }}>
                        ${s.total_price.toFixed(2)}
                      </td>
                    ))}
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: '#10b981' }}>
                      {an.totals.best_quote > 0 ? `$${an.totals.best_quote.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── AI Cost Driver Analysis ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>AI Cost Driver Analysis</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>

              {/* Top Cost Drivers */}
              <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>📊</span> Top Cost Drivers
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(by should-cost value)</span>
                </div>
                {an.topCostDrivers.map((d, i) => (
                  <div key={d.cost_element} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{i + 1}. {d.cost_element}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>${d.sc_value.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, d.pct_of_total)}%`, background: '#6366f1', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 36, textAlign: 'right' }}>{d.pct_of_total}%</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{d.category}</div>
                  </div>
                ))}
              </div>

              {/* Biggest Overpayments */}
              <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⚠</span> Biggest Overpayments
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(current vs should-cost)</span>
                </div>
                {an.biggestOverpayments.length === 0 && (
                  <div style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ No significant overpayments detected</div>
                )}
                {an.biggestOverpayments.map(d => (
                  <div key={d.cost_element} style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--danger-bg)', borderRadius: 8, borderLeft: '3px solid var(--danger)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{d.cost_element}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--danger)' }}>+${d.delta.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.category} · +{d.pct}% above should-cost</div>
                  </div>
                ))}
              </div>

              {/* Savings Opportunities */}
              <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💰</span> Savings Opportunities
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(best quote vs current)</span>
                </div>
                {an.savingsOpportunities.length === 0 && (
                  <div style={{ color: 'var(--text-3)', fontSize: 13 }}>No quotes cheaper than current price yet.</div>
                )}
                {an.savingsOpportunities.map(d => (
                  <div key={d.cost_element} style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--success-bg)', borderRadius: 8, borderLeft: '3px solid var(--success)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>{d.cost_element}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--success)' }}>-${d.savings.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.best_supplier} · -{d.savings_pct}% vs current</div>
                  </div>
                ))}
              </div>

              {/* Risk Flags */}
              {an.riskFlags.length > 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🚩</span> Risk Flags
                  </div>
                  {an.riskFlags.map((f, i) => (
                    <div key={i} style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <SeverityDot severity={f.severity} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{f.element}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recommendations */}
            {an.recommendations.length > 0 && (
              <div style={{ marginTop: 16, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>💡</span> AI Recommendations
                </div>
                {an.recommendations.map((rec, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, marginTop: 1 }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{rec}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
