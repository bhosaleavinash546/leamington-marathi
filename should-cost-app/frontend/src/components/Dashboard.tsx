import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { ShouldCostHeader, SupplierQuoteHeader, ComparisonSnapshot, AuthUser } from '../types';

interface Props { user: AuthUser; }

export default function Dashboard({ user }: Props) {
  const [shouldCosts, setShouldCosts]   = useState<ShouldCostHeader[]>([]);
  const [quotes, setQuotes]             = useState<SupplierQuoteHeader[]>([]);
  const [comparisons, setComparisons]   = useState<ComparisonSnapshot[]>([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ShouldCostHeader[]>('/should-cost'),
      api.get<SupplierQuoteHeader[]>('/quotes'),
      api.get<ComparisonSnapshot[]>('/comparisons'),
    ]).then(([sc, q, c]) => {
      setShouldCosts(sc.data);
      setQuotes(q.data);
      setComparisons(c.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading dashboard…</div>;

  const openComparisons = comparisons.filter((c) => c.status === 'open');
  const highVarCount    = comparisons.filter((c) => Math.abs(c.variance_pct ?? 0) > 10).length;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span style={{ color: '#888', fontSize: 13 }}>Welcome, {user.fullName}</span>
      </div>

      {/* KPI tiles */}
      <div className="stats-row">
        <div className="stat-tile">
          <div className="label">Should-Costs</div>
          <div className="value">{shouldCosts.length}</div>
          <div className="sub">{shouldCosts.filter((s) => s.status === 'published').length} published</div>
        </div>
        <div className="stat-tile">
          <div className="label">Supplier Quotes</div>
          <div className="value">{quotes.length}</div>
          <div className="sub">{quotes.filter((q) => q.status === 'submitted').length} pending review</div>
        </div>
        <div className="stat-tile">
          <div className="label">Comparisons</div>
          <div className="value">{comparisons.length}</div>
          <div className="sub">{openComparisons.length} open</div>
        </div>
        <div className="stat-tile">
          <div className="label">High Variance</div>
          <div className="value" style={{ color: highVarCount > 0 ? '#ef4444' : '#16a34a' }}>{highVarCount}</div>
          <div className="sub">snapshots &gt;10% off target</div>
        </div>
      </div>

      {/* Recent comparisons */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Recent Comparisons</h2>
          <Link to="/comparisons" className="btn btn-secondary btn-sm">View all</Link>
        </div>
        {comparisons.length === 0 ? (
          <div className="empty">No comparisons yet. Create one from the Comparisons page.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Supplier</th>
                <th>Should-Cost</th>
                <th>Quote Price</th>
                <th>Variance</th>
                <th>Var %</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {comparisons.slice(0, 8).map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.part_number}</strong></td>
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
                  <td><Link to={`/comparisons/${c.id}`} className="btn btn-secondary btn-sm">Details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Should-Cost list */}
      <div className="card">
        <h2>Should-Cost Records</h2>
        {shouldCosts.length === 0 ? (
          <div className="empty">No should-cost records found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Version</th>
                <th>Total Cost</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {shouldCosts.map((sc) => (
                <tr key={sc.id}>
                  <td><strong>{sc.part_number}</strong><br /><small style={{ color: '#888' }}>{sc.part_description}</small></td>
                  <td>v{sc.version}</td>
                  <td>{sc.total_cost?.toFixed(2) ?? '—'}</td>
                  <td>{sc.currency}</td>
                  <td><span className={`badge badge-${sc.status}`}>{sc.status}</span></td>
                  <td>{new Date(sc.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
