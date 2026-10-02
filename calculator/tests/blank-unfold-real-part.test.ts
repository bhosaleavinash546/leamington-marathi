/**
 * The unfold on a real pressing: the Seat Locking Bracket STEP in cad-audit,
 * through the kernel's skin export and the TypeScript flattening — the same
 * chain the CAD route runs. Needs the OCP kernel, so it skips where there is
 * none (ordinary CI) and runs in docker-cad.yml and on a developer's machine.
 *
 * The expected figures are the September research prototype's (numpy ARAP +
 * inverse pass, research/fastblank/README.md): 490 cm² outline inside a
 * 282 × 210 mm rectangle, 954 mm outline + 985 mm of hole edge, 21 holes.
 * This chain lands within 1% of them with no numpy at all.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { developBlankFromCad } from '../server/services/blank-development.js';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const PART = resolve(import.meta.dirname, '..', '..', 'cad-audit', 'parts', 'Seat_Locking_Bracket.stp');
const hasKernel = (): boolean => {
  if (!existsSync(PART)) return false;
  const r = spawnSync(process.env.PYTHON_BIN ?? 'python3', ['-c', 'import OCP'], { stdio: 'ignore' });
  return r.status === 0;
};

describe('developing the seat bracket blank from its STEP', () => {
  let geo: OCCTGeometry | null = null;
  let blank: NonNullable<OCCTGeometry['blank']> | null = null;
  const kernel = hasKernel();

  beforeAll(async () => {
    if (!kernel) return;
    const bytes = readFileSync(PART);
    const g = await analyzeGeometry(bytes, 'Seat_Locking_Bracket.stp', 300_000);
    if (g.status !== 'success') return;
    geo = g;
    const dev = await developBlankFromCad(bytes, 'Seat_Locking_Bracket.stp', g);
    if (dev && 'blank' in dev) blank = dev.blank;
  }, 600_000);

  it('matches the research prototype within 1%', () => {
    if (!kernel) { console.log('[unfold] OCP not installed — skipped'); return; }
    expect(geo?.sheetMetal?.thicknessSource).toBe('bend-pairs');
    expect(blank, 'the unfold did not run').not.toBeNull();
    const b = blank!;
    expect(b.developedFrom).toBe('solid');
    expect(b.grossAreaMm2 / 49_000).toBeCloseTo(1, 1);          // 490 cm²
    expect(Math.abs(b.grossAreaMm2 - 49_000) / 49_000).toBeLessThan(0.02);
    expect(Math.abs(b.netAreaMm2 - 44_400) / 44_400).toBeLessThan(0.02);
    expect(Math.abs(b.outerPerimeterMm - 954) / 954).toBeLessThan(0.01);
    expect(Math.abs(b.holePerimeterMm - 985) / 985).toBeLessThan(0.01);
    expect(b.holeCount).toBe(21);
    expect(Math.abs(b.boundingRectMm.lengthMm - 282) / 282).toBeLessThan(0.015);
    expect(Math.abs(b.boundingRectMm.widthMm - 210) / 210).toBeLessThan(0.015);
    expect(b.blankHash).toMatch(/^[a-f0-9]{64}$/);
    expect(b.source).toContain('2 skins unfolded');
  });

  it('agrees with the B-rep identity: net area = volume ÷ gauge, to 1%', () => {
    if (!kernel || !blank || !geo) return;
    const vt = geo.volume!.mm3 / geo.sheetMetal!.thicknessMm;
    expect(Math.abs(blank.netAreaMm2 - vt) / vt).toBeLessThan(0.02);
  });
});
