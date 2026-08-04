/**
 * A should-cost from a CAD file, headless, with no AI in the process.
 *
 * This is the chain the tool has always been able to run in a browser and never
 * anywhere else: measure → derive → cost. Having it as a script is what makes
 * the rules arm of a rules-vs-AI comparison possible at all, and it doubles as
 * the fastest way to see what a part actually costs without clicking anything.
 *
 *   npx tsx scripts/cost-from-cad.ts <file.step> [--commodity casting] \
 *        [--answer material.family=aluminium] [--volume 100000]
 *
 * Every unanswered decision is printed rather than guessed. A part that cannot
 * be costed prints the questions and exits non-zero — that is the design.
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { toCostParams, SHOP_DEFAULTS, COSTABLE_COMMODITIES } from '../src/engine/cost-input-rules/to-cost-params.js';
import { materialFacts } from '../src/engine/cost-input-rules/derive/material.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const argv = process.argv.slice(2);
const file = argv.find(a => !a.startsWith('--'));
const flag = (name: string): string | undefined => {
  const hit = argv.find(a => a.startsWith(`--${name}=`) || a === `--${name}`);
  if (!hit) return undefined;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : argv[argv.indexOf(hit) + 1];
};

const answers: Record<string, unknown> = {};
for (const a of argv) {
  if (!a.startsWith('--answer')) continue;
  const kv = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[argv.indexOf(a) + 1];
  const [k, ...v] = kv.split('=');
  if (k && v.length) answers[k] = v.join('=');
}

if (!file || !existsSync(file)) {
  console.error('usage: tsx scripts/cost-from-cad.ts <file.step> [--commodity X] [--answer k=v]... [--volume N]');
  process.exit(2);
}

const annualVolume = Number(flag('volume') ?? SHOP_DEFAULTS.annualVolume) || SHOP_DEFAULTS.annualVolume;
const money = (n: number) => `£${n.toFixed(2)}`;

async function main(): Promise<void> {
  const name = basename(file!);
  process.stderr.write(`Measuring ${name} …\n`);
  const geo = await analyzeGeometry(readFileSync(file!), name, 300_000);
  if (geo.status !== 'success') {
    console.error(`Geometry engine failed: ${geo.error ?? 'unknown'}`);
    process.exit(1);
  }

  const baseCtx = (commodity: string): RuleContext => ({
    geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer',
    annualVolume, filename: name, answers,
  });

  let commodity = flag('commodity');
  if (!commodity) {
    const verdict = inferCommodity(baseCtx('machining'));
    if (!verdict.commodity) {
      console.error(`\nThe geometry does not settle the process. ${verdict.decision?.question}`);
      for (const o of verdict.decision?.options ?? []) console.error(`  --commodity ${o.value}   ${o.label}`);
      process.exit(3);
    }
    commodity = verdict.commodity;
    process.stderr.write(`Commodity inferred: ${commodity}\n`);
  }

  const spec = specForCommodity(commodity);
  if (!spec) {
    console.error(`No deterministic rules for '${commodity}'. Have: ${COSTABLE_COMMODITIES.join(', ')}`);
    process.exit(4);
  }

  const ctx = { ...baseCtx(commodity), commoditySource: 'engineer' as const };
  const { analysis, result } = buildDeterministicAnalysis(spec, ctx, geo.partName || name);

  console.log(`\n${'─'.repeat(74)}`);
  console.log(`  ${name}  ·  ${commodity}  ·  ${annualVolume.toLocaleString('en-GB')}/yr`);
  console.log('─'.repeat(74));
  console.log(`  Measured: ${(geo.volume?.cm3 ?? 0).toFixed(1)} cm³ · `
    + `${geo.boundingBox?.xMm.toFixed(0)}×${geo.boundingBox?.yMm.toFixed(0)}×${geo.boundingBox?.zMm.toFixed(0)} mm`);

  if (result.decisions.length) {
    console.log(`\n  ${result.decisions.length} question(s) the geometry cannot answer:\n`);
    for (const d of result.decisions) {
      console.log(`    ${d.question}`);
      console.log(`      ${d.why}`);
      for (const o of d.options) {
        console.log(`      --answer ${d.id}=${o.value}${o.leaning ? '   (likely)' : ''}`
          + (o.consequence ? `   ${o.consequence}` : ''));
      }
      console.log('');
    }
    console.log('  Not costable until these are answered — by design.');
    process.exit(5);
  }

  // The rules resolve a family; the costing layer turns that into a grade.
  const mapped = toCostParams(commodity, analysis.costInputSuggestions, annualVolume,
    materialFacts(ctx).family);
  if (!mapped) {
    console.error(`\n  No cost mapping for '${commodity}' yet (have: ${COSTABLE_COMMODITIES.join(', ')}).`);
    process.exit(4);
  }

  const cost = executeCalculateCost({
    commodity, params: mapped.params, partName: geo.partName || name,
    overheadPct: SHOP_DEFAULTS.overheadPct, marginPct: SHOP_DEFAULTS.marginPct,
    packagingPerPart: SHOP_DEFAULTS.packagingPerPart, logisticsPerPart: SHOP_DEFAULTS.logisticsPerPart,
  });
  if (!cost.success) {
    console.error(`\n  Costing failed: ${cost.error}`);
    process.exit(1);
  }

  console.log('\n  Eight-bucket breakdown');
  for (const [k, v] of Object.entries(cost.breakdown)) {
    console.log(`    ${k.padEnd(14)} ${money(v).padStart(10)}`);
  }
  console.log(`    ${'TOTAL'.padEnd(14)} ${money(cost.total).padStart(10)}`);

  console.log('\n  Derivation');
  for (const [fieldId, p] of Object.entries(result.provenance)) {
    console.log(`    ${fieldId.padEnd(22)} ${String(p.value).padEnd(14)} ${p.basis}`);
  }
  console.log(`\n  Assumed (not measured): ${mapped.assumed.join(', ')}`);
  console.log(`${'─'.repeat(74)}\n`);
}

void main();
