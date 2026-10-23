/**
 * The software costing, step by step (Chief Engineer review, Oct 2026: "show which costing we are doing").
 *
 * Builds the seven steps of a software should-cost FROM A COMPUTED RESULT — scope, effort, verification, rate,
 * engineering NRE, lifecycle, per vehicle — each with the figure the engine produced at that point and the vehicle
 * modules it concerns. The screen plays them in order (sw-costing-pipeline.ts) and lights the SUV skeleton. Nothing
 * here prices anything: every £ is read off `result`, every PM is the engine's.
 */

import {
  swModuleDefs, cocomoNominalPM, withDrivetrainArticle, type SWProgramResult, type ASILLevel,
} from './sw-should-cost.js';

export interface SWCostingStep {
  id:      'scope' | 'effort' | 'verification' | 'rate' | 'nre' | 'lifecycle' | 'per-vehicle';
  title:   string;
  /** The headline figure of the step, already formatted by the caller's formatter. */
  value:   string;
  /** One or two lines: how the figure was reached, in the engine's own numbers. */
  detail:  string;
  /** Modules this step concerns — the SUV skeleton lights their components. */
  modules: string[];
}

export interface StepFormat {
  money:  (gbp: number) => string;   // the page currency
  number: (n: number, dp?: number) => string;
}

const ASIL_HIGH: ASILLevel[] = ['C', 'D'];

/** The rate line the screen shows at the "rate" step — supplied by the rate engine (country book). */
export interface StepRate { perPMGBP: number; hubLabel: string; build: string }

export function swCostingSteps(result: SWProgramResult, rate: StepRate, f: StepFormat): SWCostingStep[] {
  const s = result.summary;
  const prog = result.inputs;
  const on = prog.modules.filter(m => m.enabled);
  const ids = result.modules.map(m => m.moduleId);
  const cats = new Set(result.modules.map(m => m.categoryLabel));

  const defs = swModuleDefs(prog);
  const nominal = on.reduce((a, m) => {
    const def = defs.get(m.moduleId);
    if (!def) return a;
    return a + (m.customPersonMonths ?? (m.sizeKSLOC ? cocomoNominalPM(m.sizeKSLOC) : def.basePersonMonths));
  }, 0);
  const verifPM = Math.max(0, s.totalEffortPersonMonths - s.totalPersonMonths);
  const safety = result.modules.filter(m => ASIL_HIGH.includes(m.asilUsed)).map(m => m.moduleId);
  const cyber = result.modules.filter(m => m.calUsed === 'CAL3' || m.calUsed === 'CAL4').map(m => m.moduleId);
  const engineering = s.totalDevelopment + s.totalTesting + s.totalIntegration + s.totalCybersecurity
    + s.totalCalibration + s.totalMLData;
  const lifecycle = s.totalMaintenance + s.totalCloud + s.totalLicensing;
  const recurring = result.modules.filter(m => m.cloudCost + m.licensingCost > 0).map(m => m.moduleId);
  const recovery = Math.max(1, prog.costRecoveryYears ?? prog.programLifeYears);
  const topCat = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])[0];
  const topCatLabel = result.modules.find(m => m.category === topCat?.[0])?.categoryLabel ?? '';

  return [
    { id: 'scope', title: 'Scope', value: `${result.modules.length} modules`,
      detail: `${cats.size} software domains${prog.powertrain ? ` on ${withDrivetrainArticle(prog.powertrain)} vehicle` : ''}; nominal effort `
        + `${f.number(nominal, 0)} person-months (fresh code, QM, medium complexity).`,
      modules: ids },
    { id: 'effort', title: 'Development effort', value: `${f.number(s.totalPersonMonths, 0)} PM`,
      detail: `Reuse, complexity and the ISO 26262 ASIL uplift applied to each module: ${f.number(nominal, 0)} → `
        + `${f.number(s.totalPersonMonths, 0)} PM. ${safety.length} module${safety.length === 1 ? '' : 's'} at ASIL C/D (lit).`,
      modules: safety.length ? safety : ids },
    { id: 'verification', title: 'Verification & integration', value: `+${f.number(verifPM, 0)} PM`,
      detail: `SIL / MIL / HIL testing, integration, ISO/SAE 21434 cybersecurity and calibration: `
        + `${f.number(s.totalEffortPersonMonths, 0)} PM of engineering in all. ${cyber.length} module${cyber.length === 1 ? '' : 's'} at CAL3/4 (lit).`,
      modules: cyber.length ? cyber : ids },
    { id: 'rate', title: 'Engineering rate', value: `${f.money(rate.perPMGBP)} / PM`,
      detail: `${rate.hubLabel}: ${rate.build}`,
      modules: ids },
    { id: 'nre', title: 'Engineering cost (NRE)', value: f.money(s.nreTotal),
      detail: `Effort × rate = ${f.money(engineering)}; tools ${f.money(s.totalToolchain)}`
        + `${s.totalHomologation ? `, homologation ${f.money(s.totalHomologation)}` : ''}. Largest domain: ${topCatLabel} `
        + `${topCat ? f.money(topCat[1]) : ''} (all costs).`,
      modules: result.modules.filter(m => m.category === topCat?.[0]).map(m => m.moduleId) },
    { id: 'lifecycle', title: 'Lifecycle', value: f.money(lifecycle),
      detail: `Maintenance ${f.money(s.totalMaintenance)}, cloud ${f.money(s.totalCloud)}, licences and royalties `
        + `${f.money(s.totalLicensing)} — paid over the ${prog.programLifeYears} production years and the service years after `
        + `the last build (${s.horizonYears ?? prog.programLifeYears} years from SOP).`,
      modules: recurring.length ? recurring : ids },
    { id: 'per-vehicle', title: 'Per vehicle', value: f.money(s.perVehicle),
      detail: `NRE ${f.money(s.nreTotal)} over ${f.number(prog.annualProductionVolume * recovery, 0)} vehicles `
        + `(${recovery}-year recovery) + lifecycle over ${f.number(prog.annualProductionVolume * prog.programLifeYears, 0)} vehicles. `
        + `Programme total ${f.money(s.grandTotal)}.`,
      modules: ids },
  ];
}
