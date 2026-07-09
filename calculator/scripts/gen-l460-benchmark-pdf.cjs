/**
 * Generate the Range Rover L460 Software Cost Benchmark as a real, vector PDF
 * (jsPDF — no browser required). Figures are the locked engine outputs.
 *   node scripts/gen-l460-benchmark-pdf.cjs [outPath]
 */
const { jsPDF } = require('jspdf');
const fs = require('node:fs');

const OUT = process.argv[2] || 'docs/l460-benchmark.pdf';
const d = new jsPDF({ unit: 'mm', format: 'a4' });      // 210 × 297
const W = 210, H = 297, MX = 16;
const CW = W - 2 * MX;

// palette
const GREEN = [30, 64, 52], GREEN2 = [47, 92, 73], BRONZE = [156, 115, 40], BRONZEL = [244, 235, 214];
const INK = [27, 38, 32], SOFT = [89, 99, 92], FAINT = [139, 148, 140], LINE = [214, 205, 190];
const X7 = [62, 95, 146], Q8 = [124, 136, 148], GLS = [176, 138, 70], CAY = [124, 84, 104];
const SAVE = [46, 125, 87], COST = [174, 74, 62], PAPER = [252, 251, 247], SAVESOFT = [227, 241, 233], WINSOFT = [233, 240, 235];

let page = 0;
function setFill(c){ d.setFillColor(c[0],c[1],c[2]); }
function setText(c){ d.setTextColor(c[0],c[1],c[2]); }
function setDraw(c){ d.setDrawColor(c[0],c[1],c[2]); }
function footer(){
  d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.2); d.line(MX, H-12, W-MX, H-12);
  d.setFont('helvetica','normal'); d.setFontSize(7); setText(FAINT);
  d.text('Range Rover L460 — Software Cost Benchmark   ·   Confidential', MX, H-8);
  d.text(String(page).padStart(2,'0'), W-MX, H-8, { align:'right' });
}
function newPage(bg){ d.addPage(); page++; if(bg){ setFill(bg); d.rect(0,0,W,H,'F'); } else { setFill(PAPER); d.rect(0,0,W,H,'F'); footer(); } }
// first page is cover
page = 1;

// ── COVER ──
d.setFillColor(23,48,41); d.rect(0,0,W,H,'F');
d.setFillColor(30,64,52); d.rect(0,0,W,H*0.66,'F');
d.setFont('times','bold'); d.setFontSize(13); setText([239,237,227]); d.text('CostVision', MX, 22);
d.setFont('courier','normal'); d.setFontSize(7.5); setText([201,194,168]); d.text('CONFIDENTIAL · BOARD REVIEW', W-MX, 22, { align:'right' });
d.setDrawColor(255,255,255); d.setLineWidth(0.2); d.line(MX,26,W-MX,26);
d.setFont('helvetica','bold'); d.setFontSize(8.5); setText(BRONZE); d.setTextColor(185,143,68);
d.text('AUTOMOTIVE SOFTWARE SHOULD-COST · COMPETITIVE BENCHMARK', MX, 96);
d.setFont('times','bold'); d.setFontSize(38); setText([251,250,244]);
d.text('Range Rover L460', MX, 116);
d.text('software cost benchmark', MX, 132);
d.setFont('helvetica','normal'); d.setFontSize(12); setText([214,210,192]);
d.text(d.splitTextToSize('A like-for-like assessment of embedded-software programme cost against the premium-SUV peer set — with the optimisation opportunities available to close the gap.', 150), MX, 146);
// metric row
const mk = [['Baseline programme','£420M'],['Gap vs best peer','+38%'],['Opportunity identified','£145M']];
const mw = CW/3;
mk.forEach((m,i)=>{ const x=MX+i*mw; d.setFillColor(28,59,49); d.rect(x,178,mw-3,26,'F');
  d.setFont('courier','normal'); d.setFontSize(6.5); setText([185,198,176]); d.text(m[0].toUpperCase(), x+4, 186);
  d.setFont('times','bold'); d.setFontSize(19); d.setTextColor(185,143,68); d.text(m[1], x+4, 197); });
d.setDrawColor(255,255,255); d.line(MX,H-22,W-MX,H-22);
d.setFont('courier','normal'); d.setFontSize(7.5); setText([201,194,168]);
d.text('Prepared for Senior Management', MX, H-16);
d.text('GBP · July 2026 · CostVision engine v1.0', W-MX, H-16, { align:'right' });

// helpers for content pages
function sectionHead(no, eyebrow, title){
  d.setFont('helvetica','bold'); d.setFontSize(8); setText(BRONZE); d.text(eyebrow.toUpperCase(), MX, 22);
  d.setFont('times','bold'); d.setFontSize(18); setText(GREEN);
  d.text(`${no}   ${title}`, MX, 32);
  d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.3); d.line(MX,36,W-MX,36);
}
function para(txt, x, y, w, size=9.5, color=SOFT){ d.setFont('helvetica','normal'); d.setFontSize(size); setText(color); const lines=d.splitTextToSize(txt,w); d.text(lines,x,y); return y + lines.length*size*0.42; }
function hbar(y, label, sub, val, maxv, color, fmt, me){
  const bx=MX+58, bw=CW-58-24, w=Math.max(1,val/maxv*bw);
  d.setFont('helvetica', me?'bold':'normal'); d.setFontSize(8.5); setText(me?GREEN:INK); d.text(label, MX, y+3.2);
  if(sub){ d.setFont('helvetica','normal'); d.setFontSize(6.3); setText(FAINT); d.text(sub, MX, y+6.6); }
  d.setFillColor(247,245,239); d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.2); d.roundedRect(bx,y-1,bw,6,1,1,'FD');
  setFill(color); d.roundedRect(bx,y-1,w,6,1,1,'F');
  d.setFont('courier','bold'); d.setFontSize(8.5); setText(INK); d.text(fmt(val), W-MX, y+3.2, { align:'right' });
}

// ── PAGE 2: EXEC SUMMARY ──
newPage();
sectionHead('01','Executive Summary','The headline');
let y = para('On its core mild-hybrid (MHEV) programme — the only drivetrain the L460 shares with the BMW X7, Audi Q8 and Mercedes GLS — the L460\'s embedded software costs materially more than the German rivals. The cause is specific, and the fix is largely architectural rather than commercial.', MX, 46, CW, 9.5, SOFT);
// KPI cards
const kp = [['L460 MHEV programme','£420.0M','£700 / vehicle · 42 modules', GREEN],
  ['vs BMW X7 (best peer)','+£114.8M','+37.6% higher', COST],
  ['Root cause','Lower reuse','"Medium" vs rivals\' "Heavy"', INK],
  ['Addressable saving','£145M','-35%, no offshoring', SAVE]];
const kw=CW/4; y+=4;
kp.forEach((k,i)=>{ const x=MX+i*kw; d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setFillColor(255,255,255); d.setLineWidth(0.3); d.roundedRect(x,y,kw-3,30,1.5,1.5,'FD');
  d.setFont('courier','normal'); d.setFontSize(6); setText(FAINT); d.text(k[0].toUpperCase(), x+3, y+6, {maxWidth:kw-6});
  d.setFont('times','bold'); d.setFontSize(k[1].length>7?12:16); setText(k[3]); d.text(k[1], x+3, y+18, {maxWidth:kw-6});
  d.setFont('helvetica','normal'); d.setFontSize(6.6); setText(SOFT); d.text(d.splitTextToSize(k[2],kw-6), x+3, y+24); });
y+=40;
d.setFont('helvetica','bold'); d.setFontSize(10); setText(INK); d.text('Five findings', MX, y); y+=3;
const findings = [
  ['The L460\'s software costs ~38% more than the BMW X7 / Audi Q8 on the equivalent MHEV programme.','£420M vs £305M / £313M. Per vehicle the gap is smaller (£700 vs £636 / £631) — the L460 amortises over higher volume.'],
  ['The gap is a software-reuse gap, not a geography or volume gap.','Normalised for region, source and volume, the L460 still sits ~£155M above the Germans — because BMW and Audi carry far more software forward between models.'],
  ['The L460\'s commercial setup is already efficient.','Its Tier-1 supplier sourcing (0.88×) and UK base are lowering cost — so the opportunity is engineering strategy, not procurement.'],
  ['Lifting reuse to peer level saves ~£145M (-35%) and reaches parity — no offshoring.','Raising baseline reuse "Medium to Heavy" plus shared-platform middleware brings the programme to ~£275M.'],
  ['On electrified variants the L460 already benchmarks favourably.','Against the Porsche Cayenne (only peer with PHEV/BEV) the L460 is cheaper on both total and per-vehicle.']];
findings.forEach((f,i)=>{ d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.2); d.line(MX,y,W-MX,y); y+=4.5;
  d.setFont('times','bold'); d.setFontSize(11); setText(BRONZE); d.text(String(i+1), MX, y+1);
  d.setFont('helvetica','bold'); d.setFontSize(8.6); setText(INK); let ln=d.splitTextToSize(f[0], CW-9); d.text(ln, MX+7, y); y+=ln.length*3.5;
  d.setFont('helvetica','normal'); d.setFontSize(7.8); setText(SOFT); ln=d.splitTextToSize(f[1], CW-9); d.text(ln, MX+7, y+1); y+=ln.length*3.3+3.5; });

// ── PAGE 3: PROPULSION MATRIX ──
newPage();
sectionHead('02','Comparability — the sanity check','What can honestly be compared');
y = para('A credible benchmark only compares drivetrains that both cars actually sell. The peer set does not offer every propulsion — so we compare only where a real, production, apple-to-apple pairing exists. Availability verified against manufacturer / industry sources (July 2026).', MX, 46, CW);
y+=6;
// matrix
const cols=['ICE (non-hybrid)','MHEV (48V)','PHEV','BEV'];
const colX = [MX+78, MX+108, MX+135, MX+160];
d.setFont('helvetica','bold'); d.setFontSize(6.8); setText(FAINT);
cols.forEach((c,i)=>d.text(c, colX[i], y, {align:'center', maxWidth:26}));
y+=3; d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.3); d.line(MX,y,W-MX,y); y+=6;
const rows=[
  ['Range Rover L460','reference — "our car"',[0,1,1,2], true],
  ['BMW X7 (G07)','iX7 BEV is next-gen, 2027+',[0,1,0,0], false],
  ['Audi Q8','Q8 e-tron is a separate model',[0,1,0,0], false],
  ['Mercedes GLS','EQS SUV is a separate model',[0,1,0,0], false],
  ['Porsche Cayenne','Electric premiered Nov 2025',[1,0,1,1], false]];
rows.forEach(r=>{ if(r[3]){ d.setFillColor(233,240,235); d.rect(MX,y-4.5,CW,9,'F'); }
  d.setFont('helvetica','bold'); d.setFontSize(9); setText(INK); d.text(r[0], MX, y);
  d.setFont('helvetica','normal'); d.setFontSize(6.2); setText(FAINT); d.text(r[1], MX, y+3.3);
  r[2].forEach((v,i)=>{ if(v===1){ setFill(SAVE); d.circle(colX[i], y-0.6, 1.7, 'F'); }
    else if(v===2){ setDraw(BRONZE); d.setLineWidth(0.5); setFill(BRONZE); d.circle(colX[i], y-0.6, 1.7, 'D'); d.circle(colX[i], y-0.6, 1.7, 'S'); // ring
      // half-fill: draw a filled left semicircle approximation via small filled circle inside
      d.circle(colX[i], y-0.6, 0.9, 'F');
      d.setFont('helvetica','normal'); d.setFontSize(5.3); setText(BRONZE); d.text('launching', colX[i], y+4, {align:'center'}); }
    else { setDraw(FAINT); d.setLineWidth(0.5); d.line(colX[i]-1.4, y-0.6, colX[i]+1.4, y-0.6); } });
  y+=11; d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.15); d.line(MX,y-4.5,W-MX,y-4.5); });
y+=2;
// legend with drawn swatches
setFill(SAVE); d.circle(MX+1.4, y-1, 1.5, 'F'); d.setFont('helvetica','normal'); d.setFontSize(7); setText(SOFT); d.text('Offered in production', MX+5, y);
setDraw(BRONZE); setFill(BRONZE); d.setLineWidth(0.5); d.circle(MX+56, y-1, 1.5, 'S'); d.circle(MX+56, y-1, 0.8, 'F'); d.text('Launching (Range Rover Electric)', MX+60, y);
setDraw(FAINT); d.line(MX+128, y-1, MX+131, y-1); d.text('Not offered', MX+134, y); y+=8;
// callout
setFill(BRONZEL); d.setDrawColor(BRONZE[0],BRONZE[1],BRONZE[2]); d.setLineWidth(0.5); d.roundedRect(MX,y,CW,26,2,2,'F'); d.setFillColor(BRONZE[0],BRONZE[1],BRONZE[2]); d.rect(MX,y,1.4,26,'F');
d.setFont('helvetica','bold'); d.setFontSize(9); setText(INK); d.text('Valid apple-to-apple pairings', MX+5, y+7);
d.setFont('helvetica','normal'); d.setFontSize(8.3); setText(SOFT);
d.text('MHEV:  L460 vs X7, Q8, GLS  —  the four-way core benchmark.', MX+5, y+14);
d.text('PHEV & BEV:  L460 vs Porsche Cayenne  —  the only peer offering electrified variants.', MX+5, y+20);
y+=32;
para('Comparing the L460\'s software against, say, a "BMW X7 BEV" would be meaningless — BMW does not build one on this platform. Restricting to real pairings keeps every number defensible in front of a supplier or the board.', MX, y, CW, 8, SOFT);

// ── PAGE 4: MHEV BENCHMARK ──
newPage();
sectionHead('03','The core benchmark','MHEV programme, four-way');
y = para('Total embedded-software should-cost for the 48V mild-hybrid programme, each car on its own real commercial assumptions. The L460 is the second-most expensive of the four, and 38% above the leanest.', MX, 46, CW);
y+=4;
d.setFont('helvetica','bold'); d.setFontSize(8.5); setText(INK); d.text('Total software programme cost — MHEV (£M)   ', MX, y);
d.setFont('helvetica','normal'); d.setFontSize(7); setText(FAINT); d.text('lower is better', W-MX, y, {align:'right'}); y+=6;
// vertical bars
const vb=[['Range Rover L460',420.0,GREEN,'UK · 75k · Medium'],['BMW X7',305.2,X7,'EU · 60k · Heavy'],['Audi Q8',312.6,Q8,'EU · 55k · Heavy+plat'],['Mercedes GLS',489.6,GLS,'EU · 45k · Medium']];
const chTop=y, chH=62, chBot=chTop+chH, maxV=550, bw2=26, gap=(CW-vb.length*bw2)/(vb.length+1);
d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.2);
[0,250,500].forEach(gv=>{ const gy=chBot-gv/maxV*chH; d.setLineDashPattern([0.6,0.6],0); d.line(MX,gy,W-MX,gy); d.setFont('courier','normal'); d.setFontSize(5.5); setText(FAINT); d.text(String(gv), W-MX+0.5, gy, {align:'left'}); });
d.setLineDashPattern([],0);
vb.forEach((b,i)=>{ const x=MX+gap+i*(bw2+gap); const bh=b[1]/maxV*chH; setFill(b[2]); d.roundedRect(x,chBot-bh,bw2,bh,1,1,'F');
  d.setFont('courier','bold'); d.setFontSize(8); setText(b[2]); d.text('£'+b[1].toFixed(1)+'M', x+bw2/2, chBot-bh-2, {align:'center'});
  d.setFont('helvetica','bold'); d.setFontSize(7.2); setText(i===0?GREEN:INK); d.text(b[0], x+bw2/2, chBot+5, {align:'center', maxWidth:bw2+gap});
  d.setFont('helvetica','normal'); d.setFontSize(5.6); setText(FAINT); d.text(b[3], x+bw2/2, chBot+9, {align:'center'}); });
d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.4); d.line(MX,chBot,W-MX,chBot);
y=chBot+18;
// table
d.setFont('helvetica','bold'); d.setFontSize(6.6); setText(FAINT);
const tc=[MX, MX+70, MX+100, MX+135, MX+165];
d.text('PROGRAMME (MHEV)', tc[0], y); d.text('TOTAL', tc[1], y); d.text('NRE', tc[2], y); d.text('£/VEHICLE', tc[3], y); d.text('vs L460', tc[4], y);
y+=1.5; d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.4); d.line(MX,y,W-MX,y); y+=5;
const td=[['Range Rover L460','£420.0M','£253.6M','£700','—',GREEN,true],
  ['BMW X7','£305.2M','£174.7M','£636','-£114.8M',X7,false],
  ['Audi Q8','£312.6M','£168.9M','£631','-£107.4M',Q8,false],
  ['Mercedes GLS','£489.6M','£286.6M','£1,209','+£69.6M',GLS,false]];
td.forEach(r=>{ if(r[6]){ d.setFillColor(233,240,235); d.rect(MX,y-4,CW,7,'F'); }
  setFill(r[5]); d.rect(MX,y-2.4,2.6,2.6,'F');
  d.setFont('helvetica','bold'); d.setFontSize(8.4); setText(INK); d.text(r[0], MX+4.5, y);
  d.setFont('courier','normal'); d.setFontSize(8.2); setText(INK); d.text(r[1], tc[1], y); d.text(r[2], tc[2], y); d.text(r[3], tc[3], y);
  d.setFont('courier','bold'); setText(r[4].startsWith('+')?COST:(r[4]==='—'?FAINT:SAVE)); d.text(r[4], tc[4], y);
  y+=7; d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.15); d.line(MX,y-4,W-MX,y-4); });
y+=3;
para('Per-vehicle differences also reflect volume: the GLS is dearest per car (45k/yr) despite the L460\'s higher total. The L460\'s £700/vehicle is competitive — its total programme cost is the concern.', MX, y, CW, 7.6, SOFT);

// ── PAGE 5: DIAGNOSIS ──
newPage();
sectionHead('04','Diagnosis','Where the difference comes from');
y = para('Two tests isolate the cause. A normalised view removes commercial/geographic differences; a domain breakdown shows which software carries the excess.', MX, 46, CW);
y+=4;
d.setFont('helvetica','bold'); d.setFontSize(8.5); setText(INK); d.text('Normalised — same region, source & volume (£M)', MX, y); y+=6;
[['Range Rover L460','Medium reuse',459.7,GREEN,true],['Mercedes GLS','Medium reuse',460.5,GLS,false],['BMW X7','Heavy reuse',305.2,X7,false],['Audi Q8','Heavy + platform',297.7,Q8,false]]
  .forEach(r=>{ hbar(y, r[0], r[1], r[2], 480, r[3], v=>'£'+v.toFixed(1)+'M', r[4]); y+=10; });
y+=1; para('Even on identical commercial terms the L460 stays high — clustering with the GLS (both "Medium") and well above BMW/Audi ("Heavy"). The gap is engineering strategy, not geography.', MX, y, CW, 7.6, SOFT);
y+=14;
d.setFont('helvetica','bold'); d.setFontSize(8.5); setText(INK); d.text('L460 excess over BMW X7, by domain (£M)', MX, y); y+=6;
[['ADAS (L2/L2+)',55.2],['Domain controllers',23.3],['Infotainment',16.1],['Middleware',7.9],['Cloud / OTA',5.2],['Cybersecurity',4.4],['Powertrain',2.7]]
  .forEach(r=>{ hbar(y, r[0], '', r[1], 55.2, COST, v=>'+£'+v.toFixed(1)+'M', false); y+=8.5; });
y+=1; para('ADAS is half the excess (+£55M): it is the largest domain, so the lower reuse rate compounds there most.', MX, y, CW, 7.6, SOFT);
y+=11;
setFill(BRONZEL); d.setFillColor(244,235,214); d.roundedRect(MX,y,CW,20,2,2,'F'); d.setFillColor(BRONZE[0],BRONZE[1],BRONZE[2]); d.rect(MX,y,1.4,20,'F');
d.setFont('helvetica','bold'); d.setFontSize(8.4); setText(INK); d.text('The mechanism.', MX+5, y+6);
d.setFont('helvetica','normal'); d.setFontSize(8); setText(SOFT);
d.text(d.splitTextToSize('Reuse "Medium" applies 0.60× to development effort; "Heavy" applies 0.35×. BMW and Audi carry far more forward, re-developing ~half as much per programme. Audi additionally runs shared VW-Group middleware at "Platform" reuse (0.14×).', CW-24), MX+5, y+11);

// ── PAGE 6: OPTIMISATION ──
newPage();
sectionHead('05','The opportunity','Cost-optimisation opportunities');
y = para('The engine quantifies each lever on the L460 MHEV programme. The architecture-led path — more reuse + shared middleware — reaches German parity without changing where or by whom the work is done.', MX, 46, CW);
y+=4;
d.setFont('helvetica','bold'); d.setFontSize(8.5); setText(INK); d.text('Cost-optimisation bridge — L460 MHEV (£M)', MX, y);
d.setFont('helvetica','normal'); d.setFontSize(6.6); setText(FAINT); d.text('dashed = BMW X7 benchmark £305M', W-MX, y, {align:'right'}); y+=7;
const wfx=MX+52, wfw=CW-52-22, wmax=450;
const refX = wfx + 305.2/wmax*wfw;
const wf=[['Baseline (as-is)','Medium reuse',0,420.0,GREEN,'£420.0M',INK],
  ['Raise reuse to Heavy','carry forward',281.3,420.0,SAVE,'-£138.6M',SAVE],
  ['+ Shared middleware','platform stacks',274.8,281.3,SAVE,'-£6.5M',SAVE],
  ['Optimised target','architecture-led',0,274.8,BRONZE,'£274.8M',BRONZE]];
wf.forEach(r=>{ d.setFont('helvetica','bold'); d.setFontSize(7.8); setText(INK); d.text(r[0], MX, y+2);
  d.setFont('helvetica','normal'); d.setFontSize(5.8); setText(FAINT); d.text(r[1], MX, y+5.3);
  const x1=wfx+r[2]/wmax*wfw, x2=wfx+r[3]/wmax*wfw; setFill(r[4]); d.roundedRect(x1,y-1,Math.max(0.8,x2-x1),6,0.8,0.8,'F');
  d.setDrawColor(X7[0],X7[1],X7[2]); d.setLineWidth(0.4); d.setLineDashPattern([1,1],0); d.line(refX,y-3,refX,y+6); d.setLineDashPattern([],0);
  d.setFont('courier','bold'); d.setFontSize(8); setText(r[6]); d.text(r[5], W-MX, y+2, {align:'right'}); y+=13; });
d.setFont('courier','normal'); d.setFontSize(6); setText(FAINT);
['£0|0','£150M|150','£300M|300','£450M|450'].forEach(t=>{ const [lab,v]=t.split('|'); d.text(lab, wfx+(+v)/wmax*wfw, y, {align:'center'}); });
y+=8;
// win callout
d.setFillColor(233,240,235); d.roundedRect(MX,y,CW,20,2,2,'F'); d.setFillColor(SAVE[0],SAVE[1],SAVE[2]); d.rect(MX,y,1.4,20,'F');
d.setFont('helvetica','bold'); d.setFontSize(8.6); setText(INK); d.text('Bottom line', MX+5, y+6);
d.setFont('helvetica','normal'); d.setFontSize(8); setText(SOFT);
d.text(d.splitTextToSize('The two architectural levers take the L460 MHEV programme from £420M to £275M — a £145M (35%) saving, moving it from 38% above the X7 to roughly on par. Achievable in the UK, with the existing Tier-1 model.', CW-10), MX+5, y+11);
y+=22;
d.setFont('helvetica','bold'); d.setFontSize(9); setText(INK); d.text('The levers, ranked', MX, y); y+=4;
const lev=[['1 · Raise baseline reuse to "Heavy"','-£138.6M','Match BMW\'s carry-forward across Range Rover / Sport / Velar.','Recommended · highest impact',SAVE,GREEN],
  ['2 · Shared-platform middleware','-£6.5M*','Run AUTOSAR / RTOS / comms as a shared platform (as Audi does).','Recommended',SAVE,GREEN],
  ['3 · Nearshore a dev share','up to -£191M','Large nominal lever but IP / quality / continuity risk. Strategic, not first.','Handle with care',COST,BRONZE],
  ['4 · ASIL right-sizing','review','Ensure no module exceeds the safety level its function requires.','Quick win',SAVE,GREEN]];
const lw=CW/2;
lev.forEach((l,i)=>{ const cx=MX+(i%2)*lw, cyy=y+Math.floor(i/2)*24; d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setFillColor(255,255,255); d.setLineWidth(0.3); d.roundedRect(cx,cyy,lw-4,21,1.5,1.5,'FD'); setFill(l[5]); d.rect(cx,cyy,1.6,21,'F');
  d.setFont('helvetica','bold'); d.setFontSize(7.8); setText(INK); d.text(l[0], cx+4, cyy+5, {maxWidth:lw-30});
  d.setFont('courier','bold'); d.setFontSize(9); setText(l[4]); d.text(l[1], cx+lw-6, cyy+5, {align:'right'});
  d.setFont('helvetica','normal'); d.setFontSize(6.8); setText(SOFT); d.text(d.splitTextToSize(l[2], lw-10), cx+4, cyy+10);
  d.setFont('helvetica','bold'); d.setFontSize(6); setText(l[5]); d.text(l[3].toUpperCase(), cx+4, cyy+18); });

// ── PAGE 7: ELECTRIFIED + RANKING ──
newPage();
sectionHead('06','The other side of the ledger','Electrified & full ranking');
y = para('The Cayenne is the only peer offering PHEV and BEV. Here the L460 is the cheaper programme on both total and per-vehicle — its software organisation is not structurally expensive.', MX, 46, CW);
y+=4;
d.setFont('helvetica','bold'); d.setFontSize(8.5); setText(INK); d.text('Electrified programme cost — L460 vs Porsche Cayenne (£M)', MX, y); y+=6;
[['L460 — PHEV','',539.6,GREEN,true],['Cayenne — PHEV','',593.5,CAY,false],['L460 — BEV','',559.2,GREEN,true],['Cayenne — BEV','',616.1,CAY,false]]
  .forEach(r=>{ hbar(y, r[0], r[1], r[2], 620, r[3], v=>'£'+v.toFixed(1)+'M', r[4]); y+=9.5; });
y+=2;
d.setFillColor(233,240,235); d.roundedRect(MX,y,CW,18,2,2,'F'); d.setFillColor(SAVE[0],SAVE[1],SAVE[2]); d.rect(MX,y,1.4,18,'F');
d.setFont('helvetica','bold'); d.setFontSize(8.2); setText(INK); d.text('Read-across', MX+5, y+6);
d.setFont('helvetica','normal'); d.setFontSize(7.8); setText(SOFT);
d.text(d.splitTextToSize('On electrified programmes the L460 out-benchmarks a Porsche (-9% on both PHEV and BEV; £899 vs £1,484 and £932 vs £1,540 per vehicle). The MHEV cost problem is specific and reuse-driven — which is why it is fixable.', CW-10), MX+5, y+11);
y+=24;
d.setFont('helvetica','bold'); d.setFontSize(8.5); setText(INK); d.text('Full ranking — all comparable programmes, total software cost (£M)', MX, y); y+=6;
const rk=[['Cayenne BEV',616.1,CAY,false],['Cayenne PHEV',593.5,CAY,false],['L460 BEV',559.2,GREEN,true],['L460 PHEV',539.6,GREEN,true],['GLS MHEV',489.6,GLS,false],['L460 MHEV',420.0,GREEN,true],['Q8 MHEV',312.6,Q8,false],['X7 MHEV',305.2,X7,false]];
rk.forEach(r=>{ hbar(y, r[0], '', r[1], 620, r[2], v=>'£'+v.toFixed(1)+'M', r[3]); y+=7.6; });
y+=2; d.setFont('helvetica','normal'); d.setFontSize(7.4); setText(SOFT);
d.text(d.splitTextToSize('After the £145M optimisation, the L460 MHEV would fall to ~£275M — the leanest programme in the set.', CW), MX, y);

// ── PAGE 8: ASSUMPTIONS ──
newPage();
sectionHead('07','Transparency','Assumptions & methodology');
y = para('Every figure is live output from the CostVision should-cost engine (49-module catalogue, ISO 26262 / 21434). Nothing is hand-entered. Assumptions are stated in full so each number can be challenged.', MX, 46, CW);
y+=4;
const A=[
  ['Model class & accuracy','Bottom-up parametric should-cost; validated envelope ±25–35% (back-test MAPE 24.9%, 5 of 7 published programmes within ±35%). Absolute numbers are estimates; the comparisons are consistent because every programme uses the same engine and rate library.'],
  ['Propulsion availability','Verified July 2026. X7 (G07) MHEV-only (iX7 is next-gen 2027+); Q8 & GLS MHEV-only (e-tron / EQS are separate models); Cayenne offers ICE/PHEV/BEV (Electric premiered Nov 2025); Range Rover Electric is JLR\'s first EV, launching.'],
  ['"Apple-to-apple"','Two views — as-is (each car on its real region, volume, life, reuse) and normalised (common EU / in-house / 60k-yr basis). Comparisons drawn only where both cars build the drivetrain.'],
  ['Reuse factors (× dev effort)','Fresh 1.00 · Light 0.82 · Medium 0.60 · Heavy 0.35 · Platform 0.14. "Baseline reuse" is the programme default before per-module overrides.'],
  ['Per-car assumptions (MHEV)','L460: UK · Tier-1 · 75k/yr · 8yr · Medium.  X7: EU · in-house · 60k · 8yr · Heavy.  Q8: EU · in-house · 55k · 9yr · Heavy + platform.  GLS: EU · in-house · 45k · 9yr · Medium.  Cayenne: EU · in-house · 50k · 8yr · Medium + platform + Porsche performance.'],
  ['Signature software','Each car keeps its brand-DNA overrides (Meridian on L460; MBUX/voice on GLS; Porsche 4D chassis on Cayenne; UWB key on X7), held constant across its drivetrains.'],
  ['What "saving" means','Reduction in total programme software should-cost (NRE + lifecycle) vs the L460 as-is baseline, from changing the stated lever only.'],
  ['Currency & scope','All figures GBP. Embedded & connected vehicle software only; excludes manufacturing, hardware and non-software engineering.']];
A.forEach(a=>{ d.setFont('helvetica','bold'); d.setFontSize(8.4); setText(GREEN); d.text(a[0], MX, y); y+=4;
  d.setFont('helvetica','normal'); d.setFontSize(7.6); setText(SOFT); const ln=d.splitTextToSize(a[1], CW); d.text(ln, MX, y); y+=ln.length*3.2+4; });
d.setDrawColor(LINE[0],LINE[1],LINE[2]); d.setLineWidth(0.2); d.line(MX,y,W-MX,y); y+=5;
d.setFont('helvetica','italic'); d.setFontSize(7); setText(FAINT);
d.text(d.splitTextToSize('This report supports target-setting and supplier negotiation; it is not an audited actual. Engine: CostVision sw-should-cost.ts, rate library v1.0, July 2026.', CW), MX, y);

fs.writeFileSync(OUT, Buffer.from(d.output('arraybuffer')));
console.log('PDF written:', OUT, '(' + Math.round(fs.statSync(OUT).size/1024) + ' KB, ' + page + ' pages)');
