// Render both PDF reports under Node with a hostile fixture (Unicode arrows,
// long text, many ideas) so layout regressions are caught before users see
// them. See README.md for the three commands.
import fs from 'node:fs';
import { jsPDF } from 'jspdf';
jsPDF.API.save = function (name) {
  fs.writeFileSync(name.replace(/[\\/:*?"<>|]/g, '-'), Buffer.from(this.output('arraybuffer')));
  return this;
};
const { exportToPdf, exportRfqPdf } = await import('./export-service.bundle.mjs');
const { RESULT } = await import('./fixture.mjs');
exportToPdf(RESULT, 'Powertrain — BEV / MHEV', 'Electric Drive Unit (EDU)');
exportRfqPdf(RESULT, 'Powertrain — BEV / MHEV', 'Electric Drive Unit (EDU)', RESULT.ideas.slice(0, 5));
console.log('rendered:', fs.readdirSync('.').filter(f => f.endsWith('.pdf')));
