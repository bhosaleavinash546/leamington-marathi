#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Horizon coverage instrument — landscape QUALITY, not just resolution.
//
// The old contract asserted every query resolves to >=1 technology, which let
// 41% of BOM leaves ship with 1-2-card or future-less landscapes (2026 root-
// cause audit: "resolves" is not "answers"). This script scores every BOM leaf
// and Analyze subassembly by what a cost engineer actually receives:
//
//   dead      0 technologies
//   thin      1-2 technologies (a card, not a landscape)
//   noFuture  nothing in H2/H3 (a catalogue, not a forecast)
//   ok        3+ technologies with a future lane
//
// Run: npm run horizon:coverage      CI gate: tests/foresight.test.mjs asserts
// every BOM leaf and Analyze name scores `ok` — coverage can only stay whole.
// ─────────────────────────────────────────────────────────────────────────────
import { foresightFor } from '../foresight.mjs';
import { flattenBom, ANALYZE_SYSTEMS } from '../src/data/vehicle-bom.mjs';

export function scoreQuery(q, opts = {}) {
  const r = foresightFor({ query: q }, opts);
  const fut = r.horizons.H2.length + r.horizons.H3.length;
  if (r.count === 0) return 'dead';
  if (r.count <= 2) return 'thin';
  if (fut === 0) return 'noFuture';
  return 'ok';
}

export function coverageReport(opts = {}) {
  const bomNames = flattenBom().map((l) => l.part ?? l.name ?? l);
  const analyzeNames = Object.values(ANALYZE_SYSTEMS).flat();
  const tally = (names) => {
    const t = { dead: [], thin: [], noFuture: [], ok: [] };
    for (const n of names) t[scoreQuery(n, opts)].push(n);
    return t;
  };
  return { bom: tally(bomNames), analyze: tally(analyzeNames), bomTotal: bomNames.length, analyzeTotal: analyzeNames.length };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { bom, analyze, bomTotal, analyzeTotal } = coverageReport();
  const line = (label, t, n) =>
    console.log(`${label.padEnd(24)} dead ${String(t.dead.length).padStart(3)} · thin ${String(t.thin.length).padStart(3)} · no-future ${String(t.noFuture.length).padStart(3)} · ok ${String(t.ok.length).padStart(3)}/${n} (${Math.round((100 * t.ok.length) / n)}%)`);
  console.log('\nHorizon landscape coverage (quality-scored, not just resolution):\n');
  line('BOM leaves', bom, bomTotal);
  line('Analyze subassemblies', analyze, analyzeTotal);
  const worst = [...bom.dead, ...bom.thin, ...bom.noFuture, ...analyze.dead, ...analyze.thin, ...analyze.noFuture];
  if (worst.length) {
    console.log(`\nWorst-first fix list (${worst.length}):`);
    for (const w of worst.slice(0, 40)) console.log(`  - ${w}`);
    process.exitCode = 1;
  } else {
    console.log('\nEvery part in the vehicle taxonomy receives a full landscape. Keep it that way — the CI gate enforces it.');
  }
}
