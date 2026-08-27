// Deep Research (DR-1..DR-5): the pieces that make depth believable.
//
// The brief was PhD-level research — search widely, verify, then report. What
// separates that from retrieval is testable, and these tests pin it:
// contradictions are surfaced rather than resolved silently, corroboration
// counts distinct ORIGINS rather than article counts, the loop stops when it
// stops learning, the ledger records what was skipped, and nothing reaches the
// register without a figure and a second source (or a patent claim).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFigure, claimKey, numericConflicts, assessIndependence,
  unansweredQuestions, ledgerRow, deepFindingsToCandidates,
  deepResearch, DEPTH_PRESETS,
} from '../foresight-deep.mjs';
import { extractParameters, extractClaims, originOf, minePatents, filingProfile } from '../foresight-patents.mjs';

// ── DR-3: contradictions ─────────────────────────────────────────────────────
describe('contradictions are reported, never resolved silently', () => {
  const claim = (value, origin, extra = {}) => ({
    metric: 'energy density Wh/kg', subject: 'CATL Qilin NMC pack', value,
    origin, sourceUrl: `https://${origin}/x`, quote: `states ${value}`, ...extra,
  });

  it('flags a real disagreement and keeps BOTH figures with their sources', () => {
    const k = numericConflicts([claim('255 Wh/kg', 'a.com'), claim('240 Wh/kg', 'b.com')]);
    assert.equal(k.length, 1);
    assert.equal(k[0].low.value, '240 Wh/kg');
    assert.equal(k[0].high.value, '255 Wh/kg');
    assert.equal(k[0].low.origin, 'b.com');
    assert.equal(k[0].high.origin, 'a.com');
    assert.ok(k[0].spreadPct >= 5);
  });

  it('ignores rounding-level differences so real conflicts stay visible', () => {
    assert.equal(numericConflicts([claim('100', 'a.com'), claim('102', 'b.com')]).length, 0);
  });

  it('does not compare figures about different things', () => {
    const a = { ...claim('255 Wh/kg', 'a.com'), subject: 'Qilin NMC' };
    const b = { ...claim('160 Wh/kg', 'b.com'), subject: 'Qilin LFP' };
    assert.equal(numericConflicts([a, b]).length, 0, 'compared two different packs');
  });

  it('parses figures out of messy value strings', () => {
    assert.equal(parseFigure('~255 Wh/kg'), 255);
    assert.equal(parseFigure('-40 °C'), -40);
    assert.equal(parseFigure('no figure'), null);
    assert.equal(claimKey({ metric: 'Energy Density', subject: 'Qilin Pack' }), 'energy density|qilin pack');
  });
});

// ── DR-4: independence + ledger ──────────────────────────────────────────────
describe('corroboration counts origins, not articles', () => {
  it('twenty rewrites of one press release are ONE origin', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      metric: 'range km', subject: 'X', value: '1000 km', origin: 'catl.com', sourceUrl: `https://catl.com/${i}`,
    }));
    const out = assessIndependence(many);
    assert.ok(out.every((c) => c.origins === 1), 'one origin was counted as many');
    assert.ok(out.every((c) => c.independent === false));
  });

  it('two distinct origins agreeing IS corroboration', () => {
    const out = assessIndependence([
      { metric: 'range km', subject: 'X', value: '1000 km', origin: 'a.com' },
      { metric: 'range km', subject: 'X', value: '1000 km', origin: 'b.com' },
    ]);
    assert.ok(out.every((c) => c.independent && c.origins === 2));
  });

  it('the ledger records what was skipped and why', () => {
    const row = ledgerRow(
      { url: 'https://a.com/x', origin: 'a.com', read: false, readError: 'http 403', round: 2, selectedBecause: 'probe "x"' },
      [],
    );
    assert.equal(row.read, false);
    assert.equal(row.skippedBecause, 'http 403');
    assert.equal(row.claimsContributed, 0);
    assert.match(row.selectedBecause, /probe/);
  });

  it('the ledger attributes claims to the source that produced them', () => {
    const row = ledgerRow({ url: 'https://a.com/x', origin: 'a.com', read: true, chars: 900 },
      [{ sourceUrl: 'https://a.com/x', value: '5 mm' }, { sourceUrl: 'https://a.com/x', value: '' }, { sourceUrl: 'https://b.com/y', value: '9' }]);
    assert.equal(row.claimsContributed, 2);
    assert.equal(row.withFigures, 1);
  });
});

// ── DR-1: patents ────────────────────────────────────────────────────────────
describe('patent mining reads claims, not abstracts', () => {
  // A realistic claim: the module requires >=120 chars before it will call
  // something a claim section, which is correct — no granted claim is shorter.
  const doc = 'Head\n\nClaims\n\n1. A stator core for a traction machine, comprising a stack of laminations '
    + 'having a thickness of 0.15 mm and a yield strength above 960 MPa, wherein iron loss is reduced by 22% '
    + 'at 20000 rpm relative to a 0.25 mm reference stack, and wherein the stack is bonded rather than interlocked.'
    + '\n\nDescription\n\nirrelevant 777 mm filler';

  it('isolates the claim section and excludes the description', () => {
    const c = extractClaims(doc);
    assert.ok(c && c.includes('0.15 mm'));
    assert.ok(!c.includes('777 mm'), 'description leaked into claims');
  });

  it('returns null when a document has no claims rather than passing prose off as claims', () => {
    assert.equal(extractClaims('just prose with no claim marker'), null);
    assert.equal(extractClaims(''), null);
  });

  it('extracts technical parameters with the sentence each came from', () => {
    const p = extractParameters(extractClaims(doc));
    const kinds = p.map((x) => x.kind);
    for (const k of ['dimension', 'pressure', 'rate', 'proportion']) assert.ok(kinds.includes(k), `missed ${k}`);
    assert.ok(p.every((x) => x.context.length > 0), 'a figure lost its context');
  });

  it('says so plainly when no patent key is configured', async () => {
    const out = await minePatents('stator lamination', { searchPatents: async () => ({ configured: false, patents: [] }) });
    assert.equal(out.configured, false);
    assert.equal(out.patents.length, 0);
    assert.match(out.note, /PATENTSVIEW_API_KEY/);
  });

  it('opens patents and records whether parameters came from claims or an abstract', async () => {
    const html = `<html><body><article><p>Claims</p><p>1. A core with laminations of 0.15 mm and 960 MPa yield, ${'padding text. '.repeat(40)}</p><p>Description</p></article></body></html>`;
    const out = await minePatents('lamination', {
      searchPatents: async () => ({ configured: true, patents: [{ number: '1', title: 'T', date: '2025-01-01', assignee: 'Baowu', snippet: 'abs', url: 'https://patents.google.com/patent/US1' }] }),
      fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => html }),
    });
    assert.equal(out.configured, true);
    assert.equal(out.read, 1);
    assert.ok(out.patents[0].parameters.length > 0);
    assert.equal(originOf(out.patents[0].url), 'google.com');
  });

  it('profiles filings by year and assignee without asserting a trend', () => {
    const p = filingProfile([{ year: 2025, assignee: 'CATL' }, { year: 2025, assignee: 'CATL' }, { year: 2023, assignee: 'BYD' }]);
    assert.equal(p.byYear[2025], 2);
    assert.equal(p.topAssignees[0].name, 'CATL');
    assert.deepEqual(p.span, { from: 2023, to: 2025 });
  });
});

// ── DR-2: the loop ───────────────────────────────────────────────────────────
describe('the research loop', () => {
  const PAGE = `<html><head><title>Thin gauge report</title><meta name="date" content="2025-09-01"></head><body><article>
    <p>Xiaomi V8s EVO runs 0.15 mm laminations at 960 MPa yield in 2025 production.</p>
    <p>${'Iron loss falls 22 percent versus 0.25 mm at 20000 rpm. '.repeat(20)}</p></article></body></html>`;

  const makeDeps = (over = {}) => ({
    performSearch: async () => ([{ title: 'Thin gauge report', url: 'https://good.example/2025/09/thin', snippet: 'blurb', source: 'good.example' }]),
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => PAGE }),
    searchPatents: null,
    client: {},
    model: 'test',
    searchApiKey: 'brave-key',
    messagesJson: async (_c, req) => {
      if (req.toolName === 'emit_research_scope') {
        return { questions: [{ id: 'q1', question: 'What gauge?', why: 'cost', searchTerms: ['gauge'] }] };
      }
      if (req.toolName === 'emit_source_claims') {
        return {
          answersQuestions: ['q1'],
          claims: [
            { questionId: 'q1', statement: 'runs 0.15 mm laminations', metric: 'dimension', value: '0.15 mm', subject: 'Xiaomi V8s EVO', quote: 'Xiaomi V8s EVO runs 0.15 mm laminations at 960 MPa yield in 2025 production.', confidence: 'stated' },
            { questionId: 'q1', statement: 'INVENTED', metric: 'dimension', value: '0.01 mm', subject: 'Nobody', quote: 'Toyota ships 0.01 mm amorphous cores across all models today.', confidence: 'stated' },
          ],
        };
      }
      if (req.toolName === 'emit_research_gaps') return { unanswered: [] };
      if (req.toolName === 'emit_research_report') {
        return { summary: 's', sections: [{ questionId: 'q1', heading: 'Gauge', findings: 'f [c1]' }], trajectory: 't', couldNotEstablish: 'x' };
      }
      return {};
    },
    ...over,
  });

  it('runs end to end and drops claims whose quote is not in the page', async () => {
    const out = await deepResearch('stator lamination', makeDeps(), { depth: 'quick' });
    assert.equal(out.claims.length, 1, 'the invented claim survived quote-or-drop');
    assert.equal(out.claims[0].value, '0.15 mm');
    assert.ok(out.report, 'no report produced');
    assert.equal(out.stats.sourcesRead, 1);
    assert.equal(out.ledger.length, 1);
    assert.equal(out.ledger[0].claimsContributed, 1);
  });

  it('always declares the paywall limitation, whatever else succeeded', async () => {
    const out = await deepResearch('x subject', makeDeps(), { depth: 'quick' });
    assert.ok(out.limitations.some((l) => /SAE Mobilus|IEEE|ScienceDirect/.test(l)),
      'the report did not admit that paid databases were never searched');
  });

  it('declares a missing search provider rather than implying full coverage', async () => {
    const out = await deepResearch('x subject', makeDeps({ searchApiKey: '' }), { depth: 'quick' });
    assert.ok(out.limitations.some((l) => /No web-search provider/.test(l)));
  });

  it('stops early when every question is answered instead of burning rounds', async () => {
    const out = await deepResearch('stator lamination', makeDeps(), { depth: 'deep' });
    assert.ok(out.rounds.length < DEPTH_PRESETS.deep.rounds, `ran ${out.rounds.length} rounds with nothing left to learn`);
  });

  it('never returns page bodies in its result', async () => {
    const out = await deepResearch('stator lamination', makeDeps(), { depth: 'quick' });
    assert.ok(out.sources.every((s) => s.text === undefined), 'raw page text leaked into the result');
  });

  it('reports unanswered questions rather than quietly dropping them', () => {
    const qs = [{ id: 'a' }, { id: 'b' }];
    const open = unansweredQuestions(qs, [{ questionId: 'a' }, { questionId: 'a' }]);
    assert.deepEqual(open.map((x) => x.id), ['b']);
  });
});

// ── DR-5: the flywheel ───────────────────────────────────────────────────────
describe('only earned findings reach the register', () => {
  const deep = (claims, contradictions = []) => ({ claims, contradictions });

  it('promotes an independently corroborated finding that carries a figure', () => {
    const c = deepFindingsToCandidates(deep([
      { id: 'c1', subject: 'Thin gauge cores', metric: 'dimension', value: '0.15 mm', statement: 's', origin: 'a.com', sourceUrl: 'https://a.com/1', independent: true, origins: 2 },
    ]), { verifiedOn: '2026-08' });
    assert.equal(c.length, 1);
    assert.equal(c[0].lastVerified, '2026-08');
    assert.equal(c[0].evidenceUrl, 'https://a.com/1');
    assert.match(c[0].promotionBasis, /2 independent origins/);
  });

  it('refuses a single-origin finding — one outlet is not corroboration', () => {
    assert.equal(deepFindingsToCandidates(deep([
      { id: 'c1', subject: 'Rumour', metric: 'm', value: '5', statement: 's', origin: 'a.com', independent: false, origins: 1 },
    ])).length, 0);
  });

  it('refuses a finding with no figure — a technology without a number is a rumour', () => {
    assert.equal(deepFindingsToCandidates(deep([
      { id: 'c1', subject: 'Vague thing', metric: '', value: '', statement: 's', origin: 'a.com', independent: true, origins: 3 },
    ])).length, 0);
  });

  it('accepts a patent claim on its own — it is a primary source', () => {
    const c = deepFindingsToCandidates(deep([
      { id: 'c1', subject: 'US999', metric: 'dimension', value: '0.10 mm', statement: 's', origin: 'google.com', sourceUrl: 'https://p/1', fromPatentClaims: true, origins: 1 },
    ]));
    assert.equal(c.length, 1);
    assert.match(c[0].promotionBasis, /patent claims/);
  });

  it('marks a contested finding so a curator sees the disagreement first', () => {
    const c = deepFindingsToCandidates(deep(
      [{ id: 'c1', subject: 'Qilin pack', metric: 'wh/kg', value: '255', statement: 's', origin: 'a.com', independent: true, origins: 2 }],
      [{ subject: 'Qilin pack', metric: 'wh/kg' }],
    ));
    assert.equal(c[0].contested, true);
  });

  it('leaves curator-only fields explicitly unfilled rather than guessing them', () => {
    const c = deepFindingsToCandidates(deep([
      { id: 'c1', subject: 'X', metric: 'm', value: '1', statement: 's', origin: 'a.com', independent: true, origins: 2 },
    ]));
    assert.ok(c[0].needsCuration.includes('commodity'));
    assert.match(c[0].replaces, /curator/);
  });
});
