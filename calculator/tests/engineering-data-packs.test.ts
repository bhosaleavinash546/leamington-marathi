/**
 * Layer 3 — the commodity packs, and the layer's boundaries.
 *
 *  - one pack per rule-pack commodity, and every binding points at a question that commodity's rules really ask;
 *  - a NEW commodity is a new pack: it works without a change to reconcile.ts or the adapter;
 *  - this folder holds no cost formula: it imports neither the cost core nor a commodity module's functions, nor the
 *    drawing reader, and reconcile.ts / to-costing.ts name no commodity.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DETERMINISTIC_COMMODITIES, runCostInputRules, specForCommodity, type RuleContext } from '../src/engine/cost-input-rules/index.js';
import { allPacks, packFor, registerCommodityPack, type CommodityPack } from '../src/engine/engineering-data/commodity/index.js';
import { ANSWER_CODECS } from '../src/engine/engineering-data/to-costing.js';
import { isKnownParameter, PARAMETER_DEFS } from '../src/engine/engineering-data/dictionary.js';
import { consolidate, NOT_COSTED_REASON } from '../src/engine/engineering-data/reconcile.js';
import { confirm } from '../src/engine/engineering-data/overrides.js';
import { answersFromEngineeringData } from '../src/engine/engineering-data/to-costing.js';
import { parseSpecLookup } from '../src/engine/engineering-data/interpret-tables.js';
import { RECORDED, recorded, dp, drawingOf, WHO } from './engineering-data-helpers.js';

const FOLDER = join(import.meta.dirname, '..', 'src', 'engine', 'engineering-data');

describe('one pack per rule-pack commodity', () => {
  it('the packs are exactly the commodities the rule engine costs', () => {
    expect(allPacks().map(p => p.commodity).sort()).toEqual([...DETERMINISTIC_COMMODITIES].sort());
  });

  it.each(allPacks().map(p => ({ commodity: p.commodity, p })))('$commodity: names are dictionary names, every binding has one reader', ({ p }) => {
    expect(p.expected.length).toBeGreaterThan(0);
    for (const e of p.expected) {
      expect(isKnownParameter(e.name), e.name).toBe(true);
      for (const alt of e.alternatives ?? []) expect(isKnownParameter(alt), alt).toBe(true);
      expect(e.why.length).toBeGreaterThan(20);
    }
    expect(new Set(p.bindings.map(b => `${b.parameter}→${b.decisionId}`)).size).toBe(p.bindings.length);
    for (const b of p.bindings) {
      expect(isKnownParameter(b.parameter), b.parameter).toBe(true);
      expect(Boolean(b.codec) !== Boolean(b.options), `${b.decisionId}: a reader OR an option list`).toBe(true);
      if (b.codec) expect(ANSWER_CODECS[b.codec], b.codec).toBeDefined();
    }
    for (const f of p.formFields ?? []) expect(isKnownParameter(f.parameter), f.parameter).toBe(true);
  });
});

describe('every binding answers a question the commodity\'s rules really ask', () => {
  /** The decision ids a commodity asks over a spread of answer states, on its real parts. */
  function asked(commodity: string): Set<string> {
    const ids = new Set<string>();
    const run = (part: string, answers: Record<string, unknown>, geo = recorded(part).geometry) => {
      const r = runCostInputRules(specForCommodity(commodity)!, {
        geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume: 50_000, filename: part, answers,
      } as RuleContext);
      for (const d of r.decisions) ids.add(d.id);
    };
    // The route's own recorded parts (a casting is costed on the cast + machine parts; fab on the pressings).
    const same = (c: string) => (c === 'casting' ? 'cast_and_machine' : c === 'sheet_metal_fab' ? 'sheet_metal' : c);
    for (const b of RECORDED.filter(x => x.outcome.commodity === same(commodity))) {
      const keys = Object.keys(b.answers);
      run(b.part, {});
      run(b.part, b.answers);
      for (let i = 1; i < keys.length; i++) run(b.part, Object.fromEntries(keys.slice(0, i).map(k => [k, b.answers[k]])));
      for (const k of keys) run(b.part, Object.fromEntries(keys.filter(x => x !== k).map(x => [x, b.answers[x]])));
    }
    if (commodity === 'casting' || commodity === 'cast_and_machine') {
      const service = { 'service.pressureTight': 'no', 'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' };
      run('Part1.stp', { 'material.family': 'aluminium', ...service });                                   // an aluminium gravity / sand casting: the temper
      run('PRCR002.stp', { 'material.family': 'cast iron', ...service, 'service.pressureTight': 'yes' }); // a leak-tight iron casting: impregnation
    }
    if (commodity === 'gear') {
      const g = recorded('test-gear-m3-z38.step');
      const noGear = { ...g.geometry, gear: null };
      run(g.part, {}, noGear as never);
      run(g.part, { 'gear.teethEntry': 38, 'gear.helix': '0' }, noGear as never);
      run(g.part, { 'gear.teethEntry': 38, 'gear.helix': '0', 'gear.moduleEntry': 3, 'gear.qualityClass': '7', 'gear.materialClass': 'case_hardening_steel' }, noGear as never);
    }
    return ids;
  }

  /**
   * An id the engine READS as an answer but never asks as a question (cost-input-rules/commodities/gear.ts: the case
   * depth has a default and a basis line, no Decision). Listed so the exception is stated, not hidden.
   */
  const READ_NOT_ASKED = new Set(['gear.effectiveCaseDepthMm']);

  it.each(allPacks().map(p => ({ commodity: p.commodity, p })))('$commodity', ({ commodity, p }) => {
    const ids = asked(commodity);
    expect(ids.size, `${commodity} asked something`).toBeGreaterThan(0);
    for (const b of p.bindings) {
      if (READ_NOT_ASKED.has(b.decisionId)) continue;
      expect([...ids], `${commodity}: "${b.decisionId}" (from ${b.parameter}) is a question its rules ask`).toContain(b.decisionId);
    }
  }, 30_000);   // runs a route's rules on real recorded parts: ~5 s for sheet metal in a loaded suite (validation F18)

  it('the one read-but-not-asked id is really read by the gear rules', () => {
    const src = readFileSync(join(FOLDER, '..', 'cost-input-rules', 'commodities', 'gear.ts'), 'utf8');
    expect(src).toMatch(/GEAR_CASE_DEPTH_DECISION_ID = 'gear\.effectiveCaseDepthMm'/);
    expect(src).toMatch(/answeredEntry\(ctx, GEAR_CASE_DEPTH_DECISION_ID\)/);
  });
});

describe('a new commodity is a new pack — no change to reconcile.ts or the adapter', () => {
  const WELDED_FRAME: CommodityPack = {
    commodity: 'welded_frame',
    expected: [
      { name: 'weld.standard', why: 'the weld quality class sets the inspection — the drawing states none' },
      { name: 'material.designation', why: 'the section material — no source states it' },
    ],
    bindings: [
      { parameter: 'weld.standard', decisionId: 'frame.weldClass', options: ['ISO 5817-B', 'ISO 5817-C', 'ISO 5817-D'] },
      { parameter: 'quality.safetyCritical', decisionId: 'service.safetyCritical', codec: 'yesNo' },
    ],
  };
  const drawing = () => drawingOf([dp('weld.standard', 'ISO 5817-C', 'WELDS TO ISO 5817-C', { id: 'd:weld' }), dp('quality.safetyCritical', true, 'SAFETY PART', { id: 'd:safe' })]);

  it('before it is registered the route has no pack: nothing is expected, nothing is answered, the weld class is not costed', () => {
    expect(packFor('welded_frame')).toBeUndefined();
    const data = consolidate({ drawing: drawingOf([dp('weld.standard', 'ISO 5817-C', undefined, { id: 'd:weld' })]), commodity: 'welded_frame' });
    expect(data.missing).toEqual([]);
    expect(data.notCosted).toEqual([{ parameterId: 'd:weld', why: NOT_COSTED_REASON }]);
    expect(answersFromEngineeringData(confirm(data, 'd:weld', WHO)).answers).toEqual({});
  });

  it('registered: its expectations, its bindings and its option list work through the unchanged core', () => {
    const before = [reconcileSource(), adapterSource()];
    const unregister = registerCommodityPack(WELDED_FRAME);
    try {
      // missing
      const empty = consolidate({ drawing: drawingOf([dp('note.general', 'Weld all round')]), commodity: 'welded_frame' });
      expect(empty.missing.map(m => m.name)).toEqual(['weld.standard', 'material.designation']);
      // consumed, so no longer "not costed"
      let data = consolidate({ drawing: drawing(), commodity: 'welded_frame' });
      expect(data.notCosted).toEqual([]);
      expect(data.missing.map(m => m.name)).toEqual(['material.designation']);
      // unconfirmed → leanings only
      const lean = answersFromEngineeringData(data);
      expect(lean.answers).toEqual({});
      expect(lean.leanings.map(l => [l.decisionId, l.value])).toEqual([['frame.weldClass', 'ISO 5817-C'], ['service.safetyCritical', 'yes']]);
      // confirmed → answers
      data = confirm(confirm(data, 'd:weld', WHO), 'd:safe', WHO);
      expect(answersFromEngineeringData(data).answers).toEqual({ 'frame.weldClass': 'ISO 5817-C', 'service.safetyCritical': 'yes' });
      // a value outside the pack's option list is dropped
      const odd = confirm(consolidate({ drawing: drawingOf([dp('weld.standard', 'AWS D1.1', undefined, { id: 'd:weld' })]), commodity: 'welded_frame' }), 'd:weld', WHO);
      const a = answersFromEngineeringData(odd);
      expect(a.answers).toEqual({});
      expect(a.dropped[0].why).toMatch(/not one of the question's options \(ISO 5817-B, ISO 5817-C, ISO 5817-D\)/);
    } finally {
      unregister();
    }
    expect(packFor('welded_frame')).toBeUndefined();
    expect([reconcileSource(), adapterSource()]).toEqual(before);
  });

  it('a pack can be replaced and restored', () => {
    const original = packFor('machining')!;
    const restore = registerCommodityPack({ ...original, bindings: [] });
    expect(packFor('machining')!.bindings).toEqual([]);
    restore();
    expect(packFor('machining')).toBe(original);
  });
});

// ─── Boundaries ───────────────────────────────────────────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : name.endsWith('.ts') ? [p] : [];
  });
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const reconcileSource = () => readFileSync(join(FOLDER, 'reconcile.ts'), 'utf8');
const adapterSource = () => readFileSync(join(FOLDER, 'to-costing.ts'), 'utf8');

describe('this folder holds no cost formula', () => {
  const files = walk(FOLDER);
  const imports = files.flatMap(f => {
    const code = stripComments(readFileSync(f, 'utf8'));
    // import / export … from '…' with a real import clause ({ … }, * as x, or a default name) — not prose in a string
    return [...code.matchAll(/^\s*(import|export)\s+(type\s+)?(\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+)\s+from\s+['"]([^'"]+)['"]/gm)]
      .map(m => ({ file: relative(FOLDER, f), typeOnly: Boolean(m[2]), spec: m[4], clause: m[3] }));
  });

  it('found the folder, and reads its imports', () => {
    expect(files.length).toBeGreaterThan(15);
    expect(imports.length).toBeGreaterThan(40);
    // the scan sees every import statement: no dynamic or bare side-effect import hides from it
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      expect(code, relative(FOLDER, f)).not.toMatch(/\bimport\s*\(|\brequire\s*\(|^\s*import\s+['"]/m);
    }
    // and it would catch a value import of a module function
    expect(imports.some(i => /\/modules\//.test(i.spec) && i.typeOnly), 'type-only module imports are seen').toBe(true);
  });

  it('never imports the cost core', () => {
    const bad = imports.filter(i => /(^|\/)core(\.js)?$/.test(i.spec) || /universal-stack|regional-rates|calculate-cost|bulk-run|to-cost-params/.test(i.spec));
    expect(bad.map(i => `${i.file} ← ${i.spec}`)).toEqual([]);
  });

  it('imports a commodity module (src/engine/modules) for TYPES only', () => {
    const bad = imports.filter(i => /\/modules\//.test(i.spec) && !i.typeOnly);
    expect(bad.map(i => `${i.file} ← ${i.spec}`)).toEqual([]);
  });

  it('never imports the drawing reader, the server, or anything outside src/engine', () => {
    const bad = imports.filter(i => /server\/|\/drawing\/|^node:|^fs$|^path$/.test(i.spec) || !i.spec.startsWith('.'));
    expect(bad.map(i => `${i.file} ← ${i.spec}`)).toEqual([]);
    for (const i of imports) {
      // every relative import stays inside src/engine
      const depth = i.file.split('/').length - 1;
      const ups = (i.spec.match(/\.\.\//g) ?? []).length;
      expect(ups, `${i.file} ← ${i.spec}`).toBeLessThanOrEqual(depth + 1);
    }
  });

  it('calls no pricing: no rate, price or £ arithmetic in the code', () => {
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      expect(code, relative(FOLDER, f)).not.toMatch(/pricePerKg|ratePerHour|computeUniversalStack|compute[A-Z]\w*Drivers|costPerPart|GBP|£\s*\d/);
      expect(code, relative(FOLDER, f)).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|ai-client|anthropic/i);
    }
  });

  it('model.ts and dictionary.ts — the reader\'s contract — still import nothing', () => {
    for (const f of ['model.ts', 'dictionary.ts']) expect(imports.filter(i => i.file === f)).toEqual([]);
  });

  it('reconcile.ts and to-costing.ts name no commodity — only packs do', () => {
    for (const [name, src] of [['reconcile.ts', reconcileSource()], ['to-costing.ts', adapterSource()]] as const) {
      const code = stripComments(src);
      for (const c of DETERMINISTIC_COMMODITIES) expect(code, `${name} names '${c}'`).not.toMatch(new RegExp(`['"\`]${c}['"\`]`));
    }
  });
});

describe('the dictionary and the specification table', () => {
  it('dictionary names are unique', () => {
    expect(new Set(PARAMETER_DEFS.map(d => d.name)).size).toBe(PARAMETER_DEFS.length);
  });
  it('the shipped specification lookup is empty, documented, and parses to no entries', () => {
    const json = JSON.parse(readFileSync(join(FOLDER, '..', '..', '..', 'server', 'data', 'spec-lookup.json'), 'utf8'));
    expect(json.entries).toEqual({});
    expect(json.schema.row.designation).toMatch(/REQUIRED/);
    expect(json.schema.row.source).toMatch(/REQUIRED/);
    expect(parseSpecLookup(json)).toEqual({});
    // the documented example is under "schema", not "entries": it can never resolve a code
    expect(parseSpecLookup(json)['EXAMPLECODE0001']).toBeUndefined();
  });
});
