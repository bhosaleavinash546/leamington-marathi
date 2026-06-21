import { useEffect, useMemo, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
  /* Process parameters */
  part_weight_kg?: number;
  material_code?: string;
  manufacturing_country?: string;
  machine_type?: string;
  cycle_time_sec?: number;
  labour_rate_hr?: number;
  machine_rate_hr?: number;
  scrap_rate_pct?: number;
  tooling_cost_total?: number;
  tooling_life_units?: number;
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

interface CommodityTemplate {
  id: number;
  commodity_name: string;
  description?: string;
  elements: Array<{
    cost_element: string;
    category: string;
    typical_pct_min: number;
    typical_pct_max: number;
    basis: string;
  }>;
}

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

/* ── Process Parameters form default ── */
interface ProcessParamsForm {
  part_weight_kg: string;
  material_code: string;
  manufacturing_country: string;
  machine_type: string;
  cycle_time_sec: string;
  labour_rate_hr: string;
  machine_rate_hr: string;
  scrap_rate_pct: string;
  tooling_cost_total: string;
  tooling_life_units: string;
}

function headerToParamsForm(h: Header): ProcessParamsForm {
  return {
    part_weight_kg:        h.part_weight_kg        != null ? String(h.part_weight_kg)        : '',
    material_code:         h.material_code         ?? '',
    manufacturing_country: h.manufacturing_country ?? '',
    machine_type:          h.machine_type          ?? '',
    cycle_time_sec:        h.cycle_time_sec        != null ? String(h.cycle_time_sec)        : '',
    labour_rate_hr:        h.labour_rate_hr        != null ? String(h.labour_rate_hr)        : '',
    machine_rate_hr:       h.machine_rate_hr       != null ? String(h.machine_rate_hr)       : '',
    scrap_rate_pct:        h.scrap_rate_pct        != null ? String(h.scrap_rate_pct)        : '',
    tooling_cost_total:    h.tooling_cost_total    != null ? String(h.tooling_cost_total)    : '',
    tooling_life_units:    h.tooling_life_units    != null ? String(h.tooling_life_units)    : '',
  };
}

export default function ShouldCostDetail() {
  const [headers, setHeaders]   = useState<Header[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail]     = useState<ScDetail | null>(null);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openEls, setOpenEls]   = useState<Set<number>>(new Set());
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [showAudit, setShowAudit]         = useState(false);
  const [aiBuilding, setAiBuilding]       = useState(false);
  const [aiProposal, setAiProposal]       = useState<{ total_cost: number; currency?: string; basis: string; breakdown: AiBreakdownItem[] } | null>(null);
  const [aiForm, setAiForm] = useState({ partDescription: '', commodity: 'Stamped Steel', annualVolume: '10000', currency: 'GBP', processNotes: '' });

  /* ── Process Parameters state ── */
  const [showProcessParams, setShowProcessParams] = useState(true);
  const [editingParams, setEditingParams]         = useState(false);
  const [paramsForm, setParamsForm]               = useState<ProcessParamsForm>(headerToParamsForm({}  as Header));
  const [savingParams, setSavingParams]           = useState(false);
  const [paramsSaveError, setParamsSaveError]     = useState<string | null>(null);

  /* ── Sensitivity Analysis state ── */
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [sensitivitySlider, setSensitivitySlider] = useState(0);

  /* ── Commodity template state ── */
  const [showTemplateModal, setShowTemplateModal]         = useState(false);
  const [templates, setTemplates]                         = useState<CommodityTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates]           = useState(false);
  const [templatesFetched, setTemplatesFetched]           = useState(false);
  const [templatesError, setTemplatesError]               = useState<string | null>(null);
  const [loadedTemplate, setLoadedTemplate]               = useState<CommodityTemplate | null>(null);

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
    setDetailError(null);
    api.get<ScDetail>(`/should-cost/${selected}`)
      .then((r) => {
        setDetail(r.data);
        setParamsForm(headerToParamsForm(r.data.header));
        setEditingParams(false);
        setParamsSaveError(null);
        // Open all categories by default so the breakup is visible immediately
        setOpenCats(new Set(r.data.breakdown.map((b) => b.category)));
        setOpenEls(new Set());
      })
      .catch(() => {
        setDetailError('Failed to load breakdown. Try "Reset CostLens Data" to update the database schema.');
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

  /* ── Sensitivity: revised total ── */
  const sensitivityData = useMemo(() => {
    if (!detail) return null;
    const multiplier = 1 + sensitivitySlider / 100;
    let revisedTotal = 0;
    const catTotals: Record<string, { original: number; revised: number }> = {};
    for (const b of detail.breakdown) {
      const isMaterial =
        b.category.toLowerCase().includes('material') ||
        b.cost_element.toLowerCase().includes('material') ||
        b.category === 'RAW_MATERIAL' ||
        b.category === 'BOP';
      const originalVal = Number(b.value);
      const revisedVal  = isMaterial ? originalVal * multiplier : originalVal;
      revisedTotal += revisedVal;
      const cat = b.category;
      if (!catTotals[cat]) catTotals[cat] = { original: 0, revised: 0 };
      catTotals[cat].original += originalVal;
      catTotals[cat].revised  += revisedVal;
    }
    const chartData = Object.entries(catTotals).map(([cat, vals]) => ({
      name: cat.replace('_', ' '),
      Original: parseFloat(vals.original.toFixed(4)),
      Revised:  parseFloat(vals.revised.toFixed(4)),
    }));
    return { revisedTotal, delta: revisedTotal - grandTotal, chartData };
  }, [detail, sensitivitySlider, grandTotal]);

  const cur = detail?.header.currency ?? 'GBP';
  const fmt = (n: number) => `${cur} ${Number(n).toFixed(2)}`;
  const pct = (n: number) => grandTotal ? `${((n / grandTotal) * 100).toFixed(1)}%` : '—';

  const expandAll = () => {
    if (!detail) return;
    setOpenCats(new Set(detail.breakdown.map((b) => b.category)));
    setOpenEls(new Set(detail.breakdown.filter((b) => b.subitems.length).map((b) => b.id)));
  };
  const collapseAll = () => { setOpenCats(new Set()); setOpenEls(new Set()); };

  /* ── Process params save ── */
  const saveProcessParams = async () => {
    if (!selected) return;
    setSavingParams(true);
    setParamsSaveError(null);
    try {
      const body: Record<string, number | string | null> = {};
      body.part_weight_kg        = paramsForm.part_weight_kg        !== '' ? parseFloat(paramsForm.part_weight_kg)        : null;
      body.material_code         = paramsForm.material_code         !== '' ? paramsForm.material_code                     : null;
      body.manufacturing_country = paramsForm.manufacturing_country !== '' ? paramsForm.manufacturing_country             : null;
      body.machine_type          = paramsForm.machine_type          !== '' ? paramsForm.machine_type                      : null;
      body.cycle_time_sec        = paramsForm.cycle_time_sec        !== '' ? parseFloat(paramsForm.cycle_time_sec)        : null;
      body.labour_rate_hr        = paramsForm.labour_rate_hr        !== '' ? parseFloat(paramsForm.labour_rate_hr)        : null;
      body.machine_rate_hr       = paramsForm.machine_rate_hr       !== '' ? parseFloat(paramsForm.machine_rate_hr)       : null;
      body.scrap_rate_pct        = paramsForm.scrap_rate_pct        !== '' ? parseFloat(paramsForm.scrap_rate_pct)        : null;
      body.tooling_cost_total    = paramsForm.tooling_cost_total    !== '' ? parseFloat(paramsForm.tooling_cost_total)    : null;
      body.tooling_life_units    = paramsForm.tooling_life_units    !== '' ? parseInt(paramsForm.tooling_life_units, 10)  : null;
      await api.patch(`/should-cost/${selected}/process-params`, body);
      // Reload detail
      const r = await api.get<ScDetail>(`/should-cost/${selected}`);
      setDetail(r.data);
      setParamsForm(headerToParamsForm(r.data.header));
      setEditingParams(false);
    } catch {
      setParamsSaveError('Failed to save process parameters. Please try again.');
    } finally {
      setSavingParams(false);
    }
  };

  /* ── Fetch commodity templates on demand ── */
  const openTemplateModal = async () => {
    setShowTemplateModal(true);
    if (templatesFetched) return;
    setLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const r = await api.get<CommodityTemplate[]>('/commodity-templates');
      setTemplates(r.data);
      setTemplatesFetched(true);
    } catch {
      setTemplatesError('Failed to load commodity templates.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const selectTemplate = (t: CommodityTemplate) => {
    setLoadedTemplate(t);
    setAiForm((prev) => ({
      ...prev,
      commodity: t.commodity_name,
      processNotes: t.elements.length
        ? `Typical ranges: ${t.elements.slice(0, 3).map((e) => `${e.cost_element} ${e.typical_pct_min}–${e.typical_pct_max}%`).join(', ')}`
        : prev.processNotes,
    }));
    setShowTemplateModal(false);
    setShowAiBuilder(true);
  };

  /* ── Template benchmark helper ── */
  const templateBenchmarks = useMemo(() => {
    if (!loadedTemplate || !aiProposal) return null;
    return loadedTemplate.elements.map((te) => {
      const match = aiProposal.breakdown.find(
        (b) => b.cost_element.toLowerCase() === te.cost_element.toLowerCase()
      );
      if (!match) return null;
      const actualPct = aiProposal.total_cost ? (match.value / aiProposal.total_cost) * 100 : 0;
      let status: 'ok' | 'high' | 'low' = 'ok';
      if (actualPct < te.typical_pct_min) status = 'low';
      else if (actualPct > te.typical_pct_max) status = 'high';
      return { ...te, actualPct, actualValue: match.value, status };
    }).filter(Boolean) as Array<{
      cost_element: string; category: string;
      typical_pct_min: number; typical_pct_max: number; basis: string;
      actualPct: number; actualValue: number; status: 'ok' | 'high' | 'low';
    }>;
  }, [loadedTemplate, aiProposal]);

  const statusColor = (s: 'ok' | 'high' | 'low') =>
    s === 'ok' ? '#047857' : s === 'high' ? '#b45309' : '#1d4ed8';
  const statusLabel = (s: 'ok' | 'high' | 'low') =>
    s === 'ok' ? 'Within range' : s === 'high' ? 'Above range' : 'Below range';

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
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={openTemplateModal}>
                  📋 Load Template
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAiBuilder((v) => !v)}>
                  {showAiBuilder ? 'Hide' : 'Build with AI'}
                </button>
              </div>
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
                {loadedTemplate && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--accent-glow)', borderRadius: 8, fontSize: 12, color: 'var(--accent)' }}>
                    <span>📋</span>
                    <span>Template loaded: <strong>{loadedTemplate.commodity_name}</strong></span>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
                      onClick={() => setLoadedTemplate(null)}
                    >
                      Clear
                    </button>
                  </div>
                )}
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

                    {/* Template Benchmarks section */}
                    {templateBenchmarks && templateBenchmarks.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                          📊 Template Benchmarks — {loadedTemplate!.commodity_name}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg)' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left' }}>Element</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Actual %</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right' }}>Typical Range</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {templateBenchmarks.map((tb, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{tb.cost_element}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{tb.actualPct.toFixed(1)}%</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-3)' }}>
                                  {tb.typical_pct_min}–{tb.typical_pct_max}%
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 10,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: statusColor(tb.status),
                                  }}>
                                    {statusLabel(tb.status)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {loadingDetail ? (
            <div className="card"><div className="loading">Loading breakdown…</div></div>
          ) : detailError ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Could not load breakdown</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>{detailError}</div>
              <button className="btn btn-primary" onClick={() => { if (selected != null) { setLoadingDetail(true); setDetailError(null); api.get<ScDetail>(`/should-cost/${selected}`).then((r) => { setDetail(r.data); setOpenCats(new Set(r.data.breakdown.map((b) => b.category))); setOpenEls(new Set()); }).catch(() => setDetailError('Failed to load breakdown. Try "Reset CostLens Data" to update the database schema.')).finally(() => setLoadingDetail(false)); } }}>Retry</button>
            </div>
          ) : !detail ? (
            <div className="card"><div className="empty" style={{ padding: 32, textAlign: 'center' }}>Select a part to view its breakdown.</div></div>
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
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={expandAll}>Expand all</button>
                    <button className="btn btn-secondary btn-sm" onClick={collapseAll}>Collapse</button>
                    {!loadingDetail && (
                      <>
                        <a href={`/api/export/should-cost/${selected}.xlsx`} download className="btn btn-secondary btn-sm">⬇ Excel</a>
                        <a href={`/api/export/should-cost/${selected}/report.html`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">🖨 Report</a>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Process Parameters Panel */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>⚙️ Process Parameters</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!editingParams && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setParamsForm(headerToParamsForm(detail.header)); setEditingParams(true); setParamsSaveError(null); }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowProcessParams((v) => !v)}
                    >
                      {showProcessParams ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {showProcessParams && !editingParams && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 20px' }}>
                      <ParamDisplay label="Part Weight (kg)" value={detail.header.part_weight_kg != null ? Number(detail.header.part_weight_kg).toFixed(4) : null} />
                      <ParamDisplay label="Material / Commodity" value={detail.header.material_code ?? null} />
                      <ParamDisplay label="Manufacturing Country" value={detail.header.manufacturing_country ?? null} />
                      <ParamDisplay label="Machine Type" value={detail.header.machine_type ?? null} />
                      <ParamDisplay label="Cycle Time (sec)" value={detail.header.cycle_time_sec != null ? Number(detail.header.cycle_time_sec).toFixed(2) : null} />
                      <ParamDisplay label="Labour Rate (£/hr)" value={detail.header.labour_rate_hr != null ? Number(detail.header.labour_rate_hr).toFixed(2) : null} />
                      <ParamDisplay label="Machine Rate (£/hr)" value={detail.header.machine_rate_hr != null ? Number(detail.header.machine_rate_hr).toFixed(2) : null} />
                      <ParamDisplay label="Scrap Rate (%)" value={detail.header.scrap_rate_pct != null ? Number(detail.header.scrap_rate_pct).toFixed(2) : null} />
                      <ParamDisplay label="Tooling Total Cost" value={detail.header.tooling_cost_total != null ? Number(detail.header.tooling_cost_total).toFixed(2) : null} />
                      <ParamDisplay label="Tooling Life (units)" value={detail.header.tooling_life_units != null ? String(detail.header.tooling_life_units) : null} />
                    </div>
                    {detail.header.tooling_cost_total != null && detail.header.tooling_life_units != null && detail.header.tooling_life_units > 0 && (
                      <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--accent-glow)', borderRadius: 8, display: 'inline-block' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Tooling Amortised / unit: </span>
                        <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 15 }}>
                          {cur} {(Number(detail.header.tooling_cost_total) / Number(detail.header.tooling_life_units)).toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {showProcessParams && editingParams && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 16px' }}>
                      <div>
                        <label className="form-label">Part Weight (kg)</label>
                        <input
                          className="form-control"
                          type="number"
                          step="0.0001"
                          value={paramsForm.part_weight_kg}
                          onChange={(e) => setParamsForm({ ...paramsForm, part_weight_kg: e.target.value })}
                          placeholder="e.g. 1.2500"
                        />
                      </div>
                      <div>
                        <label className="form-label">Material / Commodity</label>
                        <input
                          className="form-control"
                          value={paramsForm.material_code}
                          onChange={(e) => setParamsForm({ ...paramsForm, material_code: e.target.value })}
                          placeholder="e.g. Steel HRC, Aluminium ADC12"
                        />
                      </div>
                      <div>
                        <label className="form-label">Manufacturing Country</label>
                        <input
                          className="form-control"
                          value={paramsForm.manufacturing_country}
                          onChange={(e) => setParamsForm({ ...paramsForm, manufacturing_country: e.target.value })}
                          placeholder="e.g. UK, Germany, China"
                        />
                      </div>
                      <div>
                        <label className="form-label">Machine Type</label>
                        <input
                          className="form-control"
                          value={paramsForm.machine_type}
                          onChange={(e) => setParamsForm({ ...paramsForm, machine_type: e.target.value })}
                          placeholder="e.g. 3-axis CNC, Progressive Die"
                        />
                      </div>
                      <div>
                        <label className="form-label">Cycle Time (sec)</label>
                        <input
                          className="form-control"
                          type="number"
                          step="0.01"
                          value={paramsForm.cycle_time_sec}
                          onChange={(e) => setParamsForm({ ...paramsForm, cycle_time_sec: e.target.value })}
                          placeholder="e.g. 45.00"
                        />
                      </div>
                      <div>
                        <label className="form-label">Labour Rate (£/hr)</label>
                        <input
                          className="form-control"
                          type="number"
                          step="0.01"
                          value={paramsForm.labour_rate_hr}
                          onChange={(e) => setParamsForm({ ...paramsForm, labour_rate_hr: e.target.value })}
                          placeholder="e.g. 22.50"
                        />
                      </div>
                      <div>
                        <label className="form-label">Machine Rate (£/hr)</label>
                        <input
                          className="form-control"
                          type="number"
                          step="0.01"
                          value={paramsForm.machine_rate_hr}
                          onChange={(e) => setParamsForm({ ...paramsForm, machine_rate_hr: e.target.value })}
                          placeholder="e.g. 55.00"
                        />
                      </div>
                      <div>
                        <label className="form-label">Scrap Rate (%)</label>
                        <input
                          className="form-control"
                          type="number"
                          step="0.01"
                          value={paramsForm.scrap_rate_pct}
                          onChange={(e) => setParamsForm({ ...paramsForm, scrap_rate_pct: e.target.value })}
                          placeholder="e.g. 2.50"
                        />
                      </div>
                      <div>
                        <label className="form-label">Tooling Total Cost</label>
                        <input
                          className="form-control"
                          type="number"
                          step="0.01"
                          value={paramsForm.tooling_cost_total}
                          onChange={(e) => setParamsForm({ ...paramsForm, tooling_cost_total: e.target.value })}
                          placeholder="e.g. 120000.00"
                        />
                      </div>
                      <div>
                        <label className="form-label">Tooling Life (units)</label>
                        <input
                          className="form-control"
                          type="number"
                          step="1"
                          value={paramsForm.tooling_life_units}
                          onChange={(e) => setParamsForm({ ...paramsForm, tooling_life_units: e.target.value })}
                          placeholder="e.g. 500000"
                        />
                      </div>
                      {paramsForm.tooling_cost_total !== '' && paramsForm.tooling_life_units !== '' && parseInt(paramsForm.tooling_life_units, 10) > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                          <label className="form-label">Amortised Cost / unit</label>
                          <div style={{ padding: '8px 12px', background: 'var(--accent-glow)', borderRadius: 8, fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>
                            {cur} {(parseFloat(paramsForm.tooling_cost_total) / parseInt(paramsForm.tooling_life_units, 10)).toFixed(4)}
                          </div>
                        </div>
                      )}
                    </div>
                    {paramsSaveError && (
                      <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{paramsSaveError}</div>
                    )}
                    <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary"
                        disabled={savingParams}
                        onClick={saveProcessParams}
                      >
                        {savingParams ? 'Saving…' : 'Save Parameters'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={savingParams}
                        onClick={() => { setEditingParams(false); setParamsSaveError(null); setParamsForm(headerToParamsForm(detail.header)); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sensitivity Analysis Panel */}
              {detail.header.material_code && sensitivityData && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>📊 Sensitivity Analysis</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowSensitivity((v) => !v)}>
                      {showSensitivity ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {showSensitivity && (
                    <div style={{ marginTop: 16 }}>
                      {/* Slider */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            Material Price Change
                          </label>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                            background: sensitivitySlider > 0 ? '#fee2e2' : sensitivitySlider < 0 ? '#dcfce7' : 'var(--bg)',
                            color: sensitivitySlider > 0 ? 'var(--danger)' : sensitivitySlider < 0 ? 'var(--success)' : 'var(--text-3)',
                            border: '1px solid var(--border)',
                          }}>
                            {sensitivitySlider > 0 ? '+' : ''}{sensitivitySlider}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-50}
                          max={50}
                          step={1}
                          value={sensitivitySlider}
                          onChange={(e) => setSensitivitySlider(parseInt(e.target.value, 10))}
                          style={{ width: '100%', accentColor: 'var(--accent)' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
                          <span>-50%</span><span>0%</span><span>+50%</span>
                        </div>
                      </div>

                      {/* 3 stat tiles */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Original Total</div>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{fmt(grandTotal)}</div>
                        </div>
                        <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Delta</div>
                          <div style={{ fontWeight: 800, fontSize: 16, color: sensitivityData.delta > 0 ? 'var(--danger)' : sensitivityData.delta < 0 ? 'var(--success)' : 'var(--text-1)' }}>
                            {sensitivityData.delta > 0 ? '+' : ''}{fmt(sensitivityData.delta)}
                          </div>
                        </div>
                        <div style={{ padding: '12px 16px', background: 'var(--accent-glow)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--accent)' }}>
                          <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>Revised Total</div>
                          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--accent)' }}>{fmt(sensitivityData.revisedTotal)}</div>
                        </div>
                      </div>

                      {/* Bar chart */}
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={sensitivityData.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(val: number) => val.toFixed(4)} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="Original" fill="var(--text-3)" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="Revised"  fill="var(--accent)" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>

                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                        Sensitivity applies to material cost lines. Process costs (labour, machine, overhead) are held constant.
                      </div>
                    </div>
                  )}
                </div>
              )}

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

      {/* ── Commodity Template Modal ── */}
      {showTemplateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTemplateModal(false); }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 14, width: '680px', maxWidth: '95vw',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Load Commodity Template</div>
              <button
                onClick={() => setShowTemplateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-3)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
              {loadingTemplates && (
                <div className="loading" style={{ padding: '32px 0', textAlign: 'center' }}>Loading templates…</div>
              )}
              {templatesError && (
                <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center', padding: 24 }}>{templatesError}</div>
              )}
              {!loadingTemplates && !templatesError && templates.length === 0 && (
                <div className="empty" style={{ textAlign: 'center', padding: 32 }}>No commodity templates available.</div>
              )}
              {!loadingTemplates && templates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        border: '1px solid var(--border)', borderRadius: 10, padding: 16,
                        background: 'var(--bg)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{t.commodity_name}</div>
                          {t.description && (
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t.description}</div>
                          )}
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => selectTemplate(t)}
                          style={{ flexShrink: 0, marginLeft: 12 }}
                        >
                          Load this template
                        </button>
                      </div>
                      {t.elements.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {t.elements.map((el, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 11, padding: '3px 8px', borderRadius: 6,
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                color: 'var(--text-2)',
                              }}
                              title={`Category: ${el.category} | Basis: ${el.basis}`}
                            >
                              {el.cost_element}: {el.typical_pct_min}–{el.typical_pct_max}%
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Small display component for a parameter label/value pair ── */
function ParamDisplay({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: value ? 'var(--text-1)' : 'var(--text-3)' }}>
        {value ?? 'Not set'}
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
