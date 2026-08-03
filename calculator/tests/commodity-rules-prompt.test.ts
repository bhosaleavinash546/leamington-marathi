/**
 * The per-commodity cost-input rules are being moved out of a prompt string
 * (`buildCommodityRules` in server/routes/cad.ts) and into typed code under
 * `src/engine/cost-input-rules/`. That move must change nothing about what the
 * model is told.
 *
 * These tests hold the line: `tests/fixtures/commodity-rules-prompt/*.txt` is a
 * byte-exact baseline of every commodity block, in both the full-OCCT and the
 * degraded (STL / text-parse) geometry context. If a rule genuinely changes,
 * regenerate the baseline, review the diff, and bump CAD_PROMPT_VERSION.
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

  it('the casting yield constants still disagree with CASTING_PROCESS_REFERENCE', async () => {
    // Documents a KNOWN live defect rather than asserting correct behaviour.
    // The prompt under-charges material on three of four casting subtypes
    // (investment by ~2x, because yield divides into pour weight). This test
    // pins the discrepancy so the fix is a deliberate, reviewed change — when
    // the rule engine adopts the advisor bands, this test flips to asserting
    // agreement. See the plan's "live defect" section.
    const { CASTING_PROCESS_REFERENCE } = await import('../src/engine/modules/casting-advisor.js');
    const mid = (b: readonly [number, number]) => (b[0] + b[1]) / 2;
    const promptYield = { hpdc: 0.65, sand: 0.78, gravity: 0.85, investment: 0.90 } as const;

    expect(mid(CASTING_PROCESS_REFERENCE.hpdc.yieldBand)).toBeCloseTo(promptYield.hpdc, 2);
    expect(mid(CASTING_PROCESS_REFERENCE.sand.yieldBand)).not.toBeCloseTo(promptYield.sand, 2);
    expect(mid(CASTING_PROCESS_REFERENCE.gravity.yieldBand)).not.toBeCloseTo(promptYield.gravity, 2);
    // The big one: 0.45 vs 0.90.
    expect(mid(CASTING_PROCESS_REFERENCE.investment.yieldBand)).toBeCloseTo(0.45, 2);
  });
});
