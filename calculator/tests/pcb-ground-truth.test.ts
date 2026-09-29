/**
 * The root-cause fixes for photo-to-cost accuracy:
 *  1. prices come from the class table / catalogue / part ranges — the AI only
 *     estimates within a range (pcb-class-pricing.ts);
 *  2. a supplied BOM file IS the BOM (pcb-bom-truth.ts);
 *  3. drill + Gerber files are measured for size, layers and vias (pcb-fab-data.ts);
 *  4. Stage 3 asks for structured output, with a free-text fallback.
 */
import { describe, it, expect } from 'vitest';
import { classRange, classDefaultPrice, tableTypeOf } from '../server/utils/pcb-class-pricing.js';
import { capUnconfirmedPrices, groundAndSplit } from '../server/utils/pcb-bom-grounding.js';
import { bomFromFile } from '../server/utils/pcb-bom-truth.js';
import { parseExcellon, parseGerberExtents, measureFabData, applyFabMeasurement, isCopperFile, isOutlineFile } from '../server/utils/pcb-fab-data.js';
import { stabiliseBoardSpec } from '../server/utils/pcb-boardspec-stabilise.js';
import { PCB_ANALYSIS_JSON_SCHEMA, isOutputFormatRejection } from '../server/utils/pcb-analysis-schema.js';
import { applyGroundTruth } from '../server/routes/pcb.js';

describe('class price table — the AI no longer sets a price', () => {
  it('an automotive 0402 resistor lands in its AEC-Q range', () => {
    const r = classRange({ componentType: 'passive_0402', description: 'Automotive AEC-Q200 thick-film resistor', value: '10k' });
    expect(r.lo).toBe(0.003); expect(r.hi).toBe(0.012); expect(r.key).toMatch(/automotive$/);
  });
  it('a consumer 0402 MLCC does not', () => {
    const r = classRange({ componentType: 'passive_0402', description: 'X7R MLCC capacitor' });
    expect(r.hi).toBe(0.015);
  });
  it('description picks the kind: PMIC vs LDO in the same package', () => {
    expect(classRange({ componentType: 'ic_tqfp', description: 'Automotive PMIC/safety supervisor IC' }).label).toMatch(/PMIC/);
    expect(classRange({ componentType: 'ic_soic', description: 'Automotive op-amp/LDO regulator IC' }).label).toMatch(/LDO/);
    expect(classRange({ componentType: 'ic_qfn', description: '77/79GHz FMCW radar transceiver MMIC' }).label).toMatch(/RF/);
  });
  it('the AI estimate only chooses a point inside the range', () => {
    const { bom } = capUnconfirmedPrices([
      { refDes: 'R1-R70', componentType: 'passive_0402', description: 'Automotive AEC-Q200 thick-film resistor', qty: 70, unitPriceGBP: 0.0004 },
      { refDes: 'C1-C10', componentType: 'passive_0603', description: 'Automotive AEC-Q200 X7R MLCC', qty: 10, unitPriceGBP: 0.5 },
      { refDes: 'C11-C20', componentType: 'passive_0603', description: 'Automotive AEC-Q200 X7R MLCC', qty: 10, unitPriceGBP: 0.03 },
    ], undefined, { automotive: true });
    expect(bom[0].unitPriceGBP).toBe(0.003);          // raised to the floor
    expect(bom[0].priceRaised).toBe(true);
    expect(bom[1].unitPriceGBP).toBe(0.06);           // cut to the ceiling
    expect(bom[2].unitPriceGBP).toBe(0.03);           // in range: kept
    expect(bom.every(l => l.priceSource === 'class-range')).toBe(true);
    expect(bom.every(l => String(l.priceNote).includes('table range'))).toBe(true);
  });
  it('a line with no estimate lands at the lower-half midpoint', () => {
    const r = classRange({ componentType: 'passive_0402', description: 'resistor', automotive: true });
    expect(classDefaultPrice(r)).toBeCloseTo(0.003 + 0.009 * 0.25, 5);
    const { bom } = capUnconfirmedPrices([{ refDes: 'R1', componentType: 'passive_0402', description: 'resistor', qty: 1, unitPriceGBP: 0, automotive: true }]);
    expect(bom[0].unitPriceGBP).toBeCloseTo(0.00525, 4);
  });
  it('small table-priced lines count as priced; £1+ lines still go to verify', () => {
    const out = groundAndSplit([
      { refDes: 'R1-R70', componentType: 'passive_0402', description: 'resistor', qty: 70, unitPriceGBP: 0.005, lineConf: 0.9 },
      { refDes: 'U9', componentType: 'ic_qfn', description: 'Unidentified automotive QFN IC', qty: 1, unitPriceGBP: 3.2, lineConf: 0.5 },
    ], []);
    expect(out.confirmedTotal).toBeCloseTo(0.21, 2);   // 70 × £0.003 (consumer ceiling)
    expect(out.unverifiedTotal).toBeGreaterThan(1);
  });
  it('maps BOM-file component types onto the table', () => {
    expect(tableTypeOf('resistor_0402')).toBe('passive_0402');
    expect(tableTypeOf('capacitor_electrolytic', 'radial')).toBe('through_hole');
    expect(tableTypeOf('ic', 'BGA-257')).toBe('ic_bga');
    expect(tableTypeOf('ic', 'QFN-24')).toBe('ic_qfn');
    expect(tableTypeOf('connector', 'pin header 2.54')).toBe('through_hole');
    expect(tableTypeOf('crystal')).toBe('crystal_osc');
  });
});

describe('a supplied BOM file is the BOM', () => {
  const file = [
    { refDes: 'U1', partNumber: 'FS32R294KCMJD', description: 'Radar MCU', value: '', pkg: 'BGA-257', qty: 1 },
    { refDes: 'U2', partNumber: 'TEF8105EN', description: '', value: '', pkg: '', qty: 1 },
    { refDes: 'R1-R90', partNumber: 'CRCW040210K0FKED', description: 'RES 10K 0402 AEC-Q200', value: '10k', pkg: '0402', qty: 0 },
    { refDes: 'C1,C2', partNumber: '', description: 'CAP ALU ELEC 100uF 100V radial', value: '100uF', pkg: '', qty: 2 },
    { refDes: 'TP1-TP4', partNumber: '', description: 'Test point DNP', value: '', pkg: '', qty: 4 },
  ];
  const ai = [
    { refDes: 'U2', description: '77GHz transceiver', pkg: 'QFN (glob-top)', unitPriceGBP: 4, componentType: 'ic_qfn' },
    { refDes: 'J1', description: 'Sealed connector', unitPriceGBP: 5.28, componentType: 'connector_smt' },
  ];
  const t = bomFromFile(file, ai, true);
  it('takes identity and quantity from the file, package from the photo reading', () => {
    expect(t.bom).toHaveLength(5);
    expect(t.bom[0].partNumber).toBe('FS32R294KCMJD');
    expect(t.bom[0].componentType).toBe('ic_bga');
    expect(t.bom[1].pkg).toBe('QFN (glob-top)');
    expect(t.bom[1].aiEstimatedPriceGBP).toBe(4);
    expect(t.bom[2].qty).toBe(90);                                // expanded ref-des range
    expect(t.bom[2].componentType).toBe('passive_0402');
    expect(t.bom[3].componentType).toBe('through_hole');
    expect(t.bom.every(l => l.bomSource === 'file')).toBe(true);
  });
  it('counts placements from the file and reports photo-only parts', () => {
    expect(t.smtPlacements).toBe(92);
    expect(t.throughHoleLines).toBe(2);
    expect(t.bgaCount).toBe(1);
    expect(t.bom[4].notFitted).toBe(true);
    expect(t.aiOnly).toEqual(['J1']);
    const t4 = bomFromFile([{ refDes: 'R1-R90', partNumber: '', description: 'RES', value: '10k', pkg: '0402', qty: 90 }],
      [{ refDes: 'R1-R70', description: 'resistor', unitPriceGBP: 0.005 }, { refDes: 'J1', description: 'connector', unitPriceGBP: 5 }], true);
    expect(t4.aiOnly).toEqual(['J1']);                          // R1-R70 sits inside R1-R90
  });
  it('takes the photo estimate only when the photo line covers every ref-des', () => {
    const t2 = bomFromFile(
      [{ refDes: 'U7-U11', partNumber: '', description: 'small IC', value: '', pkg: 'SOT-23-6', qty: 5 }],
      [{ refDes: 'U6, U7', description: 'PMIC', unitPriceGBP: 5.5, componentType: 'ic_tqfp' }], true);
    expect(t2.bom[0].aiEstimatedPriceGBP).toBeUndefined();
    const { bom } = capUnconfirmedPrices(t2.bom, undefined, { automotive: true });
    expect(bom[0].unitPriceGBP as number).toBeLessThan(0.5);       // SOT-23 small IC, not a PMIC
  });
  it('a part number in the file uses the tool\'s range for that part', () => {
    const t3 = bomFromFile([{ refDes: 'U2', partNumber: 'TEF8105EN', description: '', value: '', pkg: 'QFN', qty: 1 }], [], true);
    const { bom } = capUnconfirmedPrices(t3.bom, l => /TEF810/i.test(String(l.partNumber)) ? { lo: 9, hi: 22, label: 'NXP TEF810x' } : null);
    expect(bom[0].priceSource).toBe('known-range');
    expect(bom[0].unitPriceGBP).toBeCloseTo(9 + 13 * 0.25, 2);
    expect(String(bom[0].priceNote)).toMatch(/Named in your BOM/);
  });
  it('shield cans are hardware, not ICs', () => {
    expect(tableTypeOf('unknown', 'mechanical', 'RF shield can')).toBe('mechanical');
  });
  it('applyGroundTruth swaps the AI BOM for the file and says so', () => {
    const a: Record<string, unknown> = { bom: [...ai, { refDes: 'U9', description: 'Unidentified QFN IC, bottom side' }], assembly: { smtPlacements: 224, bgaCount: 0, reflowSides: 1 }, boardSpec: {} };
    const w = applyGroundTruth(a, file, null, 'automotive_adas');
    expect((a.bom as unknown[]).length).toBe(5);
    expect((a.assembly as Record<string, unknown>).smtPlacements).toBe(92);
    expect((a.assembly as Record<string, unknown>).reflowSides).toBe(2);   // the photo saw bottom-side parts
    expect(w.map(x => x.code)).toEqual(['BOM_FROM_FILE', 'AI_PARTS_NOT_IN_BOM_FILE']);
  });
});

const DRL = `M48
;DRILL file
METRIC
T1C0.300
T2C0.800
T3C3.200
%
G90
T1
X10000Y10000
X10500Y10000
X11000Y10000
T2
X20000Y20000
X21000Y20000
T3
X50000Y50000
M30
`;
const GKO = `%FSLAX35Y35*%
%MOMM*%
%ADD10C,0.100*%
D10*
X0Y0D02*
X8780000Y0D01*
X8780000Y4890000D01*
X0Y4890000D01*
X0Y0D01*
M02*
`;

describe('fab data is measured, not guessed', () => {
  it('reads an Excellon drill file into a hole table', () => {
    const d = parseExcellon(DRL);
    expect(d.total).toBe(6);
    expect(d.holes).toEqual([{ diaMm: 0.3, count: 3 }, { diaMm: 0.8, count: 2 }, { diaMm: 3.2, count: 1 }]);
  });
  it('reads board extents from a Gerber outline', () => {
    expect(parseGerberExtents(GKO)).toEqual({ widthMm: 87.8, heightMm: 48.9 });
  });
  it('recognises copper and outline layers by name', () => {
    expect(isCopperFile('board-F_Cu.gbr')).toBe(true);
    expect(isCopperFile('board.GTL')).toBe(true);
    expect(isCopperFile('board.G2')).toBe(true);
    expect(isCopperFile('board-Edge_Cuts.gbr')).toBe(false);
    expect(isOutlineFile('board-Edge_Cuts.gbr')).toBe(true);
    expect(isOutlineFile('board.GKO')).toBe(true);
  });
  it('measures a whole package: size, layer count, vias vs holes', () => {
    const files = [
      { name: 'radar.drl', text: DRL }, { name: 'radar.GKO', text: GKO },
      ...['GTL', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'GBL'].map(ext => ({ name: `radar.${ext}`, text: GKO })),
    ];
    const m = measureFabData(files);
    expect(m.widthMm).toBe(87.8); expect(m.heightMm).toBe(48.9);
    expect(m.layers).toBe(8);
    expect(m.throughVias).toBe(3);      // ≤ 0.6 mm
    expect(m.throughHoles).toBe(3);     // 0.8 + 3.2 mm
    expect(m.filesUsed).toHaveLength(10);
  });
  it('overrides the guessed spec and the stabiliser keeps the measured values', () => {
    const spec: Record<string, unknown> = { widthMm: 161, heightMm: 89, estimatedLayers: 6, throughVias: 220, dimensionsSource: 'estimated' };
    const m = measureFabData([{ name: 'a.drl', text: DRL.replace('X11000Y10000', 'X11000Y10000\n' + Array.from({ length: 997 }, (_, i) => `X${12000 + i}Y10000`).join('\n')) }, { name: 'a.gko', text: GKO }, ...['GTL', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'GBL'].map(ext => ({ name: `a.${ext}`, text: GKO }))]);
    const changed = applyFabMeasurement(spec, m);
    expect(changed).toHaveLength(3);
    expect(spec.dimensionsSource).toBe('measured');
    expect(spec.throughVias).toBe(1000);
    stabiliseBoardSpec(spec as never, { smtPlacements: 224, bgaCount: 1 }, 'automotive_adas');
    expect(spec.widthMm).toBe(87.8); expect(spec.estimatedLayers).toBe(8); expect(spec.throughVias).toBe(1000);
  });
  it('a guessed via count is still clamped', () => {
    const spec: Record<string, unknown> = { widthMm: 87.8, heightMm: 48.9, estimatedLayers: 8, throughVias: 9000, dimensionsSource: 'measured' };
    stabiliseBoardSpec(spec as never, { smtPlacements: 224, bgaCount: 1 }, 'automotive_adas');
    expect(spec.throughVias as number).toBeLessThan(9000);
  });
});

describe('structured output for Stage 3', () => {
  it('the schema names every field the normaliser reads', () => {
    const props = PCB_ANALYSIS_JSON_SCHEMA.properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['partName', 'boardSpec', 'bom', 'assembly', 'costEstimates', 'confidenceLevel']));
    expect(props.bom.items.required).toEqual(expect.arrayContaining(['refDes', 'componentType', 'qty', 'unitPriceGBP', 'partNumber', 'ocrExtracted']));
    expect(props.boardSpec.required).toEqual(expect.arrayContaining(['dimensionsSource', 'copperOzByLayer', 'boardWeightG', 'conformalCoating']));
  });
  it('only a 400 naming the format parameter triggers the free-text fallback', () => {
    expect(isOutputFormatRejection({ status: 400, message: 'output_config.format is not supported on this model' })).toBe(true);
    expect(isOutputFormatRejection({ status: 400, message: 'temperature is not supported' })).toBe(false);
    expect(isOutputFormatRejection({ status: 529, message: 'overloaded' })).toBe(false);
  });
});
