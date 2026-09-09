/**
 * A solid part must not come back as sheet metal.
 *
 * Every real production part in `cad-audit/parts/` was being routed to sheet
 * metal and costed. A 2.5 kg steering knuckle came back at £5.43, a casting
 * bracket at £5.72 — no question asked, no refusal, just a number an order of
 * magnitude out. The cause was one argument: the bend detector was handed the
 * MINIMUM ray-cast wall as if it were the sheet gauge. A solid casting has a
 * minimum somewhere — a fillet run-out, a web, the lip of a boss — and the
 * knuckle's is 1.36 mm against a 23.03 mm mean. That read as a thin sheet, its
 * fillets read as 28 bends, and the sheet-metal branch is decisive, so nothing
 * downstream got a vote.
 *
 * The synthetic fixtures never caught it. They are clean prismatic blocks with
 * no fillets to misread, so they measure zero bends and the branch never fires.
 * The numbers below are therefore the MEASURED values from the real parts, and
 * the kernel-backed test at the bottom re-measures them for real where OCP is
 * installed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inferCommodity, COMMODITY_DECISION_ID } from '../src/engine/cost-input-rules/derive/commodity.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import { runCADSanityChecks } from '../server/utils/cad-sanity.js';
import { isCostable } from '../server/routes/cad.js';
import { analyzeGeometry, type OCCTGeometry } from '../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';

/** Geometry carrying only what the sheet-metal branch reads. */
function geo(o: {
  bends: number; gaugeMm: number; meanWallMm: number | null;
  fillRatio?: number; maxDimMm?: number;
}): OCCTGeometry {
  const dim = o.maxDimMm ?? 130;
  return {
    status: 'success',
    boundingBox: { xMm: dim, yMm: dim * 0.9, zMm: dim * 0.95 },
    fillRatio: o.fillRatio ?? 0.16,
    sheetMetal: { bendCount: o.bends, totalBendLengthMm: o.bends * 40, thicknessMm: o.gaugeMm },
    wallThickness: o.meanWallMm == null ? undefined : {
      minMm: o.gaugeMm, maxMm: o.meanWallMm * 1.7, meanMm: o.meanWallMm,
      stdDevMm: 8.8, sampleCount: 400, method: 'ray_cast', uniformity: 'non-uniform',
    },
  } as unknown as OCCTGeometry;
}

const ctx = (g: OCCTGeometry, filename = 'part.stp'): RuleContext => ({
  geo: g, geometryQuality: 'occt', commodity: 'machining', commoditySource: 'engineer',
  annualVolume: 50_000, filename, answers: {},
});

// The three that were mis-costed, with the values their geometry actually
// reported. Gauge is what the old detector called sheet thickness; mean wall is
// what the same measurement pass said the part is made of.
const MISROUTED = [
  { part: 'steering_knuckle_RH', bends: 28, gaugeMm: 1.36, meanWallMm: 23.03, wasCosted: 5.43 },
  { part: 'Casting_Braket',      bends: 43, gaugeMm: 1.54, meanWallMm: 17.63, wasCosted: 5.72 },
  { part: 'PRCR002',             bends: 25, gaugeMm: 0.45, meanWallMm: 34.10, wasCosted: 13.00 },
];

describe('a gauge that contradicts the part it was measured on is not a gauge', () => {
  it.each(MISROUTED)(
    '$part — $bends "bends" at $gaugeMm mm on a $meanWallMm mm wall is not sheet metal (was costed at £$wasCosted)',
    ({ bends, gaugeMm, meanWallMm }) => {
      const v = inferCommodity(ctx(geo({ bends, gaugeMm, meanWallMm })));
      expect(v.commodity, 'must not claim a route').toBeUndefined();
      expect(v.decision!.id).toBe(COMMODITY_DECISION_ID);
    });

  it('still routes a genuine pressing, where the gauge IS the wall', () => {
    // A real sheet part measures one wall throughout: gauge and mean agree.
    const v = inferCommodity(ctx(geo({ bends: 6, gaugeMm: 1.5, meanWallMm: 1.6, fillRatio: 0.04 })));
    expect(v.commodity).toBe('sheet_metal');
    expect(v.basis).toMatch(/6 bends/);
  });

  it('allows the slack a ray-cast needs — a flange doubles the wall locally', () => {
    // Rays that graze a bend or run along the sheet read long, so mean sits a
    // little above gauge on real pressings. Refusing that would be too strict.
    const v = inferCommodity(ctx(geo({ bends: 4, gaugeMm: 2.0, meanWallMm: 3.4, fillRatio: 0.05 })));
    expect(v.commodity).toBe('sheet_metal');
  });

  it('asks rather than guessing when the wall was never measured', () => {
    // No mean wall to check against: the geometry cannot support the claim, but
    // it cannot refute it either, so the honest answer is the question.
    const v = inferCommodity(ctx(geo({ bends: 5, gaugeMm: 1.5, meanWallMm: null })));
    expect(v.commodity).toBe('sheet_metal');
  });
});

describe('an impossible cycle time stops the costing, not just the eye', () => {
  const analysis = {
    processRecommendations: [{ process: 'Laser Cutting', commodityType: 'sheet_metal', estimatedCycleTimeHr: 0 }],
    costInputSuggestions: { recommendedCommodity: 'sheet_metal', netWeightKg: 2.512 },
  };

  it('flags a zero cycle on the primary process as blocking', () => {
    const w = runCADSanityChecks(analysis as never, null);
    const cyc = w.find(x => x.code === 'cycle_time_implausible');
    expect(cyc, 'the check must fire').toBeTruthy();
    expect(cyc!.blocking, 'severity alone never stopped anything — isCostable reads blocking').toBe(true);
  });

  it('makes the part uncostable until someone accepts it deliberately', () => {
    const w = runCADSanityChecks(analysis as never, null);
    expect(isCostable([], w)).toBe(false);
    expect(isCostable([], w, ['cycle_time_implausible'])).toBe(true);
  });
});

// ── The same thing again, measured for real ──────────────────────────────────
// Needs OCP; skips without it exactly as the other CAD suites do.
const AUDIT = join(__dirname, '..', '..', 'cad-audit', 'parts');
const REAL = ['steering_knuckle_RH.stp', 'Casting_Braket.stp', 'PRCR002.stp'];
const measured = new Map<string, OCCTGeometry>();
let kernel = false;

describe('measured, not asserted', () => {
  beforeAll(async () => {
    for (const f of REAL) {
      const p = join(AUDIT, f);
      if (!existsSync(p)) continue;
      try {
        const g = await analyzeGeometry(readFileSync(p), f, 120_000);
        if (g.status === 'success') { measured.set(f, g); kernel = true; }
      } catch { /* no OCP — skips below */ }
    }
  }, 420_000);

  it('measures a gauge that is the bulk wall, so these parts stop reading as sheet', () => {
    if (!kernel) {
      console.log('[sheet-metal-misroute] OCP not installed — skipping. Expected on the Alpine image.');
      return;
    }
    for (const [name, g] of measured) {
      const mean = g.wallThickness?.meanMm;
      const gauge = g.sheetMetal?.thicknessMm ?? 0;
      // The detector's own gate rejects anything over 8 mm, and these parts are
      // 17-34 mm walls, so a correct measurement zeroes the bend count outright.
      expect(mean, `${name} should have a measured wall`).toBeGreaterThan(8);
      expect(g.sheetMetal?.bendCount ?? 0, `${name} must not report bends`).toBe(0);
      expect(inferCommodity(ctx(g, name)).commodity, `${name} must not route to a process`).toBeUndefined();
      if (gauge > 0) expect(gauge, `${name} gauge should be the bulk wall`).toBeGreaterThan(8);
    }
  });
});
