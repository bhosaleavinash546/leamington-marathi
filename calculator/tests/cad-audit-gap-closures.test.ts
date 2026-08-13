/**
 * Closures for the six gaps left open by the live CAD-to-Cost audit
 * (cad-audit/FINDINGS.md "Recommendations"). Each test reproduces the live
 * state that motivated the gap.
 */
import { describe, it, expect } from 'vitest';
import { suppressAIForUndecided } from '../src/engine/cost-input-rules/apply.js';
import { withAIMaterial } from '../server/routes/cad.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import { runCADSanityChecks } from '../server/utils/cad-sanity.js';

// The bumper's measured geometry, as the live capture recorded it.
const BUMPER_GEO = {
  status: 'success',
  partName: 'bumper',
  boundingBox: { xMm: 1690.94, yMm: 647.38, zMm: 528.1 },
  volume: { mm3: 2_059_899, cm3: 2059.899 },
  surfaceArea: { mm2: 1_640_000, cm2: 16_400 },
  fillRatio: 0.0036,
  wallThickness: { minMm: 2.1, maxMm: 3.4, meanMm: 2.5, stdDevMm: 0.3, sampleCount: 200, method: 'ray_cast', uniformity: 'good' },
  topology: { available: true, openShell: true, enclosesSealedVoid: false },
  featureTable: [],
  features: { freeFormFaceCount: 40, planarFaceCount: 12 },
} as unknown as RuleContext['geo'];

function ctx(answers: Record<string, unknown> = {}): RuleContext {
  return {
    geo: BUMPER_GEO, geometryQuality: 'occt', commodity: 'injection_moulding',
    commoditySource: 'engineer', annualVolume: 200000, filename: 'BUMPER.stp', answers,
  } as unknown as RuleContext;
}

describe('gap 2 — AI values are suppressed for fields owned by a rule that is still asking (BUMPER live run)', () => {
  it("clears the model's stock mouldCostGBP/mouldLife while the resin decision is open", () => {
    const spec = specForCommodity('injection_moulding')!;
    const result = runCostInputRules(spec, ctx({}));          // resin unanswered → rules blocked
    expect(result.decisions.length).toBeGreaterThan(0);
    const analysis = {
      costInputSuggestions: {
        netWeightKg: 5.5617,
        injectionMoulding: { mouldCostGBP: 200_000, mouldLife: 500_000, cavities: 1 },
      },
    };
    const suppressed = suppressAIForUndecided(analysis, result, spec);
    const fields = suppressed.map(x => x.field);
    expect(fields).toContain('injectionMoulding.mouldCostGBP');
    expect(fields).toContain('injectionMoulding.mouldLife');
    const im = analysis.costInputSuggestions.injectionMoulding as Record<string, unknown>;
    expect(im.mouldCostGBP).toBeUndefined();
    expect(im.mouldLife).toBeUndefined();
    // The record says what the model had claimed, so nothing vanishes silently.
    const mc = suppressed.find(x => x.field === 'injectionMoulding.mouldCostGBP');
    expect(mc?.aiValue).toBe(200_000);
  });

  it('suppresses nothing once the resin is answered (rules decide and overwrite instead)', () => {
    const spec = specForCommodity('injection_moulding')!;
    const result = runCostInputRules(spec, ctx({ 'material.resin': 'mat-pp-impact' }));
    const analysis = { costInputSuggestions: { injectionMoulding: { mouldCostGBP: 200_000 } } };
    const suppressed = suppressAIForUndecided(analysis, result, spec)
      .filter(x => x.field.startsWith('injectionMoulding.mould'));
    expect(suppressed).toEqual([]);
  });
});

describe("gap 1 (re-analysis path) — the engineer's material confirm wins over the AI guess", () => {
  // The final verification run caught this: on mode=both/reanalyze, withAIMaterial
  // overwrote the confirmed family with the model's, silently reverting a
  // cast-iron confirmation to the AI's aluminium.
  const base = { geo: BUMPER_GEO, geometryQuality: 'occt', commodity: 'casting',
    commoditySource: 'engineer', annualVolume: 200000, filename: 'part.stp' } as unknown as RuleContext;
  const aiAluminium = { costInputSuggestions: { materialId: 'mat-lm25' } };  // AI said aluminium

  it('keeps the engineer-answered cast iron instead of folding in the AI aluminium', () => {
    const ctx = { ...base, answers: { 'material.family': 'cast iron' } } as unknown as RuleContext;
    const out = withAIMaterial(ctx, aiAluminium);
    expect(out.answers['material.family']).toBe('cast iron');
    expect(out.answers['material.familySource']).not.toBe('ai');
  });

  it('still folds the AI family in (tagged as AI) when the engineer has NOT answered', () => {
    const ctx = { ...base, answers: {} } as unknown as RuleContext;
    const out = withAIMaterial(ctx, aiAluminium);
    expect(out.answers['material.family']).toBe('aluminium');
    expect(out.answers['material.familySource']).toBe('ai');
  });
});

describe('gap 4 — money-corrupting sanity findings carry blocking:true', () => {
  it('flags a bulk-metal process on a huge thin-wall shell as blocking', () => {
    const analysis = {
      partName: 'bumper',
      costInputSuggestions: { recommendedCommodity: 'casting', netWeightKg: 5.56 },
      materialAnalysis: { primarySuggestion: { name: 'Aluminium A356', confidencePct: 60 } },
      processRecommendations: [],
    };
    const warnings = runCADSanityChecks(
      analysis as Parameters<typeof runCADSanityChecks>[0], 2059.9,
      { commodity: 'casting', fillRatio: 0.0036, wallMeanMm: 2.5, maxDimMm: 1691 } as never,
    );
    const w = warnings.find(x => x.code === 'process_geometry_implausible');
    expect(w).toBeTruthy();
    expect(w!.blocking).toBe(true);
  });
});

describe('gap 6 — gear is a first-class commodity, not a hand-off', () => {
  it('cad.ts stage-1 prompt lists gear as a valid type and routes it', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server/routes/cad.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/Valid commodity types:.*\bgear\b/);
    // The dead-end hand-off is GONE: a gear-named or metrology-recognised part
    // routes to the gear commodity, whose rule pack asks the drawing questions.
    expect(src).not.toMatch(/handoff: 'gear'/);
    expect(src).toMatch(/gearRouted/);
  });
  it('the CAD dropdown offers gear', async () => {
    const { CAD_COMMODITY_OPTIONS } = await import('../src/ui/data/cad-options.js');
    expect(CAD_COMMODITY_OPTIONS.some(o => o.value === 'gear')).toBe(true);
  });
  it('the rule registry costs gear deterministically', async () => {
    const { specForCommodity, GEAR_RULES } = await import('../src/engine/cost-input-rules/index.js');
    expect(specForCommodity('gear')).toBe(GEAR_RULES);
  });
});

describe('gap 3 — the analysis PDF names the AI cost range as model opinion', () => {
  it('§7 title carries the label', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/export/pdf.ts', import.meta.url), 'utf8');
    expect(src).toContain('AI Indicative Cost Range (model opinion — not engine-calculated)');
  });
});
