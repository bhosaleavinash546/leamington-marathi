/**
 * Worked gear examples — what the model says, in full, on paper.
 *
 * The same job `scripts/worked-examples.ts` does for casting and moulding: run a
 * realistic part end to end and print every intermediate, so a cost engineer can
 * argue with the arithmetic rather than with the total.
 *
 *   npx tsx scripts/gear-worked-example.ts
 */
import { analyseGear, computeGearDrivers, type GearInputs } from '../src/engine/modules/gear.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const money = (n: number) => `£${n.toFixed(3)}`;

function run(title: string, g: GearInputs): void {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
  const a = analyseGear(g);
  if (a.blocked) { console.log(`BLOCKED: ${a.blocked}`); return; }

  console.log(`gear      module ${g.normalModuleMm} × ${g.teeth}z × ${g.helixAngleDeg}° helix × `
    + `${g.faceWidthMm} mm face, ${g.internal ? 'INTERNAL' : 'external'}, ISO class ${g.qualityClass}`);
  console.log(`geometry  pitch Ø${a.pitchDiameterMm.toFixed(1)} mm, OD Ø${a.outerDiameterMm.toFixed(1)} mm, `
    + `${(a.metalRemovedMm3 / 1000).toFixed(1)} cm³ of metal to remove`);
  console.log(`route     ${a.route.steps.map(s => s.process).join(' → ')}`);
  console.log('');
  for (const s of a.route.steps) console.log(`  · ${s.label}\n      ${s.reason}`);
  console.log('\noperations');
  for (const o of a.operations) {
    const where = o.machineId === 'furnace-subcontract' ? 'sub-contract furnace (by weight)' : o.machineId;
    console.log(`  ${o.label.padEnd(34)} ${o.cycleSec.toFixed(1).padStart(7)} s   ${where}`);
    console.log(`      ${o.basis}`);
  }
  console.log(`\n  total cycle ${a.totalCycleSec.toFixed(1)} s  (${(a.totalCycleSec / 60).toFixed(2)} min)`);
  console.log(`  perishable tooling ${money(a.toolingCostPerPart)}/part`
    + `   heat treat ${money(a.heatTreatCostPerPart)}/part`);

  const d = computeGearDrivers(g);
  const stack: UniversalStackInput = {
    partName: title, rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
    packagingPerPart: 0.10, logisticsPerPart: 0.12,
    // FRACTIONS, not percentages — computeUniversalStack multiplies these directly.
    // Passing 12/8 gave a £1,241 gear, which is how this comment came to exist.
    overheadPct: 0.12, marginPct: 0.08,
    annualVolume: g.annualVolume,
  };
  const r = computeUniversalStack(stack, DEFAULT_RATE_LIBRARY);
  console.log('\n8-bucket breakdown');
  for (const [k, v] of Object.entries(r.breakdown)) {
    console.log(`  ${k.padEnd(14)} ${money(v as number).padStart(9)}  ${((v as number) / r.total * 100).toFixed(1)}%`);
  }
  console.log(`  ${'TOTAL'.padEnd(14)} ${money(r.total).padStart(9)}`);
  for (const w of a.warnings) console.log(`\n  ! ${w}`);
  if (a.dataWarning) console.log(`\n  DATA: ${a.dataWarning}`);
}

const base: GearInputs = {
  normalModuleMm: 2.5, teeth: 38, helixAngleDeg: 25, faceWidthMm: 22,
  internal: false, qualityClass: 6, materialClass: 'case_hardening_steel',
  caseHardened: true, blankCostPerPart: 3.20, netWeightKg: 0.65,
  materialId: 'mat-steel-20mncr5',
  annualVolume: 200_000, amortizationVolume: 200_000, batchSize: 500,
  setupTimeHrPerOperation: 1.5,
};

run('A — automotive transmission gear, external helical, ground (ISO 6)', base);
run('B — same gear at ISO 9, as-cut, unhardened',
  { ...base, qualityClass: 9, caseHardened: false });
run('C — internal ring gear, same programme',
  { ...base, internal: true, teeth: 78, helixAngleDeg: 0, qualityClass: 7 });
