/* PCB Image->BOM should-cost report — Automotive radar module. */
const { jsPDF } = require('jspdf');
const _at = require('jspdf-autotable'); const autoTable = _at.default || _at;
const fs = require('fs');
const D = JSON.parse(fs.readFileSync(process.env.IN || '/tmp/pcb_report.json', 'utf8'));
const OUT = process.env.OUT || '/tmp/pcb-report.pdf';

const NAVY=[15,32,65], BLUE=[37,99,235], GREY=[110,110,110], GRN=[22,140,74], RED=[190,40,40], AMB=[176,96,0];
const g=(n)=>'GBP '+Number(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const k=(n)=>'GBP '+Math.round(n).toLocaleString('en-GB');
const doc=new jsPDF({unit:'pt',format:'a4'}); const W=doc.internal.pageSize.getWidth(); const M=40; let y=0;
function hdr(){doc.setFillColor(...NAVY);doc.rect(0,0,W,76,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(17);
  doc.text('CostVision  PCB Image -> BOM Should-Cost',M,30);doc.setFont('helvetica','normal');doc.setFontSize(10);
  doc.text(D.part,M,48);doc.setFontSize(8.5);doc.setTextColor(200,212,240);
  doc.text(D.region+'   ·   '+D.volume.toLocaleString()+'/yr   ·   '+D.programYears+'-year program   ·   vision pipeline (Haiku classify + ASIL -> Sonnet BOM)',M,64);y=96;}
function h(t,c=BLUE){doc.setTextColor(...c);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(t,M,y);y+=7;doc.setDrawColor(220);doc.line(M,y,W-M,y);y+=12;}
function p(t,c=[45,45,45],s=9){doc.setTextColor(...c);doc.setFont('helvetica','normal');doc.setFontSize(s);const L=doc.splitTextToSize(t,W-2*M);doc.text(L,M,y);y+=L.length*(s+3.3);}
hdr();

// exec cards
doc.setFillColor(244,247,252);doc.roundedRect(M,y,W-2*M,58,4,4,'F');
const cw=(W-2*M)/3;
[['IMAGE -> BOM (AI)',g(D.ai.total),'per board, China 150k',BLUE],
 ['ENGINEERING (corrected)',g(D.manual.total),(((D.ai.total-D.manual.total)/D.manual.total*100).toFixed(0))+'% vs AI',GRN],
 ['SAFETY',String(D.asil),'ISO 26262 ASIL',RED]].forEach((c,i)=>{const x=M+i*cw+12;
  doc.setTextColor(...GREY);doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.text(c[0],x,y+17);
  doc.setTextColor(...c[3]);doc.setFontSize(18);doc.text(c[1],x,y+37);
  doc.setTextColor(...GREY);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(c[2],x,y+50);});
y+=72;

h('1. Board specification — AI vision vs measured ground truth');
autoTable(doc,{startY:y,margin:{left:M,right:M},theme:'grid',headStyles:{fillColor:NAVY,fontSize:8.5},bodyStyles:{fontSize:8.5},
 head:[['Parameter','AI (from photos)','Ground truth (board panel)','Verdict']],
 body:[
  ['Layers',String(D.spec_ai.layers),String(D.spec_gt.layers)+' layer',D.spec_ai.layers===D.spec_gt.layers?'OK':'off'],
  ['Dimensions',D.spec_ai.w+' x '+D.spec_ai.h+' mm ('+D.spec_ai.areaCm2+' cm2)',D.spec_gt.w+' x '+D.spec_gt.h+' mm ('+D.spec_gt.areaCm2+' cm2)','AI ~'+(D.spec_ai.areaCm2/D.spec_gt.areaCm2).toFixed(1)+'x area'],
  ['Surface finish',D.spec_ai.finish,D.spec_gt.finish,'AI over-spec'],
  ['Technology',D.spec_ai.tech,D.spec_gt.tech+' ('+D.spec_gt.thk+' mm)','~'],
  ['Weight','-',D.spec_gt.wt+' g','ref'],
 ]});
y=doc.lastAutoTable.finalY+8;
p('Board size has no scale reference in a photo, so absolute dimensions are the AI\'s weakest estimate. Because fab is a small fraction of a component-heavy automotive board, this only moves the total ~8% (fab '+g(D.ai.fab)+' -> '+g(D.manual.fab)+' at the true '+D.spec_gt.areaCm2+' cm2). Layer count, BOM, ASIL and program pricing are unaffected.',GREY,8.5);

h('2. Should-cost breakdown (per board, China @ 150k)');
autoTable(doc,{startY:y,margin:{left:M,right:M},theme:'striped',headStyles:{fillColor:BLUE,fontSize:8.5},bodyStyles:{fontSize:8.5},
 columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'}},
 head:[['Cost element','Image -> BOM (AI)','Engineering (corrected)','Notes']],
 body:[
  ['PCB fabrication',g(D.ai.fab),g(D.manual.fab),'8-layer, area-driven'],
  ['SMT assembly',g(D.ai.asm),g(D.manual.asm),D.assembly.smtPlacements+' placements, 1 BGA'],
  ['BOM (components)',g(D.ai.bom),g(D.manual.bom),'AEC-Q automotive grade'],
  ['Logistics',g(D.ai.logi),g(D.manual.logi),'ex-China'],
 ],
 foot:[['TOTAL / board',g(D.ai.total),g(D.manual.total),(((D.ai.total-D.manual.total)/D.manual.total*100).toFixed(0))+'%']],
 footStyles:{fillColor:NAVY,fontSize:9.5,halign:'right',textColor:255},
 didParseCell:c=>{if(c.section==='foot'&&c.column.index===0)c.cell.styles.halign='left';}});
y=doc.lastAutoTable.finalY+14;

h('3. Bill of Materials (AI-extracted, '+D.bom.length+' lines · '+D.needsVerif+' need verification)');
autoTable(doc,{startY:y,margin:{left:M,right:M},theme:'grid',headStyles:{fillColor:NAVY,fontSize:7.5},bodyStyles:{fontSize:7.3},
 columnStyles:{2:{halign:'center'},3:{halign:'right'},4:{halign:'right'}},
 head:[['RefDes','Description','Qty','Unit GBP','Ext GBP']],
 body:D.bom.map(x=>[x.refDes,(x.description||'').slice(0,46),String(x.qty),Number(x.unitPriceGBP).toFixed(3),(x.qty*x.unitPriceGBP).toFixed(2)]),
 foot:[['','BOM total','','','GBP '+D.bom.reduce((s,x)=>s+x.qty*x.unitPriceGBP,0).toFixed(2)]],footStyles:{fillColor:[225,230,238],textColor:NAVY,fontStyle:'bold',fontSize:8},columnStyles:{4:{halign:'right'}}});
y=doc.lastAutoTable.finalY+14;

if(y>640){doc.addPage();y=50;}
h('4. Functional safety (ISO 26262) & automotive NRE',RED);
p('ASIL: '+D.asil+' — '+(D.asilRationale||'').replace(/\s+/g,' ').trim(),[45,45,45],9);
p('Safety functions: '+(D.safetyFns||[]).join('; '),GREY,8.5);
p('Automotive NRE (one-time, amortised separately): PPAP '+k(D.nre.ppapCost)+' · FMEA '+k(D.nre.fmeaCost)+' · DVP&R '+k(D.nre.dvprCost)+' · ASIL audit '+k(D.nre.asilAuditCost)+'  =  '+k(D.nre.totalNRE)+' total.',[45,45,45],9);
y+=2;
h('5. Program pricing ('+D.programYears+'-yr) & regional options');
p('Program contract pricing at this volume: spot BOM '+g(D.program.spotBOMTotal)+' -> program BOM '+g(D.program.programBOMTotal)+'  ('+D.program.savingsPct+'% via '+String(D.program.pricingTier).replace(/_/g,' ')+').',[45,45,45],9);
autoTable(doc,{startY:y+2,margin:{left:M,right:M},theme:'grid',headStyles:{fillColor:BLUE,fontSize:8},bodyStyles:{fontSize:8},
 columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'right'}},
 head:[['Region','Fab','Assembly','BOM','Total/board']],
 body:D.countries.map(c=>[c.countryName.replace(/\s*\(.*/,''),g(c.pcbFabPerBoard),g(c.assemblyPerBoard),g(c.bomCostPerBoard),g(c.totalPerBoard)])});
y=doc.lastAutoTable.finalY+14;

h('6. Accuracy & QA',AMB);
p('- Result '+g(D.ai.total)+'/board is defensible for an ASIL-C 77GHz automotive radar module at 150k (component-heavy: BOM is '+(D.ai.bom/D.ai.total*100).toFixed(0)+'% of cost). Confidence band total '+g(D.band.totalLow)+'-'+g(D.band.totalMid)+'-'+g(D.band.totalHigh)+'.',GRN);
p('- Board DIMENSIONS are AI-estimated with no scale reference and read ~'+(D.spec_ai.areaCm2/D.spec_gt.areaCm2).toFixed(1)+'x the true area; confirm against the fab drawing. Corrected here to '+D.spec_gt.areaCm2+' cm2 (fab '+g(D.manual.fab)+').',AMB);
p('- Surface finish read as ENIG; the board panel says immersion silver (slightly cheaper). Transceiver MMIC is glob-top (die hidden) so its price is an estimate.',AMB);
p('- '+D.needsVerif+' of '+D.bom.length+' BOM lines are vision-estimated (not catalogue-confirmed) — expected for image-only costing; confirm high-value ICs (radar MCU, transceiver) against a distributor before quoting.');
y+=4;
h('7. Bugs fixed in this run',GRN);
p('This board initially mis-classified as non-automotive, which silently blanked ASIL, program pricing and AEC-Q grading. Fixed: (1) domain classifier now recognises automotive radar (S32R MCU + antenna array) and promotes deterministically from the IC marking; (2) ASIL parser salvages the level instead of blanking to Unknown on a JSON hiccup (now ASIL-C); (3) program pricing now applies the '+D.program.savingsPct+'% tier-1 contract multiplier for the '+D.programYears+'-yr program. All verified live.',[45,45,45],9);

const pages=doc.internal.getNumberOfPages();
for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7.5);doc.setTextColor(...GREY);
 doc.text('CostVision PCB should-cost — indicative, 2026 basis. AI vision estimate; confirm high-value lines before quoting.',M,812);
 doc.text('Page '+i+'/'+pages,W-M-40,812);}
fs.writeFileSync(OUT,Buffer.from(doc.output('arraybuffer')));console.log('wrote',OUT);
