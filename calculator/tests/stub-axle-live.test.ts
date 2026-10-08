/**
 * The steering stub axle (PRCR002 — the user's Stub_Axle.stp, same SHA-256), cast in iron and
 * machined: every defect the live run of 6 Oct 2026 found, pinned on the part's measured geometry.
 *
 *  1. A part answered safety-critical was costed in EN-GJL-250 GREY iron (brittle — never a steering
 *     part); the grade was asked before the safety question and nothing tied the two.
 *  2. The spindle (bearing journals, taper, shoulders — 226 cm² of turned surface) was not costed:
 *     the near-net path machined only flats and holes, and the turning stock was not in the casting.
 *  3. The costing was titled "cv-cad-7f1b2d1f3d7a7e74" (the server's temp file), not the part.
 *  4. £14.73 of X-ray, heat treatment, tool wear and cores was traced as "core/wax/shell".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { nearNetTurningTime, nearNetTurnedAreaCm2, MIN_NEAR_NET_TURNED_SHARE } from '../src/engine/machining-time.js';
import { partNameFor } from '../server/utils/geometry-bridge.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (part: string) => baseline.find(b => b.part === part)!.geometry;
const ctx = (answers: Record<string, string>, part = 'PRCR002.stp', filename = 'Stub_Axle.stp'): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'cast_and_machine', commoditySource: 'engineer',
  annualVolume: 100_000, filename, answers,
} as RuleContext);
const BASE = { 'commodity.route': 'cast_and_machine', 'material.family': 'cast iron' };
const ALL = { ...BASE, 'service.safetyCritical': 'yes', 'service.pressureTight': 'no', 'service.toleranceClass': 'standard' };

describe('1. a safety-critical cast-iron part is ductile iron', () => {
  it('asks "safety-critical?" before the grade (the grade depends on it)', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx(BASE));
    const ids = r.decisions.map(d => d.id);
    expect(ids).toContain('service.safetyCritical');
    expect(ids).not.toContain('material.grade');
    // The name says stub axle: the question leans "yes".
    expect(r.decisions.find(d => d.id === 'service.safetyCritical')!.options.find(o => o.leaning)?.value).toBe('yes');
  });

  it('safety-critical: the grade question leans EN-GJS-500-7 and marks the brittle irons', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx(ALL));
    const g = r.decisions.find(d => d.id === 'material.grade')!;
    expect(g.options.find(o => o.leaning)?.value).toBe('mat-gjs500');
    expect(g.options.find(o => o.value === 'mat-gjl250')!.consequence).toMatch(/brittle — not for a safety-critical part/);
    expect(g.options.find(o => o.value === 'mat-gjs500')!.consequence).not.toMatch(/brittle/);
    expect((r.suggestions.casting as Record<string, unknown>).materialId).toBe('mat-gjs500');
  });

  it('not safety-critical: the grey-iron workhorse stays the default', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx({ ...ALL, 'service.safetyCritical': 'no' }));
    expect((r.suggestions.casting as Record<string, unknown>).materialId).toBe('mat-gjl250');
  });

  it('grey iron chosen for a safety-critical part is costed as chosen — and said, at lower confidence', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx({ ...ALL, 'material.grade': 'mat-gjl250' }));
    const p = r.provenance['cam-mat'];
    expect(p.value).toBe('mat-gjl250');
    expect(p.basis).toMatch(/CHECK: a brittle iron on a part answered safety-critical/);
    expect(p.confidence).toBeLessThan(1);
  });

  it('the process plan is the iron that is priced (ductile yield band, not grey)', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx(ALL));
    expect((r.suggestions.casting as Record<string, number>).yieldFraction).toBe(0.63);
    const grey = runCostInputRules(CAST_AND_MACHINE_RULES, ctx({ ...ALL, 'service.safetyCritical': 'no' }));
    expect((grey.suggestions.casting as Record<string, number>).yieldFraction).toBe(0.73);
  });
});

describe('2. the spindle is turned, and its stock is cast', () => {
  const geo = geoOf('PRCR002.stp');

  it('the kernel measures the outside of the turned axis — 226 cm², 16.5% of the surface, Ø114 max', () => {
    expect(geo.turning?.externalAreaMm2).toBeCloseTo(22575.2, 0);
    expect(geo.turning?.externalMaxDiaMm).toBe(114);
    expect(nearNetTurnedAreaCm2(geo.turning, geo.surfaceArea!.cm2)).toBeCloseTo(225.75, 1);
  });

  it('a lone cast boss is not a spindle: the Casting Bracket (4.8% of its surface) gets no turning', () => {
    const b = geoOf('Casting_Braket.stp');
    expect((b.turning?.externalAreaMm2 ?? 0) / 100 / b.surfaceArea!.cm2).toBeLessThan(MIN_NEAR_NET_TURNED_SHARE);
    expect(nearNetTurnedAreaCm2(b.turning, b.surfaceArea!.cm2)).toBe(0);
  });

  it('turning time by hand: rough 67.7 cm³ ÷ 100 + finish 225.75 cm² ÷ 75 + 3 tools × 6 s = 3.99 min (cast iron)', () => {
    const t = nearNetTurningTime(225.75, 'cast iron', 3, 114);
    expect(t.roughMin).toBeCloseTo(0.68, 2);
    expect(t.finishMin).toBeCloseTo(3.01, 2);
    expect(t.totalMin).toBeCloseTo(3.99, 2);
    expect(t.basis).toMatch(/ground bearing seats, if the drawing calls them, are extra/);
  });

  it('the operation plan has the lathe operation, its fixturing counted as a set-up', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx(ALL));
    const m = r.suggestions.machining as { operations: Array<{ name: string; machineId: string; type: string; cycleTimeHr: number }>; setupCount: number };
    const turn = m.operations.find(o => /Turning — spindle/.test(o.name))!;
    expect(turn.machineId).toBe('mach-lathe-cnc');
    expect(turn.type).toBe('turning');
    expect(turn.cycleTimeHr * 60).toBeCloseTo(3.99 + 1.2, 1);   // + loading the casting
    expect(m.setupCount).toBe(5);   // 4 milling / drilling fixturings + the lathe
    // Near-net names do not claim every face is machined.
    expect(m.operations.some(o => /\(\d+ faces\)/.test(o.name))).toBe(false);
  });

  it('the casting carries the turning stock: 7.364 kg + drilled + faced + 67.7 cm³ on the spindle = 9.08 kg', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx(ALL));
    const c = r.suggestions.casting as Record<string, number>;
    // The mass is the costed iron's: 1037.113 cm³ × 7100 kg/m³ (EN-GJS-500-7), not the family's 7150.
    expect(c.netWeightKg).toBeCloseTo(7.364, 3);
    // Drilled 38.9 cm³ / stock 135.7 cm³ since the kernel's cylinder identity (Oct 2026): the two Ø8.5 × 31.3 split-half
    // holes (+3.55 cm³) and the Ø31 bore were invisible before — 35.3 / 132.6 then.
    expect(c.castPartWeightKg).toBeCloseTo(7.364 + (38.9 + 135.7 + 67.7) * 0.0071, 2);
    expect(r.provenance['cam-cast-wt'].basis).toMatch(/38\.9 cm³ of 12 hole\(s\) ≤ 20 mm drilled/);
    expect(r.provenance['cam-cast-wt'].basis).toMatch(/67\.7 cm³ turning stock on the 226 cm² spindle/);
  });

  it('the real-parts baseline records the stub axle as cast ductile iron, safety-critical', () => {
    const rec = baseline.find(b => b.part === 'PRCR002.stp')!;
    expect(rec.outcome.total).toBeGreaterThan(80);
  });
});

describe('3. the part is named after the file, not the temp copy', () => {
  it('replaces "cv-cad-…" with the upload\'s name; keeps a real kernel name', () => {
    expect(partNameFor('cv-cad-7f1b2d1f3d7a7e74', 'Stub_Axle.stp')).toBe('Stub_Axle');
    expect(partNameFor(undefined, 'Stub_Axle.stp')).toBe('Stub_Axle');
    expect(partNameFor('PRCR002', 'Stub_Axle.stp')).toBe('PRCR002');
  });
});

describe('4. the consumables line says what it is made of', () => {
  it('itemises the trace when the module lists the items', () => {
    const r = computeUniversalStack({
      partName: 'x', overheadPct: 0, marginPct: 0, packagingPerPart: 0, logisticsPerPart: 0, operations: [],
      tooling: { totalToolingCost: 0, amortizationVolume: 1, mode: 'amortized' },
      rawMaterial: { materialId: 'mat-gjs500', netWeightKg: 1, materialUtilization: 1, consumablesCostPerPart: 8,
        consumablesItems: [{ label: 'cores', gbp: 3 }, { label: 'NDT', gbp: 5 }] },
    } as never, DEFAULT_RATE_LIBRARY);
    const t = r.traceability.find(x => x.field === 'rawMaterial.consumablesCostPerPart')!;
    expect(t.rateSource).toBe('Per-part consumables & services: cores £3.00 · NDT £5.00');
  });
});

describe('5. a mesh upload: its triangles are not faces', () => {
  it('the deburr allowance does not read 208,858 triangles as faces (it was £302 a part)', async () => {
    const { bRepFaceCount, MESH_DEBURR_FACE_ALLOWANCE } = await import('../src/engine/cost-input-rules/derive/facts.js');
    const geo = { ...geoOf('PRCR002.stp'), faces: { total: 208_858, byType: {} } } as OCCTGeometry;
    const meshCtx = { ...ctx(ALL), geo, geometryQuality: 'stl' } as RuleContext;
    expect(bRepFaceCount(meshCtx)).toBeNull();
    expect(bRepFaceCount(ctx(ALL))).toBe(364);
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, { ...meshCtx, answers: { ...ALL, 'geometry.holeCount': '21' } } as RuleContext);
    const ops = (r.suggestions.machining as { operations: Array<{ name: string; cycleTimeHr: number; basis?: string }> }).operations;
    const deburr = ops.find(o => /Deburr/.test(o.name))!;
    expect(deburr.cycleTimeHr * 60).toBeCloseTo(1 + 0.004 * MESH_DEBURR_FACE_ALLOWANCE, 2);
    expect(deburr.basis).toMatch(/mesh upload — no B-rep faces/);
  });
});
