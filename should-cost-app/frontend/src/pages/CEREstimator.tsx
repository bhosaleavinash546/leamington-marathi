import { useEffect, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api';

interface CEREstimateBreakdownItem {
  cost_element: string;
  category: string;
  value: number;
  basis: string;
}

interface CEREstimate {
  breakdown: CEREstimateBreakdownItem[];
  total: number;
  rates_used: {
    labour_rate_hr: number;
    machine_rate_hr: number;
    overhead_pct: number;
    scrap_rate_pct: number;
  };
  commodity_price_used: {
    material_name: string;
    price_per_unit: number;
    unit: string;
    currency: string;
    price_date: string;
  } | null;
  insights: string | null;
}

interface CommoditySummary {
  material_name: string;
  latest_price: number;
  currency: string;
  unit: string;
}

interface PartLite {
  id: number;
  part_number: string;
  part_description?: string;
}

const PIE_COLORS: Record<string, string> = {
  material:  '#2563eb',
  labour:    '#f59e0b',
  overhead:  '#10b981',
  tooling:   '#8b5cf6',
  other:     '#6b7280',
};

function getCategoryColor(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes('material') || lower === 'raw_material' || lower === 'bop') return PIE_COLORS.material;
  if (lower.includes('labour') || lower === 'manufacturing') return PIE_COLORS.labour;
  if (lower.includes('overhead')) return PIE_COLORS.overhead;
  if (lower.includes('tooling')) return PIE_COLORS.tooling;
  return PIE_COLORS.other;
}

export default function CEREstimator() {
  const [processTypes, setProcessTypes] = useState<string[]>([]);
  const [countries, setCountries]       = useState<string[]>([]);
  const [materials, setMaterials]       = useState<CommoditySummary[]>([]);
  const [ratesPreview, setRatesPreview] = useState<{ labour: number; machine: number } | null>(null);
  const [allRates, setAllRates]         = useState<Array<{ process_type: string; country: string; labour_rate_hr: number; machine_rate_hr: number }>>([]);

  const [form, setForm] = useState({
    process_type:      '',
    country:           '',
    part_weight_kg:    '',
    material_name:     '',
    cycle_time_sec:    '',
    annual_volume:     '',
    tooling_total_cost:'',
    tooling_life_units:'',
    notes:             '',
  });

  const [result, setResult]       = useState<CEREstimate | null>(null);
  const [loading, setLoading]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Create draft modal
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [parts, setParts]                   = useState<PartLite[]>([]);
  const [partsSearch, setPartsSearch]       = useState('');
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [draftCreating, setDraftCreating]   = useState(false);
  const [draftSuccess, setDraftSuccess]     = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ process_types: string[] } | string[]>('/rate-library/process-types'),
      api.get<{ countries: string[] } | string[]>('/rate-library/countries'),
      api.get<CommoditySummary[]>('/commodity-prices/summary'),
      api.get<Array<{ process_type: string; country: string; labour_rate_hr: number; machine_rate_hr: number }>>('/rate-library'),
    ]).then(([pt, ct, mat, rates]) => {
      const ptData = pt.data as { process_types?: string[] } | string[];
      const ctData = ct.data as { countries?: string[] } | string[];
      setProcessTypes(Array.isArray(ptData) ? ptData : (ptData.process_types ?? []));
      setCountries(Array.isArray(ctData) ? ctData : (ctData.countries ?? []));
      setMaterials(mat.data);
      setAllRates(rates.data);
    });
  }, []);

  // Rates preview when process+country selected
  useEffect(() => {
    if (!form.process_type || !form.country) { setRatesPreview(null); return; }
    const match = allRates.find(
      (r) => r.process_type === form.process_type && r.country === form.country
    );
    if (match) {
      setRatesPreview({ labour: Number(match.labour_rate_hr), machine: Number(match.machine_rate_hr) });
    } else {
      setRatesPreview(null);
    }
  }, [form.process_type, form.country, allRates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const body: Record<string, string | number | undefined> = {
        process_type:       form.process_type,
        country:            form.country,
        part_weight_kg:     form.part_weight_kg     ? parseFloat(form.part_weight_kg)     : undefined,
        material_name:      form.material_name      || undefined,
        cycle_time_sec:     form.cycle_time_sec     ? parseFloat(form.cycle_time_sec)     : undefined,
        annual_volume:      form.annual_volume       ? parseInt(form.annual_volume, 10)   : undefined,
        tooling_total_cost: form.tooling_total_cost ? parseFloat(form.tooling_total_cost) : undefined,
        tooling_life_units: form.tooling_life_units ? parseInt(form.tooling_life_units, 10) : undefined,
        notes:              form.notes              || undefined,
      };
      const r = await api.post<CEREstimate>('/cer/estimate', body);
      setResult(r.data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch {
      setFormError('Estimation failed. Check your inputs and ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const openDraftModal = async () => {
    setShowDraftModal(true);
    setDraftSuccess(false);
    setSelectedPartId(null);
    setPartsSearch('');
    try {
      const r = await api.get<PartLite[]>('/parts');
      setParts(r.data);
    } catch {
      setParts([]);
    }
  };

  const createDraft = async () => {
    if (!selectedPartId || !result) return;
    setDraftCreating(true);
    try {
      await api.post('/should-cost', {
        part_id:   selectedPartId,
        currency:  result.commodity_price_used?.currency ?? 'GBP',
        breakdown: result.breakdown.map((b, i) => ({
          cost_element: b.cost_element,
          category:     b.category,
          value:        b.value,
          basis:        b.basis,
          sort_order:   i,
        })),
      });
      setDraftSuccess(true);
    } catch {
      setDraftCreating(false);
    }
  };

  const filteredParts = parts.filter((p) => {
    if (!partsSearch) return true;
    const q = partsSearch.toLowerCase();
    return p.part_number.toLowerCase().includes(q) || (p.part_description ?? '').toLowerCase().includes(q);
  });

  // Build pie chart data by category
  const pieData = result
    ? Object.entries(
        result.breakdown.reduce<Record<string, number>>((acc, b) => {
          const cat = b.category.toLowerCase();
          let key = 'other';
          if (cat.includes('material') || cat === 'raw_material' || cat === 'bop') key = 'material';
          else if (cat.includes('labour') || cat === 'manufacturing') key = 'labour';
          else if (cat.includes('overhead')) key = 'overhead';
          else if (cat.includes('tooling')) key = 'tooling';
          acc[key] = (acc[key] ?? 0) + Number(b.value);
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(4)) }))
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>🧮 Parametric Cost Estimator</h1>
          <div className="sub">Generate a should-cost estimate from first principles using the rate library</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Left panel — input form ── */}
        <div className="card" style={{ position: 'sticky', top: 70 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Part Parameters</div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">Process Type *</label>
              <select className="form-control" value={form.process_type} onChange={(e) => setForm({ ...form, process_type: e.target.value })} required>
                <option value="">Select process…</option>
                {processTypes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Manufacturing Country *</label>
              <select className="form-control" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required>
                <option value="">Select country…</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {ratesPreview && (
              <div style={{ padding: '8px 12px', background: 'var(--accent-glow)', borderRadius: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                Rates found: Labour £{ratesPreview.labour.toFixed(2)}/hr | Machine £{ratesPreview.machine.toFixed(2)}/hr
              </div>
            )}

            <div>
              <label className="form-label">Part Weight (kg)</label>
              <input className="form-control" type="number" step="0.0001" value={form.part_weight_kg} onChange={(e) => setForm({ ...form, part_weight_kg: e.target.value })} placeholder="e.g. 1.2500" />
            </div>

            <div>
              <label className="form-label">Material Name</label>
              <input
                className="form-control"
                list="cer-materials-dl"
                value={form.material_name}
                onChange={(e) => setForm({ ...form, material_name: e.target.value })}
                placeholder="e.g. Steel HRC, Aluminium ADC12"
              />
              <datalist id="cer-materials-dl">
                {materials.map((m) => <option key={m.material_name} value={m.material_name} />)}
              </datalist>
            </div>

            <div>
              <label className="form-label">Estimated Cycle Time (sec)</label>
              <input className="form-control" type="number" step="0.01" value={form.cycle_time_sec} onChange={(e) => setForm({ ...form, cycle_time_sec: e.target.value })} placeholder="e.g. 45.00" />
            </div>

            <div>
              <label className="form-label">Annual Volume</label>
              <input className="form-control" type="number" step="1" value={form.annual_volume} onChange={(e) => setForm({ ...form, annual_volume: e.target.value })} placeholder="e.g. 50000" />
            </div>

            <div>
              <label className="form-label">Tooling Total Cost (optional)</label>
              <input className="form-control" type="number" step="0.01" value={form.tooling_total_cost} onChange={(e) => setForm({ ...form, tooling_total_cost: e.target.value })} placeholder="e.g. 120000.00" />
            </div>

            <div>
              <label className="form-label">Tooling Life Units (optional)</label>
              <input className="form-control" type="number" step="1" value={form.tooling_life_units} onChange={(e) => setForm({ ...form, tooling_life_units: e.target.value })} placeholder="e.g. 500000" />
            </div>

            <div>
              <label className="form-label">Notes</label>
              <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional context…" />
            </div>

            {formError && (
              <div style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>{formError}</div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Estimating…' : '🧮 Generate Estimate'}
            </button>
          </form>
        </div>

        {/* ── Right panel — results ── */}
        <div ref={resultsRef}>
          {loading && (
            <div className="card" style={{ padding: 48, textAlign: 'center' }}>
              <div className="loading">Calculating should-cost estimate…</div>
            </div>
          )}

          {!loading && !result && (
            <div className="card" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🧮</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
                Ready to estimate
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 360, margin: '0 auto' }}>
                Fill in the part parameters on the left and click <strong>Generate Estimate</strong> to produce a parametric should-cost breakdown from first principles.
              </div>
            </div>
          )}

          {!loading && result && (
            <>
              {/* Summary card */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      Total Estimated Should-Cost
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>
                      {result.commodity_price_used?.currency ?? 'GBP'} {Number(result.total).toFixed(4)}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={openDraftModal}>
                    ＋ Create Should-Cost Draft
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
                  {/* Rates used */}
                  <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-2)' }}>Rates Used</div>
                    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div><span style={{ color: 'var(--text-3)' }}>Labour:</span> <strong>£{Number(result.rates_used.labour_rate_hr).toFixed(2)}/hr</strong></div>
                      <div><span style={{ color: 'var(--text-3)' }}>Machine:</span> <strong>£{Number(result.rates_used.machine_rate_hr).toFixed(2)}/hr</strong></div>
                      <div><span style={{ color: 'var(--text-3)' }}>Overhead:</span> <strong>{Number(result.rates_used.overhead_pct).toFixed(1)}%</strong></div>
                      <div><span style={{ color: 'var(--text-3)' }}>Scrap:</span> <strong>{Number(result.rates_used.scrap_rate_pct).toFixed(1)}%</strong></div>
                    </div>
                  </div>

                  {/* Commodity price */}
                  {result.commodity_price_used ? (
                    <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text-2)' }}>Commodity Price Used</div>
                      <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><span style={{ color: 'var(--text-3)' }}>Material:</span> <strong>{result.commodity_price_used.material_name}</strong></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Price:</span> <strong>{result.commodity_price_used.currency} {Number(result.commodity_price_used.price_per_unit).toFixed(2)}/{result.commodity_price_used.unit}</strong></div>
                        <div><span style={{ color: 'var(--text-3)' }}>Date:</span> <strong>{new Date(result.commodity_price_used.price_date).toLocaleDateString('en-GB')}</strong></div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text-3)' }}>Commodity Price</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No commodity price found for the specified material.</div>
                    </div>
                  )}
                </div>

                {/* AI Insights */}
                {result.insights && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🤖 AI Insights</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {result.insights}
                    </div>
                  </div>
                )}
              </div>

              {/* Breakdown table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '14px 20px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                  Cost Breakdown
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left' }}>Cost Element</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left' }}>Category</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right' }}>Value</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right' }}>% of Total</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left' }}>Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.breakdown.map((b, i) => {
                        const pctVal = result.total ? ((Number(b.value) / result.total) * 100).toFixed(1) : '—';
                        return (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 16px', fontWeight: 600 }}>{b.cost_element}</td>
                            <td style={{ padding: '9px 16px' }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: getCategoryColor(b.category) + '22',
                                color: getCategoryColor(b.category),
                              }}>
                                {b.category}
                              </span>
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 700 }}>{Number(b.value).toFixed(4)}</td>
                            <td style={{ padding: '9px 16px', textAlign: 'right', color: 'var(--text-3)' }}>{pctVal}%</td>
                            <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--text-3)' }}>{b.basis}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 900 }}>Total</td>
                        <td />
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: 'var(--accent)' }}>
                          {Number(result.total).toFixed(4)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>100%</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Pie chart */}
              {pieData.length > 0 && (
                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Cost Distribution</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }: { name: string; percent: number }) =>
                          `${name} ${(percent * 100).toFixed(1)}%`
                        }
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] ?? PIE_COLORS.other} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => value.toFixed(4)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Draft Modal */}
      {showDraftModal && (
        <div className="modal-backdrop" onClick={() => setShowDraftModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Create Should-Cost Draft</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDraftModal(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              {draftSuccess ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Draft created successfully!</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
                    Your should-cost draft has been saved. You can view and publish it from the Should-Costs page.
                  </div>
                  <a href="/should-costs" className="btn btn-primary">
                    View Should-Costs →
                  </a>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label className="form-label">Search Part</label>
                    <input
                      className="form-control"
                      value={partsSearch}
                      onChange={(e) => setPartsSearch(e.target.value)}
                      placeholder="Search by part number or description…"
                    />
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {filteredParts.length === 0 && (
                      <div className="empty" style={{ padding: 24, textAlign: 'center' }}>No parts found.</div>
                    )}
                    {filteredParts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPartId(p.id)}
                        style={{
                          textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                          border: `1px solid ${selectedPartId === p.id ? 'var(--accent)' : 'var(--border)'}`,
                          background: selectedPartId === p.id ? 'var(--accent-glow)' : 'var(--bg)',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.part_number}</div>
                        {p.part_description && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.part_description}</div>}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setShowDraftModal(false)}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      disabled={!selectedPartId || draftCreating}
                      onClick={createDraft}
                    >
                      {draftCreating ? 'Creating…' : 'Create Draft'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
