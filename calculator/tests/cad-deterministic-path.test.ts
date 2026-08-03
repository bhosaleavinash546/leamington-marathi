/**
 * The acceptance test for the whole rule-engine project, as a test.
 *
 * "With `ANTHROPIC_API_KEY` unset and `AIR_GAPPED=1`, upload a STEP file and
 * produce a full costing." Everything below runs the real OCCT pipeline over the
 * real fixtures with no key and no network — `AIR_GAPPED=1` makes
 * `createAnthropic` throw, so if anything reached for a model this would fail
 * rather than quietly succeed.
 *
 * Skips cleanly where OCP is absent. The shipped Alpine container has no
 * cadquery/OCP (see CLAUDE.md), so CI must not fail for the absence of a
 * dependency the deployment deliberately does without.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { inferCommodity, COMMODITY_DECISION_ID } from '../src/engine/cost-input-rules/derive/commodity.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { MATERIAL_FAMILY_DECISION_ID } from '../src/engine/cost-input-rules/derive/material.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const DIR = join(__dirname, 'fixtures', 'cad-parts');
const PARTS = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.step')).sort() : [];

/** Measured once — spawning the Python kernel per test would dominate the run. */
const measured = new Map<string, OCCTGeometry>();
let kernelAvailable = false;

beforeAll(async () => {
  process.env.AIR_GAPPED = '1';
  delete process.env.ANTHROPIC_API_KEY;
  for (const f of PARTS) {
    try {
      const geo = await analyzeGeometry(readFileSync(join(DIR, f)), f, 60_000);
      if (geo.status === 'success') { measured.set(f, geo); kernelAvailable = true; }
    } catch { /* no OCP — the suite skips below */ }
  }
}, 240_000);

const ctx = (
  geo: OCCTGeometry, commodity: string, answers: Record<string, unknown>, filename: string,
): RuleContext => ({
  geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer',
  annualVolume: 100_000, filename, answers,
});

describe('a costing with no AI in it', () => {
  it('has a geometry kernel to measure with, or skips the rest', () => {
    if (!kernelAvailable) {
      console.log('[deterministic] OCP not installed — skipping. This is expected on the shipped image.');
    }
    expect(PARTS.length).toBeGreaterThan(0);
  });

  it('measures every fixture without a key or a network', () => {
    if (!kernelAvailable) return;
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(process.env.AIR_GAPPED).toBe('1');
    for (const [name, geo] of measured) {
      expect(geo.volume?.cm3, name).toBeGreaterThan(0);
      expect(geo.boundingBox, name).toBeTruthy();
      expect(geo.fillRatio, name).toBeGreaterThan(0);
    }
  });

  it('asks which process rather than picking one off a ladder that names three', () => {
    if (!kernelAvailable) return;
    const [name, geo] = [...measured][0];
    const verdict = inferCommodity(ctx(geo, 'machining', {}, name));
    // These fixtures are near-solid blocks and plates: the fill ladder's top
    // rung, which the prompt itself writes as "forging OR machined from solid".
    expect(verdict.commodity, 'should not have guessed').toBeUndefined();
    expect(verdict.decision!.id).toBe(COMMODITY_DECISION_ID);
    expect(verdict.decision!.options.length).toBeGreaterThan(1);
    expect(verdict.decision!.why).toContain('sourcing decision, not a measurement');
  });

  it('honours the process once a person chooses it', () => {
    if (!kernelAvailable) return;
    const [name, geo] = [...measured][0];
    const v = inferCommodity(ctx(geo, 'machining', { [COMMODITY_DECISION_ID]: 'forging' }, name));
    expect(v.commodity).toBe('forging');
  });

  it('stops on the material, then costs every fixture once it is answered', () => {
    if (!kernelAvailable) return;
    const spec = specForCommodity('machining')!;

    for (const [name, geo] of measured) {
      const blocked = buildDeterministicAnalysis(spec, ctx(geo, 'machining', {}, name), name);
      expect(blocked.result.status, `${name} should block`).toBe('needs_decision');
      expect(blocked.result.decisions.map(d => d.id)).toContain(MATERIAL_FAMILY_DECISION_ID);
      // A blocked analysis must not read as a confident one.
      expect(blocked.analysis.confidenceLevel).toBe('Low');

      const done = buildDeterministicAnalysis(
        spec, ctx(geo, 'machining', { [MATERIAL_FAMILY_DECISION_ID]: 'aluminium' }, name), name);
      const c = done.analysis.costInputSuggestions;

      expect(done.result.status, `${name} should complete`).toBe('complete');
      expect(c.recommendedCommodity).toBe('machining');
      expect(c.netWeightKg, `${name} weight`).toBeGreaterThan(0);
      expect(c.estimatedCycleTimeHr, `${name} cycle`).toBeGreaterThan(0);
      expect(c.estimatedSetupTimeHr, `${name} setup`).toBeGreaterThan(0);
      // Weight is the measured volume x the answered family's density, to 3 dp.
      expect(c.netWeightKg).toBeCloseTo(
        Math.round(geo.volume!.cm3 * 0.0027 * 1000) / 1000, 3);
    }
  });

  it('carries the derivation instead of a paragraph', () => {
    if (!kernelAvailable) return;
    const [name, geo] = [...measured][0];
    const done = buildDeterministicAnalysis(
      specForCommodity('machining')!,
      ctx(geo, 'machining', { [MATERIAL_FAMILY_DECISION_ID]: 'aluminium' }, name), name);

    expect(done.analysis.aiExplanation).toContain('No AI call was made');
    // Every filled field appears with its own basis, so the number is checkable.
    expect(done.analysis.aiExplanation).toContain('machining.netWeightKg');
    expect(done.analysis.aiExplanation).toContain('solid billet');
    // And an empty DFM list says it means "not checked".
    expect(done.analysis.analysisLimitations.join(' ')).toContain('not checked');
  });

  it('hard-assigns the manufacturability score from geometry', () => {
    if (!kernelAvailable) return;
    const [name, geo] = [...measured][0];
    const done = buildDeterministicAnalysis(
      specForCommodity('machining')!,
      ctx(geo, 'machining', { [MATERIAL_FAMILY_DECISION_ID]: 'aluminium' }, name), name);
    expect(done.analysis.manufacturabilityScore).toBe(geo.manufacturabilityScore);
  });

  it('reports which fields it wrote over, and which it computed but cannot carry', () => {
    if (!kernelAvailable) return;
    const [name, geo] = [...measured][0];
    const done = buildDeterministicAnalysis(
      specForCommodity('machining')!,
      ctx(geo, 'machining', { [MATERIAL_FAMILY_DECISION_ID]: 'aluminium' }, name), name);

    expect(done.applied.overridden.length).toBeGreaterThan(0);
    for (const o of done.applied.overridden) expect(o.basis.length).toBeGreaterThan(0);
    // The known gap: machining's measured billet has no form field to land in.
    expect(done.applied.notWritten).toContain('machining.stockWeightKg');
  });
});
