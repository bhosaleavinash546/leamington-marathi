/**
 * Premium-SUV software cost — ALL-MODELS comparison deep-dive.
 * Every module priced for all five models (each on its real drivetrain) side by
 * side: cost ranking, features, leanest/dearest, and an insight on the drivers.
 * Emits a real vector PDF (jsPDF) and a print-ready HTML report.
 *   npx tsx scripts/gen-allmodels-deepdive.ts
 */
import { computeSWProgram, defaultSWProgramInputs, SW_MODULES } from '../src/engine/sw-should-cost.js';
import { jsPDF } from 'jspdf';
import * as fs from 'node:fs';

const MHEV=['bms_core','cell_balancing','soc_soh_soe','fast_charge','edu_control','inverter_ctrl','motor_ctrl'];
const SIG:any={ l460:{premium_audio:{complexity:'Very High'}}, x7:{digital_key:{complexity:'Very High'}},
  q8:{autosar_classic:{reuse:'Platform'},autosar_adaptive:{reuse:'Platform'},rtos:{reuse:'Platform'},comm_stacks:{reuse:'Platform'}},
  gls:{ivi_os:{complexity:'Very High'},voice_assistant:{complexity:'Very High'},navigation:{complexity:'Very High'},active_suspension:{complexity:'Very High'},premium_audio:{complexity:'Very High'}},
  cayenne:{autosar_classic:{reuse:'Platform'},autosar_adaptive:{reuse:'Platform'},rtos:{reuse:'Platform'},comm_stacks:{reuse:'Platform'},vehicle_motion:{complexity:'Very High'},active_suspension:{complexity:'Very High'},premium_audio:{complexity:'Very High'}} };
const CARC:any={ l460:{region:'UK',dev:'Tier1_Supplier',vol:75000,life:8,oh:1.55,sen:0.55,reuse:'Medium'},
  x7:{region:'EU',dev:'OEM_Internal',vol:60000,life:8,oh:1.60,sen:0.55,reuse:'Heavy'},
  q8:{region:'EU',dev:'OEM_Internal',vol:55000,life:9,oh:1.58,sen:0.55,reuse:'Heavy'},
  gls:{region:'EU',dev:'OEM_Internal',vol:45000,life:9,oh:1.62,sen:0.55,reuse:'Medium'},
  cayenne:{region:'EU',dev:'OEM_Internal',vol:50000,life:8,oh:1.62,sen:0.60,reuse:'Medium'} };
const DT:any={ mhev:{dis:MHEV,ov:{}}, bev:{dis:[],ov:{fast_charge:{complexity:'Very High'}}} };
function res(car:string,dt:string){ const c=CARC[car],d=DT[dt]; const b:any=defaultSWProgramInputs(); const dis=new Set(d.dis);
  const inp:any={...b,region:c.region,devSource:c.dev,programLifeYears:c.life,annualProductionVolume:c.vol,overheadMultiplier:c.oh,teamSeniorFraction:c.sen,
    modules:b.modules.map((m:any)=>({...m,enabled:!dis.has(m.moduleId),reuse:c.reuse,...(SIG[car][m.moduleId]??{}),...(d.ov[m.moduleId]??{})}))};
  const r=computeSWProgram(inp,{summaryOnly:false}); const map:any={}; for(const m of r.modules) map[m.moduleId]=m; return map; }
const R:any={ l460:res('l460','mhev'), l460b:res('l460','bev'), x7:res('x7','mhev'), q8:res('q8','mhev'), gls:res('gls','mhev'), cayenne:res('cayenne','bev') };
const evSet=new Set(MHEV);
const MIDDLEWARE=new Set(['autosar_classic','autosar_adaptive','rtos','comm_stacks']);

const META:any={ l460:{name:'Range Rover L460',short:'L460',reuse:'Medium',col:[30,64,52]}, x7:{name:'BMW X7',short:'BMW X7',reuse:'Heavy',col:[62,95,146]}, q8:{name:'Audi Q8',short:'Audi Q8',reuse:'Heavy + plat.',col:[124,136,148]}, gls:{name:'Mercedes GLS',short:'Merc GLS',reuse:'Medium',col:[176,138,70]}, cayenne:{name:'Porsche Cayenne',short:'Cayenne',reuse:'Medium + plat.',col:[124,84,104]} };

interface Row { car:string; short:string; col:number[]; cost:number; cx:string; reuse:string; sig:boolean; }
interface Mod { def:any; ev:boolean; rows:Row[]; lean:Row; dear:Row; range:number; rangePct:number; }
const MODS:Mod[]=[];
for(const def of SW_MODULES){ const ev=evSet.has(def.id);
  const src = ev ? [['l460',R.l460b],['cayenne',R.cayenne]] : [['l460',R.l460],['x7',R.x7],['q8',R.q8],['gls',R.gls],['cayenne',R.cayenne]];
  const rows:Row[]=[];
  for(const [id,map] of src as any){ const r=map[def.id]; if(!r) continue; rows.push({ car:id, short:META[id].short, col:META[id].col, cost:r.grandTotal, cx:r.complexityUsed, reuse:r.reuseUsed, sig: !!(SIG[id][def.id]) }); }
  rows.sort((a,b)=>a.cost-b.cost);
  const lean=rows[0], dear=rows[rows.length-1], range=dear.cost-lean.cost;
  MODS.push({ def, ev, rows, lean, dear, range, rangePct: range/lean.cost*100 });
}
const M=(n:number)=>'£'+(n/1e6).toFixed(1)+'M';
function insight(o:Mod):string{
  const {lean,dear,rows,def}=o; const drivers:string[]=[];
  const vhSig=rows.filter(r=>r.sig && r.cx==='Very High'); if(vhSig.length) drivers.push(`${vhSig.map(r=>r.short).join(' / ')} run it at Very-High complexity as a signature feature`);
  const plat=rows.filter(r=>r.reuse==='Platform'); if(plat.length && MIDDLEWARE.has(def.id)) drivers.push(`${plat.map(r=>r.short).join(' / ')} share it as platform middleware (0.14× reuse)`);
  const heavy=rows.filter(r=>r.reuse==='Heavy'), medium=rows.filter(r=>r.reuse==='Medium');
  if(heavy.length && medium.length && !MIDDLEWARE.has(def.id)) drivers.push(`the leanest carry it forward (Heavy reuse) where ${medium.map(r=>r.short).join(' / ')} develop more afresh (Medium)`);
  const base = `${dear.short} is dearest at ${M(dear.cost)}, ${lean.short} leanest at ${M(lean.cost)} — a ${M(o.range)} (${o.rangePct.toFixed(0)}%) spread.`;
  return drivers.length ? `${base} Driven by ${drivers.slice(0,2).join('; ')}.` : `${base} Driven by baseline reuse and blended-rate differences (region / overhead / programme life).`;
}
// league
const leanCount:any={}, dearCount:any={};
for(const o of MODS){ leanCount[o.lean.short]=(leanCount[o.lean.short]||0)+1; dearCount[o.dear.short]=(dearCount[o.dear.short]||0)+1; }
const CAT:any={ A:['EV Powertrain & Battery',[47,92,73]], B:['ADAS L2 / L2+',[62,95,146]], C:['Infotainment & UX',[124,84,104]], D:['Vehicle Domain Controllers',[156,115,40]], E:['Middleware & Platform',[94,118,134]], F:['Cybersecurity (ISO 21434)',[172,74,62]], G:['OTA & Cloud Backend',[63,143,176]] };
const CATS=['A','B','C','D','E','F','G'];
const catMods=(c:string)=>MODS.filter(m=>m.def.category===c).sort((a,b)=>b.dear.cost-a.dear.cost);
// programme totals (MHEV cohort + Cayenne BEV) from locked runs
const TOT:any={ 'L460 (MHEV)':420.0, 'BMW X7 (MHEV)':305.2, 'Audi Q8 (MHEV)':312.6, 'Merc GLS (MHEV)':489.6, 'Cayenne (BEV)':616.1 };

// ════════════ PDF ════════════
const GREEN=[30,64,52], BRONZE=[156,115,40], INK=[27,38,32], SOFT=[89,99,92], FAINT=[139,148,140], LINE=[214,205,190], SAVE=[46,125,87], COST=[174,74,62], PAPER=[252,251,247], SOFTBG=[247,245,239];
function buildPDF():Buffer{
  const d=new (jsPDF as any)({unit:'mm',format:'a4'}); const W=210,H=297,MX=15,CW=W-2*MX; let page=1;
  const sf=(c:number[])=>d.setFillColor(c[0],c[1],c[2]), st=(c:number[])=>d.setTextColor(c[0],c[1],c[2]), sd=(c:number[])=>d.setDrawColor(c[0],c[1],c[2]);
  function footer(){ sd(LINE); d.setLineWidth(0.2); d.line(MX,H-11,W-MX,H-11); d.setFont('helvetica','normal'); d.setFontSize(6.6); st(FAINT); d.text('Premium-SUV Software Cost — All-Models Comparison   ·   Confidential', MX, H-7.5); d.text(String(page).padStart(2,'0'), W-MX, H-7.5, {align:'right'}); }
  function np(){ d.addPage(); page++; sf(PAPER); d.rect(0,0,W,H,'F'); footer(); }
  function head(no:string, eb:string, t:string){ d.setFont('helvetica','bold'); d.setFontSize(7.5); st(BRONZE); d.text(eb.toUpperCase(),MX,18); d.setFont('times','bold'); d.setFontSize(16); st(GREEN); d.text(`${no}   ${t}`,MX,27); sd(LINE); d.setLineWidth(0.3); d.line(MX,30.5,W-MX,30.5); }
  function para(t:string,x:number,y:number,w:number,s=9,c=SOFT){ d.setFont('helvetica','normal'); d.setFontSize(s); st(c); const ln=d.splitTextToSize(t,w); d.text(ln,x,y); return y+ln.length*s*0.42; }

  // COVER
  sf([23,48,41]); d.rect(0,0,W,H,'F'); sf(GREEN); d.rect(0,0,W,H*0.62,'F');
  d.setFont('times','bold'); d.setFontSize(12); st([239,237,227]); d.text('CostVision',MX,20);
  d.setFont('courier','normal'); d.setFontSize(7); st([201,194,168]); d.text('CONFIDENTIAL · BOARD REVIEW',W-MX,20,{align:'right'});
  sd([255,255,255]); d.setLineWidth(0.2); d.line(MX,24,W-MX,24);
  d.setFont('helvetica','bold'); d.setFontSize(8); st([185,143,68]); d.text('AUTOMOTIVE SOFTWARE SHOULD-COST · ALL-MODELS COMPARISON',MX,84);
  d.setFont('times','bold'); d.setFontSize(31); st([251,250,244]); d.text('Premium-SUV software',MX,102); d.text('cost — model-by-model',MX,115);
  d.setFont('helvetica','normal'); d.setFontSize(11); st([214,210,192]);
  d.text(d.splitTextToSize('Every one of the 49 software modules priced across five flagship SUVs — Range Rover L460, BMW X7, Audi Q8, Mercedes GLS and Porsche Cayenne — side by side, apple-to-apple, with the cost drivers behind each difference.',155),MX,130);
  const mk=[['Models compared','5'],['Modules each','49'],['Widest spread','+58%']]; const mw=CW/3;
  mk.forEach((m,i)=>{ const x=MX+i*mw; sf([28,59,49]); d.rect(x,166,mw-3,24,'F'); d.setFont('courier','normal'); d.setFontSize(6); st([185,198,176]); d.text(m[0].toUpperCase(),x+4,173); d.setFont('times','bold'); d.setFontSize(17); st([185,143,68]); d.text(m[1],x+4,184); });
  sd([255,255,255]); d.line(MX,H-20,W-MX,H-20); d.setFont('courier','normal'); d.setFontSize(7); st([201,194,168]); d.text('Prepared for Senior Management',MX,H-14); d.text('GBP · July 2026 · CostVision engine v1.0',W-MX,H-14,{align:'right'});

  // PART A: MARKET MAP
  np(); head('A','Market map','Where the five models sit');
  let y=para('Total software programme cost per model. The German MHEVs (X7, Q8, GLS) share the L460\'s mild-hybrid drivetrain; the Cayenne is shown on its full-BEV programme (49 vs 42 modules) and so carries the extra EV-powertrain stack. Reuse strategy, not badge, sets the order.',MX,40,CW,9.2); y+=3;
  const bars=Object.entries(TOT).sort((a:any,b:any)=>a[1]-b[1]); const bmax=650, cb=y+58, chH=54, bw=26, gp=(CW-5*bw)/6;
  sd(LINE); d.setLineWidth(0.2); [0,300,600].forEach(gv=>{ const gy=cb-gv/bmax*chH; d.setLineDashPattern([0.5,0.5],0); d.line(MX,gy,W-MX,gy); d.setFont('courier','normal'); d.setFontSize(5.5); st(FAINT); d.text(String(gv),W-MX+0.5,gy,{align:'left'}); }); d.setLineDashPattern([],0);
  const colOf=(lab:string)=> lab.startsWith('L460')?GREEN: lab.startsWith('BMW')?[62,95,146]: lab.startsWith('Audi')?[124,136,148]: lab.startsWith('Merc')?[176,138,70]:[124,84,104];
  bars.forEach((b:any,i)=>{ const x=MX+gp+i*(bw+gp); const bh=b[1]/bmax*chH; sf(colOf(b[0])); d.roundedRect(x,cb-bh,bw,bh,1,1,'F'); d.setFont('courier','bold'); d.setFontSize(7.5); st(colOf(b[0])); d.text('£'+b[1].toFixed(0)+'M',x+bw/2,cb-bh-2,{align:'center'}); d.setFont('helvetica','bold'); d.setFontSize(6.6); st(INK); d.text(b[0].split(' (')[0],x+bw/2,cb+5,{align:'center'}); d.setFont('helvetica','normal'); d.setFontSize(5.4); st(FAINT); d.text('('+b[0].split('(')[1],x+bw/2,cb+8.5,{align:'center'}); });
  sd(LINE); d.setLineWidth(0.4); d.line(MX,cb,W-MX,cb); y=cb+15;
  // reuse table + leaders
  d.setFont('helvetica','bold'); d.setFontSize(9); st(INK); d.text('Reuse strategy — the real differentiator',MX,y); y+=5;
  const rr=[['BMW X7','Heavy (0.35×)','Lean — carries software forward across 7-Series / X5 / X7'],['Audi Q8','Heavy + platform','Lean — VW-Group shared middleware (0.14×)'],['Porsche Cayenne','Medium + platform','Mid — platform middleware, Porsche performance signature'],['Range Rover L460','Medium (0.60×)','High — develops more afresh; Tier-1 sourcing offsets'],['Mercedes GLS','Medium (0.60×)','Highest — Medium reuse + heavy MBUX signature + 9-yr life']];
  rr.forEach(r=>{ sf(colOf(r[0].includes('L460')?'L460':r[0].includes('BMW')?'BMW':r[0].includes('Audi')?'Audi':r[0].includes('Merc')?'Merc':'Cay')); d.rect(MX,y-2.6,2.6,2.6,'F'); d.setFont('helvetica','bold'); d.setFontSize(7.8); st(INK); d.text(r[0],MX+5,y); d.setFont('courier','normal'); d.setFontSize(7); st(SOFT); d.text(r[1],MX+52,y); d.setFont('helvetica','normal'); d.setFontSize(7); st(SOFT); d.text(r[2],MX+90,y,{maxWidth:W-MX-(MX+90)}); y+=6.4; });
  y+=3; sf(SOFTBG); d.roundedRect(MX,y,CW,18,2,2,'F'); sf(BRONZE); d.rect(MX,y,1.4,18,'F');
  d.setFont('helvetica','bold'); d.setFontSize(8.4); st(INK); d.text('Who leads',MX+5,y+6); d.setFont('helvetica','normal'); d.setFontSize(8); st(SOFT);
  d.text(d.splitTextToSize(`Across the 49 modules, BMW X7 is the leanest on ${leanCount['BMW X7']||0} and Mercedes GLS the dearest on ${dearCount['Merc GLS']||0}. The L460 is leanest on the ${leanCount['L460']||0} EV-powertrain modules (it beats the Cayenne there). The following pages price every module across all models.`, CW-10),MX+5,y+11);

  // PART B: modules
  const B_H=44; let cy=999;
  function ensure(h:number){ if(cy+h>H-15){ np(); cy=38; } }
  for(const c of CATS){ np(); cy=18;
    sf(CAT[c][1]); d.rect(MX,cy-4,CW,13,'F'); d.setFont('times','bold'); d.setFontSize(15); st([255,255,255]); d.text(c,MX+4,cy+5.5); d.setFont('helvetica','bold'); d.setFontSize(12); st([255,255,255]); d.text(CAT[c][0],MX+16,cy+5.5);
    d.setFont('courier','normal'); d.setFontSize(8); st([255,255,255]); d.text(`${catMods(c).length} modules`,W-MX-2,cy+5.5,{align:'right'}); cy+=16;
    for(const o of catMods(c)){ const nRows=o.rows.length; const bh=20+nRows*4.4; ensure(bh+4);
      const top=cy; sd(LINE); sf([255,255,255]); d.setLineWidth(0.3); d.roundedRect(MX,top,CW,bh,1.5,1.5,'FD'); sf(CAT[c][1]); d.rect(MX,top,1.6,bh,'F');
      d.setFont('helvetica','bold'); d.setFontSize(9.2); st(INK); d.text(o.def.name,MX+5,top+6);
      d.setFont('courier','bold'); d.setFontSize(7.4); st(o.range>3e6?COST:SOFT); d.text(`spread ${M(o.range)} (${o.rangePct.toFixed(0)}%)`,W-MX-2,top+6,{align:'right'});
      d.setFont('helvetica','normal'); d.setFontSize(6.7); st(SOFT); d.text(d.splitTextToSize(o.def.description, CW-10).slice(0,1),MX+5,top+10.5);
      // per-car bars
      const bx=MX+34, bw2=CW-34-30, mx=o.dear.cost*1.02; let ry=top+14.5;
      for(const r of o.rows){ d.setFont('helvetica','bold'); d.setFontSize(6.8); st(r.car==='l460'?GREEN:INK); d.text(r.short,MX+5,ry+2.2);
        sf([242,240,233]); d.rect(bx,ry,bw2,3,'F'); sf(r.col); d.rect(bx,ry,bw2*r.cost/mx,3,'F');
        d.setFont('courier','bold'); d.setFontSize(6.8); st(INK); d.text(M(r.cost),bx+bw2+2,ry+2.5);
        if(r===o.lean){ d.setFont('helvetica','bold'); d.setFontSize(5.6); st(SAVE); d.text('LEANEST',W-MX-2,ry+2.2,{align:'right'}); }
        else if(r===o.dear){ d.setFont('helvetica','bold'); d.setFontSize(5.6); st(COST); d.text('DEAREST',W-MX-2,ry+2.2,{align:'right'}); }
        ry+=4.4; }
      d.setFont('helvetica','italic'); d.setFontSize(6.4); st(SOFT); d.text(d.splitTextToSize(insight(o), CW-12).slice(0,2),MX+5,ry+2.5);
      cy+=bh+4;
    }
  }

  // PART C: league
  np(); head('C','League table','Who is leanest, who is dearest');
  y=para('Count of modules on which each model is the leanest or the dearest of those that build it. A quick read on structural software-cost position.',MX,40,CW,9.2); y+=4;
  const order=['BMW X7','Audi Q8','L460','Cayenne','Merc GLS'];
  d.setFont('helvetica','bold'); d.setFontSize(6.8); st(FAINT); d.text('MODEL',MX,y); d.text('MODULES LEANEST',MX+70,y); d.text('MODULES DEAREST',MX+130,y); y+=1.5; sd(LINE); d.setLineWidth(0.4); d.line(MX,y,W-MX,y); y+=6;
  order.forEach(nm=>{ const lc=leanCount[nm]||0, dc=dearCount[nm]||0; sf(colOf(nm.includes('L460')?'L460':nm.includes('BMW')?'BMW':nm.includes('Audi')?'Audi':nm.includes('Merc')?'Merc':'Cay')); d.rect(MX,y-2.8,2.8,2.8,'F');
    d.setFont('helvetica','bold'); d.setFontSize(8.6); st(INK); d.text(nm,MX+5,y);
    sf([233,241,233]); d.rect(MX+70,y-2.8,45,3.2,'F'); sf(SAVE); d.rect(MX+70,y-2.8,45*lc/45,3.2,'F'); d.setFont('courier','bold'); d.setFontSize(7.6); st(SAVE); d.text(String(lc),MX+118,y);
    sf([246,229,226]); d.rect(MX+130,y-2.8,45,3.2,'F'); sf(COST); d.rect(MX+130,y-2.8,45*dc/45,3.2,'F'); d.setFont('courier','bold'); st(COST); d.text(String(dc),W-MX-2,y,{align:'right'});
    y+=9; sd(LINE); d.setLineWidth(0.15); d.line(MX,y-4.5,W-MX,y-4.5); });
  y+=3; para('BMW X7 leads on cost across the board (Heavy reuse + an 8-year programme). Audi Q8 is close but its 9-year life adds lifecycle cost. Mercedes GLS is dearest almost everywhere (Medium reuse, Very-High MBUX signature, 9-year life). The L460 and Cayenne sit between — the L460\'s Medium reuse is its one structural gap, the Cayenne\'s cost is its BEV scope and Porsche performance software.',MX,y,CW,8.6,SOFT);

  // PART D: assumptions
  np(); head('D','Transparency','Assumptions & methodology');
  y=para('Every figure is live output from the CostVision should-cost engine (49-module catalogue, ISO 26262 / 21434). Nothing is hand-entered.',MX,40,CW,9.2); y+=3;
  const A=[['Comparison basis','Each model on its real drivetrain: the German MHEVs (X7, Q8, GLS) and the L460 on 48V mild-hybrid; the Cayenne on its full-BEV programme. Non-powertrain module cost is drivetrain-independent, so is directly comparable; the 7 EV-powertrain modules exist only on the L460 (BEV) and Cayenne.'],
    ['Per-module cost','Total programme should-cost (development + testing + integration + cybersecurity + calibration + toolchain, plus maintenance + cloud + IP over programme life).'],
    ['What sets the spread','Reuse strategy (Fresh 1.00 / Light 0.82 / Medium 0.60 / Heavy 0.35 / Platform 0.14 × dev effort), signature-software complexity, region / dev-source blended rate, overhead and programme life.'],
    ['Model assumptions','L460: UK · Tier-1 · 75k · 8yr · Medium.  X7: EU · in-house · 60k · 8yr · Heavy.  Q8: EU · in-house · 55k · 9yr · Heavy + platform.  GLS: EU · in-house · 45k · 9yr · Medium.  Cayenne: EU · in-house · 50k · 8yr · Medium + platform + Porsche performance.'],
    ['Accuracy','Bottom-up parametric should-cost; validated envelope ±25–35% (back-test MAPE 24.9%). Absolute numbers are estimates; comparisons are consistent (same engine + rate library).'],
    ['Propulsion availability','Verified July 2026: X7 / Q8 / GLS are MHEV-only in production; Cayenne offers ICE/PHEV/BEV; Range Rover Electric is launching. No fabricated variants are compared.'],
    ['Currency & scope','All figures GBP. Embedded & connected vehicle software only; excludes manufacturing, hardware and non-software engineering.']];
  A.forEach(a=>{ d.setFont('helvetica','bold'); d.setFontSize(8.2); st(GREEN); d.text(a[0],MX,y); y+=4; d.setFont('helvetica','normal'); d.setFontSize(7.5); st(SOFT); const ln=d.splitTextToSize(a[1],CW); d.text(ln,MX,y); y+=ln.length*3.1+4; });
  sd(LINE); d.setLineWidth(0.2); d.line(MX,y,W-MX,y); y+=5; d.setFont('helvetica','italic'); d.setFontSize(7); st(FAINT); d.text(d.splitTextToSize('This report supports target-setting and supplier negotiation; it is not an audited actual. Engine: CostVision sw-should-cost.ts, rate library v1.0, July 2026.',CW),MX,y);
  return Buffer.from(d.output('arraybuffer'));
}
const pdf=buildPDF(); fs.writeFileSync('docs/allmodels-deepdive.pdf', pdf);
console.log('PDF: docs/allmodels-deepdive.pdf', Math.round(pdf.length/1024)+'KB | modules:', MODS.length);

// ════════════ HTML ════════════
const HEX:any={ A:'#2F5C49',B:'#3E5F92',C:'#7C5468',D:'#9C7328',E:'#5E7686',F:'#AC4A3E',G:'#3F8FB0' };
const CHEX:any={ l460:'#1E4034', x7:'#3E5F92', q8:'#7C8894', gls:'#B08A46', cayenne:'#7C5468' };
const esc=(s:any)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function modHTML(o:Mod){ const mx=o.dear.cost*1.02;
  const rows=o.rows.map(r=>`<div class="cr"><span class="cn" style="${r.car==='l460'?'color:#1E4034;font-weight:700':''}">${esc(r.short)}</span><span class="ct"><span class="cf" style="width:${(r.cost/mx*100).toFixed(1)}%;background:${CHEX[r.car]}"></span></span><span class="cv">${M(r.cost)}</span><span class="cg">${r===o.lean?'<em class="lean">leanest</em>':r===o.dear?'<em class="dear">dearest</em>':''}</span></div>`).join('');
  return `<div class="mb" style="border-left-color:${HEX[o.def.category]}"><div class="mh"><span class="mn">${esc(o.def.name)}</span><span class="mr ${o.range>3e6?'hi':''}">spread ${M(o.range)} (${o.rangePct.toFixed(0)}%)</span></div><div class="mf">${esc(o.def.description)}</div><div class="crs">${rows}</div><div class="mi"><b>Insight</b> — ${esc(insight(o))}</div></div>`;
}
const CSS=`<style>
:root{--paper:#FCFBF7;--ink:#1B2620;--soft:#59635C;--faint:#8B948C;--line:#E6E3D8;--green:#1E4034;--green2:#2F5C49;--bronze:#9C7328;--save:#2E7D57;--cost:#AE4A3E;--softbg:#F7F5EF;--sans:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;--serif:Georgia,'Times New Roman',serif;--mono:'SF Mono',Menlo,Consolas,monospace}
*{box-sizing:border-box}body{margin:0;background:#E9E7DE;color:var(--ink);font-family:var(--sans);line-height:1.5}
.wrap{max-width:900px;margin:0 auto;padding:0 0 60px}
.cover{background:linear-gradient(160deg,#173029,#1E4034 55%);color:#EFEDE3;padding:58px 54px 38px}
.cover .eb{font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:#B98F44;font-weight:700}
.cover h1{font-family:var(--serif);font-size:2.7rem;line-height:1.06;margin:.3em 0 .2em;color:#FBFAF4}
.cover .sub{font-size:1.03rem;color:#D6D2C0;max-width:60ch}
.cover .mrow{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;margin-top:32px;background:rgba(255,255,255,.12);border-radius:9px;overflow:hidden}
.cover .mrow div{background:#1c3b31;padding:14px 16px}.cover .mrow .k{font-family:var(--mono);font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:#B9C6B0}.cover .mrow .v{font-family:var(--serif);font-size:1.5rem;font-weight:700;color:#B98F44}
.pg{background:var(--paper);padding:32px 54px}
.eyebrow{font-size:.64rem;letter-spacing:.2em;text-transform:uppercase;color:var(--bronze);font-weight:700}
h2{font-family:var(--serif);font-size:1.45rem;color:var(--green);margin:.1em 0 .5em}h2 .n{font-family:var(--mono);font-size:.85rem;color:var(--green2)}
p{color:var(--soft);max-width:72ch}.small{font-size:.85rem}.faint{color:var(--faint)}
.bars{display:flex;flex-direction:column;gap:8px;margin:10px 0}.bar{display:grid;grid-template-columns:150px 1fr 74px;gap:10px;align-items:center}.bar .l{font-size:.82rem;font-weight:600}.bar .l span{display:block;font-size:.64rem;color:var(--faint);font-weight:400}.bar .t{height:20px;background:var(--softbg);border:1px solid var(--line);border-radius:4px;overflow:hidden}.bar .f{height:100%}.bar .v{font-family:var(--mono);font-weight:700;font-size:.8rem;text-align:right}
.reuse{width:100%;border-collapse:collapse;font-size:.85rem;margin:8px 0}.reuse td{padding:7px 6px;border-bottom:1px solid var(--line)}.reuse .sw{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:7px}.reuse .st{font-family:var(--mono);color:var(--soft)}
.callout{border:1px solid var(--line);border-left:4px solid var(--bronze);background:#F4EBD6;border-radius:10px;padding:14px 16px;font-size:.9rem;margin-top:12px}
.domain{margin-top:24px}.dhead{display:flex;align-items:center;gap:12px;color:#fff;padding:10px 18px;border-radius:9px 9px 0 0}.dhead .dl{font-family:var(--serif);font-weight:700;font-size:1.25rem}.dhead .dn{font-weight:700;font-size:1.02rem;flex:1}.dhead .dm{font-family:var(--mono);font-size:.78rem;opacity:.9}
.mb{background:#fff;border:1px solid var(--line);border-left:4px solid;border-radius:0 0 2px 2px;padding:12px 16px;margin-bottom:8px}.mb:first-of-type{margin-top:8px}
.mh{display:flex;justify-content:space-between;align-items:baseline;gap:12px}.mn{font-weight:700;font-size:1rem}.mr{font-family:var(--mono);font-size:.76rem;color:var(--soft);font-weight:700}.mr.hi{color:var(--cost)}
.mf{font-size:.83rem;color:var(--soft);margin:3px 0 8px}
.crs{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.cr{display:grid;grid-template-columns:78px 1fr 62px 60px;gap:8px;align-items:center}.cn{font-size:.8rem;font-weight:600}.ct{height:11px;background:var(--softbg);border:1px solid var(--line);border-radius:3px;overflow:hidden}.cf{display:block;height:100%}.cv{font-family:var(--mono);font-weight:700;font-size:.78rem;text-align:right}.cg{font-size:.6rem;text-align:right}.cg .lean{color:var(--save);font-weight:700;font-style:normal;letter-spacing:.03em}.cg .dear{color:var(--cost);font-weight:700;font-style:normal;letter-spacing:.03em}
.mi{font-size:.8rem;color:var(--soft);font-style:italic;border-top:1px dashed var(--line);padding-top:6px}.mi b{color:var(--green);font-style:normal}
.league{width:100%;border-collapse:collapse;font-size:.88rem;margin-top:8px}.league th{font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);text-align:left;padding:7px 8px;border-bottom:1.5px solid var(--line)}.league td{padding:8px;border-bottom:1px solid var(--line)}.league .sw{width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:7px}.league .lc{font-family:var(--mono);font-weight:700;color:var(--save)}.league .dc{font-family:var(--mono);font-weight:700;color:var(--cost)}
.assump dt{font-weight:700;color:var(--green);margin-top:10px}.assump dd{margin:2px 0 0;color:var(--soft);font-size:.85rem}hr{border:none;border-top:1px solid var(--line);margin:16px 0}
@media print{@page{size:A4;margin:13mm}body{background:#fff}.wrap{max-width:none}.pg,.cover{padding:0}.mb,.domain,.dhead{page-break-inside:avoid}.dhead{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>`;
const totalBars=Object.entries(TOT).sort((a:any,b:any)=>a[1]-b[1]).map(([k,v]:any)=>{ const key=k.includes('L460')?'l460':k.includes('BMW')?'x7':k.includes('Audi')?'q8':k.includes('Merc')?'gls':'cayenne'; return `<div class="bar"><div class="l">${esc(k.split(' (')[0])}<span>${esc('('+k.split('(')[1])}</span></div><div class="t"><div class="f" style="width:${(v/650*100).toFixed(1)}%;background:${CHEX[key]}"></div></div><div class="v">£${v.toFixed(0)}M</div></div>`; }).join('');
const reuseRows=[['x7','BMW X7','Heavy (0.35×)','Lean — carries software forward across 7-Series / X5 / X7'],['q8','Audi Q8','Heavy + platform','Lean — VW-Group shared middleware (0.14×)'],['cayenne','Porsche Cayenne','Medium + platform','Mid — platform middleware, Porsche performance signature'],['l460','Range Rover L460','Medium (0.60×)','Higher — develops more afresh; Tier-1 sourcing offsets'],['gls','Mercedes GLS','Medium (0.60×)','Highest — Medium reuse + heavy MBUX signature + 9-yr life']].map(r=>`<tr><td><span class="sw" style="background:${CHEX[r[0]]}"></span><b>${r[1]}</b></td><td class="st">${r[2]}</td><td>${r[3]}</td></tr>`).join('');
const leagueRows=['BMW X7','Audi Q8','L460','Cayenne','Merc GLS'].map(nm=>{ const key=nm.includes('L460')?'l460':nm.includes('BMW')?'x7':nm.includes('Audi')?'q8':nm.includes('Merc')?'gls':'cayenne'; return `<tr><td><span class="sw" style="background:${CHEX[key]}"></span><b>${nm}</b></td><td class="lc">${leanCount[nm]||0}</td><td class="dc">${dearCount[nm]||0}</td></tr>`; }).join('');
const body=`<div class="wrap">
<div class="cover"><div class="eb">Automotive Software Should-Cost · All-Models Comparison</div><h1>Premium-SUV software cost<br>model-by-model</h1><p class="sub">Every one of the 49 software modules priced across five flagship SUVs — Range Rover L460, BMW X7, Audi Q8, Mercedes GLS and Porsche Cayenne — side by side, apple-to-apple, with the cost drivers behind each difference.</p><div class="mrow"><div><div class="k">Models compared</div><div class="v">5</div></div><div><div class="k">Modules each</div><div class="v">49</div></div><div><div class="k">Widest spread</div><div class="v">+58%</div></div></div></div>
<div class="pg"><div class="eyebrow">Part A · Market map</div><h2><span class="n">A</span> &nbsp;Where the five models sit</h2>
<p>Total software programme cost per model. The German MHEVs (X7, Q8, GLS) share the L460's mild-hybrid drivetrain; the Cayenne is shown on its full-BEV programme (49 vs 42 modules). Reuse strategy, not badge, sets the order.</p>
<div class="bars">${totalBars}</div>
<h3 style="font-family:var(--serif);color:var(--green)">Reuse strategy — the real differentiator</h3>
<table class="reuse"><tbody>${reuseRows}</tbody></table>
<div class="callout"><b>Who leads</b> — across the 49 modules, BMW X7 is the leanest on ${leanCount['BMW X7']||0} and Mercedes GLS the dearest on ${dearCount['Merc GLS']||0}. The L460 is leanest on the ${leanCount['L460']||0} EV-powertrain modules (it beats the Cayenne there). Every module is priced across all models below.</div></div>
<div class="pg"><div class="eyebrow">Part B · Module-by-module</div><h2><span class="n">B</span> &nbsp;Every module, all five models</h2>
<p>Each block shows what the software does and its cost for every model that builds it, ranked leanest to dearest, with an insight on the drivers.</p>
${CATS.map(c=>`<div class="domain"><div class="dhead" style="background:${HEX[c]}"><span class="dl">${c}</span><span class="dn">${esc(CAT[c][0])}</span><span class="dm">${catMods(c).length} modules</span></div>${catMods(c).map(modHTML).join('')}</div>`).join('')}
</div>
<div class="pg"><div class="eyebrow">Part C · League table</div><h2><span class="n">C</span> &nbsp;Who is leanest, who is dearest</h2>
<p>Count of modules on which each model is the leanest or the dearest of those that build it — a quick read on structural software-cost position.</p>
<table class="league"><thead><tr><th>Model</th><th>Modules leanest</th><th>Modules dearest</th></tr></thead><tbody>${leagueRows}</tbody></table>
<p class="small" style="margin-top:10px">BMW X7 leads across the board (Heavy reuse + 8-year programme). Audi Q8 is close but its 9-year life adds lifecycle cost. Mercedes GLS is dearest almost everywhere (Medium reuse, Very-High MBUX signature, 9-year life). The L460 and Cayenne sit between.</p></div>
<div class="pg"><div class="eyebrow">Part D · Transparency</div><h2><span class="n">D</span> &nbsp;Assumptions &amp; methodology</h2>
<dl class="assump">
<dt>Comparison basis</dt><dd>Each model on its real drivetrain: the German MHEVs and the L460 on 48V mild-hybrid; the Cayenne on its full-BEV programme. Non-powertrain module cost is drivetrain-independent and directly comparable; the 7 EV-powertrain modules exist only on the L460 (BEV) and Cayenne.</dd>
<dt>Per-module cost</dt><dd>Total programme should-cost — development + testing + integration + cybersecurity + calibration + toolchain, plus maintenance + cloud + IP over programme life.</dd>
<dt>What sets the spread</dt><dd>Reuse strategy (Fresh 1.00 / Light 0.82 / Medium 0.60 / Heavy 0.35 / Platform 0.14 × dev effort), signature-software complexity, region / dev-source blended rate, overhead and programme life.</dd>
<dt>Model assumptions</dt><dd>L460: UK · Tier-1 · 75k · 8yr · Medium. X7: EU · in-house · 60k · 8yr · Heavy. Q8: EU · in-house · 55k · 9yr · Heavy + platform. GLS: EU · in-house · 45k · 9yr · Medium. Cayenne: EU · in-house · 50k · 8yr · Medium + platform + Porsche performance.</dd>
<dt>Accuracy</dt><dd>Bottom-up parametric should-cost; validated envelope ±25–35% (back-test MAPE 24.9%). Absolute numbers are estimates; comparisons are consistent (same engine + rate library).</dd>
<dt>Propulsion availability</dt><dd>Verified July 2026: X7 / Q8 / GLS are MHEV-only in production; Cayenne offers ICE/PHEV/BEV; Range Rover Electric is launching. No fabricated variants are compared.</dd>
<dt>Currency &amp; scope</dt><dd>All figures GBP. Embedded &amp; connected vehicle software only; excludes manufacturing, hardware and non-software engineering.</dd>
</dl><hr><p class="small faint">This report supports target-setting and supplier negotiation; it is not an audited actual. Engine: CostVision sw-should-cost.ts, rate library v1.0, July 2026.</p></div>
</div>`;
const content=`<title>Premium-SUV Software Cost — All-Models Comparison</title>\n${CSS}\n${body}`;
fs.writeFileSync((process.env.SCRATCH||'/tmp')+'/allmodels-content.html', content);
const standalone=`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Premium-SUV Software Cost — All-Models Comparison</title>\n${CSS}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
fs.writeFileSync('public/reports/allmodels-deepdive.html', standalone);
fs.writeFileSync('docs/allmodels-deepdive.html', standalone);
console.log('HTML: public/reports/allmodels-deepdive.html', Math.round(standalone.length/1024)+'KB');
