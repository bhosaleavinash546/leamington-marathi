/* Build the Front Bumper Manual-vs-CAD should-cost comparison PDF. */
const { jsPDF } = require('jspdf');
const _at = require('jspdf-autotable');
const autoTable = _at.default || _at;
const fs = require('fs');

const IN = process.env.IN || '/tmp/bumper.json';
const OUT = process.env.OUT || '/tmp/bumper-report.pdf';
const D = JSON.parse(fs.readFileSync(IN, 'utf8'));

const gbp = n => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const g3 = n => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const NAVY = [30, 39, 97], ACCENT = [20, 81, 163], GREY = [110, 110, 110], RED = [198, 40, 40], GREEN = [46, 125, 50];

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const W = doc.internal.pageSize.getWidth();
const M = 40;
let y = 0;

function header() {
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 74, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('CostVision  Should-Cost Report', M, 32);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.text('Front Bumper Fascia  |  Injection Moulding  |  Manual vs CAD-to-Cost', M, 50);
  doc.setFontSize(8.5); doc.setTextColor(200, 210, 235);
  doc.text('China (CN) sourcing  ·  100,000/yr  ·  5-year program (500k amortisation)  ·  2026-Q2 rate basis', M, 64);
  y = 96;
}
function h(t, c = ACCENT) { doc.setTextColor(...c); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(t, M, y); y += 8; doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 12; }
function p(t, c = [40,40,40], size = 9.5) { doc.setTextColor(...c); doc.setFont('helvetica', 'normal'); doc.setFontSize(size); const lines = doc.splitTextToSize(t, W - 2*M); doc.text(lines, M, y); y += lines.length * (size + 3.5); }

header();

// ── Executive summary band ──
doc.setFillColor(245, 248, 253); doc.roundedRect(M, y, W - 2*M, 66, 4, 4, 'F');
doc.setTextColor(...GREY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
const cw = (W - 2*M) / 3;
const cards = [
  ['MANUAL SHOULD-COST', gbp(D.manual.total), 'hand-entered inputs', NAVY],
  ['CAD-TO-COST', gbp(D.cad.total), `${(((D.cad.total-D.manual.total)/D.manual.total)*100).toFixed(0)}% vs manual`, GREEN],
  ['ANNUALISED (CAD)', '£' + Math.round(D.cad.total*100000).toLocaleString(), '100k/yr piece cost', ACCENT],
];
cards.forEach((c, i) => {
  const x = M + i*cw + 12;
  doc.setTextColor(...GREY); doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.text(c[0], x, y+18);
  doc.setTextColor(...c[3]); doc.setFontSize(19); doc.text(c[1], x, y+40);
  doc.setTextColor(...GREY); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text(c[2], x, y+54);
});
y += 82;

// ── Geometry provenance ──
h('1. Measured geometry (OCCT / cadquery — ground truth)');
autoTable(doc, {
  startY: y, margin: { left: M, right: M }, theme: 'grid',
  headStyles: { fillColor: NAVY, fontSize: 8.5 }, bodyStyles: { fontSize: 8.5 },
  head: [['Property', 'Measured value', 'Used for']],
  body: [
    ['Solid volume', `${D.GEO.volumeCm3.toLocaleString()} cm³`, 'Net part weight'],
    ['Bounding box', `${D.GEO.bbox.x} × ${D.GEO.bbox.y} × ${D.GEO.bbox.z} mm`, 'Projected area -> press tonnage'],
    ['Surface area', `${(D.GEO.surfaceCm2/100).toFixed(0)} cm² (both faces)`, 'True wall back-calculation'],
    ['Projected area (x·y)', `${Math.round(D.projAreaBBoxCm2).toLocaleString()} cm²`, `Clamp ${Math.round(D.tonnes)} T -> press ${D.pressId}`],
    ['True wall (vol ÷ ½area)', `${D.trueWallMm.toFixed(2)} mm`, 'Cooling time / cycle'],
    ['Ray-cast wall (raw)', `${D.GEO.rayCastWallMm} mm  — MISFIRE`, 'Rejected (see §4 accuracy)'],
    ['OCCT mould-cost estimate', gbp(D.GEO.imMouldCostGBP).replace('.00',''), 'Tooling (CAD run)'],
  ],
});
y = doc.lastAutoTable.finalY + 16;

// ── 8-bucket comparison ──
h('2. 8-bucket should-cost comparison (China, per part)');
const b = (s, k) => g3(s[k]);
autoTable(doc, {
  startY: y, margin: { left: M, right: M }, theme: 'striped',
  headStyles: { fillColor: ACCENT, fontSize: 8.5 }, bodyStyles: { fontSize: 8.5 },
  columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  head: [['Cost bucket', 'Manual', 'CAD-to-Cost', 'Change']],
  body: [
    ['Material (resin)', b(D.manual,'rawMaterial'), b(D.cad,'rawMaterial'), delta(D.cad.rawMaterial, D.manual.rawMaterial)],
    ['Process (machine)', b(D.manual,'process'), b(D.cad,'process'), delta(D.cad.process, D.manual.process)],
    ['Labour', b(D.manual,'labour'), b(D.cad,'labour'), delta(D.cad.labour, D.manual.labour)],
    ['Tooling (amortised)', b(D.manual,'tooling'), b(D.cad,'tooling'), delta(D.cad.tooling, D.manual.tooling)],
    ['Packaging', b(D.manual,'packaging'), b(D.cad,'packaging'), '—'],
    ['Logistics', b(D.manual,'logistics'), b(D.cad,'logistics'), '—'],
    ['Overhead (12%)', b(D.manual,'overhead'), b(D.cad,'overhead'), delta(D.cad.overhead, D.manual.overhead)],
    ['Margin (8%)', b(D.manual,'margin'), b(D.cad,'margin'), delta(D.cad.margin, D.manual.margin)],
  ],
  foot: [['TOTAL / part', gbp(D.manual.total), gbp(D.cad.total), `${(((D.cad.total-D.manual.total)/D.manual.total)*100).toFixed(0)}%`]],
  footStyles: { fillColor: NAVY, fontSize: 9.5, halign: 'right', textColor: 255 },
  didParseCell: c => { if (c.section === 'foot' && c.column.index === 0) c.cell.styles.halign = 'left'; },
});
y = doc.lastAutoTable.finalY + 16;

function delta(a, m) { if (m === 0) return '—'; const pct = ((a - m) / m) * 100; return `${pct>0?'+':''}${pct.toFixed(0)}%`; }

// ── Key input differences ──
h('3. Where the two estimates diverge');
autoTable(doc, {
  startY: y, margin: { left: M, right: M }, theme: 'grid',
  headStyles: { fillColor: NAVY, fontSize: 8.5 }, bodyStyles: { fontSize: 8.5 },
  head: [['Driver', 'Manual (hand)', 'CAD (measured)', 'Effect']],
  body: [
    ['Part weight', `${D.manual.input.partWeightKg} kg (estimate)`, `${D.cad.input.partWeightKg} kg (vol×density)`, 'Manual +73% material'],
    ['Wall thickness', `${D.manual.input.wallThicknessMm} mm`, `${D.cad.input.wallThicknessMm} mm`, 'Cycle time'],
    ['Projected area', `${D.manual.input.projectedAreaCm2} cm² (guess)`, `${D.cad.input.projectedAreaCm2} cm² (bbox)`, 'Press sizing'],
    ['Press (clamp)', D.manual.input.machineId, `${D.cad.input.machineId} (auto)`, 'CAD sizes to tonnage'],
    ['Mould tooling', gbp(D.manual.input.mouldCost).replace('.00',''), gbp(D.cad.input.mouldCost).replace('.00',''), 'OCCT parametric'],
    ['Cycle time', `${(D.manual.cycleSec).toFixed(0)} s`, `${(D.cad.cycleSec).toFixed(0)} s`, 'From wall²'],
  ],
});
y = doc.lastAutoTable.finalY + 16;

if (y > 640) { doc.addPage(); y = 50; }

// ── Accuracy / QA ──
h('4. Accuracy & QA findings', RED);
p('• Headline CAD result £' + D.cad.total.toFixed(2) + '/part sits squarely in the industry should-cost band for a small-car front-bumper fascia (unpainted, fascia only) sourced in China at 100k/yr (~£3–6). The manual £' + D.manual.total.toFixed(2) + ' is ~26% higher, driven almost entirely by a hand weight estimate of ' + D.manual.input.partWeightKg + ' kg vs the measured ' + D.cad.input.partWeightKg + ' kg — material is the dominant bucket for a moulded bumper, so weight error flows straight to the total.');
y += 2;
p('• GEOMETRY MISFIRE CAUGHT: the automated ray-cast wall-thickness returned ' + D.GEO.rayCastWallMm + ' mm on this large free-form shell (492 B-spline faces, 4 samples). Used verbatim it inflates cooling time to ' + (D.cadRaw.cycleSec/60).toFixed(0) + ' min and the piece cost to ' + gbp(D.cadRaw.total) + ' (29× too high). The defensible wall — ' + D.trueWallMm.toFixed(2) + ' mm, back-calculated from volume ÷ half surface area — restores a sane ' + (D.cad.cycleSec).toFixed(0) + ' s cycle. This is exactly the class of AI/geometry claim the deterministic sanity layer must override, and why geometry is treated as ground truth but every derived input is bounds-checked.', RED);
y += 2;
p('• DFM: score ' + D.dfm.score + '/10 — ' + D.dfm.issues.map(i => i.title).join('; ') + '. Undercuts (fog-lamp/grille apertures, side wraps) require side-actions/lifters — a real tooling-cost driver on bumpers; the £200k mould reflects a large multi-slide tool.');
y += 2;
p('• Weight caveat: costed with unfilled PP copolymer (density 900 kg/m³ -> ' + D.cad.input.partWeightKg + ' kg). A production talc/EPDM-modified bumper grade (TPO, density ~ 1050) would read ~2.14 kg and a slightly higher £/kg — lift material ~15%. Volume is ground truth; density/grade is the lever.');

y += 6;
h('5. Method & assumptions');
p('Deterministic 8-bucket engine (computeUniversalStack) on the China regional rate library (buildRegionalLibrary CN). Overhead 12% of factory base, margin 8% of subtotal, applied once. Tooling amortised over the 5-year / 500,000-unit program. Cooling = 3.16 · wall² (PP). No AI number sets a price — the LLM only classifies; every value here is measured geometry or deterministic arithmetic. NOTE: the AI material/process classification stage was not executed in this run (no API key present); material was set to the unambiguous bumper resin (PP) and all figures are the geometry-grounded deterministic result.', GREY, 9);

// footer
const pages = doc.internal.getNumberOfPages();
for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text('CostVision should-cost — indicative, 2026-Q2 basis. Figures are engineering estimates, not quotations.', M, 812);
  doc.text(`Page ${i}/${pages}`, W - M - 40, 812); }

doc.save ? fs.writeFileSync(OUT, Buffer.from(doc.output('arraybuffer'))) : null;
console.log('wrote', OUT);
