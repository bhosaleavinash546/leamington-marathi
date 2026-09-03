/**
 * Refuse before you estimate.
 *
 * Three inputs used to produce an HTTP 200 and a number: an open surface model
 * (costed at a plausible wrong volume), an inch model saved in millimetres
 * (costed at 0.0 kg), and an unreadable file (a "text-parsed" costing built on
 * nothing). The engine now refuses the first and last with a machine-readable
 * code and turns the second into a blocking decision the engineer answers.
 *
 * The fixtures under edge-cases/ are the review's live probes, kept: the same
 * flange scaled by 1/25.4, the same flange with its largest face deleted, two
 * disjoint solids in one file, the flange as IGES, and a 0-byte STEP.
 *
 * Needs the OCP kernel; skips cleanly without it (the shipped Alpine image).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { unitsDecisionFor } from '../server/routes/cad.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const DIR = join(__dirname, 'fixtures', 'cad-parts');
const EDGE = join(DIR, 'edge-cases');
const measure = (f: string, env: Record<string, string> = {}) =>
  analyzeGeometry(readFileSync(f), f.split('/').pop()!, 90_000, env);

let kernel = false;
let flange: OCCTGeometry | null = null;

beforeAll(async () => {
  process.env.AIR_GAPPED = '1';
  try {
    flange = await measure(join(DIR, 'flange-6holes-boss.step'));
    kernel = flange.status === 'success';
  } catch { kernel = false; }
}, 120_000);

describe('topology: what "closed solid" now means', () => {
  it('a valid closed solid has zero real free edges even when it has degenerate ones', () => {
    if (!kernel) return;
    const t = flange!.topology!;
    expect(t.isClosedSolid).toBe(true);
    expect(t.freeEdgeCount).toBe(0);
    expect(t.valid).toBe(true);
    expect(t.openShell).toBe(false);          // used to be True on every plain solid
  });

  it('every original fixture is a closed solid', async () => {
    if (!kernel) return;
    for (const f of ['block-2holes.step', 'plate-4holes.step', 'gear-m3-z38.step']) {
      const g = await measure(join(DIR, f));
      expect(g.status, f).toBe('success');
      expect(g.topology?.isClosedSolid, f).toBe(true);
      expect(g.topology?.freeEdgeCount, f).toBe(0);
    }
  }, 120_000);

  it('two disjoint solids in one file are still a closed model, and counted', async () => {
    if (!kernel) return;
    const g = await measure(join(EDGE, 'two-solids.step'));
    expect(g.status).toBe('success');
    expect(g.topology?.solidCount).toBe(2);
    expect(g.topology?.isClosedSolid).toBe(true);
    // 40x30x10 + 20x20x20 = 12 000 + 8 000 mm³
    expect(g.volume!.cm3).toBeCloseTo(20.0, 1);
  }, 60_000);
});

describe('refusals', () => {
  it('an open surface model is refused with not_closed_solid, not costed at a wrong volume', async () => {
    if (!kernel) return;
    const g = await measure(join(EDGE, 'flange-open-surface.step'));
    expect(g.status).toBe('error');
    expect(g.code).toBe('not_closed_solid');
    expect(g.error).toMatch(/not a closed solid/i);
    expect(g.topology?.solidCount).toBe(0);
    expect(g.topology?.freeEdgeCount).toBeGreaterThan(0);   // 25 real free edges
    // What it WOULD have measured (50.2 vs a true 63.9) is reported for the message only.
    expect(g.measuredVolumeCm3).toBeGreaterThan(0);
    expect(g.measuredVolumeCm3).toBeLessThan(flange!.volume!.cm3);
  }, 60_000);

  it('an unreadable (0-byte) STEP is an error with code unreadable', async () => {
    if (!kernel) return;
    const g = await measure(join(EDGE, 'empty.step'));
    expect(g.status).toBe('error');
    expect(g.code).toBe('unreadable');
  }, 60_000);

  it('CV_ALLOW_OPEN_SHELL=1 is the explicit opt-in for surface bodies', async () => {
    if (!kernel) return;
    const g = await measure(join(EDGE, 'flange-open-surface.step'), { CV_ALLOW_OPEN_SHELL: '1' });
    expect(g.status).toBe('success');
    expect(g.topology?.isClosedSolid).toBe(false);
    expect(g.topology?.openShell).toBe(true);
  }, 60_000);
});

describe('units: propose, never scale silently', () => {
  it('an inch model saved in mm is measured, flagged, and turned into a blocking decision', async () => {
    if (!kernel) return;
    const g = await measure(join(EDGE, 'flange-inch-authored.step'));
    expect(g.status).toBe('success');
    expect(g.boundingBox!.xMm).toBeCloseTo(3.15, 1);
    expect(g.unitCheck?.code).toBe('units_unconfirmed');
    expect(g.unitCheck?.proposedFactor).toBe(25.4);
    expect(g.load?.fileUnits).toEqual(['millimetre']);
    const d = unitsDecisionFor(g);
    expect(d).not.toBeNull();
    expect(d!.id).toBe('units.confirm');
    expect(d!.kind).toBe('units');
    expect(d!.severity).toBe('blocking');
    expect(d!.options.map(o => o.value)).toEqual(['inch', 'mm']);
    // The engine's hunch is shown, never preselected — the option carries a leaning only.
    expect(d!.options[0].leaning).toBe(true);
  }, 60_000);

  it('answering "inch" re-measures at 25.4x and the flag clears', async () => {
    if (!kernel) return;
    const g = await measure(join(EDGE, 'flange-inch-authored.step'), { CV_UNIT_SCALE: '25.4' });
    expect(g.status).toBe('success');
    expect(g.boundingBox!.xMm).toBeCloseTo(80.0, 0);
    expect(g.volume!.cm3).toBeCloseTo(flange!.volume!.cm3, 1);
    expect(g.unitCheck ?? null).toBeNull();
    expect(g.load?.unitScale).toBe(25.4);
    expect(unitsDecisionFor(g)).toBeNull();
  }, 60_000);

  it('a normal millimetre part is not flagged', () => {
    if (!kernel) return;
    expect(flange!.unitCheck ?? null).toBeNull();
    expect(unitsDecisionFor(flange!)).toBeNull();
  });

  it('unitsDecisionFor never fires on an error result or without a check (no kernel needed)', () => {
    expect(unitsDecisionFor({ status: 'error', error: 'x' })).toBeNull();
    expect(unitsDecisionFor({ status: 'success' })).toBeNull();
    const d = unitsDecisionFor({
      status: 'success', boundingBox: { xMm: 3.15, yMm: 3.15, zMm: 0.79 },
      unitCheck: { code: 'units_unconfirmed', proposedFactor: 25.4, reason: 'test', declaredUnits: ['millimetre'] },
    });
    expect(d?.question).toMatch(/3\.15/);
  });
});

describe('IGES: sew, then measure', () => {
  it('the flange as IGES is sewn into a solid and measures the same volume', async () => {
    if (!kernel) return;
    const p = join(EDGE, 'flange-6holes-boss.igs');
    if (!existsSync(p)) return;
    const g = await measure(p);
    expect(g.status).toBe('success');
    expect(g.load?.repaired?.sewn).toBe(true);
    expect(g.topology?.isClosedSolid).toBe(true);
    expect(g.volume!.cm3).toBeCloseTo(flange!.volume!.cm3, 0);
  }, 90_000);
});
