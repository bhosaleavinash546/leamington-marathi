/**
 * Fixes from the live CAD-to-Cost audit (real parts, China, 200k/yr, mode=both).
 *
 * Every test reproduces a defect observed in a LIVE run — see cad-audit/FINDINGS.md
 * for the captures. The reproducing part is named on each test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { enforceGeometryCommodity, normalizeCADAnalysis } from '../server/routes/cad.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import { gaugeMm, blankDims } from '../src/engine/cost-input-rules/commodities/sheet-metal.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { resolveFormMaterialId } from '../src/engine/material-family.js';

function geo(over: Partial<OCCTGeometry> & {
  fillRatio?: number; maxDimMm?: number; wallMm?: number | null;
}): OCCTGeometry {
  const { fillRatio = 0.5, maxDimMm = 500, wallMm = null, ...rest } = over;
  return {
    status: 'success',
    boundingBox: { xMm: maxDimMm, yMm: maxDimMm * 0.8, zMm: maxDimMm * 0.65 },
    fillRatio,
    wallThickness: wallMm == null ? undefined
      : { minMm: wallMm * 0.4, maxMm: wallMm * 2, meanMm: wallMm, stdDevMm: 0, sampleCount: 20, method: 'ray_cast', uniformity: 'uniform' },
    ...rest,
  } as unknown as OCCTGeometry;
}

// ── F2: forced plastic commodity must never take a metal weight ──────────────
describe('normalizeCADAnalysis — forced plastic commodity picks the plastic mass (BUMPER.stp live run)', () => {
  // Live capture: BUMPER.stp forced injection_moulding; the AI returned no
  // material and no recommendedCommodity, and netWeightKg came out 5.5617 —
  // the measured ALUMINIUM mass. The plastic mass is 2.1629 kg.
  const weights = { aluminum: 5.5617, steel: 16.1702, plastic: 2.1629, castIron: 14.7283 };

  it('uses the plastic family mass when the SELECTED commodity is a moulding, even if the AI left recommendedCommodity empty', () => {
    const a: Record<string, unknown> = {
      costInputSuggestions: { netWeightKg: 5.5617 },
      geometry: { estimatedWeightKg: weights },
    };
    normalizeCADAnalysis(a, undefined, 'injection_moulding');
    const ci = a.costInputSuggestions as { netWeightKg: number };
    expect(ci.netWeightKg).toBeCloseTo(2.1629, 3);
  });

  it('still respects the AI recommendedCommodity when no forced commodity is given', () => {
    const a: Record<string, unknown> = {
      costInputSuggestions: { netWeightKg: 5.5617, recommendedCommodity: 'blow_moulding' },
      geometry: { estimatedWeightKg: weights },
    };
    normalizeCADAnalysis(a, undefined, undefined);
    const ci = a.costInputSuggestions as { netWeightKg: number };
    expect(ci.netWeightKg).toBeCloseTo(2.1629, 3);
  });
});

// ── F3: chunky solid must not stay classified sheet metal ────────────────────
describe('enforceGeometryCommodity — a thick near-net solid is not sheet metal (PRCR002 stub axle live run)', () => {
  it('overrides sheet_metal for a part with 15 mm mean wall (the forged stub axle)', () => {
    // Real measured values from PRCR002.stp: fill 0.0923, mean wall 15.14 mm.
    const r = enforceGeometryCommodity('sheet_metal', geo({ fillRatio: 0.0923, wallMm: 15.14, maxDimMm: 277 }));
    expect(r.corrected).toBe(true);
    expect(r.commodity).not.toBe('sheet_metal');
    expect(r.reason).toMatch(/wall/i);
  });

  it('leaves a genuine stamped bracket alone (1.5 mm mean wall)', () => {
    // Real measured values from Seat_Locking_Bracket.stp.
    const r = enforceGeometryCommodity('sheet_metal', geo({ fillRatio: 0.0397, wallMm: 1.55, maxDimMm: 256 }));
    expect(r.corrected).toBe(false);
  });

  it('does not let the FORWARD bend signal reclassify a chunky casting to sheet metal', () => {
    // Live run: stage-1 correctly said casting for the stub axle, then the bend
    // detector read the forging's fillets as "25 bends at 0.45 mm gauge" and
    // reclassified it to sheet_metal — against a measured 34.1 mm mean wall.
    const chunky = geo({ fillRatio: 0.0923, wallMm: 34.1, maxDimMm: 277 });
    (chunky as unknown as { sheetMetal: unknown }).sheetMetal =
      { bendCount: 25, totalBendLengthMm: 774.5, thicknessMm: 0.45 };
    const r = enforceGeometryCommodity('casting', chunky);
    expect(r.commodity).not.toBe('sheet_metal');
  });

  it('still lets the bend signal rescue a real stamped panel misclassified as casting', () => {
    const panel = geo({ fillRatio: 0.04, wallMm: 1.6, maxDimMm: 256 });
    (panel as unknown as { sheetMetal: unknown }).sheetMetal =
      { bendCount: 4, totalBendLengthMm: 400, thicknessMm: 1.5 };
    const r = enforceGeometryCommodity('casting', panel);
    expect(r.corrected).toBe(true);
    expect(r.commodity).toBe('sheet_metal');
  });
});

// ── F4: sheet-metal gauge must be mass-consistent ────────────────────────────
describe('sheet-metal gaugeMm — the blank must outweigh the part (Seat_Locking_Bracket live run)', () => {
  // Live capture: bend-derived gauge 0.53 mm on a 0.558 kg steel bracket with a
  // 269×237 blank → blank 0.265 kg, utilisation 210%. Physically impossible.
  const ctx = {
    geo: {
      status: 'success',
      boundingBox: { xMm: 255.77, yMm: 226.07, zMm: 31.0 },
      volume: { cm3: 71.066, mm3: 71066 },
      sheetMetal: { bendCount: 4, thicknessMm: 0.53 },
      wallThickness: { minMm: 0.53, maxMm: 3.1, meanMm: 1.55, stdDevMm: 0.4, sampleCount: 40, method: 'ray_cast', uniformity: 'variable' },
    },
    geometryQuality: 'occt',
    commodity: 'sheet_metal',
    commoditySource: 'engineer',
    annualVolume: 200000,
    filename: 'Seat_Locking_Bracket.stp',
    answers: { 'material.family': 'steel' },
  } as unknown as RuleContext;

  it('raises an impossibly thin bend-read gauge to the mass-consistent floor', () => {
    const g = gaugeMm(ctx);
    expect(g).not.toBeNull();
    const b = blankDims(ctx)!;
    const blankKg = b.lengthMm * b.widthMm * g!.mm * 7.85e-6;
    const netKg = 71.066 * 7.85 / 1000;             // 0.558 kg
    // The invariant: you cannot stamp a part heavier than its blank.
    expect(blankKg).toBeGreaterThanOrEqual(netKg * 0.999);
    expect(g!.basis).toMatch(/mass/i);              // the correction is declared
  });

  it('leaves a plausible gauge alone (blank already heavier than part)', () => {
    const ok = {
      ...(ctx as unknown as Record<string, unknown>),
      geo: { ...(ctx as unknown as { geo: Record<string, unknown> }).geo, sheetMetal: { bendCount: 4, thicknessMm: 1.5 } },
    } as unknown as RuleContext;
    const g = gaugeMm(ok);
    expect(g!.mm).toBeCloseTo(1.5, 2);
  });
});

// ── F5: the prompt must not teach invented material ids ──────────────────────
describe('CAD prompt material ids — every example id exists in the rate library (mat-hss live run)', () => {
  it('every quoted mat- id in server/routes/cad.ts is a real library id', () => {
    const src = readFileSync(new URL('../server/routes/cad.ts', import.meta.url), 'utf8');
    // Only string literals, per line (comments and regex prefixes are not ids).
    const quoted = src.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .flatMap(l => [...l.matchAll(/'([^']*)'/g)].flatMap(m => m[1].match(/mat-[a-z0-9-]+/g) ?? []));
    const ids = [...new Set(quoted)].filter(id => id !== 'mat-gjl'); // regex prefix
    const known = new Set(DEFAULT_RATE_LIBRARY.materials.map(m => m.id));
    const invented = ids.filter(id => !known.has(id));
    expect(invented).toEqual([]);
  });
});

// ── F1: the browser material hand-off must resolve family tokens and unknown ids ──
describe('resolveFormMaterialId — family tokens and invented ids resolve to a real grade (flange live run)', () => {
  const known = new Set(DEFAULT_RATE_LIBRARY.materials.map(m => m.id));

  it("resolves the family token 'steel' (what the rules emit) to a real steel grade", () => {
    const id = resolveFormMaterialId('steel', 'machining', known);
    expect(id).toBeTruthy();
    expect(known.has(id!)).toBe(true);
  });

  it("resolves the invented id 'mat-hss' to a real steel grade", () => {
    const id = resolveFormMaterialId('mat-hss', 'sheet_metal', known);
    expect(id).toBeTruthy();
    expect(known.has(id!)).toBe(true);
  });

  it('passes a real library id through unchanged', () => {
    const real = DEFAULT_RATE_LIBRARY.materials[0].id;
    expect(resolveFormMaterialId(real, 'machining', known)).toBe(real);
  });

  it('returns null when nothing can be resolved, so the caller can surface it instead of silently defaulting', () => {
    expect(resolveFormMaterialId('unobtainium', 'machining', known)).toBeNull();
  });
});
