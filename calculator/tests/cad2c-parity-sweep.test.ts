/**
 * Nine-commodity parity sweep (Oct 2026, docs/review/cad2c-parity-sweep-2026-10-30.md).
 *
 * While the process question is open, the rules that run are the LEANING route's — a rubber grommet, a vent pipe
 * and a hat stiffener opened on the machining placeholder's "what is this part made of?" (aluminium / steel / … /
 * plastic), a blocking question none of them could answer. The route's own material question is the one to ask.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { placeholderCommodity } from '../server/routes/cad.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import type { Decision, RuleContext } from '../src/engine/cost-input-rules/types.js';

const base = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as Array<{ part: string; geometry: unknown }>;
const geoOf = (part: string) => base.find(p => p.part === part)!.geometry as RuleContext['geo'];

function ctxFor(part: string, commodity: string, answers: Record<string, unknown> = {}): RuleContext {
  return { geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 100_000,
    filename: part, answers } as unknown as RuleContext;
}

describe('placeholderCommodity — the rules follow the leaning route while the process question is open', () => {
  it('takes the leaning option when it has a rule pack, else the fallback', () => {
    const d = (lean?: string): Decision => ({ id: 'commodity.route', kind: 'commodity', question: '', why: '',
      options: ['machining', 'rubber', 'extrusion'].map(v => ({ value: v, label: v, consequence: '', leaning: v === lean })),
      blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking' });
    expect(placeholderCommodity(d('rubber'), 'machining')).toBe('rubber');
    expect(placeholderCommodity(d(), 'machining')).toBe('machining');
    expect(placeholderCommodity(null, 'machining')).toBe('machining');
    const noPack: Decision = { ...d(), options: [{ value: 'no_such_route', label: '', consequence: '', leaning: true }] };
    expect(placeholderCommodity(noPack, 'machining')).toBe('machining');
  });

  it.each([
    ['RUB_Grommet.stp', 'rubber', 'material.elastomer'],
    ['EXT_Vent_Pipe.stp', 'extrusion', 'material.resin'],
    ['COMP_Hat_Stiffener.stp', 'composites', 'material.laminate'],
  ])('%s leans %s and its placeholder rules ask %s, never the generic family', (part, lean, materialQuestion) => {
    const verdict = inferCommodity(ctxFor(part, 'machining'));
    expect(verdict.decision, 'the route is a question').toBeTruthy();
    expect(verdict.decision!.options.find(o => o.leaning)?.value).toBe(lean);
    const placeholder = placeholderCommodity(verdict.decision!, 'machining');
    expect(placeholder).toBe(lean);
    const ctx = ctxFor(part, placeholder);
    ctx.routeCandidates = verdict.decision!.options.map(o => String(o.value));
    const r = runCostInputRules(specForCommodity(placeholder)!, ctx);
    const ids = ((r as { decisions?: Decision[] }).decisions ?? []).map(d => d.id);
    expect(ids).toContain(materialQuestion);
    expect(ids).not.toContain('material.family');
  });

  it('the old placeholder asked the family with options the leaning route cannot take', () => {
    const verdict = inferCommodity(ctxFor('RUB_Grommet.stp', 'machining'));
    const ctx = ctxFor('RUB_Grommet.stp', 'machining');
    ctx.routeCandidates = verdict.decision!.options.map(o => String(o.value));
    const r = runCostInputRules(specForCommodity('machining')!, ctx);
    const fam = ((r as { decisions?: Decision[] }).decisions ?? []).find(d => d.id === 'material.family');
    expect(fam, 'the machining pack asks the family').toBeTruthy();
    expect(fam!.options.map(o => o.value)).not.toContain('rubber');
  });
});
