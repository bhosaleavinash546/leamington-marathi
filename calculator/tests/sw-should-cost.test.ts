import { describe, it, expect } from 'vitest';
import {
  computeSWProgram,
  defaultSWProgramInputs,
  SW_MODULES,
  ASIL_DEV_MULT,
  REGION_MULT,
  REUSE_FACTOR,
} from '../src/engine/sw-should-cost.js';
import type {
  SWProgramInputs,
  ASILLevel,
  SWReuse,
  SWRegion,
} from '../src/engine/sw-should-cost.js';
import {
  DEFAULT_SW_RATE_LIBRARY,
  resolveRateLibrary,
  rateValues,
} from '../src/engine/sw-rate-library.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build inputs with every module forced to a uniform asil/reuse, for monotonicity tests. */
function uniformInputs(over: Partial<SWProgramInputs> & {
  asil?: ASILLevel; reuse?: SWReuse;
} = {}): SWProgramInputs {
  const base = defaultSWProgramInputs();
  return {
    ...base,
    ...over,
    modules: base.modules.map(m => ({
      ...m,
      asil:  over.asil  ?? m.asil,
      reuse: over.reuse ?? m.reuse,
    })),
  };
}

// ─── Sanity & non-regression (guards the infinite-recursion class of bug) ──────

describe('computeSWProgram — sanity', () => {
  it('runs without throwing and completes quickly', () => {
    const t0 = Date.now();
    const r = computeSWProgram(defaultSWProgramInputs());
    expect(Date.now() - t0).toBeLessThan(2000); // would blow the stack / hang if recursive
    expect(Number.isFinite(r.summary.grandTotal)).toBe(true);
  });

  it('produces a grand total in the premium-EV benchmark range (£300M–£1.2B)', () => {
    const r = computeSWProgram(defaultSWProgramInputs());
    expect(r.summary.grandTotal).toBeGreaterThan(300_000_000);
    expect(r.summary.grandTotal).toBeLessThan(1_200_000_000);
  });

  it('all 43 modules carry the required cost-driver fields', () => {
    expect(SW_MODULES).toHaveLength(43);
    for (const m of SW_MODULES) {
      expect(m.annualToolLicenceGBP).toBeTypeOf('number');
      expect(m.annualIPLicenceGBP).toBeTypeOf('number');
      expect(m.calibrationFractionBase).toBeGreaterThanOrEqual(0);
      expect(m.basePersonMonths).toBeGreaterThan(0);
    }
  });
});

// ─── Accounting invariants ─────────────────────────────────────────────────────

describe('computeSWProgram — accounting invariants', () => {
  const r = computeSWProgram(defaultSWProgramInputs());
  const s = r.summary;

  it('grandTotal equals the sum of module grand totals', () => {
    const sum = r.modules.reduce((a, m) => a + m.grandTotal, 0);
    expect(s.grandTotal).toBeCloseTo(sum, 0);
  });

  it('nreTotal equals its six components', () => {
    const manual = s.totalDevelopment + s.totalTesting + s.totalIntegration
                 + s.totalToolchain + s.totalCybersecurity + s.totalCalibration;
    expect(s.nreTotal).toBeCloseTo(manual, 0);
  });

  it('byCategory sums to grandTotal', () => {
    const sum = Object.values(s.byCategory).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(s.grandTotal, 0);
  });

  it('perVehicle = grandTotal / (volume × life)', () => {
    const inp = defaultSWProgramInputs();
    const vehicles = inp.annualProductionVolume * inp.programLifeYears;
    expect(s.perVehicle).toBeCloseTo(s.grandTotal / vehicles, 4);
  });

  it('each module testing breakdown reconciles to its testing total', () => {
    for (const m of r.modules) {
      const t = m.testing;
      const sub = t.sil + t.mil + t.hil + t.regression + t.penTest + t.scenarios;
      expect(sub).toBeCloseTo(t.total, 0);
    }
  });
});

// ─── Phases ─────────────────────────────────────────────────────────────────--

describe('programme phases', () => {
  const r = computeSWProgram(defaultSWProgramInputs());
  it('phase fractions sum to 1.0', () => {
    const sum = r.phases.reduce((a, p) => a + p.fraction, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });
  it('phase NRE costs sum to summary.nreTotal', () => {
    const sum = r.phases.reduce((a, p) => a + p.nreCost, 0);
    expect(sum).toBeCloseTo(r.summary.nreTotal, 0);
  });
});

// ─── Monte Carlo ────────────────────────────────────────────────────────────--

describe('Monte Carlo', () => {
  const r = computeSWProgram(defaultSWProgramInputs());
  const mc = r.monteCarlo;

  it('percentiles are ordered P10 ≤ P50 ≤ P90 and bracket the base total', () => {
    expect(mc.p10).toBeLessThanOrEqual(mc.p50);
    expect(mc.p50).toBeLessThanOrEqual(mc.p90);
    expect(mc.iterations).toBe(1000);
  });

  it('per-vehicle percentiles track the totals', () => {
    expect(mc.p10PerVehicle).toBeLessThanOrEqual(mc.p90PerVehicle);
    expect(mc.p50PerVehicle).toBeGreaterThan(0);
  });

  it('correlated model yields a non-trivial P10–P90 spread (≥6% of P50)', () => {
    const spread = (mc.p90 - mc.p10) / mc.p50;
    expect(spread).toBeGreaterThan(0.06);
  });
});

// ─── Cost-driver monotonicity (matches real costing direction) ─────────────────

describe('cost-driver monotonicity', () => {
  it('ASIL-D costs more than ASIL-B across the board', () => {
    const b = computeSWProgram(uniformInputs({ asil: 'B' })).summary.grandTotal;
    const d = computeSWProgram(uniformInputs({ asil: 'D' })).summary.grandTotal;
    expect(d).toBeGreaterThan(b);
    expect(ASIL_DEV_MULT.D).toBeGreaterThan(ASIL_DEV_MULT.B);
  });

  it('Platform reuse is far cheaper than Fresh', () => {
    const fresh    = computeSWProgram(uniformInputs({ reuse: 'Fresh' })).summary.grandTotal;
    const platform = computeSWProgram(uniformInputs({ reuse: 'Platform' })).summary.grandTotal;
    expect(platform).toBeLessThan(fresh);
    expect(REUSE_FACTOR.Platform).toBeLessThan(REUSE_FACTOR.Fresh);
  });

  it('India labour is cheaper than USA Silicon Valley', () => {
    const india = computeSWProgram(uniformInputs({ region: 'India'  as SWRegion })).summary.grandTotal;
    const sv    = computeSWProgram(uniformInputs({ region: 'USA_SV' as SWRegion })).summary.grandTotal;
    expect(india).toBeLessThan(sv);
    expect(REGION_MULT.India).toBeLessThan(REGION_MULT.USA_SV);
  });

  it('higher base rate raises labour-driven cost (editable rate library)', () => {
    const lo = computeSWProgram({ ...defaultSWProgramInputs(), baseRateGBP: 28_000 }).summary.grandTotal;
    const hi = computeSWProgram({ ...defaultSWProgramInputs(), baseRateGBP: 56_000 }).summary.grandTotal;
    expect(hi).toBeGreaterThan(lo);
  });

  it('baseRateGBP unset falls back to the default and matches the explicit default', () => {
    const explicit = computeSWProgram({ ...defaultSWProgramInputs(), baseRateGBP: 28_000 }).summary.grandTotal;
    const unset    = computeSWProgram({ ...defaultSWProgramInputs(), baseRateGBP: undefined }).summary.grandTotal;
    expect(unset).toBeCloseTo(explicit, 0);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────--

describe('edge cases', () => {
  it('zero enabled modules → zero cost, no divide-by-zero', () => {
    const inp = defaultSWProgramInputs();
    inp.modules.forEach(m => { m.enabled = false; });
    const r = computeSWProgram(inp);
    expect(r.summary.grandTotal).toBe(0);
    expect(r.summary.perVehicle).toBe(0);
    expect(Number.isFinite(r.summary.perVehicle)).toBe(true);
  });

  it('zero production volume → finite (zero) per-vehicle cost', () => {
    const inp = { ...defaultSWProgramInputs(), annualProductionVolume: 0 };
    const r = computeSWProgram(inp);
    expect(Number.isFinite(r.summary.perVehicle)).toBe(true);
    expect(r.summary.perVehicle).toBe(0);
  });

  it('summaryOnly skips the expensive sensitivity / Monte Carlo build-out', () => {
    const r = computeSWProgram(defaultSWProgramInputs(), { summaryOnly: true });
    expect(r.sensitivity).toHaveLength(0);
    expect(r.monteCarlo.iterations).toBe(0);
    expect(r.summary.grandTotal).toBeGreaterThan(0);
  });
});

// ─── Sensitivity ────────────────────────────────────────────────────────────--

describe('sensitivity analysis', () => {
  const r = computeSWProgram(defaultSWProgramInputs());
  it('produces the expected rows with valid units', () => {
    expect(r.sensitivity.length).toBeGreaterThanOrEqual(6);
    for (const row of r.sensitivity) {
      expect(['£M', '£/vehicle']).toContain(row.unit);
      expect(Number.isFinite(row.low)).toBe(true);
      expect(Number.isFinite(row.high)).toBe(true);
    }
  });
  it('region sensitivity low (India) is below base (UK)', () => {
    const region = r.sensitivity.find(x => x.parameter.includes('Region'));
    expect(region).toBeDefined();
    expect(region!.low).toBeLessThan(region!.base);
  });
});

// ─── Rate library (Rec #1) ─────────────────────────────────────────────────────

describe('rate library', () => {
  const lib = DEFAULT_SW_RATE_LIBRARY;

  it('is versioned', () => {
    expect(lib.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('every rate entry carries full provenance (source, date, confidence)', () => {
    const groups = [
      lib.regionMultipliers, lib.devSourceMultipliers, lib.asilDevMultipliers,
      lib.asilTestMultipliers, lib.complexityMultipliers, lib.reuseFactors,
    ];
    for (const e of [lib.ukBaseRatePerPM, ...groups.flatMap(g => Object.values(g))]) {
      expect(e.source.length).toBeGreaterThan(8);
      expect(e.asOf).toMatch(/^\d{4}-\d{2}$/);
      expect(['High', 'Medium', 'Low']).toContain(e.confidence);
      expect(e.value).toBeGreaterThan(0);
    }
  });

  it('engine constants are derived from the library (single source of truth)', () => {
    expect(ASIL_DEV_MULT).toEqual(rateValues(lib.asilDevMultipliers));
    expect(REGION_MULT).toEqual(rateValues(lib.regionMultipliers));
    expect(REUSE_FACTOR).toEqual(rateValues(lib.reuseFactors));
  });

  it('a partial override changes only the overridden rates', () => {
    const merged = resolveRateLibrary({
      regionMultipliers: { ...DEFAULT_SW_RATE_LIBRARY.regionMultipliers,
        UK: { value: 2.0, source: 'test', asOf: '2026-06', confidence: 'Low' } },
    });
    expect(merged.regionMultipliers.UK.value).toBe(2.0);
    expect(merged.regionMultipliers.India.value).toBe(lib.regionMultipliers.India.value);
    expect(merged.reuseFactors.Fresh.value).toBe(lib.reuseFactors.Fresh.value);
  });

  it('an engagement override library flows through the cost engine', () => {
    const base = computeSWProgram(defaultSWProgramInputs()).summary.grandTotal;
    const over = computeSWProgram({
      ...defaultSWProgramInputs(),
      rateLibrary: {
        ukBaseRatePerPM: { value: 56_000, source: 'engagement', asOf: '2026-06', confidence: 'High' },
      },
    }).summary.grandTotal;
    expect(over).toBeGreaterThan(base); // doubled base rate raises labour-driven cost
  });
});
