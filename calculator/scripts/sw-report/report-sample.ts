/**
 * Render the 360 software report headless — the same model, renderers and skeleton pictures as the screen's export
 * (pictures rasterised by headless Chromium through src/export/svg-raster.ts).
 *   npx tsx scripts/sw-report/report-sample.ts <outdir> [demo=rr_l460] [profile=vehicle] [hub=UK] [body=suv] [volume=200000] [life=6]
 *   profile domain → domains B,C;  module → bms_core, navigation.  Writes <slug>.pdf (and .xlsx once the workbook exists).
 * Check a change: render, then look at every page (PyMuPDF) and read the text.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { chromium } from 'playwright';
import { computeSWProgram, swRegionFor, type SWRegion } from '../../src/engine/sw-should-cost.js';
import { buildSWReportModel, type SWReportProfile, type SWBodyType } from '../../src/engine/sw-report-model.js';
import { buildSWReportRequest, hubLabelOf } from '../../src/export/sw-report-request.js';
import { reportImageSpecs } from '../../src/export/sw-report-skeleton.js';
import { rasteriseSvg, type RasterImage } from '../../src/export/svg-raster.js';
import { renderSWReportPdf } from '../../src/export/sw-report-pdf.js';
import { hardenPdfText } from '../../src/export/pdf.js';
import { REGIONAL_DATA } from '../../src/engine/regional-rates.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../../src/ui/panels/sw-should-cost-ui.js';

const [out = 'sw-report-out', demoId = 'rr_l460', profile = 'vehicle', hub = 'UK', body = 'suv', vol = '200000', life = '6'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const demo = SW_VEHICLE_DEMOS.find(d => d.id === demoId)!;
const inputs = { ...buildVehicleInputs(demo), region: hub as SWRegion, annualProductionVolume: Number(vol), programLifeYears: Number(life) };
const result = computeSWProgram(inputs);
const countries = Object.entries(REGIONAL_DATA).map(([code, r]) => { const h = swRegionFor(code); return { code, label: (r as { name: string }).name, hub: h.region, hubLabel: hubLabelOf(h.region), basis: h.basis ?? '' }; });
const options = {
  profile: profile as SWReportProfile, bodyType: body as SWBodyType,
  domains: profile === 'domain' ? (['B', 'C'] as const).slice() : undefined,
  moduleIds: profile === 'module' ? ['bms_core', 'navigation'] : undefined,
  meta: { preparedBy: 'CostVision sample', reference: `SW-${demoId.toUpperCase()}-${profile.toUpperCase()}`, confidentiality: 'Sample — not for distribution' },
};
const model = buildSWReportModel(result, buildSWReportRequest(result, { options, title: demo.label, vehicleDesc: demo.desc, facts: demo.facts, countries, generatedAt: new Date() }));
const failed = model.checks.filter(c => !c.ok);
if (failed.length) { console.error('CHECKS FAILED', failed); process.exitCode = 1; }

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const images = new Map<string, RasterImage>();
for (const spec of reportImageSpecs(model)) images.set(spec.key, await page.evaluate(rasteriseSvg, spec));
await browser.close();

const slug = `${demoId}-${profile}-${hub.toLowerCase()}-${body}`;
const doc = hardenPdfText(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }));
renderSWReportPdf(doc, autoTable as never, model, images);
const pdf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(join(out, `${slug}.pdf`), pdf);
console.log(`${slug}.pdf: ${(doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()} pages, ${(pdf.length / 1024).toFixed(0)} KB, ${images.size} pictures, ${model.checks.length} checks (${failed.length} failed)`);
