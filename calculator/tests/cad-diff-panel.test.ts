/**
 * The rules-vs-AI panel.
 *
 * `mode:'both'` has been computing this comparison and returning it in the
 * response since Stage 8, with nothing on the client reading the key — so the
 * "Compare — rules vs AI" option produced an ordinary analysis and no
 * comparison. These tests defend the panel that closes that, and in particular
 * the two editorial decisions in it: disagreements lead and agreements fold,
 * and every disagreement carries the rule's basis so it can be argued rather
 * than just believed.
 */
import { describe, it, expect } from 'vitest';
import { buildRuleVsAIPanel, type CADDiff, type CADFieldDiff } from '../src/ui/cad-diff-panel.js';

const row = (over: Partial<CADFieldDiff>): CADFieldDiff => ({
  field: 'netWeightKg', ruleValue: 4.5, aiValue: 13.5, deltaPct: -0.667,
  basis: '1667 cm³ × 0.0027 kg/cm³ (PP, from the filename)', verdict: 'differ', ...over,
});

const diff = (over: Partial<CADDiff> = {}): CADDiff => ({
  diffs: [row({})], agreed: 12, differed: 1, ruleOnly: 0, aiOnly: 0, undecided: [], ...over,
});

describe('rules-vs-AI panel', () => {
  describe('when there is nothing to compare', () => {
    it('renders nothing at all rather than an empty panel', () => {
      // Every mode except 'both' sends diff: null. A visible-but-empty panel
      // would read as "the comparison ran and found nothing".
      expect(buildRuleVsAIPanel(null)).toBe('');
      expect(buildRuleVsAIPanel(diff({ diffs: [] }))).toBe('');
    });
  });

  describe('a disagreement', () => {
    it('shows the field, both values and the signed gap', () => {
      const html = buildRuleVsAIPanel(diff());
      expect(html).toContain('netWeightKg');
      expect(html).toContain('4.5');
      expect(html).toContain('13.5');
      expect(html).toContain('-67%');
    });

    it('carries the rule’s basis, which is the whole point', () => {
      // A gap with no basis is an alarm. A gap with a basis is an argument.
      expect(buildRuleVsAIPanel(diff())).toContain('1667 cm³ × 0.0027 kg/cm³');
    });

    it('leads with the biggest gap', () => {
      const html = buildRuleVsAIPanel(diff({
        diffs: [
          row({ field: 'small.gap', deltaPct: 0.04 }),
          row({ field: 'huge.gap', deltaPct: -6.4 }),
          row({ field: 'mid.gap', deltaPct: 0.8 }),
          row({ field: 'unquantified', deltaPct: null, ruleValue: 'hpdc', aiValue: 'sand' }),
        ],
      }));
      const at = (f: string) => html.indexOf(f);
      expect(at('huge.gap')).toBeLessThan(at('mid.gap'));
      expect(at('mid.gap')).toBeLessThan(at('small.gap'));
      // A gap that cannot be sized is still a gap, but it sorts last.
      expect(at('small.gap')).toBeLessThan(at('unquantified'));
    });

    it('groups the big integers', () => {
      // Tooling costs and tool lives live here. 96400 is one glance from
      // 964000, and that is an order of magnitude on the priciest line.
      const html = buildRuleVsAIPanel(diff({
        diffs: [row({ field: 'toolingCost', ruleValue: 96_400, aiValue: 1_000_000, deltaPct: -0.9 })],
      }));
      expect(html).toContain('96,400');
      expect(html).toContain('1,000,000');
      // ...but a cycle time in seconds is not a quantity anyone groups.
      expect(buildRuleVsAIPanel(diff({
        diffs: [row({ ruleValue: 6240, aiValue: 4500, deltaPct: 0.39 })],
      }))).toContain('6240');
    });

    it('names an AI zero instead of printing Infinity', () => {
      const html = buildRuleVsAIPanel(diff({
        diffs: [row({ aiValue: 0, deltaPct: Infinity })],
      }));
      expect(html).toContain('AI said 0');
      expect(html).not.toContain('Infinity');
    });
  });

  describe('what folds away', () => {
    it('keeps agreements and one-sided fields behind a details block', () => {
      const html = buildRuleVsAIPanel(diff({
        diffs: [
          row({}),
          row({ field: 'casting.dieLife', verdict: 'rule-only', aiValue: undefined, deltaPct: null }),
          row({ field: 'someAIField', verdict: 'ai-only', ruleValue: undefined, deltaPct: null }),
        ],
        agreed: 12, ruleOnly: 1, aiOnly: 1,
      }));
      const details = html.indexOf('<details');
      expect(details).toBeGreaterThan(-1);
      expect(html).toContain('12 agree');
      // Both one-sided fields are listed, and both are inside the fold —
      // context, not findings.
      expect(html.indexOf('casting.dieLife')).toBeGreaterThan(details);
      expect(html.indexOf('someAIField')).toBeGreaterThan(details);
      // ...while the real disagreement stays above it.
      expect(html.indexOf('netWeightKg')).toBeLessThan(details);
    });
  });

  describe('the questions the rules refused', () => {
    it('says the model answered them anyway', () => {
      const html = buildRuleVsAIPanel(diff({ undecided: ['material.family', 'service.safetyCritical'] }));
      expect(html).toContain('2 questions the rules refused to answer');
      expect(html).toContain('anyway');
    });

    it('omits the line when there were none', () => {
      expect(buildRuleVsAIPanel(diff())).not.toContain('refused to answer');
    });
  });

  describe('escaping', () => {
    it('escapes field names and basis text', () => {
      // The basis is engine-authored, but it interpolates measured values and
      // filenames — an uploaded part called `<img onerror=…>.step` reaches here.
      const html = buildRuleVsAIPanel(diff({
        diffs: [row({ field: '<script>x</script>', basis: 'from "<img src=x onerror=alert(1)>.step"' })],
      }));
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img src=x');
    });
  });
});
