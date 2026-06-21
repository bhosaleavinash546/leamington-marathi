import { useEffect, useState } from 'react';
import api from '../utils/api';

interface AssemblyListItem {
  id: number;
  assembly_number: string;
  description?: string;
  program_id?: number;
  currency: string;
  total_should_cost?: number;
  created_at: string;
}

interface AssemblyLine {
  id: number;
  part_id: number;
  part_number: string;
  part_description?: string;
  should_cost_header_id?: number;
  version?: string;
  unit_cost: number;
  quantity: number;
  extended_cost: number;
}

interface AssemblyDetail {
  header: {
    id: number;
    assembly_number: string;
    description?: string;
    program_id?: number;
    currency: string;
    notes?: string;
  };
  lines: AssemblyLine[];
  assembly_total_cost: number;
}

interface PublishedSC {
  id: number;
  part_number: string;
  description?: string;
  total_cost?: number;
  currency?: string;
  version?: string;
}

const COLORS = ['#38bdf8', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#fb923c', '#4ade80', '#e879f9'];

export default function AssemblyBOM() {
  const [assemblies, setAssemblies] = useState<AssemblyListItem[]>([]);
  const [detail, setDetail] = useState<AssemblyDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [publishedSCs, setPublishedSCs] = useState<PublishedSC[]>([]);

  const [createForm, setCreateForm] = useState({
    assembly_number: '',
    description: '',
    currency: 'GBP',
    notes: '',
  });

  const [addForm, setAddForm] = useState({
    sc_id: '',
    quantity: '1',
  });

  const fetchAssemblies = async () => {
    setError(null);
    try {
      const res = await api.get<AssemblyListItem[]>('/api/assembly');
      setAssemblies(res.data);
    } catch {
      setError('Could not load assemblies.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await api.get<AssemblyDetail>(`/api/assembly/${id}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchAssemblies();
  }, []);

  useEffect(() => {
    if (selectedId !== null) {
      fetchDetail(selectedId);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showAddPartModal && publishedSCs.length === 0) {
      api.get<PublishedSC[]>('/api/should-cost', { params: { status: 'published' } })
        .then((res) => setPublishedSCs(res.data))
        .catch(() => {});
    }
  }, [showAddPartModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateAssembly = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post<{ id: number }>('/api/assembly', {
        assembly_number: createForm.assembly_number,
        description: createForm.description || undefined,
        currency: createForm.currency,
        notes: createForm.notes || undefined,
      });
      await fetchAssemblies();
      setSelectedId(res.data.id);
      setShowCreateModal(false);
      setCreateForm({ assembly_number: '', description: '', currency: 'GBP', notes: '' });
    } catch {
      // silently fail; could add error handling here
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    try {
      await api.post(`/api/assembly/${selectedId}/lines`, {
        should_cost_header_id: Number(addForm.sc_id),
        quantity: Number(addForm.quantity),
      });
      await Promise.all([fetchDetail(selectedId), fetchAssemblies()]);
      setShowAddPartModal(false);
      setAddForm({ sc_id: '', quantity: '1' });
    } catch {
      // silently fail
    }
  };

  const handleRemoveLine = async (lineId: number) => {
    if (!selectedId) return;
    if (!confirm('Remove this line?')) return;
    try {
      await api.delete(`/api/assembly/${selectedId}/lines/${lineId}`);
      await Promise.all([fetchDetail(selectedId), fetchAssemblies()]);
    } catch {
      // silently fail
    }
  };

  const handleDeleteAssembly = async () => {
    if (!selectedId) return;
    if (!confirm('Delete this assembly?')) return;
    try {
      await api.delete(`/api/assembly/${selectedId}`);
      await fetchAssemblies();
      setSelectedId(null);
      setDetail(null);
    } catch {
      // silently fail
    }
  };

  const filtered = assemblies.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.assembly_number.toLowerCase().includes(q) ||
      (a.description ?? '').toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="loading">Loading assemblies…</div>;
  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Failed to load assemblies</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => { setLoading(true); fetchAssemblies(); }}>Retry</button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Assembly BOM Costing</h1>
          <div className="sub">Roll up component should-costs to assembly level</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>＋ New Assembly</button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left panel */}
        <div style={{ flex: '0 0 300px', position: 'sticky', top: 20 }}>
          <input
            className="form-control"
            placeholder="Search assemblies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="empty" style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                No assemblies found.
              </div>
            ) : (
              filtered.map((a) => (
                <div
                  key={a.id}
                  className="card"
                  style={{
                    padding: '12px 16px',
                    marginBottom: 8,
                    cursor: 'pointer',
                    border: selectedId === a.id ? '1.5px solid var(--accent)' : '1.5px solid transparent',
                  }}
                  onClick={() => setSelectedId(a.id)}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.assembly_number}</div>
                  {a.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{a.description}</div>
                  )}
                  <div style={{ marginTop: 6, fontWeight: 700, color: 'var(--success)', fontSize: 14 }}>
                    {a.currency}{' '}
                    {Number(a.total_should_cost ?? 0).toLocaleString('en-GB', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedId === null ? (
            <div className="card" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Select an assembly from the left panel</div>
            </div>
          ) : detailLoading ? (
            <div className="loading">Loading assembly…</div>
          ) : detail ? (
            <>
              {/* Header card */}
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{detail.header.assembly_number}</h2>
                    {detail.header.description && (
                      <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{detail.header.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, display: 'flex', gap: 16 }}>
                      <span>Currency: <strong style={{ color: 'var(--text-2)' }}>{detail.header.currency}</strong></span>
                      {detail.header.program_id && (
                        <span>Program ID: <strong style={{ color: 'var(--text-2)' }}>{detail.header.program_id}</strong></span>
                      )}
                    </div>
                    {detail.header.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{detail.header.notes}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleDeleteAssembly}
                      style={{ color: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Total cost tile */}
              <div style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--accent)',
                borderRadius: 10,
                padding: '16px 24px',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Total Should-Cost</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)' }}>
                  {detail.header.currency}{' '}
                  {Number(detail.assembly_total_cost).toLocaleString('en-GB', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              {/* Color bar */}
              {detail.lines.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    height: 20,
                    borderRadius: 6,
                    overflow: 'hidden',
                    display: 'flex',
                    marginBottom: 8,
                  }}>
                    {detail.lines.map((line, i) => (
                      <div
                        key={line.id}
                        style={{
                          flex: line.extended_cost,
                          background: COLORS[i % COLORS.length],
                          minWidth: 2,
                        }}
                        title={line.part_number}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {detail.lines.map((line, i) => {
                      const pct = detail.assembly_total_cost > 0
                        ? (line.extended_cost / detail.assembly_total_cost * 100).toFixed(1)
                        : '0.0';
                      return (
                        <div key={line.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-2)' }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                          <span>{line.part_number}</span>
                          <span style={{ color: 'var(--text-3)' }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BOM table card */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>BOM Lines</div>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowAddPartModal(true)}>＋ Add Part</button>
                </div>
                {detail.lines.length === 0 ? (
                  <div className="empty" style={{ padding: 32, textAlign: 'center', fontSize: 13 }}>
                    No lines yet. Click <strong>＋ Add Part</strong> to add components.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          <th style={{ padding: '11px 14px', textAlign: 'left' }}>Part Number</th>
                          <th style={{ padding: '11px 14px', textAlign: 'left' }}>Description</th>
                          <th style={{ padding: '11px 14px', textAlign: 'left' }}>Version</th>
                          <th style={{ padding: '11px 14px', textAlign: 'right' }}>Qty</th>
                          <th style={{ padding: '11px 14px', textAlign: 'right' }}>Unit Cost</th>
                          <th style={{ padding: '11px 14px', textAlign: 'right' }}>Extended Cost</th>
                          <th style={{ padding: '11px 14px', textAlign: 'right' }}>% of Total</th>
                          <th style={{ padding: '11px 14px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line) => {
                          const pct = detail.assembly_total_cost > 0
                            ? (line.extended_cost / detail.assembly_total_cost * 100).toFixed(1) + '%'
                            : '0.0%';
                          return (
                            <tr key={line.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 700 }}>{line.part_number}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{line.part_description ?? '—'}</td>
                              <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>{line.version ?? '—'}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>{line.quantity}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-2)' }}>
                                {detail.header.currency} {Number(line.unit_cost).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                                {detail.header.currency} {Number(line.extended_cost).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-3)' }}>{pct}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => handleRemoveLine(line.id)}
                                  style={{ color: 'var(--danger)' }}
                                  title="Remove line"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Create Assembly Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>New Assembly</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateAssembly} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div>
                <label className="form-label">Assembly Number *</label>
                <input
                  className="form-control"
                  type="text"
                  value={createForm.assembly_number}
                  onChange={(e) => setCreateForm({ ...createForm, assembly_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="form-label">Description</label>
                <input
                  className="form-control"
                  type="text"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
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

      {/* Add Part Modal */}
      {showAddPartModal && (
        <div className="modal-backdrop" onClick={() => setShowAddPartModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Add Part to BOM</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddPartModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddLine} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div>
                <label className="form-label">Should-Cost / Part *</label>
                <select
                  className="form-control"
                  value={addForm.sc_id}
                  onChange={(e) => setAddForm({ ...addForm, sc_id: e.target.value })}
                  required
                >
                  <option value="">Select a should-cost…</option>
                  {publishedSCs.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.part_number} — {sc.description ?? ''} ({sc.currency} {Number(sc.total_cost ?? 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Quantity *</label>
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  value={addForm.quantity}
                  onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddPartModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Part</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
