// Print manual-report.html to PDF with the pre-installed Chromium. Usage: node report-pdf.mjs <in.html> <out.pdf>
import { chromium } from 'playwright';
const [, , inp, out] = process.argv;
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined }); const p = await b.newPage();
await p.goto('file://' + inp); await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>', footerTemplate: `<div style="font-size:7pt;color:#777;width:100%;text-align:center">${process.env.CV_FOOT || 'EDU control board should-cost · manual and reconciliation'} · page <span class=pageNumber></span> of <span class=totalPages></span></div>`,
  margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' } });
await b.close();
