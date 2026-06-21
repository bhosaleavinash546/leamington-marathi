import { useEffect, useState } from 'react';
import api from '../utils/api';

interface CommoditySummary {
  material_name: string;
  material_code?: string;
  latest_price: number;
  latest_date: string;
  unit: string;
  currency: string;
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

export default function CommodityPrices() {
  const [summary, setSummary] = useState<CommoditySummary[]>([]);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [hoveredMat, setHoveredMat] = useState<string | null>(null);

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
    } catch {
      setError('Failed to load commodity prices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
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
      // silently ignore — could add error handling here
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

  // Stats calculations
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const entriesThisMonth = summary.filter((s) => s.latest_date.startsWith(currentMonth)).length;

  let highestChange: CommoditySummary | null = null;
  for (const s of summary) {
    if (s.change_pct == null) continue;
    if (!highestChange || Math.abs(s.change_pct) > Math.abs(highestChange.change_pct ?? 0)) {
      highestChange = s;
    }
  }

  let lowestPriceMat: CommoditySummary | null = null;
  for (const s of summary) {
    if (!lowestPriceMat || s.latest_price < lowestPriceMat.latest_price) {
      lowestPriceMat = s;
    }
  }

  // History stats
  const historyPrices = history.map((h) => h.price_per_unit);
  const histHighest = historyPrices.length ? Math.max(...historyPrices) : null;
  const histLowest = historyPrices.length ? Math.min(...historyPrices) : null;
  const histAvg =
    historyPrices.length
      ? historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length
      : null;

  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.price_date).getTime() - new Date(a.price_date).getTime()
  );

  if (loading) return <div className="loading">Loading…</div>;

  if (error)
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>
          {error}
        </div>
        <button className="btn btn-primary" onClick={fetchSummary}>
          Retry
        </button>
      </div>
    );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Commodity Price Tracker</h1>
          <div className="sub">Track raw material and commodity prices over time.</div>
        </div>
        <button className="btn btn-primary" onClick={openForm}>
          ＋ Add Price Entry
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-tile">
          <div className="label">Materials Tracked</div>
          <div className="value">{summary.length}</div>
          <div className="sub">unique materials</div>
        </div>
        <div className="stat-tile">
          <div className="label">Entries This Month</div>
          <div className="value">{entriesThisMonth}</div>
          <div className="sub">latest updates this month</div>
        </div>
        <div className="stat-tile">
          <div className="label">Highest Change</div>
          <div className="value">
            {highestChange && highestChange.change_pct != null ? (
              <span
                style={{
                  color: highestChange.change_pct >= 0 ? 'var(--success)' : 'var(--danger)',
                }}
              >
                {highestChange.change_pct >= 0 ? '+' : ''}
                {highestChange.change_pct.toFixed(1)}%
              </span>
            ) : (
              '—'
            )}
          </div>
          <div className="sub">{highestChange ? highestChange.material_name : 'no data'}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Lowest Price</div>
          <div className="value">
            {lowestPriceMat
              ? `${lowestPriceMat.currency} ${fmt(lowestPriceMat.latest_price)}`
              : '—'}
          </div>
          <div className="sub">{lowestPriceMat ? lowestPriceMat.material_name : 'no data'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left column — material list */}
        <div
          style={{
            flex: '0 0 350px',
            maxHeight: 'calc(100vh - 280px)',
            overflowY: 'auto',
          }}
        >
          {summary.length === 0 ? (
            <div className="empty">No materials found. Add a price entry to get started.</div>
          ) : (
            summary.map((mat) => {
              const isSelected = selected === mat.material_name;
              const isHovered = hoveredMat === mat.material_name;
              let borderColor = '1.5px solid transparent';
              if (isSelected) borderColor = '1.5px solid var(--accent)';
              else if (isHovered) borderColor = '1.5px solid var(--border)';

              return (
                <div
                  key={mat.material_name}
                  className="card"
                  style={{
                    padding: '12px 16px',
                    marginBottom: 8,
                    cursor: 'pointer',
                    border: borderColor,
                  }}
                  onClick={() => setSelected(mat.material_name)}
                  onMouseEnter={() => setHoveredMat(mat.material_name)}
                  onMouseLeave={() => setHoveredMat(null)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                      {mat.material_name}
                      {mat.material_code && (
                        <span
                          style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6, fontWeight: 400 }}
                        >
                          {mat.material_code}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
                        {mat.currency} {fmt(mat.latest_price)}
                      </div>
                      {mat.change_pct != null && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: mat.change_pct >= 0 ? 'var(--success)' : 'var(--danger)',
                            background:
                              mat.change_pct >= 0
                                ? 'rgba(34,197,94,0.12)'
                                : 'rgba(239,68,68,0.12)',
                            borderRadius: 4,
                            padding: '1px 5px',
                          }}
                        >
                          {mat.change_pct >= 0 ? '+' : ''}
                          {mat.change_pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 4,
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{mat.unit}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{mat.latest_date}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right column — history */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--text-3)' }}>
                Select a material to view price history
              </div>
            </div>
          ) : historyLoading ? (
            <div className="loading">Loading history…</div>
          ) : (
            <>
              {/* Trend summary */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-2)',
                    marginBottom: 12,
                  }}
                >
                  Price Summary — {selected}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                      Highest
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                      {histHighest != null ? fmt(histHighest) : '—'}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                      Lowest
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                      {histLowest != null ? fmt(histLowest) : '—'}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                      Average
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                      {histAvg != null ? fmt(histAvg) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* History table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      <th style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>
                        Date
                      </th>
                      <th style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--text-2)', fontWeight: 600 }}>
                        Price
                      </th>
                      <th style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>
                        Unit
                      </th>
                      <th style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>
                        Currency
                      </th>
                      <th style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>
                        Source
                      </th>
                      <th style={{ padding: '11px 14px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 600 }}>
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-3)' }}
                        >
                          No history entries found.
                        </td>
                      </tr>
                    ) : (
                      sortedHistory.map((h) => (
                        <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>
                            {h.price_date}
                          </td>
                          <td
                            style={{
                              padding: '10px 14px',
                              textAlign: 'right',
                              fontWeight: 600,
                              color: 'var(--text-1)',
                            }}
                          >
                            {fmt(h.price_per_unit)}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>
                            {h.unit}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-2)' }}>
                            {h.currency}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>
                            {h.source ?? '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-3)' }}>
                            {h.notes ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Price Entry Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className="modal-header">
              <h3>Add Price Entry</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowForm(false)}
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Material Name</label>
                  <input
                    className="form-control"
                    type="text"
                    list="mat-names"
                    value={fMaterialName}
                    onChange={(e) => setFMaterialName(e.target.value)}
                    required
                  />
                  <datalist id="mat-names">
                    {summary.map((s) => (
                      <option key={s.material_name} value={s.material_name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="form-label">Material Code (optional)</label>
                  <input
                    className="form-control"
                    type="text"
                    value={fMaterialCode}
                    onChange={(e) => setFMaterialCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Price per Unit</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.0001"
                    value={fPricePerUnit}
                    onChange={(e) => setFPricePerUnit(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Unit</label>
                  <select
                    className="form-control"
                    value={fUnit}
                    onChange={(e) => setFUnit(e.target.value)}
                  >
                    <option value="per kg">per kg</option>
                    <option value="per tonne">per tonne</option>
                    <option value="per litre">per litre</option>
                    <option value="per unit">per unit</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Currency</label>
                  <select
                    className="form-control"
                    value={fCurrency}
                    onChange={(e) => setFCurrency(e.target.value)}
                  >
                    <option value="GBP">GBP</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Price Date</label>
                  <input
                    className="form-control"
                    type="date"
                    value={fPriceDate}
                    onChange={(e) => setFPriceDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Source</label>
                <input
                  className="form-control"
                  type="text"
                  value={fSource}
                  onChange={(e) => setFSource(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
