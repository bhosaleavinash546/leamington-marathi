/**
 * Closures for the six gaps left open by the live CAD-to-Cost audit
 * (cad-audit/FINDINGS.md "Recommendations"). Each test reproduces the live
 * state that motivated the gap.
 */
import { describe, it, expect } from 'vitest';
import { suppressAIForUndecided } from '../src/engine/cost-input-rules/apply.js';
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

describe('gap 6 — the stage-1 vocabulary and dropdown know gear', () => {
  it('cad.ts stage-1 prompt lists gear as a valid type', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server/routes/cad.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/Valid commodity types:.*\bgear\b/);
    expect(src).toMatch(/handoff: 'gear'/);
  });
  it('the CAD dropdown offers the gear hand-off', async () => {
    const { CAD_COMMODITY_OPTIONS } = await import('../src/ui/data/cad-options.js');
    expect(CAD_COMMODITY_OPTIONS.some(o => o.value === 'gear')).toBe(true);
  });
});

describe('gap 3 — the analysis PDF names the AI cost range as model opinion', () => {
  it('§7 title carries the label', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/export/pdf.ts', import.meta.url), 'utf8');
    expect(src).toContain('AI Indicative Cost Range (model opinion — not engine-calculated)');
  });
});
