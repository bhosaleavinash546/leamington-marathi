import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api';

interface PartLite { id: number; part_number: string; part_description?: string; }
interface VersionSummary { id: number; version: number; status: string; total_cost: number; created_at: string; }
interface DiffLine { cost_element: string; category: string; v1_value: number; v2_value: number; delta: number; delta_pct: number; }
interface DiffResult {
  v1: { header: Record<string, unknown>; breakdown: Array<{ cost_element: string; category: string; value: number; basis?: string }> };
  v2: { header: Record<string, unknown>; breakdown: Array<{ cost_element: string; category: string; value: number; basis?: string }> };
  diff: DiffLine[];
  summary: { v1_total: number; v2_total: number; total_delta: number; total_delta_pct: number };
}

export default function ShouldCostVersionDiff() {
  const [parts, setParts]                   = useState<PartLite[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [versions, setVersions]             = useState<VersionSummary[]>([]);
  const [v1Id, setV1Id]                     = useState<number | null>(null);
  const [v2Id, setV2Id]                     = useState<number | null>(null);
  const [diffResult, setDiffResult]         = useState<DiffResult | null>(null);
  const [loading, setLoading]               = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingDiff, setLoadingDiff]       = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [versionsError, setVersionsError]   = useState<string | null>(null);

  useEffect(() => {
    api.get<PartLite[]>('/parts')
      .then((r) => setParts(r.data))
      .catch(() => setParts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPartId === null) return;
    setLoadingVersions(true);
    setVersionsError(null);
    setVersions([]);
    setV1Id(null);
    setV2Id(null);
    setDiffResult(null);
    api.get<VersionSummary[]>(`/should-cost/versions/${selectedPartId}`)
      .then((r) => setVersions(r.data))
      .catch(() => setVersionsError('Could not load versions for this part.'))
      .finally(() => setLoadingVersions(false));
  }, [selectedPartId]);

  const runDiff = async () => {
    if (!selectedPartId || !v1Id || !v2Id || v1Id === v2Id) return;
    setError(null);
    setLoadingDiff(true);
    try {
      const r = await api.get<DiffResult>('/should-cost/diff', {
        params: { partId: selectedPartId, v1: v1Id, v2: v2Id },
      });
      setDiffResult(r.data);
    } catch {
      setError('Failed to load diff. Check that both versions exist and the backend is running.');
    } finally {
      setLoadingDiff(false);
    }
  };

  const sortedDiff = diffResult
    ? [...diffResult.diff].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];

  const chartData = sortedDiff.map((d) => ({
    name: d.cost_element,
    V1: Number(d.v1_value),
    V2: Number(d.v2_value),
  }));

  if (loading) return <div className="loading">Loading parts…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>📊 Version Comparison</h1>
          <p className="sub">Compare two versions of a should-cost side by side</p>
        </div>
      </div>

      {/* Selector card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label className="form-label">Part</label>
            <select
              className="form-control"
              value={selectedPartId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedPartId(val ? Number(val) : null);
              }}
            >
              <option value="">Select a part…</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>{p.part_number}</option>
              ))}
            </select>
          </div>

          {loadingVersions && (
            <div style={{ fontSize: 13, color: 'var(--text-3)', alignSelf: 'center' }}>Loading versions…</div>
          )}

          {!loadingVersions && selectedPartId !== null && versions.length >= 2 && (
            <>
              <div style={{ flex: '1 1 180px' }}>
                <label className="form-label">Version A</label>
                <select
                  className="form-control"
                  value={v1Id ?? ''}
                  onChange={(e) => setV1Id(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select version…</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>v{v.version} — {v.status} ({Number(v.total_cost).toFixed(2)})</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label className="form-label">Version B</label>
                <select
                  className="form-control"
                  value={v2Id ?? ''}
                  onChange={(e) => setV2Id(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select version…</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>v{v.version} — {v.status} ({Number(v.total_cost).toFixed(2)})</option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary"
                disabled={!v1Id || !v2Id || v1Id === v2Id || loadingDiff}
                onClick={runDiff}
                style={{ alignSelf: 'flex-end' }}
              >
                {loadingDiff ? 'Comparing…' : 'Compare'}
              </button>
            </>
          )}

          {!loadingVersions && selectedPartId !== null && versions.length < 2 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)', alignSelf: 'center' }}>
              Not enough versions (need at least 2)
            </div>
          )}
        </div>

        {versionsError && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>{versionsError}</div>
        )}
      </div>

      {loadingDiff && <div className="loading">Loading diff…</div>}

      {error && (
        <div className="card" style={{ padding: '16px 20px', border: '1px solid var(--danger)', color: 'var(--danger)', fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!diffResult && !loadingDiff && parts.length === 0 && (
        <div className="card empty" style={{ padding: 48, textAlign: 'center' }}>
          No parts found. Add parts to get started.
        </div>
      )}

      {diffResult && !loadingDiff && (
        <>
          {/* Summary banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'V1 Total', value: `${Number(diffResult.summary.v1_total).toFixed(2)}`, colored: false },
              { label: 'V2 Total', value: `${Number(diffResult.summary.v2_total).toFixed(2)}`, colored: false },
              {
                label: 'Delta (abs)',
                value: `${diffResult.summary.total_delta >= 0 ? '+' : ''}${Number(diffResult.summary.total_delta).toFixed(2)}`,
                colored: true,
                positive: diffResult.summary.total_delta > 0,
              },
              {
                label: 'Delta %',
                value: `${diffResult.summary.total_delta_pct >= 0 ? '+' : ''}${Number(diffResult.summary.total_delta_pct).toFixed(2)}%`,
                colored: true,
                positive: diffResult.summary.total_delta_pct > 0,
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className="card"
                style={{ margin: 0, textAlign: 'center', padding: '16px 20px' }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  {tile.label}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: tile.colored
                      ? tile.positive ? 'var(--danger)' : 'var(--success)'
                      : 'var(--text-1)',
                  }}
                >
                  {tile.value}
                </div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          {chartData.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Cost Element Comparison</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="V1" fill="#2563eb" name="Version A" />
                  <Bar dataKey="V2" fill="#f59e0b" name="Version B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Diff table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '14px 20px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
              Line-by-Line Diff
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Cost Element</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>V1 Value</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>V2 Value</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Change</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Change %</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDiff.map((d, i) => {
                    const rowBg = d.delta < 0 ? '#dcfce720' : d.delta > 0 ? '#fee2e220' : undefined;
                    return (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)', background: rowBg }}>
                        <td style={{ padding: '9px 16px', fontWeight: 600 }}>{d.cost_element}</td>
                        <td style={{ padding: '9px 16px', color: 'var(--text-3)' }}>{d.category}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right' }}>{Number(d.v1_value).toFixed(2)}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right' }}>{Number(d.v2_value).toFixed(2)}</td>
                        <td
                          style={{
                            padding: '9px 16px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: d.delta > 0 ? 'var(--danger)' : d.delta < 0 ? 'var(--success)' : 'var(--text-3)',
                          }}
                        >
                          {d.delta > 0 ? '▲' : d.delta < 0 ? '▼' : '—'}{' '}
                          {d.delta !== 0 ? Math.abs(Number(d.delta)).toFixed(2) : '0.00'}
                        </td>
                        <td
                          style={{
                            padding: '9px 16px',
                            textAlign: 'right',
                            color: d.delta_pct > 0 ? 'var(--danger)' : d.delta_pct < 0 ? 'var(--success)' : 'var(--text-3)',
                          }}
                        >
                          {d.delta_pct !== 0 ? `${d.delta_pct >= 0 ? '+' : ''}${Number(d.delta_pct).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)', fontWeight: 700 }}>
                    <td style={{ padding: '12px 16px' }}>Total</td>
                    <td />
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{Number(diffResult.summary.v1_total).toFixed(2)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{Number(diffResult.summary.v2_total).toFixed(2)}</td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        color: diffResult.summary.total_delta > 0 ? 'var(--danger)' : diffResult.summary.total_delta < 0 ? 'var(--success)' : undefined,
                      }}
                    >
                      {diffResult.summary.total_delta >= 0 ? '+' : ''}{Number(diffResult.summary.total_delta).toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        color: diffResult.summary.total_delta_pct > 0 ? 'var(--danger)' : diffResult.summary.total_delta_pct < 0 ? 'var(--success)' : undefined,
                      }}
                    >
                      {diffResult.summary.total_delta_pct >= 0 ? '+' : ''}{Number(diffResult.summary.total_delta_pct).toFixed(1)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Two-column breakdown detail */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { label: 'V1 Breakdown', data: diffResult.v1.breakdown },
              { label: 'V2 Breakdown', data: diffResult.v2.breakdown },
            ].map((side) => (
              <div key={side.label} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  {side.label}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Cost Element</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Category</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Value</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {side.data.map((b, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 12px', fontWeight: 600 }}>{b.cost_element}</td>
                          <td style={{ padding: '7px 12px', color: 'var(--text-3)' }}>{b.category}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right' }}>{Number(b.value).toFixed(4)}</td>
                          <td style={{ padding: '7px 12px', color: 'var(--text-3)' }}>{b.basis ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
