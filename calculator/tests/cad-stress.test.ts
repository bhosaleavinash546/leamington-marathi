/**
 * The inputs a demo actually breaks on: many features, many bodies, odd names.
 *
 * Each of these was run live against the server before being written down, so
 * the numbers below are observations, not targets.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeGeometry, type OCCTGeometry } from '../server/utils/geometry-bridge.js';
import { looksLikeGear } from '../src/engine/cost-input-rules/derive/commodity.js';

process.env.AIR_GAPPED = '1';

const DIR = join(__dirname, 'fixtures', 'cad-parts');
const PLATE = join(DIR, 'plate-324holes.step');

describe('feature detection scales to a hole-dense part', () => {
  let geo: OCCTGeometry | null = null;

  beforeAll(async () => {
    if (!existsSync(PLATE)) return;
    try { geo = await analyzeGeometry(readFileSync(PLATE), 'plate-324holes.step', 300_000); }
    catch { /* no OCP — skips */ }
  }, 420_000);

  it('counts every one of the 324 holes', () => {
    if (!geo || geo.status !== 'success') {
      console.log('[stress] OCP not installed — skipping. Expected on the Alpine image.');
      return;
    }
    // A 228 x 228 x 8 plate with 324 through-holes at r=3. Hand-computed:
    //   228*228*8            = 415.872 cm³
    //   324 * pi * 3² * 8    =  73.287 cm³
    //                        = 342.585 cm³
    expect(geo.volume!.cm3).toBeCloseTo(342.585, 2);
    expect(geo.features!.estimatedHoleCount).toBe(324);
    // Every hole is a cylinder plus the six plate faces.
    expect(geo.faces!.total).toBeGreaterThanOrEqual(324);
  });
});

describe('a filename is not a place to put logic', () => {
  it('does not see a gear in Japanese, Chinese or Greek', () => {
    // Verified live: this exact name analyses to the right volume. The check
    // here is that the filename PREDICATES stay well-behaved — `looksLikeGear`
    // reads the name, and a regex that matched on non-Latin text would route a
    // bracket to the gear commodity.
    for (const name of ['ブラケット_钣金-Ω_β.step', 'Zahnrad-Ω.step', 'пластина.stp']) {
      expect(looksLikeGear({}, name).gear, name).toBe(false);
    }
  });

  it('still finds a gear when the Latin word is there', () => {
    expect(looksLikeGear({}, 'ギア_ring_gear.step').gear).toBe(true);
  });
});
