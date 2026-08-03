/**
 * The per-commodity cost-input rules now LIVE in `src/engine/cost-input-rules/`,
 * and `buildCommodityRules` renders them. There is one set of rules; the prompt
 * is a report of what they computed rather than a second copy of them.
 *
 * `tests/fixtures/commodity-rules-prompt/*.txt` is a byte-exact baseline of
 * every commodity block in both the full-OCCT and the degraded (STL /
 * text-parse) geometry context. Its job is no longer "prove nothing changed" —
 * the move deliberately corrected about a dozen constants — but "make every
 * change visible". Regenerate, read the diff, satisfy yourself each moved line
 * is a fix you can name, and bump CAD_PROMPT_VERSION.
 *
 *   npx tsx scripts/snapshot-commodity-rules.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = 'tests/fixtures/commodity-rules-prompt';

describe('commodity cost-input rules — prompt baseline', () => {
  it('has a baseline for every commodity with an explicit rule block', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.txt')).sort();
    // 12 commodity cases + the default branch.
    expect(files.length).toBe(13);
    for (const must of ['casting.txt', 'forging.txt', 'machining.txt',
                        'injection_moulding.txt', 'sheet_metal.txt', '__default__.txt']) {
      expect(files).toContain(must);
    }
  });

  it('renders byte-identically to the captured baseline', () => {
    // Delegates to the snapshot script so there is exactly one renderer and one
    // set of geometry contexts — a second copy here would be the very drift
    // this test exists to prevent.
    expect(() =>
      execFileSync('npx', ['tsx', 'scripts/snapshot-commodity-rules.ts', '--check'],
        { stdio: 'pipe', encoding: 'utf8' }),
    ).not.toThrow();
  }, 60_000);

  it('covers both the full-OCCT and the degraded geometry branch', () => {
    // Nearly every rule line is a ternary on "did OCCT measure this?". The
    // degraded branch is the one that historically breaks (STL uploads), so the
    // baseline must exercise it.
    for (const f of readdirSync(DIR).filter(x => x.endsWith('.txt'))) {
      const body = readFileSync(join(DIR, f), 'utf8');
      expect(body, f).toContain('### context: full');
      expect(body, f).toContain('### context: degraded');
    }
  });

  it('the casting yield the prompt carries now IS the documented band', async () => {
    // This test was written to flip, and this is the flip. It used to pin a live
    // defect: the prompt's flat yield constants disagreed with
    // CASTING_PROCESS_REFERENCE on three of four subtypes — investment by ~2x,
    // which under-charged the metal, because yield divides into pour weight.
    // The prompt is now rendered from the rules, and the rules read the band.
    const { CASTING_PROCESS_REFERENCE } = await import('../src/engine/modules/casting-advisor.js');
    const mid = (b: readonly [number, number]) => (b[0] + b[1]) / 2;
    const oldPromptConstants = { hpdc: 0.65, sand: 0.78, gravity: 0.85, investment: 0.90 } as const;

    // The reference is unchanged — it was always the trustworthy side.
    expect(mid(CASTING_PROCESS_REFERENCE.investment.yieldBand)).toBeCloseTo(0.45, 2);

    // And the rendered casting block now states the band midpoint for whichever
    // subtype the advisor picked, not one of the four flat numbers above.
    const body = readFileSync(join(DIR, 'casting.txt'), 'utf8');
    const rendered = /yieldFraction=([\d.]+)/.exec(body);
    expect(rendered, 'casting block should state a yield').not.toBeNull();
    const value = Number(rendered![1]);
    const bands = Object.values(CASTING_PROCESS_REFERENCE).map(r => mid(r.yieldBand));
    expect(bands.map(b => Math.round(b * 100) / 100)).toContain(Math.round(value * 100) / 100);

    // Sand, gravity and investment can no longer appear at their old values.
    for (const wrong of [oldPromptConstants.sand, oldPromptConstants.gravity, oldPromptConstants.investment]) {
      expect(body, `stale yield ${wrong}`).not.toContain(`yieldFraction=${wrong}`);
    }
  });

  it('renders every commodity cleanly in both geometry contexts', () => {
    // The cheapest possible guard against a rule that throws, divides by zero or
    // formats a null: `undefined`, `NaN` and `Infinity` must never reach a
    // prompt, and the degraded (STL) branch is where they historically do.
    for (const f of readdirSync(DIR).filter(x => x.endsWith('.txt'))) {
      const body = readFileSync(join(DIR, f), 'utf8');
      expect(body, f).not.toMatch(/undefined|NaN|Infinity|\[object Object\]/);
      // Both context blocks must have content under them, not just a header.
      for (const ctx of ['full', 'degraded']) {
        const block = body.split(`### context: ${ctx}`)[1] ?? '';
        expect(block.trim().length, `${f} ${ctx}`).toBeGreaterThan(40);
      }
    }
  });

  it('tells the model which lines are its job and which are already settled', () => {
    const body = readFileSync(join(DIR, 'casting.txt'), 'utf8');
    expect(body).toContain('will REPLACE whatever you return for them');
    expect(body).toContain('Lines marked UNDECIDED are yours to answer');
  });
});
