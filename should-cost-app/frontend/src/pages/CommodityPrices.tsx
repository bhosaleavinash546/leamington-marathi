import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

async function downloadCsv(endpoint: string, filename: string) {
  const res = await api.get(endpoint, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  window.URL.revokeObjectURL(url); document.body.removeChild(a);
}

interface CommoditySummary {
  id: number;
  material_name: string;
  material_code?: string;
  latest_price: number;
  latest_date: string;
  unit: string;
  currency: string;
  source?: string;
  prev_price?: number;
  change_pct?: number;
}

interface PriceHistory {
  id: number;
  price_per_unit: number;
  unit: string;
  currency: string;
  price_date: string;
  source?: string;
  notes?: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const fmt = (n: number) =>
  Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function CommodityPrices() {
  const [summary, setSummary] = useState<CommoditySummary[]>([]);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [hoveredMat, setHoveredMat] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form fields
  const [fMaterialName, setFMaterialName] = useState('');
  const [fMaterialCode, setFMaterialCode] = useState('');
  const [fPricePerUnit, setFPricePerUnit] = useState('');
  const [fUnit, setFUnit] = useState('per kg');
  const [fCurrency, setFCurrency] = useState('GBP');
  const [fPriceDate, setFPriceDate] = useState(todayStr());
  const [fSource, setFSource] = useState('Manual entry');
  const [fNotes, setFNotes] = useState('');

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CommoditySummary[]>('/commodity-prices/summary');
      setSummary(res.data);
      setLastRefreshed(new Date().toISOString());
    } catch {
      setError('Failed to load commodity prices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // Auto-refresh every 60 s (shows live feel)
    const interval = setInterval(fetchSummary, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        const res = await api.get<PriceHistory[]>(
          `/commodity-prices/history/${encodeURIComponent(selected)}`
        );
        setHistory(res.data);
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
  }, [selected]);

  const handleRefreshNow = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await api.post<{ inserted: number; skipped: number }>('/commodity-prices/refresh');
      const { inserted, skipped } = res.data;
      setRefreshMsg(
        inserted > 0
          ? `Updated ${inserted} material${inserted !== 1 ? 's' : ''} with today's prices.`
          : `All ${skipped} materials already up to date for today.`
      );
      await fetchSummary();
      if (selected) {
        const h = await api.get<PriceHistory[]>(
          `/commodity-prices/history/${encodeURIComponent(selected)}`
        );
        setHistory(h.data);
      }
    } catch {
      setRefreshMsg('Refresh failed — please try again.');
    } finally {
      setRefreshing(false);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => setRefreshMsg(null), 6000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/commodity-prices', {
        material_name: fMaterialName,
        material_code: fMaterialCode || undefined,
        price_per_unit: parseFloat(fPricePerUnit),
        unit: fUnit,
        currency: fCurrency,
        price_date: fPriceDate,
        source: fSource || undefined,
        notes: fNotes || undefined,
      });
      setShowForm(false);
      const prevSelected = selected;
      await fetchSummary();
      if (prevSelected && fMaterialName === prevSelected) {
        const res = await api.get<PriceHistory[]>(
          `/commodity-prices/history/${encodeURIComponent(prevSelected)}`
        );
        setHistory(res.data);
      }
    } catch {
      // silently ignore
    }
  };

  const openForm = () => {
    setFMaterialName('');
    setFMaterialCode('');
    setFPricePerUnit('');
    setFUnit('per kg');
    setFCurrency('GBP');
    setFPriceDate(todayStr());
    setFSource('Manual entry');
    setFNotes('');
    setShowForm(true);
  };

  // Stats
  const todayDateStr = todayStr();
  const entriesUpToDate = summary.filter(
    (s) => s.latest_date >= todayDateStr.slice(0, 7)
  ).length;

  let highestChange: CommoditySummary | null = null;
  for (const s of summary) {
    if (s.change_pct == null) continue;
    if (!highestChange || Math.abs(s.change_pct) > Math.abs(highestChange.change_pct ?? 0)) {
      highestChange = s;
    }
  }

  let lowestPriceMat: CommoditySummary | null = null;
  for (const s of summary) {
    if (!lowestPriceMat || s.latest_price < lowestPriceMat.latest_price) lowestPriceMat = s;
  }

  // History stats
  const historyPrices = history.map((h) => h.price_per_unit);
  const histHighest = historyPrices.length ? Math.max(...historyPrices) : null;
  const histLowest  = historyPrices.length ? Math.min(...historyPrices) : null;
  const histAvg     = historyPrices.length
    ? historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length
    : null;

  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.price_date).getTime() - new Date(a.price_date).getTime()
  );

  if (loading && summary.length === 0) return <div className="loading">Loading…</div>;

  if (error)
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>{error}</div>
        <button className="btn btn-primary" onClick={fetchSummary}>Retry</button>
      </div>
    );

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Commodity Price Tracker
            {/* Live pulse badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(34,197,94,0.12)', color: 'var(--success)',
              borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--success)',
                animation: 'pulse 2s infinite',
              }} />
              LIVE
            </span>
          </h1>
          <div className="sub">
            Market-simulated daily prices · auto-refreshes every 60 s
            {lastRefreshed && (
              <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                · last fetched {fmtTime(lastRefreshed)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={handleRefreshNow}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{
              display: 'inline-block',
              animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
            }}>⟳</span>
            {refreshing ? 'Updating…' : 'Refresh Now'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => downloadCsv('/export/commodity-prices.csv', `commodity-prices-${new Date().toISOString().slice(0,10)}.csv`)}
            title="Export all commodity prices as CSV"
          >
            ⬇ Export CSV
          </button>
          <button className="btn btn-primary" onClick={openForm}>＋ Add Price Entry</button>
        </div>
      </div>

      {/* Refresh status message */}
      {refreshMsg && (
        <div style={{
          background: refreshMsg.includes('failed') ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)',
          color: refreshMsg.includes('failed') ? 'var(--danger)' : 'var(--success)',
          border: `1px solid ${refreshMsg.includes('failed') ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
          borderRadius: 8, padding: '9px 16px', marginBottom: 14,
          fontSize: 13, fontWeight: 500,
        }}>
          {refreshMsg}
        </div>
      )}

      {/* ── Stats row ────────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-tile">
          <div className="label">Materials Tracked</div>
          <div className="value">{summary.length}</div>
          <div className="sub">unique materials</div>
        </div>
        <div className="stat-tile">
          <div className="label">Current Month</div>
          <div className="value">{entriesUpToDate}</div>
          <div className="sub">prices updated this month</div>
        </div>
        <div className="stat-tile">
          <div className="label">Biggest Mover</div>
          <div className="value">
            {highestChange && highestChange.change_pct != null ? (
              <span style={{ color: highestChange.change_pct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {highestChange.change_pct >= 0 ? '+' : ''}
                {Number(highestChange.change_pct).toFixed(1)}%
              </span>
            ) : '—'}
          </div>
          <div className="sub">{highestChange?.material_name ?? 'no data'}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Lowest Price</div>
          <div className="value">
            {lowestPriceMat ? `${lowestPriceMat.currency} ${fmt(lowestPriceMat.latest_price)}` : '—'}
          </div>
          <div className="sub">{lowestPriceMat?.material_name ?? 'no data'}</div>
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left: material list */}
        <div style={{ flex: '0 0 360px', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
          {summary.length === 0 ? (
            <div className="empty">No materials found. Add a price entry to get started.</div>
          ) : (
            summary.map((mat) => {
              const isSelected = selected === mat.material_name;
              const isHovered  = hoveredMat === mat.material_name;
              const changePct  = mat.change_pct != null ? Number(mat.change_pct) : null;
              const up         = changePct != null && changePct >= 0;
              return (
                <div
                  key={mat.material_name}
                  className="card"
                  style={{
                    padding: '12px 16px', marginBottom: 8, cursor: 'pointer',
                    border: isSelected
                      ? '1.5px solid var(--accent)'
                      : isHovered ? '1.5px solid var(--border)' : '1.5px solid transparent',
                  }}
                  onClick={() => setSelected(mat.material_name)}
                  onMouseEnter={() => setHoveredMat(mat.material_name)}
                  onMouseLeave={() => setHoveredMat(null)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                      {mat.material_name}
                      {mat.material_code && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6, fontWeight: 400 }}>
                          {mat.material_code}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>
                        {mat.currency} {fmt(mat.latest_price)}
                      </div>
                      {changePct != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: up ? 'var(--success)' : 'var(--danger)',
                          background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          borderRadius: 4, padding: '1px 5px',
                        }}>
                          {up ? '▲' : '▼'} {up ? '+' : ''}{changePct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{mat.unit}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {mat.latest_date?.slice(0, 10)}
                      {mat.latest_date?.slice(0, 7) >= todayStr().slice(0, 7) && (
                        <span style={{
                          marginLeft: 5, fontSize: 10, fontWeight: 600,
                          color: 'var(--success)', background: 'rgba(34,197,94,0.12)',
                          borderRadius: 3, padding: '0 4px',
                        }}>current</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: history detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--text-3)' }}>Select a material to view price history</div>
            </div>
          ) : historyLoading ? (
            <div className="loading">Loading history…</div>
          ) : (
            <>
              {/* Trend summary cards */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>
                  Price Summary — {selected}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[
                    { label: '24-month High', val: histHighest },
                    { label: '24-month Low',  val: histLowest  },
                    { label: '24-month Avg',  val: histAvg     },
                  ].map(({ label, val }) => (
                    <div key={label} style={{
                      flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                        {val != null ? fmt(val) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* History table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Date', 'Price', 'Unit', 'Currency', 'Source', 'Notes'].map((h) => (
                        <th key={h} style={{
                          padding: '11px 14px',
                          textAlign: h === 'Price' ? 'right' : 'left',
                          color: 'var(--text-2)', fontWeight: 600,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-3)' }}>
                          No history entries found.
                        </td>
                      </tr>
                    ) : (
                      sortedHistory.map((h, i) => {
                        const prevPrice = sortedHistory[i + 1]?.price_per_unit;
                        const chg = prevPrice
                          ? ((h.price_per_unit - prevPrice) / prevPrice) * 100
                          : null;
                        const up = chg != null && chg >= 0;
                        return (
                          <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                              {h.price_date?.slice(0, 10)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                              {fmt(h.price_per_unit)}
                              {chg != null && (
                                <span style={{
                                  marginLeft: 6, fontSize: 11, fontWeight: 600,
                                  color: up ? 'var(--success)' : 'var(--danger)',
                                }}>
                                  {up ? '▲' : '▼'}{Math.abs(chg).toFixed(2)}%
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{h.unit}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>{h.currency}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-3)', fontSize: 12 }}>{h.source ?? '—'}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-3)', fontSize: 12 }}>{h.notes ?? '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Add Price Entry Modal ──────────────────────────────────── */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Add Price Entry</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Material Name</label>
                  <input className="form-control" type="text" list="mat-names"
                    value={fMaterialName} onChange={(e) => setFMaterialName(e.target.value)} required />
                  <datalist id="mat-names">
                    {summary.map((s) => <option key={s.material_name} value={s.material_name} />)}
                  </datalist>
                </div>
                <div>
                  <label className="form-label">Material Code (optional)</label>
                  <input className="form-control" type="text"
                    value={fMaterialCode} onChange={(e) => setFMaterialCode(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Price per Unit</label>
                  <input className="form-control" type="number" step="0.0001"
                    value={fPricePerUnit} onChange={(e) => setFPricePerUnit(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">Unit</label>
                  <select className="form-control" value={fUnit} onChange={(e) => setFUnit(e.target.value)}>
                    <option value="per kg">per kg</option>
                    <option value="per tonne">per tonne</option>
                    <option value="per litre">per litre</option>
                    <option value="per unit">per unit</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select className="form-control" value={fCurrency} onChange={(e) => setFCurrency(e.target.value)}>
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Price Date</label>
                  <input className="form-control" type="date"
                    value={fPriceDate} onChange={(e) => setFPriceDate(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="form-label">Source</label>
                <input className="form-control" type="text"
                  value={fSource} onChange={(e) => setFSource(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={2}
                  value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pulse + spin keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
