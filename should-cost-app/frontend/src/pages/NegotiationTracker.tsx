import { useEffect, useState } from 'react';
import api from '../utils/api';

interface Negotiation {
  id: number;
  part_number: string;
  part_description?: string;
  supplier_name: string;
  target_price: number;
  current_price?: number;
  should_cost?: number;
  currency: string;
  target_date?: string;
  status: 'open' | 'agreed' | 'stalled' | 'closed';
  notes?: string;
  agreed_price?: number;
  owner_name?: string;
}

interface Summary {
  total: number; open: number; agreed: number; stalled: number;
  due_this_week: number; potential_annual_saving: number;
}

interface PartLite   { id: number; part_number: string; description?: string }
interface SupplierLite { id: number; name: string }

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:    { label: 'Open',    color: '#2563eb' },
  agreed:  { label: 'Agreed',  color: '#16a34a' },
  stalled: { label: 'Stalled', color: '#dc2626' },
  closed:  { label: 'Closed',  color: '#6b7280' },
};

const fmt = (n: number | undefined | null, cur = 'GBP') =>
  n == null ? '—' : `${cur} ${Number(n).toFixed(2)}`;

const savingPct = (current?: number | null, target?: number | null) => {
  if (!current || !target || current <= 0) return null;
  return ((current - target) / current) * 100;
};

export default function NegotiationTracker() {
  const [list, setList]           = useState<Negotiation[]>([]);
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Negotiation | null>(null);
  const [filterStatus, setFilter] = useState('');

  const [parts, setParts]         = useState<PartLite[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);

  // Form state
  const [form, setForm] = useState({
    part_id: '', supplier_id: '', target_price: '',
    current_price: '', should_cost: '', currency: 'GBP',
    target_date: '', status: 'open', notes: '',
  });

  const fetchAll = async () => {
    setError(null);
    try {
      const [listRes, sumRes] = await Promise.all([
        api.get<Negotiation[]>('/negotiations', { params: filterStatus ? { status: filterStatus } : {} }),
        api.get<Summary>('/negotiations/summary'),
      ]);
      setList(listRes.data);
      setSummary(sumRes.data);
    } catch {
      setError('Could not load negotiations. If this is a fresh install, try "Reset CostLens Data" to update the database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([
      api.get<PartLite[]>('/should-cost', { params: { status: 'published' } }),
      api.get<SupplierLite[]>('/quotes/suppliers'),
    ]).then(([p, s]) => { setParts(p.data); setSuppliers(s.data); });
  }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({ part_id: '', supplier_id: '', target_price: '', current_price: '', should_cost: '',
      currency: 'GBP', target_date: '', status: 'open', notes: '' });
    setShowForm(true);
  };

  const openEdit = (n: Negotiation) => {
    setEditItem(n);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      part_id:       parseInt(form.part_id),
      supplier_id:   parseInt(form.supplier_id),
      target_price:  parseFloat(form.target_price),
      current_price: form.current_price ? parseFloat(form.current_price) : undefined,
      should_cost:   form.should_cost   ? parseFloat(form.should_cost)   : undefined,
      currency:      form.currency,
      target_date:   form.target_date || undefined,
      status:        form.status,
      notes:         form.notes || undefined,
    };

    if (editItem) {
      await api.patch(`/negotiations/${editItem.id}`, body);
    } else {
      await api.post('/negotiations', body);
    }
    setShowForm(false);
    fetchAll();
  };

  const markStatus = async (id: number, status: string, agreedPrice?: number) => {
    await api.patch(`/negotiations/${id}`, { status, agreed_price: agreedPrice });
    fetchAll();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this negotiation target?')) return;
    await api.delete(`/negotiations/${id}`);
    fetchAll();
  };

  const isDue = (d?: string) => d && new Date(d) <= new Date(Date.now() + 7 * 86400_000);

  if (loading) return <div className="loading">Loading negotiations…</div>;
  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Failed to load negotiations</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => { setLoading(true); fetchAll(); }}>Retry</button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Negotiation Tracker</h1>
          <div className="sub">Track price targets, deadlines, and agreed outcomes per part/supplier.</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>＋ New Target</button>
      </div>

      {/* KPI tiles */}
      {summary && (
        <div className="stats-row">
          <div className="stat-tile">
            <div className="label">Open</div>
            <div className="value">{summary.open}</div>
            <div className="sub">{summary.due_this_week} due this week</div>
          </div>
          <div className="stat-tile">
            <div className="label">Agreed</div>
            <div className="value" style={{ color: 'var(--success)' }}>{summary.agreed}</div>
            <div className="sub">of {summary.total} total</div>
          </div>
          <div className="stat-tile">
            <div className="label">Stalled</div>
            <div className="value" style={{ color: 'var(--danger)' }}>{summary.stalled}</div>
            <div className="sub">needs attention</div>
          </div>
          <div className="stat-tile">
            <div className="label">Potential Annual Saving</div>
            <div className="value" style={{ color: 'var(--success)' }}>
              ~£{Math.round(Number(summary.potential_annual_saving)).toLocaleString()}
            </div>
            <div className="sub">vs current prices</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Filter:</span>
        {['', 'open', 'agreed', 'stalled', 'closed'].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.length === 0 ? (
          <div className="empty" style={{ padding: 32, textAlign: 'center' }}>
            No negotiations found. Click <strong>＋ New Target</strong> to start tracking.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Part</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Supplier</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Should-Cost</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Current Price</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Target Price</th>
                  <th style={{ padding: '11px 14px', textAlign: 'right' }}>Saving %</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Target Date</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '11px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {list.map((n) => {
                  const pct = savingPct(n.current_price, n.target_price);
                  const due = isDue(n.target_date);
                  return (
                    <tr key={n.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700 }}>{n.part_number}</div>
                        {n.part_description && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{n.part_description}</div>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>{n.supplier_name}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-2)' }}>{fmt(n.should_cost, n.currency)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt(n.current_price, n.currency)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmt(n.target_price, n.currency)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: (pct ?? 0) > 0 ? 'var(--success)' : 'var(--text-3)' }}>
                        {pct != null ? `${pct.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {n.target_date ? (
                          <span style={{ color: due && n.status === 'open' ? 'var(--danger)' : 'var(--text-2)', fontWeight: due && n.status === 'open' ? 700 : 400 }}>
                            {new Date(n.target_date).toLocaleDateString('en-GB')}
                            {due && n.status === 'open' && ' ⚠'}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: STATUS_META[n.status]?.color + '20',
                          color: STATUS_META[n.status]?.color,
                        }}>
                          {STATUS_META[n.status]?.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {n.status === 'open' && (
                          <button className="btn btn-sm btn-primary" onClick={() => markStatus(n.id, 'agreed', n.target_price)} title="Mark as Agreed">✓</button>
                        )}
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(n)} title="Edit">✎</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => remove(n.id)} title="Delete" style={{ color: 'var(--danger)' }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3>{editItem ? 'Edit Negotiation Target' : 'New Negotiation Target'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Part *</label>
                  <select className="form-control" value={form.part_id} onChange={(e) => setForm({ ...form, part_id: e.target.value })} required>
                    <option value="">Select part…</option>
                    {parts.map((p) => <option key={p.id} value={p.id}>{p.part_number}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Supplier *</label>
                  <select className="form-control" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} required>
                    <option value="">Select supplier…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Target Price *</label>
                  <input className="form-control" type="number" step="0.01" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} required />
                </div>
                <div>
                  <label className="form-label">Current Price</label>
                  <input className="form-control" type="number" step="0.01" value={form.current_price} onChange={(e) => setForm({ ...form, current_price: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Should-Cost</label>
                  <input className="form-control" type="number" step="0.01" value={form.should_cost} onChange={(e) => setForm({ ...form, should_cost: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select className="form-control" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {['GBP','EUR','USD'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Target Date</label>
                  <input className="form-control" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
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
