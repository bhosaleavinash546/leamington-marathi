/**
 * The 360° software should-cost report MODEL (plan docs/plans/sw-report-360-plan-2026-10-14.md, Oct 2026).
 *
 * ONE pure function, `buildSWReportModel(result, request)`, turns a computed programme into the ordered sections a report
 * prints — vehicle → E/E architecture → domains → modules → cost elements → lines → rates, then the decisions (risk,
 * hubs, make or buy, supplier check) and the evidence. The PDF (src/export/sw-report-pdf.ts) and the Excel workbook
 * (src/export/sw-report-xlsx.ts) both draw THIS model, so they cannot disagree.
 *
 * Nothing here prices anything: every £ is read off the engine's result (module chain, yearly streams, summary) or the
 * engine re-run (another hub, another development source) through the cockpit views. Every total is tied back to the
 * level above by an exact check (`checks`), and every line carries its basis.
 *
 * A focused report (domain, module, supplier …) is a SLICE of the vehicle costing — its module figures are the vehicle
 * costing's, and programme-level items (homologation, the fixed cloud platform) are listed separately, never re-allocated.
 */

import {
  SW_MODULES, SW_DEV_SPLIT, SW_DEFAULT_SUBSCRIPTION_YEARS, SW_DEFAULT_SERVICE_YEARS, SW_DEFAULT_DEVELOPMENT_MONTHS,
  SW_SERVICE_BASIS, SW_SUBSCRIPTION_BASIS, SW_CLOUD_BASIS, SW_DEVELOPMENT_BASIS, SW_TOOL_SEAT_BASIS, SW_MAINT_BASIS,
  SW_POST_EOP_BASIS, SW_HOMOLOGATION_BASIS, SW_DEV_SOURCE_LABEL, swModuleDefs, maintenanceWeights,
  type SWProgramResult, type SWModuleCostResult, type SWCategory, type ASILLevel, type SWEvidenceLine, type SWEvidenceGrade,
  type SWPowertrain,
} from './sw-should-cost.js';
import {
  swSpendProfile, swUnitEconomics, swQuoteCheck, swMakeBuy, swEvidence, swHubComparison, swCalibrationPriorities, swRateCheck,
  SW_CATALOGUE_GAPS,
  type SWSpendProfile, type SWUnitEconomics, type SWQuote, type SWQuoteCheck, type SWMakeBuy, type SWEvidence, type SWHubRow,
  type SWCalibrationPriority, type SWRateCheck,
} from './sw-cockpit.js';
import { swCostingSteps, type SWCostingStep, type StepRate } from './sw-costing-steps.js';
import {
  SW_VEHICLE_COMPONENTS, SW_MODULE_COMPONENTS, componentOnPowertrain, type SWComponentKind,
} from './sw-vehicle-map.js';
import { SW_POWERTRAIN_MODULE_IDS } from './sw-should-cost.js';

// ── Request ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SWReportProfile = 'vehicle' | 'executive' | 'domain' | 'module' | 'supplier' | 'hubs';
export type SWBodyType = 'suv' | 'saloon' | 'hatchback' | 'pickup' | 'van';

export const SW_REPORT_PROFILES: Record<SWReportProfile, { label: string; reader: string; what: string }> = {
  vehicle:   { label: 'Vehicle (full 360°)', reader: 'Programme director, finance', what: 'Every domain and every module, from the vehicle down to each costed line and its rate.' },
  executive: { label: 'Executive summary', reader: 'President / board', what: 'Headline, domains, the largest drivers, the range and the hubs.' },
  domain:    { label: 'Domain', reader: 'Domain chief engineer', what: 'The chosen domains in full, as a slice of the vehicle costing.' },
  module:    { label: 'Module', reader: 'Module owner, purchasing', what: 'The chosen modules, every line to the last bit.' },
  supplier:  { label: 'Supplier / negotiation', reader: 'Purchasing', what: 'Quote check, make or buy, the rate a quote implies and the hubs.' },
  hubs:      { label: 'Hub & country', reader: 'Sourcing / footprint', what: 'Every hub re-costed, every country mapped to its hub, the rate build-ups.' },
};

export const SW_BODY_TYPES: Record<SWBodyType, string> = {
  suv: 'SUV', saloon: 'Saloon', hatchback: 'Hatchback', pickup: 'Pickup', van: 'Van',
};

export interface SWReportFormat {
  /** £ → the report currency, grouped, `dp` decimals. */
  money:  (gbp: number, dp?: number) => string;
  /** £ → "€392.3M". */
  moneyM: (gbp: number) => string;
  number: (n: number, dp?: number) => string;
}

export interface SWReportCountry { code: string; label: string; hub: string; hubLabel: string; basis: string }

export interface SWReportHubRate {
  build: string; confidence: string; median?: string;
  /** [label, source text, URL] for every salary observation, the on-cost and the hours. */
  sources: Array<[string, string, string]>;
}

/** Metadata the user types in the export dialog — printed as typed, never invented. */
export interface SWReportMeta {
  preparedBy?:      string;
  preparedFor?:     string;
  reference?:       string;
  confidentiality?: string;
}

export interface SWReportRequest {
  profile:      SWReportProfile;
  /** Domain profile: the domains to report. */
  domains?:     SWCategory[];
  /** Module profile: the modules to report. */
  moduleIds?:   string[];
  title:        string;
  /** Checked vehicle text (a demo with facts) — absent for a user programme. */
  vehicleDesc?: string;
  facts?:       Array<[string, string]>;
  meta?:        SWReportMeta;
  bodyType?:    SWBodyType;
  hubLabel:     string;
  hubRate?:     SWReportHubRate;
  stepRate:     StepRate;
  countries?:   SWReportCountry[];
  quote?:       SWQuote;
  currency:     { code: string; sym: string; perGbp: number };
  fmt:          SWReportFormat;
  generatedAt:  Date;
  bookVersion:  string;
}

// ── Model ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SWReportSectionId =
  | 'cover' | 'summary' | 'definition' | 'architecture' | 'steps' | 'buildup' | 'domains' | 'modules' | 'lifecycle'
  | 'spend' | 'rates' | 'hubs' | 'risk' | 'evidence' | 'makebuy' | 'scope' | 'appendix';

export interface SWReportSection { id: SWReportSectionId; title: string; no: number }

const SECTION_TITLE: Record<SWReportSectionId, string> = {
  cover: 'Cover', summary: 'Executive summary', definition: 'Vehicle and programme', architecture: 'E/E architecture: where the software runs',
  steps: 'How the cost is built', buildup: 'Cost build-up', domains: 'Domains', modules: 'Modules, line by line',
  lifecycle: 'Lifecycle and unit economics', spend: 'Spend by year', rates: 'Engineering rate', hubs: 'Hubs and countries',
  risk: 'Risk and sensitivity', evidence: 'Evidence and sources', makebuy: 'Make or buy and supplier check',
  scope: 'Scope, exclusions and limitations', appendix: 'Appendix: module × cost element',
};

const PROFILE_SECTIONS: Record<SWReportProfile, SWReportSectionId[]> = {
  vehicle:   ['cover', 'summary', 'definition', 'architecture', 'steps', 'buildup', 'domains', 'modules', 'lifecycle', 'spend', 'rates', 'hubs', 'risk', 'evidence', 'makebuy', 'scope', 'appendix'],
  executive: ['cover', 'summary', 'architecture', 'buildup', 'domains', 'hubs', 'risk'],
  domain:    ['cover', 'summary', 'architecture', 'domains', 'modules', 'evidence', 'scope'],
  module:    ['cover', 'summary', 'modules', 'rates', 'evidence'],
  supplier:  ['cover', 'summary', 'makebuy', 'rates', 'hubs', 'evidence'],
  hubs:      ['cover', 'summary', 'rates', 'hubs'],
};

export interface SWReportCheck { label: string; expected: number; actual: number; ok: boolean }

/** One costed line of a module, with the arithmetic that produced it. */
export interface SWReportLine {
  group: 'effort' | 'development' | 'verification' | 'engineering' | 'lifecycle' | 'total';
  label: string;
  /** The arithmetic in words and numbers, e.g. "88.4 PM × 12 % = 10.6 PM × £13,410 / PM". */
  expr:  string;
  value: number;
  unit:  'PM' | 'money' | 'factor';
  /** Evidence grade of the line where it is a costed £ line. */
  grade?: SWEvidenceGrade;
  basis?: string;
}

export interface SWReportModule {
  id:          string;
  name:        string;
  category:    SWCategory;
  categoryLabel: string;
  description: string;
  notes:       string;
  custom:      boolean;
  /** Labels of the lines priced with the user's quotes. */
  quoted:      string[];
  estimateBasis?: string;
  royaltyBasis?: string;
  result:      SWModuleCostResult;
  share:       number;           // of the vehicle total
  components:  number[];         // architecture numbers of the components it runs on
  lines:       SWReportLine[];
  evidence:    SWEvidenceLine[];
  /** Nominal £ by programme year (maintenance + licences + royalties + cloud). */
  yearlyTotal: number[];
}

export interface SWReportDomain {
  category:     SWCategory;
  label:        string;
  total:        number;
  nre:          number;
  lifecycle:    number;
  share:        number;
  effortPM:     number;
  moduleIds:    string[];
  largest:      Array<{ name: string; total: number; share: number }>;
  asilMix:      Record<ASILLevel, number>;
  reuseMix:     Record<string, number>;
  components:   number[];
  excluded:     Array<{ name: string; reason: string }>;
}

export interface SWReportComponent {
  no:         number;
  id:         string;
  label:      string;
  kind:       SWComponentKind;
  what:       string;
  moduleIds:  string[];
  modules:    string[];
  highestAsil: ASILLevel;
}

/** A skeleton picture the renderers draw (the SVG builder is src/export/sw-report-skeleton.ts). */
export interface SWReportSkeletonView {
  key:       string;
  title:     string;
  /** Modules lit; absent = every module in scope. */
  lit?:      string[];
  colourBy:  'asil' | 'count' | 'excluded';
  /** Catalogue modules out of scope, drawn greyed in the 'excluded' view. */
  excluded?: string[];
}

export interface SWReportModel {
  profile:     SWReportProfile;
  request:     SWReportRequest;
  result:      SWProgramResult;
  sections:    SWReportSection[];
  powertrain?: SWPowertrain;
  body:        SWBodyType;
  /** The modules this report covers (all in scope for the vehicle profile; a slice otherwise). */
  scopeIds:    string[];
  slice:       { total: number; nre: number; lifecycle: number; share: number; isWhole: boolean };
  headline: {
    total: number; perVehicle: number; nre: number; lifecycle: number; effortPM: number; devPM: number;
    modules: number; domains: number; p10: number; p50: number; p90: number; headlinePercentile: number;
    hubMin?: SWHubRow; hubMax?: SWHubRow; unsourcedShare: number; vehiclesBuilt: number;
  };
  programmeItems: Array<{ label: string; amount: number; rule: string }>;
  findings:    string[];
  definition:  Array<[string, string]>;
  components:  SWReportComponent[];
  steps:       SWCostingStep[];
  buildUp:     { nre: Array<[string, number]>; lifecycle: Array<[string, number]> };
  domains:     SWReportDomain[];
  modules:     SWReportModule[];
  unit:        SWUnitEconomics;
  spend:       SWSpendProfile;
  hubs:        SWHubRow[];
  countries:   SWReportCountry[];
  rateCheck:   SWRateCheck;
  evidence:    SWEvidence;
  calibration: { rows: SWCalibrationPriority[]; total: number };
  makeBuy:     SWMakeBuy;
  quote:       SWQuoteCheck;
  assumptions: Array<[string, string]>;
  yourFigures: Array<{ line: string; value: string; source: string }>;
  excluded:    Array<[string, string, string]>;
  gaps:        readonly string[];
  skeletons:   SWReportSkeletonView[];
  checks:      SWReportCheck[];
}

// ── Shared row builders (moved from sw-report-pdf.ts; it re-exports them) ──────────────────────────────────────────

/** Every stated assumption and its basis. */
export function swAssumptionRows(makeBuyBasis: string): Array<[string, string]> {
  return [
    ['Connected service per vehicle', SW_SERVICE_BASIS], ['Map-data subscription', SW_SUBSCRIPTION_BASIS], ['Cloud £ per connected vehicle-year', SW_CLOUD_BASIS],
    ['Development window', SW_DEVELOPMENT_BASIS], ['Development tools', SW_TOOL_SEAT_BASIS], ['Maintenance profile', SW_MAINT_BASIS],
    ['Security support after the last build', SW_POST_EOP_BASIS], ['Homologation', SW_HOMOLOGATION_BASIS],
    ['Supplier margin (bought development)', makeBuyBasis],
    ['Effort catalogue (person-months per module)', 'CostVision catalogue — no published automotive productivity source was found (the defence data in Clark & Madachy\'s cost-estimation manual is the next source to read). Calibrate on your own actuals or size modules in KSLOC.'],
    ['Reuse, complexity factors', 'CostVision catalogue factors — no published source.'],
    ['ASIL factor', 'Solcept engineering blog (× 1.4 to ASIL-B, × 1.3 B → D); A and C interpolated — Low confidence.'],
  ];
}

/** Every figure the user stands behind in this costing: typed quotes and their own modules, each with its source. */
export function swYourFigures(r: SWProgramResult): Array<{ line: string; value: string; source: string }> {
  const p = r.inputs, q = p.quotes, out: Array<{ line: string; value: string; source: string }> = [];
  const name = (id: string) => r.modules.find(m => m.moduleId === id)?.moduleName ?? SW_MODULES.find(m => m.id === id)?.name ?? id;
  const gbp = (n: number, dp = 2) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  if (q?.cloudPerVehicleYear) out.push({ line: 'Cloud back-end, per connected vehicle-year', value: gbp(q.cloudPerVehicleYear.value), source: q.cloudPerVehicleYear.source });
  for (const [id, mq] of Object.entries(q?.modules ?? {})) {
    if (mq.perVehicleBuilt) out.push({ line: `${name(id)} — royalty per vehicle built`, value: gbp(mq.perVehicleBuilt.value), source: mq.perVehicleBuilt.source });
    if (mq.perVehicleYear) out.push({ line: `${name(id)} — royalty per vehicle-year`, value: gbp(mq.perVehicleYear.value), source: mq.perVehicleYear.source });
    if (mq.annualIP) out.push({ line: `${name(id)} — IP licence a year`, value: gbp(mq.annualIP.value, 0), source: mq.annualIP.source });
  }
  for (const c of p.customModules ?? []) {
    const on = p.modules.find(m => m.moduleId === c.id)?.enabled;
    out.push({ line: `Your module: ${c.name}${on ? '' : ' (not in scope)'}`, value: `${c.nominalPersonMonths.toLocaleString('en-GB')} nominal PM${c.perVehicleRoyaltyGBP ? ` + ${gbp(c.perVehicleRoyaltyGBP)} / vehicle` : ''}`, source: c.source || '—' });
  }
  for (const m of p.modules) if (m.enabled && m.customPersonMonths != null) out.push({ line: `${name(m.moduleId)} — effort`, value: `${m.customPersonMonths.toLocaleString('en-GB')} PM (typed)`, source: 'typed on the Scope tab' });
  return out;
}

/** Catalogue modules not in this programme, with the reason. */
export function swExcludedModules(r: SWProgramResult): Array<[string, string, string]> {
  const inScope = new Set(r.modules.map(m => m.moduleId));
  return SW_MODULES.filter(m => !inScope.has(m.id)).map(m => [m.name, m.categoryLabel, excludedReason(m.id, r.inputs.powertrain)]);
}

function excludedReason(id: string, pt: SWPowertrain | undefined): string {
  if (id === 'digital_key') return 'not confirmed for this vehicle — excluded rather than assumed';
  if (id === 'mhev_48v') return 'a 48 V mild-hybrid starter-generator; not this drivetrain';
  if (pt && SW_POWERTRAIN_MODULE_IDS.has(id)) return `drivetrain software not on a ${pt}`;
  return 'switched off for this programme';
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const ASIL_ORDER: ASILLevel[] = ['QM', 'A', 'B', 'C', 'D'];
const asilRank = (a: ASILLevel) => ASIL_ORDER.indexOf(a);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, 1e-9 * Math.abs(b));
const pct = (x: number, dp = 0) => `${(x * 100).toFixed(dp)} %`;

const DEFAULT_FMT: SWReportFormat = {
  money: (n, dp = 0) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`,
  moneyM: n => `£${(n / 1e6).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`,
  number: (n, dp = 0) => n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }),
};
export const SW_REPORT_GBP_FORMAT = DEFAULT_FMT;

/** Components carrying the given modules on this drivetrain (the screen's rule: a drivetrain-specific part is drawn only
 *  when a drivetrain module in scope runs on it when no drivetrain is stated). */
function componentsFor(result: SWProgramResult): SWReportComponent[] {
  const pt = result.inputs.powertrain;
  const ptModules = new Set(result.modules.filter(m => SW_POWERTRAIN_MODULE_IDS.has(m.moduleId)).map(m => m.moduleId));
  const ptComps = new Set([...ptModules].flatMap(id => SW_MODULE_COMPONENTS[id] ?? []));
  const out: SWReportComponent[] = [];
  let no = 0;
  for (const c of SW_VEHICLE_COMPONENTS) {
    if (!componentOnPowertrain(c, pt)) continue;
    if (c.powertrains && !pt && !ptComps.has(c.id)) continue;
    const mods = result.modules.filter(m => (SW_MODULE_COMPONENTS[m.moduleId] ?? []).includes(c.id));
    if (!mods.length) continue;
    const highest = mods.reduce<ASILLevel>((a, m) => (asilRank(m.asilUsed) > asilRank(a) ? m.asilUsed : a), 'QM');
    out.push({ no: ++no, id: c.id, label: c.label, kind: c.kind, what: c.what, moduleIds: mods.map(m => m.moduleId),
      modules: mods.map(m => m.moduleName), highestAsil: highest });
  }
  return out;
}

function moduleLines(m: SWModuleCostResult, ev: SWEvidenceLine[], f: SWReportFormat, prog: SWProgramResult['inputs']): SWReportLine[] {
  const c = m.chain, k = c.share, L: SWReportLine[] = [];
  const pm = (n: number) => `${f.number(n, 1)} PM`;
  const rate = `${f.money(c.effortRate)} / PM`;
  const sh = k < 1 ? ` × platform share ${f.number(k, 3)}` : '';
  const basis = m.effortBasis === 'custom' ? 'your person-months' : m.effortBasis === 'size' ? 'COCOMO II.2000 on your KSLOC' : 'module catalogue, fresh code at QM / Medium';
  L.push({ group: 'effort', label: 'Nominal effort', expr: basis, value: c.nominalPM, unit: 'PM' });
  if (c.effortCal !== 1) L.push({ group: 'effort', label: 'Effort calibration (your actuals)', expr: `× ${f.number(c.effortCal, 3)}`, value: c.effortCal, unit: 'factor' });
  L.push({ group: 'effort', label: `Reuse (${m.reuseUsed})`, expr: `× ${f.number(c.reuseFactor, 2)} → ${pm(c.effectivePM)}`, value: c.effectivePM, unit: 'PM' });
  L.push({ group: 'effort', label: `ASIL ${m.asilUsed} development factor`, expr: `× ${f.number(c.asilDev, 2)} → ${pm(c.devPM)}`, value: c.devPM, unit: 'PM' });
  L.push({ group: 'effort', label: 'Engineering rate', expr: `hub ${f.money(c.engineerRate)} × source ${f.number(c.devSourceMult, 3)} × burden ${f.number(c.overhead, 3)}`
    + (c.schedPenalty !== 1 ? ` × schedule ${f.number(c.schedPenalty, 3)}` : '') + ` = ${rate}`, value: c.effortRate, unit: 'money' });
  const b = c.bucketPM;
  const devRow = (label: string, key: keyof typeof b, extra: string, value: number) =>
    L.push({ group: 'development', label, expr: `${pm(c.devPM)} × ${pct(SW_DEV_SPLIT[key])}${extra} = ${pm(b[key] * c.schedPenalty)} × ${rate}${sh}`, value, unit: 'money' });
  devRow('Requirements', 'requirements', '', m.development.requirements);
  devRow('Architecture', 'architecture', '', m.development.architecture);
  devRow(`Algorithms (complexity ${m.complexityUsed})`, 'algorithmDev', ` × ${f.number(c.complexity, 2)}`, m.development.algorithmDev);
  devRow('Implementation', 'implementation', ` × ${f.number(c.implComplexity, 3)}`, m.development.implementation);
  devRow('Functional safety', 'safetyCompliance', c.safetyScale !== 1 ? ` × safety-reuse ${f.number(c.safetyScale, 3)}` : '', m.development.safetyCompliance);
  L.push({ group: 'development', label: 'Development', expr: `${pm(m.personMonths)} costed`, value: m.development.total, unit: 'money' });
  const t = c.testSplit, T = m.testing;
  L.push({ group: 'verification', label: 'Verification', expr: `development ${f.money(m.development.total)} × ${pct(c.testFrac, 1)}`, value: T.total, unit: 'money' });
  const tRow = (label: string, frac: number, value: number) => { if (frac > 0) L.push({ group: 'verification', label, expr: `${pct(frac, 1)} of verification`, value, unit: 'money' }); };
  tRow('Software-in-the-loop', t.sil, T.sil); tRow('Model-in-the-loop', t.mil, T.mil); tRow('Hardware-in-the-loop', t.hil, T.hil);
  tRow('Regression', t.regression, T.regression); tRow('Penetration test', t.penTest, T.penTest); tRow('Scenario simulation', t.scenarios, T.scenarios);
  const dev = m.development.total;
  L.push({ group: 'engineering', label: 'Integration', expr: `development × ${pct(c.integrationFrac, 1)}`, value: m.integrationCost, unit: 'money' });
  if (m.cybersecCost) L.push({ group: 'engineering', label: `Cybersecurity (${m.calUsed})`, expr: `development × ${pct(c.cyberPct, 0)} (ISO/SAE 21434 CAL)`, value: m.cybersecCost, unit: 'money' });
  if (m.calibrationCost) L.push({ group: 'engineering', label: 'Calibration', expr: `development × ${pct(c.calibrationFrac, 1)}`, value: m.calibrationCost, unit: 'money' });
  if (m.mlDataCost) L.push({ group: 'engineering', label: 'ML data', expr: `development × ${pct(c.mlFrac, 0)}`, value: m.mlDataCost, unit: 'money' });
  L.push({ group: 'engineering', label: 'Development tools', expr: `${f.number(c.engineerYears, 2)} engineer-years × ${f.money(c.toolSeatGBP)} / seat-year`
    + (c.toolDiscount !== 1 ? ` × ${f.number(c.toolDiscount, 3)} (discounted)` : '') + sh, value: m.toolchainCost, unit: 'money' });
  void dev;
  const grade = (kind: string) => ev.find(e => e.kind === kind)?.grade;
  const basisOf = (kind: string) => ev.find(e => e.kind === kind)?.basis;
  const effortGrade = grade('effort');
  for (const l of L) if (l.unit === 'money' && l.group !== 'effort') l.grade = l.label === 'Development tools' ? grade('tools') : effortGrade;
  L.push({ group: 'total', label: 'Engineering (NRE)', expr: 'development + verification + integration + cyber + calibration + ML data + tools', value: m.totalNonRecurring, unit: 'money' });
  const life = prog.programLifeYears;
  const w = maintenanceWeights(prog);
  const post = ev.find(e => e.kind === 'postSupport');
  const maint = ev.find(e => e.kind === 'maintenance');
  const wf = (xs: number[]) => xs.map(x => f.number(x, 2)).join(' / ');
  if (maint && maint.amount) L.push({ group: 'lifecycle', label: 'Maintenance (production years)', expr: `(dev + verification + integration) × ${f.number(c.maintPct, 1)} % a year = ${f.money(c.maintBase)} a year × weights `
    + `${wf(w.slice(0, life))}${sh}`, value: maint.amount, unit: 'money', grade: maint.grade, basis: maint.basis });
  if (post) L.push({ group: 'lifecycle', label: 'Security support after the last build', expr: `${f.money(c.maintBase)} a year × ${w.length - life} years at weight ${f.number(w[life] ?? 0, 3)}${sh}`,
    value: post.amount, unit: 'money', grade: post.grade, basis: post.basis });
  const ip = sum(m.yearly.licences);
  const roy = m.licensingCost - ev.filter(e => e.kind === 'licences').reduce((a, e) => a + e.amount, 0);
  if (ip) L.push({ group: 'lifecycle', label: 'IP licences', expr: `${f.money(m.yearly.licences[0] ?? 0)} a year × ${life} production years`, value: ev.find(e => e.kind === 'licences')?.amount ?? ip, unit: 'money', grade: grade('licences'), basis: basisOf('licences') });
  if (Math.abs(roy) > 1e-6) L.push({ group: 'lifecycle', label: 'Royalties', expr: 'per vehicle built and per vehicle-year subscription', value: roy, unit: 'money', grade: grade('royalties'), basis: basisOf('royalties') });
  if (m.cloudCost) L.push({ group: 'lifecycle', label: 'Cloud', expr: 'per connected vehicle in service, each vehicle served its service years', value: m.cloudCost, unit: 'money', grade: grade('cloud'), basis: basisOf('cloud') });
  L.push({ group: 'total', label: 'Lifecycle', expr: 'maintenance + IP licences + royalties + cloud', value: m.totalLifecycle, unit: 'money' });
  L.push({ group: 'total', label: 'Module total', expr: 'engineering + lifecycle', value: m.grandTotal, unit: 'money' });
  return L;
}

// ── Builder ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function buildSWReportModel(result: SWProgramResult, req: SWReportRequest): SWReportModel {
  const f = req.fmt ?? DEFAULT_FMT;
  const prog = result.inputs;
  const s = result.summary;
  const profile = req.profile;
  const defs = swModuleDefs(prog);

  // Scope of THIS report.
  let scopeIds = result.modules.map(m => m.moduleId);
  if (profile === 'domain' && req.domains?.length) scopeIds = result.modules.filter(m => req.domains!.includes(m.category)).map(m => m.moduleId);
  if (profile === 'module' && req.moduleIds?.length) scopeIds = result.modules.filter(m => req.moduleIds!.includes(m.moduleId)).map(m => m.moduleId);
  const inSlice = new Set(scopeIds);
  const sliceMods = result.modules.filter(m => inSlice.has(m.moduleId));
  const isWhole = sliceMods.length === result.modules.length;
  const nre = s.nreTotal, lifecycle = s.grandTotal - s.nreTotal;
  const sliceTotal = isWhole ? s.grandTotal : sum(sliceMods.map(m => m.grandTotal));
  const sliceNre = isWhole ? nre : sum(sliceMods.map(m => m.totalNonRecurring));

  const evidence = swEvidence(result);
  const hubs = swHubComparison(result);
  const makeBuy = swMakeBuy(result);
  const unit = swUnitEconomics(result);
  const spend = swSpendProfile(result);
  const mc = result.monteCarlo;
  const components = componentsFor(result);
  const compNo = new Map(components.map(c => [c.id, c.no]));
  const numbersFor = (ids: string[]) => [...new Set(ids.flatMap(id => SW_MODULE_COMPONENTS[id] ?? []))]
    .map(cid => compNo.get(cid)).filter((n): n is number => n != null).sort((a, b) => a - b);

  // Modules.
  const modules: SWReportModule[] = sliceMods.map(m => {
    const def = defs.get(m.moduleId);
    const ev = evidence.lines.filter(l => l.label.startsWith(`${m.moduleName} — `));
    const quoted = Object.entries(def?.quoted ?? {}).filter(([, v]) => !!v).map(([k]) => k);
    const H = s.horizonYears;
    return {
      id: m.moduleId, name: m.moduleName, category: m.category, categoryLabel: m.categoryLabel,
      description: def?.description ?? '', notes: def?.notes ?? '', custom: !!def?.custom, quoted,
      estimateBasis: def?.estimateBasis, royaltyBasis: def?.royaltyBasis,
      result: m, share: s.grandTotal > 0 ? m.grandTotal / s.grandTotal : 0, components: numbersFor([m.moduleId]),
      lines: moduleLines(m, ev, f, prog), evidence: ev,
      yearlyTotal: Array.from({ length: H }, (_, i) => (m.yearly.maintenance[i] ?? 0) + (m.yearly.licences[i] ?? 0) + (m.yearly.royalties[i] ?? 0) + (m.yearly.cloud[i] ?? 0)),
    };
  });

  // Domains (in the catalogue's A–G order).
  const cats = (['A', 'B', 'C', 'D', 'E', 'F', 'G'] as SWCategory[]).filter(c => sliceMods.some(m => m.category === c));
  const domains: SWReportDomain[] = cats.map(cat => {
    const ms = sliceMods.filter(m => m.category === cat).sort((a, b) => b.grandTotal - a.grandTotal);
    const total = sum(ms.map(m => m.grandTotal));
    const asilMix = { QM: 0, A: 0, B: 0, C: 0, D: 0 } as Record<ASILLevel, number>;
    const reuseMix: Record<string, number> = {};
    for (const m of ms) { asilMix[m.asilUsed]++; reuseMix[m.reuseUsed] = (reuseMix[m.reuseUsed] ?? 0) + 1; }
    const inScope = new Set(result.modules.map(m => m.moduleId));
    return {
      category: cat, label: ms[0].categoryLabel, total, nre: sum(ms.map(m => m.totalNonRecurring)), lifecycle: sum(ms.map(m => m.totalLifecycle)),
      share: s.grandTotal > 0 ? total / s.grandTotal : 0, effortPM: sum(ms.map(m => m.effortPersonMonths)),
      moduleIds: ms.map(m => m.moduleId),
      largest: ms.slice(0, 3).map(m => ({ name: m.moduleName, total: m.grandTotal, share: total > 0 ? m.grandTotal / total : 0 })),
      asilMix, reuseMix, components: numbersFor(ms.map(m => m.moduleId)),
      excluded: SW_MODULES.filter(d => d.category === cat && !inScope.has(d.id)).map(d => ({ name: d.name, reason: excludedReason(d.id, prog.powertrain) })),
    };
  });

  // Programme-level items: carried by the vehicle costing, never re-allocated to a domain or module.
  const cloudFixed = s.cloudFixedYearly.length ? evidence.lines.filter(l => l.kind === 'cloudFixed').reduce((a, l) => a + l.amount, 0) : 0;
  const programmeItems: SWReportModel['programmeItems'] = [];
  if (s.totalHomologation) programmeItems.push({ label: 'Homologation (R155 / R156 / ISO 26262)', amount: s.totalHomologation, rule: 'Programme-level: one type approval, one assessor, a share of the organisation\'s CSMS / SUMS — not allocated to a domain or module.' });
  if (cloudFixed) programmeItems.push({ label: 'Cloud platform (fixed)', amount: cloudFixed, rule: 'Your fixed platform £ a year while any vehicle is served — not allocated to a domain or module.' });

  // Headline + findings, all computed from the result.
  const sortedHubs = [...hubs].sort((a, b) => a.total - b.total);
  const topDomain = [...domains].sort((a, b) => b.total - a.total)[0];
  const top3 = [...result.modules].sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 3);
  const top3Share = s.grandTotal > 0 ? sum(top3.map(m => m.grandTotal)) / s.grandTotal : 0;
  const findings: string[] = [];
  if (isWhole) {
    findings.push(`Programme software should-cost ${f.moneyM(s.grandTotal)}: ${f.money(s.perVehicle, 0)} per vehicle over ${f.number(unit.vehiclesBuilt, 0)} vehicles built (${prog.annualProductionVolume.toLocaleString('en-GB')} a year × ${prog.programLifeYears} years).`);
    findings.push(`Engineering (NRE) ${f.moneyM(nre)} (${pct(nre / s.grandTotal)}); lifecycle ${f.moneyM(lifecycle)} (${pct(lifecycle / s.grandTotal)}) — maintenance, licences, royalties and cloud through programme year ${s.horizonYears}.`);
    if (topDomain) findings.push(`${topDomain.label} is the largest domain at ${f.moneyM(topDomain.total)} (${pct(topDomain.share)}); the three largest modules — ${top3.map(m => m.moduleName).join(', ')} — are ${pct(top3Share)} of the total.`);
    findings.push(`Risk: P10 ${f.moneyM(mc.p10)} / P50 ${f.moneyM(mc.p50)} / P90 ${f.moneyM(mc.p90)}; the headline sits at P${Math.round(mc.headlinePercentile)} of its own band (ranges are skewed upwards by evidence grade).`);
    if (sortedHubs.length > 1) findings.push(`Hub choice: ${sortedHubs[0].label} ${f.moneyM(sortedHubs[0].total)} to ${sortedHubs[sortedHubs.length - 1].label} ${f.moneyM(sortedHubs[sortedHubs.length - 1].total)}; this costing is at ${req.hubLabel}. ${pct(evidence.unsourcedShare)} of the £ rests on unsourced catalogue figures — calibrate the top modules first.`);
  } else {
    findings.push(`This report covers ${sliceMods.length} of the ${result.modules.length} modules in the vehicle costing: ${f.moneyM(sliceTotal)} (${pct(sliceTotal / s.grandTotal, 1)} of the vehicle's ${f.moneyM(s.grandTotal)}).`);
    findings.push(`Engineering (NRE) ${f.moneyM(sliceNre)}; lifecycle ${f.moneyM(sliceTotal - sliceNre)}. Module figures are the vehicle costing's — this is a slice, not a separate costing.`);
    const big = [...sliceMods].sort((a, b) => b.grandTotal - a.grandTotal)[0];
    if (big) findings.push(`Largest module: ${big.moduleName} at ${f.moneyM(big.grandTotal)} (${pct(sliceTotal > 0 ? big.grandTotal / sliceTotal : 0)} of this slice).`);
    if (programmeItems.length) findings.push(`Programme-level items (${programmeItems.map(p => p.label).join(', ')}) stay with the vehicle costing and are not allocated here.`);
  }

  const definition: Array<[string, string]> = [
    ['Programme', req.title],
    ['Vehicle', req.vehicleDesc ?? 'Not provided — no vehicle description was entered.'],
    ['Drivetrain', prog.powertrain ?? 'Not stated'],
    ['Body (skeleton)', `${SW_BODY_TYPES[req.bodyType ?? 'suv']} — schematic top view, not to scale`],
    ['Annual volume', `${prog.annualProductionVolume.toLocaleString('en-GB')} vehicles a year`],
    ['Production life', `${prog.programLifeYears} years (${f.number(unit.vehiclesBuilt, 0)} vehicles built)`],
    ['Engineering hub', `${req.hubLabel}${prog.baseRateGBP ? ' (your typed rate)' : ''}`],
    ['Development source', SW_DEV_SOURCE_LABEL[prog.devSource]],
    ['Development window', `${prog.developmentMonths ?? SW_DEFAULT_DEVELOPMENT_MONTHS} months to SOP`],
    ['Map subscription / connected service', `${prog.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS} / ${prog.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS} years per vehicle`],
    ['Discount rate', `${prog.discountRatePct ?? 0} %`],
    ['Rate book', req.bookVersion || '—'],
  ];
  const meta = req.meta ?? {};
  if (meta.preparedBy) definition.push(['Prepared by', meta.preparedBy]);
  if (meta.preparedFor) definition.push(['Prepared for', meta.preparedFor]);
  if (meta.reference) definition.push(['Reference', meta.reference]);
  if (meta.confidentiality) definition.push(['Confidentiality', meta.confidentiality]);

  const buildUp = {
    nre: [['Development', s.totalDevelopment], ['Verification', s.totalTesting], ['Integration', s.totalIntegration], ['Cybersecurity', s.totalCybersecurity],
      ['Calibration', s.totalCalibration], ['ML data', s.totalMLData], ['Development tools', s.totalToolchain], ['Homologation', s.totalHomologation]] as Array<[string, number]>,
    lifecycle: [['Maintenance', s.totalMaintenance], ['Licences and royalties', s.totalLicensing], ['Cloud', s.totalCloud]] as Array<[string, number]>,
  };

  // Skeleton pictures.
  const allIds = result.modules.map(m => m.moduleId);
  const steps = swCostingSteps(result, req.stepRate, { money: n => (n >= 1e6 ? f.moneyM(n) : f.money(n, 0)), number: (n, dp = 0) => f.number(n, dp) });
  const skeletons: SWReportSkeletonView[] = [
    { key: 'architecture', title: 'Every component carrying software in scope, coloured by its highest ASIL', colourBy: 'asil', lit: isWhole ? undefined : scopeIds },
    { key: 'architecture-count', title: 'The same components, coloured by the number of modules on each', colourBy: 'count' },
    ...domains.map(d => ({ key: `domain-${d.category}`, title: `${d.label}: the components its modules run on`, colourBy: 'asil' as const, lit: d.moduleIds })),
    ...modules.map(m => ({ key: `module-${m.id}`, title: `${m.name}: the components it runs on`, colourBy: 'asil' as const, lit: [m.id] })),
    ...steps.map((st, i) => ({ key: `step-${i + 1}`, title: `${i + 1}. ${st.title}`, colourBy: 'asil' as const, lit: st.modules })),
    { key: 'excluded', title: 'Catalogue software out of scope, where it would run', colourBy: 'excluded', excluded: SW_MODULES.filter(d => !allIds.includes(d.id)).map(d => d.id) },
  ];

  // Reconciliation checks — exact to 1p.
  const checks: SWReportCheck[] = [];
  const chk = (label: string, expected: number, actual: number) => checks.push({ label, expected, actual, ok: Number.isFinite(actual) && near(actual, expected) });
  chk('Modules + programme items = programme total', s.grandTotal, sum(result.modules.map(m => m.grandTotal)) + s.totalHomologation + cloudFixed);
  chk('Engineering (NRE) + lifecycle = programme total', s.grandTotal, nre + lifecycle);
  chk('NRE cost elements = engineering (NRE)', nre, sum(buildUp.nre.map(r => r[1])));
  chk('Lifecycle cost elements = lifecycle', lifecycle, sum(buildUp.lifecycle.map(r => r[1])));
  chk('Domains + programme items = programme total', s.grandTotal, sum(Object.values(s.byCategory)) + s.totalHomologation + cloudFixed);
  chk('Evidence lines = programme total', s.grandTotal, evidence.total);
  if (!isWhole) chk('Slice modules = slice total', sliceTotal, sum(domains.map(d => d.total)));
  for (const r of modules) {
    const m = r.result, c = m.chain;
    chk(`${m.moduleName}: development buckets`, m.development.total, m.development.requirements + m.development.architecture + m.development.algorithmDev + m.development.implementation + m.development.safetyCompliance);
    chk(`${m.moduleName}: effort chain × rate = development`, m.development.total, sum(Object.values(c.bucketPM)) * c.effortRate * c.share);
    chk(`${m.moduleName}: verification sub-buckets`, m.testing.total, m.testing.sil + m.testing.mil + m.testing.hil + m.testing.regression + m.testing.penTest + m.testing.scenarios);
    chk(`${m.moduleName}: NRE elements`, m.totalNonRecurring, m.development.total + m.testing.total + m.integrationCost + m.cybersecCost + m.calibrationCost + m.mlDataCost + m.toolchainCost);
    chk(`${m.moduleName}: engineering + lifecycle`, m.grandTotal, m.totalNonRecurring + m.totalLifecycle);
    chk(`${m.moduleName}: evidence lines`, m.grandTotal, sum(r.evidence.map(e => e.amount)));
  }
  if (!(prog.discountRatePct ?? 0)) chk('Spend by year (nominal) = programme total', s.grandTotal, spend.nominalTotal);

  const sectionIds = PROFILE_SECTIONS[profile].filter(id => !(id === 'definition' && profile !== 'vehicle'));
  let no = 0;
  const sections = sectionIds.map(id => ({ id, title: SECTION_TITLE[id], no: id === 'cover' ? 0 : ++no }));

  return {
    profile, request: req, result, sections, powertrain: prog.powertrain, body: req.bodyType ?? 'suv',
    scopeIds, slice: { total: sliceTotal, nre: sliceNre, lifecycle: sliceTotal - sliceNre, share: s.grandTotal > 0 ? sliceTotal / s.grandTotal : 0, isWhole },
    headline: {
      total: s.grandTotal, perVehicle: s.perVehicle, nre, lifecycle, effortPM: s.totalEffortPersonMonths, devPM: s.totalPersonMonths,
      modules: result.modules.length, domains: new Set(result.modules.map(m => m.category)).size,
      p10: mc.p10, p50: mc.p50, p90: mc.p90, headlinePercentile: mc.headlinePercentile,
      hubMin: sortedHubs[0], hubMax: sortedHubs[sortedHubs.length - 1], unsourcedShare: evidence.unsourcedShare, vehiclesBuilt: unit.vehiclesBuilt,
    },
    programmeItems, findings, definition, components, steps, buildUp, domains, modules, unit, spend, hubs,
    countries: req.countries ?? [], rateCheck: swRateCheck(result), evidence, calibration: swCalibrationPriorities(result), makeBuy,
    quote: swQuoteCheck(result, req.quote ?? {}), assumptions: swAssumptionRows(makeBuy.basis), yourFigures: swYourFigures(result),
    excluded: swExcludedModules(result), gaps: SW_CATALOGUE_GAPS, skeletons, checks,
  };
}
