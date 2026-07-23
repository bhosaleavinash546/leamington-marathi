/* Front Bumper — Main CAD-to-Cost run + classifier fix report (before/after). */
const { jsPDF } = require('jspdf');
const _at = require('jspdf-autotable');
const autoTable = _at.default || _at;
const fs = require('fs');

const D = JSON.parse(fs.readFileSync(process.env.IN || '/tmp/bumper2.json', 'utf8'));
const OUT = process.env.OUT || '/tmp/bumper2.pdf';

const gbp = n => 'GBP ' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const g3 = n => n.toLocaleString('en-GB', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const k = n => 'GBP ' + Math.round(n).toLocaleString('en-GB');
const NAVY=[30,39,97], ACCENT=[20,81,163], GREY=[110,110,110], RED=[198,40,40], GREEN=[46,125,50], AMBER=[176,96,0];

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const W = doc.internal.pageSize.getWidth(); const M = 40; let y = 0;

doc.setFillColor(...NAVY); doc.rect(0,0,W,74,'F');
doc.setTextColor(255); doc.setFont('helvetica','bold'); doc.setFontSize(18);
doc.text('CostVision  Main CAD-to-Cost Run', M, 32);
doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
doc.text('Front Bumper Fascia  |  auto-classification + should-cost  |  live AI pipeline', M, 50);
doc.setFontSize(8.5); doc.setTextColor(200,210,235);
doc.text('China (CN)  ·  100,000/yr  ·  5-year program  ·  OCCT geometry -> Haiku Stage-1 -> specialist -> sanity', M, 64);
y = 92;

function h(t,c=ACCENT){ doc.setTextColor(...c); doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text(t,M,y); y+=8; doc.setDrawColor(220); doc.line(M,y,W-M,y); y+=12; }
function p(t,c=[40,40,40],s=9.5){ doc.setTextColor(...c); doc.setFont('helvetica','normal'); doc.setFontSize(s); const L=doc.splitTextToSize(t,W-2*M); doc.text(L,M,y); y+=L.length*(s+3.5); }

// Before/After classification banner
h('1. Auto-classification — before vs after the fix');
autoTable(doc, {
  startY: y, margin:{left:M,right:M}, theme:'grid',
  headStyles:{fillColor:NAVY,fontSize:8.5}, bodyStyles:{fontSize:9},
  columnStyles:{0:{fontStyle:'bold',cellWidth:120}},
  head:[['','BEFORE (defect)','AFTER (fixed)']],
  body:[
    ['Commodity', `blow_moulding  (conf ${D.before.conf})`, `injection_moulding  (conf ${D.after.conf})`],
    ['Material', `${D.before.material}  ${D.before.matConf}%`, `${D.after.material}  ${D.after.matConf}%`],
    ['Verdict', 'WRONG — a bumper is not blow-moulded', 'CORRECT — injection-moulded panel'],
  ],
  didParseCell: c => {
    if (c.section==='body' && c.column.index===1) c.cell.styles.textColor = RED;
    if (c.section==='body' && c.column.index===2) c.cell.styles.textColor = GREEN;
  },
});
y = doc.lastAutoTable.finalY + 10;
p('The main CAD-to-Cost feature first mis-classified this injection-moulded fascia as a blow-moulded HDPE part at 92% confidence — the same failure family as the fuel tank, inverted. A bumper fascia and a fuel tank both read as a large, thin-wall, low-fill (0.36%) free-form shell, so the "hollow shell" heuristic over-fired. Fix: a new measured topology signal (enclosed-void count) now separates a sealed container from an open drape.', [60,60,60], 9);
y += 4;

// Geometry provenance
h('2. Measured geometry (OCCT / cadquery — ground truth)');
autoTable(doc, {
  startY:y, margin:{left:M,right:M}, theme:'grid', headStyles:{fillColor:NAVY,fontSize:8.5}, bodyStyles:{fontSize:8.5},
  head:[['Property','Measured','Role']],
  body:[
    ['Solid volume', `${D.geo.volumeCm3.toLocaleString()} cm3`, 'Net weight'],
    ['Bounding box', `${D.geo.bbox.x} x ${D.geo.bbox.y} x ${D.geo.bbox.z} mm`, 'Projected area -> press'],
    ['Topology', `${D.geo.topology.shellCount} shell, ${D.geo.topology.voidCount} enclosed voids (OPEN drape)`, 'Injection vs blow discriminator'],
    ['Free/naked edges', `${D.geo.topology.freeEdgeCount}`, 'Confirms open sheet body'],
    ['Wall (ray-cast -> corrected)', `${D.geo.rayCastWallMm} mm -> ${D.geo.correctedWallMm} mm (2V/S)`, 'Auto-corrected by sanity layer'],
    ['Press auto-sized', `${D.after.tonnes} T -> ${D.after.press}`, 'Clamp from projected area'],
  ],
});
y = doc.lastAutoTable.finalY + 14;

// 8-bucket
h('3. Should-cost — Manual vs CAD-to-Cost (China, per part)');
const row=(lbl,mk,ck,d=true)=>[lbl, g3(D.manual[mk]), g3(D.cadCost[ck]), d?delta(D.cadCost[ck],D.manual[mk]):'—'];
function delta(a,m){ if(!m) return '—'; const pc=((a-m)/m)*100; return `${pc>0?'+':''}${pc.toFixed(0)}%`; }
autoTable(doc, {
  startY:y, margin:{left:M,right:M}, theme:'striped', headStyles:{fillColor:ACCENT,fontSize:8.5}, bodyStyles:{fontSize:8.5},
  columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'}},
  head:[['Cost bucket','Manual','CAD-to-Cost','Change']],
  body:[
    row('Material (resin)','rawMaterial','rawMaterial'),
    row('Process (machine)','process','process'),
    row('Labour','labour','labour'),
    row('Tooling (amortised)','tooling','tooling'),
    ['Packaging', g3(D.manual.packaging), g3(D.cadCost.packaging), '—'],
    ['Logistics', g3(D.manual.logistics), g3(D.cadCost.logistics), '—'],
    row('Overhead (12%)','overhead','overhead'),
    row('Margin (8%)','margin','margin'),
  ],
  foot:[['TOTAL / part', gbp(D.manual.total), gbp(D.cadCost.total), `${(((D.cadCost.total-D.manual.total)/D.manual.total)*100).toFixed(0)}%`]],
  footStyles:{fillColor:NAVY,fontSize:9.5,halign:'right',textColor:255},
  didParseCell:c=>{ if(c.section==='foot'&&c.column.index===0)c.cell.styles.halign='left'; },
});
y = doc.lastAutoTable.finalY + 8;
p(`Manual: hand-entered ${D.manual.weightKg} kg, ${D.manual.wallMm} mm wall, ${D.manual.press}, ${k(D.manual.mouldGBP)} tool.   CAD-to-Cost: measured ${D.after.weightKg} kg, ${D.after.wallMm} mm wall, ${D.after.press}, ${k(D.after.mouldGBP)} OCCT tool. AI cost bracket ${k(D.after.aiRange.low)}–${k(D.after.aiRange.mid)}–${k(D.after.aiRange.high)}; the deterministic engine total is ${gbp(D.cadCost.total)}.`, GREY, 8.5);

if (y > 620) { doc.addPage(); y = 50; }

h('4. The classifier fix', GREEN);
p('Root cause: an injection-moulded fascia and a blow-moulded tank are geometrically alike (large thin-wall low-fill free-form shell). The discriminator is topology: a blow/rotational part encloses a SEALED void (OCCT models it as an extra inner shell), while an injection/thermoformed panel is an OPEN drape with none. The geometry engine now reports voidCount = shells - solids; this bumper scores 1 shell / 0 voids (open). The Stage-1 prompt uses it, and a deterministic guard reclassifies blow/rotational/solid-process -> injection_moulding for a confirmed open drape (and still routes a sealed-void shell -> blow_moulding). Verified live: the same upload now auto-classifies injection_moulding at 0.92, with no forced commodity.', [60,60,60], 9);
y += 4;

h('5. Accuracy & QA', AMBER);
p(`- Commodity now correct (injection moulding) end-to-end through the real feature — the headline defect is resolved.`, GREEN);
p(`- Material nuance: the AI picked PP-GF30 (30% glass-filled, GBP 1.85/kg) -> material GBP ${g3(D.cadCost.rawMaterial)} and total ${gbp(D.cadCost.total)}. A cosmetic front fascia is more typically UNFILLED TPO/PP (flexible, paintable); GF30 suits a structural bumper beam. On unfilled PP the total lands ~GBP 5.2. Confirm the grade before quoting — commodity is right, resin sub-grade is the open lever.`, AMBER);
p(`- Wall misfire already handled: the ray-cast wall (27.1 mm) is auto-corrected to 2.53 mm by the sanity layer (2V/S), so cycle time is sane (~26 s), not 39 min.`);
p(`- DFM ${D.dfm.score}/10 — ${D.dfm.issues.join('; ')}. Undercuts (lamp/grille apertures, side wraps) drive the multi-slide ${k(D.after.mouldGBP)} tool.`);
p(`- Result vs benchmark: a China-sourced small-car fascia should-costs ~GBP 5–8 at 100k/yr; both the unfilled (~5.2) and GF30 (${D.cadCost.total.toFixed(2)}) figures sit in band.`);

y += 4;
h('6. Method');
p('Deterministic 8-bucket engine (computeUniversalStack) on the China regional library. Overhead 12% of factory base, margin 8% of subtotal, once. Tooling amortised over 500,000 units (5 yr x 100k). AI classifies only; every GBP figure is measured geometry or deterministic arithmetic — no AI number sets a price.', GREY, 9);

const pages = doc.internal.getNumberOfPages();
for (let i=1;i<=pages;i++){ doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text('CostVision should-cost — indicative, 2026-Q2 basis. Engineering estimate, not a quotation.', M, 812);
  doc.text(`Page ${i}/${pages}`, W-M-40, 812); }

fs.writeFileSync(OUT, Buffer.from(doc.output('arraybuffer')));
console.log('wrote', OUT);
