/**
 * The rules against the model, on real parts, in pounds.
 *
 * Every AI figure quoted about this project so far has been the *documented
 * historical* number from `docs/cad-to-cost-learnings.md` — a different run, on
 * a different day, against geometry measured before several fixes landed. This
 * runs both arms on the **same measured geometry, right now**, and costs both
 * through the same mapper, so a difference in pounds is a difference in what the
 * two paths decided and nothing else.
 *
 *   npx tsx scripts/ab-compare.ts            # needs the server on :3002 and a key
 *   npx tsx scripts/ab-compare.ts --rules-only
 *
 * ## What each arm is
 *
 * **AI arm** — the geometry goes to `/api/cad/reanalyze` with `mode:'both'` and
 * **no decision answers**, which is what a user gets with nobody at the screen:
 * the model fills the material and everything else. We cost `aiOriginal`, the
 * model's reply *before* `applyRuleDecisions` corrects it. Costing the corrected
 * analysis would be the rules wearing the AI's name.
 *
 * **Rules arm** — `buildDeterministicAnalysis` with the material and service
 * answers a person would give. No model, no key, no network.
 *
 * The commodity is forced on both, so process selection is not a confounder and
 * the comparison is about the cost inputs.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { toCostParams, SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import { materialFacts } from '../src/engine/cost-input-rules/derive/material.js';
import { computeRegionalComparison } from '../src/engine/regional-rates.js';
import type { CADAnalysisResult, OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', 'tests', 'fixtures', 'cad-parts', 'real');
const SERVER = process.env.CV_SERVER ?? 'http://localhost:3002';
const VOLUME = 100_000;
const rulesOnly = process.argv.includes('--rules-only');

interface Part {
  file: string; name: string; commodity: string;
  /** The independent manual bottom-up, £/part, China ex-works @100k. */
  manual: [number, number] | null;
  /** What a person answers. The AI arm gets none of these. */
  answers: Record<string, string>;
}

const PARTS: Part[] = [
  { file: 'steering_knuckle_RH.stp', name: 'RH steering knuckle', commodity: 'casting', manual: [16, 18],
    answers: { 'material.family': 'aluminium', 'service.pressureTight': 'no',
               'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' } },
  { file: 'PRCR002.stp', name: 'Stub axle PRCR002', commodity: 'forging', manual: [30, 30],
    answers: { 'material.family': 'steel', 'service.toleranceClass': 'standard',
               'service.safetyCritical': 'yes' } },
  { file: 'Aluminium_25T_Servo_Horn.step', name: '25T servo horn', commodity: 'machining', manual: [2.2, 2.2],
    answers: { 'material.family': 'aluminium' } },
  { file: 'BUMPER.stp', name: 'Front bumper', commodity: 'injection_moulding', manual: [8, 9],
    answers: { 'material.resin': 'mat-pp-impact' } },
  { file: 'Seat_LH_Cross_Member.stp', name: 'Seat LH cross-member', commodity: 'sheet_metal', manual: [1.2, 1.6],
    answers: { 'material.family': 'steel' } },
  { file: 'Fuel_tank.STEP', name: 'Fuel tank', commodity: 'blow_moulding', manual: [20, 30],
    answers: { 'material.resin': 'mat-hdpe-blow', 'blow.capacityL': '60',
               'blow.barrierWall': 'coex', 'blow.notHollow': 'blow_moulding' } },
  { file: 'Casting_Braket.stp', name: 'Casting bracket', commodity: 'casting', manual: null,
    answers: { 'material.family': 'aluminium', 'service.pressureTight': 'no',
               'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' } },
  { file: 'Hood_Bracket.stp', name: 'Hood bracket', commodity: 'sheet_metal', manual: null,
    answers: { 'material.family': 'steel' } },
];

const money = (n: number | null) => (n == null ? '—' : `£${n.toFixed(2)}`);
const mid = (m: [number, number] | null) => (m ? (m[0] + m[1]) / 2 : null);

/** UK stack → China ex-works, which is the basis every manual figure uses. */
function toChina(breakdown: Record<string, number>): number {
  const cn = computeRegionalComparison(breakdown as never, { regions: ['CN'], baseRegion: 'UK', landed: false })[0];
  return cn?.total ?? NaN;
}

function cost(commodity: string, analysis: CADAnalysisResult, familyHint: string | null):
  { uk: number; cn: number; breakdown: Record<string, number> } | { error: string } {
  const mapped = toCostParams(commodity, analysis.costInputSuggestions, VOLUME, familyHint as never);
  if (!mapped) return { error: 'no cost mapping (missing material or commodity)' };
  const r = executeCalculateCost({
    commodity, params: mapped.params, partName: analysis.partName,
    overheadPct: SHOP_DEFAULTS.overheadPct, marginPct: SHOP_DEFAULTS.marginPct,
    packagingPerPart: SHOP_DEFAULTS.packagingPerPart, logisticsPerPart: SHOP_DEFAULTS.logisticsPerPart,
  });
  if (!r.success) return { error: r.error ?? 'costing failed' };
  return { uk: r.total, cn: toChina(r.breakdown), breakdown: r.breakdown };
}

/**
 * `aiOriginal` is the model's `costInputSuggestions`, not a whole analysis —
 * it is snapshotted at the point the diff needs it. Wrap it so both arms hand
 * `cost()` the same shape.
 */
async function aiArm(part: Part, geo: OCCTGeometry): Promise<CADAnalysisResult | { error: string }> {
  try {
    const res = await fetch(`${SERVER}/api/cad/reanalyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occtGeometry: geo, filename: part.file, commodity: part.commodity,
        annualVolume: String(VOLUME), mode: 'both', noCache: true,
      }),
    });
    const data = await res.json() as {
      success?: boolean; error?: string;
      aiOriginal?: CADAnalysisResult['costInputSuggestions'];
    };
    if (!res.ok || !data.success) return { error: data.error ?? `HTTP ${res.status}` };
    if (!data.aiOriginal) return { error: 'server returned no aiOriginal (mode not both?)' };
    return { partName: part.name, costInputSuggestions: data.aiOriginal } as CADAnalysisResult;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  const rows: string[] = [];
  const csvR: string[] = ['commodity,part,estimate,actual,source'];
  const csvA: string[] = ['commodity,part,estimate,actual,source'];

  for (const part of PARTS) {
    const path = join(DIR, part.file);
    if (!existsSync(path)) { console.log(`SKIP ${part.name} — no file`); continue; }
    process.stderr.write(`\n=== ${part.name} (${part.commodity})\n`);

    const geo = await analyzeGeometry(readFileSync(path), part.file, 300_000);
    if (geo.status !== 'success') { console.log(`FAIL ${part.name} — geometry: ${geo.error}`); continue; }

    const ctx: RuleContext = {
      geo, geometryQuality: 'occt', commodity: part.commodity, commoditySource: 'engineer',
      annualVolume: VOLUME, filename: part.file, answers: part.answers,
    };
    const spec = specForCommodity(part.commodity)!;
    const det = buildDeterministicAnalysis(spec, ctx, part.name);
    const rulesCost = det.result.decisions.length
      ? { error: `blocked: ${det.result.decisions.map(d => d.id).join(', ')}` }
      : cost(part.commodity, det.analysis, materialFacts(ctx).family);

    let aiCost: ReturnType<typeof cost> | { error: string } = { error: 'not run (--rules-only)' };
    let aiMaterial = '';
    if (!rulesOnly) {
      const ai = await aiArm(part, geo);
      if ('error' in ai) { aiCost = { error: ai.error }; }
      else {
        aiMaterial = ai.costInputSuggestions?.materialId ?? '';
        aiCost = cost(part.commodity, ai, null);
      }
    }

    const m = mid(part.manual);
    const err = (v: number) => (m ? `${((v - m) / m * 100).toFixed(0)}%` : '—');
    const rc = 'error' in rulesCost ? null : rulesCost.cn;
    const ac = 'error' in aiCost ? null : (aiCost as { cn: number }).cn;

    rows.push([
      part.name.padEnd(22),
      part.commodity.padEnd(19),
      (part.manual ? `${money(part.manual[0])}–${money(part.manual[1]).slice(1)}` : '—').padStart(13),
      (rc == null ? ('error' in rulesCost ? rulesCost.error.slice(0, 22) : '') : money(rc)).padStart(24),
      (rc == null ? '' : err(rc)).padStart(7),
      (ac == null ? ('error' in aiCost ? (aiCost as { error: string }).error.slice(0, 22) : '') : money(ac)).padStart(24),
      (ac == null ? '' : err(ac)).padStart(7),
      aiMaterial,
    ].join(' '));

    if (m && rc != null) csvR.push(`${part.commodity},${part.name},${rc.toFixed(2)},${m},rules`);
    if (m && ac != null) csvA.push(`${part.commodity},${part.name},${ac.toFixed(2)},${m},ai`);
  }

  console.log(`\n${'='.repeat(130)}`);
  console.log('  RULES vs AI — real STEP files, China ex-works, 100,000/yr');
  console.log('='.repeat(130));
  console.log([
    'PART'.padEnd(22), 'COMMODITY'.padEnd(19), 'MANUAL'.padStart(13),
    'RULES'.padStart(24), 'err'.padStart(7), 'AI'.padStart(24), 'err'.padStart(7), 'AI material',
  ].join(' '));
  console.log('-'.repeat(130));
  for (const r of rows) console.log(r);
  console.log('='.repeat(130));

  writeFileSync(join(HERE, 'ab-rules.csv'), csvR.join('\n') + '\n');
  writeFileSync(join(HERE, 'ab-ai.csv'), csvA.join('\n') + '\n');
  console.log(`\nScored parts — rules ${csvR.length - 1}, ai ${csvA.length - 1}. CSVs written for:`);
  console.log('  npx tsx scripts/accuracy-report.ts scripts/ab-rules.csv');
  console.log('  npx tsx scripts/accuracy-report.ts scripts/ab-ai.csv\n');
}

void main();
