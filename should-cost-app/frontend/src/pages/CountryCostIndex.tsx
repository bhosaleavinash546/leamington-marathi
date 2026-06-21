import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import { RateReference } from '../types';

type RateWithValidated = RateReference & { is_validated?: boolean };

export default function CountryCostIndex() {
  const [rates, setRates]             = useState<RateWithValidated[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [activeProcess, setActiveProcess] = useState('');

  const fetchRates = () => {
    setLoading(true);
    setError(null);
    api.get<RateWithValidated[]>('/rate-library')
      .then((r) => {
        setRates(r.data);
        if (r.data.length > 0) {
          const first = r.data[0].process_type;
          setActiveProcess((prev) => prev || first);
        }
      })
      .catch(() => setError('Could not load rate library. Ensure the backend is running.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRates(); }, []);

  const processTypes = useMemo(
    () => Array.from(new Set(rates.map((r) => r.process_type))).sort(),
    [rates]
  );

  const filteredRates = useMemo(
    () =>
      rates
        .filter((r) => !activeProcess || r.process_type === activeProcess)
        .slice()
        .sort((a, b) => Number(a.labour_rate_hr) - Number(b.labour_rate_hr)),
    [rates, activeProcess]
  );

  const chartData = useMemo(
    () =>
      filteredRates.map((r) => ({
        country: r.country,
        Labour: Number(r.labour_rate_hr),
        Machine: Number(r.machine_rate_hr),
      })),
    [filteredRates]
  );

  const stats = useMemo(() => {
    if (filteredRates.length === 0) return null;
    const cheapest      = filteredRates[0];
    const mostExpensive = filteredRates[filteredRates.length - 1];
    const spread        = Number(mostExpensive.labour_rate_hr) - Number(cheapest.labour_rate_hr);
    const validatedCount = filteredRates.filter((r) => r.is_validated).length;
    return { cheapest, mostExpensive, spread, validatedCount };
  }, [filteredRates]);

  const maxTotal = useMemo(
    () =>
      filteredRates.reduce(
        (acc, r) => Math.max(acc, Number(r.labour_rate_hr) + Number(r.machine_rate_hr)),
        0
      ),
    [filteredRates]
  );

  const competitivenessScore = (r: RateWithValidated) => {
    if (maxTotal === 0) return 0;
    return 100 - ((Number(r.labour_rate_hr) + Number(r.machine_rate_hr)) / maxTotal) * 100;
  };

  if (loading) return <div className="loading">Loading country cost index…</div>;

  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Failed to load</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>{error}</div>
      <button className="btn btn-primary" onClick={fetchRates}>Retry</button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>🌍 Country Cost Index</h1>
          <p className="sub">Labour and machine rates by manufacturing process and country</p>
        </div>
      </div>

      {/* Process tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {processTypes.map((pt) => (
          <button
            key={pt}
            className={`btn btn-sm ${activeProcess === pt ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveProcess(pt)}
          >
            {pt}
          </button>
        ))}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="stats-row" style={{ marginBottom: 16 }}>
          <div className="stat-tile">
            <div className="label">Cheapest Country</div>
            <div className="value" style={{ fontSize: 18 }}>{stats.cheapest.country}</div>
            <div className="sub">${Number(stats.cheapest.labour_rate_hr).toFixed(2)}/hr labour</div>
          </div>
          <div className="stat-tile">
            <div className="label">Most Expensive</div>
            <div className="value" style={{ fontSize: 18 }}>{stats.mostExpensive.country}</div>
            <div className="sub">${Number(stats.mostExpensive.labour_rate_hr).toFixed(2)}/hr labour</div>
          </div>
          <div className="stat-tile">
            <div className="label">Rate Spread</div>
            <div className="value">${stats.spread.toFixed(2)}</div>
            <div className="sub">labour $/hr</div>
          </div>
          <div className="stat-tile">
            <div className="label"># Validated Rates</div>
            <div className="value">{stats.validatedCount}</div>
            <div className="sub">of {filteredRates.length} shown</div>
          </div>
        </div>
      )}

      {/* Grouped bar chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Labour vs Machine Rates by Country</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <XAxis dataKey="country" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Labour" fill="#2563eb" name="Labour $/hr" />
            <Bar dataKey="Machine" fill="#f59e0b" name="Machine $/hr" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
          Detailed Rates
        </div>
        {filteredRates.length === 0 ? (
          <div className="empty" style={{ padding: 32, textAlign: 'center' }}>No rates found for this process type.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left' }}>Country</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Labour $/hr</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Machine $/hr</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Overhead %</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Scrap %</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center' }}>Validated</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left' }}>Cost Competitiveness</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((r) => {
                  const score = competitivenessScore(r);
                  const scoreColor = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)';
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 700 }}>{r.country}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(r.labour_rate_hr).toFixed(2)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(r.machine_rate_hr).toFixed(2)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(r.overhead_pct).toFixed(1)}%</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{Number(r.scrap_rate_pct).toFixed(1)}%</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        {r.is_validated ? (
                          <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 12 }}>✓ Verified</span>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              flex: 1,
                              height: 8,
                              background: 'var(--border)',
                              borderRadius: 4,
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${score}%`,
                                height: '100%',
                                background: scoreColor,
                                borderRadius: 4,
                                transition: 'width 0.3s ease',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 32, textAlign: 'right' }}>
                            {score.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
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
