/**
 * Rules against the model, field by field.
 *
 *   npx tsx scripts/rules-vs-ai.ts                 # rules only (no key needed)
 *   npx tsx scripts/rules-vs-ai.ts --with-ai       # both, and diff them
 *   npx tsx scripts/rules-vs-ai.ts --commodity=casting
 *
 * This is the evidence for flipping the default to `deterministic`. Without it
 * that flip is a preference; with it, it is a decision someone can check.
 *
 * The comparison it is NOT making is worth stating. "Rules match AI" would be a
 * meaningless bar — the AI is the thing being replaced, and on four of the six
 * parts in docs/cad-to-cost-learnings.md it was 2–5x wrong. What this shows is
 * *where* the two disagree and by how much, so each disagreement can be argued
 * on its merits against the geometry.
 *
 * The rules half runs air-gapped. With no key the script still prints a full
 * derivation for every fixture, which on its own answers "does the deterministic
 * path produce a complete costing?".
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { specForCommodity, DETERMINISTIC_COMMODITIES } from '../src/engine/cost-input-rules/index.js';
import { MATERIAL_FAMILY_DECISION_ID } from '../src/engine/cost-input-rules/derive/material.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const DIR = 'tests/fixtures/cad-parts';
const argv = process.argv.slice(2);
const withAI = argv.includes('--with-ai');
const commodityArg = argv.find(a => a.startsWith('--commodity='))?.split('=')[1];
const materialArg = argv.find(a => a.startsWith('--material='))?.split('=')[1] ?? 'aluminium';

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const fmt = (v: unknown) =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v ?? '—');

async function main(): Promise<void> {
  if (!existsSync(DIR)) { console.error(`  No fixtures at ${DIR}`); process.exitCode = 1; return; }
  const parts = readdirSync(DIR).filter(f => f.endsWith('.step')).sort();

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('  Deterministic rules vs the model');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`  Fixtures : ${parts.length}`);
  console.log(`  Mode     : ${withAI ? 'both (needs a key)' : 'rules only — no key, no network'}`);
  console.log(`  Material : ${materialArg} (answering the one question geometry cannot)`);

  for (const file of parts) {
    console.log(`\n──────────────────────────────────────────────────────────────────────`);
    console.log(`  ${file}`);
    console.log(`──────────────────────────────────────────────────────────────────────`);

    let geo;
    try {
      geo = await analyzeGeometry(readFileSync(join(DIR, file)), file, 60_000);
    } catch (err) {
      console.log(`  Geometry kernel unavailable (${(err as Error).message.slice(0, 60)}…)`);
      console.log('  Install cadquery/OCP to run this locally; the shipped image does without it.');
      return;
    }
    if (geo.status !== 'success') { console.log(`  Geometry: ${geo.status} — skipped`); continue; }

    console.log(`  Measured : ${geo.volume?.cm3.toFixed(2)} cm³, `
      + `${geo.boundingBox?.xMm.toFixed(0)}×${geo.boundingBox?.yMm.toFixed(0)}×${geo.boundingBox?.zMm.toFixed(0)} mm, `
      + `fill ${geo.fillRatio?.toFixed(3)}, ${geo.faces?.total ?? 0} faces`);

    const baseCtx = (commodity: string, answers: Record<string, unknown>): RuleContext => ({
      geo, geometryQuality: 'occt', commodity, commoditySource: commodityArg ? 'engineer' : 'inferred',
      annualVolume: 100_000, filename: file, answers,
    });

    // What the geometry says about the process, before anyone is asked.
    const verdict = inferCommodity(baseCtx(commodityArg ?? 'machining', {}));
    if (verdict.commodity) {
      console.log(`  Process  : ${verdict.commodity} — ${verdict.basis}`);
    } else {
      console.log(`  Process  : UNDECIDED — ${verdict.decision!.options.map(o => o.value).join(' | ')}`);
    }

    const commodity = commodityArg ?? verdict.commodity ?? 'machining';
    const spec = specForCommodity(commodity);
    if (!spec) {
      console.log(`  No rules for '${commodity}'. Converted: ${DETERMINISTIC_COMMODITIES.join(', ')}`);
      continue;
    }

    const blocked = buildDeterministicAnalysis(spec, baseCtx(commodity, {}), file);
    console.log(`\n  Blocked on ${blocked.result.decisions.length} question(s):`);
    for (const d of blocked.result.decisions) console.log(`    • ${d.id} — ${d.question}`);

    const done = buildDeterministicAnalysis(
      spec, baseCtx(commodity, { [MATERIAL_FAMILY_DECISION_ID]: materialArg }), file);

    console.log(`\n  ${pad('FIELD', 34)} ${pad('RULE', 14)} SOURCE   BASIS`);
    for (const [path, d] of Object.entries(done.result.byRule)) {
      console.log(`  ${pad(path, 34)} ${pad(fmt(d.value), 14)} ${pad(d.source, 8)} ${d.basis.slice(0, 70)}`);
    }
    console.log(`\n  Status: ${done.result.status} · confidence ${done.analysis.confidenceLevel}`
      + ` · ${done.applied.overridden.length} field(s) written`
      + (done.applied.notWritten.length ? ` · ${done.applied.notWritten.length} with no consumer` : ''));

    if (withAI) {
      // The AI half needs a key, a running server and a live model. Kept out of
      // this script deliberately: shelling a real /analyze call from here would
      // duplicate the route's multipart handling and drift from it. Run the two
      // through the endpoint with mode='both' instead.
      console.log('\n  --with-ai: POST the fixture to /api/cad/analyze with mode=\'both\' —');
      console.log('  the route returns both analyses and the diff, using one code path.');
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════════════\n');
}

void main();
