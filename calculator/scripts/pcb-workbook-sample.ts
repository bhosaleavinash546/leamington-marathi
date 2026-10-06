/**
 * The camera board (e2e/fixtures/pcb-camera-replies.json, China, 250k, ASIL-B) through Stage 4 and
 * into the PCB Excel workbook — the sample the design audit was run on.
 *   npx tsx scripts/pcb-workbook-sample.ts out.xlsx [photo.jpg:Label:w:h ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runStage4 } from '../server/routes/pcb.js';
import { cleanBomImageRows } from '../server/utils/pcb-bom-image.js';
import { buildPcbWorkbook } from '../src/export/pcb-workbook.js';

const [out, ...photoArgs] = process.argv.slice(2);
const R = JSON.parse(readFileSync('e2e/fixtures/pcb-camera-replies.json', 'utf8'));
const a = JSON.parse(JSON.stringify(R.analysis));
const s4 = await runStage4({ analysis: a, domain: 'automotive_adas', asilLevel: 'ASIL-B', ocrResult: { ...R.ocr, refDesGroups: [], connectors: [], boardText: [] },
  country: 'cn', orderQty: 250_000, parsedBOM: cleanBomImageRows(R.bomImage.rows).lines, tag: '/sample' });
const analysis = {
  ...a, partName: '360 DEGREE CAMERA PCB',
  _selectedCountryBreakdown: s4.selectedCountryBreakdown!, _countryComparison: s4.countryComparison, _volumeCurves: s4.volumeCurves,
  _confidenceBand: s4.confidenceBand ?? undefined, _sanityWarnings: s4.sanityWarnings,
  _asilLevel: s4.asil!.costed, _asilClaimed: s4.asil!.claimed, _asilNotes: s4.asil!.notes, _asilRationale: s4.asil!.rationale,
  _asilSafetyFunctions: s4.asil!.safetyFunctions, _boardFunction: s4.asil!.boardFunction, _automotiveNRE: s4.automotiveNRE ?? undefined,
  _orderQty: 250_000, stage1Classification: { domain: s4.domain },
};
const photos = photoArgs.map(arg => {
  const [path, label, w, h] = arg.split(':');   // a JPEG as the app keeps it, with its pixel size
  return { label, dataUrl: `data:image/jpeg;base64,${readFileSync(path).toString('base64')}`, w: Number(w), h: Number(h) };
});
const bytes = await buildPcbWorkbook({ analysis: analysis as never, partName: '360 DEGREE CAMERA PCB', annualVolume: 250_000, qualityGrade: 'auto_grade2', photos, generatedAt: new Date('2026-10-06T12:00:00Z') });
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
