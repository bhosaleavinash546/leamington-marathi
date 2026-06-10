// ============================================================
// Opportunity Interactive Dynamic Dashboard
// Real-time cost intelligence: Should-Cost vs Latest Quotes,
// system-wise breakdown, version trends, element heatmap.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import AnimatedNumber from '../components/AnimatedNumber';
import Skeleton, { SkeletonCard } from '../components/Skeleton';
import SystemTreemap from '../components/charts/SystemTreemap';
import SystemBarComparison from '../components/charts/SystemBarComparison';
import VersionTrendChart from '../components/charts/VersionTrendChart';
import ElementHeatmap from '../components/charts/ElementHeatmap';
import SupplierRadar from '../components/charts/SupplierRadar';
import VehicleHierarchyFilter, { VehicleFilter } from '../components/VehicleHierarchyFilter';
import ExportButtons from '../components/ExportButtons';

// ── Types ─────────────────────────────────────────────────────
interface Summary {
  parts_with_sc:     number;
  parts_quoted:      number;
  total_should_cost: number;
  total_best_quote:  number;
  total_avg_quote:   number;
  total_opportunity: number;
  avg_variance_pct:  number;
  parts_over_10pct:  number;
  parts_over_20pct:  number;
  parts_below_target: number;
}

interface SystemRow {
  system_id:         number;
  system_name:       string;
  system_code:       string;
  sort_order:        number;
  part_count:        number;
  parts_with_sc:     number;
  parts_quoted:      number;
  total_should_cost: number;
  total_best_quote:  number;
  total_avg_quote:   number;
  total_worst_quote: number;
  total_opportunity: number;
  variance_pct:      number;
  total_quotes:      number;
  parts_flagged:     number;
}

interface PartRow {
  part_id:        number;
  part_number:    string;
  description?:   string;
  system_name?:   string;
  subsystem_name?: string;
  should_cost:    number;
  best_price:     number;
  avg_price:      number;
  worst_price:    number;
  supplier_count: number;
  opportunity:    number;
  variance_pct:   number;
  risk_level:     string;
}

interface TrendRow {
  version:       number;
  quote_price:   number;
  should_cost:   number;
  supplier_name: string;
  supplier_id:   number;
  submitted_at:  string;
}

interface ElementRow {
  cost_element:     string;
  category?:        string;
  avg_should_cost:  number;
  avg_quote:        number;
  avg_variance_pct: number;
  sample_count:     number;
  total_variance:   number;
}

interface SupplierRow {
  supplier_id:               number;
  supplier_name:             string;
  country?:                  string;
  quote_count:               number;
  avg_variance_pct:          number;
  parts_at_or_below_target:  number;
  parts_over_10pct:          number;
  total_variance:            number;
}

// ── Risk badge helper ─────────────────────────────────────────
const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'var(--danger-bg)',  text: 'var(--danger)',  label: 'Critical'  },
  high:     { bg: '#fff0e0',           text: '#ea580c',        label: 'High'      },
  medium:   { bg: 'var(--warn-bg)',    text: 'var(--warn)',    label: 'Medium'    },
  low:      { bg: 'var(--bg-alt)',     text: 'var(--text-3)',  label: 'Low'       },
  below:    { bg: 'var(--success-bg)', text: 'var(--success)', label: 'Below SC'  },
};

function RiskBadge({ level }: { level: string }) {
  const s = RISK_STYLES[level] ?? RISK_STYLES.low;
  return (
    <span style={{ background: s.bg, color: s.text, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
      {s.label}
    </span>
  );
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── KPI Tile ─────────────────────────────────────────────────
function KpiTile({
  label, value, sub, trend, accent, loading, prefix = '', suffix = '', decimals = 0, large = false,
}: {
  label: string; value: number; sub?: string; trend?: number;
  accent?: string; loading?: boolean; prefix?: string; suffix?: string; decimals?: number; large?: boolean;
}) {
  const trendColor = trend === undefined ? 'var(--text-3)' : trend < 0 ? 'var(--success)' : trend > 0 ? 'var(--danger)' : 'var(--text-3)';
  return (
    <div className="stat-tile" style={{ borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <div className="st-label">{label}</div>
      {loading ? (
        <div style={{ marginTop: 6 }}><Skeleton height={32} width="70%" /></div>
      ) : (
        <div className="st-value" style={{ fontSize: large ? 32 : 26, color: accent ?? 'var(--text-1)' }}>
          <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
        </div>
      )}
      {(sub || trend !== undefined) && (
        <div className="st-sub" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5 }}>
          {sub && <span>{sub}</span>}
          {trend !== undefined && (
            <span style={{ color: trendColor, fontWeight: 700, fontSize: 12 }}>
              {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function OpportunityDashboard() {
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [systems,    setSystems]    = useState<SystemRow[]>([]);
  const [topParts,   setTopParts]   = useState<PartRow[]>([]);
  const [elements,   setElements]   = useState<ElementRow[]>([]);
  const [suppliers,  setSuppliers]  = useState<SupplierRow[]>([]);
  const [trendData,  setTrendData]  = useState<TrendRow[]>([]);

  const [selectedSystem,  setSelectedSystem]  = useState<number | null>(null);
  const [selectedPart,    setSelectedPart]    = useState<PartRow | null>(null);
  const [filter,          setFilter]          = useState<VehicleFilter>({});

  const [loading,     setLoading]     = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);

  // Table state
  const [sortKey,   setSortKey]   = useState<keyof PartRow>('opportunity');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [search,    setSearch]    = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');

  const load = useCallback(async (sysId?: number) => {
    const sysParam = sysId ? `?systemId=${sysId}` : '';
    const [sumRes, sysRes, partRes, elRes, supRes] = await Promise.all([
      api.get<Summary>('/opportunity/summary'),
      api.get<SystemRow[]>('/opportunity/by-system'),
      api.get<PartRow[]>(`/opportunity/top-parts?limit=30${sysParam}`),
      api.get<ElementRow[]>(`/opportunity/element-heatmap${sysParam}`),
      api.get<SupplierRow[]>('/opportunity/supplier-scoreboard'),
    ]);
    setSummary(sumRes.data);
    setSystems(sysRes.data);
    setTopParts(partRes.data);
    setElements(elRes.data);
    setSuppliers(supRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(selectedSystem ?? undefined); }, [load, selectedSystem]);

  const loadTrend = useCallback(async (partId: number) => {
    setTrendLoading(true);
    const r = await api.get<TrendRow[]>(`/opportunity/version-trend?partId=${partId}`);
    setTrendData(r.data);
    setTrendLoading(false);
  }, []);

  const handleSelectPart = (part: PartRow) => {
    setSelectedPart(part);
    loadTrend(part.part_id);
  };

  const handleSystemSelect = (id: number | null) => {
    setSelectedSystem(id);
    setSelectedPart(null);
    setTrendData([]);
  };

  // Filter & sort parts table
  const displayParts = topParts
    .filter((p) => {
      if (riskFilter !== 'all' && p.risk_level !== riskFilter) return false;
      if (search && !p.part_number.toLowerCase().includes(search.toLowerCase()) &&
          !(p.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === 'desc' ? (bv - av) : (av - bv);
    });

  const handleSort = (key: keyof PartRow) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: string }) =>
    sortKey === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  const selectedSystemData = systems.find((s) => s.system_id === selectedSystem);

  // Derive filtered system data for hierarchy filter
  useEffect(() => {
    if (filter.systemId) setSelectedSystem(filter.systemId);
    else if (!filter.systemId && !selectedSystem) setSelectedSystem(null);
  }, [filter, selectedSystem]);

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Opportunity Dashboard
            </span>
            {selectedSystemData && (
              <span style={{
                fontSize: 14, fontWeight: 600, color: 'var(--accent)',
                background: 'var(--accent-glow)', padding: '4px 12px', borderRadius: 20,
              }}>
                {selectedSystemData.system_name}
              </span>
            )}
          </h1>
          <div className="sub">
            Should-Cost vs Latest Supplier Quotes — system-wise · interactive · real-time
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {selectedSystem && (
            <button className="btn btn-secondary btn-sm" onClick={() => handleSystemSelect(null)}>
              ✕ Clear System Filter
            </button>
          )}
        </div>
      </div>

      {/* ── Vehicle Hierarchy Filter ── */}
      <VehicleHierarchyFilter onChange={setFilter} />

      {/* ── KPI Strip ── */}
      <div className="stats-row">
        <KpiTile
          label="Total Savings Opportunity"
          value={summary?.total_opportunity ?? 0}
          prefix="$"
          decimals={2}
          sub="Quote above should-cost"
          accent={summary && summary.total_opportunity > 0 ? 'var(--danger)' : 'var(--success)'}
          loading={loading}
          large
        />
        <KpiTile
          label="Avg Variance %"
          value={summary?.avg_variance_pct ?? 0}
          suffix="%"
          decimals={1}
          sub="Best quote vs target"
          trend={summary?.avg_variance_pct}
          accent="var(--accent)"
          loading={loading}
        />
        <KpiTile
          label="Parts Over 10% Target"
          value={summary?.parts_over_10pct ?? 0}
          sub={`${summary?.parts_over_20pct ?? 0} are >20% (critical)`}
          accent="var(--danger)"
          loading={loading}
        />
        <KpiTile
          label="Parts Below Target"
          value={summary?.parts_below_target ?? 0}
          sub="Quotes at or below SC"
          accent="var(--success)"
          loading={loading}
        />
        <KpiTile
          label="Parts with SC"
          value={summary?.parts_with_sc ?? 0}
          sub={`${summary?.parts_quoted ?? 0} have at least 1 quote`}
          accent="var(--info)"
          loading={loading}
        />
      </div>

      {/* ── Row 2: Treemap + Top Parts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Treemap */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>System Opportunity Map</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                Size = opportunity magnitude · Colour = variance severity · Click to drill down
              </div>
            </div>
          </div>
          {loading ? <Skeleton height={340} /> : (
            <SystemTreemap data={systems} onSelect={handleSystemSelect} selectedId={selectedSystem} />
          )}
        </div>

        {/* Top opportunity parts list */}
        <div className="card" style={{ margin: 0, overflowY: 'auto', maxHeight: 440 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Top Opportunities</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            Parts ranked by savings potential
          </div>
          {loading ? <SkeletonCard rows={8} /> : topParts.slice(0, 12).map((p, i) => {
            const barWidth = topParts.length ? Math.min(100, (Math.abs(p.opportunity) / Math.abs(topParts[0].opportunity)) * 100) : 0;
            const isSelected = selectedPart?.part_id === p.part_id;
            return (
              <div
                key={p.part_id}
                onClick={() => handleSelectPart(p)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '10px 0', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--accent-glow)' : 'transparent',
                  borderRadius: isSelected ? 8 : 0,
                  paddingLeft: isSelected ? 10 : 0,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                      {i + 1}. {p.part_number}
                    </span>
                    {p.system_name && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>
                        {p.system_name.split(' ')[0]}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: p.opportunity > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {p.opportunity > 0 ? '+' : ''}${p.opportunity.toFixed(2)}
                    </span>
                    <RiskBadge level={p.risk_level} />
                  </div>
                </div>
                {/* Mini progress bar */}
                <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${barWidth}%`, borderRadius: 2,
                    background: p.opportunity > 0
                      ? `linear-gradient(90deg, var(--danger), #f87171)`
                      : `linear-gradient(90deg, var(--success), #34d399)`,
                    transition: 'width 0.8s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  SC: {p.should_cost.toFixed(2)} → Best: {p.best_price.toFixed(2)}
                  &nbsp;· {p.supplier_count} supplier{p.supplier_count !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Row 3: System bar chart (full width) ── */}
      <Section
        title="System-wise: Should-Cost vs Supplier Quotes"
        subtitle="Grouped bar per vehicle system — Should-Cost (indigo) · Best Quote (risk-coloured) · Avg Quote (grey)"
      >
        {loading ? <Skeleton height={360} /> : <SystemBarComparison data={systems} />}
      </Section>

      {/* ── Row 4: Version Trend + Element Heatmap ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Quote Version Trend</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            {selectedPart
              ? `Price trajectory for ${selectedPart.part_number} across quote versions`
              : 'Click a part in "Top Opportunities" to see its price trend'}
          </div>
          {trendLoading ? <Skeleton height={260} /> : <VersionTrendChart data={trendData} />}
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Cost Element Heatmap</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            Avg variance per cost element{selectedSystemData ? ` · ${selectedSystemData.system_name}` : ' · all systems'}
          </div>
          {loading ? <SkeletonCard rows={4} /> : <ElementHeatmap data={elements} />}
        </div>
      </div>

      {/* ── Row 5: Supplier Radar + Scoreboard ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Supplier Performance Radar</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            Multi-dimensional scoring — higher = better performance
          </div>
          {loading ? <Skeleton height={280} /> : <SupplierRadar data={suppliers} />}
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Supplier Scoreboard</div>
          {loading ? <SkeletonCard rows={5} /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Supplier</th>
                    <th>Country</th>
                    <th>Quotes</th>
                    <th>Avg Var %</th>
                    <th>At Target</th>
                    <th>Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s, i) => (
                    <tr key={s.supplier_id}>
                      <td style={{ color: 'var(--text-3)', fontWeight: 700 }}>{i + 1}</td>
                      <td><strong>{s.supplier_name}</strong></td>
                      <td style={{ color: 'var(--text-3)' }}>{s.country ?? '—'}</td>
                      <td>{s.quote_count}</td>
                      <td className={s.avg_variance_pct > 5 ? 'pos' : 'neg'}>
                        {s.avg_variance_pct > 0 ? '+' : ''}{s.avg_variance_pct.toFixed(1)}%
                      </td>
                      <td style={{ color: 'var(--success)' }}>
                        {s.parts_at_or_below_target}
                      </td>
                      <td style={{ color: s.parts_over_10pct > 0 ? 'var(--danger)' : 'var(--text-3)' }}>
                        {s.parts_over_10pct}
                      </td>
                    </tr>
                  ))}
                  {suppliers.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>No supplier data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 6: Full Opportunity Table ── */}
      <Section
        title="All Opportunities"
        subtitle={`${displayParts.length} of ${topParts.length} parts shown · click any row to see quote trend`}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="form-control"
              placeholder="Search part number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200, fontSize: 12 }}
            />
            <select className="form-control" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={{ width: 140, fontSize: 12 }}>
              <option value="all">All risk levels</option>
              <option value="critical">Critical (&gt;20%)</option>
              <option value="high">High (10-20%)</option>
              <option value="medium">Medium (5-10%)</option>
              <option value="low">Low (&lt;5%)</option>
              <option value="below">Below Target</option>
            </select>
          </div>
        }
      >
        {loading ? (
          <SkeletonCard rows={6} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('part_number')}>
                    Part Number{SortIcon({ col: 'part_number' })}
                  </th>
                  <th>Description</th>
                  <th>System</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('should_cost')}>
                    Should-Cost{SortIcon({ col: 'should_cost' })}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('best_price')}>
                    Best Quote{SortIcon({ col: 'best_price' })}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_price')}>
                    Avg Quote{SortIcon({ col: 'avg_price' })}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('opportunity')}>
                    Opportunity{SortIcon({ col: 'opportunity' })}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('variance_pct')}>
                    Var %{SortIcon({ col: 'variance_pct' })}
                  </th>
                  <th>Suppliers</th>
                  <th>Risk</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayParts.map((p) => {
                  const isSelected = selectedPart?.part_id === p.part_id;
                  return (
                    <tr
                      key={p.part_id}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'var(--accent-glow)' : undefined,
                      }}
                      onClick={() => handleSelectPart(p)}
                    >
                      <td>
                        <strong style={{ color: 'var(--text-1)' }}>{p.part_number}</strong>
                      </td>
                      <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{p.description ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.system_name?.split('–')[0].trim() ?? '—'}</td>
                      <td>{p.should_cost.toFixed(2)}</td>
                      <td><strong>{p.best_price.toFixed(2)}</strong></td>
                      <td style={{ color: 'var(--text-2)' }}>{p.avg_price.toFixed(2)}</td>
                      <td>
                        <strong className={p.opportunity > 0 ? 'pos' : 'neg'}>
                          {p.opportunity > 0 ? '+' : ''}${p.opportunity.toFixed(2)}
                        </strong>
                      </td>
                      <td>
                        <span className={p.variance_pct > 10 ? 'pos' : p.variance_pct < 0 ? 'neg' : ''} style={{ fontWeight: 600 }}>
                          {p.variance_pct > 0 ? '+' : ''}{p.variance_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-3)' }}>{p.supplier_count}</td>
                      <td><RiskBadge level={p.risk_level} /></td>
                      <td>
                        <button className="btn btn-secondary btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleSelectPart(p); }}>
                          Trend ↗
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {displayParts.length === 0 && (
                  <tr>
                    <td colSpan={11}>
                      <div className="empty-state">
                        <div className="empty-icon">🔍</div>
                        <p>No parts match the current filter.</p>
                        <p style={{ fontSize: 12 }}>Publish should-cost records and submit supplier quotes to see opportunities here.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Selected part detail card ── */}
      {selectedPart && (
        <div className="card" style={{
          border: '2px solid var(--accent)',
          background: 'linear-gradient(135deg, var(--accent-glow), var(--surface))',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>
                {selectedPart.part_number}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                {selectedPart.description} · {selectedPart.system_name}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <ExportButtons comparisonId={selectedPart.part_id} />
              <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedPart(null); setTrendData([]); }}>
                Close ✕
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { l: 'Should-Cost', v: `$${selectedPart.should_cost.toFixed(2)}`, c: 'var(--accent)' },
              { l: 'Best Quote',  v: `$${selectedPart.best_price.toFixed(2)}`,  c: selectedPart.opportunity > 0 ? 'var(--danger)' : 'var(--success)' },
              { l: 'Avg Quote',   v: `$${selectedPart.avg_price.toFixed(2)}`,   c: 'var(--text-2)' },
              { l: 'Opportunity', v: `${selectedPart.opportunity > 0 ? '+' : ''}$${selectedPart.opportunity.toFixed(2)}`, c: selectedPart.opportunity > 0 ? 'var(--danger)' : 'var(--success)' },
              { l: 'Variance',    v: `${selectedPart.variance_pct > 0 ? '+' : ''}${selectedPart.variance_pct.toFixed(1)}%`, c: selectedPart.variance_pct > 10 ? 'var(--danger)' : 'var(--success)' },
            ].map((kpi) => (
              <div key={kpi.l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{kpi.l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: kpi.c }}>{kpi.v}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>
              Quote Price History
            </div>
            {trendLoading ? <Skeleton height={260} /> : <VersionTrendChart data={trendData} />}
          </div>
        </div>
      )}
    </div>
  );
}
