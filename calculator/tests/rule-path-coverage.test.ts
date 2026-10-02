/**
 * Every rule path must reach the headless costing, or say why it does not.
 *
 * The screen takes a rule's value by its form field id; the headless path
 * (bulk runs, the real-parts baseline, the deterministic CAD branch) takes it
 * only through `RULE_PATH_MAP`. A rule with no mapping is costed on screen and
 * silently dropped headless. Found 2 Oct 2026: the sand core rule put £1.50 into
 * the Casting Bracket's material on screen and nothing headless, and the
 * sheet-metal cut length, press and BIW line never reached headless at all.
 */
import { describe, it, expect } from 'vitest';
import { RULE_SPECS } from '../src/engine/cost-input-rules/index.js';
import { RULE_PATH_MAP, RULE_PATHS_NOT_COSTED_HEADLESS, applyRuleDecisions } from '../src/engine/cost-input-rules/apply.js';
import type { CostInputRuleResult } from '../src/engine/cost-input-rules/types.js';

const allPaths = [...new Set(Object.values(RULE_SPECS).flatMap(s => s.rules.map(r => r.path)))];

describe('rule path coverage', () => {
  it('every rule path is mapped or excused with a reason', () => {
    const orphans = allPaths.filter(p => !RULE_PATH_MAP[p] && !RULE_PATHS_NOT_COSTED_HEADLESS[p]);
    expect(orphans).toEqual([]);
  });

  it('no path is both mapped and excused', () => {
    expect(Object.keys(RULE_PATHS_NOT_COSTED_HEADLESS).filter(p => RULE_PATH_MAP[p])).toEqual([]);
  });

  it('no excuse names a path no rule produces', () => {
    expect(Object.keys(RULE_PATHS_NOT_COSTED_HEADLESS).filter(p => !allPaths.includes(p))).toEqual([]);
  });

  it('the sand core and the sheet-metal press reach costInputSuggestions', () => {
    const analysis = { costInputSuggestions: {} as Record<string, unknown> };
    const result = {
      suggestions: {
        casting: { coreCostPerPart: 1.5 },
        sheetMetal: { perimeterMm: 1940, pressId: 'press-mech-250t', pressLine: 'transfer', pressesInLine: 4, blankingMethod: 'laser', blanksPerMin: 6, drawAddendumMm: 40 },
      },
      decisions: [], trace: [], byRule: {}, provenance: {},
    } as unknown as CostInputRuleResult;
    const r = applyRuleDecisions(analysis, result);
    expect(r.notWritten).toEqual([]);
    expect(analysis.costInputSuggestions).toMatchObject({
      casting: { coreCostPerPart: 1.5 },
      sheetMetal: { perimeterMm: 1940, pressId: 'press-mech-250t', pressLine: 'transfer', pressesInLine: 4, blankingMethod: 'laser', blanksPerMin: 6, drawAddendumMm: 40 },
    });
  });
});
