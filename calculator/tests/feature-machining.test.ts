import { describe, it, expect } from 'vitest';
import { computeFeatureMachining, featureMinutesEach, defaultInclude } from '../src/engine/feature-machining.js';
import type { FeatureRow } from '../src/engine/feature-ops.js';

const HOLES: FeatureRow[] = [
  { kind: 'hole', diaMm: 6, depthMm: 10, through: true, count: 8 },   // small through drills
  { kind: 'hole', diaMm: 16, depthMm: 20, through: false, count: 2 }, // blind bore (drill+ream)
];
const WITH_BOSS: FeatureRow[] = [
  ...HOLES,
  { kind: 'boss', diaMm: 40, depthMm: 25, through: null, count: 1 },  // turned boss
];

describe('computeFeatureMachining', () => {
  it('costs holes by default and excludes bosses (auto confidence)', () => {
    const r = computeFeatureMachining(WITH_BOSS, { machineId: 'mach-vmc3', labourId: 'lab-uk-skilled' });
    // 8 + 2 holes counted; the boss (count 1) is NOT auto-included
    expect(r.featureCount).toBe(10);
    expect(r.operations).toHaveLength(1);
    expect(r.operations[0].cycleTimeHr).toBeGreaterThan(0);
    expect(r.operations[0].operationName).toMatch(/geometry-measured/);
    const boss = r.lines.find(l => l.kind === 'boss')!;
    expect(boss.autoIncluded).toBe(false);
    expect(boss.included).toBe(false);
  });

  it('cycle time = sum of per-feature minutes / 60', () => {
    const r = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l' });
    const expectedMin =
      featureMinutesEach(HOLES[0]) * 8 + featureMinutesEach(HOLES[1]) * 2;
    expect(r.totalCycleHr).toBeCloseTo(expectedMin / 60, 5);
  });

  it('near-net (default) removes NO material — machining time only', () => {
    const r = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l' });
    expect(r.materialRemovedKg).toBe(0);
  });

  it('solid billet charges the feature volume as removed metal', () => {
    const r = computeFeatureMachining(HOLES, {
      machineId: 'm', labourId: 'l', stockCondition: 'solid_billet', densityKgPerCm3: 0.0078,
    });
    expect(r.materialRemovedKg).toBeGreaterThan(0);
  });

  it('includeFlags override lets the engineer confirm/deny per feature', () => {
    // include ONLY the boss (index 2), exclude both hole rows
    const r = computeFeatureMachining(WITH_BOSS, {
      machineId: 'm', labourId: 'l', includeFlags: [false, false, true],
    });
    expect(r.featureCount).toBe(1);            // just the boss
    expect(r.operations[0].operationName).toMatch(/Ø40/);
  });

  it('blind holes cost more than through holes of the same size', () => {
    const through = featureMinutesEach({ kind: 'hole', diaMm: 10, depthMm: 20, through: true, count: 1 });
    const blind = featureMinutesEach({ kind: 'hole', diaMm: 10, depthMm: 20, through: false, count: 1 });
    expect(blind).toBeGreaterThan(through);
  });

  it('larger bores cost more per unit depth (drill+ream vs drill)', () => {
    const drill = featureMinutesEach({ kind: 'hole', diaMm: 8, depthMm: 20, through: true, count: 1 });
    const bore = featureMinutesEach({ kind: 'hole', diaMm: 20, depthMm: 20, through: false, count: 1 });   // blind bore: drill + ream
    expect(bore).toBeGreaterThan(drill);
  });

  it('empty / no features → no operations, zero cost', () => {
    expect(computeFeatureMachining([], { machineId: 'm', labourId: 'l' }).operations).toHaveLength(0);
    expect(computeFeatureMachining(undefined, { machineId: 'm', labourId: 'l' }).featureCount).toBe(0);
  });

  it('finishFactor scales machining time (precision/ground features)', () => {
    const base = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l' }).totalCycleHr;
    const precise = computeFeatureMachining(HOLES, { machineId: 'm', labourId: 'l', finishFactor: 1.6 }).totalCycleHr;
    expect(precise).toBeCloseTo(base * 1.6, 5);
  });

  it('defaultInclude: near-net → holes in, bosses out', () => {
    expect(defaultInclude({ kind: 'hole', diaMm: 5, depthMm: 5, through: true, count: 1 })).toBe(true);
    expect(defaultInclude({ kind: 'boss', diaMm: 5, depthMm: 5, through: null, count: 1 })).toBe(false);
  });

  it('defaultInclude: solid-billet → EVERY machinable feature is costed', () => {
    const s = 'solid_billet' as const;
    expect(defaultInclude({ kind: 'hole',   diaMm: 5, depthMm: 5, through: true, count: 1 }, s)).toBe(true);
    expect(defaultInclude({ kind: 'boss',   diaMm: 5, depthMm: 5, through: null, count: 1 }, s)).toBe(true);
    expect(defaultInclude({ kind: 'face',   diaMm: 0, depthMm: 0, through: null, count: 1, areaMm2: 5000 }, s)).toBe(true);
    expect(defaultInclude({ kind: 'pocket', diaMm: 0, depthMm: 8, through: null, count: 1, areaMm2: 2000 }, s)).toBe(true);
    expect(defaultInclude({ kind: 'slot',   diaMm: 0, depthMm: 6, through: null, count: 1, areaMm2: 900 }, s)).toBe(true);
  });

  it('solid-billet auto-costs faces + pockets (no manual ticking needed) — fixes the machining under-count', () => {
    const FACE: FeatureRow = { kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 1, areaMm2: 8000 };
    const POCKET: FeatureRow = { kind: 'pocket', diaMm: 0, depthMm: 12, through: null, count: 1, areaMm2: 3000 };
    const rows: FeatureRow[] = [
      { kind: 'hole', diaMm: 10, depthMm: 20, through: true, count: 4 },
      FACE, POCKET,
    ];
    // near-net: the 4 holes AND the face auto-cost; the pocket needs confirming
    const near = computeFeatureMachining(rows, { machineId: 'm', labourId: 'l' });
    expect(near.featureCount).toBe(5);
    // solid-billet: holes + face + pocket all auto-cost
    const billet = computeFeatureMachining(rows, { machineId: 'm', labourId: 'l', stockCondition: 'solid_billet' });
    expect(billet.featureCount).toBe(6);
    expect(billet.totalCycleHr).toBeGreaterThan(near.totalCycleHr);
  });
});

describe('Phase 2 — compound machining features (facing, pockets)', () => {
  const FACE: FeatureRow = { kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 1, areaMm2: 8000 };
  const POCKET: FeatureRow = { kind: 'pocket', diaMm: 0, depthMm: 12, through: null, count: 1, areaMm2: 3000 };

  it('face is costed by passes of the catalogue face mill over its length, not by diameter', () => {
    const m = featureMinutesEach(FACE);
    // Aluminium (TungAlu-Mill, data.json #13): vc 1000, fz 0.2; √8000 = 89.4 mm wide > 0.7 × Ø100 = 70 → the Ø100 z6
    // body, 2 passes; n = 1000 × 1000 / (π × 100) = 3,183 rev/min, vf = 3,183 × 6 × 0.2 = 3,820 mm/min;
    // 0.20 positioning + 2 × (89.4 + 100 + 2 × 5) / 3,820 = 0.20 + 0.104 = 0.304 min (it was 0.20 + 8000/8000 = 1.2).
    const vf = 1000 * 1000 / (Math.PI * 100) * 6 * 0.2;
    expect(m).toBeCloseTo(0.20 + 2 * (Math.sqrt(8000) + 100 + 10) / vf, 6);
  });

  it('pocket is costed by removed volume at the roughing rate + walls at the side-pass rate', () => {
    const m = featureMinutesEach(POCKET);
    // 36 cm³ ÷ (534.8 in-cut ÷ 1.25 air = 427.8 cm³/min) + 4 × √3000 × 12 / 100 = 26.3 cm² of wall ÷ (2 mm ap (the
    // TungAlu max) × Ø50 z4 at vc 1000, fz 0.2 = 5,093 mm/min → 101.9 cm²/min) + 0.30 allowance
    const rough = 36 / 427.8;
    const wall = 4 * Math.sqrt(3000) * 12 / 100 / (2 * (1000 * 1000 / (Math.PI * 50)) * 4 * 0.2 / 100);
    expect(m).toBeCloseTo(0.30 + rough + wall, 4);
  });

  it('faces are ON by default; pockets stay off (engineer confirms recesses)', () => {
    // Policy change, measured: the real steering knuckle has 99 planar faces —
    // mounting pads and bearing datums — and with faces off it costed 0.18 hr
    // of machining and landed −25% against its manual. A near-net casting's
    // large flats exist to be faced; recesses may genuinely be as-cast.
    expect(defaultInclude(FACE)).toBe(true);
    expect(defaultInclude(POCKET)).toBe(false);
    const r = computeFeatureMachining([FACE, POCKET], { machineId: 'm', labourId: 'l' });
    expect(r.featureCount).toBe(1); // the face, not the pocket
  });

  it('confirming a face + pocket adds a facing + pocket-milling op with real time', () => {
    const r = computeFeatureMachining([FACE, POCKET], { machineId: 'm', labourId: 'l', includeFlags: [true, true] });
    expect(r.featureCount).toBe(2);
    expect(r.totalCycleHr).toBeGreaterThan(0);
    expect(r.summary).toMatch(/face 8000mm²/);
    expect(r.summary).toMatch(/pocket 3000mm²×12/);
  });

  it('facing removes no metal (skim); a solid-billet pocket removes its floor×depth volume', () => {
    const face = computeFeatureMachining([FACE], { machineId: 'm', labourId: 'l', includeFlags: [true], stockCondition: 'solid_billet', densityKgPerCm3: 0.0078 });
    expect(face.materialRemovedKg).toBe(0);                 // facing skims
    const pk = computeFeatureMachining([POCKET], { machineId: 'm', labourId: 'l', includeFlags: [true], stockCondition: 'solid_billet', densityKgPerCm3: 0.0078 });
    expect(pk.materialRemovedKg).toBeCloseTo((3000 * 12 / 1000) * 0.0078, 3);
  });
});
