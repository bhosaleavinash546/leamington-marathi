/**
 * Automotive Software Should-Cost — Rate Library
 *
 * Single, versioned, sourced source of truth for every rate and multiplier the
 * cost engine uses. Each entry carries its provenance (source, effective date,
 * confidence) so a costing engineer can defend — and override — every number.
 *
 * The engine derives its working multiplier tables from DEFAULT_SW_RATE_LIBRARY;
 * a programme may supply its own library (or a partial override) via
 * SWProgramInputs.rateLibrary.
 */

import type {
  ASILLevel,
  SWComplexity,
  SWReuse,
  SWRegion,
  DevSource,
} from './sw-should-cost.js';
import { SW_HUB_RATES, SW_RATE_BOOK_VERSION, type SWHubId } from './sw-country-rates.js';

export type RateConfidence = 'High' | 'Medium' | 'Low';

export interface SWRateEntry {
  value:      number;
  source:     string;        // where the figure comes from
  asOf:       string;        // effective date (ISO yyyy-mm)
  confidence: RateConfidence;
  note?:      string;
}

/** One engineering hub's own cost of an engineer, £ per person-month (152 h): salary + statutory employer on-cost,
 *  before programme overhead. `mid` and `senior` are blended by the programme's senior share. */
export interface SWHubRateEntry {
  mid:    SWRateEntry;
  senior: SWRateEntry;
}

export interface SWRateLibrary {
  version:               string;
  lastReviewed:          string;
  /** Each software hub's OWN rate (Chief Engineer review, Oct 2026). Replaces the retired UK base × region multiplier. */
  hubRates:              Record<SWRegion, SWHubRateEntry>;
  /** Delivery EFFICIENCY of each development source (effort relative to OEM in-house) — not a price. */
  devSourceMultipliers:  Record<DevSource, SWRateEntry>;
  /** A supplier's operating margin: a bought source's price is its cost ÷ (1 − margin) (Oct 2026 costing review). */
  supplierMargin?:       SWRateEntry;
  asilDevMultipliers:    Record<ASILLevel, SWRateEntry>;
  asilTestMultipliers:   Record<ASILLevel, SWRateEntry>;
  complexityMultipliers: Record<SWComplexity, SWRateEntry>;
  reuseFactors:          Record<SWReuse, SWRateEntry>;
}

// ─── Default library v1.0 ──────────────────────────────────────────────────────

const E = (value: number, source: string, asOf: string, confidence: RateConfidence, note?: string): SWRateEntry =>
  ({ value, source, asOf, confidence, note });

/** Book entries from the generated country rates (src/engine/sw-country-rates.ts — scripts/sw-rate-book.ts). */
function hubEntries(): Record<SWHubId, SWHubRateEntry> {
  const out = {} as Record<SWHubId, SWHubRateEntry>;
  for (const h of Object.values(SW_HUB_RATES)) {
    const src = (lvl: 'mid' | 'senior') =>
      `${h.label}: ${lvl === 'mid' ? 'mid-level' : 'senior'} engineer ${h.currency} ${(lvl === 'mid' ? h.midAnnualSalary : h.seniorAnnualSalary).toLocaleString('en-GB')} a year`
      + ` (median of ${(lvl === 'mid' ? h.mid : h.senior).length || h.mid.length} sourced figure${((lvl === 'mid' ? h.mid : h.senior).length || h.mid.length) === 1 ? '' : 's'})`
      + ` + statutory employer on-cost, ÷ ${h.productiveHours.toLocaleString('en-GB')} productive h × 152 h, at ${h.fxToGBP} ${h.currency}/£`;
    out[h.id] = {
      mid:    E(h.midPerPMGBP, src('mid'), '2026-10', h.confidence, h.build),
      senior: E(h.seniorPerPMGBP, src('senior'), '2026-10', h.confidence, h.seniorBasis),
    };
  }
  return out;
}

export const DEFAULT_SW_RATE_LIBRARY: SWRateLibrary = {
  version:      `2.0.0 (country book ${SW_RATE_BOOK_VERSION})`,
  lastReviewed: '2026-10',

  // Each hub's own engineer cost — no UK base and no multiplier (Chief Engineer review, Oct 2026). The retired book
  // priced every country as £28,000 / PM (≈ £1,400 a day, 2.5× the UK automotive contract day rate) × a ratio.
  hubRates: hubEntries(),

  // EFFICIENCY only (effort relative to OEM in-house; unsourced, labelled). A bought source is then PRICED at
  // cost ÷ (1 − supplierMargin): the old ×0.88 on the same hub cost priced a Tier-1 below its own wage bill, so buying
  // looked cheaper than doing it in-house (costing-manager review, Oct 2026).
  devSourceMultipliers: {
    OEM_Internal:   E(1.00, 'OEM in-house baseline (full process rigour, full overhead)', '2025-01', 'High'),
    Tier1_Supplier: E(0.88, 'Tier-1 delivery efficiency vs OEM in-house (platform reuse, mature process) — CostVision assumption, unsourced', '2025-01', 'Low',
                       'An effort factor; the supplier margin is added on top (supplierMargin).'),
    Startup_OSS:    E(0.72, 'SW startup / OSS-leveraged delivery efficiency — lower process overhead, higher execution risk; CostVision assumption, unsourced', '2025-01', 'Low',
                       'Lower effort reflects leaner process, not lower scope — pair with higher risk weighting. Supplier margin added on top.'),
  },

  // Median of six engineering-services firms' latest published margins (open-items round, 14 Oct 2026 — two German firms
  // added; each figure re-checked by an independent search): Bertrandt −3.7 % (EBIT −€36M on €978M output, FY2024/25),
  // EDAG −1.8 % (adjusted EBIT 2025), ALTEN 8.5 % (operating margin on activity, 2025), LTTS 14.9 % (EBIT, FY25), KPIT
  // 21.0 % (EBITDA, FY25), Tata Elxsi 26.3 % (PBT, FY25) → (8.5 + 14.9) / 2 = 11.7 %. It was 18 % on the four without the
  // German firms (three of them Indian). The measures differ (EBIT / EBITDA / PBT) and the German years are a downturn —
  // Bertrandt's medium-term target is 6–9 % — said so; the range (−3.7 … 26.3 %) is why it is graded Low.
  supplierMargin: E(0.117,
    'Median of Bertrandt −3.7 % (EBIT FY24/25), EDAG −1.8 % (adj. EBIT 2025), ALTEN 8.5 % (op. margin 2025), LTTS 14.9 % (EBIT FY25), KPIT 21.0 % (EBITDA FY25), Tata Elxsi 26.3 % (PBT FY25)',
    '2026-10', 'Low', 'Mixed margin measures, range −3.7 … 26.3 %; set your own supplier\'s margin when known. Price = cost ÷ (1 − margin).'),

  // ASIL uplift — ONE factor on total effort (software review P1 #20, Oct 2026). It was ×1.35–3.20 on development AND a
  // test fraction rising 0.35 → 1.80 on top (an ASIL-D module's testing ≈ 16× a QM one), against ×1.26–×1.8 in every
  // source found. No standard publishes an ISO 26262 effort multiplier; these follow the one engineering source with
  // per-level figures (DO-178C-derived): ×1.4 from no safety requirement to ASIL-B, ×1.3 from B to D. A and C are
  // geometric interpolations, said so. Test, integration, cyber and maintenance are fractions of development, so they
  // carry the uplift once — the test multipliers below are neutral (1.00) and exist only for a sourced override.
  asilDevMultipliers: {
    QM: E(1.00, 'ISO 26262 — no safety integrity requirement (baseline)', '2026-10', 'High'),
    A:  E(1.18, 'Interpolated: √1.4 between QM (1.00) and ASIL-B (1.40) — https://www.solcept.ch/en/blog/critical-systems/effort-functional-safety/', '2026-10', 'Low', 'interpolation, not a published figure'),
    B:  E(1.40, 'Solcept, "Effort of functional safety": ×1.4 non-safety → ASIL-B (DO-178C-derived) — https://www.solcept.ch/en/blog/critical-systems/effort-functional-safety/', '2026-10', 'Low', 'engineering blog, read via search extract; no ISO 26262 standard figure exists'),
    C:  E(1.60, 'Interpolated: 1.4 × √1.3 between ASIL-B (1.40) and ASIL-D (1.82) — https://www.solcept.ch/en/blog/critical-systems/effort-functional-safety/', '2026-10', 'Low', 'interpolation, not a published figure'),
    D:  E(1.82, 'Solcept: ×1.4 non-safety → B, then ×1.3 B → D = 1.82 — https://www.solcept.ch/en/blog/critical-systems/effort-functional-safety/ (cf. COCOMO II RELY Very High 1.26)', '2026-10', 'Low', 'engineering blog, read via search extract'),
  },

  asilTestMultipliers: {
    QM: E(1.00, 'Neutral — the ASIL uplift is carried once by asilDevMultipliers (test is a fraction of development)', '2026-10', 'Medium'),
    A:  E(1.00, 'Neutral — see asilDevMultipliers; override only with a sourced verification-share figure', '2026-10', 'Medium'),
    B:  E(1.00, 'Neutral — see asilDevMultipliers; override only with a sourced verification-share figure', '2026-10', 'Medium'),
    C:  E(1.00, 'Neutral — see asilDevMultipliers; override only with a sourced verification-share figure', '2026-10', 'Medium'),
    D:  E(1.00, 'Neutral — see asilDevMultipliers; override only with a sourced verification-share figure', '2026-10', 'Medium'),
  },

  complexityMultipliers: {
    'Low':       E(0.60, 'Well-understood, low-algorithmic-density modules', '2024-01', 'Medium'),
    'Medium':    E(1.00, 'Baseline complexity', '2024-01', 'High'),
    'High':      E(1.70, 'Complex algorithms / large-scale integration (e.g. sensor fusion)', '2024-01', 'Medium'),
    'Very High': E(2.80, 'Frontier engineering (real-time AI perception, novel control)', '2024-01', 'Low'),
  },

  reuseFactors: {
    Fresh:    E(1.00, 'Greenfield development — no prior code', '2024-01', 'High'),
    Light:    E(0.82, 'Prior version needs significant rework (new MCU/platform port)', '2024-01', 'Medium'),
    Medium:   E(0.60, 'Core algorithms reused, new platform integration', '2024-01', 'Medium'),
    Heavy:    E(0.35, 'Mostly copy-forward with minor changes', '2024-01', 'Medium'),
    Platform: E(0.14, 'Shared across vehicle lines with minimal change (e.g. AUTOSAR stack)', '2024-01', 'Medium'),
  },
};

// ─── Derivation helpers ────────────────────────────────────────────────────────

/** Collapse a Record<K, SWRateEntry> to a plain Record<K, number> for the hot path. */
export function rateValues<K extends string>(rec: Record<K, SWRateEntry>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k in rec) out[k] = rec[k].value;
  return out;
}

function mergeHubs(d: Record<SWRegion, SWHubRateEntry>, o?: Partial<Record<SWRegion, Partial<SWHubRateEntry>>>): Record<SWRegion, SWHubRateEntry> {
  const out = { ...d };
  for (const [k, v] of Object.entries(o ?? {}) as [SWRegion, Partial<SWHubRateEntry>][]) {
    if (!(k in d) || !v) continue;              // a hub the book does not have is refused upstream (workbook / validation)
    out[k] = { mid: v.mid ?? d[k].mid, senior: v.senior ?? d[k].senior };
  }
  return out;
}

/** A stored company book from before Oct 2026 carries the retired UK base / region multipliers; they are ignored. */
export function retiredRateKeys(override?: Record<string, unknown> | null): string[] {
  return ['ukBaseRatePerPM', 'regionMultipliers'].filter(k => override && k in override);
}

/** Merge a partial override library over the default (deep on the rate groups). */
export function resolveRateLibrary(override?: Partial<SWRateLibrary>): SWRateLibrary {
  if (!override) return DEFAULT_SW_RATE_LIBRARY;
  const d = DEFAULT_SW_RATE_LIBRARY;
  return {
    version:               override.version      ?? d.version,
    lastReviewed:          override.lastReviewed ?? d.lastReviewed,
    hubRates:              mergeHubs(d.hubRates, override.hubRates),
    devSourceMultipliers:  { ...d.devSourceMultipliers,  ...(override.devSourceMultipliers  ?? {}) },
    supplierMargin:        override.supplierMargin ?? d.supplierMargin,
    asilDevMultipliers:    { ...d.asilDevMultipliers,    ...(override.asilDevMultipliers    ?? {}) },
    asilTestMultipliers:   { ...d.asilTestMultipliers,   ...(override.asilTestMultipliers   ?? {}) },
    complexityMultipliers: { ...d.complexityMultipliers, ...(override.complexityMultipliers ?? {}) },
    reuseFactors:          { ...d.reuseFactors,          ...(override.reuseFactors          ?? {}) },
  };
}
