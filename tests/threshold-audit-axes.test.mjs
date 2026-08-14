// The citation axis and the register axis are different questions, and
// conflating them produced the August 2026 audit's most wrong finding.
//
// The audit read "212 unaudited · 6% primary-document-read · 27 rules cite a
// named standard nobody has read" and reported it as the sourcing position of
// the catalogue. It is not. That output describes REGISTER COVERAGE — how many
// rules a curator has independently re-reviewed. The catalogue's own citations
// tell a different and much better story: 38 rules record reading the primary
// document first-hand, and exactly 2 admit they did not.
//
// These tests pin both axes and the invariant that matters most: no rule may
// claim a stronger provenance than its citation supports.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DFM_RULES } from '../dfm-rule-catalogue.mjs';

const srcOf = (r) => String(r.source ?? '').replace(/\s+/g, ' ');
const citationOf = (r) => {
  const t = srcOf(r);
  if (!t.trim()) return 'no-citation';
  if (/not been read first-hand|has NOT been read|not read first-hand/i.test(t)) return 'named-not-read';
  if (/READ FIRST-HAND|read first-hand/i.test(t)) return 'read-first-hand';
  if (/NADCA|SFSA|ISO\s*8062|DIN\s*16742|ISO\s*2768|ISO\s*286\b|#402|ASTM|VDI|SAE/i.test(t)) return 'names-standard';
  return 'stated-guidance';
};

describe('catalogue sourcing integrity', () => {
  it('NO rule claims a stronger provenance than its citation supports', () => {
    // The one that would actually matter: a threshold graded as coming from a
    // published standard while its source text is only guidance.
    const overclaiming = DFM_RULES.filter(
      r => r.sourceStatus === 'standard-named' && citationOf(r) === 'stated-guidance',
    );
    assert.deepEqual(
      overclaiming.map(r => r.id), [],
      'a rule is presented to customers as standard-backed on guidance-level sourcing',
    );
  });

  it('every rule carries source text — none are bare numbers', () => {
    const bare = DFM_RULES.filter(r => citationOf(r) === 'no-citation');
    assert.deepEqual(bare.map(r => r.id), []);
  });

  it('rules that did NOT read their cited document say so themselves', () => {
    const notRead = DFM_RULES.filter(r => citationOf(r) === 'named-not-read');
    // Two today, both permanent-mould minimum cored-hole rules taking a NADCA
    // figure second-hand from a design guide. If this grows, a rule started
    // citing a document nobody opened.
    assert.ok(notRead.length <= 2, `unread-standard citations grew to ${notRead.length}: ${notRead.map(r => r.id)}`);
    for (const r of notRead) assert.match(srcOf(r), /not been read first-hand/i);
  });

  it('the standards uploaded and encoded are actually reachable by the engine', () => {
    // Six modules were built from the primary documents. If dfm-rules.mjs stops
    // importing one, the catalogue keeps citing a standard the engine no longer
    // consults.
    const engine = readFileSync(new URL('../dfm-rules.mjs', import.meta.url), 'utf8');
    for (const m of ['nadca-die-casting', 'nadca-402', 'sfsa-steel-casting',
      'sfsa-supplement-3', 'iso-8062-4', 'din-16742']) {
      assert.match(engine, new RegExp(`${m}\\.mjs`), `dfm-rules.mjs no longer imports ${m}`);
    }
  });
});

describe('reader-facing grade labels', () => {
  const report = readFileSync(new URL('../src/services/dfm-report.ts', import.meta.url), 'utf8');
  const studio = readFileSync(new URL('../src/pages/DfmStudioPage.tsx', import.meta.url), 'utf8');

  it('do not tell customers a standard was unread when 36 of 38 were read', () => {
    for (const [name, src] of [['dfm-report.ts', report], ['DfmStudioPage.tsx', studio]]) {
      assert.doesNotMatch(
        src, /'standard-named':\s*'[^']*not read first-hand/i,
        `${name} understates the catalogue's own sourcing to the reader`,
      );
    }
  });

  it('still distinguish a published standard from industry consensus', () => {
    // The fix must not flatten the grades into one flattering label.
    for (const src of [report, studio]) {
      assert.match(src, /'industry-consensus':\s*'[^']*(consensus|no primary source)/i);
    }
  });
});
