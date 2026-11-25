/** Direct Stage 4 on the reading (no browser): every line's price class and price, the breakdown, the warnings. */
import { readFileSync, writeFileSync } from 'node:fs';
import { runStage4 } from '../../server/routes/pcb.js';
const R = JSON.parse(readFileSync('scripts/edu-ctrl-2026-11-25/replies.json', 'utf8'));
const a = JSON.parse(JSON.stringify(R.analysis));
const qty = Number(process.argv[2] ?? 10000);
const s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: R.asil.asilLevel, asilRationale: R.asil.asilRationale,
  asilSafetyFunctions: R.asil.safetyFunctions, ocrResult: { ...R.ocr } as never, country: 'cn', orderQty: qty, tag: '/edu' });
for (const l of a.bom as Array<Record<string, unknown>>) console.log(String(l.qty).padStart(4), String(l.unitPriceGBP).padEnd(9), String(l.lineTotalGBP).padEnd(9),
  String(l.priceSource ?? '').padEnd(10), String(l.classLabel ?? l.priceBasis ?? '').slice(0, 55).padEnd(55), String(l.refDes).slice(0, 26), '|', String(l.description).slice(0, 50));
const bd = s4.selectedCountryBreakdown as Record<string, unknown>;
console.log(JSON.stringify({ total: bd.totalPerBoard, bom: bd.bomCostPerBoard, fab: bd.pcbFabPerBoard, asm: bd.assemblyPerBoard, log: bd.logisticsPerBoard, asil: s4.asil?.costed, domain: s4.domain }));
console.log(JSON.stringify(bd.breakdown));
for (const w of s4.sanityWarnings) console.log('W', w.code, '-', String(w.message).slice(0, 230));
writeFileSync('scripts/edu-ctrl-2026-11-25/stage4-direct.json', JSON.stringify({ s4, analysis: a }, null, 1));
