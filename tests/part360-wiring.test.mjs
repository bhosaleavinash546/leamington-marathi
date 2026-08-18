// Part 360 → /api/analyze wiring contract, pinned at source level.
//
// server.mjs boots a live server on import, so the prompt builder cannot be
// imported directly; like accuracy-claim.test.mjs, these assertions read the
// source. Each one pins a seam the grounded mode depends on — if a refactor
// moves it, the test names exactly which promise broke.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const part360 = readFileSync(new URL('../part360.mjs', import.meta.url), 'utf8');

describe('evidence-mode prompt contract', () => {
  it('the citation demand renders ONLY when an evidence block was supplied', () => {
    // The demand must live inside the partEvidenceText ternary, not in the
    // base prompt — otherwise every ordinary run is ordered to cite evidence
    // that does not exist.
    const m = server.match(/const evidenceBlock = partEvidenceText\s*\n\s*\? `([^`]*)`/);
    assert.ok(m, 'evidenceBlock conditional not found');
    assert.match(m[1], /EVERY idea must cite the \[E#\]\/\[W#\] evidence lines/);
    assert.match(m[1], /evidenceRefs/);
  });

  it('the idea JSON spec gates evidenceRefs on the same phrase the dossier renders', () => {
    // The spec tells the model to emit refs "ONLY when a MEASURED PART
    // EVIDENCE block is present" — so the dossier renderer must actually
    // open with that phrase, or the guard never fires.
    assert.match(server, /"evidenceRefs":\["E1","W2"\] \(ONLY when a MEASURED PART EVIDENCE block is present/);
    assert.match(part360, /MEASURED PART EVIDENCE \(UNTRUSTED DATA/);
  });
});

describe('/api/analyze grounded-mode wiring', () => {
  it('sanitises partEvidence exactly once — in the analyze handler, not elsewhere', () => {
    const hits = server.match(/let partEvidence = null;/g) || [];
    assert.equal(hits.length, 1,
      `partEvidence sanitation appears ${hits.length} times — a duplicate in another handler is dead code that will rot`);
  });

  it('evidence runs bypass the cache in both directions', () => {
    // Read and write guards must both exclude partEvidence — a cached
    // ordinary analysis must never answer an evidence-grounded request.
    const guards = server.match(/!enableSearch && !cadGeometry && !partEvidence/g) || [];
    assert.equal(guards.length, 2, 'expected cache read + write guards to both cover partEvidence');
  });

  it('the validator learns that a dossier was supplied', () => {
    assert.match(server, /const hasEvidence = !!partEvidence;/);
    assert.match(server, /validateIdeas\(parsedIdeas, \{ searchExecuted, hasEvidence \}\)/);
  });

  it('every lens is a forced emit_ideas call and all lenses merge into finishAnalysis', () => {
    const branch = server.slice(server.indexOf('if (partEvidence) {'), server.indexOf('for (let i = 0; i < 8; i++)'));
    assert.ok(branch.length > 0, 'grounded branch not found before the agentic loop');
    assert.match(branch, /tool_choice: \{ type: 'tool', name: 'emit_ideas' \}/);
    assert.match(branch, /return await finishAnalysis\(merged\)/);
    // A failed lens degrades honestly instead of sinking the run.
    assert.match(branch, /failed \(\$\{safeLlmError\(e\)\}\) — continuing with the others/);
    // The originating lens is stamped so provenance survives the merge.
    assert.match(branch, /lensId: block\.lensId/);
  });

  it('the part360 endpoints are on the large-body whitelist', () => {
    assert.match(server, /\/api\/part360\/quote-extract/);
    assert.match(server, /\/api\/part360\/dossier/);
  });
});
