// Render the REAL API response for a real customer part, so the report can be
// judged as a director would see it rather than from a synthetic fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { exportDfmPdf } from './dfm-report.bundle.mjs';
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'));
data.partName = 'Casting Bracket';
data.fileName = 'Casting Braket.stp';
data.subject = { part: 'Casting Bracket', system: 'Chassis',
                 material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)' };
globalThis.window = undefined;
const saved = [];
const origSave = (await import('jspdf')).jsPDF.prototype.save;
(await import('jspdf')).jsPDF.prototype.save = function (name) {
  writeFileSync(name, Buffer.from(this.output('arraybuffer')));
  saved.push(name);
};
exportDfmPdf(data);
(await import('jspdf')).jsPDF.prototype.save = origSave;
console.log('rendered:', saved);
