#!/usr/bin/env node
// BrainSpark Horizon — register curation inbox (npm run horizon:audit).
//
// Prints the self-audit of the foresight register: which entries are weakest
// and WHY, how global (China-frontier) the sourcing is, evidence freshness,
// and which coverage queries resolve only via generic-term noise. This is the
// quarterly re-curation worklist — fix worst-first, then re-run.
import { auditRegister, auditQueryPrecision } from '../foresight-audit.mjs';
import { REGISTER_VINTAGE } from '../foresight.mjs';

const FLAG_HELP = {
  'no-evidence': 'no firstProduction/regAnchor despite claimed maturity',
  'few-players': '<3 named players — a one-player trend is a press release',
  'no-china-frontier': 'no China-based player/programme referenced — was the global frontier checked?',
  'stale-evidence': `newest cited year ≤ ${REGISTER_VINTAGE - 3} — refresh with a current programme`,
  'thin-matchterms': '<4 matchTerms — real part names may not reach this entry',
  'short-note': 'note too thin to brief a cost engineer',
};

const a = auditRegister();
console.log('═══ BrainSpark Horizon — register self-audit ═══');
console.log(`register vintage ${REGISTER_VINTAGE} · ${a.total} entries · ${a.flaggedCount} flagged · China-frontier coverage ${a.chinaCoveragePct}%`);
console.log('\nFlag totals:');
for (const [f, n] of Object.entries(a.byFlag).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${String(n).padStart(3)}  ${f.padEnd(19)} ${FLAG_HELP[f]}`);
}
console.log('\nCuration inbox — worst first (top 20):');
for (const e of a.inbox.slice(0, 20)) {
  console.log(`  ${e.id.padEnd(26)} [${e.commodity.padEnd(10)}] ${e.flags.join(', ')}`);
}

const QUERIES = [
  'hv battery pack', '48v mhev battery', 'stator rotor lamination', 'inverter', 'brake disc',
  'suspension', 'seats', 'headlamps', 'wiring harness', 'heat pump', 'diff lock', 'terrain response',
  'driver monitoring', 'fuel cell stack', '12v battery', 'digital key', 'airbag', 'tailgate',
  'battery', 'motor', 'sensor', 'display',
];
const q = auditQueryPrecision(QUERIES);
console.log(`\nQuery precision: ${q.checked} probes, ${q.weak.length} weak (generic-tie / no-match):`);
for (const w of q.weak) console.log(`  "${w.query}" → ${w.reason} (top=${w.top ?? '—'}, tied=${w.tied ?? 0})`);
if (!q.weak.length) console.log('  none — all probes resolve with specific term matches');
console.log('\nDiscipline: fix worst-first, cite evidence for every change, re-run. The tests gate regression — the register can only get healthier.');

// Ontology blindness — which commodities can still only see part swaps.
{
  const { auditRegister } = await import('../foresight-audit.mjs');
  const a = auditRegister();
  console.log(`\nOntology mix: ${JSON.stringify(a.byKind)} — ${a.nonSubstitutionPct}% non-substitution`);
  if (a.ontologyBlindCommodities.length) {
    console.log('Commodities that can still ONLY see part swaps (worst-first):');
    for (const c of a.ontologyBlindCommodities) {
      console.log(`  ${c.commodity.padEnd(12)} ${c.entries} entries, 0 function/orchestration/lifecycle`);
    }
    console.log('  -> run a Horizon query on any part in these and read the FORWARD RESEARCH block:');
    console.log('     the plan now probes lifecycle, orchestration and function angles explicitly.');
  } else {
    console.log('Every commodity carries at least one non-substitution technology.');
  }
}
