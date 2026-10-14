/**
 * Automotive Software Should-Cost Engine
 * Senior Chief Automotive Software Should-Cost Engineer model
 * Premium Luxury SUV — Full Software Stack (2024-2026)
 *
 * Covers 54 software modules across 7 categories (43 core + 6 premium-trim options + 5 ICE / hybrid estimates; the
 * last two groups default to off):
 *  A. Powertrain & Battery (EV, ICE, hybrid)   B. ADAS L2/L2+
 *  C. Infotainment & UX         D. Vehicle Domain Controllers
 *  E. Middleware & Platform      F. Cybersecurity
 *  G. OTA & Cloud Backend
 */

import {
  DEFAULT_SW_RATE_LIBRARY,
  resolveRateLibrary,
  rateValues,
} from './sw-rate-library.js';
import type { SWRateLibrary } from './sw-rate-library.js';
import { SW_HUB_RATES, type SWHubId } from './sw-country-rates.js';
import { mulberry32 } from './uncertainty.js';
import { SW_PUBLISHED_PROGRAMMES } from './sw-benchmarks.js';
import { USD_PER_GBP } from './gear-heat-treat-data.js';   // the app's one dated USD→GBP rate

export type { SWRateLibrary, SWRateEntry, RateConfidence } from './sw-rate-library.js';
export { DEFAULT_SW_RATE_LIBRARY } from './sw-rate-library.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ASILLevel       = 'QM' | 'A' | 'B' | 'C' | 'D';
export type SWComplexity    = 'Low' | 'Medium' | 'High' | 'Very High';
export type SWReuse         = 'Fresh' | 'Light' | 'Medium' | 'Heavy' | 'Platform';
/** ISO/SAE 21434 cybersecurity assurance level of a module's item / component ('none' = no cybersecurity goal). */
export type SWCal           = 'none' | 'CAL1' | 'CAL2' | 'CAL3' | 'CAL4';
export type SWCategory      = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
/** A software engineering HUB — a country (or US state) where automotive software is developed, with its own rate
 *  (src/engine/sw-country-rates.ts). */
export type SWRegion        = SWHubId;
export type DevSource       = 'OEM_Internal' | 'Tier1_Supplier' | 'Startup_OSS';
export type SWPowertrain    = 'ICE' | 'MHEV' | 'PHEV' | 'BEV';

/** The retired hub keys (UK base × multiplier book, before Oct 2026) → today's hub. Saved configurations, company books
 *  and version snapshots still carry them; every entry point reads them through `normaliseSWRegion`. */
export const SW_LEGACY_HUBS: Record<string, SWHubId> = {
  EU: 'DE', Eastern_Europe: 'PL', USA_Detroit: 'US-MI', USA_SV: 'US-CA',
  China: 'CN', India: 'IN', Mexico: 'MX', Japan: 'JP',
};

export function normaliseSWRegion(r: string): string {
  return SW_LEGACY_HUBS[r] ?? r;
}

/** Countries with no automotive software centre of their own found by the Oct 2026 research: the hub their software is
 *  costed in, and why. Every other app country IS a hub (its own salaries, on-costs and hours). */
const SW_NEAREST_HUB: Record<string, [SWHubId, string]> = {
  ES: ['PT', 'Iberia — the research found no Spanish embedded-automotive salary data; Portugal (Bosch Braga) is the assessed Iberian hub'],
  NL: ['DE', 'Western Europe — Germany is the nearest assessed hub'],
  BE: ['DE', 'Western Europe — Germany is the nearest assessed hub'],
  SK: ['CZ', 'Central Europe — Czechia is the nearest assessed hub'],
  SI: ['AT', 'Central Europe — Austria is the nearest assessed hub'],
  LT: ['PL', 'Baltic — Poland is the nearest assessed hub'],
  BG: ['RO', 'South-East Europe — Romania is the nearest assessed hub'],
  MA: ['EG', 'North Africa — Egypt (Valeo Cairo) is the assessed North-African hub'],
  TN: ['EG', 'North Africa — Egypt (Valeo Cairo) is the assessed North-African hub'],
  ZA: ['IN', 'no assessed African hub south of Egypt — India, the largest offshore automotive software base'],
  BR: ['MX', 'Latin America — Mexico (Guadalajara) is the assessed hub'],
  TH: ['VN', 'South-East Asia — Vietnam is the assessed hub'],
  MY: ['VN', 'South-East Asia — Vietnam is the assessed hub'],
  ID: ['VN', 'South-East Asia — Vietnam is the assessed hub'],
  PH: ['VN', 'South-East Asia — Vietnam is the assessed hub'],
  TW: ['CN', 'Greater China — China is the assessed hub'],
  SG: ['JP', 'high-cost Asian engineering — Japan is the nearest assessed hub'],
};

/**
 * The software engineering hub a manufacturing country is costed in. A country where automotive software is actually
 * developed is its own hub (own salaries, on-costs, hours — Oct 2026 research); any other takes the nearest hub and the
 * screen SAYS so. The US defaults to Michigan (the OEMs' software centres); California is offered on the picker.
 */
export function swRegionFor(country: string): { region: SWRegion; basis?: string } {
  const c = country.toUpperCase() === 'GB' ? 'UK' : country.toUpperCase();
  if (c === 'US') return { region: 'US-MI', basis: 'United States — Michigan (Detroit / Ann Arbor OEM software centres); choose California for Bay Area teams' };
  if (c in SW_HUB_RATES) return { region: c as SWHubId };
  const near = SW_NEAREST_HUB[c];
  if (near && near[0] in SW_HUB_RATES) return { region: near[0], basis: near[1] };
  return { region: 'IN', basis: 'no assessed hub nearby — India, the largest offshore automotive software base' };
}

// ─── Powertrain scope (software review P1 #5, Oct 2026) ───────────────────────────────────────────────────────────
// ONE definition of which powertrain modules each drivetrain carries. It lived as copies in the screen and in three
// report scripts; ICE carried no powertrain software at all. The screen, the demos and the scripts call this.

const EV_MODULE_IDS  = ['bms_core', 'cell_balancing', 'soc_soh_soe', 'thermal_mgmt', 'fast_charge', 'edu_control', 'inverter_ctrl', 'motor_ctrl', 'regen_braking'];
const ICE_MODULE_IDS = ['engine_control', 'transmission_control', 'aftertreatment_obd'];

export const SW_POWERTRAIN_SCOPE: Record<SWPowertrain, {
  on: string[];
  overrides: Record<string, Partial<Pick<SWModuleInput, 'complexity' | 'asil'>>>;
  note: string;
}> = {
  ICE:  { on: [...ICE_MODULE_IDS], overrides: {},
          note: 'combustion — engine, transmission and after-treatment / OBD software (estimates); no electrified-powertrain software' },
  MHEV: { on: [...ICE_MODULE_IDS, 'mhev_48v', 'hybrid_supervisor', 'thermal_mgmt', 'regen_braking'], overrides: { hybrid_supervisor: { complexity: 'High' } },
          note: '48 V mild hybrid — combustion software plus 48 V BSG / battery control and a simpler energy manager; no high-voltage battery, charging or drive-unit software' },
  PHEV: { on: [...ICE_MODULE_IDS, ...EV_MODULE_IDS, 'hybrid_supervisor'],
          overrides: { bms_core: { complexity: 'High' }, soc_soh_soe: { complexity: 'High' }, edu_control: { complexity: 'High' }, fast_charge: { complexity: 'Medium' } },
          note: 'plug-in hybrid — combustion AND high-voltage software, plus hybrid supervisory control; HV modules de-rated vs a BEV' },
  BEV:  { on: [...EV_MODULE_IDS], overrides: { fast_charge: { complexity: 'Very High' } },
          note: 'battery-electric — the full EV powertrain stack; no combustion or hybrid software' },
};

/** Every module whose presence depends on the drivetrain (category A). Everything else is shared across variants. */
export const SW_POWERTRAIN_MODULE_IDS: ReadonlySet<string> = new Set([...EV_MODULE_IDS, ...ICE_MODULE_IDS, 'hybrid_supervisor', 'mhev_48v']);

/** Switch the powertrain modules on / off for a drivetrain and apply its de-rating; other modules are left as they are. */
export function applyPowertrainScope(modules: SWModuleInput[], pt: SWPowertrain): SWModuleInput[] {
  const scope = SW_POWERTRAIN_SCOPE[pt];
  return modules.map(m => {
    if (!SW_POWERTRAIN_MODULE_IDS.has(m.moduleId)) return m;
    // Reset to the module's own ASIL / complexity first: switching PHEV → BEV kept the PHEV de-rating (found live).
    const def = SW_MODULES.find(d => d.id === m.moduleId);
    return { ...m, enabled: scope.on.includes(m.moduleId),
      ...(def ? { asil: def.defaultAsil, complexity: def.defaultComplexity } : {}),
      ...(scope.overrides[m.moduleId] ?? {}) };
  });
}

/** Share of a module's cost attributed to this variant: shared (non-powertrain) software over the platform volume. */
export function attributedShare(moduleId: string, prog: Pick<SWProgramInputs, 'annualProductionVolume' | 'platformAnnualVolume'>): number {
  if (SW_POWERTRAIN_MODULE_IDS.has(moduleId)) return 1;
  const platform = prog.platformAnnualVolume ?? 0;
  const vol = prog.annualProductionVolume;
  return platform > vol && vol > 0 ? vol / platform : 1;
}

export interface SWModuleDef {
  id:                        string;
  name:                      string;
  shortName:                 string;
  category:                  SWCategory;
  categoryLabel:             string;
  description:               string;
  defaultAsil:               ASILLevel;
  defaultComplexity:         SWComplexity;
  /** NOMINAL effort, person-months: fresh development at QM and Medium complexity. The engine applies the module's
   *  ASIL, complexity and reuse on top (computeModuleCost), exactly as docs/auto-sw-cost.md states
   *  (effortPM = base × reuse → devPM = effortPM × asil_dev). The comment here used to say "at listed ASIL/complexity",
   *  which contradicted that and read as double counting — the engine, its doc and its back-test all use nominal
   *  (software review P1 #1, Oct 2026). The 49 values carry no source; treat them as engineering estimates. */
  basePersonMonths:          number;
  hasMLContent:              boolean;
  hasCloudDependency:        boolean;
  hasCybersecRequirement:    boolean;
  /** Default ISO/SAE 21434 CAL. Read from the informative example table in 21434 Annex E (impact × attack vector) with
   *  CostVision engineering judgement of each module's worst attack vector and impact — a TARA decides the real one.
   *  Absent: 'CAL2' when hasCybersecRequirement, else 'none' (software review P2 #12). */
  defaultCal?:               SWCal;
  testingFractionBase:       number;   // testing cost ÷ dev cost at QM baseline
  integrationFractionBase:   number;   // integration cost ÷ dev cost
  maintenancePctPerYear:     number;   // % of dev cost per year (lifecycle)
  annualToolLicenceGBP:      number;   // development toolchain only (Vector, MATLAB, LDRA, etc.) per year
  annualIPLicenceGBP:        number;   // embedded IP/SW licences (RTOS royalty, map data, ASR engine, etc.) per year
  annualCloudCostGBP:        number;   // cloud infra, per year operational
  calibrationFractionBase:   number;   // physical/model calibration effort ÷ dev cost
  /** Premium/optional feature modules default to false — they are itemised scope
   *  present on premium trims but folded into the generic domain buckets on base
   *  vehicles, so leaving them off preserves the validated baseline. Undefined ⇒ on. */
  defaultEnabled?:           boolean;
  /** Royalty paid per vehicle BUILT, £ (e.g. an OS or speech-engine licence). Charged on this programme's own
   *  volume every year and never apportioned across a platform — each vehicle pays it (software review P2 #11). */
  perVehicleRoyaltyGBP?:     number;
  /** Royalty per vehicle IN SERVICE per year, £ (e.g. map data). The fleet grows by the annual volume each year and
   *  pays until the programme ends — CostVision's assumption, stated in royaltyBasis. */
  perVehiclePerYearGBP?:     number;
  /** Where the royalty figure comes from. */
  royaltyBasis?:             string;
  /** Set on modules whose figures are NOT their own: every number is copied from the named analogue module
   *  (software review P1 #4, Oct 2026). The screen labels these "estimate". */
  estimateBasis?:            string;
  notes:                     string;
  /** A user-defined module (SWCustomModule) — every effort figure is the user's own. */
  custom?:                   boolean;
  /** Lines the user priced with a typed quote (SWQuotes) — each holds the quote's stated source. */
  quoted?:                   { royalty?: string; subscription?: string; ip?: string; cloud?: string };
}

/** A supplier quote or a figure the user stands behind: the value and where it came from (shown in every report). */
export interface SWLineQuote { value: number; source: string }
export interface SWModuleQuotes { perVehicleBuilt?: SWLineQuote; perVehicleYear?: SWLineQuote; annualIP?: SWLineQuote }
/**
 * Typed quotes replace the catalogue's unsourced figures (improvement round, 14 Oct 2026): cloud £ per connected
 * vehicle-year for the whole back-end (spread over the in-scope modules in proportion to their catalogue cloud), and per
 * module the royalty per vehicle built, the subscription per vehicle-year and the IP licence £ a year. A quoted line is
 * graded "entered" with its source; the rest stay as they were.
 */
export interface SWQuotes { cloudPerVehicleYear?: SWLineQuote; modules?: Record<string, SWModuleQuotes> }
/**
 * A module the catalogue does not have (e.g. airbag control, on-board charger): the user names it, picks its domain and
 * gives its NOMINAL effort (person-months, fresh code at QM / Medium) — or sizes it in KSLOC on its module input. Its
 * test / integration / maintenance / calibration fractions are the MEDIAN of the catalogue modules in the same domain
 * (stated in its basis). Nothing is invented: with no effort it costs nothing.
 */
export interface SWCustomModule {
  id:                  string;          // 'custom-…'
  name:                string;
  category:            SWCategory;
  nominalPersonMonths: number;
  defaultAsil:         ASILLevel;
  defaultComplexity:   SWComplexity;
  defaultCal?:         SWCal;
  perVehicleRoyaltyGBP?: number;
  annualIPLicenceGBP?: number;
  source:              string;          // where the effort figure comes from
}

export interface SWModuleInput {
  moduleId:           string;
  enabled:            boolean;
  asil:               ASILLevel;
  complexity:         SWComplexity;
  reuse:              SWReuse;
  customPersonMonths: number | null;   // null = auto
  /** ISO/SAE 21434 CAL; absent = the module's default (calFor). */
  cal?:               SWCal;
  /** Size of the module's software, thousand source lines (KSLOC). When set, the nominal effort comes from the
   *  COCOMO II.2000 equation (cocomoNominalPM) instead of the module catalogue; ASIL, complexity, reuse and the effort
   *  calibration apply on top as usual. A typed custom PM still wins (software review P3 #16). */
  sizeKSLOC?:         number;
}

export interface SWProgramInputs {
  modules:                  SWModuleInput[];
  region:                   SWRegion;
  devSource:                DevSource;
  programLifeYears:         number;   // 10-15 typical
  annualProductionVolume:   number;   // vehicles/yr to amortize SW cost
  teamSeniorFraction:       number;   // 0-1 share of senior engineers: blends the hub's mid and senior rates
  overheadMultiplier:       number;   // facilities/programme overhead on an already-loaded base rate (~1.15 typical)
  includeMaintenanceCost:   boolean;
  includeCloudCost:         boolean;
  /** Your own engineer rate, £ / person-month before overhead. When set it REPLACES the hub's book rate (mid / senior
   *  blend) — it is a figure for this hub, never scaled (code review F4, Oct 2026: it used to be a "UK base" × the
   *  hub multiplier, so an India rate typed in India was costed at a fifth). */
  baseRateGBP?:             number;
  /** Optional rate-library override (partial). Any group omitted falls back to
   *  DEFAULT_SW_RATE_LIBRARY. Lets an engagement supply its own sourced rates. */
  rateLibrary?:             Partial<SWRateLibrary>;
  // ── Optional accuracy levers (all default-neutral: omitting them reproduces
  //    the validated baseline exactly) ──
  /** Schedule compression: 1.0 = nominal; <1 compresses the timeline and inflates
   *  effort (Brooks/COCOMO SCED). e.g. 0.7 = deliver in 70% of nominal time. */
  scheduleCompression?:     number;
  /** Discount rate % for NPV of multi-year lifecycle costs. 0 = nominal (default). */
  discountRatePct?:         number;
  /** NRE cost-recovery window (years) for the per-vehicle figure. Defaults to
   *  programLifeYears; set ~2 to reflect the industry's short recovery window. */
  costRecoveryYears?:       number;
  /** Include ML dataset acquisition/annotation/retraining cost for ML modules. */
  includeMLDataCost?:       boolean;
  /** Include programme-level homologation/compliance (UNECE R155 CSMS + R156
   *  SUMS audits + external ISO 26262 functional-safety assessment). */
  includeHomologation?:     boolean;
  /** The powertrain the module scope was set for (applyPowertrainScope). Recorded for the reports; the scope itself is
   *  in `modules`, so an engineer can still switch a module on or off by hand (software review P1 #5, Oct 2026). */
  powertrain?:              SWPowertrain;
  /** Vehicles / yr across ALL powertrain variants that share the non-powertrain software (ADAS, infotainment, body,
   *  middleware, cyber, cloud). When it exceeds `annualProductionVolume`, each shared module is attributed to this
   *  variant in proportion to its volume — it used to be charged in full to every variant (P1 #5). */
  platformAnnualVolume?:    number;
  /** Effort calibration from the user's own completed projects: Σ actual ÷ Σ modelled person-months over the modules
   *  they logged (sw-calibration.ts::calibrateSWEffort). Multiplies the model's effort estimate (base person-months);
   *  a typed custom person-months is the user's own figure and is not scaled. 1 / absent = uncalibrated (P2 #21). */
  effortCalibration?:       number;
  /** Development duration, months (feasibility → SOP). Tool licences are paid over it, and the phase timeline is
   *  scaled to it. Absent = SW_DEFAULT_DEVELOPMENT_MONTHS, 54 months (Volkswagen's stated cycle — SW_DEVELOPMENT_BASIS; it was the tool's own M1–M90 timeline). */
  developmentMonths?:       number;
  /** Share of the vehicles built that use the cloud back-end (0–1). Absent = 1 (every vehicle connected). */
  connectedVehicleShare?:   number;
  /** The engineering burden on top of the hub rate (salary + statutory on-cost), in three stated layers (gaps round,
   *  Oct 2026). When set, the overhead the engine uses is their product and `overheadMultiplier` is only its echo;
   *  absent (a configuration saved before the layers existed) = that configuration's own `overheadMultiplier`. */
  burden?:                  SWBurden;
  /** Years each vehicle pays a per-vehicle-per-year royalty (map data updates). Absent = SW_DEFAULT_SUBSCRIPTION_YEARS. */
  subscriptionYears?:       number;
  /** Years each connected vehicle is served by the cloud back-end from the year it is built. Absent =
   *  SW_DEFAULT_SERVICE_YEARS. It used to stop at programme end (a car built in the last year was served one year). */
  connectedServiceYears?:   number;
  /** Fixed cloud platform cost, £ / yr, while any vehicle is served (base back-end, PKI, environments). Absent = 0 —
   *  no public figure: enter your platform's own. */
  cloudFixedPerYearGBP?:    number;
  /** Development tools, £ per engineer-seat per year (CANoe, MATLAB / Simulink, compilers, static analysis, AUTOSAR
   *  configurators, HIL share). Absent = SW_TOOL_SEAT_GBP. Tools follow the team, not the module count. */
  toolSeatGBPPerYear?:      number;
  /** Wage escalation on the sustaining team, % / yr. Absent = 0 (real terms). */
  wageEscalationPct?:       number;
  /** Years of security monitoring, vulnerability response and patches AFTER the last vehicle is built (UN R155 /
   *  R156: the duty runs until the end of life of all vehicles of the type). Absent = SW_POST_EOP_YEARS; 0 = none. */
  postProductionSupportYears?: number;
  /** Share of the production-years tail team kept for that support (0–1). Absent = SW_POST_EOP_SHARE. */
  postProductionSupportShare?: number;
  /** Typed supplier quotes that replace catalogue figures (SWQuotes). */
  quotes?:                  SWQuotes;
  /** User-defined modules for software the catalogue lacks (SWCustomModule); each needs a module input to be in scope. */
  customModules?:           SWCustomModule[];
  /** Vehicle types that share the organisation's CSMS / SUMS certification (UNECE R155 / R156). This programme carries
   *  1 ÷ that share of it. Absent = 1 (this programme carries all of it). */
  csmsTypesSharing?:        number;
}

/** The engineering burden on the hub rate, % per layer. Total overhead = Π (1 + layer). */
export interface SWBurden {
  /** Employment cost beyond statutory on-cost: pension top-up, bonus, health and other benefits. */
  employmentPct: number;
  /** Company engineering burden: site, IT, management, training, non-project time. */
  companyPct:    number;
  /** Capital and equipment charge per engineer (workstations, labs) when not priced as its own line. */
  capitalPct:    number;
}

export interface SWDevBreakdown {
  requirements:       number;
  architecture:       number;
  algorithmDev:       number;
  implementation:     number;
  safetyCompliance:   number;
  total:              number;
}

export interface SWTestingBreakdown {
  sil:            number;   // Software-in-Loop
  mil:            number;   // Model-in-Loop
  hil:            number;   // Hardware-in-Loop
  regression:     number;
  penTest:        number;   // Cybersec penetration test
  scenarios:      number;   // ADAS scenario simulation (where applicable)
  total:          number;
}

export interface SWModuleCostResult {
  moduleId:           string;
  moduleName:         string;
  category:           SWCategory;
  categoryLabel:      string;
  asilUsed:           ASILLevel;
  complexityUsed:     SWComplexity;
  reuseUsed:          SWReuse;
  calUsed:            SWCal;
  /** Where the nominal effort came from: the module catalogue, the COCOMO II size equation, or the user's own PM. */
  effortBasis:        'catalogue' | 'size' | 'custom';
  /** Development person-months as COSTED: every development bucket after complexity, the safety-reuse floor and any
   *  schedule penalty — development £ = personMonths × the loaded rate. It used to report the effort before those
   *  scalings (BMS showed 172.8 PM while 258.5 PM were paid for — software review P2 #9). */
  personMonths:       number;
  /** All engineering effort the cost pays for, person-months: development + testing + integration + cybersecurity +
   *  calibration + ML data, ÷ the loaded rate. */
  effortPersonMonths: number;
  development:        SWDevBreakdown;
  testing:            SWTestingBreakdown;
  integrationCost:    number;
  licensingCost:      number;
  cloudCost:          number;
  cybersecCost:       number;
  maintenanceCost:    number;
  toolchainCost:      number;
  calibrationCost:    number;
  mlDataCost:         number;  // ML dataset / annotation / retraining (0 unless includeMLDataCost + hasMLContent)
  totalNonRecurring:  number;  // NRE (dev + test + integration + tool + cyber + calibration + ML data)
  totalLifecycle:     number;  // maintenance + cloud + IP licensing over program life
  grandTotal:         number;
  perVehicle:         number;
  /** Share of this module's cost attributed to the programme: 1, or volume ÷ platform volume for shared software. */
  attributedShare:    number;
  /** NOMINAL £ per programme year (index 0 = production year 1, through the service tail) for the lifecycle lines —
   *  the cost above is their present value. The spend profile and unit economics read these, so every view follows
   *  ONE rule per line. */
  yearly: { maintenance: number[]; licences: number[]; royalties: number[]; cloud: number[] };
  /** The arithmetic behind the module, as computeModuleCost ran it — every factor, so a report can print the chain and a
   *  workbook can rebuild each £ as a formula on visible inputs (360 report, Oct 2026). All £ figures in this result =
   *  the chain's figure × `share`. */
  chain: SWModuleChain;
}

/** Development split of the costed effort (requirements / architecture / algorithms / implementation / safety). */
export const SW_DEV_SPLIT = { requirements: 0.12, architecture: 0.14, algorithmDev: 0.22, implementation: 0.37, safetyCompliance: 0.15 } as const;

export interface SWModuleChain {
  /** Nominal person-months (catalogue / COCOMO size / the user's own PM) before calibration and reuse. */
  nominalPM:      number;
  effortCal:      number;   // effort calibration applied (1 for a typed PM)
  reuseFactor:    number;
  effectivePM:    number;   // nominal × calibration × reuse
  asilDev:        number;
  devPM:          number;   // effective × ASIL
  complexity:     number;   // on the algorithm bucket in full
  implComplexity: number;   // 1 + (complexity − 1) × 0.15, on implementation
  safetyScale:    number;   // safety reuse floor ÷ reuse
  /** Person-months per development bucket, before the schedule penalty. */
  bucketPM:       { requirements: number; architecture: number; algorithmDev: number; implementation: number; safetyCompliance: number };
  /** Hub engineer rate £ / PM (the mid / senior blend, or the typed rate). */
  engineerRate:   number;
  devSourceMult:  number;
  overhead:       number;
  /** engineerRate × devSource × overhead. */
  loadedRate:     number;
  schedPenalty:   number;
  /** loadedRate × schedule penalty — £ per costed development PM. */
  effortRate:     number;
  testFrac:       number;   // testing £ ÷ development £
  testSplit:      { sil: number; mil: number; hil: number; regression: number; penTest: number; scenarios: number };
  integrationFrac: number;
  cyberPct:       number;
  calibrationFrac: number;
  mlFrac:         number;
  /** Engineer-years paid for (NRE effort £ ÷ loaded rate ÷ 12) and the tool seat price applied. */
  engineerYears:  number;
  toolSeatGBP:    number;
  /** Discount factor on tools over the development window (1 at 0 %). */
  toolDiscount:   number;
  maintPct:       number;   // % of (dev + test + integration) a year
  maintBase:      number;   // £ a year at weight 1, before the platform share
  /** Platform share applied to the shared-software £ (royalties and cloud are per vehicle, never shared). */
  share:          number;
}

export interface SWSummary {
  totalDevelopment:   number;
  totalTesting:       number;
  totalIntegration:   number;
  totalLicensing:     number;
  totalCloud:         number;
  totalCybersecurity: number;
  totalMaintenance:   number;
  totalToolchain:     number;
  totalCalibration:   number;
  totalMLData:        number;  // ML dataset/annotation/retraining across modules
  totalHomologation:  number;  // programme-level R155/R156 + ISO 26262 assessment
  nreTotal:           number;  // dev + test + integration + toolchain + cybersec + calibration + ML data + homologation
  grandTotal:         number;
  totalPersonMonths:  number;
  /** Σ effortPersonMonths — all engineering effort costed (P2 #9). */
  totalEffortPersonMonths: number;
  perVehicle:         number;
  byCategory:         Record<SWCategory, number>;
  /** Fixed cloud platform, nominal £ per programme year (index 0 = production year 1). Included in totalCloud (PV). */
  cloudFixedYearly:   number[];
  /** Production years + the service tail (map subscriptions, connected service beyond the last build year). */
  horizonYears:       number;
}

export interface SWSensitivityRow {
  parameter:   string;
  low:         number;
  base:        number;
  high:        number;
  unit:        string;
}

export interface SWPhase {
  name:       string;
  months:     string;
  fraction:   number;   // of NRE total
  nreCost:    number;   // £ from NRE budget
}

export interface SWMonteCarlo {
  p10:            number;   // £ total programme cost
  p50:            number;
  p90:            number;
  mean:           number;
  p10PerVehicle:  number;
  p50PerVehicle:  number;
  p90PerVehicle:  number;
  iterations:     number;
  /** Where the deterministic headline sits in its own band: the share of trials at or below it, 0–100. The bucket
   *  ranges are skewed upwards, so the headline is NOT the median — the screen states this (software review P3 #19). */
  headlinePercentile: number;
  /** The programme total at P5, P10 … P95 (19 points) — the S-curve the screen draws. */
  curve:          number[];
  /** 20 equal-width bins of the programme total, min → max, with the number of trials in each. */
  histogram:      Array<{ lo: number; hi: number; count: number }>;
}

export interface SWBenchmark {
  vehicle:     string;
  totalM:      number;   // £M
  perVehicle:  number;   // £
  source:      string;
  /** False for every published figure today — no source link (sw-benchmarks.ts). */
  verified:    boolean;
  sourceUrl:   string | null;
}

export interface SWProgramResult {
  modules:     SWModuleCostResult[];
  summary:     SWSummary;
  sensitivity: SWSensitivityRow[];
  benchmarks:  SWBenchmark[];
  phases:      SWPhase[];
  monteCarlo:  SWMonteCarlo;
  inputs:      SWProgramInputs;
}

// ─── Multiplier Tables ────────────────────────────────────────────────────────
//
// These are derived from the versioned, sourced rate library (sw-rate-library.ts)
// — the single source of truth. They remain exported as plain numeric maps for
// display and back-compat; a programme can override any of them per engagement
// via SWProgramInputs.rateLibrary (see resolveRates / computeModuleCost).

/** ASIL development overhead multiplier (applied to dev cost) */
export const ASIL_DEV_MULT: Record<ASILLevel, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.asilDevMultipliers);

/** ASIL testing multiplier (testing cost as fraction of adjusted dev cost) */
export const ASIL_TEST_MULT: Record<ASILLevel, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.asilTestMultipliers);

/** Complexity multiplier for algorithm & implementation buckets */
export const COMPLEXITY_MULT: Record<SWComplexity, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.complexityMultipliers);

/** Reuse factor (1.0 = fresh, 0.0 = zero effort) */
export const REUSE_FACTOR: Record<SWReuse, number> = rateValues(DEFAULT_SW_RATE_LIBRARY.reuseFactors);

/** DevSource quality/overhead multiplier */
export const DEV_SOURCE_MULT: Record<DevSource, number> = priceFactors(rateValues(DEFAULT_SW_RATE_LIBRARY.devSourceMultipliers), DEFAULT_SW_RATE_LIBRARY.supplierMargin?.value ?? 0);

/** Numeric rate bundle resolved once per programme (default library + any override). */
interface ResolvedRates {
  /** The engineer rate this programme pays, £ / PM before overhead: the typed rate, or the hub's mid / senior blend. */
  engineerRate:   number;
  typed:          boolean;
  devSource:      Record<DevSource, number>;
  asilDev:        Record<ASILLevel, number>;
  asilTest:       Record<ASILLevel, number>;
  complexity:     Record<SWComplexity, number>;
  reuse:          Record<SWReuse, number>;
}

/** The hub's book rate (£/PM before overhead) at the programme's senior share, from its ACTIVE rate book — the company
 *  book when one is applied, else the built-in one. The screen shows it in the rate field until a rate is typed. */
export function swLibraryBaseRate(prog: Pick<SWProgramInputs, 'rateLibrary' | 'region' | 'teamSeniorFraction'>): number {
  const lib = resolveRateLibrary(prog.rateLibrary);
  const hub = lib.hubRates[normaliseSWRegion(prog.region) as SWRegion];
  if (!hub) return NaN;
  const s = Math.min(1, Math.max(0, prog.teamSeniorFraction ?? 0.5));
  return s * hub.senior.value + (1 - s) * hub.mid.value;
}

/** The loaded £ / PM the engine prices engineering at: the engineer rate × development source × overhead (no schedule
 *  penalty). The rate basis, the costing steps and the supplier check all read this one function. */
export function swLoadedRate(prog: SWProgramInputs): number {
  const p = { ...prog, region: normaliseSWRegion(String(prog.region)) as SWRegion };
  const r = resolveRates(p);
  return r.engineerRate * r.devSource[p.devSource] * swOverhead(p);
}

/** Development-source PRICE factors: in-house = its efficiency; a supplier = efficiency ÷ (1 − margin). */
export function priceFactors(eff: Record<DevSource, number>, margin: number): Record<DevSource, number> {
  const m = Math.min(0.9, Math.max(0, margin));
  return {
    OEM_Internal: eff.OEM_Internal,
    Tier1_Supplier: eff.Tier1_Supplier / (1 - m),
    Startup_OSS: eff.Startup_OSS / (1 - m),
  };
}

function resolveRates(prog: SWProgramInputs): ResolvedRates {
  const lib = resolveRateLibrary(prog.rateLibrary);
  // A typed rate is this hub's own figure and replaces the book's blend (F4).
  const typed = !!(prog.baseRateGBP && prog.baseRateGBP > 0);
  return {
    engineerRate: typed ? prog.baseRateGBP! : swLibraryBaseRate(prog),
    typed,
    // A bought source's price: its efficiency ÷ (1 − supplier margin). In-house carries no margin.
    devSource:  priceFactors(rateValues(lib.devSourceMultipliers), lib.supplierMargin?.value ?? 0),
    asilDev:    rateValues(lib.asilDevMultipliers),
    asilTest:   rateValues(lib.asilTestMultipliers),
    complexity: rateValues(lib.complexityMultipliers),
    reuse:      rateValues(lib.reuseFactors),
  };
}

// ─── Module Database (43 core + 6 premium-optional + 5 ICE / hybrid estimates) ─

export const SW_MODULES: SWModuleDef[] = [
  // ── CATEGORY A: Powertrain & Battery ─────────────────────────────────────
  {
    id: 'bms_core', name: 'BMS Core Software', shortName: 'BMS Core',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Battery pack monitoring, protection logic, cell voltage/temp acquisition, state machine management, ASIL-D safety logic.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 90,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 52_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-D per ISO 26262. Vector DaVinci, MATLAB/Simulink TargetLink. Safety-critical gateway. 2–3 yr development cycle.',
  },
  {
    id: 'cell_balancing', name: 'Cell Balancing Algorithms', shortName: 'Cell Balancing',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Active/passive balancing algorithms, balancing current control, energy routing optimisation.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.38, integrationFractionBase: 0.12, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 13_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-C. Tightly coupled to cell chemistry model. Requires HIL bench with actual cells.',
  },
  {
    id: 'soc_soh_soe', name: 'SOC/SOH/SOE Estimation Models', shortName: 'SOC/SOH/SOE',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Electrochemical & data-driven (ML) State of Charge, Health, Energy estimation. Kalman, EKF, neural network approaches.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.14, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 27_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 120_000,
    calibrationFractionBase: 0.12,
    notes: 'Proprietary ML models. Cloud training infrastructure. Critical for range display accuracy. Ongoing cloud retraining.',
  },
  {
    id: 'thermal_mgmt', name: 'Battery Thermal Management Software', shortName: 'Thermal Mgmt',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Thermal control loops, coolant pump/valve actuation, fast-charge thermal preconditioning, cabin integration.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.15, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 18_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-B. Coupled to HVAC system. Climate chamber HIL essential.',
  },
  {
    id: 'fast_charge', name: 'Fast-Charging Control Software', shortName: 'Fast Charge',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'CCS/CHAdeMO/OCPP protocol stacks, dynamic power curve management, thermal derating during charge.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 25,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.38, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 11_000, annualIPLicenceGBP: 14_000, annualCloudCostGBP: 30_000,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-C. ISO 15118 protocol licensing. OCPP backend integration. Charging network API security.',
  },
  {
    id: 'edu_control', name: 'EDU (Electric Drive Unit) Control Software', shortName: 'EDU Control',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Integrated electric drive unit control, dual-motor torque vectoring, multi-speed gearbox integration, creep & one-pedal drive.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.42, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 57_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    notes: 'ASIL-D. Tightly coupled to VCU. Real-time control at <250µs cycle. TargetLink/ASCET required.',
  },
  {
    id: 'inverter_ctrl', name: 'Inverter Control Algorithms', shortName: 'Inverter Ctrl',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Space Vector PWM, switching frequency optimisation, dead-time compensation, EMI management, demagnetisation protection.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 45_000, annualIPLicenceGBP: 14_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-D. FPGA-accelerated control loop. Simulation-first (PLECS/MATLAB Power Systems).',
  },
  {
    id: 'motor_ctrl', name: 'Motor Control (FOC/DTC/SVPWM)', shortName: 'Motor Control',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Field-oriented control, direct torque control, sensorless rotor position estimation, flux linkage tables, temperature derating.',
    defaultAsil: 'D', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 42_000, annualIPLicenceGBP: 12_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    notes: 'ASIL-D. Motor characterisation dyno testing mandatory. Coupled to inverter firmware.',
  },
  {
    id: 'regen_braking', name: 'Regenerative Braking Software', shortName: 'Regen Braking',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Brake blending control, hydraulic-electric transition, ABS/ESC coordination, one-pedal tuning, driver feel calibration.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.38, integrationFractionBase: 0.16, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-C. Brake blending complexity is high. Requires cold-weather/low-mu testing.',
  },

  // ── CATEGORY B: ADAS L2/L2+ ──────────────────────────────────────────────
  {
    id: 'camera_perception', name: 'Camera Perception Stack', shortName: 'Camera Perception',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Object detection/classification (DNN), lane detection, traffic sign recognition, free-space estimation, parking vision. Mono + stereo cameras.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 130,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.50, integrationFractionBase: 0.20, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 108_000, annualIPLicenceGBP: 160_000, annualCloudCostGBP: 850_000,
    calibrationFractionBase: 0.06,
    notes: 'Largest ADAS component. DNN training on GPU clusters. ASIL-B decomposition. NCAP scenario coverage critical.',
  },
  {
    id: 'radar_processing', name: 'Radar Processing Stack', shortName: 'Radar Proc.',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'FMCW radar DSP, CFAR detection, Doppler processing, angle estimation, object tracking and classification.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 60,
    hasMLContent: true, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.45, integrationFractionBase: 0.16, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 54_000, annualIPLicenceGBP: 40_000, annualCloudCostGBP: 80_000,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-B. Requires anechoic chamber + track testing. Multi-target tracking Kalman filter.',
  },
  {
    id: 'ultrasonic', name: 'Ultrasonic Processing Software', shortName: 'Ultrasonic',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Short-range object detection, parking guidance, cross-traffic alert, time-of-flight processing for 12-16 sensors.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.12, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 7_000, annualIPLicenceGBP: 8_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.06,
    notes: 'ASIL-B for AEB trigger path. Relatively mature technology — significant IP available.',
  },
  {
    id: 'sensor_fusion', name: 'Sensor Fusion Engine', shortName: 'Sensor Fusion',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Multi-modal object fusion (camera + radar + lidar if fitted), probabilistic world model, occupancy grid, track management.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 95,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.22, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 72_000, annualIPLicenceGBP: 55_000, annualCloudCostGBP: 200_000,
    calibrationFractionBase: 0.08,
    notes: 'ASIL-C. The architectural heart of ADAS. EKF + deep learning hybrid.',
  },
  {
    id: 'path_planning', name: 'Path Planning Algorithms', shortName: 'Path Planning',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Behaviour prediction, trajectory generation, cost-function optimisation, comfort/safety trade-off. HD map integration where applicable.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 80,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.20, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 57_000, annualIPLicenceGBP: 50_000, annualCloudCostGBP: 150_000,
    calibrationFractionBase: 0.06,
    notes: 'ASIL-C. Novel research area — simulation-first (CARLA/LGSVL). Scenario coverage >500M virtual km.',
  },
  {
    id: 'control_algos', name: 'Control Algorithms (ACC / LKA / AEB)', shortName: 'ACC/LKA/AEB',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Longitudinal ACC, lateral LKA, emergency AEB, FCW, emergency steering. Control law design, tuning, gain scheduling.',
    defaultAsil: 'D', defaultComplexity: 'High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.48, integrationFractionBase: 0.18, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 48_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.14,
    notes: 'AEB is ASIL-D (brake actuation). LKA/ACC ASIL-C. Regulation: UN-ECE R152/R151/R130.',
  },
  {
    id: 'driver_monitor', name: 'Driver Monitoring Software (DMS)', shortName: 'Driver Monitor',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Gaze tracking, drowsiness detection, attention estimation, hands-on-wheel detection. IR camera + CNN inference.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 55,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL2',
    testingFractionBase: 0.45, integrationFractionBase: 0.16, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 51_000, annualIPLicenceGBP: 90_000, annualCloudCostGBP: 180_000,
    calibrationFractionBase: 0.06,
    notes: 'ASIL-B (alert pathway). GDPR/biometric data handling critical. SmartEye/Seeing Machines IP.',
  },
  {
    id: 'highway_assist', name: 'Highway Assist / Traffic Jam Assist', shortName: 'Highway Assist',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Combined longitudinal + lateral control for highway driving, hands-off monitoring, lane change assist, automated speed adaptation.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 75,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.50, integrationFractionBase: 0.22, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 60_000, annualIPLicenceGBP: 65_000, annualCloudCostGBP: 220_000,
    calibrationFractionBase: 0.10,
    notes: 'ASIL-C. Integrates all ADAS features into L2+ use case. Euro NCAP 2026 mandatory.',
  },

  // ── CATEGORY C: Infotainment, Connectivity & UX ──────────────────────────
  {
    id: 'ivi_os', name: 'IVI Operating System (Android Automotive / QNX)', shortName: 'IVI OS',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Android Automotive OS or QNX BSP integration, platform services, GPU driver optimisation, boot time optimisation, security hardening.',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 160,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.35, integrationFractionBase: 0.22, maintenancePctPerYear: 18,
    annualToolLicenceGBP: 168_000, annualIPLicenceGBP: 0, annualCloudCostGBP: 120_000,
    calibrationFractionBase: 0.02,
    perVehicleRoyaltyGBP: Math.round(25 / USD_PER_GBP * 100) / 100,
    royaltyBasis: 'Unsourced placeholder ~$25 / vehicle for Google Automotive Services (GAS) or a QNX runtime licence — neither price is public: Google does not publish a GAS fee, and BlackBerry licenses QNX per unit but publishes no per-vehicle royalty (FY26 QNX revenue US$268M, royalty backlog ~US$950M, 275M+ vehicles — SEC 10-K). Android Automotive OS itself is open source with no licence fee. Replace with your supplier quote.',
    notes: 'GAS or QNX per-unit licence (no public price). Boot < 4s target.',
  },
  {
    id: 'navigation', name: 'Navigation Stack', shortName: 'Navigation',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Routing engine, map rendering, offline capability, real-time traffic (HERE/TomTom), EV routing with charge planning.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 33_000, annualIPLicenceGBP: 0, annualCloudCostGBP: 380_000,
    calibrationFractionBase: 0.02,
    perVehiclePerYearGBP: 11.5,
    royaltyBasis: 'Map data £8–15 / vehicle / yr — midpoint £11.50, an unsourced estimate: neither HERE nor TomTom publishes a per-car price (TomTom FY25: automotive revenue €322M, backlog €2.4bn, no vehicle count), paid for the subscription years after each vehicle is built (default 3 — OEM map-update terms).',
    notes: 'Map data licence (HERE / TomTom, no public per-car price). Real-time traffic API cloud cost significant.',
  },
  {
    id: 'voice_assistant', name: 'Vehicle Voice Assistant', shortName: 'Voice Assistant',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Wake word detection, ASR (on-device + cloud), NLU, TTS, vehicle function control, 3rd-party assistant integration (Alexa/Google).',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.35, integrationFractionBase: 0.18, maintenancePctPerYear: 16,
    // Cerence's own average price per unit INCLUDES its connected (cloud) services, so the separate £450k / yr voice cloud
    // is gone — it counted the cloud twice (costing review #5, Oct 2026). US$5.09 = TTM to Q2 FY2026 (US$5.05 at Q4 FY25),
    // Cerence earnings decks filed with the SEC — re-checked 14 Oct 2026.
    annualToolLicenceGBP: 57_000, annualIPLicenceGBP: 0, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.04,
    perVehicleRoyaltyGBP: Math.round(5.09 / USD_PER_GBP * 100) / 100,
    royaltyBasis: 'Cerence average price per unit US$5.09 (TTM to Q2 FY2026; US$5.05 at Q4 FY2025; includes connected services) at the app\'s USD_PER_GBP — Cerence earnings decks filed with the SEC (EX-99), read via search results.',
    notes: 'On-device + cloud voice (Cerence, SoundHound). Cerence PPU $5.09 (TTM Q2 FY26) includes connected services.',
  },
  {
    id: 'tcu_software', name: 'Telematics Control Unit (TCU) Software', shortName: 'TCU Software',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: '5G/LTE modem management, emergency call (eCall), remote diagnostics, remote access, V2X readiness, OBD-II data relay.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.38, integrationFractionBase: 0.15, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 21_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 90_000,
    calibrationFractionBase: 0.04,
    // Cellular standard-essential patents: the Avanci vehicle licence is taken by the CAR MAKER, once per vehicle —
    // 4G US$20 (5G US$32; 3G US$9; eCall only US$3), avanci.com, re-checked 14 Oct 2026.
    perVehicleRoyaltyGBP: Math.round(20 / USD_PER_GBP * 100) / 100,
    royaltyBasis: 'Avanci 4G vehicle licence (cellular standard-essential patents) US$20 per vehicle, paid once by the car maker — avanci.com published rate (5G US$32, 3G US$9, eCall only US$3), at the app\'s USD_PER_GBP. Set to 0 if your TCU supplier\'s price already carries it.',
    notes: 'eCall path ASIL-B per EU regulation. 3GPP modem certification adds cost. Avanci cellular SEP licence US$20 (4G) / US$32 (5G) per vehicle.',
  },
  {
    id: 'connectivity_stack', name: 'Bluetooth / WiFi / 5G Connectivity Stack', shortName: 'Connectivity',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'BT5.x stack (audio, phone), WiFi 6/6E AP+client, 5G SA/NSA modem driver integration, hotspot management.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.30, integrationFractionBase: 0.12, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 24_000, annualIPLicenceGBP: 35_000, annualCloudCostGBP: 20_000,
    calibrationFractionBase: 0.03,
    notes: 'Qualcomm/NXP modem IP licensing. PTCRB/GCF certification. Bluetooth: patent licence royalty-free; SIG qualification fee US$12,000 per product design (bluetooth.com fee schedule, from 1 Mar 2026) — one-off.',
  },
  {
    id: 'hmi_framework', name: 'App Framework & HMI Layer', shortName: 'HMI Framework',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'UI framework (Qt/Flutter/React Native Automotive), instrument cluster rendering, haptics, multi-screen management, UX design system.',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 85,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.15, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 39_000, annualIPLicenceGBP: 90_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.02,
    notes: 'Qt licence ~£90k/yr (unsourced — The Qt Company publishes no automotive price; Qt Group 2025 distribution licences €56.8M across all industries). 60fps rendering on large displays.',
  },

  // ── CATEGORY D: Vehicle Domain Controllers ────────────────────────────────
  {
    id: 'body_control', name: 'Body Control Software', shortName: 'Body Control',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Lighting control, power windows/mirrors/sunroof, door locks, wiper logic, ambient lighting, comfort features state machines.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.32, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 17_000, annualIPLicenceGBP: 10_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.06,
    notes: 'Partially ASIL-B (exterior lighting). High breadth of features. AUTOSAR Classic.',
  },
  {
    id: 'chassis_control', name: 'Chassis Control Software', shortName: 'Chassis Control',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Air suspension, CDC (Continuous Damping Control), active anti-roll bars, 4WS (rear steering), hill-hold, terrain modes.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 60,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 33_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.14,
    notes: 'ASIL-C (active suspension failure modes). Extensive proving ground calibration.',
  },
  {
    id: 'gateway_ecu', name: 'Gateway ECU Software', shortName: 'Gateway ECU',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'CAN/LIN/FlexRay/Ethernet routing, signal translation, diagnostic gateway, firewall, network management master.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.35, integrationFractionBase: 0.16, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 21_000, annualIPLicenceGBP: 12_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.04,
    notes: 'ASIL-B. Security gateway per UN-ECE R155. Vector CANdb++ and autosar tool suite required.',
  },
  {
    id: 'zonal_arch', name: 'Zonal Architecture Software', shortName: 'Zonal Arch.',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Zone controller software, power distribution management, ECU consolidation logic, 100BASE-T1 Ethernet backbone management.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.38, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 45_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.05,
    notes: 'Cutting-edge architecture (BMW NCA, Mercedes MBOSx). AUTOSAR Adaptive.',
  },
  {
    id: 'vehicle_motion', name: 'Vehicle Motion Management (VMM)', shortName: 'VMM',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Unified torque arbitration, coordinated chassis & propulsion control, stability control, oversteer/understeer management, tyre model.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 80,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.45, integrationFractionBase: 0.22, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 54_000, annualIPLicenceGBP: 28_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.16,
    notes: 'ASIL-C. The "software chassis". MBD mandatory. Pacejka/MF-Tyre model IP.',
  },

  // ── CATEGORY E: Middleware & Platform ────────────────────────────────────
  {
    id: 'autosar_classic', name: 'AUTOSAR Classic BSW & Integration', shortName: 'AUTOSAR Classic',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'AUTOSAR Classic BSW configuration (Vector DaVinci, ETAS ISOLAR), OS (OSEK/VDX), COM stack, run-time environment (RTE) integration.',
    defaultAsil: 'C', defaultComplexity: 'High', basePersonMonths: 45,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.20, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 132_000, annualIPLicenceGBP: 130_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.04,
    notes: 'Vector DaVinci + EB tresos stack royalty. Mainly integration work. High toolchain cost dominates.',
  },
  {
    id: 'autosar_adaptive', name: 'AUTOSAR Adaptive Platform', shortName: 'AUTOSAR Adaptive',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'ara::com service-oriented communication, execution management, update management (UCM), PHM, crypto API, DDS integration.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 60,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.38, integrationFractionBase: 0.22, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 108_000, annualIPLicenceGBP: 110_000, annualCloudCostGBP: 30_000,
    calibrationFractionBase: 0.04,
    notes: 'Vector MICROSAR Adaptive or EB corbos. Growing importance with zonal E/E.',
  },
  {
    id: 'rtos', name: 'RTOS & OS Porting', shortName: 'RTOS',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'OSEK/VDX, FreeRTOS, or commercial RTOS BSP integration, task scheduling optimisation, interrupt management, memory protection.',
    defaultAsil: 'C', defaultComplexity: 'Medium', basePersonMonths: 12,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.14, maintenancePctPerYear: 6,
    annualToolLicenceGBP: 27_000, annualIPLicenceGBP: 35_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Mostly licensed (ETAS, QNX, Green Hills). Internal effort mainly BSP porting and configuration.',
  },
  {
    id: 'diagnostics', name: 'Diagnostics (UDS / OBD-II)', shortName: 'Diagnostics',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'UDS (ISO 14229), OBD-II (SAE J1979), DTC definition, diagnostic service implementation, DEXT generation, coding routines.',
    defaultAsil: 'A', defaultComplexity: 'Medium', basePersonMonths: 25,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 18_000, annualIPLicenceGBP: 16_000, annualCloudCostGBP: 25_000,
    calibrationFractionBase: 0.05,
    notes: 'ISO 14229 mandatory. CANoe (Vector) for all diagnostic testing. ODX/PDXF toolchain.',
  },
  {
    id: 'comm_stacks', name: 'CAN / LIN / FlexRay / Ethernet Communication Stacks', shortName: 'Comm. Stacks',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'AUTOSAR ComStack configuration, CAN-XL support, Automotive Ethernet (10/100BASE-T1), signal routing, PDU mapping, SOME/IP.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 30_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Mainly AUTOSAR configuration (Vector DaVinci NetworkDesigner). SOME/IP middleware growing.',
  },
  {
    id: 'time_sync', name: 'Time Synchronisation & Network Management', shortName: 'Time Sync / NM',
    category: 'E', categoryLabel: 'Middleware & Platform',
    description: 'gPTP (IEEE 802.1AS) for Ethernet time sync, CAN NM master, sleep/wake management, partial networking.',
    defaultAsil: 'A', defaultComplexity: 'Low', basePersonMonths: 14,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 6,
    annualToolLicenceGBP: 11_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Critical for sensor fusion temporal alignment. AUTOSAR NM fully handled by BSW.',
  },

  // ── CATEGORY F: Cybersecurity ─────────────────────────────────────────────
  {
    id: 'secure_boot', name: 'Secure Boot & Root of Trust', shortName: 'Secure Boot',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Hardware Security Module (HSM) integration, key provisioning, boot chain verification, anti-rollback, attestation.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.45, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 24_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 45_000,
    calibrationFractionBase: 0.04,
    notes: 'UN-ECE R155 mandatory. NXP/Infineon HSM IP. Key injection in production.',
  },
  {
    id: 'encryption', name: 'Encryption Modules & Crypto Stack', shortName: 'Encryption',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'AES-256, RSA-2048, ECC, TLS 1.3 for V2X/cloud, AUTOSAR Crypto Stack, hardware crypto acceleration.',
    defaultAsil: 'B', defaultComplexity: 'Medium', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.40, integrationFractionBase: 0.14, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 16_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.03,
    notes: 'Wolfssl/mbedTLS licence. AUTOSAR CSM configuration. Quantum-safe migration roadmap.',
  },
  {
    id: 'ids', name: 'Intrusion Detection System (IDS)', shortName: 'IDS / IDPS',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'In-vehicle network anomaly detection, CAN message monitoring, rate-limiting, VSOC integration, event reporting to cloud.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 33_000, annualIPLicenceGBP: 45_000, annualCloudCostGBP: 90_000,
    calibrationFractionBase: 0.05,
    notes: 'UN-ECE R155 triage requirement. ARGUS/Upstream/GuardKnox IP options.',
  },
  {
    id: 'secure_ota', name: 'Secure OTA Software Update Framework', shortName: 'Secure OTA',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Delta update generation, signature verification, rollback protection, update orchestration, bandwidth management.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 20,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 30_000, annualIPLicenceGBP: 35_000, annualCloudCostGBP: 120_000,
    calibrationFractionBase: 0.04,
    notes: 'Integrated with AUTOSAR UCM. Excelfore/Airbiquity delta compression IP.',
  },
  {
    id: 'key_mgmt', name: 'Key Management System', shortName: 'Key Management',
    category: 'F', categoryLabel: 'Cybersecurity (ISO 21434)',
    description: 'Certificate lifecycle management, PKI integration, key derivation, secure key storage, provisioning infrastructure.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 15,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.40, integrationFractionBase: 0.14, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 21_000, annualIPLicenceGBP: 28_000, annualCloudCostGBP: 80_000,
    calibrationFractionBase: 0.04,
    notes: 'PKI infrastructure cloud-hosted. Certificate provisioning at end-of-line (EoL).',
  },

  // ── CATEGORY G: OTA & Cloud Backend ──────────────────────────────────────
  {
    id: 'ota_manager', name: 'OTA Update Manager (Vehicle-side)', shortName: 'OTA Manager',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Vehicle-side update campaign execution, ECU coordination, rollback, consent management, network condition handling.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.38, integrationFractionBase: 0.18, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 24_000, annualIPLicenceGBP: 55_000, annualCloudCostGBP: 180_000,
    calibrationFractionBase: 0.04,
    notes: 'AUTOSAR UCM Adapter. Must handle fleet-wide rollout with A/B validation.',
  },
  {
    id: 'cloud_backend', name: 'Cloud Backend Services', shortName: 'Cloud Backend',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Vehicle connectivity backend, API gateway, device shadow, remote command, data lake, microservices architecture (AWS/Azure/GCP).',
    defaultAsil: 'QM', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.32, integrationFractionBase: 0.16, maintenancePctPerYear: 20,
    annualToolLicenceGBP: 48_000, annualIPLicenceGBP: 130_000, annualCloudCostGBP: 1_200_000,
    calibrationFractionBase: 0.03,
    notes: 'Largest cloud cost. Scales with fleet size. AWS IoT Core / Azure IoT Hub.',
  },
  {
    id: 'data_pipeline', name: 'Data Pipeline & Telemetry', shortName: 'Data Pipeline',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'In-vehicle data collection agent, edge pre-processing, telemetry streaming, data lake ingestion, GDPR/data governance.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.30, integrationFractionBase: 0.14, maintenancePctPerYear: 14,
    annualToolLicenceGBP: 27_000, annualIPLicenceGBP: 65_000, annualCloudCostGBP: 320_000,
    calibrationFractionBase: 0.04,
    notes: 'GDPR consent management. Apache Kafka / Kinesis streaming.',
  },
  {
    id: 'fleet_mgmt', name: 'Fleet Management & Analytics Software', shortName: 'Fleet Mgmt',
    category: 'G', categoryLabel: 'OTA & Cloud Backend',
    description: 'Fleet health dashboard, predictive maintenance, usage analytics, dealer portal, subscription management, over-the-air campaign tools.',
    defaultAsil: 'QM', defaultComplexity: 'Medium', basePersonMonths: 20,
    hasMLContent: true, hasCloudDependency: true, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 16,
    annualToolLicenceGBP: 18_000, annualIPLicenceGBP: 45_000, annualCloudCostGBP: 200_000,
    calibrationFractionBase: 0.03,
    notes: 'SaaS platform option (Bright Box, Verizon Connect) vs in-house. Dealer portal API licensing.',
  },

  // ── PREMIUM / FLAGSHIP-TRIM OPTIONS ───────────────────────────────────────
  // Itemised software that flagship trims fund as distinct workstreams but that
  // base vehicles fold into the generic domain buckets (chassis/body/HMI). These
  // default to OFF so the validated 43-module baseline is unchanged; the vehicle
  // demos and any premium programme switch them on. Categories reuse B/C/D so the
  // UI groups them under the existing domain headers.
  {
    id: 'active_suspension', name: 'Predictive Active Suspension & Body Control', shortName: 'Active Body Ctrl',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Camera-fed road-surface preview, 48V active anti-roll / active body control (e.g. Mercedes E-Active Body Control, BMW Executive Drive Pro, JLR Dynamic Response Pro), coordinated air-spring + adaptive-damper + rear-axle-steer control on top of baseline chassis control.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.44, integrationFractionBase: 0.20, maintenancePctPerYear: 11,
    annualToolLicenceGBP: 34_000, annualIPLicenceGBP: 16_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.16,
    defaultEnabled: false,
    notes: 'Premium-trim increment over chassis_control. Heavy proving-ground ride/handling calibration. ASIL-C.',
  },
  {
    id: 'premium_audio', name: 'Premium Audio DSP & Active Noise Control', shortName: 'Premium Audio/ANC',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Branded 3D surround tuning (Meridian / Bowers & Wilkins / Bang & Olufsen / Burmester), active road/engine noise cancellation (ANC/RNC), active sound design, per-cabin acoustic calibration.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 28,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.28, integrationFractionBase: 0.12, maintenancePctPerYear: 7,
    annualToolLicenceGBP: 20_000, annualIPLicenceGBP: 42_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    defaultEnabled: false,
    notes: 'Branded-audio DSP royalty (Dirac/Klippel toolchain). Per-model cabin acoustic tuning dominates effort.',
  },
  {
    id: 'park_assist', name: 'Automated Parking & Surround-View', shortName: 'Auto Park/360',
    category: 'B', categoryLabel: 'ADAS Level 2 & 2+',
    description: 'Automated parking assist (APA), remote/summon parking (RPA), 360° surround-view stitching, parking-slot detection, low-speed manoeuvre planning fusing ultrasonic + cameras.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 48,
    hasMLContent: true, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 30_000, annualIPLicenceGBP: 12_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    defaultEnabled: false,
    notes: 'Slot-detection CNN (ML). Extensive parking-scenario validation. ASIL-B (low-speed manoeuvring).',
  },
  {
    id: 'climate_control', name: 'Climate & Thermal Comfort Control', shortName: 'Climate/HVAC',
    category: 'D', categoryLabel: 'Vehicle Domain Controllers',
    description: 'Multi-zone HVAC control, heat-pump coordination, cabin air purification/ionisation, pre-conditioning, humidity & fogging management, seat/steering-wheel comfort thermal loops.',
    defaultAsil: 'A', defaultComplexity: 'Medium', basePersonMonths: 26,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.30, integrationFractionBase: 0.12, maintenancePctPerYear: 8,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.08,
    defaultEnabled: false,
    notes: 'Cabin-comfort software split out of body_control on premium multizone systems. Thermal calibration effort.',
  },
  {
    id: 'digital_key', name: 'Digital Key (UWB/BLE) & Secure Access', shortName: 'Digital Key',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'CCC Digital Key 3.0 phone-as-key, UWB ranging & relay-attack protection, BLE fallback, secure-element / HSM integration, key sharing & cloud provisioning backend.',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 22,
    hasMLContent: false, hasCloudDependency: true, hasCybersecRequirement: true, defaultCal: 'CAL4',
    testingFractionBase: 0.32, integrationFractionBase: 0.14, maintenancePctPerYear: 9,
    annualToolLicenceGBP: 15_000, annualIPLicenceGBP: 20_000, annualCloudCostGBP: 30_000,
    calibrationFractionBase: 0.03,
    defaultEnabled: false,
    notes: 'CCC consortium membership + UWB IP. Cybersecurity-critical (relay attacks). Cloud key provisioning.',
  },
  {
    id: 'ar_hud', name: 'AR Head-Up Display & AR Navigation', shortName: 'AR-HUD',
    category: 'C', categoryLabel: 'Infotainment, Connectivity & UX',
    description: 'Augmented-reality head-up display compositor, sensor-registered navigation/ADAS overlays, optical distortion correction, graphics rendering pipeline for the AR-HUD projector.',
    defaultAsil: 'A', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.32, integrationFractionBase: 0.14, maintenancePctPerYear: 9,
    annualToolLicenceGBP: 22_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    defaultEnabled: false,
    notes: 'AR engine licence (e.g. WayRay/Envisics). Optical registration & distortion calibration. ASIL-A (driver-facing overlay).',
  },

  // ── Combustion and hybrid powertrain (software review P1 #4, Oct 2026) ──────────────────────────────────────────
  // The table had no ICE or hybrid software at all: an ICE variant costed £0 of powertrain software and a PHEV only
  // 3.5 % more than a BEV. No sourced effort figure was found for these modules, so EVERY number below is copied
  // from the closest existing module (named in estimateBasis) — an estimate, labelled so on screen. Default off: the
  // powertrain input (computeSWProgram → powertrainModules) switches them on for ICE / MHEV / PHEV.
  {
    id: 'engine_control', name: 'Engine Management Software (ECU)', shortName: 'Engine Control',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Combustion engine control: air / fuel / ignition, torque structure and torque monitoring, start-stop, knock and misfire control.',
    defaultAsil: 'B', defaultComplexity: 'Very High', basePersonMonths: 65,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: true, defaultCal: 'CAL3',
    testingFractionBase: 0.42, integrationFractionBase: 0.20, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 57_000, annualIPLicenceGBP: 22_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    defaultEnabled: false,
    estimateBasis: 'edu_control (EDU control) — all figures copied; default ASIL B (torque monitoring) is engineering judgement, unsourced',
    notes: 'ESTIMATE by analogue. Engine calibration is usually a large separate programme — the 0.12 calibration fraction is the analogue\'s and is likely low; enter your own if known.',
  },
  {
    id: 'transmission_control', name: 'Transmission Control Software (TCU)', shortName: 'Transmission',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Automatic / dual-clutch transmission control: shift strategy, clutch control, torque interventions, limp-home.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 60,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.40, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 33_000, annualIPLicenceGBP: 18_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.14,
    defaultEnabled: false,
    estimateBasis: 'chassis_control (chassis control) — all figures copied; default ASIL B is engineering judgement, unsourced',
    notes: 'ESTIMATE by analogue. A carry-over transmission is usually Heavy / Platform reuse.',
  },
  {
    id: 'aftertreatment_obd', name: 'Emissions After-treatment & OBD', shortName: 'After-treatment / OBD',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Catalyst / particulate-filter / SCR control and the legally required on-board diagnostic monitors (EOBD / OBD-II).',
    defaultAsil: 'QM', defaultComplexity: 'High', basePersonMonths: 30,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.35, integrationFractionBase: 0.15, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 18_000, annualIPLicenceGBP: 6_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.10,
    defaultEnabled: false,
    estimateBasis: 'thermal_mgmt (thermal control loops) — all figures copied; QM (emissions are legal, not safety, requirements) is engineering judgement',
    notes: 'ESTIMATE by analogue. Emissions homologation testing is not included.',
  },
  {
    id: 'hybrid_supervisor', name: 'Hybrid Supervisory Control & Energy Management', shortName: 'Hybrid Supervisor',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: 'Hybrid mode selection, engine / e-machine torque split, battery state-of-charge strategy, blended regeneration.',
    defaultAsil: 'C', defaultComplexity: 'Very High', basePersonMonths: 80,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.45, integrationFractionBase: 0.22, maintenancePctPerYear: 12,
    annualToolLicenceGBP: 54_000, annualIPLicenceGBP: 28_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.16,
    defaultEnabled: false,
    estimateBasis: 'vehicle_motion (vehicle-level torque coordination) — all figures copied; default ASIL C is engineering judgement, unsourced',
    notes: 'ESTIMATE by analogue. MHEV energy management is simpler — the MHEV scope runs it at High complexity.',
  },
  {
    id: 'mhev_48v', name: '48 V Belt Starter-Generator & Battery Control', shortName: '48 V BSG / Battery',
    category: 'A', categoryLabel: 'Powertrain & Battery',
    description: '48 V belt starter-generator motor control, boost / recuperation, 48 V battery and DC-DC management.',
    defaultAsil: 'B', defaultComplexity: 'High', basePersonMonths: 42,
    hasMLContent: false, hasCloudDependency: false, hasCybersecRequirement: false,
    testingFractionBase: 0.42, integrationFractionBase: 0.18, maintenancePctPerYear: 10,
    annualToolLicenceGBP: 42_000, annualIPLicenceGBP: 12_000, annualCloudCostGBP: 0,
    calibrationFractionBase: 0.12,
    defaultEnabled: false,
    estimateBasis: 'motor_ctrl (motor control) — all figures copied; ASIL B and High complexity (low-voltage machine) are engineering judgement',
    notes: 'ESTIMATE by analogue. Often a supplier-delivered unit — set reuse Heavy / Platform if bought in.',
  },
];

// ─── Structure and burden defaults (gaps round, Oct 2026) ─────────────────────────────────────────────────────────
// Every default below states its basis. Figures read from search results of the cited pages (no page could be opened).

/** Burden layers on the hub rate (salary + statutory employer on-cost). */
export const SW_DEFAULT_BURDEN: SWBurden = { employmentPct: 15, companyPct: 40, capitalPct: 0 };
export const SW_BURDEN_BASIS = {
  employment: 'CostVision estimate: pension top-up, bonus and benefits. With the UK statutory on-cost (13.9 %) it gives ' +
    'an employment cost of 1.31 × salary, inside the published 1.25–1.4 × (Hadzima, MIT, "How much does an employee cost?").',
  company: 'CostVision engineering estimate: site, IT, management, training and non-project time. With the employment ' +
    'layer the UK engineer costs ≈ 1.8 × salary (NN/g: fully loaded "at least 2 ×") and ≈ £66 / h, below the UK ' +
    'embedded-software contract median of £600 / day ≈ £75 / h (IT Jobs Watch, Jan 2026), which carries a contractor\'s margin.',
  capital: 'Zero by default: development tools, licences and HIL benches are priced as their own line (tools per seat).',
} as const;
export function burdenMultiplier(b: SWBurden): number {
  return (1 + b.employmentPct / 100) * (1 + b.companyPct / 100) * (1 + b.capitalPct / 100);
}
/** The overhead the engine prices engineering at: the burden layers' product, or a saved configuration's own figure. */
export function swOverhead(prog: Pick<SWProgramInputs, 'burden' | 'overheadMultiplier'>): number {
  return prog.burden ? burdenMultiplier(prog.burden) : prog.overheadMultiplier;
}

/** Map updates per vehicle. Nissan, Subaru and Hyundai include 3 years of map updates with a new car, Honda (2021–24)
 *  3 years; some give 5 or lifetime (Citroën) — search results of OEM pages, Oct 2026. */
export const SW_DEFAULT_SUBSCRIPTION_YEARS = 3;
export const SW_SUBSCRIPTION_BASIS = '3 years of map updates per vehicle — Nissan, Subaru, Hyundai, Honda (2021–24) include 3; some brands 5 or lifetime (OEM pages, read from search results).';
/** Connected-service life per vehicle — current OEM terms (re-checked 14 Oct 2026): GM OnStar Basics 8 years on model
 *  year 2025+ (onstar.com, GM release Feb 2024); Tesla Standard Connectivity 8 years for cars ordered after 20 Jul 2022
 *  (tesla.com); Toyota Safety / Service Connect up to 10 years (4G-dependent, 2022); Mercedes-Benz mbrace Connect 5 years
 *  (US). The median, 8, replaces the 10 read from 2015–16 Berg Insight terms. A cellular network shutdown can end
 *  service earlier (AT&T 3G off 22 Feb 2022 — EU 2G/3G phase-out 2025–2030 per Del. Reg. 2024/1180). */
export const SW_DEFAULT_SERVICE_YEARS = 8;
export const SW_SERVICE_BASIS = 'Each connected vehicle served 8 years from build — the median of current OEM terms: GM OnStar Basics 8 yr (MY2025+), Tesla Standard Connectivity 8 yr (ordered after 20 Jul 2022), Toyota up to 10 yr, Mercedes-Benz mbrace Connect 5 yr (US); OEM pages, re-checked 14 Oct 2026. A 2G / 3G / 4G shutdown can end it sooner.';
/** Tools per engineer-seat-year. No public price (Vector CANoe: quote only; a full suite + interface "> $15k" is an
 *  anecdote). CostVision estimate = the module catalogue's tool £ at the default programme ÷ its engineer-years. */
export const SW_TOOL_SEAT_GBP = 39_500;
export const SW_TOOL_SEAT_BASIS = 'CostVision estimate £39,500 per engineer-seat-year — the module catalogue\'s tool £ at the default programme ÷ its engineer-years; no public seat price (Vector CANoe is quote-only).';
/** Sustaining-team profile: the module's maintenance % in full for the first years after SOP, then a tail. */
export const SW_MAINT_FULL_YEARS = 3;
export const SW_MAINT_TAIL = 0.5;
export const SW_MAINT_BASIS = 'Module % of development + verification + integration a year: in full for 3 years after SOP, then 50 % — rule of thumb (15–25 % a year, Edana; 21–26 % median years 1–3, 24 DACH SaaS products), not automotive-measured.';
/** Compliance (UNECE R155 / R156, ISO 26262), on by default. */
export const SW_HOMOLOGATION = {
  /** Vehicle-type cybersecurity approval work: S&P Global — R155 on one legacy model "can easily exceed $1M". */
  typeApprovalGBP: Math.round(1_000_000 / USD_PER_GBP),
  assessorASILD:   600_000,   // external ISO 26262 functional-safety assessment, ASIL-D content — CostVision estimate
  assessorOther:   250_000,   // … ASIL-B/C — CostVision estimate
  csmsGBP:         1_500_000, // organisation CSMS certification (R155) — CostVision estimate
  sumsGBP:         800_000,   // organisation SUMS certification (R156) — CostVision estimate
} as const;
export const SW_HOMOLOGATION_BASIS = 'Type approval ≈ $1M (S&P Global: R155 on one legacy model "can easily exceed $1M"); ISO 26262 assessor £600k (ASIL-D) / £250k; organisation CSMS £1.5M + SUMS £0.8M ÷ vehicle types sharing them — CostVision estimates.';

/** Post-production security support (open-items round, 14 Oct 2026). UN R155 defines the post-production phase as
 *  running "until the end-of-life of all vehicles under the vehicle type" and requires the CSMS to cover it (monitoring,
 *  response); UN R156 requires updates to be possible during the vehicles' lifetime. No regulation states a number of
 *  years, and no published study or price gives its cost. Years: Volkswagen / CARIAD (2023, via the press) — software
 *  releases up to 10 years after end of production. Share: CostVision ASSUMPTION — a quarter of the production-years
 *  tail team (security monitoring, vulnerability response, patch releases), graded unsourced. */
export const SW_POST_EOP_YEARS = 10;
export const SW_POST_EOP_SHARE = 0.25;
export const SW_POST_EOP_BASIS = 'After the last build: each module\'s tail sustaining team × 25 % for 10 years — the duty is regulatory (UN R155: the post-production phase runs "until the end-of-life of all vehicles under the vehicle type"; R156: updates over the vehicles\' lifetime); 10 years = Volkswagen / CARIAD\'s stated software support after end of production (2023, via the press); 25 % is a CostVision assumption — no published cost.';

/** Last programme year that carries cost: production + the longest per-vehicle tail, and the post-production support. */
export function swHorizon(prog: Pick<SWProgramInputs, 'programLifeYears' | 'subscriptionYears' | 'connectedServiceYears'> & Pick<Partial<SWProgramInputs>, 'postProductionSupportYears' | 'includeMaintenanceCost'>): number {
  const n = Math.max(prog.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS, prog.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS, 1);
  const post = prog.includeMaintenanceCost === false ? 0 : postYears(prog);
  return Math.max(prog.programLifeYears + n - 1, prog.programLifeYears + post);
}
function postYears(prog: Pick<Partial<SWProgramInputs>, 'postProductionSupportYears'>): number {
  return Math.max(0, Math.round(prog.postProductionSupportYears ?? SW_POST_EOP_YEARS));
}
const dfAt = (r: number, t: number) => (r > 0 ? 1 / Math.pow(1 + r, t) : 1);
const pvOf = (xs: number[], r: number) => xs.reduce((a, v, i) => a + v * dfAt(r, i + 1), 0);
/** Vehicles in service in programme year y (1-based) when each annual cohort is served `years` years from build. */
function cohortsInService(y: number, life: number, years: number): number {
  return Math.max(0, Math.min(y, life) - Math.max(1, y - years + 1) + 1);
}
/** Maintenance weight per programme year: the sustaining profile × wage escalation over production, then the
 *  post-production security support (tail × share) for its years after the last build. */
export function maintenanceWeights(prog: Pick<SWProgramInputs, 'programLifeYears' | 'wageEscalationPct'> & Pick<Partial<SWProgramInputs>, 'postProductionSupportYears' | 'postProductionSupportShare'>): number[] {
  const e = (prog.wageEscalationPct ?? 0) / 100;
  const life = prog.programLifeYears;
  const share = prog.postProductionSupportShare ?? SW_POST_EOP_SHARE;
  return Array.from({ length: life + postYears(prog) }, (_, i) =>
    (i < SW_MAINT_FULL_YEARS ? 1 : SW_MAINT_TAIL) * (i >= life ? share : 1) * Math.pow(1 + e, i));
}
/** Royalties per programme year, nominal £: per vehicle built (each build year) + per vehicle per year for the
 *  subscription years after build. */
export function royaltyYearly(def: SWModuleDef, prog: Pick<SWProgramInputs, 'annualProductionVolume' | 'programLifeYears' | 'subscriptionYears' | 'connectedServiceYears'>): number[] {
  const H = swHorizon(prog), life = prog.programLifeYears, vol = prog.annualProductionVolume;
  const N = prog.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS;
  const built = def.perVehicleRoyaltyGBP ?? 0, perYear = def.perVehiclePerYearGBP ?? 0;
  return Array.from({ length: H }, (_, i) => (i < life ? vol * built : 0) + vol * cohortsInService(i + 1, life, N) * perYear);
}
/** Cloud per programme year, nominal £: £ per connected vehicle-year × the connected vehicles in service, each cohort
 *  served the connected-service years from its build year. */
export function cloudYearly(def: SWModuleDef, prog: Pick<SWProgramInputs, 'annualProductionVolume' | 'programLifeYears' | 'connectedVehicleShare' | 'subscriptionYears' | 'connectedServiceYears'>): number[] {
  const H = swHorizon(prog), life = prog.programLifeYears;
  if (!def.annualCloudCostGBP) return new Array(H).fill(0);
  const perVehicleYear = def.annualCloudCostGBP / SW_CLOUD_REFERENCE_FLEET * (prog.connectedVehicleShare ?? 1);
  const S = prog.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS;
  return Array.from({ length: H }, (_, i) => perVehicleYear * prog.annualProductionVolume * cohortsInService(i + 1, life, S));
}

// ─── Cost Calculation Engine ──────────────────────────────────────────────────

// ─── Model-tuning constants (calibrated against the sw-validation back-test) ──
/** Fraction of the complexity delta also carried by the implementation bucket
 *  (SW2). 0 = old algorithm-only behaviour; Medium (complexity=1) is always neutral. */
const IMPL_COMPLEXITY_WEIGHT = 0.15;
/** Safety/verification effort resists reuse: the reuse factor applied to the
 *  safety bucket cannot fall below this floor by ASIL (SW3) — reused ASIL-C/D
 *  code still needs re-verification/qualification. QM/A unaffected. */
const SAFETY_REUSE_FLOOR: Record<ASILLevel, number> = { QM: 0, A: 0, B: 0.40, C: 0.50, D: 0.60 };
/** ML dataset acquisition/annotation/retraining as a fraction of dev, per ML
 *  module, over the programme (only when includeMLDataCost). */
const ML_DATA_FRACTION = 0.15;
/** Schedule-compression effort penalty slope (Brooks/COCOMO SCED). */
const SCHEDULE_COMPRESSION_K = 1.5;

function computeModuleCost(
  def:    SWModuleDef,
  input:  SWModuleInput,
  prog:   SWProgramInputs,
  rates:  ResolvedRates
): SWModuleCostResult {
  // The hub's own engineer rate (senior share already blended), × development source × programme overhead. The old
  // 1.20 / 0.75 seniority fudge on a "senior-blended" UK base blended seniority twice (F19); it is gone.
  const regionRate  = rates.engineerRate * rates.devSource[prog.devSource] * swOverhead(prog);

  const asilDev    = rates.asilDev[input.asil];
  const complexity = rates.complexity[input.complexity];
  const reuse      = rates.reuse[input.reuse];
  // Per-module test intensity. The ASIL uplift is already in devTotal (asilDev), which testing is a fraction of, so the
  // test multiplier is relative to QM and neutral by default — it compounded the uplift (P1 #20).
  const testFrac   = def.testingFractionBase * (rates.asilTest[input.asil] / (rates.asilTest.QM || 1));

  // SW3: safety bucket resists reuse — floor the reuse it sees, then scale the
  // 0.15 safety slice up relative to the dev reuse (neutral when reuse ≥ floor,
  // e.g. Medium reuse 0.60 at ASIL-D floor 0.60 → scale 1.0).
  const safetyReuse   = Math.max(reuse, SAFETY_REUSE_FLOOR[input.asil]);
  const safetyScale   = reuse > 0 ? safetyReuse / reuse : 1;

  // SW-schedule: compressing the timeline below nominal inflates effort.
  const sched         = prog.scheduleCompression && prog.scheduleCompression > 0 ? prog.scheduleCompression : 1;
  const schedPenalty  = sched >= 1 ? 1 : 1 + (1 - sched) * SCHEDULE_COMPRESSION_K;

  const effortCal   = input.customPersonMonths != null ? 1 : (prog.effortCalibration ?? 1);
  // Nominal effort: the user's own PM, else the COCOMO II size equation when a size is given, else the catalogue.
  const nominalPM   = input.sizeKSLOC ? cocomoNominalPM(input.sizeKSLOC) : def.basePersonMonths;
  const effectivePM = (input.customPersonMonths ?? nominalPM * effortCal) * reuse;

  // Development sub-buckets. Complexity on the algorithm bucket in full, and a
  // weighted share on implementation (SW2). Safety bucket carries the reuse floor.
  const devPM    = effectivePM * asilDev;
  const implComplexity = 1 + (complexity - 1) * IMPL_COMPLEXITY_WEIGHT;
  const reqsPM   = devPM * SW_DEV_SPLIT.requirements;
  const archPM   = devPM * SW_DEV_SPLIT.architecture;
  const algoPM   = devPM * SW_DEV_SPLIT.algorithmDev * complexity;
  const implPM   = devPM * SW_DEV_SPLIT.implementation * implComplexity;
  const safetyPM = devPM * SW_DEV_SPLIT.safetyCompliance * safetyScale;

  const effortRate = regionRate * schedPenalty;
  const reqs   = reqsPM   * effortRate;
  const arch   = archPM   * effortRate;
  const algo   = algoPM   * effortRate;
  const impl   = implPM   * effortRate;
  const safety = safetyPM * effortRate;
  const devTotal = reqs + arch + algo + impl + safety;

  // Testing breakdown — HIL absorbs residual to ensure fractions sum exactly.
  const testTotal  = devTotal * testFrac;
  let   silFrac    = 0.30;
  let   milFrac    = def.hasMLContent ? 0.18 : 0.08;
  let   regFrac    = 0.10;
  let   penFrac    = calFor(def, input) !== 'none' ? 0.08 : 0;
  let   scenFrac   = def.category === 'B' ? 0.09 : 0;
  const fixedSum   = silFrac + milFrac + regFrac + penFrac + scenFrac;
  // If the fixed sub-buckets ever exceed the whole, normalise them down so the
  // breakdown still sums to testTotal (HIL = 0) instead of silently overshooting.
  if (fixedSum > 1) {
    silFrac /= fixedSum; milFrac /= fixedSum; regFrac /= fixedSum;
    penFrac /= fixedSum; scenFrac /= fixedSum;
  }
  const hilFrac = Math.max(0, 1 - silFrac - milFrac - regFrac - penFrac - scenFrac);

  const silCost  = testTotal * silFrac;
  const milCost  = testTotal * milFrac;
  const regCost  = testTotal * regFrac;
  const penCost  = testTotal * penFrac;
  const scenCost = testTotal * scenFrac;
  const hilCost  = testTotal * hilFrac;

  const integration = devTotal * def.integrationFractionBase;

  // Cybersecurity engineering follows the ISO/SAE 21434 CAL, not the safety level (P2 #12): a QM infotainment OS with a
  // network attack vector used to get the lowest uplift. The tiers are the old ASIL ones re-keyed.
  const cal = calFor(def, input);
  const cybersecPct = CYBER_UPLIFT_BY_CAL[cal];
  const cybersec    = devTotal * cybersecPct;

  // Physical/model calibration effort (dyno runs, proving ground, model fitting)
  const calibration = devTotal * def.calibrationFractionBase;

  // ML dataset acquisition / annotation / continuous retraining (opt-in).
  const mlDataCost = (prog.includeMLDataCost && def.hasMLContent)
    ? devTotal * ML_DATA_FRACTION : 0;

  // Multi-year cost pools. NPV factor Σ 1/(1+r)^t discounts spread costs; r=0
  // reproduces the flat "annual × years" baseline exactly.
  const years    = prog.programLifeYears;
  const r        = (prog.discountRatePct ?? 0) / 100;
  let   pvFactor = years;
  if (r > 0) { pvFactor = 0; for (let t = 1; t <= years; t++) pvFactor += 1 / Math.pow(1 + r, t); }

  // Development tools follow the TEAM: engineer-years × £ per seat-year, paid over the development window (gaps round:
  // they were a per-module annual sum, so India paid 4.4 × its engineers in tools).
  const devYears  = (prog.developmentMonths ?? SW_DEFAULT_DEVELOPMENT_MONTHS) / 12;
  const devFactor = r > 0 ? (1 - Math.pow(1 + r, -devYears)) / r : devYears;
  const engineerYears = (devTotal + testTotal + integration + cybersec + calibration + mlDataCost) / regionRate / 12;
  const toolchain   = engineerYears * (prog.toolSeatGBPPerYear ?? SW_TOOL_SEAT_GBP) * (devFactor / devYears);
  const H           = swHorizon(prog);
  const licYearly   = Array.from({ length: H }, (_, i) => (i < years ? def.annualIPLicenceGBP : 0));
  const licensing   = pvOf(licYearly, r);
  // Cloud is charged per connected vehicle in service and added after the platform share (cloudYearly).
  const cloudCost   = 0;
  // Sustaining: the module % of development + verification + integration (every release is re-tested), in full for
  // the first years after SOP then a tail, escalated at the stated wage index.
  const maintBase   = (devTotal + testTotal + integration) * (def.maintenancePctPerYear / 100);
  const maintYearly = Array.from({ length: H }, () => 0);
  if (prog.includeMaintenanceCost) maintenanceWeights(prog).forEach((w, i) => { maintYearly[i] = maintBase * w; });
  const maintenance = pvOf(maintYearly, r);
  void pvFactor;

  const totalNRE      = devTotal + testTotal + integration + toolchain + cybersec + calibration + mlDataCost;
  const totalLifecycle = maintenance + cloudCost + licensing;
  const grandTotal     = totalNRE + totalLifecycle;

  // Per-vehicle: NRE recovered over the (short) recovery window, ongoing lifecycle
  // spread over full life. Default recoveryYears = life reproduces the old figure.
  const recoveryYears = Math.max(1, prog.costRecoveryYears ?? years);
  const nreVehicles   = prog.annualProductionVolume * recoveryYears;
  const lifeVehicles  = prog.annualProductionVolume * years;
  const perVehicle    = (nreVehicles > 0 ? totalNRE / nreVehicles : 0)
                      + (lifeVehicles > 0 ? totalLifecycle / lifeVehicles : 0);

  const res: SWModuleCostResult = {
    moduleId:       def.id,
    moduleName:     def.name,
    category:       def.category,
    categoryLabel:  def.categoryLabel,
    asilUsed:       input.asil,
    complexityUsed: input.complexity,
    calUsed:        calFor(def, input),
    effortBasis:    input.customPersonMonths != null ? 'custom' : input.sizeKSLOC ? 'size' : 'catalogue',
    reuseUsed:      input.reuse,
    personMonths:   Math.round((reqsPM + archPM + algoPM + implPM + safetyPM) * schedPenalty * 10) / 10,
    effortPersonMonths: Math.round((devTotal + testTotal + integration + cybersec + calibration + mlDataCost) / regionRate * 10) / 10,
    development:    { requirements: reqs, architecture: arch, algorithmDev: algo, implementation: impl, safetyCompliance: safety, total: devTotal },
    testing:        { sil: silCost, mil: milCost, hil: hilCost, regression: regCost, penTest: penCost, scenarios: scenCost, total: testTotal },
    integrationCost:  integration,
    licensingCost:    licensing,
    cloudCost,
    cybersecCost:     cybersec,
    maintenanceCost:  maintenance,
    toolchainCost:    toolchain,
    calibrationCost:  calibration,
    mlDataCost,
    totalNonRecurring: totalNRE,
    totalLifecycle,
    grandTotal,
    perVehicle,
    attributedShare: 1,
    yearly: { maintenance: maintYearly, licences: licYearly, royalties: new Array(H).fill(0), cloud: new Array(H).fill(0) },
    chain: {
      nominalPM: input.customPersonMonths ?? nominalPM, effortCal, reuseFactor: reuse, effectivePM, asilDev, devPM,
      complexity, implComplexity, safetyScale,
      bucketPM: { requirements: reqsPM, architecture: archPM, algorithmDev: algoPM, implementation: implPM, safetyCompliance: safetyPM },
      engineerRate: rates.engineerRate, devSourceMult: rates.devSource[prog.devSource], overhead: swOverhead(prog), loadedRate: regionRate,
      schedPenalty, effortRate, testFrac,
      testSplit: { sil: silFrac, mil: milFrac, hil: hilFrac, regression: regFrac, penTest: penFrac, scenarios: scenFrac },
      integrationFrac: def.integrationFractionBase, cyberPct: cybersecPct, calibrationFrac: def.calibrationFractionBase,
      mlFrac: (prog.includeMLDataCost && def.hasMLContent) ? ML_DATA_FRACTION : 0,
      engineerYears, toolSeatGBP: prog.toolSeatGBPPerYear ?? SW_TOOL_SEAT_GBP, toolDiscount: devFactor / devYears,
      maintPct: def.maintenancePctPerYear, maintBase, share: 1,
    },
  };
  // Shared software is attributed to this variant in proportion to its share of the platform volume (P1 #5).
  const share = attributedShare(def.id, prog);
  const out = share < 1 ? scaleModuleResult(res, share) : res;
  // Per-unit royalties (P2 #11) and cloud per connected vehicle (P3 #17) — on THIS programme's vehicles, after the
  // platform share (each vehicle pays its own).
  const royYearly   = royaltyYearly(def, prog);
  const cloudYear   = prog.includeCloudCost ? cloudYearly(def, prog) : new Array(H).fill(0);
  const royalty = pvOf(royYearly, r);
  const cloud   = pvOf(cloudYear, r);
  if (royalty === 0 && cloud === 0) return out;
  const lifeVeh = prog.annualProductionVolume * prog.programLifeYears;
  return {
    ...out,
    yearly:         { ...out.yearly, royalties: royYearly, cloud: cloudYear },
    licensingCost:  out.licensingCost + royalty,
    cloudCost:      out.cloudCost + cloud,
    totalLifecycle: out.totalLifecycle + royalty + cloud,
    grandTotal:     out.grandTotal + royalty + cloud,
    perVehicle:     out.perVehicle + (lifeVeh > 0 ? (royalty + cloud) / lifeVeh : 0),
  };
}

/** A copy of the inputs a result was costed on. `result.inputs` was the caller's live object, so editing the form
 *  after Calculate changed a costed result's recorded inputs — a redraw (currency change, P3 #15) then re-costed the
 *  dev-source table from half-typed inputs and threw. The rate book is shared (read-only). */
function snapshotInputs(prog: SWProgramInputs): SWProgramInputs {
  return { ...prog, modules: prog.modules.map(m => ({ ...m })) };
}

/** Default development duration, feasibility → SOP: Volkswagen's stated 54-month vehicle development cycle (Kai Grünitz,
 *  IAA 2023 — automobile-propre, Motor1, Autocar; being cut to a 36-month target, ID.2 as pilot). Others: GM "around four
 *  years" (CNBC 2022), Chinese OEMs ~18–24 months (Reuters, Bloomberg 2025–26). It replaces the tool's own unsourced M1–M90
 *  timeline; the phase table scales to it. Undiscounted cost does not depend on it (tools follow engineer-years). */
export const SW_DEFAULT_DEVELOPMENT_MONTHS = 54;
export const SW_DEVELOPMENT_BASIS = '54 months feasibility → SOP: Volkswagen\'s stated development cycle (IAA 2023; target 36 months). GM "around four years" (2022); Chinese OEMs ~18–24 months. Set your programme\'s own.';

/**
 * The fleet the modules' annual cloud figures describe. They were written as flat £ / yr for the default programme
 * (80,000 vehicles / yr × 10 yr — Likely, not documented); over that programme the fleet in service averages
 * 80,000 × (1 + … + 10) / 10 = 440,000 vehicles. Re-expressing each figure per connected vehicle-year at that fleet
 * reproduces the default programme exactly and scales any other one by its own fleet (P3 #17).
 */
export const SW_CLOUD_REFERENCE_FLEET = 440_000;
/** What is known about the cloud rate (open-items round, 14 Oct 2026). No OEM or analyst publishes a back-end cost per
 *  vehicle; the one priced anchor is AWS IoT FleetWise's list price — US$0.60 per vehicle-month (first 10,000 vehicles),
 *  US$0.45 the next 40,000, messages and storage extra (aws.amazon.com/iot-fleetwise/pricing) — i.e. US$5.4–7.2 per
 *  vehicle-year for the data-collection service alone; it closed to new customers on 30 Apr 2026. The catalogue's
 *  ≈ £10.8 per connected vehicle-year (all modules) stays an unsourced estimate. */
// ─── Module definitions: catalogue + the user's own modules + typed quotes (improvement round, 14 Oct 2026) ───────

const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; };

/** A user-defined module as a full definition: its domain's catalogue medians for the fractions. */
export function customModuleDef(c: SWCustomModule): SWModuleDef {
  const peers = SW_MODULES.filter(m => m.category === c.category);
  const med = (k: 'testingFractionBase' | 'integrationFractionBase' | 'maintenancePctPerYear' | 'calibrationFractionBase') => median(peers.map(m => m[k]));
  return {
    id: c.id, name: c.name, shortName: c.name, category: c.category, categoryLabel: peers[0]?.categoryLabel ?? c.category,
    description: `Your module — ${c.source}`, defaultAsil: c.defaultAsil, defaultComplexity: c.defaultComplexity,
    basePersonMonths: c.nominalPersonMonths, hasMLContent: false, hasCloudDependency: false,
    hasCybersecRequirement: (c.defaultCal ?? 'none') !== 'none', defaultCal: c.defaultCal ?? 'none',
    testingFractionBase: med('testingFractionBase'), integrationFractionBase: med('integrationFractionBase'),
    maintenancePctPerYear: med('maintenancePctPerYear'), calibrationFractionBase: med('calibrationFractionBase'),
    annualToolLicenceGBP: 0, annualIPLicenceGBP: c.annualIPLicenceGBP ?? 0, annualCloudCostGBP: 0,
    perVehicleRoyaltyGBP: c.perVehicleRoyaltyGBP, royaltyBasis: c.perVehicleRoyaltyGBP ? `Your figure — ${c.source}` : undefined,
    notes: `Your module: effort ${c.nominalPersonMonths} nominal person-months — ${c.source}. Test, integration, maintenance and calibration fractions = the median of the ${peers.length} catalogue modules in its domain.`,
    custom: true,
  };
}

/**
 * Every module definition the programme can cost, by id: the catalogue, the user's modules, and the typed quotes laid
 * over them. ONE resolver — the engine, evidence, unit economics and the reports read modules only through it.
 */
export function swModuleDefs(prog: Pick<SWProgramInputs, 'modules' | 'quotes' | 'customModules'>): Map<string, SWModuleDef> {
  const map = new Map<string, SWModuleDef>(SW_MODULES.map(m => [m.id, m]));
  for (const c of prog.customModules ?? []) map.set(c.id, customModuleDef(c));
  const q = prog.quotes;
  if (!q) return map;
  for (const [id, mq] of Object.entries(q.modules ?? {})) {
    const d = map.get(id);
    if (!d || !mq) continue;
    const quoted = { ...(d.quoted ?? {}) };
    const nd: SWModuleDef = { ...d };
    const parts: string[] = [];
    if (mq.perVehicleBuilt) { nd.perVehicleRoyaltyGBP = mq.perVehicleBuilt.value; quoted.royalty = mq.perVehicleBuilt.source; parts.push(`£${mq.perVehicleBuilt.value} per vehicle built — ${mq.perVehicleBuilt.source}`); }
    if (mq.perVehicleYear) { nd.perVehiclePerYearGBP = mq.perVehicleYear.value; quoted.subscription = mq.perVehicleYear.source; parts.push(`£${mq.perVehicleYear.value} per vehicle-year — ${mq.perVehicleYear.source}`); }
    if (mq.annualIP) { nd.annualIPLicenceGBP = mq.annualIP.value; quoted.ip = mq.annualIP.source; }
    if (parts.length) nd.royaltyBasis = `Your quote: ${parts.join('; ')}`;
    nd.quoted = quoted;
    map.set(id, nd);
  }
  // Cloud: the quote replaces the catalogue's whole back-end rate, spread over the in-scope modules by their catalogue share.
  if (q.cloudPerVehicleYear) {
    const on = prog.modules.filter(m => m.enabled).map(m => map.get(m.moduleId)).filter((d): d is SWModuleDef => !!d);
    const catTotal = on.reduce((a, d) => a + d.annualCloudCostGBP, 0);
    const target = q.cloudPerVehicleYear.value * SW_CLOUD_REFERENCE_FLEET;
    const carriers = catTotal > 0 ? on.filter(d => d.annualCloudCostGBP > 0) : on.slice(0, 1);
    for (const d of carriers) {
      const share = catTotal > 0 ? d.annualCloudCostGBP / catTotal : 1;
      map.set(d.id, { ...map.get(d.id)!, annualCloudCostGBP: target * share, quoted: { ...(map.get(d.id)!.quoted ?? {}), cloud: q.cloudPerVehicleYear.source } });
    }
  }
  return map;
}

/** £ per connected vehicle-year the in-scope modules charge (the catalogue's module £ / yr ÷ the reference fleet). */
export function swCloudPerVehicleYear(prog: Pick<SWProgramInputs, 'modules' | 'quotes' | 'customModules'>): number {
  const defs = swModuleDefs(prog);
  return prog.modules.filter(m => m.enabled).reduce((a, m) => a + (defs.get(m.moduleId)?.annualCloudCostGBP ?? 0), 0) / SW_CLOUD_REFERENCE_FLEET;
}
/** Plain-English development-source names (reports print these, never the enum). */
export const SW_DEV_SOURCE_LABEL: Record<DevSource, string> = { OEM_Internal: 'OEM in-house', Tier1_Supplier: 'Tier-1 supplier', Startup_OSS: 'Software start-up / open source' };
export const SW_CLOUD_BASIS = 'Module cloud £ / yr ÷ reference fleet — an unsourced estimate (≈ £10.8 per connected vehicle-year with every module in scope). No OEM publishes a back-end cost; the only list price, AWS IoT FleetWise (US$0.60 / 0.45 per vehicle-month, messages and storage extra; closed to new customers 30 Apr 2026), is US$5.4–7.2 per vehicle-year for data collection alone.';

/** Cloud cost over the programme, £ (PV when discounted): the sum of `cloudYearly`. */
export function unitCloudGBP(def: SWModuleDef, prog: Pick<SWProgramInputs, 'annualProductionVolume' | 'programLifeYears' | 'discountRatePct' | 'connectedVehicleShare' | 'subscriptionYears' | 'connectedServiceYears'>): number {
  return pvOf(cloudYearly(def, prog), (prog.discountRatePct ?? 0) / 100);
}

/**
 * What the figures were priced on — every input a reader needs to reproduce the report (software review P2 #14: the
 * Excel / PDF exports printed region and volume but not the base rate, the rate book or the overhead). Label / value
 * pairs, shared by both exports.
 */
export function swRateBasis(prog: SWProgramInputs): Array<[string, string]> {
  prog = { ...prog, region: normaliseSWRegion(prog.region) as SWRegion };
  const lib = resolveRateLibrary(prog.rateLibrary);
  const r = resolveRates(prog);
  const hub = lib.hubRates[prog.region];
  const book = SW_HUB_RATES[prog.region];
  const loaded = r.engineerRate * r.devSource[prog.devSource] * swOverhead(prog);
  const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
  return [
    ['Rate book', `${prog.rateLibrary ? 'Company rates' : 'CostVision built-in'} v${lib.version} (reviewed ${lib.lastReviewed})`],
    ['Engineering hub', `${book?.label ?? prog.region} — its own salaries, statutory employer on-costs and working hours (no UK multiplier)`],
    ['Hub rate (£ / person-month of 152 h, before overhead)', `mid ${gbp(hub.mid.value)} · senior ${gbp(hub.senior.value)} — ${prog.rateLibrary && hub.mid !== DEFAULT_SW_RATE_LIBRARY.hubRates[prog.region]?.mid ? `company book (${hub.mid.source})` : (book?.build ?? hub.mid.source)}`],
    ['Engineer rate used', `${gbp(r.engineerRate)} — ${r.typed ? 'typed rate (replaces the hub book rate)' : `${Math.round(prog.teamSeniorFraction * 100)} % senior blend of the hub's mid and senior rates`}`],
    ['Development source', prog.devSource === 'OEM_Internal' ? 'OEM in-house × 1.000'
      : `${SW_DEV_SOURCE_LABEL[prog.devSource]} × ${r.devSource[prog.devSource].toFixed(3)} = efficiency ${rateValues(resolveRateLibrary(prog.rateLibrary).devSourceMultipliers)[prog.devSource].toFixed(2)} (unsourced) ÷ (1 − supplier margin ${((resolveRateLibrary(prog.rateLibrary).supplierMargin?.value ?? 0) * 100).toFixed(1)} %)`],
    ['Engineering burden', prog.burden
      ? `× ${swOverhead(prog).toFixed(3)} = employment +${prog.burden.employmentPct} % × company +${prog.burden.companyPct} % × capital +${prog.burden.capitalPct} % (on the hub rate)`
      : `× ${prog.overheadMultiplier} (a single overhead saved with this configuration)`],
    ['Loaded rate (£ / person-month)', gbp(loaded)],
    ['Rate confidence', book ? `${book.confidence} — figures read from search results of the cited pages (Oct 2026); see the rate book` : 'company book'],
    ['Powertrain', prog.powertrain ?? 'not set (modules as selected)'],
    ['Platform annual volume', prog.platformAnnualVolume && prog.platformAnnualVolume > prog.annualProductionVolume
      ? `${prog.platformAnnualVolume.toLocaleString('en-GB')} (shared software apportioned by volume share)` : 'not shared (this programme carries all of it)'],
    ['Annual volume × life', `${prog.annualProductionVolume.toLocaleString('en-GB')} × ${prog.programLifeYears} yr`],
    ['NRE recovery', `${prog.costRecoveryYears ?? prog.programLifeYears} yr`],
    ['Discount rate', `${prog.discountRatePct ?? 0} %`],
    ['Development duration (tool licences)', `${prog.developmentMonths ?? SW_DEFAULT_DEVELOPMENT_MONTHS} months`],
    ['Cloud', `£${swCloudPerVehicleYear(prog).toFixed(2)} per connected vehicle-year (the in-scope modules' catalogue £ / yr ÷ ${SW_CLOUD_REFERENCE_FLEET.toLocaleString('en-GB')} reference fleet — unsourced estimate) × ${Math.round((prog.connectedVehicleShare ?? 1) * 100)} % connected, each vehicle served ${prog.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS} yr; fixed platform £${Math.round(prog.cloudFixedPerYearGBP ?? 0).toLocaleString('en-GB')} / yr`],
    ['Map / per-vehicle-year royalties', `${prog.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS} yr per vehicle`],
    ['Development tools', `£${Math.round(prog.toolSeatGBPPerYear ?? SW_TOOL_SEAT_GBP).toLocaleString('en-GB')} per engineer-seat-year`],
    ['Maintenance profile', `full ${SW_MAINT_FULL_YEARS} yr after SOP, then ${SW_MAINT_TAIL * 100} %; wage escalation ${prog.wageEscalationPct ?? 0} % / yr`],
    ['Security support after the last build', `${postYears(prog)} yr at ${Math.round((prog.postProductionSupportShare ?? SW_POST_EOP_SHARE) * 100)} % of the tail team — ${SW_POST_EOP_BASIS}`],
    ['Homologation', (prog.includeHomologation ?? true) ? `on — organisation CSMS / SUMS shared by ${prog.csmsTypesSharing ?? 1} vehicle type(s)` : 'off'],
    ['Nominal effort basis', (() => {
      const on = prog.modules.filter(m => m.enabled);
      const sized = on.filter(m => m.customPersonMonths == null && m.sizeKSLOC).length;
      const custom = on.filter(m => m.customPersonMonths != null).length;
      return `${on.length - sized - custom} catalogue · ${sized} COCOMO II size (${SW_COCOMO.A} × KSLOC^${SW_COCOMO_EXPONENT.toFixed(4)}) · ${custom} custom PM`;
    })()],
    ['Effort calibration', prog.effortCalibration && prog.effortCalibration !== 1
      ? `× ${prog.effortCalibration} (fitted to your logged actuals)` : 'none (model as published)'],
  ];
}

/** The programme re-costed with each development source, in the programme's own rate book (P2 #13). The screen used
 *  to re-price with its own copy of the multipliers (0.88 / 0.72), so a company book's multipliers never reached the
 *  table, and it scaled the labour share linearly instead of re-costing. */
export interface SWDevSourceRow { devSource: DevSource; multiplier: number; grandTotal: number; perVehicle: number }
export function devSourceComparison(prog: SWProgramInputs): SWDevSourceRow[] {
  const mult = resolveRates(prog).devSource;
  return (Object.keys(mult) as DevSource[]).map(devSource => {
    const s = computeSWProgram({ ...prog, devSource }, { summaryOnly: true }).summary;
    return { devSource, multiplier: mult[devSource], grandTotal: s.grandTotal, perVehicle: s.perVehicle };
  });
}

/**
 * COCOMO II.2000 Post-Architecture effort equation at NOMINAL ratings: PM = A × KSLOC^E, E = B + 0.01 × ΣSF.
 * A = 2.94, B = 0.91; the five scale factors at Nominal (PREC 3.72, FLEX 3.04, RESL 4.24, TEAM 3.29, PMAT 4.68) sum to
 * 18.97, so E = 1.0997. Source: Boehm et al., COCOMO II Model Definition Manual, v2000.0 (USC Center for Software
 * Engineering) — calibrated on 161 projects, mostly not automotive. All effort multipliers are taken as Nominal here:
 * CostVision's ASIL, complexity and reuse factors play their part on top. A COCOMO person-month is 152 hours and covers
 * elaboration + construction; read it as this tool's nominal development PM — Likely overlaps part of what the tool
 * adds as integration test, which is one reason to calibrate to your own projects (sw-calibration.ts).
 */
export const SW_COCOMO = {
  A: 2.94, B: 0.91, scaleFactorSumNominal: 18.97,
  source: 'Boehm et al., COCOMO II Model Definition Manual v2000.0, USC CSE — Post-Architecture, nominal scale factors',
} as const;
export const SW_COCOMO_EXPONENT = SW_COCOMO.B + 0.01 * SW_COCOMO.scaleFactorSumNominal;

/** Nominal development person-months for a module of `ksloc` thousand source lines (COCOMO II.2000, nominal). */
export function cocomoNominalPM(ksloc: number): number {
  return SW_COCOMO.A * Math.pow(ksloc, SW_COCOMO_EXPONENT);
}

/** Accepted engineer rate, £ / person-month — the engine's validation, the hub book and the company workbook share it.
 *  The floor catches a £k slip ("28" for £28,000); it is £100, not £1,000, because a sourced hub is below £1,000
 *  (India ≈ £525 / PM in the Oct 2026 book). */
export const SW_BASE_RATE_RANGE = [100, 500_000] as const;

/** Cybersecurity engineering (TARA, cyber concept, verification) as a share of development, by ISO/SAE 21434 CAL.
 *  CostVision engineering estimate: the review found no published effort ratio per CAL (software review §5), so these
 *  are the previous ASIL-keyed tiers (8 / 10 / 14 %) re-keyed — CAL1 and CAL2 share the lowest. */
export const CYBER_UPLIFT_BY_CAL: Record<SWCal, number> = { none: 0, CAL1: 0.08, CAL2: 0.08, CAL3: 0.10, CAL4: 0.14 };
export const SW_CALS: SWCal[] = ['none', 'CAL1', 'CAL2', 'CAL3', 'CAL4'];

/** The CAL a module is costed at: the input's, else the module's default. */
export function calFor(def: SWModuleDef, input: Pick<SWModuleInput, 'cal'>): SWCal {
  return input.cal ?? def.defaultCal ?? (def.hasCybersecRequirement ? 'CAL2' : 'none');
}

/** Per-unit royalties over the programme, £ (PV when discounted): the sum of `royaltyYearly`. */
export function unitRoyaltyGBP(def: SWModuleDef, prog: Pick<SWProgramInputs, 'annualProductionVolume' | 'programLifeYears' | 'discountRatePct' | 'subscriptionYears' | 'connectedServiceYears'>): number {
  return pvOf(royaltyYearly(def, prog), (prog.discountRatePct ?? 0) / 100);
}

/** The module's cost and effort scaled to the share attributed to this programme. */
function scaleModuleResult(r: SWModuleCostResult, k: number): SWModuleCostResult {
  const scale = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, typeof v === 'number' ? v * k : v])) as T;
  return {
    ...r,
    personMonths: Math.round(r.personMonths * k * 10) / 10,
    effortPersonMonths: Math.round(r.effortPersonMonths * k * 10) / 10,
    development: scale(r.development), testing: scale(r.testing),
    integrationCost: r.integrationCost * k, licensingCost: r.licensingCost * k, cloudCost: r.cloudCost * k,
    cybersecCost: r.cybersecCost * k, maintenanceCost: r.maintenanceCost * k, toolchainCost: r.toolchainCost * k,
    calibrationCost: r.calibrationCost * k, mlDataCost: r.mlDataCost * k,
    totalNonRecurring: r.totalNonRecurring * k, totalLifecycle: r.totalLifecycle * k,
    grandTotal: r.grandTotal * k, perVehicle: r.perVehicle * k,
    attributedShare: k,
    chain: { ...r.chain, share: k },
    yearly: { ...r.yearly, maintenance: r.yearly.maintenance.map(v => v * k), licences: r.yearly.licences.map(v => v * k) },
  };
}

// ─── Evidence grades (gaps round, Oct 2026) ───────────────────────────────────────────────────────────────────────

/** How well a costed line is supported. `entered` = the user's own figure; `calibrated` = scaled to the user's logged
 *  actuals; `sourced` = a published figure; `estimate` = a labelled engineering estimate or a sourced model on entered
 *  sizes; `unsourced` = a catalogue figure with no source. */
export type SWEvidenceGrade = 'entered' | 'calibrated' | 'sourced' | 'estimate' | 'unsourced';
export interface SWEvidenceLine { kind: string; label: string; amount: number; grade: SWEvidenceGrade; nre: boolean; basis: string }

/** Monte Carlo range [low, mode, high] by grade. Wider where the evidence is thinner and skewed upwards (overruns are
 *  larger than savings), but bounded so the headline — the sum of each line's most likely value — stays inside its own
 *  band (independent re-score, Oct 2026: × 0.5–3 on unsourced lines put the £302 headline below its own P10). CostVision
 *  engineering estimates of how far each grade can be out — not measured. */
export const SW_MC_RANGE_BY_GRADE: Record<SWEvidenceGrade, readonly [number, number, number]> = {
  entered:    [0.90, 1.00, 1.15],
  calibrated: [0.85, 1.00, 1.25],
  sourced:    [0.85, 1.00, 1.20],
  estimate:   [0.70, 1.00, 1.60],
  unsourced:  [0.60, 1.00, 1.90],
};

/** Every costed £ of a programme, line by line, with its evidence grade and basis. Sums to the grand total. */
export function swEvidenceLines(prog: SWProgramInputs, modules: SWModuleCostResult[], summary: Pick<SWSummary, 'totalHomologation' | 'cloudFixedYearly'>): SWEvidenceLine[] {
  const out: SWEvidenceLine[] = [];
  const r = (prog.discountRatePct ?? 0) / 100;
  const calibrated = prog.effortCalibration !== undefined && prog.effortCalibration !== 1;
  const defs = swModuleDefs(prog);
  for (const m of modules) {
    const def = defs.get(m.moduleId)!;
    const effort = m.development.total + m.testing.total + m.integrationCost + m.cybersecCost + m.calibrationCost + m.mlDataCost;
    // A user-defined module's catalogue effort IS the user's figure.
    const eGrade: SWEvidenceGrade = m.effortBasis === 'custom' || (def.custom && m.effortBasis === 'catalogue') ? 'entered' : m.effortBasis === 'size' ? 'estimate' : calibrated ? 'calibrated' : 'unsourced';
    out.push({ kind: 'effort', label: `${m.moduleName} — engineering`, amount: effort, grade: eGrade, nre: true,
      basis: m.effortBasis === 'custom' ? 'your person-months' : m.effortBasis === 'size' ? 'COCOMO II on your KSLOC' : def.custom ? def.notes : calibrated ? 'catalogue × your calibration' : 'module catalogue person-months (unsourced)' });
    out.push({ kind: 'tools', label: `${m.moduleName} — tools`, amount: m.toolchainCost, grade: prog.toolSeatGBPPerYear !== undefined ? 'entered' : 'estimate', nre: true, basis: SW_TOOL_SEAT_BASIS });
    // Production-years sustaining (a rule of thumb, estimate) and the post-production security support after the last
    // build (an unsourced share — the duty is regulatory, its cost is not published).
    const life = prog.programLifeYears;
    const post = m.yearly.maintenance.reduce((a, v, i) => (i >= life ? a + v * dfAt(r, i + 1) : a), 0);
    out.push({ kind: 'maintenance', label: `${m.moduleName} — maintenance`, amount: m.maintenanceCost - post, grade: 'estimate', nre: false, basis: SW_MAINT_BASIS });
    if (post > 1e-6) out.push({ kind: 'postSupport', label: `${m.moduleName} — security support after the last build`, amount: post, grade: prog.postProductionSupportShare !== undefined ? 'entered' : 'unsourced', nre: false, basis: SW_POST_EOP_BASIS });
    const ip = pvOf(m.yearly.licences, r);
    const ipYours = !!def.quoted?.ip || !!def.custom;
    out.push({ kind: 'licences', label: `${m.moduleName} — IP licences`, amount: ip, grade: ipYours ? 'entered' : 'unsourced', nre: false,
      basis: def.quoted?.ip ? `your quote — ${def.quoted.ip}` : def.custom ? 'your figure' : 'module catalogue £ / yr (unsourced)' });
    const roy = m.licensingCost - ip;
    // A royalty is "yours" when every part of it was typed (a quote, or the user's own module).
    const unquotedPart = (!!def.perVehicleRoyaltyGBP && !def.quoted?.royalty && !def.custom) || (!!def.perVehiclePerYearGBP && !def.quoted?.subscription);
    if (Math.abs(roy) > 1e-6) out.push({ kind: 'royalties', label: `${m.moduleName} — royalties`, amount: roy,
      grade: !unquotedPart ? 'entered' : /unsourced/i.test(def.royaltyBasis ?? 'unsourced') ? 'unsourced' : 'sourced', nre: false, basis: def.royaltyBasis ?? '' });
    if (m.cloudCost) out.push({ kind: 'cloud', label: `${m.moduleName} — cloud`, amount: m.cloudCost, grade: def.quoted?.cloud ? 'entered' : 'unsourced', nre: false,
      basis: def.quoted?.cloud ? `Your quote: £${prog.quotes?.cloudPerVehicleYear?.value} per connected vehicle-year — ${def.quoted.cloud} (spread by the catalogue's module shares). ${SW_SERVICE_BASIS}` : `${SW_CLOUD_BASIS} ${SW_SERVICE_BASIS}` });
  }
  if (summary.totalHomologation) out.push({ kind: 'homologation', label: 'Homologation (R155 / R156 / ISO 26262)', amount: summary.totalHomologation, grade: 'estimate', nre: true, basis: SW_HOMOLOGATION_BASIS });
  const fixedCloud = pvOf(summary.cloudFixedYearly, r);
  if (fixedCloud) out.push({ kind: 'cloudFixed', label: 'Cloud platform (fixed)', amount: fixedCloud, grade: 'entered', nre: false, basis: 'your fixed platform £ / yr' });
  return out;
}

// ─── Monte Carlo simulation ───────────────────────────────────────────────────

/**
 * Fraction of each bucket's uncertainty that is systemic (programme-wide) rather
 * than idiosyncratic. Real overruns are correlated — a programme that slips
 * schedule inflates development, testing AND integration together — so a pure
 * independent-sum model understates the tail. We blend a single shared draw
 * across all buckets with per-bucket draws at this weight.
 */
const MC_CORRELATION = 0.55;

/** Fixed seed for the programme Monte Carlo, so a band is reproducible.
 *  Callers who genuinely want a different draw pass their own. */
export const SW_MC_SEED = 20260814;

function runMonteCarlo(
  prog: SWProgramInputs, s: SWSummary, lines: SWEvidenceLine[], iterations = 1000, seed = SW_MC_SEED,
): SWMonteCarlo {
  // SEEDED. This used raw Math.random(), so the P50/P90 band differed on every
  // run for identical inputs — measured at ~£4M of swing on P50 of a £494M
  // programme. A confidence interval a customer cannot reproduce is not a
  // confidence interval. Same generator the physical-parts bands use.
  const rand = mulberry32(seed);
  // Triangular distribution sampler
  function tri(a: number, m: number, b: number): number {
    const u = rand();
    const Fc = (m - a) / (b - a);
    if (u < Fc) return a + Math.sqrt(u * (b - a) * (m - a));
    return b - Math.sqrt((1 - u) * (b - a) * (b - m));
  }

  const rho = MC_CORRELATION;
  const lerp = (lo: number, hi: number, t: number) => lo + (hi - lo) * t;
  // Each line's range follows its EVIDENCE GRADE (gaps round, costing review #13: one narrow range per bucket gave
  // ±10 % on a total that rests on an unsourced effort catalogue). Lines of one kind and grade are drawn together.
  const groups = new Map<string, { val: number; nre: boolean; range: readonly [number, number, number] }>();
  for (const l of lines) {
    const key = `${l.kind}|${l.grade}`;
    const g = groups.get(key) ?? { val: 0, nre: l.nre, range: SW_MC_RANGE_BY_GRADE[l.grade] };
    g.val += l.amount;
    groups.set(key, g);
  }
  const buckets = [...groups.values()].filter(g => g.val !== 0).map(g => [g.val, g.range[0], g.range[1], g.range[2], g.nre] as [number, number, number, number, boolean]);

  // £ / vehicle per trial by the SAME rule as the headline: NRE over the recovery window, lifecycle over the full
  // life. It divided every trial's total by volume × life, so with a 2-year recovery the headline said £2,043 and the
  // band's P50 £639 (P2 #10).
  const recoveryYears = Math.max(1, prog.costRecoveryYears ?? prog.programLifeYears);
  const nreVehicles   = prog.annualProductionVolume * recoveryYears;
  const lifeVehicles  = prog.annualProductionVolume * prog.programLifeYears;

  const totals: number[] = [];
  const perVeh: number[] = [];
  for (let i = 0; i < iterations; i++) {
    // One shared programme-wide percentile draw (0..1) reused across buckets.
    const sharedQ = rand();
    let nre = 0, life = 0;
    for (const [val, lo, mode, hi, isNre] of buckets) {
      // Map the shared quantile onto this bucket's triangular range.
      const Fc = (mode - lo) / (hi - lo);
      const shared = sharedQ < Fc
        ? lo + Math.sqrt(sharedQ * (hi - lo) * (mode - lo))
        : hi - Math.sqrt((1 - sharedQ) * (hi - lo) * (hi - mode));
      const idio = tri(lo, mode, hi);
      const v = val * lerp(idio, shared, rho);
      if (isNre) nre += v; else life += v;
    }
    totals.push(nre + life);
    perVeh.push((nreVehicles > 0 ? nre / nreVehicles : 0) + (lifeVehicles > 0 ? life / lifeVehicles : 0));
  }
  totals.sort((a, b) => a - b);
  perVeh.sort((a, b) => a - b);

  const n = totals.length;
  const q = (arr: number[], p: number) => arr[Math.floor(n * p)];

  return {
    p10:           q(totals, 0.10),
    p50:           q(totals, 0.50),
    p90:           q(totals, 0.90),
    mean:          totals.reduce((a, b) => a + b, 0) / n,
    p10PerVehicle: q(perVeh, 0.10),
    p50PerVehicle: q(perVeh, 0.50),
    p90PerVehicle: q(perVeh, 0.90),
    iterations:    n,
    headlinePercentile: Math.round(100 * countAtOrBelow(totals, s.grandTotal) / n),
    curve:         Array.from({ length: 19 }, (_, i) => q(totals, (i + 1) * 0.05)),
    histogram:     histogramOf(totals, 20),
  };
}

/** Equal-width bins over the sorted trials (min → max). */
function histogramOf(sorted: number[], bins: number): Array<{ lo: number; hi: number; count: number }> {
  if (!sorted.length) return [];
  const lo = sorted[0], hi = sorted[sorted.length - 1];
  const w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, count: 0 }));
  for (const v of sorted) out[Math.min(bins - 1, Math.floor((v - lo) / w))].count++;
  return out;
}

// ─── Programme Phases ─────────────────────────────────────────────────────────

export function buildPhases(nreTotal: number, developmentMonths = SW_DEFAULT_DEVELOPMENT_MONTHS): SWPhase[] {
  // Phase ends as shares of the M1–M90 timeline, scaled to the programme's development duration (P3 #17).
  const ends = [6, 18, 54, 78, 90].map(m => Math.max(1, Math.round(m / 90 * developmentMonths)));
  const span = (i: number) => `M${i === 0 ? 1 : ends[i - 1] + 1}–M${ends[i]}`;
  return [
    { name: 'Feasibility',            months: span(0), fraction: 0.05, nreCost: nreTotal * 0.05 },
    { name: 'Concept / Architecture', months: span(1), fraction: 0.15, nreCost: nreTotal * 0.15 },
    { name: 'Series Development',     months: span(2), fraction: 0.50, nreCost: nreTotal * 0.50 },
    { name: 'Validation & V&V',       months: span(3), fraction: 0.20, nreCost: nreTotal * 0.20 },
    { name: 'Ramp / SOP',             months: span(4), fraction: 0.10, nreCost: nreTotal * 0.10 },
  ];
}

// ─── Main Programme Calculator ────────────────────────────────────────────────

const EMPTY_MC: SWMonteCarlo = {
  p10: 0, p50: 0, p90: 0, mean: 0,
  p10PerVehicle: 0, p50PerVehicle: 0, p90PerVehicle: 0, iterations: 0, headlinePercentile: 0, curve: [], histogram: [],
};

/** Trials ≤ x in an ascending array (binary search). */
function countAtOrBelow(sorted: number[], x: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= x) lo = mid + 1; else hi = mid; }
  return lo;
}

// ─── Input validation (software review P2 #8, Oct 2026) ─────────────────────────────────────────────────────────
// The engine took any number: a negative overhead gave a negative programme, a negative custom effort subtracted cost,
// a blank life gave NaN, an unknown region NaN, an unknown module id a crash, a duplicated module was counted twice.
// The PLAUSIBILITY limits below (life ≤ 40 yr, volume ≤ 20 M / yr, effort ≤ 50,000 PM a module, base rate ≤ £500k / PM)
// are CostVision engineering limits, not sourced figures — they catch a unit slip, not a judgement.

export class SWInputError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Software cost inputs are not valid — ${problems.join('; ')}`);
    this.name = 'SWInputError';
  }
}

export function validateSWInputs(prog: SWProgramInputs): string[] {
  const p: string[] = [];
  const lib = resolveRateLibrary(prog.rateLibrary);
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  // The user's own modules and typed quotes (improvement round): a figure must be a number in range AND say where it came from.
  const known = new Set(SW_MODULES.map(m => m.id));
  const cats: SWCategory[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  for (const c of prog.customModules ?? []) {
    if (!/^custom-[a-z0-9-]{1,60}$/.test(c.id ?? '') || known.has(c.id)) p.push(`your module id "${c.id}" must be "custom-…" (lower-case) and unique`);
    known.add(c.id);
    if (!c.name || !c.name.trim() || c.name.length > 80) p.push(`your module "${c.id}" needs a name (1–80 characters)`);
    if (!cats.includes(c.category)) p.push(`your module "${c.name}" needs a domain A–G`);
    if (!fin(c.nominalPersonMonths) || c.nominalPersonMonths < 0 || c.nominalPersonMonths > 20_000) p.push(`your module "${c.name}": nominal effort must be 0–20,000 person-months`);
    if (!(c.defaultAsil in ASIL_DEV_MULT)) p.push(`your module "${c.name}": ASIL must be QM, A, B, C or D`);
    if (c.perVehicleRoyaltyGBP !== undefined && (!fin(c.perVehicleRoyaltyGBP) || c.perVehicleRoyaltyGBP < 0 || c.perVehicleRoyaltyGBP > 10_000)) p.push(`your module "${c.name}": royalty must be £0–10,000 a vehicle`);
    if (c.annualIPLicenceGBP !== undefined && (!fin(c.annualIPLicenceGBP) || c.annualIPLicenceGBP < 0 || c.annualIPLicenceGBP > 1e9)) p.push(`your module "${c.name}": IP licence must be £0–1bn a year`);
    // A just-added module has no figure yet (it costs nothing); once it carries one, it must say where it comes from.
    const hasFigure = (c.nominalPersonMonths ?? 0) > 0 || (c.perVehicleRoyaltyGBP ?? 0) > 0 || (c.annualIPLicenceGBP ?? 0) > 0;
    if (hasFigure && (!c.source || c.source.trim().length < 2)) p.push(`your module "${c.name}": say where its effort figure comes from`);
  }
  const q = prog.quotes;
  const chk = (lq: SWLineQuote | undefined, what: string, max: number) => {
    if (!lq) return;
    if (!fin(lq.value) || lq.value < 0 || lq.value > max) p.push(`${what} must be £0–${max.toLocaleString('en-GB')}`);
    if (!lq.source || lq.source.trim().length < 2) p.push(`${what}: say where the quote comes from`);
  };
  chk(q?.cloudPerVehicleYear, 'cloud quote (£ per connected vehicle-year)', 1_000);
  for (const [id, mq] of Object.entries(q?.modules ?? {})) {
    if (!known.has(id)) p.push(`a quote names module "${id}", which is not in the catalogue or your modules`);
    chk(mq?.perVehicleBuilt, `${id} royalty quote (£ per vehicle built)`, 10_000);
    chk(mq?.perVehicleYear, `${id} subscription quote (£ per vehicle-year)`, 10_000);
    chk(mq?.annualIP, `${id} IP licence quote (£ a year)`, 1e9);
  }
  if (!(normaliseSWRegion(String(prog.region)) in lib.hubRates)) p.push(`region "${String(prog.region)}" is not one of the rate book's hubs`);
  for (const [k, h] of Object.entries(lib.hubRates)) {
    for (const lvl of ['mid', 'senior'] as const) {
      const v = h?.[lvl]?.value;
      if (!fin(v) || v < SW_BASE_RATE_RANGE[0] || v > SW_BASE_RATE_RANGE[1]) p.push(`rate book: ${k} ${lvl} rate must be £${SW_BASE_RATE_RANGE[0].toLocaleString('en-GB')}–£${SW_BASE_RATE_RANGE[1].toLocaleString('en-GB')} per person-month`);
    }
  }
  for (const [k, v] of Object.entries(lib.devSourceMultipliers)) if (!fin(v.value) || v.value <= 0) p.push(`rate book: development source ${k} multiplier must be above 0`);
  if (!(prog.devSource in lib.devSourceMultipliers)) p.push(`development source "${String(prog.devSource)}" is not known`);
  if (!fin(prog.programLifeYears) || prog.programLifeYears < 1 || prog.programLifeYears > 40) p.push('programme life must be 1–40 years');
  if (!fin(prog.annualProductionVolume) || prog.annualProductionVolume < 1 || prog.annualProductionVolume > 20_000_000) p.push('annual volume must be 1–20,000,000 vehicles');
  if (!fin(prog.teamSeniorFraction) || prog.teamSeniorFraction < 0 || prog.teamSeniorFraction > 1) p.push('senior share must be between 0 and 1');
  if (!fin(prog.overheadMultiplier) || prog.overheadMultiplier < 1 || prog.overheadMultiplier > 5) p.push('overhead multiplier must be 1–5 (1 = no overhead)');
  // £1,000 floor: a UK-base rate below it is a £k slip ("28" for £28,000), which costed a programme at 1/1000 (B8, P3 #18).
  if (prog.baseRateGBP !== undefined && (!fin(prog.baseRateGBP) || prog.baseRateGBP < SW_BASE_RATE_RANGE[0] || prog.baseRateGBP > SW_BASE_RATE_RANGE[1])) p.push(`base rate must be £${SW_BASE_RATE_RANGE[0].toLocaleString('en-GB')}–£${SW_BASE_RATE_RANGE[1].toLocaleString('en-GB')} per person-month (your own engineer rate for this hub, before overhead)`);
  if (prog.discountRatePct !== undefined && (!fin(prog.discountRatePct) || prog.discountRatePct < 0 || prog.discountRatePct > 50)) p.push('discount rate must be 0–50 %');
  if (prog.effortCalibration !== undefined && (!fin(prog.effortCalibration) || prog.effortCalibration < 0.2 || prog.effortCalibration > 5)) p.push('effort calibration must be between 0.2 and 5 (a fitted factor outside that says the logged actuals and the model describe different work)');
  if (prog.developmentMonths !== undefined && (!fin(prog.developmentMonths) || prog.developmentMonths < 6 || prog.developmentMonths > 180)) p.push('development duration must be 6–180 months');
  if (prog.connectedVehicleShare !== undefined && (!fin(prog.connectedVehicleShare) || prog.connectedVehicleShare < 0 || prog.connectedVehicleShare > 1)) p.push('connected-vehicle share must be 0–1');
  if (prog.scheduleCompression !== undefined && (!fin(prog.scheduleCompression) || prog.scheduleCompression <= 0 || prog.scheduleCompression > 1.5)) p.push('schedule compression must be above 0 and at most 1.5');
  if (prog.costRecoveryYears !== undefined && (!fin(prog.costRecoveryYears) || prog.costRecoveryYears < 1 || prog.costRecoveryYears > 40)) p.push('cost-recovery window must be 1–40 years');
  if (prog.burden) for (const [k, v] of Object.entries(prog.burden)) if (!fin(v) || v < 0 || v > 300) p.push(`burden ${k} must be 0–300 %`);
  if (prog.subscriptionYears !== undefined && (!fin(prog.subscriptionYears) || prog.subscriptionYears < 0 || prog.subscriptionYears > 20)) p.push('subscription years must be 0–20');
  if (prog.connectedServiceYears !== undefined && (!fin(prog.connectedServiceYears) || prog.connectedServiceYears < 1 || prog.connectedServiceYears > 25)) p.push('connected-service years must be 1–25');
  if (prog.postProductionSupportYears !== undefined && (!fin(prog.postProductionSupportYears) || prog.postProductionSupportYears < 0 || prog.postProductionSupportYears > 30)) p.push('security support after the last build must be 0–30 years');
  if (prog.postProductionSupportShare !== undefined && (!fin(prog.postProductionSupportShare) || prog.postProductionSupportShare < 0 || prog.postProductionSupportShare > 1)) p.push('security support share must be 0–100 %');
  if (prog.cloudFixedPerYearGBP !== undefined && (!fin(prog.cloudFixedPerYearGBP) || prog.cloudFixedPerYearGBP < 0 || prog.cloudFixedPerYearGBP > 1e9)) p.push('fixed cloud platform must be £0–1bn a year');
  if (prog.toolSeatGBPPerYear !== undefined && (!fin(prog.toolSeatGBPPerYear) || prog.toolSeatGBPPerYear < 0 || prog.toolSeatGBPPerYear > 1_000_000)) p.push('tools must be £0–1M per seat-year');
  if (prog.wageEscalationPct !== undefined && (!fin(prog.wageEscalationPct) || prog.wageEscalationPct < -10 || prog.wageEscalationPct > 30)) p.push('wage escalation must be −10–30 % a year');
  if (prog.csmsTypesSharing !== undefined && (!fin(prog.csmsTypesSharing) || prog.csmsTypesSharing < 1 || prog.csmsTypesSharing > 200)) p.push('vehicle types sharing CSMS / SUMS must be 1–200');
  if (prog.platformAnnualVolume !== undefined && (!fin(prog.platformAnnualVolume) || prog.platformAnnualVolume < 0 || prog.platformAnnualVolume > 20_000_000)) p.push('platform volume must be 0–20,000,000 vehicles');
  const seen = new Set<string>();
  for (const m of prog.modules) {
    if (!known.has(m.moduleId)) { p.push(`unknown module "${m.moduleId}"`); continue; }
    if (seen.has(m.moduleId)) p.push(`module "${m.moduleId}" appears twice`);
    seen.add(m.moduleId);
    if (!m.enabled) continue;
    if (!(m.asil in lib.asilDevMultipliers)) p.push(`${m.moduleId}: ASIL "${String(m.asil)}" is not known`);
    if (!(m.complexity in lib.complexityMultipliers)) p.push(`${m.moduleId}: complexity "${String(m.complexity)}" is not known`);
    if (!(m.reuse in lib.reuseFactors)) p.push(`${m.moduleId}: reuse "${String(m.reuse)}" is not known`);
    if (m.sizeKSLOC !== undefined && m.sizeKSLOC !== null && (!fin(m.sizeKSLOC) || m.sizeKSLOC < 0.1 || m.sizeKSLOC > 10_000)) p.push(`${m.moduleId}: size must be 0.1–10,000 KSLOC`);
    if (m.cal !== undefined && !SW_CALS.includes(m.cal)) p.push(`${m.moduleId}: CAL "${String(m.cal)}" is not known (none, CAL1–CAL4)`);
    if (m.customPersonMonths !== null && m.customPersonMonths !== undefined
        && (!fin(m.customPersonMonths) || m.customPersonMonths < 0 || m.customPersonMonths > 50_000)) {
      p.push(`${m.moduleId}: custom effort must be 0–50,000 person-months`);
    }
  }
  return p;
}

export function computeSWProgram(
  prog: SWProgramInputs,
  opts: { summaryOnly?: boolean } = {},
): SWProgramResult {
  // A saved configuration / company book from before Oct 2026 names a retired hub key ('EU', 'India' …).
  prog = { ...prog, region: normaliseSWRegion(String(prog.region)) as SWRegion };
  const problems = validateSWInputs(prog);
  if (problems.length) throw new SWInputError(problems);
  const rates = resolveRates(prog);
  const enabledModules = prog.modules.filter(m => m.enabled);
  const defs = swModuleDefs(prog);
  const modules: SWModuleCostResult[] = enabledModules.map(m => computeModuleCost(defs.get(m.moduleId)!, m, prog, rates));

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  // Compliance, ON by default (gaps round: it was off, so the default programme carried no R155 / R156 / ISO 26262):
  // this type's approval work + the functional-safety assessor + its share of the organisation's CSMS / SUMS.
  const hasASILD = modules.some(m => m.asilUsed === 'D');
  const H0 = SW_HOMOLOGATION;
  // Nothing in scope → nothing to approve or host.
  const homologation = (prog.includeHomologation ?? true) && modules.length > 0
    ? H0.typeApprovalGBP + (hasASILD ? H0.assessorASILD : H0.assessorOther) + (H0.csmsGBP + H0.sumsGBP) / Math.max(1, prog.csmsTypesSharing ?? 1)
    : 0;
  // Fixed cloud platform while any vehicle is served (entered; 0 when not given).
  const horizonYears = swHorizon(prog);
  const rDisc = (prog.discountRatePct ?? 0) / 100;
  const cloudFixedYearly = Array.from({ length: horizonYears }, () => (prog.includeCloudCost && modules.length > 0 ? (prog.cloudFixedPerYearGBP ?? 0) : 0));
  const cloudFixed = pvOf(cloudFixedYearly, rDisc);

  const summary: SWSummary = {
    totalDevelopment:   sum(modules.map(m => m.development.total)),
    totalTesting:       sum(modules.map(m => m.testing.total)),
    totalIntegration:   sum(modules.map(m => m.integrationCost)),
    totalLicensing:     sum(modules.map(m => m.licensingCost)),
    totalCloud:         sum(modules.map(m => m.cloudCost)) + cloudFixed,
    totalCybersecurity: sum(modules.map(m => m.cybersecCost)),
    totalMaintenance:   sum(modules.map(m => m.maintenanceCost)),
    totalToolchain:     sum(modules.map(m => m.toolchainCost)),
    totalCalibration:   sum(modules.map(m => m.calibrationCost)),
    totalMLData:        sum(modules.map(m => m.mlDataCost)),
    totalHomologation:  homologation,
    nreTotal:           0,
    grandTotal:         sum(modules.map(m => m.grandTotal)) + homologation + cloudFixed,
    totalPersonMonths:  sum(modules.map(m => m.personMonths)),
    totalEffortPersonMonths: sum(modules.map(m => m.effortPersonMonths)),
    perVehicle:         0,
    byCategory:         {} as Record<SWCategory, number>,
    cloudFixedYearly,
    horizonYears,
  };
  summary.nreTotal = summary.totalDevelopment + summary.totalTesting + summary.totalIntegration
                   + summary.totalToolchain + summary.totalCybersecurity + summary.totalCalibration
                   + summary.totalMLData + summary.totalHomologation;
  // Per-vehicle: NRE over the recovery window, lifecycle over full life (mirrors
  // the per-module split). Default costRecoveryYears = life reproduces the old figure.
  const totalLifecycle = summary.totalMaintenance + summary.totalCloud + summary.totalLicensing;
  const recoveryYears  = Math.max(1, prog.costRecoveryYears ?? prog.programLifeYears);
  const nreVehicles    = prog.annualProductionVolume * recoveryYears;
  const lifeVehicles   = prog.annualProductionVolume * prog.programLifeYears;
  summary.perVehicle = (nreVehicles > 0 ? summary.nreTotal / nreVehicles : 0)
                     + (lifeVehicles > 0 ? totalLifecycle / lifeVehicles : 0);

  for (const cat of ['A','B','C','D','E','F','G'] as SWCategory[]) {
    summary.byCategory[cat] = sum(modules.filter(m => m.category === cat).map(m => m.grandTotal));
  }

  // When invoked for a sensitivity recompute we only need the summary totals.
  // Skip the (expensive, and otherwise infinitely-recursive) sensitivity /
  // Monte Carlo / phase / benchmark build-out.
  if (opts.summaryOnly) {
    return { modules, summary, sensitivity: [], benchmarks: [], phases: [], monteCarlo: EMPTY_MC, inputs: snapshotInputs(prog) };
  }

  // Sensitivity analysis
  const sensitivity: SWSensitivityRow[] = [
    {
      parameter: 'ASIL level (all modules: B vs D)',
      low:  _recomputeTotal(prog, { asilOverride: 'B' }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { asilOverride: 'D' }),
      unit: '£M',
    },
    {
      parameter: 'Complexity (all modules: Medium vs Very High)',
      low:  _recomputeTotal(prog, { complexityOverride: 'Medium' }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { complexityOverride: 'Very High' }),
      unit: '£M',
    },
    {
      parameter: 'Reuse level (Heavy vs Fresh)',
      low:  _recomputeTotal(prog, { reuseOverride: 'Heavy' }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { reuseOverride: 'Fresh' }),
      unit: '£M',
    },
    (() => {
      // Cheapest v dearest hub in the programme's own book, at its senior share (it named India v Silicon Valley).
      const lib = resolveRateLibrary(prog.rateLibrary);
      const hubs = (Object.keys(lib.hubRates) as SWRegion[])
        .map(h => ({ h, r: swLibraryBaseRate({ ...prog, region: h }) }))
        .sort((a, b) => a.r - b.r);
      const lo = hubs[0].h, hi = hubs[hubs.length - 1].h;
      return {
        parameter: `Engineering hub (${SW_HUB_RATES[lo]?.label ?? lo} vs ${SW_HUB_RATES[hi]?.label ?? hi})`,
        low:  _recomputeTotal(prog, { regionOverride: lo }),
        base: summary.grandTotal,
        high: _recomputeTotal(prog, { regionOverride: hi }),
        unit: '£M',
      };
    })(),
    // Programme life and volume move AROUND this programme (president review, 14 Oct 2026: they were fixed at 8 / 14 years
    // and 150k / 50k a year, so a 6-year, 200k programme showed a "low" case above its own base).
    (() => {
      const lo = Math.max(1, Math.round(prog.programLifeYears / 1.5)), hi = Math.round(prog.programLifeYears * 1.5);
      return { parameter: `Programme life (${lo} vs ${hi} years)`, low: _recomputeTotal(prog, { lifeOverride: lo }), base: summary.grandTotal,
        high: _recomputeTotal(prog, { lifeOverride: hi }), unit: '£M' };
    })(),
    {
      parameter: 'Effort catalogue (× 0.5 vs × 2)',
      low:  _recomputeTotal(prog, { effortScale: 0.5 }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { effortScale: 2 }),
      unit: '£M',
    },
    {
      parameter: 'Company burden (20 % vs 60 %)',
      low:  _recomputeTotal(prog, { companyBurdenPct: 20 }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { companyBurdenPct: 60 }),
      unit: '£M',
    },
    {
      parameter: 'Connected-service life (5 vs 15 years)',
      low:  _recomputeTotal(prog, { serviceYears: 5 }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { serviceYears: 15 }),
      unit: '£M',
    },
    {
      parameter: 'Security support after the last build (0 vs 15 years)',
      low:  _recomputeTotal(prog, { postYears: 0 }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { postYears: 15 }),
      unit: '£M',
    },
    {
      parameter: 'Map subscription (1 vs 7 years)',
      low:  _recomputeTotal(prog, { subscriptionYears: 1 }),
      base: summary.grandTotal,
      high: _recomputeTotal(prog, { subscriptionYears: 7 }),
      unit: '£M',
    },
    (() => {
      // Re-costed at each volume, so £ / vehicle follows the headline's rule (recovery window, platform share) (P2 #10);
      // at 1.5 × and 0.5 × THIS programme's volume (more vehicles carry the NRE → the lower figure).
      const up = Math.round(prog.annualProductionVolume * 1.5), down = Math.max(1, Math.round(prog.annualProductionVolume * 0.5));
      const k = (n: number) => n >= 1000 ? `${Math.round(n / 1000).toLocaleString('en-GB')}k` : String(n);
      return { parameter: `Production volume (${k(up)} vs ${k(down)} a year, per vehicle)`, low: _recomputeSummary(prog, { volumeOverride: up }).perVehicle,
        base: summary.perVehicle, high: _recomputeSummary(prog, { volumeOverride: down }).perVehicle, unit: '£/vehicle' };
    })(),
  ];

  // ONE list (sw-benchmarks.ts) — every entry is labelled with whether it is verified (none is, Oct 2026).
  const benchmarks: SWBenchmark[] = [
    ...SW_PUBLISHED_PROGRAMMES.map(p => ({
      vehicle: p.vehicle, totalM: p.totalGBP / 1_000_000, perVehicle: p.perVehicleGBP,
      source: p.source, verified: p.verified, sourceUrl: p.sourceUrl,
    })),
    { vehicle: 'This programme', totalM: summary.grandTotal / 1_000_000, perVehicle: summary.perVehicle, source: 'CostVision model — this calculation', verified: true, sourceUrl: null },
  ];

  // NRE total for phase timeline
  const phases = buildPhases(summary.nreTotal, prog.developmentMonths);

  // Monte Carlo cost distribution
  const monteCarlo = runMonteCarlo(prog, summary, swEvidenceLines(prog, modules, summary));

  return { modules, summary, sensitivity, benchmarks, phases, monteCarlo, inputs: snapshotInputs(prog) };
}

type SWRecomputeOverrides = {
  asilOverride?:       ASILLevel;
  complexityOverride?: SWComplexity;
  reuseOverride?:      SWReuse;
  regionOverride?:     SWRegion;
  lifeOverride?:       number;
  volumeOverride?:     number;
  effortScale?:        number;
  companyBurdenPct?:   number;
  serviceYears?:       number;
  subscriptionYears?:  number;
  postYears?:          number;
};

function _recomputeTotal(prog: SWProgramInputs, overrides: SWRecomputeOverrides): number {
  return _recomputeSummary(prog, overrides).grandTotal;
}

function _recomputeSummary(prog: SWProgramInputs, overrides: SWRecomputeOverrides): SWSummary {
  const p2: SWProgramInputs = {
    ...prog,
    region:           overrides.regionOverride ?? prog.region,
    // Another hub is priced at ITS book rate: a typed rate is a figure for this hub only.
    baseRateGBP:      overrides.regionOverride ? undefined : prog.baseRateGBP,
    programLifeYears: overrides.lifeOverride   ?? prog.programLifeYears,
    annualProductionVolume: overrides.volumeOverride ?? prog.annualProductionVolume,
    effortCalibration: overrides.effortScale !== undefined ? (prog.effortCalibration ?? 1) * overrides.effortScale : prog.effortCalibration,
    burden: overrides.companyBurdenPct !== undefined ? { ...(prog.burden ?? SW_DEFAULT_BURDEN), companyPct: overrides.companyBurdenPct } : prog.burden,
    connectedServiceYears: overrides.serviceYears ?? prog.connectedServiceYears,
    subscriptionYears: overrides.subscriptionYears ?? prog.subscriptionYears,
    postProductionSupportYears: overrides.postYears ?? prog.postProductionSupportYears,
    modules: prog.modules.map(m => ({
      ...m,
      asil:       overrides.asilOverride       ?? m.asil,
      complexity: overrides.complexityOverride ?? m.complexity,
      reuse:      overrides.reuseOverride      ?? m.reuse,
    })),
  };
  return computeSWProgram(p2, { summaryOnly: true }).summary;
}

// ─── Default program inputs ───────────────────────────────────────────────────

/**
 * The ONE overhead default — the product of the three burden layers on the hub rate (SW_DEFAULT_BURDEN: employment
 * +15 %, company +40 %, capital 0 % → × 1.61; bases in SW_BURDEN_BASIS). The screen, every vehicle demo and the report
 * scripts read this (software review P1 #3). It replaced an unlabelled 1.15 that put the loaded UK engineer at £48 / h
 * (gaps round, Oct 2026). The hub rate itself is salary + STATUTORY employer on-cost only.
 */
export const SW_DEFAULT_OVERHEAD = Math.round(burdenMultiplier(SW_DEFAULT_BURDEN) * 1000) / 1000;

export function defaultSWProgramInputs(): SWProgramInputs {
  return {
    region:                  'UK',
    devSource:               'OEM_Internal',
    programLifeYears:        10,
    annualProductionVolume:  80_000,
    teamSeniorFraction:      0.50,
    // The burden on the hub rate (salary + statutory employer on-cost), in three stated layers; overheadMultiplier
    // echoes their product for older readers.
    burden:                  { ...SW_DEFAULT_BURDEN },
    overheadMultiplier:      SW_DEFAULT_OVERHEAD,
    includeMaintenanceCost:  true,
    includeCloudCost:        true,
    // baseRateGBP intentionally unset → the hub's own book rate, unless the user types one.
    modules: SW_MODULES.map(m => ({
      moduleId:           m.id,
      enabled:            m.defaultEnabled !== false,
      asil:               m.defaultAsil,
      complexity:         m.defaultComplexity,
      reuse:              'Medium' as SWReuse,
      customPersonMonths: null,
    })),
  };
}
