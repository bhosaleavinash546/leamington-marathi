/**
 * The injection-moulding review, 2 Oct 2026 — one test per finding.
 *
 * The audit set held no plastic part, so three mouldings were modelled in OCP to
 * production design rules (cad-audit/parts/IM_modelled_parts.py) and measured by
 * the real kernel. Their recorded geometry is in the real-parts baseline. Before
 * the fixes the 159 g ECU cover costed £30.43 (a 59 mm "wall", 1.9 h cooling a
 * shot) and the 600 x 400 tray sat on a press 3.5x too small.
 * docs/cad/injection-moulding-review-2026-10.md has the trace.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { INJECTION_MOULDING_RULES, runnerChoice, coldRunnerKgPerShot, mouldManning, shotSecondsFor } from '../src/engine/cost-input-rules/commodities/injection-moulding.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { projectedAreaCm2 } from '../src/engine/cost-input-rules/derive/envelope.js';
import { resinFacts } from '../src/engine/cost-input-rules/derive/resin.js';
import { correctShellWallMm, estimatePackagingPerPart } from '../src/engine/geometry-sanity.js';
import { dryCycleSeconds, injectionRateCm3PerSec, computeInjectionMouldingDrivers } from '../src/engine/modules/injection-moulding.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (part: string, resin: string, annualVolume = 100_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'injection_moulding', commoditySource: 'engineer',
  annualVolume, filename: part, answers: { 'material.resin': resin, 'commodity.thinWallRoute': 'injection_moulding' },
} as RuleContext);
const im = (part: string, resin: string, vol?: number) => {
  const r = runCostInputRules(INJECTION_MOULDING_RULES, ctx(part, resin, vol));
  return { r, s: r.suggestions.injectionMoulding as Record<string, number | string> };
};

describe('1. the wall of an ordinary moulding is its wall, not the cavity', () => {
  it('ECU cover: 2·V/S 2.27 mm replaces a 29.5 mm ray-cast mean (fill 0.14 — the old guard needed < 0.05)', () => {
    const g = geoOf('IM_ECU_Cover.stp');
    expect(g.wallThickness?.method).toBe('volume_surface_shell');
    expect(g.wallThickness?.meanMm).toBeCloseTo(2.27, 2);
    expect(im('IM_ECU_Cover.stp', 'mat-pa66gf30').s.wallThicknessMm).toBe(2.3);   // was 59 → 6,962 s cooling
  });

  it('a solid small part is still left alone', () => {
    // 20 mm cube: 2·V/S 6.7 mm, fill 1.0 — excluded twice over.
    expect(correctShellWallMm(20, 8, 24, 1.0).corrected).toBe(false);
    // a 10 mm cube: 2·V/S 3.3 mm, but fill 1.0
    expect(correctShellWallMm(10, 1, 6, 1.0).corrected).toBe(false);
  });
});

describe('2. projected area is the measured silhouette', () => {
  it('tray: 2,403 cm² measured, against 655 cm² estimated — the press follows', () => {
    const c = ctx('IM_Storage_Tray.stp', 'mat-pp-impact', 50_000);
    expect(projectedAreaCm2(c)).toBeCloseTo(2402.7, 0);
    expect(im('IM_Storage_Tray.stp', 'mat-pp-impact', 50_000).s.machineId).toBe('imm-1200t');   // was imm-350t
  });

  it('cover: 216 cm² — the 180 × 120 footprint less its corner fillets', () => {
    expect(projectedAreaCm2(ctx('IM_ECU_Cover.stp', 'mat-pa66gf30'))).toBeCloseTo(216.2, 0);
  });
});

describe('3. the shot follows the press', () => {
  it('a bigger press has a longer dry cycle and a faster injection unit', () => {
    expect(dryCycleSeconds('imm-50t')).toBeLessThan(dryCycleSeconds('imm-1200t'));
    expect(injectionRateCm3PerSec('imm-50t')).toBeLessThan(injectionRateCm3PerSec('imm-1200t'));
    const tray = im('IM_Storage_Tray.stp', 'mat-pp-impact', 50_000).s;
    expect(tray.ejectTimeSec).toBe(7);                                 // 6 s dry + 1 s take-out, was 2
    expect(tray.fillTimeSec).toBeCloseTo(1075 / 600, 1);               // shot ÷ rate, was 0.5 s/mm wall
  });

  it('the optimiser ranks each cavitation on its own press’s shot', () => {
    const c = ctx('IM_ECU_Cover.stp', 'mat-pa66gf30');
    const resin = resinFacts(c);
    expect(shotSecondsFor(c, resin, 'imm-350t', 2)).toBeGreaterThan(shotSecondsFor(c, resin, 'imm-200t', 1));
  });
});

describe('4. runner, regrind, crew and scrap are rules, the same on screen and headless', () => {
  it('large or high-volume parts are hot-runnered; small low-volume ones cold', () => {
    const tray = ctx('IM_Storage_Tray.stp', 'mat-pp-impact', 50_000);
    expect(runnerChoice(tray, resinFacts(tray), 2402.7).system).toBe('hot');
    const cover = ctx('IM_ECU_Cover.stp', 'mat-pa66gf30');
    expect(runnerChoice(cover, resinFacts(cover), 216).system).toBe('cold');
    const clip = ctx('IM_Cable_Clip.stp', 'mat-pa66gf30', 1_000_000);
    expect(runnerChoice(clip, resinFacts(clip), 4.4).system).toBe('hot');
  });

  it('a small part’s runner is never under 3 g a cavity', () => {
    expect(coldRunnerKgPerShot(0.0054, 8)).toBeCloseTo(0.024, 4);
  });

  it('regrind is capped by a 20% blend; manning by press size; scrap 2%', () => {
    const { s } = im('IM_ECU_Cover.stp', 'mat-pa66gf30');
    expect(s.regrindFraction).toBe(0.8);
    expect(s.manning).toBe(0.5);
    expect(s.rejectRate).toBe(0.02);
    expect(mouldManning('imm-1200t').n).toBe(1);
  });

  it('headless takes every one of them', () => {
    const { r } = im('IM_ECU_Cover.stp', 'mat-pa66gf30');
    const m = toCostParams('injection_moulding', {
      materialId: 'mat-pa66gf30', netWeightKg: 0.159, injectionMoulding: r.suggestions.injectionMoulding,
    } as never, 100_000)!;
    expect(m.params).toMatchObject({ regrindFraction: 0.8, manning: 0.5, rejectRate: 0.02, runnerSystem: 'cold' });
    expect(m.params.projectedAreaCm2).toBeCloseTo(216.2 * Number(m.params.cavities), 0);   // total, not one cavity
  });
});

describe('5. the mould is the toolmaker build-up, not a blend with face counting', () => {
  it('the kernel figure is shown, not used', () => {
    const { r } = im('IM_ECU_Cover.stp', 'mat-pa66gf30');
    expect(r.provenance['imm-mould-cost'].basis).toContain('(not used)');
  });
});

describe('6. a moulded shell is not routed to sheet metal without a question', () => {
  it('cover (bosses, named a moulding) and tray (named a moulding) are asked, leaning to moulding', () => {
    for (const p of ['IM_ECU_Cover.stp', 'IM_Storage_Tray.stp']) {
      const v = inferCommodity({ geo: geoOf(p), answers: {}, annualVolume: 50_000, filename: p } as unknown as RuleContext);
      expect(v.commodity, p).toBeUndefined();
      expect(v.decision?.options.find(o => o.leaning)?.value, p).toBe('injection_moulding');
    }
  });

  it('the real pressing is still routed to sheet metal outright', () => {
    const v = inferCommodity({ geo: geoOf('Seat_Locking_Bracket.stp'), answers: {}, annualVolume: 50_000,
      filename: 'Seat_Locking_Bracket.stp' } as unknown as RuleContext);
    expect(v.commodity).toBe('sheet_metal');
  });
});

describe('7. a part that ships by the thousand is not charged a box each', () => {
  it('a 5 g clip packs for a fraction of a penny; a bracket keeps its box', () => {
    expect(estimatePackagingPerPart(12, 0.005)).toBeLessThan(0.005);
    expect(estimatePackagingPerPart(2000, 2.5)).toBeGreaterThanOrEqual(0.15);
  });
});

describe('the cost, end to end', () => {
  it('ECU cover £1.42 at 100k/yr (was £30.43) — module arithmetic on the rule values', () => {
    const { r } = im('IM_ECU_Cover.stp', 'mat-pa66gf30');
    const m = toCostParams('injection_moulding', {
      materialId: 'mat-pa66gf30', netWeightKg: 0.159, injectionMoulding: r.suggestions.injectionMoulding,
    } as never, 100_000)!;
    const d = computeInjectionMouldingDrivers(m.params as never);
    const cycleS = d.operations[0].cycleTimeHr * 3600 / (1 / (1 - 0.02));
    expect(cycleS).toBeGreaterThan(15);
    expect(cycleS).toBeLessThan(20);
  });
});
