// Render the DFM / DFA report (PDF + Excel) under Node with the hostile fixture.
import fs from 'node:fs';
import { jsPDF } from 'jspdf';
jsPDF.API.save = function (name) {
  fs.writeFileSync(name.replace(/[\\/:*?"<>|]/g, '-'), Buffer.from(this.output('arraybuffer')));
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
const { DFM_RESULT } = await import('./fixture-dfm.mjs');

exportDfmPdf(DFM_RESULT);
await exportDfmXlsx(DFM_RESULT);
if (!xlsxOut) throw new Error('no xlsx captured');
fs.writeFileSync('dfm-fixture.xlsx', Buffer.from(xlsxOut));
console.log('xlsx bytes:', Buffer.from(xlsxOut).length);
console.log('rendered:', fs.readdirSync('.').filter(f => f.startsWith('BrainSpark_DFM')));
