import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { RateReference } from '../types';

interface ProcessTypesResponse { process_types: string[] }
interface CountriesResponse    { countries: string[] }

const fmt2 = (n: number) => Number(n).toFixed(2);

export default function RateLibrary() {
  const [rates, setRates]               = useState<RateReference[]>([]);
  const [processTypes, setProcessTypes] = useState<string[]>([]);
  const [countries, setCountries]       = useState<string[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [editItem, setEditItem]         = useState<RateReference | null>(null);
  const [filterProcess, setFilterProcess] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [csvToast, setCsvToast]         = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check user role from localStorage
  const userStr = localStorage.getItem('sc_user');
  const userRole = userStr ? (JSON.parse(userStr) as { role: string }).role : '';
  const isAdmin = userRole === 'admin';

  const [form, setForm] = useState({
    process_type: '',
    country: '',
    labour_rate_hr: '',
    machine_rate_hr: '',
    overhead_pct: '',
    scrap_rate_pct: '',
    source: '',
    effective_date: '',
    notes: '',
  });

  const fetchAll = async () => {
    setError(null);
    try {
      const [ratesRes, ptRes, cRes] = await Promise.all([
        api.get<RateReference[]>('/rate-library'),
        api.get<ProcessTypesResponse>('/rate-library/process-types'),
        api.get<CountriesResponse>('/rate-library/countries'),
      ]);
      setRates(ratesRes.data);
      setProcessTypes(ptRes.data.process_types ?? ptRes.data);
      setCountries(cRes.data.countries ?? cRes.data);
    } catch {
      setError('Could not load rate library. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = rates.filter((r) => {
    if (filterProcess && r.process_type !== filterProcess) return false;
    if (filterCountry && r.country !== filterCountry) return false;
    return true;
  });

  const openNew = () => {
    setEditItem(null);
    setForm({ process_type: '', country: '', labour_rate_hr: '', machine_rate_hr: '', overhead_pct: '', scrap_rate_pct: '', source: '', effective_date: '', notes: '' });
    setShowForm(true);
  };

  const openEdit = (r: RateReference) => {
    setEditItem(r);
    setForm({
      process_type:    r.process_type,
      country:         r.country,
      labour_rate_hr:  String(r.labour_rate_hr),
      machine_rate_hr: String(r.machine_rate_hr),
      overhead_pct:    String(r.overhead_pct),
      scrap_rate_pct:  String(r.scrap_rate_pct),
      source:          r.source ?? '',
      effective_date:  r.effective_date ?? '',
      notes:           r.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      process_type:    form.process_type,
      country:         form.country,
      labour_rate_hr:  parseFloat(form.labour_rate_hr),
      machine_rate_hr: parseFloat(form.machine_rate_hr),
      overhead_pct:    parseFloat(form.overhead_pct),
      scrap_rate_pct:  parseFloat(form.scrap_rate_pct),
      source:          form.source || undefined,
      effective_date:  form.effective_date || undefined,
      notes:           form.notes || undefined,
    };
    if (editItem) {
      await api.patch(`/rate-library/${editItem.id}`, body);
    } else {
      await api.post('/rate-library', body);
    }
    setShowForm(false);
    fetchAll();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this rate? This cannot be undone.')) return;
    await api.delete(`/rate-library/${id}`);
    fetchAll();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await api.post('/import/parts', text, { headers: { 'Content-Type': 'text/plain' } });
      setCsvToast({ ok: true, msg: 'CSV imported successfully.' });
      fetchAll();
    } catch {
      setCsvToast({ ok: false, msg: 'CSV import failed. Check file format.' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setCsvToast(null), 4000);
  };

  // Stats
  const uniqueProcesses = new Set(rates.map((r) => r.process_type)).size;
  const uniqueCountries = new Set(rates.map((r) => r.country)).size;
  const dates = rates.map((r) => r.effective_date).filter(Boolean) as string[];
  const dateRange = dates.length
    ? `${dates.reduce((a, b) => (a < b ? a : b))} – ${dates.reduce((a, b) => (a > b ? a : b))}`
    : '—';

  if (loading) return <div className="loading">Loading rate library…</div>;
  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Failed to load rate library</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => { setLoading(true); fetchAll(); }}>Retry</button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>⚙️ Rate Reference Library</h1>
          <div className="sub">Labour &amp; machine rates by manufacturing process and country</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleCsvImport}
              />
              <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                ⬆ Import CSV
              </button>
              <button className="btn btn-primary" onClick={openNew}>＋ Add Rate</button>
            </>
          )}
        </div>
      </div>

      {csvToast && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: csvToast.ok ? 'var(--success)' : 'var(--danger)',
          color: '#fff',
        }}>
          {csvToast.msg}
        </div>
      )}

      {/* Filter bar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Process Type</label>
          <select className="form-control" style={{ minWidth: 160 }} value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)}>
            <option value="">All</option>
            {processTypes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Country</label>
          <select className="form-control" style={{ minWidth: 160 }} value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
            <option value="">All</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(filterProcess || filterCountry) && (
          <button className="btn btn-sm btn-secondary" onClick={() => { setFilterProcess(''); setFilterCountry(''); }}>
            Clear filters
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          Showing {filtered.length} of {rates.length} rates
        </span>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-tile">
          <div className="label">Total Rates</div>
          <div className="value">{rates.length}</div>
          <div className="sub">in library</div>
        </div>
        <div className="stat-tile">
          <div className="label">Process Types</div>
          <div className="value">{uniqueProcesses}</div>
          <div className="sub">unique processes</div>
        </div>
        <div className="stat-tile">
          <div className="label">Countries</div>
          <div className="value">{uniqueCountries}</div>
          <div className="sub">covered</div>
        </div>
        <div className="stat-tile">
          <div className="label">Effective Date Range</div>
          <div className="value" style={{ fontSize: 14, fontWeight: 700 }}>{dateRange}</div>
          <div className="sub">from latest updates</div>
        </div>
      </div>

      {/* Rate table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: 32, textAlign: 'center' }}>
            No rates found. {isAdmin ? <>Click <strong>＋ Add Rate</strong> to add one.</> : 'No rates match the current filters.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Process Type</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Country</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Labour ($/hr)</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Machine ($/hr)</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Overhead %</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Scrap %</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Source</th>
                  {isAdmin && <th style={{ padding: '11px 14px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isLowCost = Number(r.labour_rate_hr) < 10;
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderTop: '1px solid var(--border)',
                        borderLeft: isLowCost ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.process_type}</td>
                      <td style={{ padding: '10px 14px' }}>{r.country}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: isLowCost ? 'var(--accent)' : undefined }}>
                        {fmt2(Number(r.labour_rate_hr))}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt2(Number(r.machine_rate_hr))}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt2(Number(r.overhead_pct))}%</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt2(Number(r.scrap_rate_pct))}%</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)' }}>
                        {r.source ?? '—'}
                        {r.effective_date && (
                          <div style={{ fontSize: 11 }}>{new Date(r.effective_date).toLocaleDateString('en-GB')}</div>
                        )}
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '10px 14px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)} title="Edit">✎</button>
                          <button className="btn btn-sm btn-danger" onClick={() => remove(r.id)} title="Delete">✕</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h3>{editItem ? 'Edit Rate' : 'Add Rate'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Process Type *</label>
                  <input
                    className="form-control"
                    list="process-types-dl"
                    value={form.process_type}
                    onChange={(e) => setForm({ ...form, process_type: e.target.value })}
                    placeholder="e.g. Stamping, Casting…"
                    required
                  />
                  <datalist id="process-types-dl">
                    {processTypes.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <label className="form-label">Country *</label>
                  <input
                    className="form-control"
                    list="countries-dl"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    placeholder="e.g. UK, Germany, China…"
                    required
                  />
                  <datalist id="countries-dl">
                    {countries.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="form-label">Labour Rate ($/hr) *</label>
                  <input className="form-control" type="number" step="0.01" value={form.labour_rate_hr} onChange={(e) => setForm({ ...form, labour_rate_hr: e.target.value })} required />
                </div>
                <div>
                  <label className="form-label">Machine Rate ($/hr) *</label>
                  <input className="form-control" type="number" step="0.01" value={form.machine_rate_hr} onChange={(e) => setForm({ ...form, machine_rate_hr: e.target.value })} required />
                </div>
                <div>
                  <label className="form-label">Overhead % *</label>
                  <input className="form-control" type="number" step="0.01" value={form.overhead_pct} onChange={(e) => setForm({ ...form, overhead_pct: e.target.value })} required />
                </div>
                <div>
                  <label className="form-label">Scrap Rate % *</label>
                  <input className="form-control" type="number" step="0.01" value={form.scrap_rate_pct} onChange={(e) => setForm({ ...form, scrap_rate_pct: e.target.value })} required />
                </div>
                <div>
                  <label className="form-label">Source</label>
                  <input className="form-control" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Industry benchmark 2024" />
                </div>
                <div>
                  <label className="form-label">Effective Date</label>
                  <input className="form-control" type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editItem ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
