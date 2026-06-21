import { useEffect, useState } from 'react';
import api from '../utils/api';

interface AccuracyLog {
  id: number;
  process_type: string;
  country: string;
  part_weight_kg?: number;
  material_name?: string;
  estimated_total: number;
  actual_settled?: number;
  error_pct?: number;
  notes?: string;
  part_number?: string;
  created_at: string;
}

interface AccuracySummary {
  total_logged: number;
  with_actuals: number;
  avg_error_pct?: number;
  avg_abs_error_pct?: number;
}

function errorColor(absVal: number): string {
  if (absVal < 10) return 'var(--success)';
  if (absVal < 20) return 'var(--warning)';
  return 'var(--danger)';
}

export default function CERAccuracyTracker() {
  const [logs, setLogs]               = useState<AccuracyLog[]>([]);
  const [summary, setSummary]         = useState<AccuracySummary | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [filterProcess, setFilterProcess] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editActual, setEditActual]   = useState('');
  const [editNotes, setEditNotes]     = useState('');
  const [savingActual, setSavingActual] = useState(false);

  const fetchAll = async () => {
    setError(null);
    try {
      const [logsRes, summaryRes] = await Promise.all([
        api.get<AccuracyLog[]>('/cer/accuracy'),
        api.get<AccuracySummary>('/cer/accuracy/summary'),
      ]);
      setLogs(logsRes.data);
      setSummary(summaryRes.data);
    } catch {
      setError('Could not load accuracy logs. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const processTypes = Array.from(new Set(logs.map((l) => l.process_type))).sort();
  const countries    = Array.from(new Set(logs.map((l) => l.country))).sort();

  const filtered = logs.filter((l) => {
    if (filterProcess && l.process_type !== filterProcess) return false;
    if (filterCountry && l.country !== filterCountry) return false;
    return true;
  });

  const enterActual = (id: number) => {
    const log = logs.find((l) => l.id === id);
    setEditingId(id);
    setEditActual(log?.actual_settled != null ? String(log.actual_settled) : '');
    setEditNotes(log?.notes ?? '');
  };

  const submitActual = async () => {
    if (!editingId) return;
    setSavingActual(true);
    try {
      await api.patch(`/cer/accuracy/${editingId}/actual`, {
        actual_settled: parseFloat(editActual),
        notes: editNotes,
      });
      setEditingId(null);
      await fetchAll();
    } catch {
      // keep editing open on failure
    } finally {
      setSavingActual(false);
    }
  };

  if (loading) return <div className="loading">Loading accuracy logs…</div>;

  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Failed to load</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => { setLoading(true); fetchAll(); }}>Retry</button>
    </div>
  );

  const avgErrAbs   = summary?.avg_error_pct != null ? Math.abs(summary.avg_error_pct) : null;
  const avgAbsErrAbs = summary?.avg_abs_error_pct != null ? Math.abs(summary.avg_abs_error_pct) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>📈 CER Accuracy Tracker</h1>
          <p className="sub">Track parametric estimate accuracy against settled prices</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row" style={{ marginBottom: 16 }}>
        <div className="stat-tile">
          <div className="label">Total Logged</div>
          <div className="value">{summary?.total_logged ?? 0}</div>
          <div className="sub">estimates logged</div>
        </div>
        <div className="stat-tile">
          <div className="label">With Actuals</div>
          <div className="value">{summary?.with_actuals ?? 0}</div>
          <div className="sub">have settled prices</div>
        </div>
        <div className="stat-tile">
          <div className="label">Avg Error %</div>
          <div
            className="value"
            style={{
              color: avgErrAbs != null ? errorColor(avgErrAbs) : undefined,
            }}
          >
            {summary?.avg_error_pct != null
              ? `${summary.avg_error_pct >= 0 ? '+' : ''}${Number(summary.avg_error_pct).toFixed(1)}%`
              : '—'}
          </div>
          <div className="sub">signed average</div>
        </div>
        <div className="stat-tile">
          <div className="label">Avg Abs Error %</div>
          <div
            className="value"
            style={{
              color: avgAbsErrAbs != null ? errorColor(avgAbsErrAbs) : undefined,
            }}
          >
            {summary?.avg_abs_error_pct != null
              ? `${Number(summary.avg_abs_error_pct).toFixed(1)}%`
              : '—'}
          </div>
          <div className="sub">absolute average</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Process Type</label>
          <select
            className="form-control"
            style={{ minWidth: 160 }}
            value={filterProcess}
            onChange={(e) => setFilterProcess(e.target.value)}
          >
            <option value="">All</option>
            {processTypes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Country</label>
          <select
            className="form-control"
            style={{ minWidth: 160 }}
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
          >
            <option value="">All</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(filterProcess || filterCountry) && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { setFilterProcess(''); setFilterCountry(''); }}
          >
            Clear filters
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          Showing {filtered.length} of {logs.length}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: 48, textAlign: 'center' }}>
            No estimates logged yet. Use the Cost Estimator and click &apos;Log Estimate&apos; to track accuracy.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Part</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Process</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Country</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Weight (kg)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Estimated</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actual Settled</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Error %</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const absErr = log.error_pct != null ? Math.abs(log.error_pct) : null;
                  const isEditing = editingId === log.id;
                  return (
                    <>
                      <tr key={log.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {log.part_number ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                          {log.material_name && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{log.material_name}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>{log.process_type}</td>
                        <td style={{ padding: '10px 14px' }}>{log.country}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-3)' }}>
                          {log.part_weight_kg != null ? Number(log.part_weight_kg).toFixed(3) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                          {Number(log.estimated_total).toFixed(4)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {log.actual_settled != null ? Number(log.actual_settled).toFixed(4) : (
                            <span style={{ color: 'var(--text-3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {log.error_pct != null && absErr != null ? (
                            <span style={{ fontWeight: 700, color: errorColor(absErr) }}>
                              {log.error_pct >= 0 ? '+' : ''}{Number(log.error_pct).toFixed(1)}%
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                          {new Date(log.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {log.actual_settled == null && !isEditing && (
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => enterActual(log.id)}
                            >
                              Enter Actual
                            </button>
                          )}
                          {isEditing && (
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>

                      {isEditing && (
                        <tr key={`edit-${log.id}`} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                          <td colSpan={9} style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div>
                                <label className="form-label">Actual Settled Price *</label>
                                <input
                                  className="form-control"
                                  type="number"
                                  step="0.0001"
                                  value={editActual}
                                  onChange={(e) => setEditActual(e.target.value)}
                                  placeholder="e.g. 12.3456"
                                  style={{ width: 160 }}
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <label className="form-label">Notes</label>
                                <input
                                  className="form-control"
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  placeholder="Optional context…"
                                />
                              </div>
                              <button
                                className="btn btn-primary"
                                disabled={!editActual || savingActual}
                                onClick={submitActual}
                              >
                                {savingActual ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
