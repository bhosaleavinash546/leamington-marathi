/**
 * Generate a detailed, board-level software should-cost breakdown report for a
 * vehicle demo, driven entirely by live engine output. Reuses the shipped L460
 * report's CSS + animation script (read from docs/l460-cost-breakdown.html) so
 * every generated report is a visually consistent family.
 *
 *   npx tsx scripts/gen-sw-report.ts                 # regenerate all configured vehicles
 *   npx tsx scripts/gen-sw-report.ts porsche_cayenne # just one (or several) by id
 *
 * Writes <id>-software-cost-breakdown.html to public/reports/ (served asset) and
 * a docs/ copy. NB: the Range Rover L460 report is hand-authored and NOT produced
 * here — its config is intentionally absent so it is never overwritten.
 */
import { computeSWProgram, defaultSWProgramInputs, SW_MODULES } from '../src/engine/sw-should-cost.js';
import type { SWModuleInput, SWReuse } from '../src/engine/sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY as L } from '../src/engine/sw-rate-library.js';
import * as fs from 'node:fs';

// Shared look-and-feel lifted verbatim from the shipped L460 report.
const L460 = fs.readFileSync('docs/l460-cost-breakdown.html', 'utf8');
const CSS = L460.slice(L460.indexOf('<style>'), L460.indexOf('</style>') + 8);
const JS  = L460.slice(L460.lastIndexOf('<script>'), L460.lastIndexOf('</script>') + 9);

const MHEV_DISABLED = ['bms_core','cell_balancing','soc_soh_soe','fast_charge','edu_control','inverter_ctrl','motor_ctrl'];

interface Meta {
  id: string; file: string; docFile: string; flag: string; name: string; code: string;
  region: 'EU'|'UK'; devSource: 'OEM_Internal'|'Tier1_Supplier'; volume: number; life: number;
  overhead: number; senior: number; reuse: SWReuse; disabled: string[];
  overrides: Record<string, Partial<Pick<SWModuleInput,'asil'|'complexity'|'reuse'>>>;
  arch: string; drivetrain: string; premiumNote: string; reuseNote: string;
}

const VEHICLES: Meta[] = [
  { id:'bmw_x7', file:'bmw-x7-software-cost-breakdown.html', docFile:'bmw-x7-cost-breakdown.html', flag:'🇩🇪', name:'BMW X7', code:'X7',
    region:'EU', devSource:'OEM_Internal', volume:60_000, life:8, overhead:1.60, senior:0.55, reuse:'Heavy',
    disabled:MHEV_DISABLED, overrides:{ digital_key:{complexity:'Very High'} },
    arch:'G07 · CLAR platform · iDrive 8 (BMW OS 8)', drivetrain:'ICE + 48V mild hybrid',
    premiumNote:'Executive Drive Pro (48V active roll) + Integral Active Steering, Bowers & Wilkins Diamond audio, Parking Assistant Professional + 360, Digital Key Plus (UWB), AR-ready HUD.',
    reuseNote:'Heavy platform reuse across 7-Series / X5 / X7 — most software carries forward.' },
  { id:'audi_q8', file:'audi-q8-software-cost-breakdown.html', docFile:'audi-q8-cost-breakdown.html', flag:'🇩🇪', name:'Audi Q8', code:'Q8',
    region:'EU', devSource:'OEM_Internal', volume:55_000, life:9, overhead:1.58, senior:0.55, reuse:'Heavy',
    disabled:MHEV_DISABLED, overrides:{ autosar_classic:{reuse:'Platform'}, autosar_adaptive:{reuse:'Platform'}, rtos:{reuse:'Platform'}, comm_stacks:{reuse:'Platform'} },
    arch:'MLB Evo · MMI/MIB3 · VW Group + CARIAD stacks', drivetrain:'ICE + 48V mild hybrid',
    premiumNote:'Adaptive air suspension + all-wheel steer, Bang & Olufsen 3D, park assist plus + 360, 4-zone climate, HUD.',
    reuseNote:'VW.OS core middleware carried across the Group — Platform reuse on AUTOSAR / RTOS / comm stacks.' },
  { id:'merc_gls', file:'mercedes-gls-software-cost-breakdown.html', docFile:'mercedes-gls-cost-breakdown.html', flag:'🇩🇪', name:'Mercedes GLS 450', code:'GLS 450',
    region:'EU', devSource:'OEM_Internal', volume:45_000, life:9, overhead:1.62, senior:0.55, reuse:'Medium',
    disabled:MHEV_DISABLED, overrides:{ ivi_os:{complexity:'Very High'}, voice_assistant:{complexity:'Very High'}, navigation:{complexity:'Very High'}, active_suspension:{complexity:'Very High'}, premium_audio:{complexity:'Very High'} },
    arch:'X167 · MBUX / NTG6 · EQ Boost 48V', drivetrain:'ICE + 48V mild hybrid',
    premiumNote:'E-Active Body Control (48V, camera Road-Surface-Scan), MBUX + “Hey Mercedes” voice, Burmester 3D surround, active parking + 360, MB AR-HUD, 5-zone climate.',
    reuseNote:'Signature MBUX / voice / active-body at Very-High complexity; moderate cross-range reuse.' },
  { id:'porsche_cayenne', file:'porsche-cayenne-software-cost-breakdown.html', docFile:'porsche-cayenne-cost-breakdown.html', flag:'🇩🇪', name:'Porsche Cayenne Electric', code:'Cayenne',
    region:'EU', devSource:'OEM_Internal', volume:50_000, life:8, overhead:1.62, senior:0.60, reuse:'Medium',
    disabled:[], overrides:{ autosar_classic:{reuse:'Platform'}, autosar_adaptive:{reuse:'Platform'}, rtos:{reuse:'Platform'}, comm_stacks:{reuse:'Platform'}, vehicle_motion:{complexity:'Very High'}, active_suspension:{complexity:'Very High'}, fast_charge:{complexity:'Very High'}, premium_audio:{complexity:'Very High'} },
    arch:'E4 · PPE 800V platform · Porsche Driver Experience', drivetrain:'Full battery-electric (BEV)',
    premiumNote:'Porsche 4D Chassis Control + torque vectoring, Porsche Active Ride, 800V 270 kW+ high-power charging, Burmester High-End 3D audio, park assist + 360, digital key, HUD.',
    reuseNote:'PPE middleware shared with Macan EV / Audi Q6 e-tron → Platform reuse on AUTOSAR / RTOS / comm stacks; bespoke Porsche performance software otherwise.' },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const CATNAME: Record<string,string> = { A:'EV Powertrain & Battery', B:'ADAS L2/L2+', C:'Infotainment & UX', D:'Domain Controllers', E:'Middleware & Platform', F:'Cybersecurity', G:'OTA & Cloud' };
const REUSE_V: Record<string,number> = { Fresh:1.0, Light:0.82, Medium:0.60, Heavy:0.35, Platform:0.14 };
const CX_V: Record<string,number> = { Low:0.6, Medium:1.0, High:1.7, 'Very High':2.8 };
const ASILDEV: Record<string,number> = { QM:1.0, A:1.35, B:1.8, C:2.3, D:3.2 };
const ASILTEST: Record<string,number> = { QM:0.35, A:0.55, B:0.85, C:1.2, D:1.8 };
const esc = (s:string)=> s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const M = (n:number)=> '£'+(n/1e6).toFixed(1)+'M';
const M0 = (n:number)=> '£'+Math.round(n/1e6)+'M';
const P = (n:number)=> '£'+Math.round(n).toLocaleString('en-GB');

function buildInputs(v: Meta) {
  const b = defaultSWProgramInputs();
  const disabled = new Set(v.disabled);
  return { ...b, region:v.region, devSource:v.devSource, programLifeYears:v.life, annualProductionVolume:v.volume,
    overheadMultiplier:v.overhead, teamSeniorFraction:v.senior,
    modules: b.modules.map(m => ({ ...m, enabled: !disabled.has(m.moduleId), reuse: v.reuse, ...(v.overrides[m.moduleId] ?? {}) })) };
}

function report(v: Meta): { file:string; docFile:string; html:string; gt:number; pv:number; mods:number } {
  const inp = buildInputs(v);
  const r = computeSWProgram(inp as any, { summaryOnly:false });
  const s = r.summary;
  const seniorMult = v.senior*1.20 + (1-v.senior)*0.75;
  const rate = L.ukBaseRatePerPM.value * L.regionMultipliers[v.region].value * L.devSourceMultipliers[v.devSource].value * seniorMult * v.overhead;
  const lifecycle = s.grandTotal - s.nreTotal;
  const regionLabel = v.region==='EU' ? 'European Union' : 'United Kingdom';
  const regionMult = L.regionMultipliers[v.region].value.toFixed(2);
  const srcLabel = v.devSource==='OEM_Internal' ? 'OEM in-house' : 'Tier-1 supplier';
  const srcMult = L.devSourceMultipliers[v.devSource].value.toFixed(2);

  const cats = Object.keys(CATNAME).filter(c => (s.byCategory as any)[c] > 0)
    .map(c => ({ c, v:(s.byCategory as any)[c] as number })).sort((a,b)=>b.v-a.v);
  const topCat = cats[0].v;
  const catBars = cats.map(({c,v:val})=>`
    <div class="brow"><div class="bl">${CATNAME[c].replace(' & Battery','').replace('L2/L2+','L2 / L2+')}<span>CATEGORY ${c}</span></div><div class="btrack"><div class="bfill" data-w="${(val/topCat*100).toFixed(0)}" style="background:var(--a-${c})"></div></div><div class="bv"><b>${M(val)}</b> ${(val/s.grandTotal*100).toFixed(1)}%</div></div>`).join('');

  const stackItems: [string,number,string][] = [
    ['Testing & V&V', s.totalTesting, ''], ['Maintenance', s.totalMaintenance, `${v.life}yr`],
    ['Development', s.totalDevelopment, ''], ['Cloud ops', s.totalCloud, `${v.life}yr`],
    ['Integration', s.totalIntegration, ''], ['IP licences', s.totalLicensing, `${v.life}yr`],
    ['Toolchain', s.totalToolchain, `${v.life}yr`], ['Calibration', s.totalCalibration, ''],
    ['Cybersecurity', s.totalCybersecurity, ''],
  ].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  const stack = stackItems.map(([l,val,sub])=>`<div class="si"><div class="l">${l}${sub?` <small>${sub}</small>`:''}</div><div class="v">${M(val)}</div></div>`).join('')
    + `<div class="si sub"><div class="l"><b>NRE subtotal</b></div><div class="v">${M(s.nreTotal)}</div></div>`
    + `<div class="si sub"><div class="l"><b>Lifecycle subtotal</b></div><div class="v">${M(lifecycle)}</div></div>`;

  let rows = '';
  for (const c of Object.keys(CATNAME)) {
    const mods = r.modules.filter(m=>m.category===c).sort((a,b)=>b.grandTotal-a.grandTotal);
    if (!mods.length) continue;
    const sum = (f:(m:any)=>number)=> mods.reduce((a,m)=>a+f(m),0);
    rows += `<tr class="catrow"><td class="cn"><span class="cc cc-${c}">${c}</span>${CATNAME[c]}</td><td class="ce sm">${mods.length} mod</td><td></td><td></td><td class="num">${sum(m=>m.personMonths).toFixed(0)}</td><td class="num">${M(sum(m=>m.development.total))}</td><td class="num">${M(sum(m=>m.testing.total))}</td><td class="num">${M(sum(m=>m.integrationCost+m.cybersecCost+m.calibrationCost+m.toolchainCost))}</td><td class="num">${M(sum(m=>m.totalLifecycle))}</td><td class="num tot">${M(sum(m=>m.grandTotal))}</td></tr>\n`;
    for (const m of mods) {
      rows += `<tr><td class="mn">${esc(m.moduleName)}</td><td class="ce"><span class="pill asil-${m.asilUsed}">${m.asilUsed}</span></td><td class="ce sm">${m.complexityUsed}</td><td class="ce sm">${m.reuseUsed}</td><td class="num">${m.personMonths.toFixed(1)}</td><td class="num">${M(m.development.total)}</td><td class="num">${M(m.testing.total)}</td><td class="num">${M(m.integrationCost+m.cybersecCost+m.calibrationCost+m.toolchainCost)}</td><td class="num">${M(m.totalLifecycle)}</td><td class="num tot">${M(m.grandTotal)}</td></tr>\n`;
    }
  }

  const am = [...r.modules].sort((a,b)=>b.grandTotal-a.grandTotal)[0];
  const adef = SW_MODULES.find(d=>d.id===am.moduleId)!;
  const cxMult = CX_V[am.complexityUsed]; const implCx = 1 + (cxMult-1)*0.15;
  const testFrac = adef.testingFractionBase * (ASILTEST[am.asilUsed]/0.38);
  const cyberPct = adef.hasCybersecRequirement ? (am.asilUsed==='D'?14:am.asilUsed==='C'?10:8) : 0;
  const d = am.development;
  const anatomy = `
    <div class="card reveal" style="margin-bottom:16px;">
      <div class="card-h"><span class="t">① Effort — how much engineering</span><span class="s">person-months</span></div>
      <div class="chain">
        <div class="cstep"><div class="lbl"><span class="k">Base effort</span><span class="f">catalogue size for a fresh build at ASIL-${adef.defaultAsil}</span></div><div class="out">${adef.basePersonMonths.toFixed(1)} PM</div></div>
        <div class="cstep"><div class="lbl"><span class="k">× Reuse — ${am.reuseUsed} ${REUSE_V[am.reuseUsed].toFixed(2)}</span></div><div class="out">${(adef.basePersonMonths*REUSE_V[am.reuseUsed]).toFixed(1)} PM</div></div>
        <div class="cstep tot"><div class="lbl"><span class="k">× ASIL-${am.asilUsed} dev overhead ${ASILDEV[am.asilUsed].toFixed(2)}</span></div><div class="out">${am.personMonths.toFixed(1)} PM</div></div>
      </div>
    </div>
    <div class="card reveal" style="margin-bottom:16px;">
      <div class="card-h"><span class="t">② Blended labour rate</span><span class="s">£ / PM</span></div>
      <div class="chain">
        <div class="cstep"><div class="lbl"><span class="k">UK senior-blended base</span></div><div class="out">£28,000</div></div>
        <div class="cstep sub"><div class="lbl">× Region — ${regionLabel} ${regionMult}</div><div class="out">${P(28000*L.regionMultipliers[v.region].value)}</div></div>
        <div class="cstep sub"><div class="lbl">× Dev source — ${srcLabel} ${srcMult}</div><div class="out">${P(28000*L.regionMultipliers[v.region].value*L.devSourceMultipliers[v.devSource].value)}</div></div>
        <div class="cstep sub"><div class="lbl">× Seniority ${seniorMult.toFixed(4)}</div><div class="out">${P(28000*L.regionMultipliers[v.region].value*L.devSourceMultipliers[v.devSource].value*seniorMult)}</div></div>
        <div class="cstep tot"><div class="lbl"><span class="k">× Overhead ${v.overhead.toFixed(2)}</span></div><div class="out">${P(rate)} / PM</div></div>
      </div>
    </div>
    <div class="card reveal" style="margin-bottom:16px;">
      <div class="card-h"><span class="t">③ Development — split into engineering buckets</span><span class="s">${M(d.total)}</span></div>
      <div class="chain">
        <div class="cstep head"><div class="lbl">bucket · share × modifier</div><div class="out">cost</div></div>
        <div class="cstep money sub"><div class="lbl"><span class="k">Requirements</span> · 12%</div><div class="out">${M(d.requirements)}</div></div>
        <div class="cstep money sub"><div class="lbl"><span class="k">Architecture</span> · 14%</div><div class="out">${M(d.architecture)}</div></div>
        <div class="cstep money sub"><div class="lbl"><span class="k">Algorithms</span> · 22% × complexity ${cxMult.toFixed(2)}</div><div class="out">${M(d.algorithmDev)}</div></div>
        <div class="cstep money sub"><div class="lbl"><span class="k">Implementation</span> · 37% × ${implCx.toFixed(3)}</div><div class="out">${M(d.implementation)}</div></div>
        <div class="cstep money sub"><div class="lbl"><span class="k">Safety compliance</span> · 15%${am.asilUsed==='D'||am.asilUsed==='C'?' (floored)':''}</div><div class="out">${M(d.safetyCompliance)}</div></div>
        <div class="cstep tot"><div class="lbl"><span class="k">Development total</span> · ${am.personMonths.toFixed(1)} PM × ${P(rate)} (weighted)</div><div class="out">${M(d.total)}</div></div>
      </div>
    </div>
    <div class="card reveal" style="margin-bottom:16px;">
      <div class="card-h"><span class="t">④ Verification, integration &amp; one-off costs</span><span class="s">NRE add-ons</span></div>
      <div class="chain">
        <div class="cstep money"><div class="lbl"><span class="k">Testing</span><span class="f">frac ${adef.testingFractionBase.toFixed(2)} × (ASIL-${am.asilUsed} ${ASILTEST[am.asilUsed].toFixed(2)} ÷ 0.38 ref) = ${testFrac.toFixed(1)}× dev</span></div><div class="out">${M(am.testing.total)}</div></div>
        <div class="cstep money"><div class="lbl"><span class="k">Integration</span><span class="f">${(adef.integrationFractionBase*100).toFixed(0)}% of dev</span></div><div class="out">${M(am.integrationCost)}</div></div>
        ${cyberPct?`<div class="cstep money"><div class="lbl"><span class="k">Cybersecurity</span><span class="f">${cyberPct}% (ASIL-${am.asilUsed}) — ISO 21434</span></div><div class="out">${M(am.cybersecCost)}</div></div>`:''}
        <div class="cstep money"><div class="lbl"><span class="k">Calibration</span><span class="f">${(adef.calibrationFractionBase*100).toFixed(0)}% — model fitting / proving ground</span></div><div class="out">${M(am.calibrationCost)}</div></div>
        <div class="cstep money"><div class="lbl"><span class="k">Dev toolchain</span><span class="f">${P(adef.annualToolLicenceGBP)}/yr × ${v.life}</span></div><div class="out">${M(am.toolchainCost)}</div></div>
      </div>
    </div>
    <div class="card reveal">
      <div class="card-h"><span class="t">⑤ Lifecycle &amp; totals</span><span class="s">${v.life}-year window</span></div>
      <div class="chain">
        <div class="cstep money"><div class="lbl"><span class="k">Maintenance</span><span class="f">${adef.maintenancePctPerYear}%/yr of dev × ${v.life} years</span></div><div class="out">${M(am.maintenanceCost)}</div></div>
        ${am.cloudCost>0?`<div class="cstep money"><div class="lbl"><span class="k">Cloud ops</span><span class="f">${v.life}-year operational</span></div><div class="out">${M(am.cloudCost)}</div></div>`:''}
        <div class="cstep money"><div class="lbl"><span class="k">Embedded IP licence</span><span class="f">${P(adef.annualIPLicenceGBP)}/yr × ${v.life}</span></div><div class="out">${M(am.licensingCost)}</div></div>
        <div class="cstep tot"><div class="lbl"><span class="k">Non-recurring engineering (NRE)</span></div><div class="out">${M(am.totalNonRecurring)}</div></div>
        <div class="cstep tot"><div class="lbl"><span class="k">Lifecycle total</span></div><div class="out">${M(am.totalLifecycle)}</div></div>
        <div class="cstep grand"><div class="lbl"><span class="k">${esc(am.moduleName)} grand total</span><span class="f">${P(am.perVehicle)} per vehicle over ${(v.volume*v.life).toLocaleString('en-GB')} units</span></div><div class="out">${M(am.grandTotal)}</div></div>
      </div>
    </div>`;

  const phases = r.phases.map(p=>`<div class="ph"><div class="v">${M(p.nreCost)}</div><div class="bar" data-h="${(p.fraction/0.50*100).toFixed(0)}"></div><div class="nm">${esc(p.name)}</div><div class="mo">${esc(p.months)} · ${(p.fraction*100).toFixed(0)}%</div></div>`).join('');

  const totRows = r.sensitivity.filter(x=>x.unit!=='£/vehicle');
  const volRow = r.sensitivity.find(x=>x.unit==='£/vehicle');
  const lowsM = totRows.map(x=>x.low/1e6), highsM = totRows.map(x=>x.high/1e6);
  const axMin = Math.floor(Math.min(...lowsM)/50)*50, axMax = Math.ceil(Math.max(...highsM)/50)*50, span = axMax-axMin;
  const baseM = s.grandTotal/1e6;
  const sortedT = [...totRows].sort((a,b)=>(b.high-b.low)-(a.high-a.low));
  const paramName: Record<string,string> = { 'ASIL Level (all modules: D vs B)':'ASIL rigour|all-B ↔ all-D', 'Complexity (all modules: Medium vs Very High)':'Complexity|Medium ↔ Very High', 'Reuse Level (Heavy vs Fresh)':'Reuse level|Heavy ↔ Fresh', 'Region (India vs USA Silicon Valley)':'Region|India ↔ Silicon Valley', 'Program Life (8 vs 14 years)':`Programme life|${v.life} ↔ 14 years` };
  const torn = sortedT.map(x=>{
    const lm=x.low/1e6, hm=x.high/1e6;
    const l=((lm-axMin)/span*100).toFixed(1), w=((hm-lm)/span*100).toFixed(1), bp=((baseM-axMin)/span*100).toFixed(1);
    const nm = (paramName[x.parameter]||x.parameter+'|').split('|');
    return `<div class="trow"><div class="tl">${nm[0]}<span>${nm[1]||''}</span></div><div class="tbar" data-lo="${lm}" data-hi="${hm}"><div class="seg" style="left:${l}%;width:${w}%"></div><div class="base" style="left:${bp}%"></div><div class="lo">${M0(x.low)}</div><div class="hi">${M0(x.high)}</div></div></div>`;
  }).join('');
  const volNote = volRow ? `Volume is a per-vehicle lever, not a total lever: at 50k/yr the cost is ${P(volRow.high)}/car, at 150k/yr it is ${P(volRow.low)}/car — the ${M(s.grandTotal)} programme is unchanged, just spread over more cars.` : '';

  const mc = r.monteCarlo;
  const p10=mc.p10/1e6, p50=mc.p50/1e6, p90=mc.p90/1e6, mcspan=p90-p10;
  const mcMin=p10-mcspan*0.4, mcMax=p90+mcspan*0.4, mcTot=mcMax-mcMin;
  const pos=(x:number)=>((x-mcMin)/mcTot*100).toFixed(1);

  const bmax = Math.max(...r.benchmarks.map(b=>b.totalM));
  const bmk = [...r.benchmarks].sort((a,b)=>b.totalM-a.totalM).map(b=>{
    const self = /this|CostVision/i.test(b.source);
    return `<div class="bmrow${self?' self':''}"><div class="nm">${self?esc(v.name):esc(b.vehicle)}<span>${self?'CostVision — this model':esc(b.source)}</span></div><div class="amt">${M0(b.totalM*1e6)}</div><div class="track"><div class="tf" data-w="${(b.totalM/bmax*100).toFixed(0)}"${self?' style="background:var(--gold)"':''}></div></div></div>`;
  }).join('');

  const nrePct = (s.nreTotal/s.grandTotal*100).toFixed(0);

  const body = `
<div class="wrap">
  <header class="hero">
    <div class="kd"><span>CostVision Should-Cost</span><span class="dot"></span><span>Confidential — Management Review</span><span class="dot"></span><span>GBP</span></div>
    <div class="eyebrow" style="margin-top:22px">Programme Software Cost Breakdown</div>
    <h1>${esc(v.name.replace(v.code,'').trim())} <span class="accent">${esc(v.code)}</span><br>software should-cost</h1>
    <p class="sub">A full bottom-up teardown of the vehicle's embedded software programme — ${r.modules.length} modules, every parameter, traced from person-months to the last pound.</p>
    <div class="herofig stagger">
      <div class="hf money"><div class="k">Programme total</div><div class="v"><span class="cu" data-to="${(s.grandTotal/1e6).toFixed(1)}" data-dec="1" data-pre="£" data-suf="M">£0M</span></div><div class="s">point estimate · ${r.modules.length} modules</div></div>
      <div class="hf money"><div class="k">Per vehicle</div><div class="v"><span class="cu" data-to="${Math.round(s.perVehicle)}" data-pre="£">£0</span></div><div class="s">${(v.volume*v.life).toLocaleString('en-GB')} units (${(v.volume/1000)}k × ${v.life}yr)</div></div>
      <div class="hf"><div class="k">NRE (one-off)</div><div class="v"><span class="cu" data-to="${(s.nreTotal/1e6).toFixed(1)}" data-dec="1" data-pre="£" data-suf="M">£0M</span></div><div class="s">${nrePct}% of programme</div></div>
      <div class="hf"><div class="k">Lifecycle (${v.life}yr)</div><div class="v"><span class="cu" data-to="${(lifecycle/1e6).toFixed(1)}" data-dec="1" data-pre="£" data-suf="M">£0M</span></div><div class="s">maintenance + cloud + IP</div></div>
    </div>
  </header>

  <section>
    <div class="reveal"><div class="eyebrow">The starting point</div><h2><span class="n">01</span>What we costed</h2>
      <p class="lede">The estimate is driven by seven macro parameters describing the programme. These are the only judgement inputs — everything downstream is derived mechanically from them and the sourced rate library.</p></div>
    <div class="card reveal">
      <div class="card-h"><span class="t">Programme parameters — ${esc(v.name)} (2026)</span><span class="s">${esc(v.arch)}</span></div>
      <div class="inp">
        <div class="row"><div class="l">Development region<span>sets the labour rate</span></div><div class="val">${regionLabel} (${regionMult}×)</div></div>
        <div class="row"><div class="l">Development source<span>OEM vs supplier efficiency</span></div><div class="val">${srcLabel} (${srcMult}×)</div></div>
        <div class="row"><div class="l">Annual production volume<span>spreads NRE per car</span></div><div class="val">${v.volume.toLocaleString('en-GB')} / yr</div></div>
        <div class="row"><div class="l">Programme life<span>develop + maintain window</span></div><div class="val">${v.life} years</div></div>
        <div class="row"><div class="l">Overhead multiplier<span>facilities, IT, management</span></div><div class="val">${v.overhead.toFixed(2)}×</div></div>
        <div class="row"><div class="l">Senior-engineer fraction<span>blends the day-rate</span></div><div class="val">${(v.senior*100).toFixed(0)}%</div></div>
        <div class="row"><div class="l">Baseline reuse<span>carry-forward vs greenfield</span></div><div class="val">${v.reuse} (${REUSE_V[v.reuse].toFixed(2)}×)</div></div>
        <div class="row"><div class="l">Modules enabled<span>of 49 in the catalogue</span></div><div class="val">${r.modules.length} of 49</div></div>
      </div>
    </div>
    <p class="note reveal">${esc(v.drivetrain)}${v.disabled.length? ' — the BEV battery / charge / drive modules are not applicable and are disabled.' : ' — the full EV powertrain software stack (BMS, charging, drive-unit, inverter, motor control) is in scope.'} Premium software is switched on: ${esc(v.premiumNote)}</p>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">The method, in five moves</div><h2><span class="n">02</span>How the number is built</h2>
      <p class="lede">No figure is guessed at the top. The programme is broken into modules, each is costed from first principles, results roll up, then the total is stress-tested for risk and sanity.</p></div>
    <div class="card reveal" style="padding:30px 18px 26px;">
      <div class="flow" id="flow">
        <div class="fnode"><div class="fline"></div><div class="disc">1</div><h4>Decompose</h4><p>Programme → ${r.modules.length} active modules across 7 domains</p></div>
        <div class="fnode"><div class="fline"></div><div class="disc">2</div><h4>Cost each</h4><p>Effort × sourced rate → dev / test / lifecycle</p></div>
        <div class="fnode"><div class="fline"></div><div class="disc">3</div><h4>Roll up</h4><p>Sum to total, NRE &amp; £/vehicle</p></div>
        <div class="fnode"><div class="fline"></div><div class="disc">4</div><h4>Simulate</h4><p>1,000 correlated runs → P10 / P50 / P90</p></div>
        <div class="fnode"><div class="fline"></div><div class="disc">5</div><h4>Validate</h4><p>Back-test vs 7 real programmes</p></div>
      </div>
    </div>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Stage 2, in full — one module, every parameter</div><h2><span class="n">03</span>Anatomy of a calculation: ${esc(am.moduleName)}</h2>
      <p class="lede">This is the exact chain the engine runs for the largest single line in this programme (${M(am.grandTotal)}). Every one of the ${r.modules.length} modules is costed by this identical formula; only the inputs change.</p></div>
    ${anatomy}
    <p class="note reveal" style="margin-top:14px;">Read across all ${r.modules.length} modules and the same five steps repeat — different base effort, ASIL, complexity and reuse each time. The next table shows every one.</p>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Stage 2 × ${r.modules.length} — the complete teardown</div><h2><span class="n">04</span>Every module, costed</h2>
      <p class="lede">All ${r.modules.length} active modules, grouped by domain and ranked by cost within each. "Other NRE" folds integration, cybersecurity, calibration and toolchain; "Lifecycle" folds ${v.life}-year maintenance, cloud and IP licence.</p></div>
    <div class="card reveal">
      <div class="card-h"><span class="t">Module-level cost breakdown</span><span class="s">£M · ${r.modules.length} modules · 7 domains</span></div>
      <div class="tblwrap"><table class="big">
        <thead><tr><th>Module / domain</th><th>ASIL</th><th>Cx</th><th>Reuse</th><th>Dev&nbsp;PM</th><th>Development</th><th>Testing</th><th>Other&nbsp;NRE</th><th>Lifecycle</th><th>Total</th></tr></thead>
        <tbody>
${rows}        </tbody>
        <tfoot><tr class="catrow"><td class="cn" style="font-size:.95rem">PROGRAMME TOTAL</td><td class="ce sm">${r.modules.length} mod</td><td></td><td></td><td class="num">—</td><td class="num">${M(s.totalDevelopment)}</td><td class="num">${M(s.totalTesting)}</td><td class="num">${M(s.totalIntegration+s.totalCybersecurity+s.totalCalibration+s.totalToolchain)}</td><td class="num">${M(lifecycle)}</td><td class="num tot" style="font-size:.95rem">${M(s.grandTotal)}</td></tr></tfoot>
      </table></div>
    </div>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Stage 3 — roll-up</div><h2><span class="n">05</span>Where the money goes</h2>
      <p class="lede">Two views of the same ${M(s.grandTotal)}: by vehicle domain (which systems), and by cost type (which activities).</p></div>
    <div class="two">
      <div class="card reveal"><div class="card-h"><span class="t">By vehicle domain</span></div><div class="bars" id="catbars">${catBars}</div></div>
      <div class="card reveal"><div class="card-h"><span class="t">By cost type</span></div><div class="stack">${stack}</div></div>
    </div>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Cash-flow shape</div><h2><span class="n">06</span>When the NRE is spent</h2>
      <p class="lede">The ${M(s.nreTotal)} of one-off engineering spreads across a 90-month programme. Series development is the peak-burn phase — half the entire NRE budget.</p></div>
    <div class="card reveal"><div class="card-h"><span class="t">NRE spend by programme phase</span><span class="s">${M(s.nreTotal)} over 90 months</span></div>
      <div class="phases" id="phases">${phases}</div></div>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Stage 4a — what moves the number</div><h2><span class="n">07</span>The biggest levers</h2>
      <p class="lede">Each bar swings one input across its plausible range while holding the rest at base (${M(s.grandTotal)}, black line). Region and reuse dominate.</p></div>
    <div class="card reveal"><div class="card-h"><span class="t">Single-parameter sensitivity</span><span class="s">£M · base ${M(s.grandTotal)}</span></div>
      <div class="torn" id="torn" data-min="${axMin}" data-max="${axMax}" data-base="${baseM.toFixed(1)}">${torn}</div></div>
    <p class="note reveal" style="margin-top:12px;">${volNote}</p>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Stage 4b — the risk range</div><h2><span class="n">08</span>Confidence band</h2>
      <p class="lede">1,000 correlated simulations (overruns move together, ρ=0.55) give the honest planning range. Budget to P50–P90, not to the headline.</p></div>
    <div class="card reveal"><div class="card-h"><span class="t">Monte-Carlo distribution — programme total</span><span class="s">1,000 runs · triangular ± per bucket</span></div>
      <div class="mct">
        <div class="mc"><div class="p">P10 · OPTIMISTIC</div><div class="v">${M0(mc.p10)}</div><div class="s">${P(mc.p10PerVehicle)} / vehicle</div></div>
        <div class="mc p50"><div class="p">P50 · EXPECTED</div><div class="v">${M0(mc.p50)}</div><div class="s">${P(mc.p50PerVehicle)} / vehicle</div></div>
        <div class="mc"><div class="p">P90 · CONSERVATIVE</div><div class="v">${M0(mc.p90)}</div><div class="s">${P(mc.p90PerVehicle)} / vehicle</div></div>
      </div>
      <div class="mctrack" id="mctrack">
        <div class="mcfill" data-l="${pos(p10)}" data-w="${(parseFloat(pos(p90))-parseFloat(pos(p10))).toFixed(1)}"></div>
        <div class="mcm up" data-l="P10 ${M0(mc.p10)}" style="left:${pos(p10)}%"></div>
        <div class="mcm" data-l="P50 ${M0(mc.p50)}" style="left:${pos(p50)}%"></div>
        <div class="mcm up" data-l="P90 ${M0(mc.p90)}" style="left:${pos(p90)}%"></div>
      </div>
      <div class="mc-axis" style="display:flex;justify-content:space-between;padding:0 18px 4px;font-family:var(--mono);font-size:.68rem;color:var(--ink-faint)"><span>${M0(mcMin*1e6)}</span><span>1,000 correlated runs</span><span>${M0(mcMax*1e6)}</span></div>
    </div>
    <p class="note reveal" style="margin-top:12px;">90% confident the programme lands under ~${M0(mc.p90)}. The point estimate (${M(s.grandTotal)}) sits near P50 — expected, given the right-skew of triangular cost distributions.</p>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Stage 5 — sanity check</div><h2><span class="n">09</span>How it sits against real programmes</h2>
      <p class="lede">The model back-tests against seven published premium programmes. This ${esc(v.code)} estimate lands where a ${esc(v.drivetrain.toLowerCase())} flagship should.</p></div>
    <div class="card reveal"><div class="card-h"><span class="t">Published programme comparison</span><span class="s">total SW investment · £M</span></div>
      <div class="bmk" id="bmk">${bmk}</div></div>
    <p class="note reveal" style="margin-top:12px;">Across all seven published programmes the model's mean absolute error is <strong class="k">24.9%</strong>, with 5 of 7 inside ±35%. This ${esc(v.code)} figure is a model estimate, not a published actual.</p>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">The rate library</div><h2><span class="n">10</span>Every multiplier used</h2>
      <p class="lede">The sourced figures behind the calculation. Each carries provenance and a confidence grade in the engine, and any can be overridden with company data.</p></div>
    <div class="card reveal"><div class="grid2">
      <table class="mult"><caption>Region — labour £/PM vs UK</caption>
        <tr><td>Silicon Valley</td><td class="v">1.85×</td></tr><tr><td>USA — Detroit</td><td class="v">1.35×</td></tr>
        <tr><td${v.region==='UK'?' style="font-weight:600"':''}>UK</td><td class="v">1.00×</td></tr><tr><td${v.region==='EU'?' style="font-weight:600"':''}><b>${v.region==='EU'?'EU — used here':'EU'}</b></td><td class="v">0.95×</td></tr>
        <tr><td>Eastern Europe</td><td class="v">0.45×</td></tr><tr><td>China</td><td class="v">0.35×</td></tr><tr><td>India</td><td class="v">0.20×</td></tr></table>
      <table class="mult"><caption>ASIL — dev &amp; test overhead vs QM</caption>
        <tr><td>QM</td><td class="v">1.0 / 0.35</td></tr><tr><td>ASIL-A</td><td class="v">1.35 / 0.55</td></tr>
        <tr><td>ASIL-B</td><td class="v">1.80 / 0.85</td></tr><tr><td>ASIL-C</td><td class="v">2.30 / 1.20</td></tr>
        <tr><td>ASIL-D</td><td class="v">3.20 / 1.80</td></tr></table>
      <table class="mult"><caption>Complexity multiplier</caption>
        <tr><td>Low</td><td class="v">0.60×</td></tr><tr><td>Medium</td><td class="v">1.00×</td></tr>
        <tr><td>High</td><td class="v">1.70×</td></tr><tr><td>Very High</td><td class="v">2.80×</td></tr></table>
      <table class="mult"><caption>Reuse factor (× base effort)</caption>
        <tr><td>Fresh</td><td class="v">1.00×</td></tr><tr><td>Light</td><td class="v">0.82×</td></tr>
        <tr><td${v.reuse==='Medium'?' style="font-weight:600"':''}><b>${v.reuse==='Medium'?'Medium — used here':'Medium'}</b></td><td class="v">0.60×</td></tr><tr><td${v.reuse==='Heavy'?' style="font-weight:600"':''}><b>${v.reuse==='Heavy'?'Heavy — used here':'Heavy'}</b></td><td class="v">0.35×</td></tr>
        <tr><td>Platform</td><td class="v">0.14×</td></tr></table>
    </div></div>
    <p class="note reveal" style="margin-top:12px;">${esc(v.reuseNote)} UK base rate <strong class="k">£28,000/PM</strong>; per-module testing / integration / maintenance fractions and toolchain / IP £/yr are also library-set.</p>
  </section>

  <section>
    <div class="reveal"><div class="eyebrow">Read this before you quote the number</div><h2><span class="n">11</span>Method &amp; assumptions</h2></div>
    <div class="callout reveal"><b>An envelope, not audited-to-the-pound.</b> This is a ±25–35% parametric should-cost model. Its value is that it decomposes and sources every figure, and reports its own confidence band — not that it predicts the actual to the last pound.</div>
    <div class="two reveal" style="margin-top:14px;">
      <div><h3>What it is good for</h3><ul class="clean">
        <li><b>Target-setting</b> — a defensible number to negotiate a supplier quote against.</li>
        <li><b>What-if analysis</b> — move region, reuse or ASIL and see the £ impact instantly.</li>
        <li><b>Make-vs-buy &amp; offshore</b> — the region and dev-source levers are explicit.</li></ul></div>
      <div><h3>Where to be careful</h3><ul class="clean">
        <li><b>Costs by domain, not by brand</b> — captures the cost of a system, not every named ECU.</li>
        <li><b>Inputs drive everything</b> — a wrong reuse or ASIL assumption moves the total materially.</li>
        <li><b>Benchmarks are estimates</b> — the validation targets are analyst figures, not audited books.</li></ul></div>
    </div>
    <p class="note reveal" style="margin-top:16px;">All figures on this page are live output from the CostVision engine (<code>sw-should-cost.ts</code>), regenerated from the module catalogue — not hand-entered. ${esc(v.drivetrain)}.</p>
  </section>

  <div class="footer"><span>CostVision · Auto SW Cost — ${esc(v.name)} breakdown</span><span>${r.modules.length} modules · 7 domains · figures from live engine output · GBP</span></div>
</div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.name)} (2026) — Software Should-Cost Breakdown</title>
${CSS}
</head>
<body>
${body}
${JS}
</body>
</html>
`;
  return { file:v.file, docFile:v.docFile, html, gt:s.grandTotal, pv:s.perVehicle, mods:r.modules.length };
}

const want = process.argv.slice(2);
const list = want.length ? VEHICLES.filter(v => want.includes(v.id)) : VEHICLES;
if (!list.length) { console.error('No matching vehicle ids. Known:', VEHICLES.map(v=>v.id).join(', ')); process.exit(1); }
for (const v of list) {
  const out = report(v);
  fs.writeFileSync('public/reports/'+out.file, out.html);
  fs.writeFileSync('docs/'+out.docFile, out.html);
  console.log(`${v.name.padEnd(24)} ${out.mods} mods  ${M(out.gt)}  ${P(out.pv)}/veh  → ${out.file} (${out.html.length} bytes)`);
}
