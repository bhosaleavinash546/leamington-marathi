import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { ComparisonSnapshot, ComparisonFull } from '../types';
import BarChart from './BarChart';
import WaterfallChart from './WaterfallChart';
import AIInsightsPanel from './AIInsightsPanel';

export default function ComparisonView() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [list, setList]           = useState<ComparisonSnapshot[]>([]);
  const [detail, setDetail]       = useState<ComparisonFull | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Load list
  useEffect(() => {
    api.get<ComparisonSnapshot[]>('/comparisons')
      .then((r) => setList(r.data))
      .finally(() => setLoadingList(false));
  }, []);

  // Load detail when id changes
  useEffect(() => {
    if (!id) { setDetail(null); return; }
    setLoadingDetail(true);
    api.get<ComparisonFull>(`/comparisons/${id}`)
      .then((r) => setDetail(r.data))
      .finally(() => setLoadingDetail(false));
  }, [id]);

  const handleGenerateAI = async () => {
    if (!detail) return;
    setAiLoading(true);
    try {
      await api.post('/ai/insights', { snapshotId: detail.snapshot.id });
      // Reload to pick up the new insight
      const r = await api.get<ComparisonFull>(`/comparisons/${detail.snapshot.id}`);
      setDetail(r.data);
    } finally {
      setAiLoading(false);
    }
  };

  if (loadingList) return <div className="loading">Loading…</div>;

  if (!id) {
    // List view
    return (
      <div>
        <div className="page-header"><h1>Comparisons</h1></div>
        {list.length === 0 ? (
          <div className="card">
            <div className="empty" style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ marginBottom: 12 }}>No saved comparison snapshots yet.</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                Want to compare the same part across different vehicle models and let AI find the cost gap?
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/cross-model')}>
                🌐 Open Cross-Model Comparison →
              </button>
            </div>
          </div>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Snapshot</th>
                  <th>Supplier</th>
                  <th>Should-Cost</th>
                  <th>Quote</th>
                  <th>Variance</th>
                  <th>Var %</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.part_number}</strong></td>
                    <td>{c.snapshot_name ?? `#${c.id}`}</td>
                    <td>{c.supplier_name}</td>
                    <td>{c.total_should_cost?.toFixed(2) ?? '—'}</td>
                    <td>{c.total_quote_price?.toFixed(2) ?? '—'}</td>
                    <td className={(c.total_variance ?? 0) > 0 ? 'variance-positive' : 'variance-negative'}>
                      {(c.total_variance ?? 0) > 0 ? '+' : ''}{c.total_variance?.toFixed(2) ?? '—'}
                    </td>
                    <td className={(c.variance_pct ?? 0) > 0 ? 'variance-positive' : 'variance-negative'}>
                      {(c.variance_pct ?? 0) > 0 ? '+' : ''}{c.variance_pct?.toFixed(1) ?? '—'}%
                    </td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/comparisons/${c.id}`)}>
                        Analyse
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Detail view
  if (loadingDetail) return <div className="loading">Loading comparison…</div>;
  if (!detail)       return <div className="empty">Comparison not found.</div>;

  const { snapshot, details, latestInsight } = detail;

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/comparisons')} style={{ marginBottom: 8 }}>
            ← Back
          </button>
          <h1>{snapshot.snapshot_name ?? `Comparison #${snapshot.id}`}</h1>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            {snapshot.part_number} · {snapshot.supplier_name}
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleGenerateAI} disabled={aiLoading}>
          {aiLoading ? 'Running AI…' : 'Generate AI Insight'}
        </button>
      </div>

      {/* KPI row */}
      <div className="stats-row">
        <div className="stat-tile">
          <div className="label">Should-Cost Total</div>
          <div className="value">{snapshot.total_should_cost?.toFixed(2) ?? '—'}</div>
          <div className="sub">{snapshot.currency ?? 'USD'}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Quote Total</div>
          <div className="value">{snapshot.total_quote_price?.toFixed(2) ?? '—'}</div>
          <div className="sub">{snapshot.currency ?? 'USD'}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Variance</div>
          <div className="value" style={{ color: (snapshot.total_variance ?? 0) > 0 ? '#ef4444' : '#16a34a' }}>
            {(snapshot.total_variance ?? 0) > 0 ? '+' : ''}{snapshot.total_variance?.toFixed(2) ?? '—'}
          </div>
          <div className="sub">{snapshot.variance_pct?.toFixed(1) ?? '0'}% vs target</div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <h3>Should-Cost vs Quote by Element</h3>
          <BarChart details={details} />
        </div>
        <div className="card">
          <h3>Variance Waterfall</h3>
          <WaterfallChart details={details} />
        </div>
      </div>

      {/* Detail table */}
      <div className="card">
        <h2>Cost Element Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Cost Element</th>
              <th>Category</th>
              <th>Should-Cost</th>
              <th>Quote</th>
              <th>Variance</th>
              <th>Var %</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.cost_element}</strong></td>
                <td>{d.category ?? '—'}</td>
                <td>{Number(d.should_cost_value).toFixed(2)}</td>
                <td>{Number(d.quote_value).toFixed(2)}</td>
                <td className={Number(d.variance) > 0 ? 'variance-positive' : 'variance-negative'}>
                  {Number(d.variance) > 0 ? '+' : ''}{Number(d.variance).toFixed(2)}
                </td>
                <td className={(d.variance_pct ?? 0) > 0 ? 'variance-positive' : 'variance-negative'}>
                  {(d.variance_pct ?? 0) > 0 ? '+' : ''}{d.variance_pct?.toFixed(1) ?? '—'}%
                </td>
                <td>
                  {d.flag && (
                    <span className={`badge badge-${d.flag}`}>{d.flag}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI Insights */}
      {latestInsight && (
        <AIInsightsPanel insight={latestInsight} />
      )}
    </div>
  );
}
