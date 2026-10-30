/**
 * AI-number leak audit (Oct 2026, docs/review/arith-audit/ai-leaks.md).
 *
 * The golden rule: AI never sets a price. Every number a model returns is either removed, bounded by a deterministic
 * check, kept as an audit record, or labelled as the model's — never shown or costed as a tool figure. Each block
 * below drives the product's own code with a STAND-IN model reply (the client is stubbed; no network) and fails on the
 * code before the fixes.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

const env = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR || '/tmp'}/cv-ai-leaks-${process.pid}-${Date.now()}`;
  process.env.CV_DATA_DIR = dir;
  process.env.JWT_SECRET = 'ai-leaks-test-secret-0123456789abcdefghijkl';
  delete process.env.AIR_GAPPED;
  delete process.env.ANTHROPIC_API_KEY;
  return { dir, reply: { text: '' } };
});

// The stand-in model: every call returns `env.reply.text` as one text block.
vi.mock('../server/utils/ai-client.js', async (orig) => {
  const real = await orig<typeof import('../server/utils/ai-client.js')>();
  const fake = {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: env.reply.text }], stop_reason: 'end_turn' }),
      stream: () => ({ finalMessage: async () => ({ content: [{ type: 'text', text: env.reply.text }] }) }),
    },
  };
  return { ...real, isAirGapped: () => false, createAnthropic: () => fake };
});

import { normalizeCADAnalysis, withAIAnswers, ruleContextFor, runAllGuards, buildPrompt, drawingGearRead } from '../server/routes/cad.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { applyRuleDecisions, suppressAIForUndecided } from '../src/engine/cost-input-rules/apply.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { dropUnruledAINumbers, BOUNDED_READS, stripModelMoney, unruledLimitation } from '../server/utils/ai-number-guard.js';
import { validateAgentResponse } from '../server/routes/agent.js';
import { labelModelFigures, ungroundedProseFigures, numbersIn, isGrounded, isGroundedFor, groundToolInput } from '../server/utils/agent-grounding.js';
import { cleanBomImageRows } from '../server/utils/pcb-bom-image.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const BASELINE = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; answers: Record<string, unknown>; geometry: OCCTGeometry; outcome: { commodity?: string } }>;

/** Sentinels: every model number is 9xxxxx, so a survivor is unmistakable. */
function sentinelReply(): Record<string, unknown> {
  let n = 900_000;
  const S = () => ++n;
  return {
    partName: 'stand-in',
    geometry: { boundingBoxMm: { x: S(), y: S(), z: S() }, estimatedVolumeCm3: S(), estimatedSurfaceAreaCm2: S(),
      estimatedWeightKg: { aluminum: S(), steel: S(), plastic: S() } },
    detectedFeatures: [{ type: 'hole', count: S(), significance: 'High', description: '12 holes' },
      { type: 'rib', count: S(), significance: 'Low', description: 'stiffening ribs' }],
    materialAnalysis: { primarySuggestion: { materialId: '', name: 'x', confidencePct: 50, reasoning: '' }, alternatives: [] },
    processRecommendations: [{ process: 'x', commodityType: 'machining', confidencePct: 50, estimatedCycleTimeHr: S(),
      reasoning: 'should land near £14.20 a part' }],
    manufacturabilityScore: S(),
    manufacturabilityRisks: [{ severity: 'Low', feature: 'wall', description: 'adds about £3.50/part', suggestion: 'thicken' }],
    aiExplanation: 'Expect a unit cost of £42.10, of which tooling is $8.',
    analysisLimitations: [],
    costInputSuggestions: {
      netWeightKg: S(), materialId: '', estimatedCycleTimeHr: S(), estimatedSetupTimeHr: S(), materialUtilization: S(),
      estimatedOperations: [{ name: 'Op', machineId: 'mach-vmc3', cycleTimeHr: S(), labourId: 'lab-uk-skilled', oee: S(), manning: S(), labourEfficiency: S() }],
      casting: { subtype: 'hpdc', dieMouldCostGBP: S(), dieMouldLife: S(), cavities: S(), yieldFraction: S(), cycleTimeHpdcSec: S(), cycleTimeSandGravHr: S() },
      forging: { flashKg: S(), yieldFraction: S(), dieCostGBP: S(), dieLife: S(), strokes: S(), timePerBlowSec: S() },
      sheetMetal: { thicknessMm: S(), blankLengthMm: S(), blankWidthMm: S(), dieCostGBP: S(), dieLife: S(), numOps: S() },
      injectionMoulding: { cavities: S(), projectedAreaCm2: S(), wallThicknessMm: S(), mouldCostGBP: S(), mouldLife: S(), runnerWeightKg: S() },
      blowMoulding: { subtype: 'ebm', wallThicknessMm: S(), flashWeightKg: S(), cavities: S(), mouldCostGBP: S(), mouldLife: S(), blowTimeSec: S(), openCloseSec: S() },
      thermoforming: { method: 'vacuum', sheetWeightKg: S(), partWeightKg: S(), toolCostGBP: S(), heatTimeSec: S(), formTimeSec: S(), trimTimeSec: S() },
      rotationalMoulding: { numArms: S(), partsPerArm: S(), heatTimeSec: S(), coolTimeSec: S(), mouldCostGBP: S(), mouldLife: S() },
      rubber: { process: 'compression', flashWeightKg: S(), cavities: S(), cycleTimeSec: S(), mouldCostGBP: S(), mouldLife: S() },
      composites: { process: 'rtm', fibreFraction: S(), wasteFraction: S(), areaCm2: S(), plies: S(), toolCostGBP: S(), toolLife: S(), cureTimeSec: S() },
      machining: { stockWeightKg: S(), materialUtilization: S(), batchSize: S(), rejectRate: S(), toolingCost: S(), programmingNRE: S(), toolWearCostPerPart: S() },
      extrusion: { lineSpeedMPerMin: S(), dieCostGBP: S() },
      alExtrusion: { partWeightKg: S(), dieCostGBP: S() },
      costRange: { low: S(), mid: S(), high: S(), currency: 'GBP' },
      surfaceTreatment: { callout: 'zinc nickel', thicknessUm: S(), maskedFeatureCount: S(), tensileStrengthMPa: S(), saltSprayHours: S() },
      dfmIssues: [{ severity: 'Low', area: 'x', description: 'x', impact: '+£0.80/part', fix: 'x' }],
    },
  };
}

function leaves(o: unknown, p: string, out: Array<[string, number]>): Array<[string, number]> {
  if (typeof o === 'number') { if (o > 900_000 && o < 1_000_000) out.push([p, o]); return out; }
  if (Array.isArray(o)) { o.forEach((v, i) => leaves(v, `${p}[${i}]`, out)); return out; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) leaves(v, p ? `${p}.${k}` : k, out);
  return out;
}

/** The AI path of /analyze and /reanalyze, in the order the route runs it. */
function aiPath(part: (typeof BASELINE)[number], reply: Record<string, unknown>, guard: boolean) {
  const commodity = part.outcome.commodity!;
  const spec = specForCommodity(commodity)!;
  const geo = { ...part.geometry, status: 'success' } as OCCTGeometry;
  const ctx = ruleContextFor(commodity, geo, part.part,
    { annualVolume: 50_000, programmeYears: 5, forcedCommodity: commodity, forcedMaterial: '', region: 'UK' }, part.answers, 'ai');
  normalizeCADAnalysis(reply, geo.weights, commodity);
  const resolved = runCostInputRules(spec, withAIAnswers(ctx, reply));
  const applied = applyRuleDecisions(reply as Parameters<typeof applyRuleDecisions>[0], resolved);
  suppressAIForUndecided(reply as Parameters<typeof suppressAIForUndecided>[0], resolved, spec);
  const dropped = guard ? dropUnruledAINumbers(reply, { ruleWritten: applied.overridden.map(o => o.field), geo }) : [];
  runAllGuards(reply, geo, geo.volume?.cm3 ?? null, null, {});
  return { reply, dropped, geo };
}

const isBounded = (path: string) => Object.keys(BOUNDED_READS).some(k => path === `costInputSuggestions.${k}` || path.startsWith(`costInputSuggestions.${k}.`));
/** A model feature count kept beside the measured table is marked as the model's read, never shown as measured. */
const markedFeature = (reply: Record<string, unknown>, path: string) => {
  const m = /^detectedFeatures\[(\d+)\]\.count$/.exec(path);
  return !!m && /^AI read, not measured/.test(String((reply.detectedFeatures as Array<{ description?: string }>)[Number(m[1])].description));
};

describe('1. CAD specialist reply — a model number survives only where a rule wrote it or a check bounds it', () => {
  const ruled = BASELINE.filter(p => p.outcome.commodity && specForCommodity(p.outcome.commodity));

  it('without the guard, model numbers reach the analysis (the leak this audit found)', () => {
    const { reply } = aiPath(ruled.find(p => p.part === 'MACH_Hydraulic_Manifold.stp')!, sentinelReply(), false);
    const survivors = leaves(reply, '', []).map(([p]) => p);
    expect(survivors).toContain('costInputSuggestions.costRange.mid');
    expect(survivors).toContain('costInputSuggestions.injectionMoulding.mouldCostGBP');   // printed in the PDF §7
  });

  it(`on every real part (${ruled.length}), no sentinel survives outside the bounded reads`, { timeout: 120_000 }, () => {
    for (const part of ruled) {
      const { reply, geo } = aiPath(part, sentinelReply(), true);
      const survivors = leaves(reply, '', []).filter(([p]) => !isBounded(p) && !markedFeature(reply, p));
      expect(survivors, part.part).toEqual([]);
      const feats = reply.detectedFeatures as Array<{ type: string; description: string }>;
      if (geo.featureTable?.some(r => r.kind === 'hole')) expect(feats.find(f => f.type === 'hole' && /AI read/.test(f.description)), part.part).toBeUndefined();
      const r = reply as { costInputSuggestions: Record<string, unknown>; geometry: { boundingBoxMm: { x: number }; estimatedVolumeCm3: number } };
      expect(r.costInputSuggestions.costRange, part.part).toBeUndefined();
      expect(r.geometry.estimatedVolumeCm3, part.part).toBe(geo.volume!.cm3);
      expect(r.geometry.boundingBoxMm.x, part.part).toBe(geo.boundingBox!.xMm);
    }
  });

  it('£ amounts in the model prose are removed; the words stay', () => {
    const { reply } = aiPath(ruled[0], sentinelReply(), true);
    const r = reply as { aiExplanation: string; processRecommendations: Array<{ reasoning: string }>;
      manufacturabilityRisks: Array<{ description: string }>; costInputSuggestions: { dfmIssues: Array<{ impact: string }> } };
    expect(r.aiExplanation).not.toMatch(/£\s?\d|\$\s?\d/);
    expect(r.aiExplanation).toMatch(/model £ figure removed/);
    expect(r.processRecommendations[0].reasoning).not.toMatch(/£\d/);
    expect(r.manufacturabilityRisks[0].description).not.toMatch(/£\d/);
    expect(r.costInputSuggestions.dfmIssues[0].impact).not.toMatch(/£\d/);
    expect(stripModelMoney('12 % glass, wall 2.5 mm').removed).toEqual([]);   // engineering figures are not money
  });

  it('the drawing-read tensile strength is not written to the form; the limitation says what it was', () => {
    const { dropped } = aiPath(ruled[0], sentinelReply(), true);
    const t = dropped.find(d => d.field.endsWith('tensileStrengthMPa'));
    expect(t).toBeTruthy();
    const note = unruledLimitation(dropped)!;
    expect(note).toMatch(/AI never sets a price/);
    expect(note).toMatch(new RegExp(`${t!.aiValue} MPa`));
  });

  it('a commodity with no rule pack (the AI fallback) keeps no model number but the snapped weight', () => {
    const geo = { ...BASELINE[0].geometry, status: 'success' } as OCCTGeometry;
    const reply = sentinelReply();
    normalizeCADAnalysis(reply, geo.weights, 'painting');
    dropUnruledAINumbers(reply, { ruleWritten: [], geo });
    expect(leaves(reply, '', []).filter(([p]) => !isBounded(p) && !markedFeature(reply, p))).toEqual([]);
  });

  it('normalizeCADAnalysis no longer invents a £0 cost range; the prompt no longer asks for a price', () => {
    const a: Record<string, unknown> = { costInputSuggestions: {} };
    normalizeCADAnalysis(a, undefined, 'machining');
    expect((a.costInputSuggestions as Record<string, unknown>).costRange).toBeUndefined();
    const part = BASELINE.find(p => p.part === 'MACH_Hydraulic_Manifold.stp')!;
    const geo = { ...part.geometry, status: 'success' } as OCCTGeometry;
    const prompt = buildPrompt(geo, { format: 'step', fileSizeKB: 40, summary: '' } as never, part.part, 'machining', null);
    expect(prompt).not.toMatch(/"costRange"/);
    expect(prompt).not.toMatch(/"injectionMoulding"|"forging":|"sheetMetal"/);   // off-commodity sub-objects
    expect(prompt).toMatch(/Do NOT estimate a price/);
  });
});

describe('1b. Gear: the drawing tooth count is checked in mode ai too', () => {
  it('a drawing read that disagrees with the measured count raises gear_teeth_mismatch', () => {
    const part = BASELINE.find(p => p.part === 'test-gear-m3-z38.step')!;
    const geo = { ...part.geometry, status: 'success' } as OCCTGeometry;
    const analysis = { costInputSuggestions: { recommendedCommodity: 'gear', gear: { drawingTeeth: 41 } },
      materialAnalysis: { primarySuggestion: { name: 'steel', confidencePct: 90 } } };
    expect(drawingGearRead(analysis)).toEqual({ gear: { drawingTeeth: 41 } });
    const w = runAllGuards(analysis, geo, geo.volume?.cm3 ?? null, drawingGearRead(analysis), {});
    expect(w.map(x => x.code)).toContain('gear_teeth_mismatch');
  });
});

describe('2. Agent — populate_form and chat', () => {
  const action = (data: Record<string, unknown>) => ({ chat: 'Filled.', action: { type: 'populate_form', commodity: 'machining', data } });

  it('a nested operation list with a cycle time the user never gave is dropped whole (it used to fill the form)', () => {
    const { response } = validateAgentResponse(action({
      netWeightKg: 2.5,
      operations: [{ name: 'Mill', machineId: 'mach-vmc3', cycleTimeHr: 0.37, oee: 0.85 }],
    }), ['A 2.5 kg aluminium bracket, OEE 0.85']);
    const params = (response.action as { params: Record<string, unknown> }).params;
    expect(params.netWeightKg).toBe(2.5);
    expect(params.operations).toBeUndefined();
    expect(response.chat).toMatch(/operations \(operations\[0\]\.cycleTimeHr = 0\.37\)/);
  });

  it('a number written as a string is grounded like a number', () => {
    const { response } = validateAgentResponse(action({ toolingCost: '45000', amortizationVolume: '50000' }), ['50000 a year']);
    const params = (response.action as { params: Record<string, unknown> }).params;
    expect(params.toolingCost).toBeUndefined();
    expect(params.amortizationVolume).toBe('50000');
  });

  it('a grounded operation list is kept', () => {
    const { response } = validateAgentResponse(action({ operations: [{ name: 'Mill', cycleTimeHr: 0.25, oee: 0.85 }] }),
      ['cycle 15 minutes, OEE 0.85']);
    expect((response.action as { params: Record<string, unknown> }).params.operations).toBeTruthy();
  });

  it('a £ figure in the reply that no tool, rate or user gave is labelled as the model\'s', () => {
    const { response } = validateAgentResponse({ chat: 'The tool says £12.40; a supplier would charge about £9.99.' },
      ['cost my bracket'], [JSON.stringify({ success: true, total: 12.4 })]);
    expect(response.chat).toMatch(/Model text — not a CostVision figure: £9\.99/);
    expect(response.chat).not.toMatch(/not a CostVision figure: £12\.40/);
    expect(response.modelFigures).toEqual(['£9.99']);
  });
});

describe('2b. Grounding takes only the field\'s own unit family', () => {
  it('a 50 s cycle is not "grounded" by 50,000 parts a year; 45 s still grounds a 0.0125 h cycle', () => {
    const given = numbersIn(['50,000 parts a year, cycle 45 s, 2.5 kg, margin 8 %']);
    expect(isGrounded(50, given)).toBe(true);                                  // the old, unit-blind check
    expect(isGroundedFor('params.cycleTimeSec', 50, given)).toBe(false);
    expect(isGroundedFor('params.cycleTimeHr', 45 / 3600, given)).toBe(true);
    expect(isGroundedFor('params.netWeightKg', 2.5, given)).toBe(true);
    expect(isGroundedFor('marginPct', 0.08, given)).toBe(true);
    expect(isGroundedFor('params.toolingCost', 50, given)).toBe(false);        // a £ figure takes the number as written
    const g = groundToolInput({ params: { cycleTimeSec: 50, netWeightKg: 2.5 } }, ['50,000 parts a year, 2.5 kg']);
    expect(g.ungrounded.map(u => u.path)).toEqual(['params.cycleTimeSec']);
  });
});

describe('3. Prose figures — grounding', () => {
  it('a currency amount or a percentage not in the given texts is listed; one that is, is not', () => {
    const given = numbersIn(['Total: £10.79, Material 42%, Labour 18%']);
    expect(ungroundedProseFigures('Material is 42% of £10.79; aim for a 15% cut.', given)).toEqual(['15%']);
    expect(labelModelFigures('No numbers here.', []).ungrounded).toEqual([]);
  });
});

describe('4. BOM picture — a read quantity that contradicts its own designators', () => {
  it('the designator count wins, as on the CSV path', () => {
    const r = cleanBomImageRows([{ refDes: 'C1-C10', qty: 100, partNumber: '', manufacturer: '', description: 'cap', value: '100nF', pkg: '0402' }]);
    expect(r.lines[0].qty).toBe(10);
    expect(r.qtyFixed[0]).toMatch(/read 100, 10 designators/);
    const one = cleanBomImageRows([{ refDes: 'U1', qty: 2, partNumber: 'X', manufacturer: '', description: '', value: '', pkg: '' }]);
    expect(one.lines[0].qty).toBe(2);   // a single designator: the quantity column stands
  });
});

describe('5. Routes with a stand-in model (in process, no network)', () => {
  let base = '';
  let close: () => void = () => {};
  let token = '';

  beforeAll(async () => {
    const express = (await import('express')).default;
    const jwt = (await import('jsonwebtoken')).default;
    const db = (await import('../server/db.js')).default;
    db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, full_name, email_verified, created_at)
      VALUES ('u1', 'u1@test', 'x', 'u1', 1, ?)`).run(new Date().toISOString());
    token = jwt.sign({ userId: 'u1', email: 'u1@test', emailVerified: true }, process.env.JWT_SECRET!, { expiresIn: '10m' });
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api/cad', (await import('../server/routes/cad.js')).default);
    app.use('/api/aichat', (await import('../server/routes/aichat.js')).default);
    app.use('/api/dfm', (await import('../server/routes/dfm.js')).default);
    app.use('/api/rfq', (await import('../server/routes/rfq.js')).default);
    const srv = app.listen(0);
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    close = () => srv.close();
  }, 60_000);
  afterAll(() => { close(); rmSync(env.dir, { recursive: true, force: true }); });

  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) =>
    (await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })).json() as Promise<Record<string, unknown>>;

  it('/api/cad/reanalyze in AI mode: no model price, no unruled model number, the list on the payload', async () => {
    const { putGeometry } = await import('../server/utils/geometry-store.js');
    const part = BASELINE.find(p => p.part === 'IM_ECU_Cover.stp')!;
    const hash = 'a'.repeat(64);
    putGeometry(hash, { ...part.geometry, status: 'success' } as OCCTGeometry);
    env.reply.text = JSON.stringify(sentinelReply());
    const r = await post('/api/cad/reanalyze', {
      geometryHash: hash, filename: part.part, annualVolume: 50_000, programmeYears: 5, mode: 'ai', noCache: true,
      commodity: 'injection_moulding', commodityExplicit: true, decisionAnswers: part.answers,
    }, { Authorization: `Bearer ${token}`, 'x-api-key': 'sk-ant-stand-in-0000000000000000' });
    expect(r.success, JSON.stringify(r).slice(0, 300)).toBe(true);
    const analysis = r.analysis as Record<string, unknown>;
    expect((analysis.costInputSuggestions as Record<string, unknown>).costRange).toBeUndefined();
    expect(leaves(analysis, '', []).filter(([p]) => !isBounded(p) && !markedFeature(analysis, p))).toEqual([]);
    const unruled = r.aiUnruled as Array<{ field: string }>;
    expect(unruled.map(u => u.field)).toContain('costInputSuggestions.costRange');
    expect((analysis.analysisLimitations as string[]).join(' ')).toMatch(/AI never sets a price/);
  }, 60_000);

  it('/api/aichat labels a £ the message did not carry', async () => {
    env.reply.text = 'Material dominates at £4.20. Expect roughly £3.10 after a redesign.';
    const r = await post('/api/aichat', { message: 'Total: £10.79, material £4.20' }, { 'x-api-key': 'sk-ant-stand-in-0000000000000000' });
    expect(r.reply).toMatch(/not a CostVision figure: £3\.10/);
    expect(r.modelFigures).toEqual(['£3.10']);
  });

  it('/api/dfm/analyze labels a saving the rule-based result never priced', async () => {
    env.reply.text = 'Priority 1: thicken the wall — saves about 12% (£0.40/part).';
    const r = await post('/api/dfm/analyze', {
      commodity: 'machining',
      dfmResult: { dfm: { score: 7, issues: [], summary: '' }, dfa: { score: 8, issues: [], summary: '' }, costOptimisations: [] },
    });
    expect(r.analysis).toMatch(/not a CostVision figure: 12%, £0\.40/);
  });

  it('/api/rfq/analyze: the model reads lines; its should-cost and unwritten numbers are dropped', async () => {
    env.reply.text = JSON.stringify([{ partName: 'Bracket', commodity: 'machining', quantity: 500, netWeightKg: 1.7,
      shouldCostPerPart: 12.5, targetPricePerPart: 9 }]);
    const r = await post('/api/rfq/analyze', { text: 'Bracket, 500 off, target £9 each', apiKey: 'sk-ant-stand-in-0000000000000000' });
    const line = (r.analysis as { lines: Array<Record<string, unknown>> }).lines[0];
    expect(line.costed).toBe(false);
    expect(line.shouldCostPerPart).toBe(0);
    expect(line.targetPricePerPart).toBe(9);
  });
});
