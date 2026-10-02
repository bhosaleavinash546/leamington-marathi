/**
 * Process and material identification: what the file says about itself
 * (server/utils/cad-metadata.ts), the evidence the rules lean on
 * (derive/part-evidence.ts → processLeaning, materialFacts), and the vision
 * identification step that replaced the numbers-only Stage 1
 * (server/utils/cad-identify.ts) — its request, its schema and its guard
 * against a material nobody read.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readCadMetadata } from '../server/utils/cad-metadata.js';
import { processFromNames, netShapeSignal, materialFromFile, partNames } from '../src/engine/cost-input-rules/derive/part-evidence.js';
import { inferCommodity, processLeaning } from '../src/engine/cost-input-rules/derive/commodity.js';
import { materialFacts } from '../src/engine/cost-input-rules/derive/material.js';
import {
  identifyPart, coerceIdentification, identificationBrief, IDENTIFY_MODEL, IDENTIFY_DEEP_MODEL, IDENTIFY_SYSTEM_PROMPT,
} from '../server/utils/cad-identify.js';
import { withAIMaterial } from '../server/routes/cad.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const PARTS = resolve(import.meta.dirname, '..', '..', 'cad-audit', 'parts');
const BASELINE = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', 'real-parts-baseline.json'), 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: OCCTGeometry;
}>;
const real = (part: string): OCCTGeometry => {
  const b = BASELINE.find(x => x.part === part)!;
  const p = resolve(PARTS, part);
  return { ...b.geometry, cadMetadata: existsSync(p) ? readCadMetadata(readFileSync(p), part) : undefined };
};
const ctx = (geo: OCCTGeometry, filename: string, over: Partial<RuleContext> = {}): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'machining', annualVolume: 50_000, filename, answers: {}, ...over,
});

describe('what a STEP file says about itself', () => {
  const step = (body: string, header = "FILE_NAME('C:\\\\Parts\\\\HPDC Housing\\\\housing_v3.stp','2026-01-01',('a'),('b'),'pre','NX 2312','');"): string =>
    `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Gearbox housing'),'2;1');\n${header}\nFILE_SCHEMA(('AP242'));\nENDSEC;\nDATA;\n${body}\nENDSEC;\nEND-ISO-10303-21;`;

  it('reads the product name, the header path with its folders, the system and the description', () => {
    const m = readCadMetadata(step("#1=PRODUCT('Housing LH','HSG-001','NOT SPECIFIED',(#2));"), 'x.stp');
    expect(m.productNames).toEqual(['Housing LH', 'HSG-001']);
    expect(m.headerFileName).toBe('C:\\Parts\\HPDC Housing\\housing_v3.stp');
    expect(m.authoringSystem).toBe('NX 2312');
    expect(m.description).toBe('Gearbox housing');
  });
  it('reads a declared material three ways exporters write it', () => {
    expect(readCadMetadata(step("#5=MATERIAL_DESIGNATION('EN AC-46000 AlSi9Cu3',(#6));"), 'x.stp').materialDesignations).toEqual(['EN AC-46000 AlSi9Cu3']);
    expect(readCadMetadata(step("#7=DESCRIPTIVE_REPRESENTATION_ITEM('material name','EN-GJS-500-7');"), 'x.stp').materialDesignations).toEqual(['EN-GJS-500-7']);
    expect(readCadMetadata(step("#8=DESCRIPTIVE_REPRESENTATION_ITEM('density','7.1');"), 'x.stp').materialDesignations).toEqual([]);
  });
  it('drops placeholders and survives junk', () => {
    const m = readCadMetadata(step("#1=PRODUCT('Part1','','',(#2));", "FILE_NAME('none','t',('a'),('b'),'p','o','');"), 'x.stp');
    expect(m.productNames).toEqual([]);
    expect(m.headerFileName).toBeUndefined();
    expect(readCadMetadata(Buffer.from([0, 1, 2, 3]), 'x.stl')).toEqual({ productNames: [], materialDesignations: [] });
  });
  it('reads the real audit parts', () => {
    if (!existsSync(PARTS)) return;
    expect(real('Casting_Braket.stp').cadMetadata!.productNames).toEqual(['Casting Bracket']);
    expect(real('Part1.stp').cadMetadata!.headerFileName).toBe('E:\\2025-GRABCAD-DATA\\CASTING-01\\Part1.stp');
    expect(real('steering_knuckle_RH.stp').cadMetadata!.productNames).toEqual(['STEERING_KNUCKLE_PATTERN']);
  });
});

describe('process words in the names', () => {
  const N = (...t: string[]) => t.map(text => ({ text, where: 'the uploaded file name' }));
  it('reads casting, a casting pattern, forging, pressing and moulding', () => {
    expect(processFromNames(N('Casting_Braket.stp')).route).toBe('casting');
    expect(processFromNames(N('STEERING_KNUCKLE_PATTERN')).route).toBe('casting');
    expect(processFromNames(N('E:\\DATA\\CASTING-01\\Part1.stp')).route).toBe('casting');
    expect(processFromNames(N('hpdc-housing.step')).route).toBe('casting');
    expect(processFromNames(N('lower_arm_forged.step')).route).toBe('forging');
    expect(processFromNames(N('seat_pan_pressing.stp')).route).toBe('sheet_metal');
    expect(processFromNames(N('door-trim-moulding.stp')).route).toBe('injection_moulding');
  });
  it('does not read a bolt pattern, a forecast or a castor as a process', () => {
    expect(processFromNames(N('flange_bolt_pattern.stp')).route).toBeNull();
    expect(processFromNames(N('hole pattern plate.step')).route).toBeNull();
    expect(processFromNames(N('forecast_bracket.stp')).route).toBeNull();
    expect(processFromNames(N('castor_wheel.stp')).route).toBeNull();
  });
  it('settles nothing when the names disagree', () => {
    const r = processFromNames(N('casting.stp', 'forging.stp'));
    expect(r.route).toBeNull();
    expect(r.hits.length).toBe(2);
  });
});

describe('the surface: net-shape or cut from solid', () => {
  it('reads the machined fixtures as prismatic and the real castings and forgings as blended', () => {
    expect(netShapeSignal({ faces: { total: 8, byType: { PLANE: 6, CYLINDER: 2 } } } as unknown as OCCTGeometry).kind).toBe('machined');
    expect(netShapeSignal({ faces: { total: 330, byType: { PLANE: 6, CYLINDER: 324 } } } as unknown as OCCTGeometry).kind).toBe('machined');
    for (const p of ['Casting_Braket.stp', 'PRCR002.stp', 'Part1.stp', 'steering_knuckle_RH.stp']) {
      expect(netShapeSignal(BASELINE.find(b => b.part === p)!.geometry).kind, p).toBe('net-shape');
    }
  });
  it('says nothing in between, or on too few faces', () => {
    expect(netShapeSignal({ faces: { total: 100, byType: { PLANE: 50, CYLINDER: 42, TORUS: 8 } } } as unknown as OCCTGeometry).kind).toBeNull();
    expect(netShapeSignal({ faces: { total: 4, byType: { BSPLINE: 4 } } } as unknown as OCCTGeometry).kind).toBeNull();
  });
});

describe('the process question now leans, and says why', () => {
  it('a named casting with holes leans to cast-then-machined, citing every name and the surface', () => {
    const v = inferCommodity(ctx(real('Casting_Braket.stp'), 'Casting_Braket.stp'));
    expect(v.commodity).toBeUndefined();                 // still asked — confirmed by the engineer
    expect(v.decision!.options.find(o => o.leaning)!.value).toBe('cast_and_machine');
    expect(v.decision!.why).toContain('"Casting_Braket.stp" reads as casting');
    expect(v.decision!.why).toMatch(/\d+% of the 230 faces are free-form or blended/);
    expect(v.decision!.why).toContain('holes were measured');
  });
  it('an unnamed blended part with holes leans to cast-then-machined on the surface alone', () => {
    const v = inferCommodity(ctx(real('PRCR002.stp'), 'PRCR002.stp'));
    expect(v.decision!.options.find(o => o.leaning)!.value).toBe('cast_and_machine');
  });
  it('a prismatic part leans to machining', () => {
    const geo = { ...real('PRCR002.stp'), cadMetadata: undefined, faces: { total: 120, byType: { PLANE: 80, CYLINDER: 40 } } } as OCCTGeometry;
    const v = inferCommodity(ctx(geo, 'block.stp'));
    expect(v.decision!.options.find(o => o.leaning)!.value).toBe('machining');
  });
  it('a named process the fill rung did not list is offered as well', () => {
    const l = processLeaning(ctx(real('PRCR002.stp'), 'arm_forged.stp'), ['casting', 'cast_and_machine', 'machining']);
    expect(l.routes[0]).toBe('forging');
    expect(l.leaning).toBe('forging');
  });
  it('the old behaviour on a bare file: no evidence, no leaning', () => {
    const geo = { ...real('PRCR002.stp'), cadMetadata: undefined, faces: { total: 100, byType: { PLANE: 50, CYLINDER: 42, TORUS: 8 } } } as OCCTGeometry;
    const v = inferCommodity(ctx(geo, 'x.stp'));
    expect(v.decision!.options.some(o => o.leaning)).toBe(false);
  });
});

describe('the material from the file', () => {
  const geo = (m: string[], names: string[] = []) => ({ ...real('PRCR002.stp'), cadMetadata: { productNames: names, materialDesignations: m } }) as OCCTGeometry;
  it('a declared material property decides the family, and says it was declared', () => {
    const f = materialFacts(ctx(geo(['EN-GJS-500-7']), 'x.stp', { commodity: 'cast_and_machine' }));
    expect(f.family).toBe('cast iron');
    expect(f.basis).toContain('the material property declared in the STEP file "EN-GJS-500-7"');
  });
  it('a product name naming an alloy decides it too, as the upload name always did', () => {
    const f = materialFacts(ctx(geo([], ['Housing A356 T6']), 'x.stp', { commodity: 'casting' }));
    expect(f.family).toBe('aluminium');
    expect(f.basis).toContain('the STEP product name "Housing A356 T6"');
  });
  it('a declared family the process cannot use is not forced on it', () => {
    expect(materialFacts(ctx(geo(['PA66 GF30']), 'x.stp', { commodity: 'casting' })).family).toBeNull();
  });
  it('nothing in the file: still asked', () => {
    expect(materialFacts(ctx(geo([]), 'x.stp', { commodity: 'casting' })).decision).toBeDefined();
    expect(materialFromFile('x.stp', geo([]))).toBeNull();
    expect(partNames('x.stp', geo([])).length).toBe(1);
  });
});

/** A fake client that records the request and replies with `reply`. */
function fakeClient(reply: unknown, opts: { rejectFormat?: boolean } = {}) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    client: {
      messages: {
        create: async (p: Record<string, unknown>) => {
          calls.push(p);
          const oc = p.output_config as { format?: unknown } | undefined;
          if (opts.rejectFormat && oc?.format) {
            throw Object.assign(new Error('400 output_config.format: not supported'), { status: 400 });
          }
          return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(reply) }] };
        },
      },
    } as never,
  };
}

const GOOD = {
  process: 'cast_and_machine', processConfidence: 0.82,
  alternatives: [{ process: 'forging', confidence: 0.12 }, { process: 'cast_and_machine', confidence: 0.5 }],
  processEvidence: ['render: blended fillets and draft on every wall', 'photo: sand texture, machined bores'],
  materialFamily: 'cast iron', materialGrade: 'EN-GJS-500-7', materialConfidence: 0.7, materialSource: 'photo',
  materialEvidence: ['photo: dark grey granular surface'],
};

describe('the identification step', () => {
  it('sends the photo, the drawing and the renders, each labelled for what it can show, to Sonnet 5.5 with a schema', async () => {
    const f = fakeClient(GOOD);
    const r = await identifyPart(f.client, {
      geo: real('Casting_Braket.stp'), filename: 'Casting_Braket.stp',
      partPhoto: { data: 'UEhPVE8=', mediaType: 'image/jpeg' }, renderViews: ['QQ==', 'Qg=='], drawingPdfBase64: 'UERG',
    });
    const req = f.calls[0];
    expect(req.model).toBe(IDENTIFY_MODEL);
    expect(IDENTIFY_MODEL).toBe('claude-sonnet-5-5');
    expect(req).not.toHaveProperty('temperature');
    expect(req).not.toHaveProperty('thinking');
    expect((req.output_config as { effort: string; format: { type: string } }).effort).toBe('medium');
    expect((req.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    const content = (req.messages as Array<{ content: Array<{ type: string; text?: string }> }>)[0].content;
    const texts = content.filter(b => b.type === 'text').map(b => b.text!).join('\n');
    expect(texts).toContain('PHOTO OF THE PHYSICAL PART');
    expect(texts).toContain('UNTEXTURED CAD RENDERS');
    expect(texts).toContain('ENGINEERING DRAWING');
    expect(texts).toContain('"Casting Bracket"');
    expect(content.filter(b => b.type === 'image').length).toBe(3);
    expect(content.filter(b => b.type === 'document').length).toBe(1);
    expect(r!.process).toBe('cast_and_machine');
    expect(r!.alternatives.map(a => a.process)).toEqual(['forging']);   // the primary is not its own alternative
    expect(r!.materialFamily).toBe('cast iron');
    expect(r!.model).toBe('claude-sonnet-5-5');
  });
  it('"Deep analysis" runs Opus 5.5 at high effort', async () => {
    const f = fakeClient(GOOD);
    await identifyPart(f.client, { geo: real('PRCR002.stp'), filename: 'PRCR002.stp', deep: true });
    expect(f.calls[0].model).toBe(IDENTIFY_DEEP_MODEL);
    expect(IDENTIFY_DEEP_MODEL).toBe('claude-opus-5-5');
    expect((f.calls[0].output_config as { effort: string }).effort).toBe('high');
  });
  it('falls back to asking for JSON in words when the format parameter is refused', async () => {
    const f = fakeClient(GOOD, { rejectFormat: true });
    const r = await identifyPart(f.client, { geo: real('PRCR002.stp'), filename: 'PRCR002.stp' });
    expect(f.calls.length).toBe(2);
    expect((f.calls[1].output_config as { format?: unknown }).format).toBeUndefined();
    expect(r!.process).toBe('cast_and_machine');
  });
  it('holds a material nobody read as unknown, whatever the model wrote', () => {
    const r = coerceIdentification({ ...GOOD, materialSource: 'none', materialFamily: 'aluminium', materialGrade: 'A356' }, 'm')!;
    expect(r.materialFamily).toBe('unknown');
    expect(r.materialGrade).toBe('');
    expect(r.materialConfidence).toBe(0);
    expect(coerceIdentification({ ...GOOD, process: 'welding' }, 'm')).toBeNull();
  });
  it('tells the model renders carry no material, and says so in the brief when the file names none', () => {
    expect(IDENTIFY_SYSTEM_PROMPT).toContain('Never infer a material from a render');
    expect(identificationBrief(real('PRCR002.stp'), 'PRCR002.stp')).toContain('The CAD file declares no material and no name suggests one.');
    expect(identificationBrief(real('Casting_Braket.stp'), 'Casting_Braket.stp')).toContain('reads as casting');
  });
});

describe('a read material reaches the confirm question, not the money', () => {
  const base = ctx(real('PRCR002.stp'), 'PRCR002.stp', { commodity: 'cast_and_machine' });
  it('an identification read off the photo outranks the specialist\'s default grade, tagged as the model\'s', () => {
    const c = withAIMaterial(base, { costInputSuggestions: { materialId: 'mat-a380' }, identification: { ...GOOD, model: 'm' } });
    expect(c.answers['material.family']).toBe('cast iron');
    expect(c.answers['material.familySource']).toBe('ai');
  });
  it('an identification that read nothing changes nothing', () => {
    const c = withAIMaterial(base, { costInputSuggestions: { materialId: 'mat-a380' }, identification: { ...GOOD, materialSource: 'none', materialFamily: 'unknown', model: 'm' } });
    expect(c.answers['material.family']).toBe('aluminium');
  });
  it('the engineer\'s answer still wins', () => {
    const c = withAIMaterial({ ...base, answers: { 'material.family': 'aluminium' } }, { identification: { ...GOOD, model: 'm' } });
    expect(c.answers['material.family']).toBe('aluminium');
    expect(c.answers['material.familySource']).toBeUndefined();
  });
});

describe('the engineer\'s process answer is not overridden by the pre-filled drop-down', () => {
  it('an answered route beats an unflagged drop-down (the £101 Casting Bracket bug)', async () => {
    const { effectiveForcedCommodity } = await import('../server/routes/cad.js');
    expect(effectiveForcedCommodity({ commodity: 'machining', decisionAnswers: { 'commodity.route': 'cast_and_machine' } })).toBe('cast_and_machine');
    expect(effectiveForcedCommodity({ commodity: 'machining', decisionAnswers: JSON.stringify({ 'commodity.route': 'cast_and_machine' }) })).toBe('cast_and_machine');
  });
  it('a drop-down changed on purpose still wins', async () => {
    const { effectiveForcedCommodity } = await import('../server/routes/cad.js');
    expect(effectiveForcedCommodity({ commodity: 'forging', commodityExplicit: true, decisionAnswers: { 'commodity.route': 'cast_and_machine' } })).toBe('forging');
  });
  it('either alone is used; neither is nothing', async () => {
    const { effectiveForcedCommodity } = await import('../server/routes/cad.js');
    expect(effectiveForcedCommodity({ commodity: 'casting' })).toBe('casting');
    expect(effectiveForcedCommodity({ decisionAnswers: { 'commodity.route': 'forging' } })).toBe('forging');
    expect(effectiveForcedCommodity({})).toBe('');
  });
});
