// Render the Innovation Studio PDF (and Excel) under Node with the hostile
// fixture so layout regressions are caught before users see them.
import fs from 'node:fs';
import { jsPDF } from 'jspdf';
jsPDF.API.save = function (name) {
  fs.writeFileSync(name.replace(/[\\/:*?"<>|]/g, '-'), Buffer.from(this.output('arraybuffer')));
  return this;
};

// downloadXlsx targets the browser (Blob + <a download>); stub just enough of
// the DOM to capture the workbook bytes to disk instead.
let xlsxOut = null;
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
globalThis.URL = { createObjectURL: (b) => { xlsxOut = b.parts[0]; return 'blob:stub'; }, revokeObjectURL() {} };
globalThis.document = {
  createElement: () => ({ click() {}, set href(_v) {}, set download(_v) {} }),
  body: { appendChild() {}, removeChild() {} },
};

const { exportInnovationPdf, exportInnovationXlsx } = await import('./innovation-report.bundle.mjs');
const { INNOVATION_RESULT, TRIZ_RESULT } = await import('./fixture-innovation.mjs');

for (const [label, result] of [['innovation', INNOVATION_RESULT], ['triz', TRIZ_RESULT]]) {
  exportInnovationPdf(result);
  xlsxOut = null;
  await exportInnovationXlsx(result);
  if (!xlsxOut) throw new Error(`no xlsx captured for ${label}`);
  fs.writeFileSync(`${label}-fixture.xlsx`, Buffer.from(xlsxOut));
  console.log(`${label} xlsx bytes:`, Buffer.from(xlsxOut).length);
}
console.log('rendered:', fs.readdirSync('.').filter(f => f.startsWith('BrainSpark_Innovation')));
