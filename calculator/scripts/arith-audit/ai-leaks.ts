/**
 * AI-number leak audit — the shadow check (docs/review/arith-audit/ai-leaks.md).
 *
 *   cd calculator && npx tsx scripts/arith-audit/ai-leaks.ts
 *
 * 1. INVENTORY. Every model call in server/ is found by text (createAnthropic( and messages.create / .stream) and
 *    must be one this audit classified (`CALLS` below). A new call fails the check until someone states what its
 *    reply's numbers are allowed to reach.
 * 2. CAD SPECIALIST. A stand-in reply with a sentinel in every numeric field the model can return (and the fields it
 *    should not — a price range, other commodities' tooling) is run through the AI path exactly as the route runs it
 *    (normalize → rules → suppress → dropUnruledAINumbers → guards) on every real part in the baseline. Any sentinel
 *    left outside `BOUNDED_READS` is a FAIL, as is a geometry echo that is not the measured value.
 * 3. PROMPT. The specialist prompt must not ask for a price.
 *
 * No model is called. Exit 1 on any FAIL.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { normalizeCADAnalysis, withAIAnswers, ruleContextFor, runAllGuards, buildPrompt } from '../../server/routes/cad.js';
import { runCostInputRules } from '../../src/engine/cost-input-rules/engine.js';
import { applyRuleDecisions, suppressAIForUndecided } from '../../src/engine/cost-input-rules/apply.js';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.js';
import { buildDeterministicAnalysis } from '../../src/engine/cost-input-rules/deterministic.js';
import { dropUnruledAINumbers, BOUNDED_READS } from '../../server/utils/ai-number-guard.js';
import type { OCCTGeometry } from '../../src/engine/ai-analysis.js';

const ROOT = join(import.meta.dirname ?? __dirname, '..', '..');
let fails = 0, passes = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

// ── 1. Inventory ──────────────────────────────────────────────────────────────
/** file → number of model calls (createAnthropic + messages.create/stream) the audit classified. */
const CALLS: Record<string, { calls: number; verdict: string }> = {
  'server/routes/cad.ts': { calls: 6, verdict: 'specialist reply: rules overwrite, dropUnruledAINumbers removes the rest (BOUNDED)' },
  'server/routes/pcb.ts': { calls: 16, verdict: 'Stages 1–3 readings; prices only in runStage4 (PCB auditor) — unitPriceGBP AUDIT-ONLY' },
  'server/routes/agent.ts': { calls: 5, verdict: 'tool params grounded (refused); populate_form grounded incl. nested/strings; chat figures labelled' },
  'server/routes/rfq.ts': { calls: 2, verdict: 'lines grounded to the RFQ text; shouldCostPerPart dropped' },
  'server/routes/dfm.ts': { calls: 2, verdict: 'commentary text; ungrounded £/% labelled' },
  'server/routes/aichat.ts': { calls: 2, verdict: 'chat text; ungrounded £/% labelled' },
  'server/utils/cad-identify.ts': { calls: 2, verdict: 'classification + confidences (clamped 0–1); no number reaches money' },
  'server/utils/pcb-bom-image.ts': { calls: 2, verdict: 'transcription, no price field; qty bounded by its designators' },
};
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(f)) out.push(p);
  }
  return out;
}
const found: Record<string, number> = {};
for (const f of walk(join(ROOT, 'server'))) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  if (rel === 'server/utils/ai-client.ts') continue;
  const src = readFileSync(f, 'utf8');
  const n = (src.match(/createAnthropic\(/g) ?? []).length + (src.match(/\.messages\.(create|stream)\(/g) ?? []).length;
  if (n) found[rel] = n;
  check(!/new Anthropic\(/.test(src), `${rel}: no direct new Anthropic()`);
}
for (const [file, n] of Object.entries(found)) {
  const c = CALLS[file];
  check(!!c && c.calls === n, `inventory ${file}: ${n} call site(s)`, c ? (c.calls === n ? c.verdict : `audited ${c.calls}`) : 'NOT AUDITED');
}
for (const file of Object.keys(CALLS)) check(file in found, `inventory ${file} still has its model calls`);

// ── 2. CAD specialist reply on every real part ────────────────────────────────
type Part = { part: string; answers: Record<string, unknown>; geometry: OCCTGeometry; outcome: { commodity?: string } };
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/real-parts-baseline.json'), 'utf8')) as Part[];

function sentinel(): Record<string, unknown> {
  let n = 900_000;
  const S = () => ++n;
  const sub = (keys: string[]) => Object.fromEntries(keys.map(k => [k, S()]));
  return {
    geometry: { boundingBoxMm: { x: S(), y: S(), z: S() }, estimatedVolumeCm3: S(), estimatedSurfaceAreaCm2: S(),
      estimatedWeightKg: { aluminum: S(), steel: S(), plastic: S() } },
    processRecommendations: [{ process: 'x', commodityType: 'x', confidencePct: 50, estimatedCycleTimeHr: S(), reasoning: 'about £9.10' }],
    detectedFeatures: [{ type: 'hole', count: S(), significance: 'High', description: 'holes' }, { type: 'rib', count: S(), significance: 'Low', description: 'ribs' }],
    manufacturabilityScore: S(), aiExplanation: 'Unit cost about £12.30.', analysisLimitations: [],
    costInputSuggestions: {
      netWeightKg: S(), materialId: '', estimatedCycleTimeHr: S(), estimatedSetupTimeHr: S(), materialUtilization: S(),
      estimatedOperations: [{ name: 'Op', machineId: 'mach-vmc3', cycleTimeHr: S(), oee: S(), manning: S() }],
      casting: { subtype: 'hpdc', ...sub(['dieMouldCostGBP', 'dieMouldLife', 'cavities', 'yieldFraction', 'cycleTimeHpdcSec', 'cycleTimeSandGravHr']) },
      forging: sub(['flashKg', 'yieldFraction', 'dieCostGBP', 'dieLife', 'strokes', 'timePerBlowSec']),
      sheetMetal: sub(['thicknessMm', 'blankLengthMm', 'blankWidthMm', 'dieCostGBP', 'dieLife', 'numOps']),
      injectionMoulding: sub(['cavities', 'projectedAreaCm2', 'wallThicknessMm', 'mouldCostGBP', 'mouldLife', 'runnerWeightKg']),
      blowMoulding: { subtype: 'ebm', ...sub(['wallThicknessMm', 'flashWeightKg', 'cavities', 'mouldCostGBP', 'mouldLife', 'blowTimeSec', 'openCloseSec']) },
      thermoforming: { method: 'vacuum', ...sub(['sheetWeightKg', 'partWeightKg', 'toolCostGBP', 'heatTimeSec', 'formTimeSec', 'trimTimeSec']) },
      rotationalMoulding: sub(['numArms', 'partsPerArm', 'heatTimeSec', 'coolTimeSec', 'mouldCostGBP', 'mouldLife']),
      rubber: { process: 'compression', ...sub(['flashWeightKg', 'cavities', 'cycleTimeSec', 'mouldCostGBP', 'mouldLife']) },
      composites: { process: 'rtm', ...sub(['fibreFraction', 'wasteFraction', 'areaCm2', 'plies', 'toolCostGBP', 'toolLife', 'cureTimeSec']) },
      machining: sub(['stockWeightKg', 'materialUtilization', 'batchSize', 'rejectRate', 'toolingCost', 'programmingNRE', 'toolWearCostPerPart']),
      gear: sub(['teeth', 'normalModuleMm', 'faceWidthMm']),
      extrusion: sub(['lineSpeedMPerMin', 'dieCostGBP']),
      alExtrusion: sub(['partWeightKg', 'dieCostGBP']),
      costRange: { low: S(), mid: S(), high: S(), currency: 'GBP' },
      surfaceTreatment: { callout: 'zinc', ...sub(['thicknessUm', 'maskedFeatureCount', 'tensileStrengthMPa', 'saltSprayHours']) },
    },
  };
}
const sentinels = (o: unknown, p: string, out: string[]): string[] => {
  if (typeof o === 'number') { if (o > 900_000 && o < 1_000_000) out.push(p); return out; }
  if (Array.isArray(o)) { o.forEach((v, i) => sentinels(v, `${p}[${i}]`, out)); return out; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) sentinels(v, p ? `${p}.${k}` : k, out);
  return out;
};
const bounded = (p: string) => Object.keys(BOUNDED_READS).some(k => p === `costInputSuggestions.${k}` || p.startsWith(`costInputSuggestions.${k}.`));

for (const part of BASELINE) {
  const commodity = part.outcome.commodity;
  const spec = commodity ? specForCommodity(commodity) : null;
  if (!spec || !commodity) continue;
  const geo = { ...part.geometry, status: 'success' } as OCCTGeometry;
  const ctx = ruleContextFor(commodity, geo, part.part,
    { annualVolume: 50_000, programmeYears: 5, forcedCommodity: commodity, forcedMaterial: '', region: 'UK' }, part.answers, 'ai');
  const a = sentinel();
  normalizeCADAnalysis(a, geo.weights, commodity);
  const resolved = runCostInputRules(spec, withAIAnswers(ctx, a));
  const applied = applyRuleDecisions(a as Parameters<typeof applyRuleDecisions>[0], resolved);
  suppressAIForUndecided(a as Parameters<typeof suppressAIForUndecided>[0], resolved, spec);
  const before = sentinels(a, '', []).length;
  const dropped = dropUnruledAINumbers(a, { ruleWritten: applied.overridden.map(o => o.field), geo });
  runAllGuards(a, geo, geo.volume?.cm3 ?? null, null, {});
  const feats = a.detectedFeatures as Array<{ description?: string }>;
  const marked = (p: string) => { const m = /^detectedFeatures\[(\d+)\]\.count$/.exec(p); return !!m && /^AI read, not measured/.test(String(feats[Number(m[1])]?.description)); };
  const left = sentinels(a, '', []).filter(p => !bounded(p) && !marked(p));
  check(left.length === 0, `CAD AI path ${part.part} (${commodity}): no unruled model number`,
    left.length ? left.slice(0, 5).join(', ') : `${before} model numbers in, ${dropped.length} removed / replaced, rules wrote ${applied.overridden.length}`);
  // Every number the AI path still carries in costInputSuggestions is the deterministic analysis's own, to the digit
  // (same context, same answers): what the screen fills from an AI run is what a run with no model fills.
  const det = buildDeterministicAnalysis(spec, withAIAnswers(ctx, a), part.part).analysis.costInputSuggestions as unknown as Record<string, unknown>;
  const read = (o: unknown, path: string): unknown => path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o);
  const nums: Array<{ path: string; value: number }> = [];
  const walkNums = (o: unknown, p: string) => {
    if (typeof o === 'number') nums.push({ path: p, value: o });
    else if (Array.isArray(o)) o.forEach((v, i) => walkNums(v, `${p}[${i}]`));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walkNums(v, p ? `${p}.${k}` : k);
  };
  walkNums(a.costInputSuggestions, '');
  const differ = nums.filter(n => !/^(fieldConfidences|stage1Selection|surfaceTreatment|netWeightKg)/.test(n.path) && !bounded(`costInputSuggestions.${n.path}`))
    .filter(n => read(det, n.path) !== n.value);
  check(differ.length === 0, `CAD AI path ${part.part}: every kept number = the deterministic analysis's`,
    differ.length ? differ.slice(0, 4).map(d => `${d.path} ${d.value} v ${String(read(det, d.path))}`).join('; ') : `${nums.length} numbers compared`);
  const g = a.geometry as { estimatedVolumeCm3: number; estimatedSurfaceAreaCm2: number };
  check(g.estimatedVolumeCm3 === geo.volume!.cm3 && g.estimatedSurfaceAreaCm2 === geo.surfaceArea!.cm2,
    `CAD AI path ${part.part}: geometry = measured`);
  check(!/£\s?\d/.test(String(a.aiExplanation)), `CAD AI path ${part.part}: no £ in the model prose`);
}

// ── 3. The prompt does not ask for a price ────────────────────────────────────
{
  const part = BASELINE.find(p => p.part === 'MACH_Hydraulic_Manifold.stp')!;
  const prompt = buildPrompt({ ...part.geometry, status: 'success' } as OCCTGeometry,
    { format: 'step', fileSizeKB: 40, summary: '' } as never, part.part, 'machining', null);
  check(!/"costRange"|COST RANGE/.test(prompt), 'CAD prompt asks for no cost range');
  check(!/"injectionMoulding"|"forging":|"sheetMetal"/.test(prompt), 'CAD prompt asks for no other commodity\'s tooling');
}

console.log(`\n${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
