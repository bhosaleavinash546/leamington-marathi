/**
 * An STL upload must not 500.
 *
 * `.stl` is on the file input and CLAUDE.md documents it as the pure-TS fast
 * path, so uploading one is an ordinary action — and it returned
 * "CAD analysis failed: Cannot read properties of undefined (reading
 * 'cylindricalFaceCount')" in BOTH modes. `buildPrompt` runs before the mode
 * branch and asserted `geo.features!`, `geo.faces!` and `geo.edges!`, none of
 * which a triangle mesh has. Guarding one site was not enough: there were two,
 * and the second only surfaced once the first was fixed.
 *
 * Nothing here needs a geometry kernel — that is the point of the STL path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSTL } from '../server/services/stl-parser.js';
import { buildPrompt } from '../server/routes/cad.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

process.env.AIR_GAPPED = '1';

const FIXTURE = join(__dirname, 'fixtures', 'cad-parts', 'block-2holes.stl');
// The same block as block-2holes.step, tessellated by the app's own
// /api/cad/tessellate. cad-audit/truth puts the STEP at 44.858 cm³.
const STEP_TRUTH_CM3 = 44.858;

/** The shim `cad.ts` builds from an STL: mass properties, no topology. */
function stlGeometry(): OCCTGeometry {
  const stl = parseSTL(readFileSync(FIXTURE));
  const bb = stl.boundingBox;
  return {
    status: 'success',
    volume: { mm3: stl.volume * 1000, cm3: stl.volume },
    surfaceArea: { mm2: stl.surfaceArea * 100, cm2: stl.surfaceArea },
    boundingBox: { xMm: bb.xSpan, yMm: bb.ySpan, zMm: bb.zSpan },
    fillRatio: (stl.volume * 1000) / (bb.xSpan * bb.ySpan * bb.zSpan),
    weights: {
      aluminiumKg: stl.volume * 2.7e-3, steelKg: stl.volume * 7.85e-3,
      castIronKg: stl.volume * 7.15e-3, plasticKg: stl.volume * 1.05e-3,
      copperKg: stl.volume * 8.96e-3, titaniumKg: stl.volume * 4.43e-3,
    },
    // features / faces / edges deliberately absent — a mesh has no B-rep.
  } as unknown as OCCTGeometry;
}

describe('the mesh is measured correctly', () => {
  it('parses and agrees with the STEP it was tessellated from', () => {
    expect(existsSync(FIXTURE), 'the STL fixture should be committed').toBe(true);
    const stl = parseSTL(readFileSync(FIXTURE));
    expect(stl.triangleCount).toBeGreaterThan(100);
    // Tessellation loses a little volume on curved faces; a tenth of a percent
    // is the expected order. Anything larger is a parser fault, not faceting.
    const errPct = Math.abs(stl.volume - STEP_TRUTH_CM3) / STEP_TRUTH_CM3 * 100;
    expect(errPct, `${stl.volume} cm³ against ${STEP_TRUTH_CM3}`).toBeLessThan(0.1);
    // The envelope is exact — vertices are vertices.
    expect(stl.boundingBox.xSpan).toBeCloseTo(60, 3);
    expect(stl.boundingBox.ySpan).toBeCloseTo(40, 3);
    expect(stl.boundingBox.zSpan).toBeCloseTo(20, 3);
  });
});

describe('the prompt builder survives a geometry with no B-rep', () => {
  const geo = stlGeometry();

  it('does not throw', () => {
    // The regression, precisely: this used to raise on `features!`.
    expect(() => buildPrompt(geo, { format: 'stl', fileSizeKB: 17, summary: '' } as never,
                             'block-2holes.stl', 'machining', null)).not.toThrow();
  });

  it('states that topology is absent rather than implying none exists', () => {
    const prompt = buildPrompt(geo, { format: 'stl', fileSizeKB: 17, summary: '' } as never,
                               'block-2holes.stl', 'machining', null);
    // A silent absence reads as "prismatic, no holes, no threads" — a
    // description of a part nobody measured.
    expect(prompt).toMatch(/NO B-REP TOPOLOGY|NOT MEASURED/);
    expect(prompt).not.toMatch(/Threads detected/);
    // The measurements it DOES have must still be in there.
    expect(prompt).toContain('44.870');
  });

  it('still builds the full prompt when the B-rep is present', () => {
    const withBrep = {
      ...geo,
      features: { cylindricalFaceCount: 4, cylindricalFaceRadiiMm: [3, 6.5], estimatedHoleCount: 2,
                  holeRadiiMm: [3, 6.5], bossShaftCount: 0, bossShaftRadiiMm: [],
                  threadFeaturesDetected: true, planarFaceCount: 6, freeFormFaceCount: 0 },
      faces: { total: 10, byType: { PLANE: 6, CYLINDER: 4 } },
      edges: { total: 24, byType: { LINE: 20, CIRCLE: 4 }, sampleCircleRadiiMm: [3, 6.5] },
    } as unknown as OCCTGeometry;
    const prompt = buildPrompt(withBrep, { format: 'step', fileSizeKB: 40, summary: '' } as never,
                               'block-2holes.step', 'machining', null);
    expect(prompt).toMatch(/Threads detected/);
    expect(prompt).toMatch(/Cylindrical faces: 4/);
    expect(prompt).not.toMatch(/NO B-REP TOPOLOGY/);
  });
});

describe('a mesh still routes and still asks', () => {
  it('asks which process, because a mesh settles it no better than a solid', () => {
    const ctx: RuleContext = {
      geo: stlGeometry(), geometryQuality: 'occt', commodity: 'machining',
      commoditySource: 'engineer', annualVolume: 50_000, filename: 'block-2holes.stl', answers: {},
    };
    const v = inferCommodity(ctx);
    // 93% fill with no measured bends: the fill ladder's top rung, which names
    // more than one route. It must ask rather than pick.
    expect(v.commodity).toBeUndefined();
    expect(v.decision!.id).toBe('commodity.route');
  });
});

describe('no unguarded topology assertion is left in the route', () => {
  it('has no geo.features! / geo.faces! / geo.edges!', () => {
    // Two sites existed and fixing one moved the crash to the other, so this
    // asserts the class is gone rather than the two instances.
    const src = readFileSync(join(__dirname, '..', 'server', 'routes', 'cad.ts'), 'utf8');
    for (const bad of ['geo.features!', 'geo.faces!', 'geo.edges!']) {
      expect(src.includes(bad), `${bad} assumes a B-rep that an STL does not have`).toBe(false);
    }
  });
});
