import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { AuthUser } from '../types';

interface Props { user: AuthUser; }

// ── API shape ──────────────────────────────────────────────────────────────────

interface DashboardAlert {
  type: 'warning' | 'info' | 'danger';
  message: string;
  link: string;
  count: number;
}

interface RecentComparison {
  id: number;
  part_number: string;
  supplier_name: string;
  variance_pct: number;
  total_variance: number;
  status: string;
  created_at: string;
}

interface RecentQuote {
  id: number;
  part_number: string;
  supplier_name: string;
  total_price: number;
  currency: string;
  status: string;
  submitted_at: string;
}

interface DashboardData {
  total_parts: number;
  parts_with_should_cost: number;
  parts_with_published_sc: number;
  parts_without_sc: number;
  total_quotes: number;
  quotes_pending_review: number;
  quotes_negotiating: number;
  quotes_accepted: number;
  total_comparisons: number;
  open_comparisons: number;
  high_variance_comparisons: number;
  open_negotiations: number;
  stalled_negotiations: number;
  negotiations_due_this_week: number;
  potential_annual_saving: number;
  agreed_saving_ytd: number;
  acr_targets_this_year: number;
  acr_achieved_this_year: number;
  alerts: DashboardAlert[];
  recent_comparisons: RecentComparison[];
  recent_quotes: RecentQuote[];
  new_negotiations_this_month: number;
  new_quotes_this_month: number;
  new_high_variance_this_month: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatCurrency(val: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(val);
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function alertIcon(type: 'warning' | 'info' | 'danger'): string {
  if (type === 'danger')  return '❗';
  if (type === 'warning') return '⚠️';
  return 'ℹ️';
}

const ALERT_BG: Record<string, string> = {
  danger:  'var(--danger)',
  warning: 'var(--warning, #f59e0b)',
  info:    'var(--info, #3b82f6)',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

// Informational "new this month" chip. This reports inflow (rows created
// this month), not a good/bad judgement — a neutral muted tone keeps it
// honest next to a point-in-time total.
function NewThisMonthBadge({ count }: { count: number }) {
  if (count <= 0) return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>none new this month</span>;
  return (
    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>
      +{count} new this month
    </span>
  );
}

function KpiTile({
  icon, label, value, sub, valueStyle, newThisMonth,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  valueStyle?: React.CSSProperties;
  newThisMonth?: number;
}) {
  return (
    <div className="stat-tile kpi-card">
      <div className="st-icon">{icon}</div>
      <div className="st-label">{label}</div>
      <div className="st-value tabular-nums" style={valueStyle}>{value}</div>
      {newThisMonth !== undefined && <NewThisMonthBadge count={newThisMonth} />}
      {sub && <div className="st-sub">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color = 'var(--primary)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ background: 'var(--border, #e5e7eb)', borderRadius: 6, height: 10, overflow: 'hidden', margin: '6px 0 2px' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Dashboard({ user }: Props) {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.get<DashboardData>('/dashboard')
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.error ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16 }}>
        <span className="spinner" />
        <span style={{ color: 'var(--text-2)' }}>Loading dashboard…</span>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error ?? 'Unknown error'}</p>
        <button className="btn btn-primary" onClick={load}>Retry</button>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      {/* ── Section 1: Header ───────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">
            {greeting()}, {user.fullName} &nbsp;·&nbsp; {today}
          </div>
        </div>
        <Link to="/comparisons" className="btn btn-primary">
          ＋ New Comparison
        </Link>
      </div>

      {/* ── Section 2: Alert Banner ──────────────────────────────────────────── */}
      {data.alerts.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            overflowX: 'auto',
            paddingBottom: 4,
            marginBottom: 24,
          }}
        >
          {data.alerts.map((alert, i) => (
            <Link
              key={i}
              to={alert.link}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 20,
                background: ALERT_BG[alert.type] ?? '#6b7280',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span>{alertIcon(alert.type)}</span>
              <span>{alert.message}</span>
              <span
                style={{
                  background: 'rgba(255,255,255,0.25)',
                  borderRadius: 10,
                  padding: '1px 7px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {alert.count}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Section 3: KPI Tiles (2 rows of 4) ──────────────────────────────── */}
      <div className="stats-row">
        <KpiTile
          icon="📦"
          label="Parts Total"
          value={data.total_parts}
          sub={`${data.parts_with_should_cost} have a should-cost model`}
        />
        <KpiTile
          icon="✅"
          label="Should-Costs Published"
          value={data.parts_with_published_sc}
          sub={`of ${data.total_parts} total parts`}
        />
        <KpiTile
          icon="🤝"
          label="Open Negotiations"
          value={data.open_negotiations}
          sub={data.stalled_negotiations > 0 ? `${data.stalled_negotiations} stalled` : 'All on track'}
          valueStyle={data.open_negotiations > 0 ? { color: 'var(--primary)' } : undefined}
          newThisMonth={data.new_negotiations_this_month}
        />
        <KpiTile
          icon="💰"
          label="Potential Saving"
          value={formatCurrency(data.potential_annual_saving)}
          sub="annualised across open negotiations"
          valueStyle={data.potential_annual_saving > 0 ? { color: 'var(--success, #16a34a)' } : undefined}
        />
      </div>

      <div className="stats-row" style={{ marginTop: 12 }}>
        <KpiTile
          icon="📋"
          label="Quotes Pending Review"
          value={data.quotes_pending_review}
          sub={`${data.total_quotes} quotes total`}
          valueStyle={data.quotes_pending_review > 0 ? { color: 'var(--warning, #f59e0b)' } : undefined}
          newThisMonth={data.new_quotes_this_month}
        />
        <KpiTile
          icon="🔺"
          label="High Variance Comparisons"
          value={data.high_variance_comparisons}
          sub=">15% variance vs should-cost"
          valueStyle={data.high_variance_comparisons > 0 ? { color: 'var(--danger)' } : { color: 'var(--success, #16a34a)' }}
          newThisMonth={data.new_high_variance_this_month}
        />
        <KpiTile
          icon="🎯"
          label="ACR Targets (Year)"
          value={data.acr_targets_this_year}
          sub={`${data.acr_achieved_this_year} achieved`}
        />
        <KpiTile
          icon="🏆"
          label="Agreed Saving YTD"
          value={formatCurrency(data.agreed_saving_ytd)}
          sub="from agreed negotiations"
          valueStyle={data.agreed_saving_ytd > 0 ? { color: 'var(--success, #16a34a)' } : undefined}
        />
      </div>

      {/* ── Section 4: Two-column grid ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginTop: 24 }}>

        {/* Left: Recent Comparisons */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Recent Comparisons</div>
            <Link to="/comparisons" className="btn btn-secondary btn-sm">View all →</Link>
          </div>
          {data.recent_comparisons.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <p>No comparisons yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Supplier</th>
                    <th>Variance %</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_comparisons.map((c) => {
                    const vPct = Number(c.variance_pct ?? 0);
                    const color = Math.abs(vPct) > 15 ? 'var(--danger)' : Math.abs(vPct) > 5 ? 'var(--warning, #f59e0b)' : 'var(--success, #16a34a)';
                    return (
                      <tr key={c.id}>
                        <td><strong>{c.part_number}</strong></td>
                        <td style={{ color: 'var(--text-2)' }}>{c.supplier_name}</td>
                        <td style={{ fontWeight: 700, color }}>{vPct > 0 ? '+' : ''}{vPct.toFixed(1)}%</td>
                        <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                        <td>
                          <Link to={`/comparisons/${c.id}`} className="btn btn-secondary btn-sm">Details</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Portfolio Health */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>Portfolio Health</div>

          {/* Parts coverage */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Parts Coverage</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
              {data.parts_with_published_sc} of {data.total_parts} parts have published should-cost models
            </div>
            <ProgressBar
              value={data.parts_with_published_sc}
              max={data.total_parts}
              color="var(--success, #16a34a)"
            />
            <div style={{ fontSize: 11, color: 'var(--text-3, #9ca3af)' }}>
              {data.total_parts > 0
                ? `${Math.round((data.parts_with_published_sc / data.total_parts) * 100)}% coverage`
                : '—'}
            </div>
          </div>

          {/* Quote pipeline */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Quote Pipeline</div>
            {[
              { label: 'Submitted / Pending', count: data.quotes_pending_review, color: 'var(--warning, #f59e0b)' },
              { label: 'Negotiating',          count: data.quotes_negotiating,    color: 'var(--primary)' },
              { label: 'Accepted',             count: data.quotes_accepted,       color: 'var(--success, #16a34a)' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-2)' }}>{label}</span>
                  <span style={{ fontWeight: 700 }}>{count}</span>
                </div>
                <ProgressBar value={count} max={data.total_quotes || 1} color={color} />
              </div>
            ))}
          </div>

          {/* Negotiations breakdown */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Negotiations</div>
            {[
              { label: 'Open',    count: data.open_negotiations,    color: 'var(--primary)' },
              { label: 'Stalled', count: data.stalled_negotiations, color: 'var(--danger)' },
              { label: 'Due this week', count: data.negotiations_due_this_week, color: 'var(--warning, #f59e0b)' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: count > 0 ? color : 'var(--text-3, #9ca3af)',
                  }}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 5: Recent Quotes (full width) ───────────────────────────── */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Recent Quotes</div>
          <Link to="/quotes" className="btn btn-secondary btn-sm">View all →</Link>
        </div>
        {data.recent_quotes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📄</div>
            <p>No quotes yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Supplier</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_quotes.map((q) => (
                  <tr key={q.id}>
                    <td><strong>{q.part_number}</strong></td>
                    <td style={{ color: 'var(--text-2)' }}>{q.supplier_name}</td>
                    <td>
                      {q.total_price != null
                        ? formatCurrency(q.total_price, q.currency || 'GBP')
                        : '—'}
                    </td>
                    <td><span className={`badge badge-${q.status}`}>{q.status}</span></td>
                    <td style={{ color: 'var(--text-2)', fontSize: 13 }}>{fmtDate(q.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 6: Quick Actions ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 20 }}>
        {[
          { icon: '🏗', label: 'Build Should-Cost',   to: '/should-costs' },
          { icon: '⚖️', label: 'Run Comparison',       to: '/comparisons' },
          { icon: '🤝', label: 'Track Negotiation',    to: '/negotiations' },
          { icon: '🎯', label: 'View Opportunities',   to: '/opportunity' },
        ].map(({ icon, label, to }) => (
          <Link
            key={to}
            to={to}
            style={{ textDecoration: 'none' }}
          >
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '24px 16px',
                cursor: 'pointer',
                transition: 'box-shadow 0.15s, transform 0.15s',
                marginBottom: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = '';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '';
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{label}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
