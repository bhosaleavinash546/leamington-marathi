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
interface BriefDetail {
  cost_element: string; sc: number; cp: number; gap: number; gap_pct: number;
  best_quote: number | null; annual_impact: number | null; talking_point: string;
}
interface BriefTopic {
  category: string; label: string; sc: number; cp: number; best_quote: number | null;
  gap: number; gap_pct: number; annual_impact: number | null;
  priority: 'high' | 'medium' | 'low'; action: string; detail_points: BriefDetail[];
}
interface NegotiationSummary {
  annual_volume: number; total_gap_per_unit: number;
  total_annual_opportunity: number | null; headline: string;
}
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
    negotiationBrief: BriefTopic[];
    negotiationSummary: NegotiationSummary;
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
  RAW_MATERIAL: '#2563eb', BOP: '#f59e0b', MANUFACTURING: '#10b981',
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
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [exporting, setExporting]   = useState<'xlsx' | 'pptx' | null>(null);

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

  const exportFile = useCallback(async (fmt: 'xlsx' | 'pptx') => {
    if (!selectedPart) return;
    setExporting(fmt);
    try {
      const r = await fetch(`${API}/api/export/three-way/${selectedPart}.${fmt}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `three-way-${data?.part.part_number ?? selectedPart}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + String(e));
    } finally {
      setExporting(null);
    }
  }, [selectedPart, data]);

  const suppliers = data?.supplierQuotes ?? [];
  const an = data?.analysis;

  // Currency symbol from the should-cost header (GBP demo data → £)
  const sym = ({ GBP: '£', USD: '$', EUR: '€', INR: '₹' } as Record<string, string>)[
    data?.shouldCost?.currency?.trim() ?? 'GBP'
  ] ?? '£';

  // ── Two-level grouping: Level 1 = summary category, Level 2 = detail elements ──
  const CAT_ORDER = ['RAW_MATERIAL', 'BOP', 'MANUFACTURING', 'OVERHEAD', 'LOGISTICS', 'TOOLING', 'PROFIT', 'UNCATEGORIZED'];
  const groupedRows = data
    ? CAT_ORDER
        .map(cat => {
          const elements = data.rows.filter(r => r.category === cat);
          if (elements.length === 0) return null;
          const sum = (fn: (r: CompRow) => number) => elements.reduce((s, r) => s + fn(r), 0);
          const scSum = sum(r => r.sc_value);
          const cpSum = sum(r => r.cp_value);
          const supplierSums = suppliers.map(s => ({
            name: s.supplier_name,
            total: sum(r => r.quotes.find(q => q.supplier_name === s.supplier_name)?.value ?? 0),
          }));
          const bestSum = sum(r => r.best_quote_value);
          return {
            category: cat,
            label: elements[0].category_label,
            elements,
            sc: scSum, cp: cpSum,
            delta: cpSum - scSum,
            pct: scSum > 0 ? ((cpSum - scSum) / scSum) * 100 : 0,
            supplierSums, best: bestSum,
          };
        })
        .filter((g): g is NonNullable<typeof g> => g !== null)
    : [];

  const toggleCat = (cat: string) =>
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  const allExpanded = groupedRows.length > 0 && groupedRows.every(g => expandedCats.has(g.category));
  const toggleAll = () =>
    setExpandedCats(allExpanded ? new Set() : new Set(groupedRows.map(g => g.category)));

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1600, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚖</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Three-Way Cost Analysis</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>Should-Cost · Current Live Price · New Supplier Quotes — side by side</p>
          </div>
        </div>

        {/* ── Export buttons (only shown once a part is loaded) ── */}
        {data && (
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => exportFile('xlsx')}
              disabled={exporting !== null}
              title="Export full four-sheet Excel workbook (Summary, Cost Breakup, AI Brief, Insights)"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1.5px solid #217346', background: exporting === 'xlsx' ? '#d1fae5' : '#fff', color: '#217346', fontWeight: 700, fontSize: 13, cursor: exporting ? 'wait' : 'pointer', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 16 }}>📊</span>
              {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
            </button>
            <button
              onClick={() => exportFile('pptx')}
              disabled={exporting !== null}
              title="Export executive PowerPoint deck (Title, KPIs, Breakup, AI Brief per category, Recommendations)"
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: '1.5px solid #C43E1C', background: exporting === 'pptx' ? '#fee2e2' : '#fff', color: '#C43E1C', fontWeight: 700, fontSize: 13, cursor: exporting ? 'wait' : 'pointer', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 16 }}>📑</span>
              {exporting === 'pptx' ? 'Exporting…' : 'Export PowerPoint'}
            </button>
          </div>
        )}
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
                color: '#2563eb', delta: null,
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
                  {kpi.total > 0 ? `${sym}${kpi.total.toFixed(2)}` : '—'}
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
                    formatter={(value: number, name: string) => [`${sym}${value.toFixed(2)}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="sc"         name="Should Cost"     fill="#2563eb" radius={[4,4,0,0]} maxBarSize={28} />
                  <Bar dataKey="cp"         name="Current Price"   fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={28} />
                  <Bar dataKey="best_quote" name="Best New Quote"  fill="#10b981" radius={[4,4,0,0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Two-Level Cost Breakup: Summary → Detail ── */}
          <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Cost Breakup — Summary &amp; Detail</h3>
              <button onClick={toggleAll}
                style={{ background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {allExpanded ? '⊟ Collapse all' : '⊞ Expand all detail'}
              </button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-3)' }}>
              Level 1 — summary cost blocks. Click any row (or “Expand all”) to drill into the Level 2 element detail behind it.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {[
                      { key: 'element', label: 'Cost Block / Element', left: true },
                      { key: 'sc',      label: '🏗 Should Cost' },
                      { key: 'cp',      label: '💼 Current Price' },
                      { key: 'delta',   label: 'Δ CP vs SC' },
                      ...suppliers.map(s => ({ key: s.supplier_name, label: `📋 ${s.supplier_name}`, left: false })),
                      { key: 'best',    label: '🏆 Best Quote' },
                    ].map(col => (
                      <th key={col.key}
                        style={{ padding: '10px 12px', textAlign: ('left' in col && col.left) ? 'left' : 'right', fontWeight: 700, color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, background: 'var(--bg-alt)', whiteSpace: 'nowrap' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map(group => {
                    const open = expandedCats.has(group.category);
                    const catColor = CATEGORY_COLORS[group.category] ?? 'var(--text-3)';
                    return (
                      <>{/* Level 1 — summary row */}
                        <tr key={group.category}
                          onClick={() => toggleCat(group.category)}
                          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-alt)', cursor: 'pointer' }}>
                          <td style={{ padding: '12px', fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-block', width: 18, color: 'var(--accent)', fontWeight: 900 }}>{open ? '▾' : '▸'}</span>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: catColor, marginRight: 8, verticalAlign: 'baseline' }} />
                            {group.label}
                            <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginLeft: 8 }}>{group.elements.length} lines</span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-1)' }}>{sym}{group.sc.toFixed(2)}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: group.pct > 15 ? 'var(--danger)' : group.pct > 5 ? 'var(--warn)' : 'var(--text-1)' }}>{sym}{group.cp.toFixed(2)}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {group.sc > 0 && group.cp > 0
                              ? <DeltaBadge delta={group.delta} pct={group.pct} />
                              : <span style={{ color: 'var(--text-3)' }}>—</span>}
                          </td>
                          {group.supplierSums.map(ss => (
                            <td key={ss.name} style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-1)' }}>{sym}{ss.total.toFixed(2)}</td>
                          ))}
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{group.best > 0 ? `${sym}${group.best.toFixed(2)}` : '—'}</td>
                        </tr>

                        {/* Level 2 — detail element rows */}
                        {open && group.elements.map(row => {
                          const cpPct = row.cp_vs_sc.pct;
                          return (
                            <tr key={`${group.category}-${row.cost_element}`} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '9px 12px 9px 44px', fontWeight: 500, color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: 12.5 }}>
                                {row.cost_element}
                              </td>
                              <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-1)' }}>
                                {row.sc_value > 0 ? `${sym}${row.sc_value.toFixed(2)}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                              </td>
                              <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: cpPct > 15 ? 'var(--danger)' : cpPct > 5 ? 'var(--warn)' : 'var(--text-1)' }}>
                                {row.cp_value > 0 ? `${sym}${row.cp_value.toFixed(2)}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                              </td>
                              <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                                {row.cp_value > 0 && row.sc_value > 0
                                  ? <DeltaBadge delta={row.cp_vs_sc.delta} pct={row.cp_vs_sc.pct} />
                                  : <span style={{ color: 'var(--text-3)' }}>—</span>}
                              </td>
                              {suppliers.map(s => {
                                const q = row.quotes.find(q => q.supplier_name === s.supplier_name);
                                const isBest = q && row.best_supplier === s.supplier_name;
                                return (
                                  <td key={s.supplier_name} style={{ padding: '9px 12px', textAlign: 'right' }}>
                                    {q ? (
                                      <div>
                                        <span style={{ fontWeight: isBest ? 800 : 500, color: isBest ? '#10b981' : 'var(--text-1)' }}>
                                          {isBest ? '★ ' : ''}{sym}{q.value.toFixed(2)}
                                        </span>
                                        <div><DeltaBadge delta={q.vs_cp.delta} pct={q.vs_cp.pct} /></div>
                                      </div>
                                    ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                                  </td>
                                );
                              })}
                              <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                                {row.best_quote_value > 0 ? (
                                  <div>
                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{sym}{row.best_quote_value.toFixed(2)}</span>
                                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{row.best_supplier}</div>
                                  </div>
                                ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}

                  {/* Totals row */}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 800, background: 'var(--bg-alt)' }}>
                    <td style={{ padding: '12px 12px', color: 'var(--text-1)' }}>TOTAL / UNIT</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--accent)' }}>{sym}{an.totals.sc.toFixed(2)}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: an.totals.cp_vs_sc.pct > 10 ? 'var(--danger)' : 'var(--text-1)' }}>{sym}{an.totals.cp.toFixed(2)}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                      <DeltaBadge delta={an.totals.cp_vs_sc.delta} pct={an.totals.cp_vs_sc.pct} />
                    </td>
                    {suppliers.map(s => (
                      <td key={s.supplier_name} style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-1)' }}>
                        {sym}{s.total_price.toFixed(2)}
                      </td>
                    ))}
                    <td style={{ padding: '12px 12px', textAlign: 'right', color: '#10b981' }}>
                      {an.totals.best_quote > 0 ? `${sym}${an.totals.best_quote.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── AI Negotiation Brief ── */}
          {an.negotiationBrief && an.negotiationBrief.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤝</div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>AI Negotiation Brief</h2>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>summary-level gap → element-level talking points</span>
              </div>

              {/* Headline banner */}
              <div style={{ background: 'linear-gradient(135deg,var(--accent),#7c3aed)', borderRadius: 14, padding: '18px 22px', marginBottom: 16, color: '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Total negotiation opportunity</div>
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.3 }}>{an.negotiationSummary.headline}</div>
              </div>

              {/* Topic cards by category gap, biggest first */}
              <div style={{ display: 'grid', gap: 14 }}>
                {an.negotiationBrief.map((topic, ti) => (
                  <div key={topic.category} style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', borderLeft: `4px solid ${topic.priority === 'high' ? 'var(--danger)' : topic.priority === 'medium' ? 'var(--warn)' : 'var(--success)'}`, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-1)' }}>{ti + 1}. {topic.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, borderRadius: 20, padding: '3px 10px', background: topic.priority === 'high' ? 'var(--danger-bg)' : topic.priority === 'medium' ? 'rgba(245,158,11,0.12)' : 'var(--success-bg)', color: topic.priority === 'high' ? 'var(--danger)' : topic.priority === 'medium' ? 'var(--warn)' : 'var(--success)' }}>
                        {topic.priority} priority
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: 'var(--danger)' }}>
                        +{sym}{topic.gap.toFixed(2)}/unit ({topic.gap_pct > 0 ? '+' : ''}{topic.gap_pct.toFixed(0)}%)
                      </span>
                      {topic.annual_impact !== null && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', background: 'var(--bg-alt)', borderRadius: 20, padding: '3px 12px' }}>
                          ≈ {sym}{topic.annual_impact.toLocaleString('en-GB')}/yr
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: topic.detail_points.length > 0 ? 12 : 0 }}>
                      <strong style={{ color: 'var(--text-1)' }}>Action:</strong> {topic.action}
                    </div>
                    {topic.detail_points.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {topic.detail_points.map(dp => (
                          <div key={dp.cost_element} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--bg-alt)', borderRadius: 8, padding: '8px 12px' }}>
                            <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: 12, marginTop: 1 }}>→</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.5 }}>{dp.talking_point}</div>
                              {dp.annual_impact !== null && dp.annual_impact > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                                  Annual impact if closed: <strong style={{ color: 'var(--danger)' }}>{sym}{dp.annual_impact.toLocaleString('en-GB')}</strong>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI Cost Driver Analysis ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
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
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{sym}{d.sc_value.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, d.pct_of_total)}%`, background: '#2563eb', borderRadius: 4 }} />
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
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--danger)' }}>+{sym}{d.delta.toFixed(2)}</span>
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
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--success)' }}>-{sym}{d.savings.toFixed(2)}</span>
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
                    <div style={{ minWidth: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, marginTop: 1 }}>
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
