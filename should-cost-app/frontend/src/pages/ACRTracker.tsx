import { useEffect, useState } from 'react';
import api from '../utils/api';
import { downloadCsv } from '../utils/download';

interface ACRTarget {
  id: number;
  part_number: string;
  part_description?: string;
  supplier_name: string;
  base_price: number;
  base_year: number;
  target_reduction_pct: number;
  target_price: number;
  agreed_price?: number;
  actual_reduction_pct?: number;
  status: 'open' | 'agreed' | 'achieved' | 'missed';
  currency: string;
  notes?: string;
}

interface ACRSummary {
  year: number;
  total_targets: number;
  achieved: number;
  missed: number;
  open: number;
  total_target_saving: number;
  total_actual_saving: number;
}

interface PartLite { id: number; part_number: string; description?: string; total_cost?: number }
interface SupplierLite { id: number; name: string }

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:     { label: 'Open',     color: '#2563eb' },
  agreed:   { label: 'Agreed',   color: '#d97706' },
  achieved: { label: 'Achieved', color: '#16a34a' },
  missed:   { label: 'Missed',   color: '#dc2626' },
};

const CURRENT_YEAR = 2026;
const YEAR_TABS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

export default function ACRTracker() {
  const [list, setList]                     = useState<ACRTarget[]>([]);
  const [yearSummaries, setYearSummaries]   = useState<ACRSummary[]>([]);
  const [selectedYear, setSelectedYear]     = useState<number>(CURRENT_YEAR);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal]   = useState(false);
  const [editTarget, setEditTarget]         = useState<ACRTarget | null>(null);
  const [parts, setParts]                   = useState<PartLite[]>([]);
  const [suppliers, setSuppliers]           = useState<SupplierLite[]>([]);

  const [createForm, setCreateForm] = useState({
    part_id: '',
    supplier_id: '',
    target_year: String(CURRENT_YEAR),
    base_price: '',
    base_year: String(CURRENT_YEAR - 1),
    target_reduction_pct: '',
    currency: 'GBP',
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    agreed_price: '',
    actual_reduction_pct: '',
    status: 'open' as ACRTarget['status'],
  });

  const currentSummary = yearSummaries.find((s) => s.year === selectedYear) ?? null;

  const fetchList = async () => {
    setError(null);
    try {
      const res = await api.get<ACRTarget[]>('/acr', { params: { year: selectedYear } });
      setList(res.data);
    } catch {
      setError('Could not load ACR targets.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummaries = async () => {
    try {
      const res = await api.get<ACRSummary[]>('/acr/summary');
      setYearSummaries(res.data);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchList();
  }, [selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSummaries();
    Promise.all([
      api.get<PartLite[]>('/should-cost', { params: { status: 'published' } }),
      api.get<SupplierLite[]>('/quotes/suppliers'),
    ]).then(([p, s]) => { setParts(p.data); setSuppliers(s.data); });
  }, []);

  const openCreateModal = () => {
    setCreateForm({
      part_id: '',
      supplier_id: '',
      target_year: String(selectedYear),
      base_price: '',
      base_year: String(selectedYear - 1),
      target_reduction_pct: '',
      currency: 'GBP',
      notes: '',
    });
    setShowCreateModal(true);
  };

  const openEditModal = (t: ACRTarget) => {
    setEditTarget(t);
    setEditForm({
      agreed_price: t.agreed_price != null ? String(t.agreed_price) : '',
      actual_reduction_pct: t.actual_reduction_pct != null ? String(t.actual_reduction_pct) : '',
      status: t.status,
    });
    setShowEditModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/acr', {
      part_id:              parseInt(createForm.part_id),
      supplier_id:          parseInt(createForm.supplier_id),
      target_year:          parseInt(createForm.target_year),
      base_price:           parseFloat(createForm.base_price),
      base_year:            parseInt(createForm.base_year),
      target_reduction_pct: parseFloat(createForm.target_reduction_pct),
      currency:             createForm.currency,
      notes:                createForm.notes || undefined,
    });
    setShowCreateModal(false);
    fetchList();
    fetchSummaries();
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    await api.patch(`/acr/${editTarget.id}`, {
      agreed_price:          editForm.agreed_price ? parseFloat(editForm.agreed_price) : undefined,
      actual_reduction_pct:  editForm.actual_reduction_pct ? parseFloat(editForm.actual_reduction_pct) : undefined,
      status:                editForm.status,
    });
    setShowEditModal(false);
    setEditTarget(null);
    fetchList();
    fetchSummaries();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this ACR target?')) return;
    await api.delete(`/acr/${id}`);
    fetchList();
    fetchSummaries();
  };

  const targetPricePreview =
    createForm.base_price && createForm.target_reduction_pct
      ? (parseFloat(createForm.base_price) * (1 - parseFloat(createForm.target_reduction_pct) / 100)).toFixed(2)
      : '—';

  if (loading) return <div className="loading">Loading ACR targets…</div>;
  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Failed to load ACR targets</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => { setLoading(true); fetchList(); }}>Retry</button>
    </div>
  );

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>ACR Tracker</h1>
          <div className="sub">Annual cost reduction targets — track commitments vs actuals</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => downloadCsv('/export/acr.csv', `acr-targets-${new Date().toISOString().slice(0,10)}.csv`)}
            title="Export all ACR targets as CSV"
          >
            ⬇ Export CSV
          </button>
          <button className="btn btn-primary" onClick={openCreateModal}>＋ New ACR Target</button>
        </div>
      </div>

      {/* Year selector tabs */}
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Year:</span>
        {YEAR_TABS.map((y) => (
          <button
            key={y}
            className={`btn btn-sm ${selectedYear === y ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-tile">
          <div className="label">Total Targets</div>
          <div className="value">{currentSummary?.total_targets ?? 0}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Achieved</div>
          <div className="value" style={{ color: 'var(--success)' }}>{currentSummary?.achieved ?? 0}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Missed</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{currentSummary?.missed ?? 0}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Open</div>
          <div className="value" style={{ color: 'var(--accent)' }}>{currentSummary?.open ?? 0}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Total Target Saving</div>
          <div className="value" style={{ color: 'var(--success)' }}>
            £{Math.round(currentSummary?.total_target_saving ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.length === 0 ? (
          <div className="empty" style={{ padding: 32, textAlign: 'center' }}>
            No ACR targets for {selectedYear}. Click <strong>＋ New ACR Target</strong> to add one.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Part Number</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Part Description</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Supplier</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Base Price</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Target %</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Target Price</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Agreed Price</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Actual %</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '11px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const rowBg =
                    t.status === 'achieved' ? 'rgba(22,163,74,0.06)' :
                    t.status === 'missed'   ? 'rgba(220,38,38,0.06)' :
                    'transparent';
                  return (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--border)', background: rowBg }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{t.part_number}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{t.part_description ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{t.supplier_name}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-2)' }}>
                        {t.currency} {Number(t.base_price).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {Number(t.target_reduction_pct).toFixed(1)}%
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                        {t.currency} {Number(t.target_price).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {t.agreed_price != null ? `${t.currency} ${Number(t.agreed_price).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {t.actual_reduction_pct != null ? `${Number(t.actual_reduction_pct).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: STATUS_META[t.status]?.color + '20',
                          color: STATUS_META[t.status]?.color,
                        }}>
                          {STATUS_META[t.status]?.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(t)} title="Edit">✎</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleDelete(t.id)} title="Delete" style={{ color: 'var(--danger)' }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>New ACR Target</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Part *</label>
                  <select
                    className="form-control"
                    value={createForm.part_id}
                    onChange={(e) => setCreateForm({ ...createForm, part_id: e.target.value })}
                    required
                  >
                    <option value="">Select part…</option>
                    {parts.map((p) => <option key={p.id} value={p.id}>{p.part_number}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Supplier *</label>
                  <select
                    className="form-control"
                    value={createForm.supplier_id}
                    onChange={(e) => setCreateForm({ ...createForm, supplier_id: e.target.value })}
                    required
                  >
                    <option value="">Select supplier…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Target Year *</label>
                  <input
                    className="form-control"
                    type="number"
                    value={createForm.target_year}
                    onChange={(e) => setCreateForm({ ...createForm, target_year: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Base Year *</label>
                  <input
                    className="form-control"
                    type="number"
                    value={createForm.base_year}
                    onChange={(e) => setCreateForm({ ...createForm, base_year: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Base Price *</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.01"
                    value={createForm.base_price}
                    onChange={(e) => setCreateForm({ ...createForm, base_price: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Target Reduction % *</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={createForm.target_reduction_pct}
                    onChange={(e) => setCreateForm({ ...createForm, target_reduction_pct: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select
                    className="form-control"
                    value={createForm.currency}
                    onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                  >
                    {['GBP', 'EUR', 'USD'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Target price preview */}
              <div style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--accent)',
                fontWeight: 600,
              }}>
                Target Price = {targetPricePreview !== '—'
                  ? `${createForm.currency} ${targetPricePreview}`
                  : '—'
                }
                {targetPricePreview !== '—' && (
                  <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                    (base {createForm.currency} {parseFloat(createForm.base_price || '0').toFixed(2)} × {(1 - parseFloat(createForm.target_reduction_pct || '0') / 100).toFixed(4)})
                  </span>
                )}
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editTarget && (
        <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div>
                <h3>Update ACR Target</h3>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {editTarget.part_number} — {editTarget.supplier_name}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div>
                <label className="form-label">Agreed Price</label>
                <input
                  className="form-control"
                  type="number"
                  step="0.01"
                  value={editForm.agreed_price}
                  onChange={(e) => setEditForm({ ...editForm, agreed_price: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label">Actual Reduction %</label>
                <input
                  className="form-control"
                  type="number"
                  step="0.1"
                  value={editForm.actual_reduction_pct}
                  onChange={(e) => setEditForm({ ...editForm, actual_reduction_pct: e.target.value })}
                />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  className="form-control"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ACRTarget['status'] })}
                >
                  <option value="open">Open</option>
                  <option value="agreed">Agreed</option>
                  <option value="achieved">Achieved</option>
                  <option value="missed">Missed</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
