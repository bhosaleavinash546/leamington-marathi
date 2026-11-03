/**
 * Geometric DFM to the report standard (Nov 2026, docs/review/report-standard-2026-11/dfm.md): findings judge the faces
 * the PROCESS forms, grades say what a finding means for this costing, a £ is the design-addressable delta only, and the
 * text and sources fit the route. Real parts are the recorded kernel output (CV_EXTRACT_FEATURES=1) in
 * tests/fixtures/dfm/ — the stub axle, the steering knuckle and the casting bracket of the 15-part review.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  analyseGeometricDFM, machinedFaceSet, sheetBlankFromFlat, sheetBlankFindings, normaliseSeverity, jobberFluteMm,
  type PartContext, type ManufacturingFeature, type SheetBlankFacts,
} from '../src/engine/dfm-geometry/index.js';
import { costedMillAxes } from '../src/engine/dfm-geometry/commodities/machining-access.js';
import type { CommodityType } from '../src/engine/types.js';

const COST = { annualVolume: 200_000, machineRatePerHr: 60, labourRatePerHr: 25, engineerRatePerHr: 55 };
const load = (f: string) => JSON.parse(readFileSync(`tests/fixtures/dfm/${f}`, 'utf8'));
/** The part exactly as the DFM job builds it from a kernel measurement (dfm-job-runner.ts::partFromKernelGeometry). */
function realPart(file: string, commodity: CommodityType, o: Partial<PartContext> & { withMachined?: boolean } = {}): PartContext {
  const g = load(file);
  const machined = o.withMachined === false ? undefined : machinedFaceSet(g, g.manufacturingFeatures, commodity);
  return {
    commodity, featureSet: g.manufacturingFeatures,
    bboxMm: { x: g.boundingBox.xMm, y: g.boundingBox.yMm, z: g.boundingBox.zMm },
    medianWallMm: g.manufacturingFeatures.medianThicknessMm, cost: COST,
    ...(machined ? { machined } : {}), ...o,
  };
}
const FORM_RULES = /^(casting\.(draft|undercut|section|fillet|hotspot)|forging\.(draft|undercut|fillet|web))\./;

describe('1 — process-form rules judge only the faces the process forms', () => {
  const stubFeatures = load('stub-axle-features.json');
  const faced = stubFeatures.featureTable.filter((r: { kind: string }) => r.kind === 'face').flatMap((r: { faceIds: number[] }) => r.faceIds);

  it('the stub axle’s machined set is the costing’s: faced rows, every hole and bore, the turned spindle', () => {
    const m = machinedFaceSet(stubFeatures, stubFeatures.manufacturingFeatures, 'cast_and_machine')!;
    expect(m.counts.faced).toBe(8);
    expect(m.counts.holes).toBe(48);
    expect(m.counts.turned).toBeGreaterThan(0);          // the spindle the costing turns (nearNetTurnedAreaCm2)
    for (const id of faced) expect(m.faceIds).toContain(id);
    expect(m.basis).toMatch(/The costing machines 8 faced flats, 48 hole and bore faces/);
    // a moulding or a sheet part has no machined set
    expect(machinedFaceSet(stubFeatures, stubFeatures.manufacturingFeatures, 'injection_moulding')).toBeUndefined();
  });

  it('draft, corner, undercut, section and hot-spot findings never land on a machined face (stub axle, sand)', () => {
    const before = analyseGeometricDFM(realPart('stub-axle-features.json', 'cast_and_machine',
      { process: 'sand', materialFamily: 'cast iron', withMachined: false }));
    const part = realPart('stub-axle-features.json', 'cast_and_machine', { process: 'sand', materialFamily: 'cast iron' });
    const after = analyseGeometricDFM(part);
    const m = new Set(part.machined!.faceIds);
    const onMachined = (r: typeof after) => r.findings.filter(f => FORM_RULES.test(f.ruleId) && f.faceIds.some(id => m.has(id)));
    expect(onMachined(before).length).toBeGreaterThan(0);  // the review's finding: the draft rule flagged machined flats
    expect(onMachined(after)).toEqual([]);
    // the faced flats 73 and 146 drew at 0° and were flagged; the costing faces them
    const draftFaces = (r: typeof after) => r.findings.filter(f => f.ruleId === 'casting.draft.insufficient').flatMap(f => f.faceIds);
    expect(draftFaces(before)).toEqual(expect.arrayContaining([73, 146]));
    expect(draftFaces(after)).not.toContain(73);
    expect(draftFaces(after)).not.toContain(146);
    // and the report says which faces were judged
    expect(after.limitations[0]).toMatch(/The costing machines .* machined face\(s\) set aside; \d+ judged/);
    expect(after.limitations.join(' ')).toMatch(/Hot-spot check ran on the as-cast faces: \d+ section\(s\)/);
  });

  it('the knuckle (closed-die forging): no finding on a machined face, no convex edge break read as a fillet, no 0.15 mm "web"', () => {
    const part = realPart('knuckle-features.json', 'forging', { process: 'closed-die', materialFamily: 'steel' });
    const after = analyseGeometricDFM(part);
    const m = new Set(part.machined!.faceIds);
    expect(after.findings.filter(f => FORM_RULES.test(f.ruleId) && f.faceIds.some(id => m.has(id)))).toEqual([]);
    const feats = part.featureSet.features as ManufacturingFeature[];
    // the old rule fired on these: external rounds under R3 (17 of the 42 "fillets" of the live report)
    const convex = new Set(feats.filter(f => f.kind === 'fillet' && f.concave === false && (f.radiusMm ?? 9) < 3
      && (f.sweepDeg ?? 0) <= 120).map(f => f.id));
    expect(convex.size).toBeGreaterThan(10);
    expect(after.findings.some(f => f.ruleId === 'forging.fillet.too-sharp-for-metal-flow' && convex.has(f.featureId))).toBe(false);
    // a 0.15 mm "web" is a ray grazing a fillet, not a wall (it printed CRITICAL)
    expect(feats.some(f => f.kind === 'planar_face' && (f.thicknessMm ?? 9) < 0.3)).toBe(true);
    expect(after.findings.some(f => f.ruleId === 'forging.web.below-process-minimum')).toBe(false);
    // no code identifier or changelog in what the report prints
    const printed = after.findings.map(f => `${f.source.standard} ${f.source.clause ?? ''} ${f.source.note ?? ''} ${f.costNotModelled ?? ''}`).join(' ');
    expect(printed).not.toMatch(/FORGING_PROCESS_REFERENCE|analyseForgingDFM|An earlier version/);
  });

  it('the casting bracket: the costing’s faced flats are not draft findings', () => {
    const part = realPart('casting-bracket-features.json', 'cast_and_machine', { process: 'sand', materialFamily: 'steel' });
    const r = analyseGeometricDFM(part);
    const draft = r.findings.filter(f => f.ruleId === 'casting.draft.insufficient').flatMap(f => f.faceIds);
    for (const id of [107, 116, 146]) expect(draft).not.toContain(id);   // faced rows at 0° draft
  });
});

describe('2 — grades: BLOCKING / COST / RISK / INFO', () => {
  it('maps the old grades so stored results still read', () => {
    expect(normaliseSeverity('critical')).toBe('blocking');
    expect(normaliseSeverity('major')).toBe('risk');
    expect(normaliseSeverity('minor')).toBe('risk');
    expect(normaliseSeverity('advisory')).toBe('info');
    expect(normaliseSeverity('major', true)).toBe('cost');
    expect(normaliseSeverity('critical', true)).toBe('blocking');
  });
  it('no finding on the real parts carries an old grade; COST only on a priced finding', () => {
    for (const [file, commodity, process] of [['stub-axle-features.json', 'cast_and_machine', 'sand'],
      ['knuckle-features.json', 'forging', 'closed-die'], ['casting-bracket-features.json', 'cast_and_machine', 'sand'],
      ['manifold-features.json', 'machining', undefined], ['ecu-cover-features.json', 'injection_moulding', undefined]] as const) {
      const g = load(file);
      const r = analyseGeometricDFM({ ...realPart(file, commodity as CommodityType, { process }),
        bboxMm: { x: g.boundingBox?.xMm ?? 100, y: g.boundingBox?.yMm ?? 100, z: g.boundingBox?.zMm ?? 50 } });
      for (const f of r.findings) {
        expect(['blocking', 'cost', 'risk', 'info'], `${file} ${f.ruleId}`).toContain(f.severity);
        expect(f.severity === 'cost', `${file} ${f.ruleId}`).toBe((f.costImpact?.perPartGBP ?? 0) > 0);
      }
      for (const g2 of r.grouped) expect(['blocking', 'cost', 'risk', 'info']).toContain(g2.severity);
    }
  });
  it('a forging undercut on an as-forged face BLOCKS; a sand undercut is a core already in the price (INFO)', () => {
    const k = analyseGeometricDFM(realPart('knuckle-features.json', 'forging', { process: 'closed-die' }));
    expect(k.findings.filter(f => f.ruleId === 'forging.undercut.cannot-release').every(f => f.severity === 'blocking')).toBe(true);
    const s = analyseGeometricDFM(realPart('stub-axle-features.json', 'cast_and_machine', { process: 'sand' }));
    const u = s.findings.filter(f => f.ruleId === 'casting.undercut.requires-core');
    expect(u.length).toBeGreaterThan(0);
    for (const f of u) {
      expect(f.severity).toBe('info');
      expect(f.title).toBe('Undercut face — formed by a core');
      expect(f.costNotModelled).toMatch(/Already in the price: the sand route prices a core a part and the core boxes/);
      expect(`${f.source.standard} ${f.source.note} ${f.detail} ${f.recommendation}`).not.toMatch(/NADCA|slide|die\b/);
    }
  });
});

describe('3 — a DFM £ is the design-addressable delta only', () => {
  const stub = () => analyseGeometricDFM(realPart('stub-axle-features.json', 'cast_and_machine',
    { process: 'sand', materialFamily: 'cast iron', machineIds: ['mach-hmc-400', 'mach-lathe-cnc'] }));
  it('DIN 338 jobber flute lengths, by diameter range', () => {
    expect(jobberFluteMm(14)).toBe(108);
    expect(jobberFluteMm(8)).toBe(75);
    expect(jobberFluteMm(3.15)).toBe(36);
    expect(jobberFluteMm(20)).toBe(140);
    expect(jobberFluteMm(21)).toBeNull();     // outside DIN 338's range: no reach to judge
  });
  it('the stub axle’s Ø14 × 59 (4.2×D, within the 108 mm jobber flute) is not a finding — it was £1.32 of "saving"', () => {
    const r = stub();
    expect(r.findings.some(f => f.ruleId === 'machining.hole.depth-beyond-standard-drill')).toBe(false);
  });
  it('hole sizes: stepped-bore lands are one bore, cored bores and the ISO 866 centre hole are not drill sizes — no finding', () => {
    const r = stub();
    expect(r.findings.some(f => f.ruleId === 'machining.hole.many-sizes')).toBe(false);          // 14 "sizes" before
    expect(r.findings.some(f => f.ruleId === 'machining.hole.non-preferred-diameter')).toBe(false); // the Ø3.15 centre hole
    expect(r.totalAddressableGBP).toBe(0);
  });
});

describe('4 — judged against the costed machine; coaxial lands at one angle are not compound', () => {
  it('on the 4th-axis HMC routing the stub axle has no setups or off-axis finding, and says why', () => {
    const r = analyseGeometricDFM(realPart('stub-axle-features.json', 'cast_and_machine',
      { process: 'sand', machineIds: ['mach-hmc-400', 'mach-lathe-cnc'] }));
    expect(r.findings.some(f => f.ruleId === 'machining.setup.access-directions')).toBe(false);
    expect(r.findings.some(f => f.ruleId === 'machining.hole.compound-angle')).toBe(false);
    const t = r.limitations.join(' ');
    expect(t).toMatch(/Setups were not counted against a 3-axis machine: the costing routes the milling on a 4th-axis machining centre/);
    expect(t).toMatch(/off-axis bore\(s\) at 9\.0° \(a single angle\)/);
  });
  it('with no machine named it is a SINGLE angle on coaxial lands, INFO — never "compound"', () => {
    const r = analyseGeometricDFM(realPart('stub-axle-features.json', 'cast_and_machine', { process: 'sand' }));
    const f = r.findings.find(x => x.ruleId === 'machining.hole.compound-angle')!;
    expect(f.title).toBe('Holes on a single off-axis angle');
    expect(f.severity).toBe('info');
    expect(f.detail).toMatch(/coaxial lands/);
    expect(f.detail).toMatch(/a single angle/);
  });
  it('a truly compound axis on a 3-axis routing is reported; on a 5-axis it is not', () => {
    const a = [0.3, 0.4, Math.sqrt(1 - 0.25)] as [number, number, number];
    const feats: ManufacturingFeature[] = [
      { id: 'P1', kind: 'planar_face', faceIds: [1], axis: [0, 0, 1], areaMm2: 5000 },
      { id: 'P2', kind: 'planar_face', faceIds: [2], axis: [1, 0, 0], areaMm2: 2000 },
      { id: 'H3', kind: 'hole', faceIds: [3], diaMm: 8, depthMm: 20, axis: a, positionMm: [0, 0, 0], openEnds: 1, openDirs: [a] },
    ];
    const part = (machineIds?: string[]): PartContext => ({ commodity: 'machining', cost: COST, ...(machineIds ? { machineIds } : {}),
      featureSet: { available: true, features: feats, medianThicknessMm: 4, wallAnalysisValid: true } });
    expect(analyseGeometricDFM(part(['mach-vmc3'])).findings.find(f => f.ruleId === 'machining.hole.compound-angle')!.title)
      .toBe('Holes on a compound angle');
    expect(analyseGeometricDFM(part(['mach-vmc5'])).findings.some(f => f.ruleId === 'machining.hole.compound-angle')).toBe(false);
    expect(costedMillAxes(['mach-hmc-400'])).toBe(4);
    expect(costedMillAxes(['mach-lathe-cnc'])).toBeNull();
    expect(costedMillAxes(['mach-drill', 'mach-vmc3'])).toBe(3);
  });
});

describe('4 — process-correct text', () => {
  it('a sand casting’s draft says pattern draw and draft metal, never die wear or ejection', () => {
    const r = analyseGeometricDFM(realPart('stub-axle-features.json', 'cast_and_machine', { process: 'sand' }));
    const d = r.findings.find(f => f.ruleId === 'casting.draft.insufficient')!;
    expect(d.recommendation).toMatch(/pattern drags the mould wall/);
    expect(d.recommendation).toMatch(/carries no draft metal/);
    expect(d.costNotModelled).not.toMatch(/die/);
    expect(`${d.source.standard} ${d.source.note}`).not.toMatch(/NADCA|Search-engine|search engine/);
  });
  it('no printed source on the real parts is a search-engine extract or a prototype-shop guide', () => {
    for (const [file, commodity] of [['stub-axle-features.json', 'cast_and_machine'], ['manifold-features.json', 'machining'],
      ['knuckle-features.json', 'forging']] as const) {
      const r = analyseGeometricDFM(realPart(file, commodity, { process: commodity === 'forging' ? 'closed-die' : 'sand' }));
      const t = r.findings.map(f => `${f.source.standard} ${f.source.note ?? ''}`).join(' ');
      expect(t, file).not.toMatch(/search engine|Search-engine|verify against the live|Protolabs|Hubs|Fictiv/);
    }
  });
  it('a roto part gets its own no-pack checklist — no blow-moulding pinch-off or fuel-tank text', () => {
    const r = analyseGeometricDFM({ commodity: 'rotational_moulding', featureSet: { available: false, features: [] } });
    const t = r.limitations.join(' ');
    expect(t).toMatch(/Checks a design engineer should make on this part: wall uniformity/);
    expect(t).not.toMatch(/pinch|parison|fuel tank|feeds/i);
  });
});

describe('6 — Boothroyd DFA is not applicable to a part costed on its own', () => {
  it('is not returned as an estimate; it says why', () => {
    const r = analyseGeometricDFM(realPart('stub-axle-features.json', 'cast_and_machine', { process: 'sand' }));
    expect(r.dfa.available).toBe(false);
    expect(r.dfa.notApplicable).toMatch(/costed on its own, with no assembly/);
    expect(r.dfa.handlingTimeSec).toBeUndefined();
    // only an assembly context brings it back
    expect(analyseGeometricDFM({ ...realPart('stub-axle-features.json', 'cast_and_machine', { process: 'sand' }), assembly: true }).dfa.available).toBe(true);
  });
});

// ── 5 — sheet metal on the developed blank ──────────────────────────────────────────────────────────────────────────
/**
 * An L-bracket skin, built exactly: base 0 ≤ s ≤ 40, a 90° bend of inner radius R over the next πR/2 of arc, a flange
 * beyond; width 0 ≤ y ≤ W. The flat of a developable skin IS its arc-length coordinates (s, y), so the unfold is exact.
 */
function lBracket(flangeMm: number, R = 2, W = 20) {
  const ss: number[] = [0, 10, 20, 30, 40];
  const bendLen = (Math.PI * R) / 2;
  for (let k = 1; k <= 4; k++) ss.push(40 + (bendLen * k) / 4);
  ss.push(40 + bendLen + flangeMm);
  const at = (s: number, y: number): number[] => {
    if (s <= 40) return [s, y, 0];
    if (s <= 40 + bendLen + 1e-9) { const p = (s - 40) / R; return [40 + R * Math.sin(p), y, R * (1 - Math.cos(p))]; }
    return [40 + R, y, R + (s - 40 - bendLen)];
  };
  const V: number[][] = [], U: number[] = [];
  for (const s of ss) for (const y of [0, W]) { V.push(at(s, y)); U.push(s, y); }
  const T: number[] = [];
  for (let i = 0; i < ss.length - 1; i++) { const a = 2 * i, b = 2 * i + 1, c = 2 * i + 2, d = 2 * i + 3; T.push(a, c, b, b, c, d); }
  const outer = [...ss.map((_, i) => 2 * i), ...ss.map((_, i) => 2 * i + 1).reverse()];
  return { V, U, T, outer, mReal: T.length / 3, length: ss[ss.length - 1] };
}
function facts(flangeMm: number, holes: Array<Array<[number, number]>>, t = 1.5): SheetBlankFacts {
  const m = lBracket(flangeMm);
  // hole loops are extra flat vertices (the rules read them as polygons on the flat)
  const U = [...m.U]; const loops: number[][] = [];
  for (const h of holes) { const base = U.length / 2; for (const p of h) U.push(p[0], p[1]); loops.push(h.map((_, i) => base + i)); }
  return sheetBlankFromFlat({ vertices3d: m.V, triangles: m.T, mReal: m.mReal, flat: U, outer: m.outer, holes: loops,
    gaugeMm: t, developable: true, source: 'test L-bracket' });
}
const sq = (x: number, y: number, a: number): Array<[number, number]> => [[x, y], [x + a, y], [x + a, y + a], [x, y + a]];
const sheet = (b: SheetBlankFacts) => analyseGeometricDFM({ commodity: 'sheet_metal', medianWallMm: b.gaugeMm,
  featureSet: { available: true, features: [], medianThicknessMm: b.gaugeMm, wallAnalysisValid: true }, sheetBlank: b });

describe('5 — sheet metal: hole-to-edge, hole-to-bend, minimum flange, bend relief on the developed blank', () => {
  it('reads one straight bend off the skin’s creases, between its two tangent lines', () => {
    const b = facts(10, []);
    expect(b.bends).toHaveLength(1);
    expect(b.bends[0].nMax - b.bends[0].nMin).toBeCloseTo(Math.PI, 2);    // the bend zone = πR/2 of arc, R = 2
    expect(Math.abs(b.bends[0].dir[1])).toBeCloseTo(1, 6);                 // along y
    expect(b.formedRegions).toBe(0);
  });
  it('a hole 2 mm from the tangent line (under 2.5 t = 3.75) is a finding; 10 mm away is not', () => {
    const near = sheet(facts(10, [sq(34, 8, 4)])).findings.filter(f => f.ruleId === 'sheetmetal.blank.hole-to-bend');
    expect(near).toHaveLength(1);
    expect(near[0].measured.value).toBeCloseTo(2, 3);
    expect(near[0].threshold.value).toBeCloseTo(3.75, 3);
    expect(near[0].severity).toBe('risk');
    expect(near[0].source.standard).toMatch(/CostVision engineering heuristic/);
    expect(sheet(facts(10, [sq(26, 8, 4)])).findings.filter(f => f.ruleId === 'sheetmetal.blank.hole-to-bend')).toHaveLength(0);
  });
  it('a hole 1 mm from the blank edge (under 1.5 t = 2.25) is a finding', () => {
    const r = sheet(facts(10, [sq(10, 1, 4)])).findings.filter(f => f.ruleId === 'sheetmetal.blank.hole-to-edge');
    expect(r).toHaveLength(1);
    expect(r[0].measured.value).toBeCloseTo(1, 3);
  });
  it('a 3 mm flange beyond the bend (under 3 t = 4.5) is a finding; 10 mm is not', () => {
    expect(sheet(facts(3, [])).findings.filter(f => f.ruleId === 'sheetmetal.blank.min-flange').map(f => Math.round(f.measured.value * 100) / 100))
      .toEqual([3]);
    expect(sheet(facts(10, [])).findings.some(f => f.ruleId === 'sheetmetal.blank.min-flange')).toBe(false);
  });
  it('a bend running edge to edge needs no relief; one that ends in the blank with no cut does', () => {
    expect(sheet(facts(10, [])).findings.some(f => f.ruleId === 'sheetmetal.blank.bend-relief')).toBe(false);
    // the base runs on past the bend's end (y > 20) with no notch at the corner
    const b = facts(10, []);
    const wide: SheetBlankFacts = { ...b, outline: [[0, 0], [40 + Math.PI + 10, 0], [40 + Math.PI + 10, 20], [40, 20], [40, 30], [0, 30]] };
    expect(sheetBlankFindings({ commodity: 'sheet_metal', featureSet: { available: true, features: [] }, sheetBlank: wide })
      .some(f => f.ruleId === 'sheetmetal.blank.bend-relief')).toBe(true);
    // a relief notch cut past the tangent line at the bend's end
    const relieved: SheetBlankFacts = { ...wide, outline: [[0, 0], [40 + Math.PI + 10, 0], [40 + Math.PI + 10, 20], [38, 20], [38, 22], [40, 22], [40, 30], [0, 30]] };
    expect(sheetBlankFindings({ commodity: 'sheet_metal', featureSet: { available: true, features: [] }, sheetBlank: relieved })
      .some(f => f.ruleId === 'sheetmetal.blank.bend-relief')).toBe(false);
  });
  it('a cut the bend ends at (a lance or relief slit) is not "a hole near the bend"', () => {
    const slit: Array<[number, number]> = [[39, 20], [44, 20], [44, 21], [39, 21]];
    expect(sheet(facts(10, [slit])).findings.some(f => f.ruleId === 'sheetmetal.blank.hole-to-bend')).toBe(false);
  });
  it('without a developed blank the four checks say they did not run', () => {
    const r = analyseGeometricDFM({ commodity: 'sheet_metal', featureSet: { available: true, features: [] } });
    expect(r.limitations.join(' ')).toMatch(/need the developed blank; it was not available/);
  });
});
