import { readFileSync } from 'node:fs';
import { runStage4 } from '/home/user/leamington-marathi/calculator/server/routes/pcb.ts';
const R = JSON.parse(readFileSync('/home/user/leamington-marathi/calculator/e2e/fixtures/pcb-radar-replies.json', 'utf8'));
const ocr = { ...R.ocr, refDesGroups: R.ocr.refDesGroups ?? [], connectors: R.ocr.connectors ?? [], boardText: R.ocr.boardText ?? [] };
export async function run(qty: number, mut?: (a: any) => void, opts: { domain?: string; asil?: string; country?: string; ocr?: any } = {}) {
  const a = JSON.parse(JSON.stringify(R.analysis));
  mut?.(a);
  const s4 = await runStage4({ analysis: a, domain: opts.domain ?? 'automotive_adas', asilLevel: (opts.asil ?? 'ASIL-C') as any,
    ocrResult: opts.ocr ?? ocr, country: opts.country ?? 'cn', orderQty: qty, tag: '/rev' });
  return { a, s4, bd: s4.selectedCountryBreakdown! };
}
const mode = process.argv[2] ?? 'none';
const log = console.log; console.log = () => {}; console.warn = () => {};
if (mode === 'volumes') {
  for (const q of [100_000, 200_000, 300_000]) {
    const { a, s4, bd } = await run(q);
    log(`\n===== qty ${q} =====`);
    for (const l of a.bom) log([String(l.refDes).padEnd(14), String(l.componentType).padEnd(13), `qty ${l.qty}`, `bought ${l.partsBought}`, `k ${l.volumeMultiplier}`, String(l.priceSource).padEnd(14), String(l.priceBasis ?? l.catalogueMpn ?? '').padEnd(36), `unit ${l.unitPriceGBP}`, `ai ${l.aiEstimatedPriceGBP}`, `tot ${l.lineTotalGBP}`, l.needsVerification ? 'VERIFY' : ''].join(' | '));
    log('BOM total', a.costEstimates.totalBOMCostGBP, 'boardSpec', JSON.stringify({ w: a.boardSpec.widthMm, h: a.boardSpec.heightMm, L: a.boardSpec.estimatedLayers, v: a.boardSpec.throughVias, fin: a.boardSpec.surfaceFinish }), 'asm', JSON.stringify(a.assembly));
    log('breakdown', JSON.stringify({ fab: bd.pcbFabPerBoard, asm: bd.assemblyPerBoard, log: bd.logisticsPerBoard, bom: bd.bomCostPerBoard, total: bd.totalPerBoard, ...bd.breakdown, panel: bd.panelInfo }));
    log('autoAsm', JSON.stringify(s4.automotiveAssemblyCost)); log('autoFab', JSON.stringify(s4.automotiveFabAdjustment));
    log('programPricing', JSON.stringify(s4.programPricing)); log('asil', s4.asil?.costed, 'NRE', s4.automotiveNRE?.totalNRE);
    log('curve cn', JSON.stringify(s4.volumeCurves.cn.filter((p: any) => p.qty >= 25000)));
  }
}
if (mode === 'sens') {
  const Q = Number(process.argv[3] ?? 200_000);
  const base = (await run(Q)).bd.totalPerBoard;
  log('baseline headline', base);
  const cases: Array<[string, (a: any) => void, any?]> = [
    ['all AI unit prices -> 0 (range floor/default)', a => a.bom.forEach((l: any) => { if (!l.ocrExtracted) l.unitPriceGBP = 0; })],
    ['all AI unit prices -> 1e6 (range ceiling)', a => a.bom.forEach((l: any) => { if (!l.ocrExtracted) l.unitPriceGBP = 1e6; })],
    ['all AI unit prices -> 1e-6', a => a.bom.forEach((l: any) => { if (!l.ocrExtracted) l.unitPriceGBP = 1e-6; })],
    ['U1 (OCR) AI price 0.01', a => { a.bom[0].unitPriceGBP = 0.01; }],
    ['U1 (OCR) AI price 1000', a => { a.bom[0].unitPriceGBP = 1000; }],
    ['U2 described "radar processor" BGA price 400', a => { Object.assign(a.bom[1], { componentType: 'ic_bga', description: 'ADAS radar processor', unitPriceGBP: 400 }); }],
    ['U2 described "radar processor" BGA price 1', a => { Object.assign(a.bom[1], { componentType: 'ic_bga', description: 'ADAS radar processor', unitPriceGBP: 1 }); }],
    ['U2 model-invented PN AWR2944 (no OCR)', a => { Object.assign(a.bom[1], { partNumber: 'AWR2944', ocrExtracted: false, lineConf: 0.7 }); }],
    ['U2 model-invented PN TDA4VH (no OCR)', a => { Object.assign(a.bom[1], { partNumber: 'TDA4VH', ocrExtracted: false, lineConf: 0.7 }); }],
    ['U2 model-invented PN TDA4VH claimed OCR', a => { Object.assign(a.bom[1], { partNumber: 'TDA4VH', ocrExtracted: true, lineConf: 1 }); }],
    ['size estimated 220x140', a => { Object.assign(a.boardSpec, { widthMm: 220, heightMm: 140, dimensionsSource: 'estimated' }); }],
    ['size estimated 40x25', a => { Object.assign(a.boardSpec, { widthMm: 40, heightMm: 25, dimensionsSource: 'estimated' }); }],
    ['size "measured" (model claim) 240x240', a => { Object.assign(a.boardSpec, { widthMm: 240, heightMm: 240, dimensionsSource: 'measured' }); }],
    ['layers 4', a => { a.boardSpec.estimatedLayers = 4; }],
    ['layers 14', a => { a.boardSpec.estimatedLayers = 14; }],
    ['microVias 5000', a => { a.boardSpec.microVias = 5000; }],
    ['blindVias 3000', a => { a.boardSpec.blindVias = 3000; }],
    ['throughVias 0 (bounded)', a => { a.boardSpec.throughVias = 0; }],
    ['throughVias 100000 (bounded)', a => { a.boardSpec.throughVias = 100000; }],
    ['hdi any_layer', a => { a.boardSpec.hdiStructure = 'any_layer'; }],
    ['impedance false', a => { a.boardSpec.impedanceControlRequired = false; }],
    ['finish enepig', a => { a.boardSpec.surfaceFinish = 'enepig'; }],
    ['copperWeightOz 6', a => { a.boardSpec.copperWeightOz = 6; }],
    ['copperOzByLayer 8x6', a => { a.boardSpec.copperOzByLayer = [6,6,6,6,6,6,6,6]; }],
    ['boardWeightG 3000', a => { a.boardSpec.boardWeightG = 3000; }],
    ['conformalCoating true', a => { a.boardSpec.conformalCoating = true; }],
    ['ictTimeSec 0', a => { a.assembly.ictTimeSec = 0; }],
    ['ictTimeSec 3600', a => { a.assembly.ictTimeSec = 3600; }],
    ['aoiRequired false', a => { a.assembly.aoiRequired = false; }],
    ['manualJoints 3000', a => { a.assembly.manualJoints = 3000; }],
    ['throughHoleJoints 5000', a => { a.assembly.throughHoleJoints = 5000; }],
    ['bgaCount 0 -> still from BOM', a => { a.assembly.bgaCount = 0; }],
    ['R line: refDes "R" qty 700', a => { Object.assign(a.bom[11], { refDes: 'R', qty: 700 }); }],
    ['C line duplicated without refDes (2nd photo)', a => { a.bom.push({ ...a.bom[12], refDes: '' }); }],
    ['line automotive:false (x3.5 enforce) on U3', a => { a.bom[2].automotive = false; }],
    ['all lines automotive:false', a => { a.bom.forEach((l: any) => { l.automotive = false; }); }],
  ];
  for (const [name, mut] of cases) {
    const { bd, a, s4 } = await run(Q, mut);
    log(`${name.padEnd(48)} headline £${bd.totalPerBoard.toFixed(2)}  Δ ${(bd.totalPerBoard - base >= 0 ? '+' : '')}${(bd.totalPerBoard - base).toFixed(2)}  (fab ${bd.pcbFabPerBoard} asm ${bd.assemblyPerBoard} bom ${bd.bomCostPerBoard}) size ${a.boardSpec.widthMm}x${a.boardSpec.heightMm} U2:${a.bom[1]?.priceSource}/${a.bom[1]?.unitPriceGBP}/${a.bom[1]?.needsVerification ? 'verify' : 'confirmed'}`);
  }
  for (const [name, o] of [['ASIL QM', { asil: 'QM' }], ['ASIL-D', { asil: 'ASIL-D' }], ['ASIL-B', { asil: 'ASIL-B' }], ['domain general (consumer)', { domain: 'general' }], ['country gb', { country: 'gb' }]] as const) {
    const { bd, s4 } = await run(Q, undefined, o as any);
    log(`${name.padEnd(48)} headline £${bd.totalPerBoard.toFixed(2)}  Δ ${(bd.totalPerBoard - base).toFixed(2)} asil costed ${s4.asil?.costed}`);
  }
}
