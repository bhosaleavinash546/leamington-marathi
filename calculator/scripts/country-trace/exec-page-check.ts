/**
 * Does the CORE should-cost report keep to its 7 pages (≤ 8 allowed) on every real part, and does the audit pack's
 * executive page still fit ONE page? Renders both PDFs headless from an arith-audit dump (`scripts/arith-audit/dump.ts`)
 * with a worst case added to what the dump carries: three unanswered questions, the rules' values (the dump's
 * provenance), the route comparison when the dump directory has one (`features-reports/<part>.routes.json`), nine DFM
 * rule groups and, on a cast or forged part, nine uncosted machinable features.
 *
 *   npx tsx scripts/country-trace/exec-page-check.ts <dumpDir> [outDir]
 *
 * Prints, a part: the core report's page count and the page the audit pack's executive summary is on. Exit 1 on a
 * core report over 8 pages or an executive page that spills.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { jsPDF } from 'jspdf';
import { printPDF, printAuditPackPDF, type CADReportMeta } from '../../src/export/pdf.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary, REGIONAL_DATA, type ManufacturingRegion } from '../../src/engine/regional-rates.js';
import { BASELINE } from '../real-parts-baseline.js';

/** The recorded geometry of each part — page 1's part summary reads its envelope, feature table and slits (phase 3). */
const GEOMETRY = new Map((JSON.parse(readFileSync(process.env.CV_BASELINE_FILE ?? BASELINE, 'utf8')) as Array<{ part: string; geometry: Record<string, unknown> }>)
  .map(p => [p.part.replace(/\.(stp|step)$/i, ''), p.geometry]));

const dir = process.argv[2];
const out = process.argv[3] ?? '/tmp/exec-page-check';
const MAX_CORE_PAGES = 8;
mkdirSync(out, { recursive: true });

/** The PDF a print function saves, as bytes. */
function capture(draw: () => void): Buffer {
  let bytes: ArrayBuffer | null = null;
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const orig = api.save;
  api.save = function (this: InstanceType<typeof jsPDF>) { bytes = this.output('arraybuffer'); return this; };
  try { draw(); } finally { api.save = orig; }
  return Buffer.from(bytes!);
}
const pagesOf = (pdf: string) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())![1]);
const pageText = (pdf: string, p: number) => execFileSync('pdftotext', ['-f', String(p), '-l', String(p), pdf, '-']).toString();

/** A field id as a person reads it ("cam-sand-core" → "sand core") — the dump carries ids, the screen carries labels. */
const labelOf = (id: string) => id.replace(/^[a-z]+-/, '').replace(/-/g, ' ');

let bad = 0;
const rows: string[] = [];
for (const f of readdirSync(dir).filter(x => x.endsWith('.json') && x !== 'index.json')) {
  const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (!d.trace?.stackInput || !d.trace?.result) continue;
  const region = (d.region ?? 'UK') as ManufacturingRegion;
  const base = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  const book = region === 'UK' ? base : buildRegionalLibrary(base, region);
  const res = d.trace.result, si = d.trace.stackInput;
  const part = f.replace('.json', '');
  const routesFile = join(dir, 'features-reports', `${part}.routes.json`);
  const routes = existsSync(routesFile) ? JSON.parse(readFileSync(routesFile, 'utf8')) : null;
  const castOrForge = /cast|forg/.test(String(d.commodity));
  const g = GEOMETRY.get(part) as { boundingBox?: never; featureTable?: never; slits?: never } | undefined;
  const meta: CADReportMeta = {
    geometrySource: 'occt', annualVolume: si.annualVolume ?? d.annual,
    ...(g ? { partGeometry: { boundingBox: g.boundingBox ?? null, featureTable: g.featureTable ?? null, slits: g.slits ?? null } } : {}),
    uncertainty: { p10: res.total * 0.9, p90: res.total * 1.1, plusMinusPct: 10 } as never,
    stamp: `${region} rate book · rules v8 · kernel test · 3 Nov 2026`,
    routeComparison: routes ? { ...routes, current: d.commodity, currentLabel: d.commodity, labels: {}, headline: res.total } : null,
    checks: {
      costable: true, sanity: [], overrides: [],
      decisions: [
        ...Object.entries(d.answersUsed ?? {}).map(([id, v]) => ({ id, question: id, severity: 'advisory' as const, answer: String(v) })),
        { id: 'a', question: 'Is the part coated or surface-treated?', severity: 'advisory', answer: null },
        { id: 'b', question: 'Which grade?', severity: 'advisory', answer: null, used: 'the representative grade' },
        { id: 'c', question: 'What tolerance class does the drawing call for?', severity: 'advisory', answer: null },
      ],
      ruleValues: Object.entries(d.provenance ?? {}).map(([id, p]) => {
        const v = p as { value: unknown; basis: string };
        return { label: labelOf(id), fieldId: id, value: String(v.value ?? ''), ruleValue: String(v.value ?? ''), basis: String(v.basis ?? ''), source: 'rule', edited: false };
      }),
    } as never,
    geometricDFM: {
      grouped: Array.from({ length: 9 }, (_, i) => ({ ruleId: ['casting.draft.insufficient', 'casting.fillet.sharp-internal-corner', 'machining.hole.depth-beyond-standard-drill', 'machining.hole.many-sizes',
        'moulding.draft.insufficient', 'forging.draft.below-process-minimum', 'machining.setup.access-directions', 'sheetmetal.hole.smaller-than-thickness', 'casting.section.abrupt-change'][i],
        severity: i < 6 ? 'major' : 'minor', title: `Synthetic finding ${i + 1} with a reasonably long title to wrap`, count: 3 + i,
        recommendation: 'Open the radius to the process minimum on the as-made faces and re-check the section against the costed route before quoting.',
        faceIds: [1, 2, 3], worst: { detail: 'x', measured: { field: 'draftDeg', value: 0, unit: 'deg' } }, range: { min: 0, max: 1, unit: 'deg' },
        threshold: { value: 1, unit: 'deg', comparator: '>=' }, source: { standard: 'test' } })),
      findings: [], limitations: ['a', 'b', 'c'], featuresExamined: 40, rulesEvaluated: 12, packAvailable: true,
    } as never,
    geometricDFMAmounts: { 'casting.draft.insufficient': { text: '£0.42/part' }, 'machining.hole.depth-beyond-standard-drill': { text: '£0.31/part' } },
    ...(castOrForge ? {
      featureLinesInCost: true, featureMachineRatePerHr: 13.59, featureMachineOee: 0.8, featureTurningOp: null,
      featureLines: Array.from({ length: 9 }, (_, i) => ({ kind: i % 2 ? 'boss' : 'hole', diaMm: 10 + i * 3, depthMm: 20, through: true, count: 1, operation: 'Drilling', minutesEach: 6.4,
        totalMinutes: 6.4, volumeCm3: 1, included: false, autoIncluded: false })) as never,
    } : {}),
  };
  const corePdf = join(out, `${part}.core.pdf`), auditPdf = join(out, `${part}.audit.pdf`);
  // CV_LOCAL_CURRENCY=1: in the country's own currency (the money-in-text checks read the converted figures)
  const local = process.env.CV_LOCAL_CURRENCY === '1' && region !== 'UK';
  const cur = local ? REGIONAL_DATA[region].currency : 'GBP', fx = local ? REGIONAL_DATA[region].fxToGBP : 1;
  writeFileSync(corePdf, capture(() => printPDF(res, si, book, cur, fx, d.commodity, null, region, [], meta, base)));
  writeFileSync(auditPdf, capture(() => printAuditPackPDF(res, si, book, cur, fx, d.commodity, null, region, [], meta, base)));
  const core = pagesOf(corePdf), audit = pagesOf(auditPdf);
  let at = 0;
  for (let p = 1; p <= audit && !at; p++) if (pageText(auditPdf, p).includes('Executive Summary')) at = p;
  const next = pageText(auditPdf, at + 1).trim().split('\n')[0] ?? '';
  const execOk = at > 0 && /§1/.test(next);
  const ok = core <= MAX_CORE_PAGES && execOk;
  if (!ok) bad++;
  rows.push(`${ok ? 'ok  ' : 'OVER'} ${part.padEnd(28)} core ${String(core).padStart(2)} pages · audit pack ${String(audit).padStart(2)} pages, executive page p${at}${execOk ? '' : ` — next page: ${next.slice(0, 50)}`}`);
  console.log(rows[rows.length - 1]);
}
console.log(bad ? `${bad} part(s) over: a core report above ${MAX_CORE_PAGES} pages or an executive page that spills` : `every core report is ≤ ${MAX_CORE_PAGES} pages and every executive page fits one page`);
if (bad) process.exitCode = 1;
