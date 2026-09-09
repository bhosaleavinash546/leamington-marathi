/**
 * A gear is a gear on both paths.
 *
 * `cad.ts` has always routed a gear straight to the gear commodity — counted
 * tip-circle teeth are not something a classifier improves on — using its own
 * inline test. `inferCommodity` had no gear branch at all, and `ROUTES` has no
 * gear entry, so on the deterministic bulk path a gear could neither be
 * inferred nor answered into: it asked "which process makes this part?" and no
 * option fitted. The browser costed the part; the bulk run refused it.
 *
 * The test now lives in one place, `looksLikeGear`, and both call it. These
 * assertions are about that agreement, because a second copy is how the two
 * drifted apart the first time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { looksLikeGear, inferCommodity, COMMODITY_DECISION_ID } from '../src/engine/cost-input-rules/derive/commodity.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';

const CAD_TS = resolve(__dirname, '..', 'server', 'routes', 'cad.ts');

/** Geometry that is decisively a gear by metrology, or decisively not. */
function geo(o: { likelyGear?: boolean; teeth?: number; fillRatio?: number }): OCCTGeometry {
  return {
    status: 'success',
    boundingBox: { xMm: 120, yMm: 120, zMm: 30 },
    fillRatio: o.fillRatio ?? 0.6169,
    volume: { mm3: 265_959, cm3: 265.959 },
    ...(o.likelyGear === undefined ? {} : { gear: { likelyGear: o.likelyGear, teeth: o.teeth } }),
  } as unknown as OCCTGeometry;
}

const ctx = (g: OCCTGeometry, filename: string, answers: Record<string, unknown> = {}): RuleContext => ({
  geo: g, geometryQuality: 'occt', commodity: 'machining', commoditySource: 'engineer',
  annualVolume: 50_000, filename, answers,
});

describe('counted teeth decide it', () => {
  it('routes a measured gear without being told', () => {
    const v = inferCommodity(ctx(geo({ likelyGear: true, teeth: 38 }), 'part-4471.step'));
    expect(v.commodity).toBe('gear');
    expect(v.basis).toMatch(/counted 38 teeth/);
    expect(v.decision, 'it should not also ask').toBeUndefined();
  });

  it('routes on a filename when metrology is silent', () => {
    for (const name of ['ring_gear.step', 'PINION-12.stp', 'idler gear.step', 'gear_blank.stp']) {
      expect(looksLikeGear({}, name).gear, name).toBe(true);
    }
  });

  it('does not see a gear in an ordinary name', () => {
    for (const name of ['gearbox_housing.step', 'bracket.stp', 'Casting_Braket.stp']) {
      // "gearbox" is a housing, not a gear — \bgears?\b must not match inside it.
      expect(looksLikeGear({}, name).gear, name).toBe(false);
    }
  });

  it('asks, as before, when the part is neither', () => {
    // A 62%-fill blank with no teeth and no gear name is the fill ladder's top
    // rung, which names two routes. Adding the gear branch must not have turned
    // that honest question into a guess.
    const v = inferCommodity(ctx(geo({ likelyGear: false, fillRatio: 0.6169 }), 'blank-90.step'));
    expect(v.commodity).toBeUndefined();
    expect(v.decision!.id).toBe(COMMODITY_DECISION_ID);
  });
});

describe('an engineer still outranks the measurement', () => {
  it('honours an answered route over the counted teeth', () => {
    // This is the existing contract — "chosen by the engineer" wins — and it is
    // pinned here because it has a sharp edge on the bulk path: a BASKET-wide
    // `--answer commodity.route=machining` applies to every part in the run, so
    // a gear swept up in it is costed as a machined blank (£10.24 against
    // £25.50 for the same part routed as a gear). That is the engineer's
    // instruction being obeyed, not a misroute — but it is worth knowing about
    // before answering a mixed basket, and a per-part `commodity` column or a
    // per-part answer is the way to avoid it.
    const v = inferCommodity(ctx(geo({ likelyGear: true, teeth: 38 }), 'gear.step',
                                 { [COMMODITY_DECISION_ID]: 'machining' }));
    expect(v.commodity).toBe('machining');
    expect(v.basis).toBe('chosen by the engineer');
  });
});

describe('the two paths share one test', () => {
  it('cad.ts calls the shared predicate rather than keeping a copy', () => {
    if (!existsSync(CAD_TS)) return;
    const src = readFileSync(CAD_TS, 'utf8');
    expect(src, 'cad.ts should import looksLikeGear').toMatch(/looksLikeGear/);
    // The inline regex that used to live here is what drifted. If it comes
    // back, so does the disagreement.
    expect(src, 'the inline gear regex should be gone').not.toMatch(/\\bgears\?\\b\|\\bpinion\\b/);
  });

  it('agrees with cad.ts on the cases cad.ts used to decide alone', () => {
    // cad.ts routed on (named || measured). Both now come from one function, so
    // the deterministic path reaches the same verdict for each.
    for (const [g, name, want] of [
      [geo({ likelyGear: true, teeth: 38 }), 'anonymous.step', true],
      [geo({ likelyGear: false }), 'ring_gear.step', true],
      [geo({ likelyGear: false }), 'housing.step', false],
    ] as [OCCTGeometry, string, boolean][]) {
      expect(looksLikeGear(g as { gear?: { likelyGear?: boolean } }, name).gear, name).toBe(want);
    }
  });
});

describe('the real gear fixture', () => {
  const FIXTURE = join(__dirname, 'fixtures', 'real-parts-baseline.json');

  it('is routed by metrology, not by a stated commodity', () => {
    if (!existsSync(FIXTURE)) return;
    const baseline = JSON.parse(readFileSync(FIXTURE, 'utf8')) as
      { part: string; commodity?: string; geometry: OCCTGeometry; outcome: { commodity?: string } }[];
    const g = baseline.find(b => b.part === 'test-gear-m3-z38.step');
    if (!g) return;
    expect(g.commodity, 'the baseline should no longer need to state it').toBeUndefined();
    expect(g.outcome.commodity).toBe('gear');
    expect(inferCommodity(ctx(g.geometry, g.part)).commodity).toBe('gear');
  });
});
