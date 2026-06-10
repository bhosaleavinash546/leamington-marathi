import { useEffect, useState } from 'react';
import api from '../utils/api';
import BarChart from './BarChart';
import ExportButtons from './ExportButtons';

interface Entry {
  supplier_quote_header_id: number;
  supplier_name: string;
  supplier_id: number;
  version: number;
  total_price: number;
  currency: string;
  rank?: number;
  recommendation?: string;
}

interface MatrixRow {
  cost_element: string;
  category?: string;
  should_cost_value: number;
  sort_order: number;
  [key: string]: unknown;
}

interface MultiComparison {
  id: number;
  part_number: string;
  name?: string;
  sc_total?: number;
  currency: string;
  status: string;
  created_at: string;
}

interface FullData {
  comparison: MultiComparison;
  entries:    Entry[];
  matrix:     MatrixRow[];
}

const flagColor = (pct: number): string => {
  if (pct > 10) return 'matrix-cell-worst';
  if (pct > 5)  return 'matrix-cell-warn';
  if (pct < -5) return 'matrix-cell-best';
  return '';
};

const recBadge: Record<string, string> = {
  recommended: 'badge-accepted',
  negotiate:   'badge-negotiating',
  reject:      'badge-rejected',
};

export default function MultiSupplierComparison() {
  const [list, setList]           = useState<MultiComparison[]>([]);
  const [selected, setSelected]   = useState<FullData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult]   = useState<{ summary?: string } | null>(null);

  useEffect(() => {
    api.get<MultiComparison[]>('/multi-comparison')
      .then((r) => setList(r.data))
      .finally(() => setLoading(false));
  }, []);

  const load = async (id: number) => {
    setDetailLoading(true);
    const r = await api.get<FullData>(`/multi-comparison/${id}`);
    setSelected(r.data);
    setAiResult(null);
    setDetailLoading(false);
  };

  const runAI = async () => {
    if (!selected) return;
    setAiLoading(true);
    const r = await api.post<{ summary?: string }>(`/multi-comparison/${selected.comparison.id}/ai`);
    setAiResult(r.data);
    setAiLoading(false);
  };

  if (loading) return <div className="loading-screen"><span className="spinner" />Loading…</div>;

  // Detail view
  if (selected) {
    const { comparison, entries, matrix } = selected;
    const scTotal = matrix.reduce((s, r) => s + Number(r.should_cost_value), 0);

    return (
      <div>
        <div className="page-header">
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: 8 }}>
              ← Back
            </button>
            <h1>{comparison.name ?? `Multi-Comparison #${comparison.id}`}</h1>
            <div className="sub">{comparison.part_number} · {entries.length} suppliers</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButtons comparisonId={comparison.id} isMulti />
            <button className="btn btn-primary" onClick={runAI} disabled={aiLoading}>
              {aiLoading ? <><span className="spinner" />Running AI…</> : '🤖 AI Insight'}
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="stats-row">
          <div className="stat-tile">
            <div className="st-label">Should-Cost</div>
            <div className="st-value">{scTotal.toFixed(2)}</div>
            <div className="st-sub">{comparison.currency}</div>
          </div>
          {entries.map((e) => {
            const variance = e.total_price - scTotal;
            const pct = scTotal ? (variance / scTotal) * 100 : 0;
            return (
              <div className="stat-tile" key={e.supplier_id}
                style={{ borderTop: `3px solid ${pct > 10 ? 'var(--danger)' : pct < 0 ? 'var(--success)' : 'var(--warn)'}` }}>
                <div className="st-label">{e.supplier_name}</div>
                <div className="st-value">{e.total_price.toFixed(2)}</div>
                <div className="st-sub" style={{ color: pct > 10 ? 'var(--danger)' : pct < 0 ? 'var(--success)' : 'var(--warn)' }}>
                  {pct > 0 ? '+' : ''}{pct.toFixed(1)}% vs target
                </div>
              </div>
            );
          })}
        </div>

        {/* AI result */}
        {aiResult?.summary && (
          <div className="card">
            <div className="card-title">AI Insight</div>
            <div className="ai-summary">{aiResult.summary}</div>
          </div>
        )}

        {/* Bar chart per element for each supplier */}
        <div className="card">
          <div className="card-title">Should-Cost vs All Suppliers by Element</div>
          <BarChart
            details={matrix.map((r, i) => ({
              id: i,
              comparison_snapshot_id: comparison.id,
              cost_element: r.cost_element,
              category: r.category,
              should_cost_value: Number(r.should_cost_value),
              quote_value: entries.length
                ? Number(entries.reduce((best, e) => {
                    const v = Number(r[`q_${e.supplier_id}`] ?? 0);
                    return Math.abs(v - Number(r.should_cost_value)) < Math.abs(Number(r[`q_${best.supplier_id}`] ?? 0) - Number(r.should_cost_value)) ? e : best;
                  }, entries[0])).valueOf()
                : Number(r.should_cost_value),
              variance: 0,
              variance_pct: 0,
              flag: 'acceptable',
              sort_order: r.sort_order,
            }))}
          />
        </div>

        {/* Matrix table */}
        <div className="card">
          <div className="card-title">Cost Element Matrix</div>
          {detailLoading ? (
            <div className="loading-screen"><span className="spinner" /></div>
          ) : (
            <div className="table-wrap">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>Cost Element</th>
                    <th>Category</th>
                    <th style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>Should-Cost</th>
                    {entries.map((e) => (
                      <th key={e.supplier_id} className="supplier-header" colSpan={2}>
                        {e.supplier_name} v{e.version}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th /><th />
                    <th />
                    {entries.map((e) => (
                      <>
                        <th key={`${e.supplier_id}-val`} style={{ fontSize: 10, color: 'var(--text-3)' }}>Price</th>
                        <th key={`${e.supplier_id}-pct`} style={{ fontSize: 10, color: 'var(--text-3)' }}>Var %</th>
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => (
                    <tr key={i}>
                      <td><strong>{row.cost_element}</strong></td>
                      <td>{row.category ?? '—'}</td>
                      <td><strong>{Number(row.should_cost_value).toFixed(4)}</strong></td>
                      {entries.map((e) => {
                        const val = Number(row[`q_${e.supplier_id}`] ?? 0);
                        const pct = Number(row[`var_pct_${e.supplier_id}`] ?? 0);
                        return (
                          <>
                            <td key={`${e.supplier_id}-v`} className={flagColor(pct)}>
                              {val.toFixed(4)}
                            </td>
                            <td key={`${e.supplier_id}-p`} className={flagColor(pct)}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </td>
                          </>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--surface-2)' }}>
                    <td colSpan={2}><strong>TOTAL</strong></td>
                    <td><strong>{scTotal.toFixed(4)}</strong></td>
                    {entries.map((e) => {
                      const pct = scTotal ? ((e.total_price - scTotal) / scTotal) * 100 : 0;
                      return (
                        <>
                          <td key={`${e.supplier_id}-tot`} className={flagColor(pct)}>
                            <strong>{e.total_price.toFixed(4)}</strong>
                          </td>
                          <td key={`${e.supplier_id}-pct`} className={flagColor(pct)}>
                            <strong>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</strong>
                          </td>
                        </>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Supplier recommendation panel */}
        <div className="card">
          <div className="card-title">Supplier Summary</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Quote Version</th>
                  <th>Total Price</th>
                  <th>vs Should-Cost</th>
                  <th>Var %</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {[...entries]
                  .sort((a, b) => a.total_price - b.total_price)
                  .map((e, i) => {
                    const pct = scTotal ? ((e.total_price - scTotal) / scTotal) * 100 : 0;
                    return (
                      <tr key={e.supplier_id}>
                        <td>
                          <strong>{e.supplier_name}</strong>
                          {i === 0 && <span className="badge badge-accepted" style={{ marginLeft: 8 }}>Lowest</span>}
                        </td>
                        <td>v{e.version}</td>
                        <td>{e.total_price.toFixed(2)} {e.currency}</td>
                        <td className={pct > 0 ? 'pos' : 'neg'}>{pct > 0 ? '+' : ''}{(e.total_price - scTotal).toFixed(2)}</td>
                        <td className={pct > 0 ? 'pos' : 'neg'}>{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</td>
                        <td>
                          <span className={`badge ${pct <= 5 ? 'badge-accepted' : pct <= 15 ? 'badge-negotiating' : 'badge-rejected'}`}>
                            {pct <= 5 ? 'Recommend' : pct <= 15 ? 'Negotiate' : 'Reject'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Multi-Supplier Comparisons</h1>
          <div className="sub">Compare up to 5 supplier quotes against your should-cost target</div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>No multi-supplier comparisons yet.</p>
            <p style={{ fontSize: 12 }}>Create one from the Comparisons page after creating at least 2 quotes for the same part.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((mc) => (
                  <tr key={mc.id}>
                    <td><strong>{mc.part_number}</strong></td>
                    <td>{mc.name ?? `Multi-Comparison #${mc.id}`}</td>
                    <td><span className={`badge badge-${mc.status}`}>{mc.status}</span></td>
                    <td>{new Date(mc.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => load(mc.id)}>
                        View Matrix →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
