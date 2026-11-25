/** Headline of the two fixture boards through Stage 4 (no model): the camera board (its BOM picture, China, 250k — one
 *  price paid, £17.00) and the radar board (photos, China, 10k). For a before / after on a class-table change. */
import { readFileSync } from 'node:fs';
import { runStage4 } from '../../server/routes/pcb.js';
import { cleanBomImageRows } from '../../server/utils/pcb-bom-image.js';
const ocr = (R: { ocr: Record<string, unknown> }) => ({ ...R.ocr, refDesGroups: [], connectors: [], boardText: [] }) as never;
const CAM = JSON.parse(readFileSync('e2e/fixtures/pcb-camera-replies.json', 'utf8'));
const RADAR = JSON.parse(readFileSync('e2e/fixtures/pcb-radar-replies.json', 'utf8'));
const out: Record<string, unknown> = {};
for (const [name, R, qty, bom] of [['camera, BOM picture, cn 250k', CAM, 250_000, true], ['camera, photos only, cn 250k', CAM, 250_000, false], ['radar, photos, cn 10k', RADAR, 10_000, false], ['radar, photos, cn 250k', RADAR, 250_000, false]] as const) {
  const a = JSON.parse(JSON.stringify(R.analysis));
  const s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'Unknown' as never, asilRationale: '', asilSafetyFunctions: [],
    ocrResult: ocr(R), country: 'cn', orderQty: qty, ...(bom && R.bomImage ? { parsedBOM: cleanBomImageRows(R.bomImage.rows).lines } : {}), tag: '/check' });
  const bd = s4.selectedCountryBreakdown as Record<string, number>;
  out[name] = { headline: bd.totalPerBoard, bom: bd.bomCostPerBoard };
}
console.log(JSON.stringify(out));
