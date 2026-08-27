#!/usr/bin/env node
// Horizon Phase 2 — LIVE verification of the fetch-and-read research path.
//
// This container's network policy blocks outbound page fetches, so the Phase 2
// path could only be proven here with the web stubbed at the fetch boundary.
// Run this in an environment with real outbound access to prove it end to end.
//
//   ANTHROPIC_API_KEY=sk-...  BRAVE_API_KEY=...  node scripts/horizon-live-research.mjs "stator lamination"
//
// BRAVE_API_KEY is optional but strongly recommended: without it the search
// helper falls back to an instant-answer service that returns encyclopedia
// summaries rather than technical sources, and the script will say so.
//
// It prints, for each retrieved source, whether the page was OPENED and how
// much text came back — and for each candidate, the verbatim quote that was
// checked against that page in code. Anything whose quote could not be found
// is dropped and listed under REJECTED. That is the whole mechanism, visible.
import Anthropic from '@anthropic-ai/sdk';
import { messagesJson } from '../llm-json.mjs';
import { researchFutureTechnologies } from '../foresight-research.mjs';

const subject = process.argv.slice(2).join(' ').trim() || 'stator lamination';
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('ANTHROPIC_API_KEY is required.'); process.exit(1); }
const braveKey = process.env.BRAVE_API_KEY || '';

// Same search helper shape the server injects.
async function performSearch(query, apiKey, opts = {}) {
  const locale = [opts.country ? `&country=${encodeURIComponent(opts.country)}` : '',
                  opts.searchLang ? `&search_lang=${encodeURIComponent(opts.searchLang)}` : ''].join('');
  if (apiKey?.trim()) {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6${locale}`,
        { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey.trim() }, signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const d = await r.json();
        return (d.web?.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.description || '', source: new URL(x.url).hostname }));
      }
      console.error(`  ! Brave returned ${r.status} for "${query.slice(0, 50)}"`);
    } catch (e) { console.error('  ! Brave request failed:', String(e.message).slice(0, 80)); }
  }
  return [];
}

console.log(`\n═══ Horizon live research — "${subject}" ═══`);
console.log(`search provider: ${braveKey ? 'Brave (configured)' : 'NONE — snippet quality will be poor'}\n`);
const t0 = Date.now();
const out = await researchFutureTechnologies(subject, {
  performSearch, searchPatents: null,
  client: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 300_000 }),
  messagesJson, model: process.env.CV_SMALL_MODEL || 'claude-sonnet-5',
  sanitize: (s) => s, searchApiKey: braveKey, now: new Date().getFullYear(),
  fetchImpl: globalThis.fetch, readCount: Number(process.env.CV_FORESIGHT_READ_COUNT ?? 6),
});

console.log('── RETRIEVAL ──');
console.log(out.evidence.readNote);
for (const s of out.evidence.searches) {
  const mark = s.read ? `READ  ${String(s.chars).padStart(6)} ch` : `snip  ${s.readError ? `(${s.readError})` : ''}`;
  console.log(`  ${mark}  ${s.publishedYear ?? '    '}  ${s.url}`);
}
console.log(`\n── GROUNDING ──\nkept: ${out.candidates.length}   dropped: ${out.dropped}`);
for (const r of out.rejected ?? []) console.log(`  REJECTED  ${r.name} — ${r.why}`);

console.log('\n── CANDIDATES ──');
for (const c of out.candidates) {
  console.log(`\n■ ${c.name}  [${c.kind}]  TRL~${c.trl} (est) · ${c.horizon} · ${c.sourceRead ? 'page read' : 'snippet only'}`);
  console.log(`  mechanism : ${c.whatItIs}`);
  console.log(`  figure    : ${c.quantitativeSpec || '(none)'}`);
  console.log(`  quote     : "${c.sourceQuote}"`);
  console.log(`  source    : ${c.sourceUrl}`);
}
if (out.evidenceGaps) console.log(`\n── GAPS ──\n${out.evidenceGaps}`);
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
