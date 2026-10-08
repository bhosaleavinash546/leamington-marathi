import { computeSWProgram, defaultSWProgramInputs, SW_MODULES } from '../../src/engine/sw-should-cost.js';
// Copied from src/ui/panels/sw-should-cost-ui.ts:1269 / 1375 / 1385 (the UI's own powertrain presets)
const MHEV_DISABLED = ['bms_core','cell_balancing','soc_soh_soe','fast_charge','edu_control','inverter_ctrl','motor_ctrl'];
const ICE_OFF = ['bms_core','cell_balancing','soc_soh_soe','thermal_mgmt','fast_charge','edu_control','inverter_ctrl','motor_ctrl','regen_braking'];
const DTS: Record<string, { dis: string[]; ov: Record<string, any> }> = {
  ICE: { dis: ICE_OFF, ov: {} }, MHEV: { dis: MHEV_DISABLED, ov: {} },
  PHEV: { dis: [], ov: { bms_core: { complexity: 'High' }, soc_soh_soe: { complexity: 'High' }, edu_control: { complexity: 'High' }, fast_charge: { complexity: 'Medium' } } },
  BEV: { dis: [], ov: { fast_charge: { complexity: 'Very High' } } },
};
const rows: any[] = [];
for (const [k, dt] of Object.entries(DTS)) {
  const b = defaultSWProgramInputs();
  const p = { ...b, region: 'UK' as const, devSource: 'Tier1_Supplier' as const, programLifeYears: 8, annualProductionVolume: 75000, overheadMultiplier: 1.55, teamSeniorFraction: 0.55,
    modules: b.modules.map(m => ({ ...m, enabled: !dt.dis.includes(m.moduleId), reuse: 'Medium' as const, ...(dt.ov[m.moduleId] ?? {}) })) };
  const r = computeSWProgram(p);
  const catA = r.summary.byCategory.A;
  rows.push({ pt: k, modules: r.modules.length, total_M: (r.summary.grandTotal/1e6).toFixed(1), catA_M: (catA/1e6).toFixed(1), shared_M: ((r.summary.grandTotal-catA)/1e6).toFixed(1), perVehicle: r.summary.perVehicle.toFixed(0),
    powertrainModules: r.modules.filter(m => m.category==='A').map(m => m.moduleId).join(',') || '(none)' });
}
console.table(rows);
// default overhead vs preset overhead
const d = defaultSWProgramInputs(); const r115 = computeSWProgram(d).summary.grandTotal; d.overheadMultiplier = 1.55; const r155 = computeSWProgram(d).summary.grandTotal;
console.log('overhead 1.15 → 1.55 raises total by', ((r155/r115-1)*100).toFixed(1)+'%');
// any ICE-specific module?
console.log('ICE engine/transmission/emissions modules in DB:', SW_MODULES.filter(m => /engine|combust|emission|transmission|gearbox|aftertreat|injection|start.?stop|hybrid|energy.?manag|torque/i.test(m.id + ' ' + m.name + ' ' + m.description)).map(m => m.id + ': ' + m.name));
