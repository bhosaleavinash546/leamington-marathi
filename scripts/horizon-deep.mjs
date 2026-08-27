#!/usr/bin/env node
// Horizon Deep Research — the multi-round path, run from the command line.
//
//   ANTHROPIC_API_KEY=sk-...  BRAVE_API_KEY=...  PATENTSVIEW_API_KEY=...  \
//     node scripts/horizon-deep.mjs --depth deep "stator lamination"
//
// Only ANTHROPIC_API_KEY is required. Without BRAVE_API_KEY retrieval is much
// weaker; without PATENTSVIEW_API_KEY the single richest FREE technical source
// (patent claims) is skipped. Both absences are reported in the output rather
// than hidden.
//
// Depths: quick (1 round) · standard (2 rounds, default) · deep (4 rounds).
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync } from 'node:fs';
import { messagesJson } from '../llm-json.mjs';
import { deepResearch, deepFindingsToCandidates } from '../foresight-deep.mjs';
import { searchPatents } from '../patent-search.mjs';

const args = process.argv.slice(2);
const depthIdx = args.indexOf('--depth');
const depth = depthIdx >= 0 ? args[depthIdx + 1] : 'standard';
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const subject = args.filter((a, i) => !a.startsWith('--') && i !== depthIdx + 1 && i !== outIdx + 1).join(' ').trim();
if (!subject) { console.error('usage: horizon-deep.mjs [--depth quick|standard|deep] [--out file.json] "<subject>"'); process.exit(1); }
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('ANTHROPIC_API_KEY is required.'); process.exit(1); }
const braveKey = process.env.BRAVE_API_KEY || '';

async function performSearch(query, apiKey, opts = {}) {
  const locale = [opts.country ? `&country=${encodeURIComponent(opts.country)}` : '',
                  opts.searchLang ? `&search_lang=${encodeURIComponent(opts.searchLang)}` : ''].join('');
  if (apiKey?.trim()) {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8${locale}`,
        { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey.trim() }, signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const d = await r.json();
        return (d.web?.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.description || '', source: new URL(x.url).hostname }));
      }
    } catch { /* reported as zero results, never faked */ }
  }
  return [];
}

const t0 = Date.now();
console.log(`\n═══ Horizon deep research — "${subject}" (${depth}) ═══`);
console.log(`search: ${braveKey ? 'Brave' : 'NONE'} · patents: ${process.env.PATENTSVIEW_API_KEY ? 'PatentsView' : 'NONE'}\n`);

const out = await deepResearch(subject, {
  performSearch, fetchImpl: globalThis.fetch, searchPatents,
  client: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 600_000 }),
  messagesJson, model: process.env.CV_SMALL_MODEL || 'claude-sonnet-5',
  searchApiKey: braveKey,
  onProgress: (m) => console.log(`  · ${m}`),
}, { depth });

const s = out.stats;
console.log(`\n── COVERAGE ──`);
console.log(`questions ${s.questions} · rounds ${s.rounds} · sources seen ${s.sourcesSeen} (read ${s.sourcesRead}) · distinct origins ${s.distinctOrigins}`);
console.log(`claims ${s.claims} (with figures ${s.claimsWithFigures}, independently corroborated ${s.independentClaims}) · contradictions ${s.contradictions}`);
if (s.unanswered.length) console.log(`still unanswered: ${s.unanswered.join(', ')}`);

if (out.contradictions.length) {
  console.log(`\n── DISAGREEMENTS ──`);
  for (const k of out.contradictions) {
    console.log(`  ${k.metric} for ${k.subject}: ${k.low.value} (${k.low.origin}) vs ${k.high.value} (${k.high.origin}) — ${k.spreadPct}% apart`);
  }
}

if (out.report) {
  console.log(`\n── REPORT ──\n${out.report.summary}\n`);
  for (const sec of out.report.sections) console.log(`\n### ${sec.heading}\n${sec.findings}`);
  console.log(`\n### Trajectory\n${out.report.trajectory}`);
  console.log(`\n### Could not establish\n${out.report.couldNotEstablish}`);
}

console.log(`\n── LEDGER (${out.ledger.length} sources) ──`);
for (const r of out.ledger) {
  console.log(`  ${r.read ? 'READ ' : 'skip '} r${r.round} ${String(r.claimsContributed).padStart(2)} claims  ${r.origin.padEnd(24)} ${r.url.slice(0, 70)}`);
  if (!r.read && r.skippedBecause) console.log(`         ↳ ${r.skippedBecause}`);
}

const cands = deepFindingsToCandidates(out, { verifiedOn: new Date().toISOString().slice(0, 7) });
if (cands.length) {
  console.log(`\n── REGISTER CANDIDATES (${cands.length}) ──  [curator approval required]`);
  for (const c of cands) console.log(`  ${c.name} — ${c.promotionBasis}${c.contested ? ' (CONTESTED)' : ''}`);
}

console.log(`\n── LIMITATIONS ──`);
for (const l of out.limitations) console.log(`  • ${l}`);
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (outFile) { writeFileSync(outFile, JSON.stringify(out, null, 1)); console.log(`written ${outFile}`); }
