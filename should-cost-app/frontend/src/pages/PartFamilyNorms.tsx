import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';

interface CommodityNorm {
  commodity: string;
  count: number;
  avg_total: number;
  min_total: number;
  max_total: number;
  avg_cost_per_kg: number;
}

interface DrillDownPart {
  part_number: string;
  version: number;
  status: string;
  total_cost: number;
  weight_kg?: number;
  cost_per_kg?: number;
}

export default function PartFamilyNorms() {
  const [norms, setNorms]                   = useState<CommodityNorm[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null);
  const [drillDown, setDrillDown]           = useState<DrillDownPart[]>([]);
  const [loadingDrill, setLoadingDrill]     = useState(false);

  useEffect(() => {
    api.get<CommodityNorm[]>('/should-cost/norms')
      .then((r) => setNorms(r.data))
      .catch(() => setError('Could not load norms. Ensure the backend is running.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCommodity) return;
    setLoadingDrill(true);
    setDrillDown([]);
    api.get<DrillDownPart[]>(`/should-cost/norms/${encodeURIComponent(selectedCommodity)}`)
      .then((r) => setDrillDown(r.data))
      .catch(() => setDrillDown([]))
      .finally(() => setLoadingDrill(false));
  }, [selectedCommodity]);

  const totalPublished = norms.reduce((acc, n) => acc + n.count, 0);
  const withWeightCount = norms.filter((n) => n.avg_cost_per_kg > 0).length;

  const sortedDrill = [...drillDown].sort((a, b) => {
    if (!a.cost_per_kg && !b.cost_per_kg) return 0;
    if (!a.cost_per_kg) return 1;
    if (!b.cost_per_kg) return -1;
    return a.cost_per_kg - b.cost_per_kg;
  });

  const chartData = norms.map((n) => ({
    name: n.commodity,
    'Avg Total': Number(n.avg_total),
    'Min Total': Number(n.min_total),
    'Max Total': Number(n.max_total),
  }));

  if (loading) return <div className="loading">Loading part family norms…</div>;

  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Failed to load norms</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{error}</div>
    </div>
  );

  if (norms.length === 0) return (
    <div>
      <div className="page-header">
        <div>
          <h1>📐 Part Family Cost Norms</h1>
          <p className="sub">Average should-cost benchmarks by commodity family (published only)</p>
        </div>
      </div>
      <div className="card empty" style={{ padding: 48, textAlign: 'center' }}>
        No published should-costs found. Publish should-costs to build norms.
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>📐 Part Family Cost Norms</h1>
          <p className="sub">Average should-cost benchmarks by commodity family (published only)</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row" style={{ marginBottom: 16 }}>
        <div className="stat-tile">
          <div className="label">Total Commodities</div>
          <div className="value">{norms.length}</div>
          <div className="sub">commodity families</div>
        </div>
        <div className="stat-tile">
          <div className="label">Total Published SCs</div>
          <div className="value">{totalPublished}</div>
          <div className="sub">published should-costs</div>
        </div>
        <div className="stat-tile">
          <div className="label">Parts with Weight Data</div>
          <div className="value">{withWeightCount}</div>
          <div className="sub">commodities with $/kg</div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Cost Range by Commodity</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="Avg Total" fill="var(--accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Norms table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
          Norms by Commodity — click a row to drill down
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left' }}>Commodity</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Parts</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Min</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Avg</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Max</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Avg $/kg</th>
                <th style={{ padding: '10px 16px', textAlign: 'right' }}>Spread %</th>
              </tr>
            </thead>
            <tbody>
              {norms.map((n) => {
                const spread = n.avg_total > 0
                  ? ((n.max_total - n.min_total) / n.avg_total * 100).toFixed(1)
                  : '—';
                const isSelected = selectedCommodity === n.commodity;
                return (
                  <tr
                    key={n.commodity}
                    style={{
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                      background: isSelected ? 'var(--surface)' : undefined,
                    }}
                    onClick={() => setSelectedCommodity(isSelected ? null : n.commodity)}
                  >
                    <td style={{ padding: '10px 16px', fontWeight: 700 }}>{n.commodity}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{n.count}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(n.min_total).toFixed(2)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                      {Number(n.avg_total).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(n.max_total).toFixed(2)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-3)' }}>
                      {n.avg_cost_per_kg > 0 ? Number(n.avg_cost_per_kg).toFixed(4) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{spread}{typeof spread === 'string' ? '' : '%'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down panel */}
      {selectedCommodity && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
            Parts in "{selectedCommodity}"
          </div>
          {loadingDrill ? (
            <div className="loading" style={{ padding: 24 }}>Loading parts…</div>
          ) : sortedDrill.length === 0 ? (
            <div className="empty" style={{ padding: 24, textAlign: 'center' }}>No parts found for this commodity.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Part Number</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Version</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Total Cost</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Weight (kg)</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Cost/kg</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDrill.map((p, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 700 }}>{p.part_number}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>v{p.version}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              p.status === 'published'
                                ? '#dcfce7'
                                : p.status === 'archived'
                                ? '#f3f4f6'
                                : '#fef9c3',
                            color:
                              p.status === 'published'
                                ? 'var(--success)'
                                : p.status === 'archived'
                                ? 'var(--text-3)'
                                : 'var(--warning)',
                          }}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(p.total_cost).toFixed(4)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-3)' }}>
                        {p.weight_kg != null ? Number(p.weight_kg).toFixed(3) : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-3)' }}>
                        {p.cost_per_kg != null ? Number(p.cost_per_kg).toFixed(4) : '—'}
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
  );
}
