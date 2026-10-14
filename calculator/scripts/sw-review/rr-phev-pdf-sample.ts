/**
 * Render the software should-cost PDF report headless (no browser) for the Range Rover L460 PHEV demo — the same
 * builder the screen's PDF button calls (src/export/sw-report-pdf.ts), fed by the same engine views.
 *   npx tsx scripts/sw-review/rr-phev-pdf-sample.ts <out.pdf> [hub=UK] [volume=200000] [life=6]
 * Check a change: render, then read the text (pdftotext -layout) and the pages (pdftoppm -png).
 */
import { writeFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeSWProgram, swRegionFor, swRateBasis, swLoadedRate, swOverhead, type SWRegion } from '../../src/engine/sw-should-cost.js';
import { swEvidence, swUnitEconomics, swSpendProfile, swMakeBuy, swQuoteCheck, swHubComparison } from '../../src/engine/sw-cockpit.js';
import { swCostingSteps } from '../../src/engine/sw-costing-steps.js';
import { SW_HUB_RATES } from '../../src/engine/sw-country-rates.js';
import { REGIONAL_DATA } from '../../src/engine/regional-rates.js';
import { hardenPdfText } from '../../src/export/pdf.js';
import { buildSWReportPdf, hubMedianNote } from '../../src/export/sw-report-pdf.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../../src/ui/panels/sw-should-cost-ui.js';

const out = process.argv[2] ?? 'rr-phev.pdf';
const region = (process.argv[3] ?? 'UK') as SWRegion;
const volume = Number(process.argv[4] ?? 200_000), life = Number(process.argv[5] ?? 6);
const demo = SW_VEHICLE_DEMOS.find(d => d.id === 'rr_l460')!;
const inputs = { ...buildVehicleInputs(demo), region, annualProductionVolume: volume, programLifeYears: life };
const result = computeSWProgram(inputs);
const M = (n: number) => `£${(n / 1e6).toFixed(1)}M`;
const money = (n: number, dp = 0) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const label = (h: string) => SW_HUB_RATES[h as keyof typeof SW_HUB_RATES]?.label ?? h;
const hub = SW_HUB_RATES[region as keyof typeof SW_HUB_RATES];
const used = swRateBasis(inputs).find(([k]) => k === 'Engineer rate used')?.[1] ?? '';
const rate = { perPMGBP: swLoadedRate(inputs), hubLabel: label(region),
  build: `${used.replace(/^£[\d,]+ — /, '')}; mid ${money(hub.midPerPMGBP)} / senior ${money(hub.seniorPerPMGBP)} per person-month (salary + statutory on-cost ÷ productive hours × 152 h), × development source price × ${swOverhead(inputs).toFixed(2)} engineering burden.` };
const doc = hardenPdfText(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }));
const obs = (o: { value: number; source: string; url: string; statistic?: string }) => [`${hub.currency} ${o.value.toLocaleString('en-GB')}`, `${o.source}${o.statistic ? ` (${o.statistic})` : ''}`, o.url] as [string, string, string];
buildSWReportPdf(doc, autoTable as never, {
  result, title: demo.label, vehicleDesc: demo.desc, facts: demo.facts, hubLabel: label(region),
  steps: swCostingSteps(result, rate, { money: n => (n >= 1e6 ? M(n) : money(n)), number: (n, dp = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: dp }) }),
  hubs: swHubComparison(result),
  countries: Object.entries(REGIONAL_DATA).map(([code, r]) => { const h = swRegionFor(code); return { code, label: (r as { name: string }).name, hub: h.region, hubLabel: label(h.region), basis: h.basis ?? '' }; }),
  evidence: swEvidence(result), unit: swUnitEconomics(result), spend: swSpendProfile(result), makeBuy: swMakeBuy(result), quote: swQuoteCheck(result, {}),
  hubRate: { build: hub.build, confidence: hub.confidence, median: hubMedianNote(hub) ?? undefined, sources: [...hub.mid.map(o => { const x = obs(o); return ['Mid: ' + x[0], x[1], x[2]] as [string, string, string]; }),
    ...hub.senior.map(o => { const x = obs(o); return ['Senior: ' + x[0], x[1], x[2]] as [string, string, string]; }), ['Employer on-cost', hub.onCostBasis, hub.onCostUrl ?? ''], ['Working hours', hub.hoursBasis, '']] },
  loadedRate: swLoadedRate(inputs), money, moneyM: M, unitM: '£M', sym: '£', generatedAt: new Date(), bookVersion: swRateBasis(inputs).find(([k]) => k === 'Rate book')?.[1] ?? '',
});
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log(`wrote ${out}: ${result.modules.length} modules, total ${M(result.summary.grandTotal)}, ${(doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()} pages`);
