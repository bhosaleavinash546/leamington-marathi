import { computeSWProgram, defaultSWProgramInputs, SW_MODULES } from '../../src/engine/sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY as L } from '../../src/engine/sw-rate-library.js';
import { runValidation } from '../../src/engine/sw-validation.js';
const p = defaultSWProgramInputs();
const r = computeSWProgram(p);
const f = (n: number) => '£' + n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
console.log('INPUTS', JSON.stringify({ ...p, modules: `${p.modules.filter(m=>m.enabled).length} enabled of ${p.modules.length}` }));
// hand trace bms_core
const def = SW_MODULES.find(m => m.id === 'bms_core')!; const mi = p.modules.find(m => m.moduleId === 'bms_core')!;
const base = L.ukBaseRatePerPM.value, reg = L.regionMultipliers[p.region].value, ds = L.devSourceMultipliers[p.devSource].value;
const senior = p.teamSeniorFraction*1.2 + (1-p.teamSeniorFraction)*0.75;
const rate = base*reg*ds*senior*p.overheadMultiplier;
const reuse = L.reuseFactors[mi.reuse].value, ad = L.asilDevMultipliers[mi.asil].value, cx = L.complexityMultipliers[mi.complexity].value;
const effPM = def.basePersonMonths*reuse, devPM = effPM*ad;
const safetyScale = Math.max(reuse, {QM:0,A:0,B:0.4,C:0.5,D:0.6}[mi.asil])/reuse;
const implC = 1+(cx-1)*0.15;
const buckets = { reqs: devPM*0.12, arch: devPM*0.14, algo: devPM*0.22*cx, impl: devPM*0.37*implC, safety: devPM*0.15*safetyScale };
const devTotal = Object.values(buckets).reduce((a,b)=>a+b,0)*rate;
const testFrac = def.testingFractionBase*(L.asilTestMultipliers[mi.asil].value/0.38);
console.log('BMS trace', { base, reg, ds, senior, overhead: p.overheadMultiplier, ratePerPM: rate, reuse, asilDev: ad, complexity: cx, effPM, devPM, safetyScale, implC,
  bucketsPM: buckets, devPMcosted: Object.values(buckets).reduce((a,b)=>a+b,0), devTotal, testFrac, test: devTotal*testFrac, integ: devTotal*def.integrationFractionBase,
  cyber: devTotal*0.14, calib: devTotal*def.calibrationFractionBase, tool: def.annualToolLicenceGBP*p.programLifeYears, ip: def.annualIPLicenceGBP*p.programLifeYears,
  maint: devTotal*def.maintenancePctPerYear/100*p.programLifeYears });
const bm = r.modules.find(m => m.moduleId==='bms_core')!;
console.log('BMS engine', { dev: bm.development.total, test: bm.testing.total, integ: bm.integrationCost, cyber: bm.cybersecCost, calib: bm.calibrationCost, tool: bm.toolchainCost, ip: bm.licensingCost, maint: bm.maintenanceCost, nre: bm.totalNonRecurring, life: bm.totalLifecycle, total: bm.grandTotal, pv: bm.perVehicle, pm: bm.personMonths });
const s = r.summary;
console.log('SUMMARY', Object.fromEntries(Object.entries(s).filter(([k])=>k!=='byCategory').map(([k,v])=>[k, typeof v==='number'? Math.round(v as number):v])));
console.log('byCategory', Object.fromEntries(Object.entries(s.byCategory).map(([k,v])=>[k, f(v)])));
console.log('MC', r.monteCarlo); console.log('phases sum', r.phases.reduce((a,b)=>a+b.nreCost,0), 'nre', s.nreTotal);
console.log('sens', r.sensitivity.map(x=>[x.parameter, Math.round(x.low), Math.round(x.base), Math.round(x.high), x.unit]));
const v = runValidation(); console.log('VALIDATION mape', v.mapeTotal.toFixed(1), v.mapePerVehicle.toFixed(1), v.withinBandCount+'/'+v.caseCount);
for (const c of v.cases) console.log('  ', c.programme, Math.round(c.modelledTotalGBP/1e6)+'M vs '+c.publishedTotalGBP/1e6+'M', c.totalVariancePct.toFixed(0)+'%', 'pv', Math.round(c.modelledPerVehicle), 'vs', c.publishedPerVehicle);
