// Render the DFM / DFA report (PDF + Excel) under Node with the hostile fixture.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { jsPDF } from 'jspdf';

// REBUILD THE BUNDLE FIRST, ALWAYS.
//
// This was a manual step in the README, and it bit exactly as you would expect:
// a page-one figure was added, the harness was run, the render came back
// IDENTICAL, and the obvious conclusion — "my code did not work" — was wrong.
// The harness had faithfully re-rendered a bundle built before the change.
//
// A QA harness that can silently test stale code is worse than no harness,
// because it reports green over a change it never saw. Ninety milliseconds of
// esbuild is a cheap price for the guarantee.
const ROOT = new URL('../../', import.meta.url).pathname;
const BUNDLE = `${ROOT}scripts/pdf-qa/dfm-report.bundle.mjs`;
execFileSync('npx', ['esbuild', 'src/services/dfm-report.ts', '--bundle', '--format=esm',
  '--platform=node', '--external:jspdf', '--external:exceljs', `--outfile=${BUNDLE}`],
{ cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
fs.writeFileSync(BUNDLE, fs.readFileSync(BUNDLE, 'utf-8')
  .replace('import jsPDF from "jspdf";', 'import { jsPDF } from "jspdf";')
  .replace('const ExcelJS = await import("exceljs");',
    'const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));'));

// SIZE IS A GATE NOW. There was none, and this report just gained embedded
// renders — the failure mode is a PDF that quietly grows to tens of megabytes
// and is unusable in an email to a supplier. scan.py only checks text overflow
// and would never notice.
const MAX_PDF_MB = 8;
const written = [];
jsPDF.API.save = function (name) {
  const file = name.replace(/[\\/:*?"<>|]/g, '-');
  const bytes = Buffer.from(this.output('arraybuffer'));
  fs.writeFileSync(file, bytes);
  written.push({ file, mb: bytes.length / 1e6 });
  return this;
};

let xlsxOut = null;
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
globalThis.URL = { createObjectURL: (b) => { xlsxOut = b.parts[0]; return 'blob:stub'; }, revokeObjectURL() {} };
globalThis.document = {
  createElement: () => ({ click() {}, set href(_v) {}, set download(_v) {} }),
  body: { appendChild() {}, removeChild() {} },
};

const { exportDfmPdf, exportDfmXlsx } = await import('./dfm-report.bundle.mjs');
const {
  DFM_RESULT, DFM_FIGURES, DFM_FIGURE_NOTES, DFM_RESULT_CONFLICT, DFM_RESULT_MEASURED,
  DFM_RESULT_FULL, DFM_RESULT_NO_RULES, DFM_RESULT_CHOSEN,
} = await import('./fixture-dfm.mjs');

// Rendered TWICE on purpose. The no-figure call is the branch the harness has
// always covered and must keep working — a browserless caller, and any code path
// where the capture failed. The figure call proves the image path survives in
// node, where there is no canvas and jsPDF must decode the data URI itself.
exportDfmPdf(DFM_RESULT);
exportDfmPdf({ ...DFM_RESULT, partName: DFM_RESULT.partName + ' (annotated)' }, DFM_FIGURES, DFM_FIGURE_NOTES);
// The two process-family states the cover has to render differently: geometry
// agreeing with the chosen family, and geometry contradicting it.
exportDfmPdf(DFM_RESULT_MEASURED);
exportDfmPdf(DFM_RESULT_CONFLICT);
// Everything the API knows, on the page: route table, company standards,
// per-instance offenders, PMI present, tool reach.
exportDfmPdf(DFM_RESULT_FULL);
// And the states that must never render as an empty clean sheet: an impossible
// material/process pair, a process that shapes nothing, and a file with NO PMI.
exportDfmPdf(DFM_RESULT_NO_RULES);
// The ordinary case: ONE material, ONE process, ONE rule family. The report has
// to say so on the cover page and put that family's findings before the
// alternatives — the ordering that made a real reader think the selection was
// being ignored.
exportDfmPdf(DFM_RESULT_CHOSEN);

let over = 0;
for (const w of written) {
  console.log(`  ${w.mb.toFixed(2)} MB  ${w.file}`);
  if (w.mb > MAX_PDF_MB) { console.error(`FAIL: exceeds ${MAX_PDF_MB} MB`); over++; }
}
if (over) process.exit(1);
// The FULL fixture, not the base one. The base carries no route comparison, so
// exporting it left the workbook's Routes sheet — the sheet a cost engineer
// reaches for first — completely unexercised by this harness.
await exportDfmXlsx(DFM_RESULT_FULL);
if (!xlsxOut) throw new Error('no xlsx captured');
fs.writeFileSync('dfm-fixture.xlsx', Buffer.from(xlsxOut));
console.log('xlsx bytes:', Buffer.from(xlsxOut).length);
console.log('rendered:', fs.readdirSync('.').filter(f => f.startsWith('BrainSpark_DFM')));
