import { computeSWProgram, defaultSWProgramInputs, SW_MODULES } from '../../src/engine/sw-should-cost.js';
const base = defaultSWProgramInputs();
const run = (label: string, mut: (p: ReturnType<typeof defaultSWProgramInputs>) => void) => {
  const p = defaultSWProgramInputs(); mut(p);
  try {
    const r = computeSWProgram(p); const s = r.summary;
    const bad = [s.grandTotal, s.perVehicle, r.monteCarlo.p50].some(x => !Number.isFinite(x));
    console.log(label.padEnd(46), 'total', Math.round(s.grandTotal).toLocaleString(), 'pv', s.perVehicle.toFixed(2), 'P50', Math.round(r.monteCarlo.p50).toLocaleString(), 'P50pv', r.monteCarlo.p50PerVehicle.toFixed(2), bad ? 'NON-FINITE' : '', s.grandTotal < 0 ? 'NEGATIVE' : '');
  } catch (e) { console.log(label.padEnd(46), 'THROWS', (e as Error).message); }
};
// determinism
const a = [1,2,3].map(() => JSON.stringify(computeSWProgram(defaultSWProgramInputs()).summary) + JSON.stringify(computeSWProgram(defaultSWProgramInputs()).monteCarlo));
console.log('3 runs identical:', a[0] === a[1] && a[1] === a[2]);
run('baseline', () => {});
run('volume 0', p => { p.annualProductionVolume = 0; });
run('volume negative -80000', p => { p.annualProductionVolume = -80000; });
run('volume 1e12', p => { p.annualProductionVolume = 1e12; });
run('life 0', p => { p.programLifeYears = 0; });
run('life negative -5', p => { p.programLifeYears = -5; });
run('life 1000', p => { p.programLifeYears = 1000; });
run('life NaN (blank field)', p => { p.programLifeYears = NaN; });
run('senior fraction 5 (500%)', p => { p.teamSeniorFraction = 5; });
run('senior fraction -1', p => { p.teamSeniorFraction = -1; });
run('overhead 0', p => { p.overheadMultiplier = 0; });
run('overhead -1', p => { p.overheadMultiplier = -1; });
run('baseRate negative (ignored?)', p => { p.baseRateGBP = -50000; });
run('baseRate 28 (typed £k by mistake)', p => { p.baseRateGBP = 28; });
run('customPM negative on BMS', p => { p.modules.find(m => m.moduleId==='bms_core')!.customPersonMonths = -500; });
run('customPM 1e9 on BMS', p => { p.modules.find(m => m.moduleId==='bms_core')!.customPersonMonths = 1e9; });
run('customPM 0 on BMS', p => { p.modules.find(m => m.moduleId==='bms_core')!.customPersonMonths = 0; });
run('unknown moduleId', p => { p.modules.push({ moduleId: 'nope', enabled: true, asil: 'B', complexity: 'High', reuse: 'Medium', customPersonMonths: null }); });
run('duplicate module (BMS twice)', p => { p.modules.push({ ...p.modules.find(m => m.moduleId==='bms_core')! }); });
run('unknown region code', p => { (p as any).region = 'Brazil'; });
run('all modules disabled', p => { p.modules.forEach(m => m.enabled = false); });
run('discount 100%', p => { p.discountRatePct = 100; });
run('discount -50%', p => { p.discountRatePct = -50; });
run('schedule compression 0.1', p => { p.scheduleCompression = 0.1; });
run('schedule compression 3', p => { p.scheduleCompression = 3; });
run('recovery 2 yrs', p => { p.costRecoveryYears = 2; });
run('recovery 0', p => { p.costRecoveryYears = 0; });
run('ML data + homologation on', p => { p.includeMLDataCost = true; p.includeHomologation = true; });
// MC coverage of ML + homologation
const p2 = defaultSWProgramInputs(); p2.includeMLDataCost = true; p2.includeHomologation = true;
const r2 = computeSWProgram(p2); const r1 = computeSWProgram(defaultSWProgramInputs());
console.log('ML+homol adds to total', Math.round(r2.summary.grandTotal - r1.summary.grandTotal), 'adds to MC P50', Math.round(r2.monteCarlo.p50 - r1.monteCarlo.p50), 'mean', Math.round(r2.monteCarlo.mean - r1.monteCarlo.mean));
// recovery window vs MC per vehicle & sensitivity
const p3 = defaultSWProgramInputs(); p3.costRecoveryYears = 2; const r3 = computeSWProgram(p3);
console.log('recovery=2: headline pv', r3.summary.perVehicle.toFixed(0), 'MC P50 pv', r3.monteCarlo.p50PerVehicle.toFixed(0), 'sens vol low/base/high', r3.sensitivity[5].low.toFixed(0), r3.sensitivity[5].base.toFixed(0), r3.sensitivity[5].high.toFixed(0));
// headline percentile in MC
console.log('headline', Math.round(r1.summary.grandTotal), 'P10', Math.round(r1.monteCarlo.p10), 'P50', Math.round(r1.monteCarlo.p50));
// reuse Platform on ASIL D safety scale
const p4 = defaultSWProgramInputs(); p4.modules.forEach(m => m.reuse = 'Platform'); const r4 = computeSWProgram(p4);
const bms = r4.modules.find(m => m.moduleId==='bms_core')!; console.log('Platform reuse BMS dev', Math.round(bms.development.total), 'safety', Math.round(bms.development.safetyCompliance), 'safety share', (bms.development.safetyCompliance/bms.development.total).toFixed(2));
