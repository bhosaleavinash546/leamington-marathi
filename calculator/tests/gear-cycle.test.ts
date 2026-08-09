/**
 * Gear cutting kinematics, pinned to hand calculation.
 *
 * `gear-cycle.ts` ships without citations because it is arithmetic rather than a
 * claim about the world. That is only a defensible position if the arithmetic is
 * actually checked, so these tests do the sums independently — the way
 * `reference-part.test.ts` pins a hand-computed £23.27 bracket — and assert the
 * code reproduces them to floating-point tolerance.
 *
 * The most important test in the file is `hobbing time is LINEAR in tooth
 * count`. Everything else could be right and that one relationship wrong, and a
 * cost engineer would never spot it: the number would simply be too low on the
 * big gears, which are the expensive ones.
 */
import { describe, it, expect } from 'vitest';
import {
  transverseModuleMm, pitchDiameterMm, toothDepthMm, toothSpaceVolumeMm3,
  hobApproachMm, hobbingCycleSec, shapingCycleSec, skivingCycleSec, grindingCycleSec,
} from '../src/engine/gear-cycle.js';

describe('gear geometry', () => {
  it('a spur gear has transverse module equal to normal module', () => {
    expect(transverseModuleMm(3, 0)).toBeCloseTo(3, 10);
  });

  it('helix inflates the transverse module, and therefore the diameter', () => {
    // m_t = m_n / cos(30°) = 3 / 0.8660254 = 3.4641016
    expect(transverseModuleMm(3, 30)).toBeCloseTo(3.4641016, 6);
    // A 40-tooth helical gear is 15% bigger than the spur of the same count —
    // which is what pushes it past a machine's swing.
    expect(pitchDiameterMm(40, 3, 30)).toBeCloseTo(138.5640646, 5);
    expect(pitchDiameterMm(40, 3, 0)).toBeCloseTo(120, 10);
  });

  it('tooth depth is 2.25 x module (1.0 addendum + 1.25 dedendum)', () => {
    expect(toothDepthMm(3)).toBeCloseTo(6.75, 10);
  });

  it('hob approach is the chord of the hob circle at full depth', () => {
    // sqrt(h (D - h)) with h = 6.75, D = 90  →  sqrt(6.75 x 83.25) = 23.70522...
    expect(hobApproachMm(6.75, 90)).toBeCloseTo(Math.sqrt(6.75 * 83.25), 10);
    expect(hobApproachMm(6.75, 90)).toBeCloseTo(23.70522, 4);
  });

  it('approach cannot exceed the hob radius even at absurd depth', () => {
    // A depth deeper than the hob radius is unphysical; the chord is clamped so
    // the result stays real rather than becoming NaN.
    expect(Number.isFinite(hobApproachMm(500, 90))).toBe(true);
    expect(hobApproachMm(500, 90)).toBeCloseTo(45, 6);
  });
});

describe('hobbing cycle — hand calculation', () => {
  /**
   * Worked by hand:
   *   z = 40, m_n = 3, spur, b = 25, hob Ø90 with 2 starts,
   *   v = 140 m/min, f_a = 2.6 mm/rev, 1 cut, 18 s handling.
   *
   *   n_hob  = 1000 x 140 / (pi x 90)          = 495.14871 rpm
   *   n_work = 495.14871 x 2 / 40              = 24.757436 rpm
   *   h      = 2.25 x 3                        = 6.75 mm
   *   approach = sqrt(6.75 x (90 - 6.75))      = 23.70522 mm
   *   travel = 25 + 23.70522 + 2               = 50.70522 mm
   *   t      = 50.70522 / (2.6 x 24.757436) x 60 = 47.26340 s
   */
  const inputs = {
    teeth: 40, normalModuleMm: 3, helixAngleDeg: 0, faceWidthMm: 25,
    hobDiameterMm: 90, hobStarts: 2, cuttingSpeedMPerMin: 140,
    axialFeedMmPerRev: 2.6, cuts: 1, loadUnloadSec: 18,
  };

  it('reproduces the hand-computed cutting time', () => {
    const nHob = (1000 * 140) / (Math.PI * 90);
    const nWork = (nHob * 2) / 40;
    const travel = 25 + Math.sqrt(6.75 * (90 - 6.75)) + 2;
    const expected = (travel / (2.6 * nWork)) * 60;

    const r = hobbingCycleSec(inputs);
    expect(r.cuttingSec).toBeCloseTo(expected, 9);
    expect(r.cuttingSec).toBeCloseTo(47.26340, 4);
    expect(r.totalSec).toBeCloseTo(expected + 18, 9);
  });

  it('is LINEAR in tooth count — a 3x tooth count is a 3x cut', () => {
    // The relationship that matters most and is easiest to get wrong. Every
    // extra tooth is another space the work must index through, so at fixed feed
    // the time scales with z. A model that missed this would under-cost every
    // large gear, which are the expensive ones.
    const small = hobbingCycleSec({ ...inputs, teeth: 30 });
    const large = hobbingCycleSec({ ...inputs, teeth: 90 });
    expect(large.cuttingSec / small.cuttingSec).toBeCloseTo(3, 9);
  });

  it('halves with twice the hob starts', () => {
    const one = hobbingCycleSec({ ...inputs, hobStarts: 1 });
    const two = hobbingCycleSec({ ...inputs, hobStarts: 2 });
    expect(one.cuttingSec / two.cuttingSec).toBeCloseTo(2, 9);
  });

  it('counts a second cut as a second pass, not a fudge factor', () => {
    const one = hobbingCycleSec({ ...inputs, cuts: 1 });
    const two = hobbingCycleSec({ ...inputs, cuts: 2 });
    expect(two.cuttingSec).toBeCloseTo(one.cuttingSec * 2, 9);
  });

  it('charges the helix for the longer path across the face', () => {
    const spur = hobbingCycleSec({ ...inputs, helixAngleDeg: 0 });
    const helical = hobbingCycleSec({ ...inputs, helixAngleDeg: 30 });
    // Face travel grows by 1/cos(30) = 1.1547; approach and overrun do not.
    const spurFace = 25, helicalFace = 25 / Math.cos(30 * Math.PI / 180);
    const fixed = Math.sqrt(6.75 * (90 - 6.75)) + 2;
    expect(helical.cuttingSec / spur.cuttingSec)
      .toBeCloseTo((helicalFace + fixed) / (spurFace + fixed), 9);
  });

  it('prints a basis that contains the arithmetic, not a summary', () => {
    const r = hobbingCycleSec(inputs);
    expect(r.basis).toContain('2-start');
    expect(r.basis).toContain('495');           // hob rpm, rounded
    expect(r.basis).toContain('approach');
    expect(r.basis).toContain('2.6 mm/rev');
  });

  it('reports a finite removal rate for the audit cross-check', () => {
    const r = hobbingCycleSec(inputs);
    expect(r.removalRateMm3PerMin).toBeGreaterThan(0);
    expect(Number.isFinite(r.removalRateMm3PerMin)).toBe(true);
  });
});

describe('shaping cycle — hand calculation', () => {
  /**
   *   z = 60, m_n = 2, spur → pitch Ø120, circumference 376.9911 mm
   *   f_c = 0.30 mm/stroke, 700 strokes/min, 3 passes
   *   t = 376.9911 / (0.30 x 700) x 60 x 3 = 323.1352 s
   */
  it('measures the cut around the pitch circumference, not along the face', () => {
    const r = shapingCycleSec({
      teeth: 60, normalModuleMm: 2, helixAngleDeg: 0, faceWidthMm: 20,
      strokesPerMin: 700, circularFeedMmPerStroke: 0.30, roughingPasses: 3,
      loadUnloadSec: 18,
    });
    const expected = ((Math.PI * 120) / (0.30 * 700)) * 60 * 3;
    expect(r.cuttingSec).toBeCloseTo(expected, 9);
    expect(r.cuttingSec).toBeCloseTo(323.1352, 3);
  });

  it('is unaffected by face width — that sets stroke rate, supplied separately', () => {
    const base = {
      teeth: 60, normalModuleMm: 2, helixAngleDeg: 0,
      strokesPerMin: 700, circularFeedMmPerStroke: 0.30, roughingPasses: 3,
      loadUnloadSec: 18,
    };
    expect(shapingCycleSec({ ...base, faceWidthMm: 10 }).cuttingSec)
      .toBeCloseTo(shapingCycleSec({ ...base, faceWidthMm: 40 }).cuttingSec, 9);
  });
});

describe('skiving cycle', () => {
  const inputs = {
    teeth: 80, normalModuleMm: 2, helixAngleDeg: 0, faceWidthMm: 20,
    cutterTeeth: 25, cutterDiameterMm: 60, cuttingSpeedMPerMin: 180,
    axialFeedMmPerRev: 0.35, cuts: 3, loadUnloadSec: 18,
  };

  it('uses cutter TEETH as the generating ratio, the way a hob uses starts', () => {
    const nCutter = (1000 * 180) / (Math.PI * 60);
    const nWork = (nCutter * 25) / 80;
    const travel = 20 + 2.25 * 2 + 2;
    const expected = (travel / (0.35 * nWork)) * 60 * 3;
    expect(skivingCycleSec(inputs).cuttingSec).toBeCloseTo(expected, 9);
  });

  it('scales with tooth count like every generating process', () => {
    const a = skivingCycleSec({ ...inputs, teeth: 40 });
    const b = skivingCycleSec({ ...inputs, teeth: 80 });
    expect(b.cuttingSec / a.cuttingSec).toBeCloseTo(2, 9);
  });
});

describe('grinding cycle', () => {
  /**
   * Stock-limited, not feed-limited:
   *   volume = 2 flanks x 40 teeth x (6.75 x 25) mm² x 0.08 mm = 1080 mm³
   *   rate   = 2.5 mm³/mm·s x 25 mm wheel = 62.5 mm³/s
   *   t      = 1080 / 62.5 + 8 dressing = 17.28 + 8 = 25.28 s
   */
  const inputs = {
    teeth: 40, normalModuleMm: 3, helixAngleDeg: 0, faceWidthMm: 25,
    grindingStockPerFlankMm: 0.08, specificRemovalRateMm3PerMmSec: 2.5,
    wheelWidthMm: 25, dressingSecPerPart: 8, loadUnloadSec: 18,
  };

  it('reproduces the hand-computed stock-removal time', () => {
    const volume = 2 * 40 * (6.75 * 25) * 0.08;
    expect(volume).toBeCloseTo(1080, 9);
    const r = grindingCycleSec(inputs);
    expect(r.cuttingSec).toBeCloseTo(1080 / 62.5 + 8, 9);
    expect(r.cuttingSec).toBeCloseTo(25.28, 6);
  });

  it('scales linearly with the stock heat treat leaves behind', () => {
    const thin = grindingCycleSec({ ...inputs, grindingStockPerFlankMm: 0.05, dressingSecPerPart: 0 });
    const thick = grindingCycleSec({ ...inputs, grindingStockPerFlankMm: 0.15, dressingSecPerPart: 0 });
    expect(thick.cuttingSec / thin.cuttingSec).toBeCloseTo(3, 9);
  });
});

describe('metal removed — the audit cross-check', () => {
  it('grows with teeth, module and face width', () => {
    const base = { teeth: 40, normalModuleMm: 3, helixAngleDeg: 0, faceWidthMm: 25 };
    const v = toothSpaceVolumeMm3(base);
    expect(toothSpaceVolumeMm3({ ...base, teeth: 80 })).toBeCloseTo(v * 2, 6);
    expect(toothSpaceVolumeMm3({ ...base, faceWidthMm: 50 })).toBeCloseTo(v * 2, 6);
    // Module enters twice — through the pitch and through the depth.
    expect(toothSpaceVolumeMm3({ ...base, normalModuleMm: 6 })).toBeCloseTo(v * 4, 6);
  });
});

describe('degenerate inputs do not produce NaN or Infinity', () => {
  it('survives a zero feed, a zero speed and a zero tooth count', () => {
    for (const bad of [
      { axialFeedMmPerRev: 0 }, { cuttingSpeedMPerMin: 0 },
      { teeth: 0 }, { hobStarts: 0 }, { hobDiameterMm: 0 },
    ]) {
      const r = hobbingCycleSec({
        teeth: 40, normalModuleMm: 3, helixAngleDeg: 0, faceWidthMm: 25,
        hobDiameterMm: 90, hobStarts: 2, cuttingSpeedMPerMin: 140,
        axialFeedMmPerRev: 2.6, cuts: 1, loadUnloadSec: 18, ...bad,
      });
      expect(Number.isFinite(r.totalSec), JSON.stringify(bad)).toBe(true);
      expect(Number.isNaN(r.totalSec), JSON.stringify(bad)).toBe(false);
    }
  });
});
