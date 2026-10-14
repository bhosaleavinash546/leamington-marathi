/**
 * Renders the report skeleton views to PNG through headless Chromium (the same rasteriser the browser export uses), for
 * review: npx tsx scripts/sw-report/skeleton-sample.ts <outdir> [demoId]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { computeSWProgram } from '../../src/engine/sw-should-cost.js';
import { buildSWReportModel, SW_REPORT_GBP_FORMAT, type SWBodyType } from '../../src/engine/sw-report-model.js';
import { skeletonSVGFor, SKELETON_W, SKELETON_H } from '../../src/export/sw-report-skeleton.js';
import { rasteriseSvg } from '../../src/export/svg-raster.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../../src/ui/panels/sw-should-cost-ui.js';

const out = process.argv[2] ?? 'skeleton-out';
const demoId = process.argv[3] ?? 'rr_l460';
mkdirSync(out, { recursive: true });
const d = SW_VEHICLE_DEMOS.find(x => x.id === demoId)!;
const r = computeSWProgram({ ...buildVehicleInputs(d), annualProductionVolume: 200_000, programLifeYears: 6 });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const shoot = async (name: string, svg: string) => {
  writeFileSync(join(out, `${name}.svg`), svg);
  const img = await page.evaluate(rasteriseSvg, { svg, width: SKELETON_W, height: SKELETON_H, scale: 1.2 });
  writeFileSync(join(out, `${name}.png`), Buffer.from(img.dataUrl.split(',')[1], 'base64'));
};
for (const body of ['suv', 'saloon', 'hatchback', 'pickup', 'van'] as SWBodyType[]) {
  const m = buildSWReportModel(r, { profile: 'vehicle', title: d.label, bodyType: body, hubLabel: 'UK', stepRate: { perPMGBP: 1, hubLabel: 'UK', build: '' },
    currency: { code: 'GBP', sym: '£', perGbp: 1 }, fmt: SW_REPORT_GBP_FORMAT, generatedAt: new Date(), bookVersion: '' });
  if (body === 'suv') for (const v of m.skeletons.filter(v => !v.key.startsWith('module-') || v.key === 'module-bms_core')) await shoot(`${body}-${v.key}`, skeletonSVGFor(m, v));
  else await shoot(`${body}-architecture`, skeletonSVGFor(m, m.skeletons[0]));
}
await browser.close();
console.log('wrote', out);
