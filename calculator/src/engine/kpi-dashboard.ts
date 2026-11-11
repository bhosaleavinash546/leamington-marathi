/**
 * Global Cost Engineering KPI Dashboard — the reporting model (pure; no DB, no DOM).
 *
 * Spec: CostVision_KPI_Dashboard_Spec.md (11 Nov 2026); audit + decisions in
 * docs/dashboard/kpi-dashboard-audit-2026-11-11.md. Every number the dashboard, the CSV,
 * the Excel and the PDF show comes from `buildDashboard` — no renderer computes a figure.
 *
 * RULES (each is tested in tests/kpi-dashboard*.test.ts):
 *  - A record is EXCLUDED when deleted, marked test, or invalid (bad currency code, a
 *    negative or non-finite cost, no component name, no costing date). Excluded records
 *    are counted in data quality and listed for admins; they are in no KPI or chart.
 *  - Classification runs on the WHOLE visible set BEFORE filters, so a filter can never
 *    turn an old revision back into the current one.
 *  - A component is identified by its PART NUMBER (normalised: upper case, no spaces).
 *    An APPLICATION is part number × programme × model year × powertrain — the same part
 *    on L460 and L461 is two applications. Names are never used to merge records.
 *    A record with no part number is its own application and is flagged "unidentified".
 *  - In each application one record is CURRENT: the newest non-draft (or the newest
 *    draft when all are drafts). Older records by the same owner are SUPERSEDED; records
 *    by another owner are DUPLICATE candidates. Only current records enter financial
 *    KPIs; every included record (all revisions) enters activity charts.
 *  - Money: each value is converted to GBP on its OWN frozen FX snapshot (GBP per one
 *    unit). Gap = GBP current − GBP should; gap % = Σ gap ÷ Σ GBP current (weighted —
 *    never a mean of percentages). A missing cost is never zero: the record is not
 *    financially eligible and is counted under its reason. Current and should-cost are
 *    compared only on the same delivery terms and unit.
 *  - Positive gaps are the potential opportunity; negative gaps are reported apart as
 *    unfavourable. The sum is a sum of PER-PIECE gaps, labelled so. An annualised figure
 *    uses only records whose annual volume is marked validated.
 *  - Original-currency mode totals each currency separately; currencies are never added.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordStatus = 'draft' | 'completed' | 'reviewed' | 'approved';
export const RECORD_STATUSES: readonly RecordStatus[] = ['draft', 'completed', 'reviewed', 'approved'];
export const STATUS_LABEL: Record<RecordStatus, string> = {
  draft: 'Draft', completed: 'Completed', reviewed: 'Reviewed', approved: 'Approved',
};

export type DeliveryTerms = 'DAP' | 'EXW';
export type SavingStatus = 'validated' | 'implemented';

/** Programmes and powertrains the spec names. The filter options are still read from the
 *  data — these only order them and let coverage insights say which have no records. */
export const STANDARD_PROGRAMMES = ['L460', 'L461', 'L663', 'EMA', 'JEA'] as const;
export const STANDARD_POWERTRAINS = ['MHEV', 'Petrol PHEV', 'Diesel PHEV', 'Petrol', 'BEV'] as const;

export type FxMethod = 'monthly' | 'costing-date' | 'reporting-date' | 'identity';
export const FX_METHOD_LABEL: Record<FxMethod, string> = {
  monthly: 'Approved monthly rate for the costing month',
  'costing-date': 'Rate in force on the costing date',
  'reporting-date': 'Latest loaded rate (reporting date)',
  identity: 'GBP — no conversion',
};

/** One FX conversion as frozen on a record. */
export interface FxApplied {
  currency: string;
  /** GBP per ONE unit of `currency`. */
  gbpPerUnit: number;
  source: string;
  /** Date the rate applies to (YYYY-MM-DD, or YYYY-MM for a monthly rate). */
  effectiveDate: string;
  /** When the rate was looked up / frozen (ISO timestamp). */
  retrievedAt: string;
  method: FxMethod;
  /** False when the built-in reference rate was used because no approved rate was loaded. */
  approved: boolean;
}

export interface FxSnapshot {
  should?: FxApplied | null;
  current?: FxApplied | null;
  saving?: FxApplied | null;
}

/** A saved costing record as the dashboard reads it (one row of `costing_records`). */
export interface KpiRecord {
  id: string;
  sourceTool: string;
  sourceRef: string;
  ownerId: string;
  ownerName: string;
  partNumber: string | null;
  componentName: string;
  commodity: string | null;
  programme: string | null;
  modelYear: number | null;
  powertrain: string | null;
  country: string | null;
  status: RecordStatus;
  /** YYYY-MM-DD — the date the costing was done. Drives the date filter and FX. */
  costingDate: string;
  createdAt: string;
  updatedAt: string;
  shouldCost: number | null;
  shouldCcy: string | null;
  shouldTerms: DeliveryTerms | null;
  currentCost: number | null;
  currentCcy: string | null;
  currentTerms: DeliveryTerms | null;
  currentSource: string | null;
  costUnit: string;
  annualVolume: number | null;
  volumeValidated: boolean;
  savingStatus: SavingStatus | null;
  savingPerPiece: number | null;
  savingCcy: string | null;
  fx: FxSnapshot;
  /** Frozen GBP values (original × its snapshot rate). Null when not convertible. */
  gbpShould: number | null;
  gbpCurrent: number | null;
  gbpSaving: number | null;
  isTest: boolean;
  deleted: boolean;
  notes: string;
}

export type ExcludeReason = 'deleted' | 'test' | 'invalid';
export type RecordRole = 'current' | 'superseded' | 'duplicate';
export type IneligibleReason =
  | 'not-current' | 'missing-should-cost' | 'missing-current-cost' | 'missing-fx' | 'basis-mismatch';

export const INELIGIBLE_LABEL: Record<IneligibleReason, string> = {
  'not-current': 'Older revision or duplicate',
  'missing-should-cost': 'No should-cost',
  'missing-current-cost': 'No current cost',
  'missing-fx': 'No FX rate',
  'basis-mismatch': 'Different cost basis',
};

export interface ClassifiedRecord extends KpiRecord {
  excluded: ExcludeReason | null;
  invalidReasons: string[];
  /** Null for excluded records. */
  role: RecordRole | null;
  applicationKey: string;
  partKey: string | null;
  /** True for a current record with both GBP values on the same basis. */
  eligible: boolean;
  ineligible: IneligibleReason | null;
  /** GBP current − GBP should; only when eligible. */
  gapGbp: number | null;
  /** gap ÷ GBP current × 100; only when eligible. */
  gapPct: number | null;
  /** Records in the same application by another owner (duplicate candidates). */
  duplicateOf: string | null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const ISO_RE = /^[A-Z]{3}$/;
let _isoSet: Set<string> | null = null;
/** ISO 4217 codes the runtime knows (Intl) — dynamic, not a hand list. */
export function iso4217Codes(): Set<string> {
  if (_isoSet) return _isoSet;
  let list: string[] = [];
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (sv) list = sv('currency');
  } catch { /* old runtime */ }
  _isoSet = new Set(list.length ? list : ['GBP', 'EUR', 'USD']);
  return _isoSet;
}
export function isIsoCurrency(code: unknown): code is string {
  return typeof code === 'string' && ISO_RE.test(code) && iso4217Codes().has(code);
}
export function currencySymbol(code: string): string {
  try {
    const p = new Intl.NumberFormat('en-GB', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(1).find(x => x.type === 'currency');
    return p?.value ?? code;
  } catch { return code; }
}

export function normalisePartNumber(pn: string | null | undefined): string | null {
  if (typeof pn !== 'string') return null;
  const k = pn.toUpperCase().replace(/\s+/g, '').trim();
  return k.length ? k : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

const finitePos = (n: number | null): boolean => n !== null && Number.isFinite(n) && n > 0;
const statusRank = (s: RecordStatus): number => (s === 'draft' ? 0 : 1);

// ─── FX resolution ────────────────────────────────────────────────────────────

/** One row of the FX table (admin-loaded). `period` is YYYY-MM (monthly) or YYYY-MM-DD (daily). */
export interface FxRateRow {
  currency: string;
  period: string;
  gbpPerUnit: number;
  source: string;
  loadedAt: string;
}

export interface FxReference {
  /** Built-in reference rates, GBP per unit. */
  rates: Record<string, number>;
  source: string;
  effectiveDate: string;
}

export type FxResolution = { ok: true; fx: FxApplied } | { ok: false; reason: 'unsupported-currency' | 'no-rate' };

/**
 * The rate a value in `currency` costed on `costingDate` converts at, under `policy`.
 * Approved table rows win; the built-in reference is the stated fallback (approved:false).
 * Never 1:1 except GBP itself.
 */
export function resolveFx(
  currency: string, costingDate: string, policy: Exclude<FxMethod, 'identity'>,
  table: FxRateRow[], reference: FxReference, nowIso: string,
): FxResolution {
  if (currency === 'GBP') {
    return { ok: true, fx: { currency, gbpPerUnit: 1, source: 'GBP — no conversion', effectiveDate: costingDate, retrievedAt: nowIso, method: 'identity', approved: true } };
  }
  if (!isIsoCurrency(currency)) return { ok: false, reason: 'unsupported-currency' };
  const rows = table.filter(r => r.currency === currency && Number.isFinite(r.gbpPerUnit) && r.gbpPerUnit > 0);
  const month = costingDate.slice(0, 7);
  let pick: FxRateRow | undefined;
  if (policy === 'monthly') {
    pick = rows.find(r => r.period === month);
  } else if (policy === 'costing-date') {
    const daily = rows.filter(r => r.period.length === 10 && r.period <= costingDate).sort((a, b) => b.period.localeCompare(a.period));
    pick = daily[0] ?? rows.find(r => r.period === month);
  } else {
    pick = [...rows].sort((a, b) => b.period.localeCompare(a.period))[0];
  }
  if (pick) {
    return { ok: true, fx: { currency, gbpPerUnit: pick.gbpPerUnit, source: pick.source, effectiveDate: pick.period, retrievedAt: nowIso, method: policy, approved: true } };
  }
  const ref = reference.rates[currency];
  if (Number.isFinite(ref) && ref > 0) {
    return { ok: true, fx: { currency, gbpPerUnit: ref, source: reference.source, effectiveDate: reference.effectiveDate, retrievedAt: nowIso, method: policy, approved: false } };
  }
  return { ok: false, reason: 'no-rate' };
}

/** original × rate — the one conversion every GBP figure goes through. */
export function toGbp(amount: number | null, fx: FxApplied | null | undefined): number | null {
  if (amount === null || !Number.isFinite(amount) || !fx || !(fx.gbpPerUnit > 0)) return null;
  return amount * fx.gbpPerUnit;
}

// ─── Classification ───────────────────────────────────────────────────────────

export function validationIssues(r: KpiRecord): string[] {
  const out: string[] = [];
  if (!r.componentName?.trim()) out.push('No component name');
  if (!isIsoDate(r.costingDate)) out.push('No valid costing date');
  for (const [v, c, label] of [[r.shouldCost, r.shouldCcy, 'should-cost'], [r.currentCost, r.currentCcy, 'current cost'], [r.savingPerPiece, r.savingCcy, 'saving']] as const) {
    if (v === null) continue;
    if (!Number.isFinite(v) || v < 0) out.push(`Invalid ${label} value`);
    if (!isIsoCurrency(c)) out.push(`Invalid ${label} currency "${c ?? ''}"`);
  }
  if (!RECORD_STATUSES.includes(r.status)) out.push(`Unknown status "${r.status}"`);
  return out;
}

export function classifyRecords(records: KpiRecord[]): ClassifiedRecord[] {
  const out: ClassifiedRecord[] = records.map(r => {
    const invalidReasons = validationIssues(r);
    const excluded: ExcludeReason | null = r.deleted ? 'deleted' : r.isTest ? 'test' : invalidReasons.length ? 'invalid' : null;
    const partKey = normalisePartNumber(r.partNumber);
    const applicationKey = partKey
      ? [partKey, r.programme ?? '—', r.modelYear ?? '—', r.powertrain ?? '—'].join('|')
      : `record:${r.id}`;
    return { ...r, excluded, invalidReasons, role: null, applicationKey, partKey, eligible: false, ineligible: null, gapGbp: null, gapPct: null, duplicateOf: null };
  });

  const groups = new Map<string, ClassifiedRecord[]>();
  for (const c of out) {
    if (c.excluded) continue;
    const g = groups.get(c.applicationKey) ?? [];
    g.push(c);
    groups.set(c.applicationKey, g);
  }
  for (const g of groups.values()) {
    g.sort((a, b) =>
      statusRank(b.status) - statusRank(a.status)
      || b.costingDate.localeCompare(a.costingDate)
      || b.updatedAt.localeCompare(a.updatedAt)
      || b.id.localeCompare(a.id));
    const cur = g[0];
    cur.role = 'current';
    // A record its OWN owner has since revised is an older revision; another owner's latest
    // costing of the same application is a duplicate candidate of the current one.
    const seenOwner = new Set<string>([cur.ownerId]);
    for (const o of g.slice(1)) {
      if (seenOwner.has(o.ownerId)) { o.role = 'superseded'; continue; }
      seenOwner.add(o.ownerId);
      o.role = 'duplicate';
      o.duplicateOf = cur.id;
    }
  }

  for (const c of out) {
    if (c.excluded) continue;
    if (c.role !== 'current') { c.ineligible = 'not-current'; continue; }
    if (!finitePos(c.shouldCost)) { c.ineligible = 'missing-should-cost'; continue; }
    if (!finitePos(c.currentCost)) { c.ineligible = 'missing-current-cost'; continue; }
    if (c.gbpShould === null || c.gbpCurrent === null) { c.ineligible = 'missing-fx'; continue; }
    if (!c.currentTerms || !c.shouldTerms || c.currentTerms !== c.shouldTerms) { c.ineligible = 'basis-mismatch'; continue; }
    c.eligible = true;
    c.gapGbp = c.gbpCurrent - c.gbpShould;
    c.gapPct = c.gbpCurrent > 0 ? (c.gapGbp / c.gbpCurrent) * 100 : null;
  }
  return out;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export type DatePreset = '7d' | '30d' | '90d' | '12m' | 'ytd' | 'all' | 'custom';
export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months',
  ytd: 'Year to date', all: 'All time', custom: 'Custom range',
};

export interface DashboardFilters {
  commodity: string[];
  programme: string[];
  modelYear: string[];
  powertrain: string[];
  tool: string[];
  country: string[];
  currency: string[];
  status: string[];
  createdBy: string[];
  datePreset: DatePreset;
  dateFrom?: string;
  dateTo?: string;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  commodity: [], programme: [], modelYear: [], powertrain: [], tool: [], country: [], currency: [], status: [], createdBy: [],
  datePreset: '12m',
};

export const NOT_SET = '(not set)';
const dimValue = (v: string | number | null | undefined): string => (v === null || v === undefined || v === '' ? NOT_SET : String(v));

/** The inclusive date window a preset means, as of `today` (YYYY-MM-DD). */
export function dateWindow(f: Pick<DashboardFilters, 'datePreset' | 'dateFrom' | 'dateTo'>, today: string): { from: string | null; to: string | null } {
  const d = new Date(today + 'T00:00:00Z');
  const back = (days: number) => new Date(d.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  switch (f.datePreset) {
    case '7d': return { from: back(7), to: today };
    case '30d': return { from: back(30), to: today };
    case '90d': return { from: back(90), to: today };
    case '12m': {
      const from = new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate() + 1)).toISOString().slice(0, 10);
      return { from, to: today };
    }
    case 'ytd': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'custom': return { from: isIsoDate(f.dateFrom) ? f.dateFrom : null, to: isIsoDate(f.dateTo) ? f.dateTo : null };
    default: return { from: null, to: null };
  }
}

export const DIMENSIONS = ['commodity', 'programme', 'modelYear', 'powertrain', 'tool', 'country', 'currency', 'status', 'createdBy'] as const;
export type Dimension = typeof DIMENSIONS[number];

/** The value(s) a record carries for a filter dimension. Currency matches either original currency. */
export function dimValues(r: KpiRecord, dim: Dimension): string[] {
  switch (dim) {
    case 'commodity': return [dimValue(r.commodity)];
    case 'programme': return [dimValue(r.programme)];
    case 'modelYear': return [dimValue(r.modelYear)];
    case 'powertrain': return [dimValue(r.powertrain)];
    case 'tool': return [dimValue(r.sourceTool)];
    case 'country': return [dimValue(r.country)];
    case 'status': return [r.status];
    case 'createdBy': return [dimValue(r.ownerName)];
    case 'currency': {
      const s = new Set<string>();
      if (r.shouldCcy && r.shouldCost !== null) s.add(r.shouldCcy);
      if (r.currentCcy && r.currentCost !== null) s.add(r.currentCcy);
      return s.size ? [...s] : [NOT_SET];
    }
  }
}

export function matchesFilters(r: KpiRecord, f: DashboardFilters, win: { from: string | null; to: string | null }, skip?: Dimension): boolean {
  if (win.from && r.costingDate < win.from) return false;
  if (win.to && r.costingDate > win.to) return false;
  for (const dim of DIMENSIONS) {
    if (dim === skip) continue;
    const sel = f[dim];
    if (!sel?.length) continue;
    if (!dimValues(r, dim).some(v => sel.includes(v))) return false;
  }
  return true;
}

/** Validate an untrusted filter object (query string / body). Unknown keys dropped. */
export function parseFilters(raw: unknown): DashboardFilters {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown): string[] => {
    // A single string is ONE value — never split on commas (a name may contain one).
    const arr = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
    return arr.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120).slice(0, 200);
  };
  const preset = typeof o.datePreset === 'string' && o.datePreset in DATE_PRESET_LABEL ? o.datePreset as DatePreset : '12m';
  const f: DashboardFilters = { ...DEFAULT_FILTERS, datePreset: preset };
  for (const d of DIMENSIONS) f[d] = list(o[d]);
  if (preset === 'custom') {
    if (isIsoDate(o.dateFrom)) f.dateFrom = o.dateFrom;
    if (isIsoDate(o.dateTo)) f.dateTo = o.dateTo;
  }
  return f;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export interface Sum { n: number; gbp: number }
export interface FinancialKpis {
  eligible: number;
  sumCurrentGbp: number;
  sumShouldGbp: number;
  sumGapGbp: number;
  /** Σ gap ÷ Σ current × 100 over eligible records; null with none. */
  weightedGapPct: number | null;
  opportunity: Sum;          // Σ positive per-piece gaps
  unfavourable: Sum;         // Σ negative per-piece gaps (≤ 0)
  annualised: Sum;           // Σ positive gap × validated annual volume
  validatedSavings: Sum;
  implementedSavings: Sum;
}

export interface OperationalKpis {
  totalRecords: number;      // included records (all revisions) in the filter
  currentRecords: number;    // one per application
  uniqueComponents: number;  // distinct part numbers
  unidentified: number;      // current records with no part number
  completedRecords: number;  // current records completed / reviewed / approved
  commodities: number;
  programmes: number;
  needsReview: number;       // current: completed (awaiting review) + reviewed (awaiting approval)
  awaitingReview: number;
  awaitingApproval: number;
}

export interface CategoryRow { key: string; count: number; currentGbp?: number; shouldGbp?: number; gapGbp?: number; opportunityGbp?: number; eligible?: number }
export interface TimePoint { bucket: string; label: string; count: number }
export interface HeatCell { commodity: string; programme: string; count: number; opportunityGbp: number }

export interface CurrencyTotal {
  currency: string; symbol: string;
  currentRecords: number; sumCurrent: number;
  shouldRecords: number; sumShould: number;
  /** Records whose current and should-cost are both in this currency (gap in original currency). */
  sameCcyRecords: number; sumGap: number;
}

export interface DataQuality {
  retrieved: number;
  included: number;
  excluded: number;
  excludedBy: Record<ExcludeReason, number>;
  financiallyEligible: number;
  missingShouldCost: number;
  missingCurrentCost: number;
  missingFx: number;
  basisMismatch: number;
  unapprovedFx: number;
  duplicateCandidates: number;
  supersededRevisions: number;
  missingClassification: { partNumber: number; commodity: number; programme: number; modelYear: number; powertrain: number };
}

export interface Insight { id: string; tone: 'info' | 'good' | 'warn'; title: string; detail: string; filter?: Partial<Record<Dimension, string[]>> }

export interface FilterOption { value: string; count: number }

export interface DrillGroup { key: string; label: string; count: number; eligible: number; currentGbp: number; shouldGbp: number; gapGbp: number; opportunityGbp: number }

export const DRILL_LEVELS = ['commodity', 'programme', 'powertrain', 'modelYear', 'component', 'record'] as const;
export type DrillLevel = typeof DRILL_LEVELS[number];
export const DRILL_LABEL: Record<DrillLevel, string> = {
  commodity: 'Commodity', programme: 'Programme', powertrain: 'Powertrain', modelYear: 'Model year', component: 'Component', record: 'Costing record',
};

export interface DashboardSummary {
  generatedAt: string;
  window: { from: string | null; to: string | null; preset: DatePreset };
  filters: DashboardFilters;
  operational: OperationalKpis;
  financial: FinancialKpis;
  charts: {
    activity: TimePoint[];
    activityGranularity: 'day' | 'week' | 'month';
    byCommodity: CategoryRow[];
    costByCommodity: CategoryRow[];
    opportunityByCommodity: CategoryRow[];
    byProgramme: CategoryRow[];
    byPowertrain: CategoryRow[];
    byModelYear: CategoryRow[];
    byTool: CategoryRow[];
    heatmap: { commodities: string[]; programmes: string[]; cells: HeatCell[] };
    opportunityByPowertrain: CategoryRow[];
    byStatus: CategoryRow[];
    /** GBP sums over eligible current records, for the analysis sheets (same rule as costByCommodity). */
    costByProgramme: CategoryRow[];
    costByPowertrain: CategoryRow[];
    costByModelYear: CategoryRow[];
  };
  currencyTotals: CurrencyTotal[];
  dataQuality: DataQuality;
  insights: Insight[];
  options: Record<Dimension, FilterOption[]>;
  fx: { policy: Exclude<FxMethod, 'identity'>; approvedRates: number; reference: string };
}

const sortCount = (a: CategoryRow, b: CategoryRow) => b.count - a.count || a.key.localeCompare(b.key);

function countBy(rows: ClassifiedRecord[], key: (r: ClassifiedRecord) => string): CategoryRow[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort(sortCount);
}

function moneyBy(rows: ClassifiedRecord[], key: (r: ClassifiedRecord) => string): CategoryRow[] {
  const m = new Map<string, CategoryRow>();
  for (const r of rows) {
    if (!r.eligible) continue;
    const k = key(r);
    const row = m.get(k) ?? { key: k, count: 0, eligible: 0, currentGbp: 0, shouldGbp: 0, gapGbp: 0, opportunityGbp: 0 };
    row.count++; row.eligible!++;
    row.currentGbp! += r.gbpCurrent!; row.shouldGbp! += r.gbpShould!; row.gapGbp! += r.gapGbp!;
    if (r.gapGbp! > 0) row.opportunityGbp! += r.gapGbp!;
    m.set(k, row);
  }
  return [...m.values()];
}

function orderedBy(rows: CategoryRow[], order: readonly string[]): CategoryRow[] {
  const idx = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length + (k === NOT_SET ? 1000 : 0) : i; };
  return [...rows].sort((a, b) => idx(a.key) - idx(b.key) || a.key.localeCompare(b.key));
}

function granularity(from: string | null, to: string | null, rows: ClassifiedRecord[]): 'day' | 'week' | 'month' {
  const dates = rows.map(r => r.costingDate).sort();
  const a = from ?? dates[0]; const b = to ?? dates[dates.length - 1];
  if (!a || !b) return 'month';
  const days = (Date.parse(b) - Date.parse(a)) / 86400000;
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
}

function weekStart(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function bucketLabel(bucket: string, g: 'day' | 'week' | 'month'): string {
  const y = bucket.slice(0, 4); const m = MONTHS[Number(bucket.slice(5, 7)) - 1];
  if (g === 'month') return `${m} ${y}`;
  const d = String(Number(bucket.slice(8, 10)));
  return g === 'week' ? `w/c ${d} ${m}` : `${d} ${m}`;
}

/** Continuous time series (empty buckets kept at 0, so the line is honest). */
function activitySeries(rows: ClassifiedRecord[], from: string | null, to: string | null, g: 'day' | 'week' | 'month'): TimePoint[] {
  if (!rows.length && (!from || !to)) return [];
  const dates = rows.map(r => r.costingDate).sort();
  const start = from ?? dates[0]; const end = to ?? dates[dates.length - 1];
  const keyOf = (d: string) => (g === 'day' ? d : g === 'week' ? weekStart(d) : d.slice(0, 7) + '-01');
  const counts = new Map<string, number>();
  for (const r of rows) { const k = keyOf(r.costingDate); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const out: TimePoint[] = [];
  let cur = keyOf(start); const last = keyOf(end);
  let guard = 0;
  while (cur <= last && guard++ < 2000) {
    out.push({ bucket: cur, label: bucketLabel(cur, g), count: counts.get(cur) ?? 0 });
    const d = new Date(cur + 'T00:00:00Z');
    if (g === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (g === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

export function financialKpis(current: ClassifiedRecord[]): FinancialKpis {
  const f: FinancialKpis = {
    eligible: 0, sumCurrentGbp: 0, sumShouldGbp: 0, sumGapGbp: 0, weightedGapPct: null,
    opportunity: { n: 0, gbp: 0 }, unfavourable: { n: 0, gbp: 0 }, annualised: { n: 0, gbp: 0 },
    validatedSavings: { n: 0, gbp: 0 }, implementedSavings: { n: 0, gbp: 0 },
  };
  for (const r of current) {
    if (r.role !== 'current') continue;
    if (r.savingStatus && r.gbpSaving !== null && r.gbpSaving >= 0) {
      const s = r.savingStatus === 'validated' ? f.validatedSavings : f.implementedSavings;
      s.n++; s.gbp += r.gbpSaving;
    }
    if (!r.eligible) continue;
    f.eligible++;
    f.sumCurrentGbp += r.gbpCurrent!; f.sumShouldGbp += r.gbpShould!; f.sumGapGbp += r.gapGbp!;
    if (r.gapGbp! > 0) {
      f.opportunity.n++; f.opportunity.gbp += r.gapGbp!;
      if (r.volumeValidated && r.annualVolume !== null && r.annualVolume > 0) {
        f.annualised.n++; f.annualised.gbp += r.gapGbp! * r.annualVolume;
      }
    } else if (r.gapGbp! < 0) {
      f.unfavourable.n++; f.unfavourable.gbp += r.gapGbp!;
    }
  }
  f.weightedGapPct = f.eligible && f.sumCurrentGbp > 0 ? (f.sumGapGbp / f.sumCurrentGbp) * 100 : null;
  return f;
}

export function currencyTotals(current: ClassifiedRecord[]): CurrencyTotal[] {
  const m = new Map<string, CurrencyTotal>();
  const get = (c: string) => {
    let t = m.get(c);
    if (!t) { t = { currency: c, symbol: currencySymbol(c), currentRecords: 0, sumCurrent: 0, shouldRecords: 0, sumShould: 0, sameCcyRecords: 0, sumGap: 0 }; m.set(c, t); }
    return t;
  };
  for (const r of current) {
    if (r.role !== 'current') continue;
    const hasCur = r.currentCost !== null && r.currentCcy; const hasShould = r.shouldCost !== null && r.shouldCcy;
    if (hasCur) { const t = get(r.currentCcy!); t.currentRecords++; t.sumCurrent += r.currentCost!; }
    if (hasShould) { const t = get(r.shouldCcy!); t.shouldRecords++; t.sumShould += r.shouldCost!; }
    if (hasCur && hasShould && r.currentCcy === r.shouldCcy && r.currentTerms && r.currentTerms === r.shouldTerms) {
      const t = get(r.currentCcy!); t.sameCcyRecords++; t.sumGap += r.currentCost! - r.shouldCost!;
    }
  }
  return [...m.values()].sort((a, b) => (a.currency === 'GBP' ? -1 : b.currency === 'GBP' ? 1 : a.currency.localeCompare(b.currency)));
}

export function dataQuality(all: ClassifiedRecord[], filtered: ClassifiedRecord[], filteredExcluded: ClassifiedRecord[]): DataQuality {
  const cur = filtered.filter(r => r.role === 'current');
  const excludedBy: Record<ExcludeReason, number> = { deleted: 0, test: 0, invalid: 0 };
  for (const r of filteredExcluded) excludedBy[r.excluded!]++;
  const usesUnapproved = (r: ClassifiedRecord) => [r.fx.should, r.fx.current, r.fx.saving].some(x => x && !x.approved);
  void all;
  return {
    retrieved: filtered.length + filteredExcluded.length,
    included: filtered.length,
    excluded: filteredExcluded.length,
    excludedBy,
    financiallyEligible: cur.filter(r => r.eligible).length,
    missingShouldCost: cur.filter(r => r.ineligible === 'missing-should-cost').length,
    missingCurrentCost: cur.filter(r => r.ineligible === 'missing-current-cost').length,
    missingFx: cur.filter(r => r.ineligible === 'missing-fx').length,
    basisMismatch: cur.filter(r => r.ineligible === 'basis-mismatch').length,
    unapprovedFx: cur.filter(usesUnapproved).length,
    duplicateCandidates: filtered.filter(r => r.role === 'duplicate').length,
    supersededRevisions: filtered.filter(r => r.role === 'superseded').length,
    missingClassification: {
      partNumber: cur.filter(r => !r.partKey).length,
      commodity: cur.filter(r => !r.commodity).length,
      programme: cur.filter(r => !r.programme).length,
      modelYear: cur.filter(r => r.modelYear === null).length,
      powertrain: cur.filter(r => !r.powertrain).length,
    },
  };
}

/** Thresholds the insights use — stated on screen, not hidden. */
export const INSIGHT_THRESHOLDS = {
  limitedCoverageRecords: 3,
  significantGapPct: 15,
} as const;

const gbp0 = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const gbp2 = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct1 = (n: number) => `${n.toFixed(1)}%`;

export function buildInsights(filtered: ClassifiedRecord[], today: string): Insight[] {
  const out: Insight[] = [];
  const cur = filtered.filter(r => r.role === 'current');
  if (!filtered.length) return out;

  const byCom = countBy(filtered, r => dimValue(r.commodity)).filter(r => r.key !== NOT_SET);
  if (byCom.length) {
    const top = byCom[0];
    out.push({ id: 'top-activity', tone: 'info', title: `Most costing activity: ${top.key}`,
      detail: `${top.count} of ${filtered.length} saved costings (${pct1((top.count / filtered.length) * 100)}) in this view.`, filter: { commodity: [top.key] } });
  }
  const opp = moneyBy(cur, r => dimValue(r.commodity)).filter(r => (r.opportunityGbp ?? 0) > 0).sort((a, b) => b.opportunityGbp! - a.opportunityGbp!);
  if (opp.length) {
    out.push({ id: 'top-opportunity', tone: 'good', title: `Largest potential unit cost opportunity: ${opp[0].key}`,
      detail: `${gbp2(opp[0].opportunityGbp!)} per piece summed over ${opp[0].eligible} component application(s) where the current cost is above should-cost. Not an annual saving.`, filter: { commodity: [opp[0].key] } });
  }
  const progs = new Set(cur.map(r => r.programme).filter(Boolean) as string[]);
  const missingProg = STANDARD_PROGRAMMES.filter(p => !progs.has(p));
  const pts = new Set(cur.map(r => r.powertrain).filter(Boolean) as string[]);
  const missingPt = STANDARD_POWERTRAINS.filter(p => !pts.has(p));
  out.push({ id: 'coverage', tone: missingProg.length || missingPt.length ? 'warn' : 'good',
    title: `Coverage: ${STANDARD_PROGRAMMES.length - missingProg.length} of ${STANDARD_PROGRAMMES.length} programmes, ${STANDARD_POWERTRAINS.length - missingPt.length} of ${STANDARD_POWERTRAINS.length} powertrains`,
    detail: [missingProg.length ? `No current costing for ${missingProg.join(', ')}.` : 'Every programme has a current costing.',
      missingPt.length ? `No current costing for ${missingPt.join(', ')}.` : 'Every powertrain has a current costing.'].join(' ') });

  const comCur = countBy(cur, r => dimValue(r.commodity)).filter(r => r.key !== NOT_SET && r.count < INSIGHT_THRESHOLDS.limitedCoverageRecords);
  if (comCur.length) {
    out.push({ id: 'limited-coverage', tone: 'warn', title: `${comCur.length} commodit${comCur.length === 1 ? 'y has' : 'ies have'} fewer than ${INSIGHT_THRESHOLDS.limitedCoverageRecords} current costings`,
      detail: comCur.slice(0, 6).map(c => `${c.key} (${c.count})`).join(', ') + (comCur.length > 6 ? ` and ${comCur.length - 6} more.` : '.') });
  }
  const sig = cur.filter(r => r.eligible && r.gapPct !== null && Math.abs(r.gapPct) >= INSIGHT_THRESHOLDS.significantGapPct)
    .sort((a, b) => Math.abs(b.gapGbp!) - Math.abs(a.gapGbp!));
  if (sig.length) {
    out.push({ id: 'significant-gaps', tone: 'warn', title: `${sig.length} component application(s) with a gap of ${INSIGHT_THRESHOLDS.significantGapPct}% or more`,
      detail: sig.slice(0, 3).map(r => `${r.partNumber ?? r.componentName}: ${gbp2(r.gapGbp!)} (${pct1(r.gapPct!)})`).join('; ') + (sig.length > 3 ? '; …' : '.') });
  }
  const awaiting = cur.filter(r => r.status === 'completed' || r.status === 'reviewed').length;
  if (awaiting) {
    out.push({ id: 'needs-review', tone: 'info', title: `${awaiting} costing(s) awaiting review or approval`,
      detail: `${cur.filter(r => r.status === 'completed').length} completed and not yet reviewed, ${cur.filter(r => r.status === 'reviewed').length} reviewed and not yet approved.`, filter: { status: ['completed', 'reviewed'] } });
  }
  const t = Date.parse(today + 'T00:00:00Z');
  const inWin = (r: ClassifiedRecord, a: number, b: number) => { const d = (t - Date.parse(r.costingDate + 'T00:00:00Z')) / 86400000; return d >= a && d < b; };
  const last30 = filtered.filter(r => inWin(r, 0, 30)).length;
  const prev30 = filtered.filter(r => inWin(r, 30, 60)).length;
  if (last30 || prev30) {
    const change = prev30 ? ` (${last30 >= prev30 ? '+' : ''}${pct1(((last30 - prev30) / prev30) * 100)})` : '';
    out.push({ id: 'recent-activity', tone: 'info', title: `${last30} costing(s) saved in the last 30 days`,
      detail: `${prev30} in the 30 days before${change}. Counts every save, revisions included.` });
  }
  return out;
}

export function filterOptions(all: ClassifiedRecord[], f: DashboardFilters, win: { from: string | null; to: string | null }): Record<Dimension, FilterOption[]> {
  const out = {} as Record<Dimension, FilterOption[]>;
  const included = all.filter(r => !r.excluded);
  for (const dim of DIMENSIONS) {
    const counts = new Map<string, number>();
    // Every value seen in the data stays listed (selected ones too); the count is what the
    // OTHER active filters leave for it — the faceted-search convention.
    for (const r of included) for (const v of dimValues(r, dim)) if (!counts.has(v)) counts.set(v, 0);
    for (const r of included) if (matchesFilters(r, f, win, dim)) for (const v of dimValues(r, dim)) counts.set(v, (counts.get(v) ?? 0) + 1);
    let rows = [...counts.entries()].map(([value, count]) => ({ value, count }));
    const order: readonly string[] = dim === 'programme' ? STANDARD_PROGRAMMES : dim === 'powertrain' ? STANDARD_POWERTRAINS : dim === 'status' ? RECORD_STATUSES : [];
    rows = rows.sort((a, b) => {
      if (dim === 'modelYear') return a.value === NOT_SET ? 1 : b.value === NOT_SET ? -1 : b.value.localeCompare(a.value);
      const ia = order.indexOf(a.value), ib = order.indexOf(b.value);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      if (a.value === NOT_SET) return 1; if (b.value === NOT_SET) return -1;
      return a.value.localeCompare(b.value);
    });
    out[dim] = rows;
  }
  return out;
}

export interface BuildOptions {
  today: string;
  nowIso: string;
  fxPolicy: Exclude<FxMethod, 'identity'>;
  approvedRates: number;
  referenceLabel: string;
}

/** Everything the dashboard shows for one filter state. */
export function buildDashboard(records: KpiRecord[], filters: DashboardFilters, o: BuildOptions): DashboardSummary {
  const all = classifyRecords(records);
  return buildFromClassified(all, filters, o);
}

export function buildFromClassified(all: ClassifiedRecord[], filters: DashboardFilters, o: BuildOptions): DashboardSummary {
  const win = dateWindow(filters, o.today);
  const filteredAll = all.filter(r => matchesFilters(r, filters, win));
  const filtered = filteredAll.filter(r => !r.excluded);
  const filteredExcluded = filteredAll.filter(r => r.excluded);
  const cur = filtered.filter(r => r.role === 'current');

  const operational: OperationalKpis = {
    totalRecords: filtered.length,
    currentRecords: cur.length,
    uniqueComponents: new Set(cur.map(r => r.partKey).filter(Boolean)).size,
    unidentified: cur.filter(r => !r.partKey).length,
    completedRecords: cur.filter(r => r.status !== 'draft').length,
    commodities: new Set(cur.map(r => r.commodity).filter(Boolean)).size,
    programmes: new Set(cur.map(r => r.programme).filter(Boolean)).size,
    awaitingReview: cur.filter(r => r.status === 'completed').length,
    awaitingApproval: cur.filter(r => r.status === 'reviewed').length,
    needsReview: 0,
  };
  operational.needsReview = operational.awaitingReview + operational.awaitingApproval;

  const g = granularity(win.from, win.to, filtered);
  const costByCommodity = moneyBy(cur, r => dimValue(r.commodity)).sort((a, b) => b.currentGbp! - a.currentGbp!);
  const heatCom = countBy(cur, r => dimValue(r.commodity)).map(r => r.key);
  const heatProg = orderedBy(countBy(cur, r => dimValue(r.programme)), STANDARD_PROGRAMMES).map(r => r.key);
  const cells: HeatCell[] = [];
  for (const r of cur) {
    const c = dimValue(r.commodity), p = dimValue(r.programme);
    let cell = cells.find(x => x.commodity === c && x.programme === p);
    if (!cell) { cell = { commodity: c, programme: p, count: 0, opportunityGbp: 0 }; cells.push(cell); }
    cell.count++;
    if (r.eligible && r.gapGbp! > 0) cell.opportunityGbp += r.gapGbp!;
  }

  return {
    generatedAt: o.nowIso,
    window: { ...win, preset: filters.datePreset },
    filters,
    operational,
    financial: financialKpis(cur),
    charts: {
      activity: activitySeries(filtered, win.from, win.to, g),
      activityGranularity: g,
      byCommodity: countBy(filtered, r => dimValue(r.commodity)),
      costByCommodity,
      opportunityByCommodity: [...costByCommodity].filter(r => r.opportunityGbp! > 0).sort((a, b) => b.opportunityGbp! - a.opportunityGbp!),
      byProgramme: orderedBy(countBy(cur, r => dimValue(r.programme)), STANDARD_PROGRAMMES),
      byPowertrain: orderedBy(countBy(cur, r => dimValue(r.powertrain)), STANDARD_POWERTRAINS),
      byModelYear: countBy(cur, r => dimValue(r.modelYear)).sort((a, b) => (a.key === NOT_SET ? 1 : b.key === NOT_SET ? -1 : a.key.localeCompare(b.key))),
      byTool: countBy(filtered, r => dimValue(r.sourceTool)),
      heatmap: { commodities: heatCom, programmes: heatProg, cells },
      opportunityByPowertrain: orderedBy(moneyBy(cur, r => dimValue(r.powertrain)).filter(r => r.opportunityGbp! > 0), STANDARD_POWERTRAINS),
      byStatus: orderedBy(countBy(cur, r => r.status), RECORD_STATUSES),
      costByProgramme: orderedBy(moneyBy(cur, r => dimValue(r.programme)), STANDARD_PROGRAMMES),
      costByPowertrain: orderedBy(moneyBy(cur, r => dimValue(r.powertrain)), STANDARD_POWERTRAINS),
      costByModelYear: moneyBy(cur, r => dimValue(r.modelYear)).sort((a, b) => a.key.localeCompare(b.key)),
    },
    currencyTotals: currencyTotals(cur),
    dataQuality: dataQuality(all, filtered, filteredExcluded),
    insights: buildInsights(filtered, o.today),
    options: filterOptions(all, filters, win),
    fx: { policy: o.fxPolicy, approvedRates: o.approvedRates, reference: o.referenceLabel },
  };
}

// ─── Records table + drill-down ──────────────────────────────────────────────

export const SORT_KEYS = ['costingDate', 'updatedAt', 'createdAt', 'componentName', 'partNumber', 'commodity', 'programme', 'modelYear', 'powertrain', 'country', 'gbpCurrent', 'gbpShould', 'gapGbp', 'gapPct', 'status', 'sourceTool', 'ownerName', 'id'] as const;
export type SortKey = typeof SORT_KEYS[number];

export type RecordScope = 'current' | 'all' | 'excluded';

export interface RecordQuery {
  search: string;
  sort: SortKey;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  scope: RecordScope;
  /** Drill path: dimension values fixed so far. */
  drill: Partial<Record<'commodity' | 'programme' | 'powertrain' | 'modelYear' | 'component', string>>;
}

export function parseRecordQuery(raw: Record<string, unknown>): RecordQuery {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const sort = (SORT_KEYS as readonly string[]).includes(s(raw.sort)) ? s(raw.sort) as SortKey : 'costingDate';
  const pageSize = Math.min(200, Math.max(5, Math.floor(Number(raw.pageSize) || 25)));
  const page = Math.max(1, Math.floor(Number(raw.page) || 1));
  const scope: RecordScope = raw.scope === 'all' || raw.scope === 'excluded' ? raw.scope : 'current';
  const drill: RecordQuery['drill'] = {};
  for (const k of ['commodity', 'programme', 'powertrain', 'modelYear', 'component'] as const) {
    const v = s(raw[`drill_${k}`]);
    if (v && v.length <= 120) drill[k] = v;
  }
  return { search: s(raw.search).slice(0, 120), sort, dir: raw.dir === 'asc' ? 'asc' : 'desc', page, pageSize, scope, drill };
}

const componentKeyOf = (r: ClassifiedRecord) => r.partKey ?? `record:${r.id}`;
function drillMatch(r: ClassifiedRecord, d: RecordQuery['drill']): boolean {
  if (d.commodity !== undefined && dimValue(r.commodity) !== d.commodity) return false;
  if (d.programme !== undefined && dimValue(r.programme) !== d.programme) return false;
  if (d.powertrain !== undefined && dimValue(r.powertrain) !== d.powertrain) return false;
  if (d.modelYear !== undefined && dimValue(r.modelYear) !== d.modelYear) return false;
  if (d.component !== undefined && componentKeyOf(r) !== d.component) return false;
  return true;
}

/** Records the table / CSV show for a filter + query, in order (not paged). */
export function selectRecords(all: ClassifiedRecord[], filters: DashboardFilters, q: RecordQuery, today: string): ClassifiedRecord[] {
  const win = dateWindow(filters, today);
  let rows = all.filter(r => matchesFilters(r, filters, win));
  rows = q.scope === 'excluded' ? rows.filter(r => r.excluded)
    : q.scope === 'all' ? rows.filter(r => !r.excluded)
      : rows.filter(r => r.role === 'current');
  rows = rows.filter(r => drillMatch(r, q.drill));
  const needle = q.search.trim().toLowerCase();
  if (needle) {
    rows = rows.filter(r => [r.id, r.sourceRef, r.partNumber, r.componentName, r.ownerName, r.commodity, r.programme, r.powertrain, r.country]
      .some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(needle)));
  }
  const dir = q.dir === 'asc' ? 1 : -1;
  const val = (r: ClassifiedRecord): string | number | null => (r as unknown as Record<string, string | number | null>)[q.sort] ?? null;
  return rows.sort((a, b) => {
    const va = val(a), vb = val(b);
    if (va === null && vb === null) return a.id.localeCompare(b.id);
    if (va === null) return 1;               // nulls last whichever way
    if (vb === null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return c * dir || a.id.localeCompare(b.id);
  });
}

export function pageOf<T>(rows: T[], page: number, pageSize: number): { rows: T[]; total: number; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(page, pages);
  return { rows: rows.slice((p - 1) * pageSize, p * pageSize), total: rows.length, page: p, pages };
}

/** The next drill level and its groups, for the current drill path. */
export function drillGroups(all: ClassifiedRecord[], filters: DashboardFilters, drill: RecordQuery['drill'], today: string): { level: DrillLevel; groups: DrillGroup[] } {
  const win = dateWindow(filters, today);
  const cur = all.filter(r => r.role === 'current' && matchesFilters(r, filters, win) && drillMatch(r, drill));
  const level: DrillLevel = (DRILL_LEVELS.find(l => l !== 'record' && drill[l as keyof typeof drill] === undefined) ?? 'record') as DrillLevel;
  if (level === 'record') return { level, groups: [] };
  const keyOf = (r: ClassifiedRecord): [string, string] => {
    switch (level) {
      case 'commodity': return [dimValue(r.commodity), dimValue(r.commodity)];
      case 'programme': return [dimValue(r.programme), dimValue(r.programme)];
      case 'powertrain': return [dimValue(r.powertrain), dimValue(r.powertrain)];
      case 'modelYear': return [dimValue(r.modelYear), dimValue(r.modelYear)];
      default: return [componentKeyOf(r), r.partNumber ? `${r.partNumber} · ${r.componentName}` : `${r.componentName} (no part number)`];
    }
  };
  const m = new Map<string, DrillGroup>();
  for (const r of cur) {
    const [k, label] = keyOf(r);
    const gr = m.get(k) ?? { key: k, label, count: 0, eligible: 0, currentGbp: 0, shouldGbp: 0, gapGbp: 0, opportunityGbp: 0 };
    gr.count++;
    if (r.eligible) {
      gr.eligible++; gr.currentGbp += r.gbpCurrent!; gr.shouldGbp += r.gbpShould!; gr.gapGbp += r.gapGbp!;
      if (r.gapGbp! > 0) gr.opportunityGbp += r.gapGbp!;
    }
    m.set(k, gr);
  }
  return { level, groups: [...m.values()].sort((a, b) => b.opportunityGbp - a.opportunityGbp || b.count - a.count || a.label.localeCompare(b.label)) };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Spreadsheet formula injection: a cell starting with = + - @ is read as a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const RECORD_COLUMNS: { key: string; label: string; get: (r: ClassifiedRecord) => unknown }[] = [
  { key: 'id', label: 'Costing ID', get: r => r.id },
  { key: 'sourceRef', label: 'Original record ID', get: r => r.sourceRef },
  { key: 'componentName', label: 'Component', get: r => r.componentName },
  { key: 'partNumber', label: 'Part number', get: r => r.partNumber },
  { key: 'commodity', label: 'Commodity', get: r => r.commodity },
  { key: 'programme', label: 'Programme', get: r => r.programme },
  { key: 'modelYear', label: 'Model year', get: r => r.modelYear },
  { key: 'powertrain', label: 'Powertrain', get: r => r.powertrain },
  { key: 'country', label: 'Country / market', get: r => r.country },
  { key: 'currentCost', label: 'Current cost (original)', get: r => r.currentCost },
  { key: 'currentCcy', label: 'Current cost currency', get: r => r.currentCcy },
  { key: 'currentTerms', label: 'Current cost terms', get: r => r.currentTerms },
  { key: 'shouldCost', label: 'Should-cost (original)', get: r => r.shouldCost },
  { key: 'shouldCcy', label: 'Should-cost currency', get: r => r.shouldCcy },
  { key: 'shouldTerms', label: 'Should-cost terms', get: r => r.shouldTerms },
  { key: 'fxCurrent', label: 'FX current (GBP per unit)', get: r => r.fx.current?.gbpPerUnit ?? null },
  { key: 'fxCurrentSource', label: 'FX current source', get: r => (r.fx.current ? `${r.fx.current.source} (${r.fx.current.effectiveDate})${r.fx.current.approved ? '' : ' — reference, not approved'}` : null) },
  { key: 'fxShould', label: 'FX should (GBP per unit)', get: r => r.fx.should?.gbpPerUnit ?? null },
  { key: 'fxShouldSource', label: 'FX should source', get: r => (r.fx.should ? `${r.fx.should.source} (${r.fx.should.effectiveDate})${r.fx.should.approved ? '' : ' — reference, not approved'}` : null) },
  { key: 'gbpCurrent', label: 'GBP current cost', get: r => r.gbpCurrent },
  { key: 'gbpShould', label: 'GBP should-cost', get: r => r.gbpShould },
  { key: 'gapGbp', label: 'GBP cost gap', get: r => r.gapGbp },
  { key: 'gapPct', label: 'Cost gap %', get: r => (r.gapPct === null ? null : Math.round(r.gapPct * 100) / 100) },
  { key: 'annualVolume', label: 'Annual volume', get: r => r.annualVolume },
  { key: 'volumeValidated', label: 'Volume validated', get: r => (r.volumeValidated ? 'yes' : 'no') },
  { key: 'sourceTool', label: 'Costing tool', get: r => r.sourceTool },
  { key: 'status', label: 'Status', get: r => STATUS_LABEL[r.status] ?? r.status },
  { key: 'role', label: 'Reporting role', get: r => r.excluded ? `excluded (${r.excluded})` : r.role },
  { key: 'eligibility', label: 'Financial eligibility', get: r => (r.eligible ? 'eligible' : r.ineligible ? INELIGIBLE_LABEL[r.ineligible] : r.excluded ? r.invalidReasons.join('; ') || r.excluded : '') },
  { key: 'ownerName', label: 'Created by', get: r => r.ownerName },
  { key: 'costingDate', label: 'Costing date', get: r => r.costingDate },
  { key: 'createdAt', label: 'Created', get: r => r.createdAt },
  { key: 'updatedAt', label: 'Last updated', get: r => r.updatedAt },
];

export function recordsCsv(rows: ClassifiedRecord[]): string {
  const head = RECORD_COLUMNS.map(c => csvCell(c.label)).join(',');
  const body = rows.map(r => RECORD_COLUMNS.map(c => csvCell(c.get(r))).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

export const KPI_FMT = { gbp0, gbp2, pct1 };
