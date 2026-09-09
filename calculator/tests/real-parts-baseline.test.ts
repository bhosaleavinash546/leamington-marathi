/**
 * What the tool does to the real production parts, pinned.
 *
 * The suite had 2,185 passing tests while a steering knuckle costed at £5.43.
 * Not because the tests were weak — because every test that costs a part costs
 * a *synthetic* one, and the bug only fired on real CAD, where fillets were
 * misread as press-brake bends. Four production parts routed to laser cutting
 * and nothing went red. This is the check that would have caught it.
 *
 * Two tiers, and the split is deliberate:
 *
 *   1. REPLAY, everywhere. The baseline carries the measured geometry, so the
 *      routing and costing run in ordinary CI where there is no geometry
 *      kernel. It goes through `costMeasuredPart` — the product's own chain; a
 *      test that re-implemented the chain would drift from it and prove
 *      nothing. This tier catches anything that changes what the rules DO with
 *      a measurement: a route, a question, a guard, a bucket, a total.
 *
 *   2. RE-MEASURE, where OCP is installed. Fresh geometry against the recorded
 *      geometry. This is the tier that catches the sheet-metal bug: it was in
 *      the Python measurement, and reverting that fix fails this tier with
 *      "43 bends at 1.54 mm on a part whose bulk wall is 10.19 mm". Skips
 *      without the kernel, as the other CAD suites do.
 *
 * Note what tier 1 canNOT catch, so nobody trusts it for more than it does:
 * the defence-in-depth guard in `inferCommodity` is unreachable from THIS
 * baseline, because correctly measured geometry reports zero bends on a solid
 * and the sheet branch is never entered. That guard exists for cached and
 * older-engine geometry, and it is pinned in `tests/sheet-metal-misroute.test.ts`
 * against the values the parts reported BEFORE the fix. The two files cover the
 * two halves; neither covers both.
 *
 * WHEN THIS FAILS it is not necessarily wrong — it means a real part moved.
 * Read the diff. If the move is intended:
 *
 *     npx tsx scripts/real-parts-baseline.ts --update
 *
 * and put the reason in the commit message. The point is that a person looks.
 *
 * WHAT IT IS NOT: accuracy. None of these numbers has been compared with a
 * price JLR paid. It pins what the tool says, not what is true.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeGeometry, type OCCTGeometry } from '../server/utils/geometry-bridge.js';
import { BASELINE, PARTS_DIR, outcomeFor, type PartBaseline } from '../scripts/real-parts-baseline.js';

process.env.AIR_GAPPED = '1';

const baseline: PartBaseline[] = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as PartBaseline[])
  : [];

describe('the baseline itself', () => {
  it('covers the real parts', () => {
    expect(baseline.length, 'no baseline — run scripts/real-parts-baseline.ts --update').toBeGreaterThan(0);
  });

  it('was taken from the files still in the repository', () => {
    // A recorded outcome belongs to a specific STEP file. If someone replaces a
    // part with a different model of the same name, every assertion below would
    // still pass while measuring something else.
    for (const b of baseline) {
      const p = join(PARTS_DIR, b.part);
      if (!existsSync(p)) { console.log(`[baseline] ${b.part} is gone — skipping`); continue; }
      const sha = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
      expect(sha, `${b.part} has changed since the baseline was taken`).toBe(b.sha256);
    }
  });

  it('records why each answer was given', () => {
    // The answers are engineering judgements, not measurements. An unexplained
    // one cannot be argued with, and the whole file is meant to be arguable.
    for (const b of baseline) {
      expect(b.note.length, `${b.part} has no note`).toBeGreaterThan(20);
      expect(Object.keys(b.answers).length, `${b.part} has no answers`).toBeGreaterThan(0);
    }
  });
});

describe('replaying the recorded geometry — no kernel needed', () => {
  it.each(baseline.map(b => ({ part: b.part, b })))(
    '$part lands where it did', async ({ b }) => {
      const now = await outcomeFor(join(PARTS_DIR, b.part), b.geometry, b.answers, b.commodity);

      // Route and status first: these are the categorical facts, and the
      // sheet-metal bug was a route change. A cost that moved is a number to
      // argue about; a route that moved is a different part.
      expect(now.status, `${b.part}: status moved`).toBe(b.outcome.status);
      expect(now.commodity, `${b.part}: route moved`).toBe(b.outcome.commodity);
      expect(now.code, `${b.part}: refusal reason moved`).toBe(b.outcome.code);
      expect(now.questions ?? [], `${b.part}: the open questions moved`).toEqual(b.outcome.questions ?? []);
      expect(now.warnings ?? [], `${b.part}: the geometry warnings moved`).toEqual(b.outcome.warnings ?? []);

      // Then the money, to the penny. The engine is deterministic, so anything
      // at all is a real change — there is no float noise to allow for.
      if (b.outcome.total == null) {
        expect(now.total, `${b.part}: now has a cost where it had none`).toBeUndefined();
      } else {
        expect(now.total, `${b.part}: £${now.total} against a baseline of £${b.outcome.total}`)
          .toBe(b.outcome.total);
        expect(now.breakdown, `${b.part}: a bucket moved`).toEqual(b.outcome.breakdown);
      }
    });
});

// ── Re-measure, where the kernel is installed ───────────────────────────────
describe('re-measuring the parts', () => {
  const fresh = new Map<string, OCCTGeometry>();
  let kernel = false;

  beforeAll(async () => {
    for (const b of baseline) {
      const p = join(PARTS_DIR, b.part);
      if (!existsSync(p)) continue;
      try {
        const g = await analyzeGeometry(readFileSync(p), b.part, 300_000);
        if (g.status === 'success') { fresh.set(b.part, g); kernel = true; }
      } catch { /* no OCP — skips below */ }
    }
  }, 600_000);

  it('measures what it measured before', () => {
    if (!kernel) {
      console.log('[baseline] OCP not installed — replay only. Expected on the Alpine image.');
      return;
    }
    for (const b of baseline) {
      const g = fresh.get(b.part);
      if (!g) continue;
      const was = b.geometry;

      // Volume is the anchor: every mass, and therefore the material bucket,
      // comes off it. Exact — the kernel is pinned in requirements.txt.
      expect(g.volume?.cm3, `${b.part}: volume moved`).toBeCloseTo(was.volume?.cm3 ?? 0, 3);
      expect(g.surfaceArea?.cm2, `${b.part}: surface area moved`).toBeCloseTo(was.surfaceArea?.cm2 ?? 0, 2);
      expect(g.fillRatio, `${b.part}: fill ratio moved`).toBeCloseTo(was.fillRatio ?? 0, 4);

      // The sheet-metal gate reads exactly these two. A solid part reporting
      // bends at a thin gauge is the shape of the bug that costed a 2.5 kg
      // steering knuckle at £5.43.
      expect(g.sheetMetal?.bendCount ?? 0, `${b.part}: bend count moved`)
        .toBe(was.sheetMetal?.bendCount ?? 0);
      expect(g.sheetMetal?.thicknessMm ?? 0, `${b.part}: sheet gauge moved`)
        .toBeCloseTo(was.sheetMetal?.thicknessMm ?? 0, 2);
    }
  });

  it('never calls a solid part sheet metal', () => {
    if (!kernel) return;
    // Independent of the recorded numbers: whatever the gauge is, it has to be
    // a wall the part actually has. This one would fail on a fresh mistake, not
    // just on drift from a recording.
    for (const [part, g] of fresh) {
      const bends = g.sheetMetal?.bendCount ?? 0;
      if (!bends) continue;
      const gauge = g.sheetMetal?.thicknessMm ?? 0;
      const bulk = 2 * (g.volume?.mm3 ?? 0) / (g.surfaceArea?.mm2 ?? 1);
      expect(gauge, `${part}: ${bends} bends at ${gauge} mm on a part whose bulk wall is ${bulk.toFixed(2)} mm`)
        .toBeGreaterThan(bulk * 0.5);
    }
  });
});
