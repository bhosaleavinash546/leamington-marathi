/**
 * Render the Range Rover L460 PHEV software report headless (no browser pictures — placeholders), through the same model
 * and renderer as the screen. For the full report with the vehicle skeletons use scripts/sw-report/report-sample.ts.
 *   npx tsx scripts/sw-review/rr-phev-pdf-sample.ts <out.pdf> [hub=UK] [volume=200000] [life=6]
 */
import { writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeSWProgram, swRegionFor, type SWRegion } from '../../src/engine/sw-should-cost.js';
import { buildSWReportModel } from '../../src/engine/sw-report-model.js';
import { buildSWReportRequest, hubLabelOf } from '../../src/export/sw-report-request.js';
import { REGIONAL_DATA } from '../../src/engine/regional-rates.js';
import { hardenPdfText } from '../../src/export/pdf.js';
import { renderSWReportPdf } from '../../src/export/sw-report-pdf.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../../src/ui/panels/sw-should-cost-ui.js';

const out = process.argv[2] ?? 'rr-phev.pdf';
const region = (process.argv[3] ?? 'UK') as SWRegion;
const volume = Number(process.argv[4] ?? 200_000), life = Number(process.argv[5] ?? 6);
const demo = SW_VEHICLE_DEMOS.find(d => d.id === 'rr_l460')!;
const result = computeSWProgram({ ...buildVehicleInputs(demo), region, annualProductionVolume: volume, programLifeYears: life });
const countries = Object.entries(REGIONAL_DATA).map(([code, r]) => { const h = swRegionFor(code); return { code, label: (r as { name: string }).name, hub: h.region, hubLabel: hubLabelOf(h.region), basis: h.basis ?? '' }; });
const model = buildSWReportModel(result, buildSWReportRequest(result, { options: { profile: 'vehicle' }, title: demo.label, vehicleDesc: demo.desc, facts: demo.facts, countries }));
const doc = hardenPdfText(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }));
renderSWReportPdf(doc, autoTable as never, model);
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log(`wrote ${out}: ${result.modules.length} modules, ${(doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()} pages`);
