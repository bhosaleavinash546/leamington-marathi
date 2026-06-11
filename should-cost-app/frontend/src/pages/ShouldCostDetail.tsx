import { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../utils/api';

/* ── Types ──────────────────────────────────────────────────── */
interface Subitem { id: number; name: string; value: number; basis?: string }
interface Breakdown {
  id: number;
  cost_element: string;
  category: string;
  value: number;
  basis?: string;
  sort_order: number;
  subitems: Subitem[];
}
interface Header {
  id: number;
  part_number: string;
  part_description?: string;
  currency?: string;
  total_cost?: number;
  annual_volume?: number;
  status?: string;
  version?: number;
}
interface AuditEntry {
  id: number; change_type: string; changed_at: string;
  changed_by_name?: string; old_status?: string; new_status?: string;
  old_total_cost?: number; new_total_cost?: number; notes?: string;
}
interface AiBreakdownItem {
  cost_element: string; category: string; value: number; basis?: string; notes?: string;
}
interface ScDetail { header: Header; breakdown: Breakdown[]; auditTrail?: AuditEntry[] }

/* ── Category metadata (Level 1) ────────────────────────────── */
const CAT_META: Record<string, { label: string; color: string }> = {
  RAW_MATERIAL:  { label: 'Raw Material',          color: '#1d4ed8' },
  BOP:           { label: 'Bought-Out Parts',      color: '#7c3aed' },
  MANUFACTURING: { label: 'Manufacturing / Process', color: '#0891b2' },
  OVERHEAD:      { label: 'Overhead',              color: '#b45309' },
  LOGISTICS:     { label: 'Logistics',             color: '#0369a1' },
  TOOLING:       { label: 'Tooling',               color: '#9333ea' },
  PROFIT:        { label: 'Profit',                color: '#047857' },
};
const CAT_ORDER = ['RAW_MATERIAL', 'BOP', 'MANUFACTURING', 'OVERHEAD', 'LOGISTICS', 'TOOLING', 'PROFIT'];

export default function ShouldCostDetail() {
  const [headers, setHeaders]   = useState<Header[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail]     = useState<ScDetail | null>(null);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openEls, setOpenEls]   = useState<Set<number>>(new Set());
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [showAudit, setShowAudit]         = useState(false);
  const [aiBuilding, setAiBuilding]       = useState(false);
  const [aiProposal, setAiProposal]       = useState<{ total_cost: number; currency?: string; basis: string; breakdown: AiBreakdownItem[] } | null>(null);
  const [aiForm, setAiForm] = useState({ partDescription: '', commodity: 'Stamped Steel', annualVolume: '10000', currency: 'GBP', processNotes: '' });

  // Load the list of published should-cost models
  useEffect(() => {
    api.get<Header[]>('/should-cost', { params: { status: 'published' } })
      .then((r) => {
        setHeaders(r.data);
        if (r.data.length) setSelected(r.data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Load the selected breakdown
  useEffect(() => {
    if (selected == null) { setDetail(null); return; }
    setLoadingDetail(true);
    api.get<ScDetail>(`/should-cost/${selected}`)
      .then((r) => {
        setDetail(r.data);
        // Open all categories by default so the breakup is visible immediately
        setOpenCats(new Set(r.data.breakdown.map((b) => b.category)));
        setOpenEls(new Set());
      })
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  const toggleCat = useCallback((c: string) => {
    setOpenCats((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  }, []);
  const toggleEl = useCallback((id: number) => {
    setOpenEls((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const filteredHeaders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return headers;
    return headers.filter((h) =>
      h.part_number.toLowerCase().includes(q) ||
      (h.part_description ?? '').toLowerCase().includes(q));
  }, [headers, search]);

  // Group the breakdown by category (Level 1)
  const groups = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, Breakdown[]>();
    for (const b of detail.breakdown) {
      if (!map.has(b.category)) map.set(b.category, []);
      map.get(b.category)!.push(b);
    }
    const ordered = [...map.keys()].sort((a, b) => {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return ordered.map((cat) => {
      const rows = map.get(cat)!;
      const total = rows.reduce((s, r) => s + Number(r.value), 0);
      return { cat, rows, total };
    });
  }, [detail]);

  const grandTotal = useMemo(
    () => groups.reduce((s, g) => s + g.total, 0),
    [groups]
  );

  const cur = detail?.header.currency ?? 'GBP';
  const fmt = (n: number) => `${cur} ${Number(n).toFixed(2)}`;
  const pct = (n: number) => grandTotal ? `${((n / grandTotal) * 100).toFixed(1)}%` : '—';

  const expandAll = () => {
    if (!detail) return;
    setOpenCats(new Set(detail.breakdown.map((b) => b.category)));
    setOpenEls(new Set(detail.breakdown.filter((b) => b.subitems.length).map((b) => b.id)));
  };
  const collapseAll = () => { setOpenCats(new Set()); setOpenEls(new Set()); };

  if (loading) return <div className="loading">Loading should-cost models…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Should-Cost Breakup</h1>
          <div className="sub">
            Three-level cost structure — category → element → cost driver. Expand any row to drill down.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Part picker ── */}
        <div className="card" style={{ position: 'sticky', top: 70 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search part…"
            style={{ width: '100%', marginBottom: 12 }}
          />
          <div style={{ maxHeight: '64vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredHeaders.map((h) => {
              const active = h.id === selected;
              return (
                <button
                  key={h.id}
                  onClick={() => setSelected(h.id)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-glow)' : 'var(--bg)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{h.part_number}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{h.part_description}</div>
                </button>
              );
            })}
            {filteredHeaders.length === 0 && (
              <div className="empty" style={{ fontSize: 13 }}>No matching parts.</div>
            )}
          </div>
        </div>

        {/* ── Breakdown ── */}
        <div>
          {/* AI Builder panel */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>🤖 AI Should-Cost Builder</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAiBuilder((v) => !v)}>
                {showAiBuilder ? 'Hide' : 'Build with AI'}
              </button>
            </div>
            {showAiBuilder && (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Part Description *</label>
                  <input className="form-control" value={aiForm.partDescription} onChange={(e) => setAiForm({ ...aiForm, partDescription: e.target.value })} placeholder="e.g. Front brake disc, grey cast iron" />
                </div>
                <div>
                  <label className="form-label">Commodity</label>
                  <input className="form-control" value={aiForm.commodity} onChange={(e) => setAiForm({ ...aiForm, commodity: e.target.value })} placeholder="e.g. Stamped Steel, Cast Iron…" />
                </div>
                <div>
                  <label className="form-label">Annual Volume (units)</label>
                  <input className="form-control" type="number" value={aiForm.annualVolume} onChange={(e) => setAiForm({ ...aiForm, annualVolume: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select className="form-control" value={aiForm.currency} onChange={(e) => setAiForm({ ...aiForm, currency: e.target.value })}>
                    {['GBP','EUR','USD'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Process Notes (optional)</label>
                  <input className="form-control" value={aiForm.processNotes} onChange={(e) => setAiForm({ ...aiForm, processNotes: e.target.value })} placeholder="e.g. high-volume stamping, robotised welding" />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={aiBuilding || !aiForm.partDescription} onClick={async () => {
                    setAiBuilding(true); setAiProposal(null);
                    try {
                      const r = await api.post('/ai/build-should-cost', {
                        partDescription: aiForm.partDescription,
                        commodity: aiForm.commodity,
                        annualVolume: parseInt(aiForm.annualVolume),
                        currency: aiForm.currency,
                        processNotes: aiForm.processNotes || undefined,
                      });
                      setAiProposal(r.data as { total_cost: number; currency?: string; basis: string; breakdown: AiBreakdownItem[] });
                    } finally { setAiBuilding(false); }
                  }}>
                    {aiBuilding ? 'Claude is thinking…' : '✨ Generate Breakdown'}
                  </button>
                  {aiProposal && <button className="btn btn-secondary" onClick={() => setAiProposal(null)}>Clear</button>}
                </div>
                {aiProposal && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-2)' }}>
                      <strong>Total:</strong> {aiProposal.currency ?? aiForm.currency} {Number(aiProposal.total_cost).toFixed(2)} — {aiProposal.basis}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          <th style={{ padding: '7px 10px', textAlign: 'left' }}>Element</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left' }}>Category</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right' }}>Value</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right' }}>%</th>
                          <th style={{ padding: '7px 10px', textAlign: 'left' }}>Basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiProposal.breakdown.map((b, i) => {
                          const pctVal = aiProposal.total_cost ? ((b.value / aiProposal.total_cost) * 100).toFixed(1) : '—';
                          return (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 600 }}>{b.cost_element}</td>
                              <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-3)' }}>{b.category}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{Number(b.value).toFixed(2)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-3)' }}>{pctVal}%</td>
                              <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-3)' }}>{b.basis}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                      This is an AI-generated estimate. Review and adjust before saving as a formal should-cost.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {loadingDetail || !detail ? (
            <div className="card"><div className="loading">Loading breakdown…</div></div>
          ) : (
            <>
              {/* Summary */}
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{detail.header.part_number}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{detail.header.part_description}</div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Should-Cost</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent)' }}>{fmt(grandTotal)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={expandAll}>Expand all</button>
                    <button className="btn btn-secondary btn-sm" onClick={collapseAll}>Collapse</button>
                  </div>
                </div>
              </div>

              {/* 3-level table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px', fontSize: 12 }}>Cost Block / Element / Driver</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, textAlign: 'right' }}>Basis</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, textAlign: 'right' }}>Value</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, textAlign: 'right', width: 80 }}>% Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const meta = CAT_META[g.cat] ?? { label: g.cat, color: 'var(--text-2)' };
                      const catOpen = openCats.has(g.cat);
                      return (
                        <CategoryRows
                          key={g.cat}
                          meta={meta}
                          group={g}
                          open={catOpen}
                          openEls={openEls}
                          onToggleCat={() => toggleCat(g.cat)}
                          onToggleEl={toggleEl}
                          fmt={fmt}
                          pct={pct}
                        />
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-2)', background: 'var(--bg)' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 900 }}>Total Should-Cost</td>
                      <td />
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: 'var(--accent)' }}>{fmt(grandTotal)}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700 }}>100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Version History / Audit Trail (P5) */}
              {detail.auditTrail && detail.auditTrail.length > 0 && (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAudit ? 12 : 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>📋 Version History</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAudit((v) => !v)}>
                      {showAudit ? 'Hide' : `Show (${detail.auditTrail!.length})`}
                    </button>
                  </div>
                  {showAudit && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {detail.auditTrail!.map((a) => (
                        <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.change_type === 'published' ? 'var(--success)' : a.change_type === 'archived' ? 'var(--text-3)' : 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{a.change_type.replace('_', ' ')}</div>
                            {(a.old_status || a.new_status) && (
                              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                Status: {a.old_status ?? '—'} → <strong>{a.new_status}</strong>
                              </div>
                            )}
                            {(a.old_total_cost != null || a.new_total_cost != null) && (
                              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                Cost: {a.old_total_cost ? `${cur} ${Number(a.old_total_cost).toFixed(2)}` : '—'} → <strong>{cur} {Number(a.new_total_cost).toFixed(2)}</strong>
                              </div>
                            )}
                            {a.notes && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{a.notes}</div>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                            {a.changed_by_name ?? 'System'}<br />
                            {new Date(a.changed_at).toLocaleDateString('en-GB')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Category block (Level 1) + its elements (L2) + subitems (L3) ── */
function CategoryRows({
  meta, group, open, openEls, onToggleCat, onToggleEl, fmt, pct,
}: {
  meta: { label: string; color: string };
  group: { cat: string; rows: Breakdown[]; total: number };
  open: boolean;
  openEls: Set<number>;
  onToggleCat: () => void;
  onToggleEl: (id: number) => void;
  fmt: (n: number) => string;
  pct: (n: number) => string;
}) {
  return (
    <>
      {/* Level 1 — category */}
      <tr
        onClick={onToggleCat}
        style={{ cursor: 'pointer', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
      >
        <td style={{ padding: '12px 16px', fontWeight: 800 }}>
          <span style={{ display: 'inline-block', width: 16, color: meta.color }}>{open ? '▾' : '▸'}</span>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: meta.color, marginRight: 8 }} />
          {meta.label}
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginLeft: 8 }}>
            ({group.rows.length})
          </span>
        </td>
        <td />
        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: meta.color }}>{fmt(group.total)}</td>
        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{pct(group.total)}</td>
      </tr>

      {/* Level 2 — elements */}
      {open && group.rows.map((el) => {
        const hasSubs = el.subitems.length > 0;
        const elOpen = openEls.has(el.id);
        return (
          <FragmentRows key={el.id}>
            <tr
              onClick={() => hasSubs && onToggleEl(el.id)}
              style={{ cursor: hasSubs ? 'pointer' : 'default', borderTop: '1px solid var(--border)' }}
            >
              <td style={{ padding: '9px 16px 9px 38px', fontSize: 13 }}>
                <span style={{ display: 'inline-block', width: 16, color: 'var(--text-3)' }}>
                  {hasSubs ? (elOpen ? '▾' : '▸') : ''}
                </span>
                {el.cost_element}
              </td>
              <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 11, color: 'var(--text-3)' }}>{el.basis ?? '—'}</td>
              <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600 }}>{fmt(Number(el.value))}</td>
              <td style={{ padding: '9px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-3)' }}>{pct(Number(el.value))}</td>
            </tr>

            {/* Level 3 — cost drivers */}
            {hasSubs && elOpen && el.subitems.map((s) => (
              <tr key={s.id} style={{ background: 'var(--bg)' }}>
                <td style={{ padding: '7px 16px 7px 64px', fontSize: 12, color: 'var(--text-2)' }}>
                  <span style={{ color: 'var(--text-3)', marginRight: 8 }}>•</span>{s.name}
                </td>
                <td style={{ padding: '7px 16px', textAlign: 'right', fontSize: 11, color: 'var(--text-3)' }}>{s.basis ?? '—'}</td>
                <td style={{ padding: '7px 16px', textAlign: 'right', fontSize: 12 }}>{fmt(Number(s.value))}</td>
                <td style={{ padding: '7px 16px', textAlign: 'right', fontSize: 11, color: 'var(--text-3)' }}>{pct(Number(s.value))}</td>
              </tr>
            ))}
          </FragmentRows>
        );
      })}
    </>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
