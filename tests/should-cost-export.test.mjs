// The customer-facing should-cost workbook, pinned.
//
// Two defects found by exporting a real workbook during the August 2026 audit
// and reading the bytes rather than the code:
//
//   1. It was branded "CostVision" — a product name that no longer exists —
//      on the title row of a document a customer receives.
//   2. It printed Monte-Carlo P10/P50/P90 with nothing to say what the band
//      means. A reader takes P10-P90 for an 80% confidence interval; measured
//      coverage on held-out reference parts is far below that, because the
//      band propagates INPUT uncertainty and does not bound MODEL error.
//
// A source-level check, deliberately: building the workbook needs express and
// a live DB, but both regressions are structural and visible in the source.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../routes/should-cost.mjs', import.meta.url), 'utf8');

describe('should-cost export', () => {
  it('carries the current product name, not a retired one', () => {
    assert.match(src, /'BrainSpark — Should-Cost Breakdown Structure \(CBS\)'/);
    // Retired brand must not reappear in anything the customer reads. Code
    // comments elsewhere in the repo keep it as accurate history; this file's
    // strings are the ones that ship.
    const strings = src.match(/'[^']*'/g) ?? [];
    const branded = strings.filter(s => s.includes('CostVision'));
    assert.deepEqual(branded, [], `retired brand in customer-facing strings: ${branded.join(', ')}`);
  });

  it('states where the P10–P90 band width came from', () => {
    // The band ships to customers. It must say what sizes it — and the answer
    // must stay true: the width is now measured from held-out residuals and
    // gated in CI, so the old "well below 80%" caveat would itself be a false
    // statement.
    assert.match(src, /P10–P90 basis/, 'the band ships with no explanation of what it covers');
    assert.match(src, /measured from held-out reference parts/);
    assert.doesNotMatch(src, /well below 80%/, 'stale caveat: coverage is now gated at ~80%');
  });

  it('still converts currency at the display boundary rather than relabelling EUR', () => {
    // The engine is EUR-denominated; this is the boundary. A validated currency
    // with no rate must be an error, never a silent 1:1 under a foreign label.
    assert.match(src, /const cv = \(n\) =>/);
    assert.match(src, /engine is EUR-denominated/i);
  });
});
