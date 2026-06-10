import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { ShouldCostHeader, SupplierQuoteHeader, ComparisonSnapshot, AuthUser } from '../types';
import VehicleHierarchyFilter, { VehicleFilter } from './VehicleHierarchyFilter';

interface Props { user: AuthUser; }

export default function Dashboard({ user }: Props) {
  const [shouldCosts, setShouldCosts]   = useState<ShouldCostHeader[]>([]);
  const [quotes, setQuotes]             = useState<SupplierQuoteHeader[]>([]);
  const [comparisons, setComparisons]   = useState<ComparisonSnapshot[]>([]);
  const [parts, setParts]               = useState<ShouldCostHeader[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<VehicleFilter>({});

  useEffect(() => {
    Promise.all([
      api.get<ShouldCostHeader[]>('/should-cost'),
      api.get<SupplierQuoteHeader[]>('/quotes'),
      api.get<ComparisonSnapshot[]>('/comparisons'),
    ]).then(([sc, q, c]) => {
      setShouldCosts(sc.data);
      setQuotes(q.data);
      setComparisons(c.data);
      setParts(sc.data);
    }).finally(() => setLoading(false));
  }, []);

  // When filter changes, reload SC records filtered by vehicle hierarchy
  useEffect(() => {
    if (!filter.systemId && !filter.subsystemId && !filter.componentId) {
      setParts(shouldCosts);
      return;
    }
    const params = new URLSearchParams();
    if (filter.systemId)    params.set('systemId',    String(filter.systemId));
    if (filter.subsystemId) params.set('subsystemId', String(filter.subsystemId));
    if (filter.componentId) params.set('componentId', String(filter.componentId));

    api.get<ShouldCostHeader[]>(`/vehicle/parts?${params}`)
      .then((r) => {
        const ids = new Set(r.data.map((p: { id: number }) => p.id));
        setParts(shouldCosts.filter((sc) => ids.has(sc.part_id)));
      });
  }, [filter, shouldCosts]);

  if (loading) return <div className="loading-screen"><span className="spinner" />Loading dashboard…</div>;

  const openComparisons = comparisons.filter((c) => c.status === 'open');
  const highVarCount    = comparisons.filter((c) => Math.abs(c.variance_pct ?? 0) > 10).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Welcome back, {user.fullName}</div>
        </div>
        <Link to="/multi-comparison" className="btn btn-primary">
          ＋ Multi-Supplier Compare
        </Link>
      </div>

      {/* KPI tiles */}
      <div className="stats-row">
        <div className="stat-tile">
          <div className="st-icon">🏗</div>
          <div className="st-label">Should-Costs</div>
          <div className="st-value">{shouldCosts.length}</div>
          <div className="st-sub">{shouldCosts.filter((s) => s.status === 'published').length} published</div>
        </div>
        <div className="stat-tile">
          <div className="st-icon">📄</div>
          <div className="st-label">Supplier Quotes</div>
          <div className="st-value">{quotes.length}</div>
          <div className="st-sub">{quotes.filter((q) => q.status === 'submitted').length} pending review</div>
        </div>
        <div className="stat-tile">
          <div className="st-icon">🔍</div>
          <div className="st-label">Comparisons</div>
          <div className="st-value">{comparisons.length}</div>
          <div className="st-sub">{openComparisons.length} open</div>
        </div>
        <div className="stat-tile">
          <div className="st-icon">⚠️</div>
          <div className="st-label">High Variance</div>
          <div className="st-value" style={{ color: highVarCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {highVarCount}
          </div>
          <div className="st-sub">snapshots &gt;10% off target</div>
        </div>
      </div>

      {/* Hierarchy filter */}
      <VehicleHierarchyFilter onChange={setFilter} />

      {/* Recent comparisons */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Recent Comparisons</div>
          <Link to="/comparisons" className="btn btn-secondary btn-sm">View all →</Link>
        </div>
        {comparisons.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📊</div><p>No comparisons yet.</p></div>
        ) : (
          <div className="table-wrap">
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
                    <td className={(c.total_variance ?? 0) > 0 ? 'pos' : 'neg'}>
                      {(c.total_variance ?? 0) > 0 ? '+' : ''}{c.total_variance?.toFixed(2) ?? '—'}
                    </td>
                    <td className={(c.variance_pct ?? 0) > 0 ? 'pos' : 'neg'}>
                      {(c.variance_pct ?? 0) > 0 ? '+' : ''}{c.variance_pct?.toFixed(1) ?? '—'}%
                    </td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td>
                      <Link to={`/comparisons/${c.id}`} className="btn btn-secondary btn-sm">Details</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Should-Cost filtered list */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Should-Cost Records
            {(filter.systemId || filter.subsystemId || filter.componentId) && (
              <span className="badge badge-submitted" style={{ marginLeft: 10, fontSize: 11 }}>Filtered</span>
            )}
          </div>
        </div>
        {parts.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">🔍</div><p>No records match the current filter.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Part Number</th>
                  <th>Description</th>
                  <th>Version</th>
                  <th>Total Cost</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((sc) => (
                  <tr key={sc.id}>
                    <td><strong>{sc.part_number}</strong></td>
                    <td style={{ color: 'var(--text-2)' }}>{sc.part_description ?? '—'}</td>
                    <td>v{sc.version}</td>
                    <td>{sc.total_cost?.toFixed(2) ?? '—'}</td>
                    <td>{sc.currency}</td>
                    <td><span className={`badge badge-${sc.status}`}>{sc.status}</span></td>
                    <td>{new Date(sc.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplier Quote History */}
      <div className="card">
        <div className="card-title">Supplier Quote History (All Versions)</div>
        {quotes.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">📄</div><p>No quotes yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Supplier</th>
                  <th>Version</th>
                  <th>Total Price</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td><strong>{q.part_number}</strong></td>
                    <td>{q.supplier_name}</td>
                    <td>
                      <span className="badge badge-submitted">v{q.version}</span>
                    </td>
                    <td>{q.total_price?.toFixed(2) ?? '—'}</td>
                    <td>{q.currency}</td>
                    <td><span className={`badge badge-${q.status}`}>{q.status}</span></td>
                    <td>{q.submitted_at ? new Date(q.submitted_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
