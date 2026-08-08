// Render the DFM / DFA report (PDF + Excel) under Node with the hostile fixture.
import fs from 'node:fs';
import { jsPDF } from 'jspdf';

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
  DFM_RESULT, DFM_FIGURES, DFM_RESULT_CONFLICT, DFM_RESULT_MEASURED,
  DFM_RESULT_FULL, DFM_RESULT_NO_RULES,
} = await import('./fixture-dfm.mjs');

// Rendered TWICE on purpose. The no-figure call is the branch the harness has
// always covered and must keep working — a browserless caller, and any code path
// where the capture failed. The figure call proves the image path survives in
// node, where there is no canvas and jsPDF must decode the data URI itself.
exportDfmPdf(DFM_RESULT);
exportDfmPdf({ ...DFM_RESULT, partName: DFM_RESULT.partName + ' (annotated)' }, DFM_FIGURES);
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

let over = 0;
for (const w of written) {
  console.log(`  ${w.mb.toFixed(2)} MB  ${w.file}`);
  if (w.mb > MAX_PDF_MB) { console.error(`FAIL: exceeds ${MAX_PDF_MB} MB`); over++; }
}
if (over) process.exit(1);
await exportDfmXlsx(DFM_RESULT);
if (!xlsxOut) throw new Error('no xlsx captured');
fs.writeFileSync('dfm-fixture.xlsx', Buffer.from(xlsxOut));
console.log('xlsx bytes:', Buffer.from(xlsxOut).length);
console.log('rendered:', fs.readdirSync('.').filter(f => f.startsWith('BrainSpark_DFM')));
