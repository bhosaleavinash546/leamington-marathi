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

export type RateConfidence = 'High' | 'Medium' | 'Low';

export interface SWRateEntry {
  value:      number;
  source:     string;        // where the figure comes from
  asOf:       string;        // effective date (ISO yyyy-mm)
  confidence: RateConfidence;
  note?:      string;
}

export interface SWRateLibrary {
  version:               string;
  lastReviewed:          string;
  /** UK senior-blended bare rate (£/person-month), before overhead. */
  ukBaseRatePerPM:       SWRateEntry;
  regionMultipliers:     Record<SWRegion, SWRateEntry>;
  devSourceMultipliers:  Record<DevSource, SWRateEntry>;
  asilDevMultipliers:    Record<ASILLevel, SWRateEntry>;
  asilTestMultipliers:   Record<ASILLevel, SWRateEntry>;
  complexityMultipliers: Record<SWComplexity, SWRateEntry>;
  reuseFactors:          Record<SWReuse, SWRateEntry>;
}

// ─── Default library v1.0 ──────────────────────────────────────────────────────

const E = (value: number, source: string, asOf: string, confidence: RateConfidence, note?: string): SWRateEntry =>
  ({ value, source, asOf, confidence, note });

export const DEFAULT_SW_RATE_LIBRARY: SWRateLibrary = {
  version:      '1.0.0',
  lastReviewed: '2026-06',

  ukBaseRatePerPM: E(
    28_000,
    'UK automotive embedded SW senior-blended day-rate × 20 working days; cross-checked vs Hays Technology Salary Guide 2025 + IR35 contractor norms',
    '2025-01', 'Medium',
    'Bare rate (salary + benefits). Programme overhead applied separately via overheadMultiplier.',
  ),

  regionMultipliers: {
    UK:             E(1.00, 'Baseline reference region', '2025-01', 'High'),
    EU:             E(0.95, 'DE/FR/NL blended automotive SW rates vs UK — IG Metall + Syntec benchmarks', '2025-01', 'Medium'),
    USA_Detroit:    E(1.35, 'US Midwest OEM SW engineering loaded rate vs UK — BLS 15-1252 + supplier data', '2025-01', 'Medium'),
    USA_SV:         E(1.85, 'Silicon Valley AV/ADAS talent premium — Levels.fyi senior SWE total comp', '2025-01', 'Medium'),
    China:          E(0.35, 'Tier-1 China SW centre blended rate (Shanghai/Shenzhen) vs UK', '2025-01', 'Low'),
    India:          E(0.20, 'India offshore automotive SW (Bangalore/Pune) blended rate vs UK', '2025-01', 'Medium'),
    Mexico:         E(0.28, 'Mexico nearshore SW engineering blended rate vs UK', '2025-01', 'Low'),
    Eastern_Europe: E(0.45, 'PL/RO/CZ nearshore automotive SW blended rate vs UK', '2025-01', 'Medium'),
    Japan:          E(0.90, 'Japan OEM SW engineering loaded rate vs UK', '2025-01', 'Low'),
  },

  devSourceMultipliers: {
    OEM_Internal:   E(1.00, 'OEM in-house baseline (full process rigour, full overhead)', '2025-01', 'High'),
    Tier1_Supplier: E(0.88, 'Tier-1 supplier efficiency vs OEM in-house — typical 10-15% delta', '2025-01', 'Medium'),
    Startup_OSS:    E(0.72, 'SW startup / OSS-leveraged delivery — lower process overhead, higher execution risk', '2025-01', 'Low',
                       'Lower cost reflects leaner process, not lower scope — pair with higher risk weighting.'),
  },

  asilDevMultipliers: {
    QM: E(1.00, 'ISO 26262 — no safety integrity requirement (baseline)', '2024-01', 'High'),
    A:  E(1.35, 'ISO 26262 ASIL-A process overhead vs QM — industry effort studies', '2024-01', 'Medium'),
    B:  E(1.80, 'ISO 26262 ASIL-B process overhead vs QM', '2024-01', 'Medium'),
    C:  E(2.30, 'ISO 26262 ASIL-C process overhead vs QM', '2024-01', 'Medium'),
    D:  E(3.20, 'ISO 26262 ASIL-D process overhead vs QM — most stringent (independence, FMEDA, formal methods)', '2024-01', 'Medium'),
  },

  asilTestMultipliers: {
    QM: E(0.35, 'Verification effort as fraction of dev at QM — baseline', '2024-01', 'Medium'),
    A:  E(0.55, 'ISO 26262 ASIL-A verification/test effort fraction', '2024-01', 'Medium'),
    B:  E(0.85, 'ISO 26262 ASIL-B verification/test effort fraction', '2024-01', 'Medium'),
    C:  E(1.20, 'ISO 26262 ASIL-C verification/test effort fraction (test ≥ dev)', '2024-01', 'Medium'),
    D:  E(1.80, 'ISO 26262 ASIL-D verification/test effort fraction (HIL, fault injection, MC/DC)', '2024-01', 'Medium'),
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

/** Merge a partial override library over the default (deep on the rate groups). */
export function resolveRateLibrary(override?: Partial<SWRateLibrary>): SWRateLibrary {
  if (!override) return DEFAULT_SW_RATE_LIBRARY;
  const d = DEFAULT_SW_RATE_LIBRARY;
  return {
    version:               override.version      ?? d.version,
    lastReviewed:          override.lastReviewed ?? d.lastReviewed,
    ukBaseRatePerPM:       override.ukBaseRatePerPM       ?? d.ukBaseRatePerPM,
    regionMultipliers:     { ...d.regionMultipliers,     ...(override.regionMultipliers     ?? {}) },
    devSourceMultipliers:  { ...d.devSourceMultipliers,  ...(override.devSourceMultipliers  ?? {}) },
    asilDevMultipliers:    { ...d.asilDevMultipliers,    ...(override.asilDevMultipliers    ?? {}) },
    asilTestMultipliers:   { ...d.asilTestMultipliers,   ...(override.asilTestMultipliers   ?? {}) },
    complexityMultipliers: { ...d.complexityMultipliers, ...(override.complexityMultipliers ?? {}) },
    reuseFactors:          { ...d.reuseFactors,          ...(override.reuseFactors          ?? {}) },
  };
}
