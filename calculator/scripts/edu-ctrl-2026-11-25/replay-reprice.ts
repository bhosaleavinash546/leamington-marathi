/**
 * Replays a live /api/pcb/reprice through runStage4 (no browser, no model): the analysis the screen held (rawBom,
 * board spec, the engineer's userCorrections), the same country / quantity / domain. Prints the headline and each
 * line, so a rule change can be measured against the live result it must reproduce first.
 *   npx tsx scripts/edu-ctrl-2026-11-25/replay-reprice.ts <reprice.json> [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runStage4 } from '../../server/routes/pcb.js';
const live = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const analysis = JSON.parse(JSON.stringify(live.analysis));
const marks = (live.ocrExtraction?.icMarkings ?? []).map(String);
const s4 = await runStage4({
  analysis, domain: String(live.boardDomain ?? live.stage1Classification?.domain ?? 'general'), asilLevel: 'Unknown' as never,
  asilRationale: '', asilSafetyFunctions: [],
  ocrResult: { icMarkings: marks, refDesGroups: [], connectors: (live.ocrExtraction?.connectors ?? []).map(String), boardText: [],
    extractionQuality: String(live.ocrExtraction?.extractionQuality ?? 'medium') } as never,
  country: String(live.selectedCountry ?? 'cn'), orderQty: Number(live.orderQty ?? 10000), tag: '/replay',
});
const bd = s4.selectedCountryBreakdown as Record<string, number>;
const out = { headline: bd.totalPerBoard, bom: bd.bomCostPerBoard, fab: bd.pcbFabPerBoard, asm: bd.assemblyPerBoard,
  lines: (analysis.bom as Array<Record<string, unknown>>).map(l => ({ refDes: l.refDes, qty: l.qty, unit: l.unitPriceGBP, line: l.lineTotalGBP,
    src: l.priceSource, basis: l.priceBasis, ct: l.componentType, pkg: l.pkg })) };
console.log(JSON.stringify({ headline: out.headline, bom: out.bom, fab: out.fab, asm: out.asm, liveHeadline: live.selectedCountryBreakdown.totalPerBoard, liveBom: live.selectedCountryBreakdown.bomCostPerBoard }));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
