/**
 * Programme life reaches every place a tool is sized (China / 200k / 6-year check, Oct 2026).
 *
 * The form amortises tooling over annual × years; the CAD rules choose the
 * moulding's cavitation and mould steel over the same programme. They used a
 * fixed 5 years whatever the engineer typed — now they use the programme life
 * when one is given, and say "assumed" when it is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { INJECTION_MOULDING_RULES } from '../src/engine/cost-input-rules/commodities/injection-moulding.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geo = baseline.find(b => b.part === 'IM_ECU_Cover.stp')!.geometry;
const ctx = (programmeYears?: number): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'injection_moulding', commoditySource: 'engineer',
  annualVolume: 200_000, filename: 'IM_ECU_Cover.stp',
  answers: { 'material.resin': 'mat-pa66gf30', 'commodity.thinWallRoute': 'injection_moulding' },
  ...(programmeYears ? { programmeYears } : {}),
} as RuleContext);
const steelBasis = (c: RuleContext) => {
  const r = runCostInputRules(INJECTION_MOULDING_RULES, c);
  return r.provenance['imm-steel-class']!;
};

describe('programme life sizes the mould', () => {
  it('6 years at 200k/yr: the steel is chosen over 1.2M parts and the basis says it is the programme life', () => {
    const d = steelBasis(ctx(6));
    expect(d.basis).toContain('200,000/yr over 6 years (programme life)');
  });
  it('blank programme life: 5 years, stated as an assumption', () => {
    const d = steelBasis(ctx());
    expect(d.basis).toContain('200,000/yr over 5 years (assumed — no programme life given)');
  });
  it('shots × cavities = annual × programme years (the cavitation is re-optimised over the longer programme)', () => {
    const parts = (s: string) => {
      const m = /in (\d+) cavity = ([\d,]+) shots/.exec(s)!;
      return Number(m[1]) * Number(m[2].replace(/,/g, ''));
    };
    expect(parts(steelBasis(ctx(6)).basis)).toBeCloseTo(1_200_000, -1);
    expect(parts(steelBasis(ctx()).basis)).toBeCloseTo(1_000_000, -1);
  });
});
