/**
 * Polymer extrusion cost inputs, derived from the measured profile.
 *
 * Built in the extrusion build (Oct 2026). Before it, an extruded part could
 * not be costed from CAD at all: there were no rules, the CAD fill set only a
 * length (the longest box side), a kg/m (net weight ÷ that length) and the
 * ray-cast wall, and the screen's own defaults did the rest. Headless had no
 * mapping.
 *
 * What a constant-section part tells us, measured:
 *
 *   length      = the long axis (the profile test: L ≥ 8 × the next dimension,
 *                 volume = section silhouette × length to ±10%)
 *   section     = volume ÷ length — exact for a constant section
 *   kg/m        = section × the grade's density
 *   wall        = 2·V/S (the mean wall of a thin section)
 *   perimeter   = (S − 2 × section) ÷ length — the section's outline, inner
 *                 and outer, which sets how intricate the die is
 *
 * and from them the process (round hollow → tube or pipe; anything else → a
 * profile, a complex one when its outline is long for its area), the line,
 * its screw, the cooling-limited line rate, the die and the scrap.
 *
 * Aluminium extrusion is NOT here: the library has no extrusion press, billet
 * heater, stretcher or ageing oven. A metal grade answered into this route is
 * refused with that reason rather than priced on a polymer line.
 */
import {
  extrusionFamilyOf, estimateExtrusionLineRate, estimateExtrusionDieCost, estimateExtrusionSpecificEnergy,
  type ExtrusionProcess, type ExtrusionCooling, type DieComplexity,
} from '../../modules/extrusion-advisor.js';
import { DEFAULT_RATE_LIBRARY } from '../../rate-library.js';
import { ukElectricityPerKwh } from '../../uk-tariff.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import { resinFacts, type ResinFacts } from '../derive/resin.js';
import { extrusionProfile } from '../derive/profile.js';

/** The line for each process, and the screw it runs (the library's lines). */
export const EXTRUSION_LINES: Record<string, { machineId: string; screwMm: number; cooling: ExtrusionCooling; label: string }> = {
  'tube-medical': { machineId: 'extruder-micro-tube', screwMm: 45, cooling: 'water-bath', label: 'precision small-tube line (45 mm screw)' },
  pipe: { machineId: 'extruder-pipe-line', screwMm: 90, cooling: 'vacuum-tank', label: '90 mm pipe line, vacuum sizing' },
  profile: { machineId: 'extruder-profile-line', screwMm: 75, cooling: 'vacuum-tank', label: '75 mm profile line, vacuum calibration' },
  'profile-complex': { machineId: 'extruder-profile-line', screwMm: 75, cooling: 'vacuum-tank', label: '75 mm profile line, vacuum calibration' },
};
/** Start-up: the line runs this long at its rated output before the section is to size and gauge, hr. */
export const STARTUP_HR = 0.25;
/** A run lasts at least a shift. */
const MIN_RUN_HR = 8;
/** Running scrap: sampling, gauge drift, saw ends. */
export const STEADY_SCRAP = 0.02;
/** At most one run a month. */
const MAX_RUNS_PER_YEAR = 12;
/** Tubes at or under this OD go on the small-tube line. */
const SMALL_TUBE_OD_MM = 16;

const METAL = /aluminium|alloy|steel|iron|copper|brass|titanium|magnesium|zinc/i;

interface ExtAdvice {
  resin: ResinFacts;
  family: ReturnType<typeof extrusionFamilyOf>;
  lengthMm: number;
  sectionMm2: number;
  kgPerM: number;
  partKg: number;
  wallMm: number;
  perimMm: number;
  odMm: number;
  process: ExtrusionProcess;
  processBasis: string;
  complexity: DieComplexity;
  line: (typeof EXTRUSION_LINES)[string];
  rate: ReturnType<typeof estimateExtrusionLineRate>;
  startupScrap: number;
  startupBasis: string;
  die: ReturnType<typeof estimateExtrusionDieCost>;
  dieSizeMm: number;
}

function notAProfile(): RuleOutcome<never> {
  return ask({
    id: 'extrusion.notProfile', kind: 'commodity',
    question: 'This part does not have a constant section — is it really extruded?',
    why: 'An extrusion is one section pushed out and cut to length: the part is at least 8 times '
      + 'longer than it is wide, and its volume equals that section times its length. The '
      + 'kernel measured neither, so the section, the kg/m and the die cannot be derived.',
    options: [
      { value: 'injection_moulding', label: 'Re-route to injection moulding' },
      { value: 'machining', label: 'Re-route to machining' },
    ],
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  });
}

function metalRefused(grade: string): RuleOutcome<never> {
  return ask({
    id: 'extrusion.metal', kind: 'commodity',
    question: `${grade} is a metal — aluminium extrusion is not modelled here`,
    why: 'This route prices POLYMER extrusion lines (screw, die, calibration, haul-off). The rate '
      + 'library has no aluminium extrusion press, billet heater, stretcher or ageing oven, so a '
      + 'metal profile cannot be priced as extruded without inventing those rates. Cost it as '
      + 'bought-in bar machined to shape, or add the press line to the library first.',
    options: [{ value: 'machining', label: 'Re-route to machining' }],
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  });
}

function advise(ctx: RuleContext): { advice: ExtAdvice } | { blocked: RuleOutcome<never> } {
  const prof = extrusionProfile(ctx);
  const v = ctx.geo.volume?.mm3 ?? 0;
  const s = ctx.geo.surfaceArea?.mm2 ?? 0;
  if (!prof || !v || !s) return { blocked: notAProfile() };

  const resin = resinFacts(ctx);
  if (resin.decision) return { blocked: ask(resin.decision) };
  const mat = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === resin.materialId);
  if (mat && METAL.test(`${mat.category} ${mat.grade}`) && !/polymer|plastic/i.test(mat.category)) {
    return { blocked: metalRefused(mat.grade) };
  }

  const lengthMm = prof.lengthMm;
  const sectionMm2 = v / lengthMm;
  const kgPerM = Math.round(sectionMm2 * 1e-6 * resin.densityKgPerM3! * 10_000) / 10_000;
  const partKg = resin.massKg!;
  const wallMm = Math.round(2 * v / s * 100) / 100;
  const perimMm = (s - 2 * sectionMm2) / lengthMm;
  const bb = ctx.geo.boundingBox!;
  const cross = [bb.xMm, bb.yMm, bb.zMm].sort((a, b) => b - a).slice(1);
  const odMm = cross[0];

  // Round and hollow: the two cross dimensions agree, and the section is far
  // less than the disc it sits in.
  const round = Math.abs(cross[0] - cross[1]) <= 0.05 * cross[0];
  const disc = Math.PI / 4 * cross[0] * cross[1];
  const hollowRound = round && sectionMm2 < 0.7 * disc;
  // How intricate the outline is for its area: a plain round tube is ~4 by
  // this measure (the perimeter of both walls against a thin ring), a solid
  // bar ~1, a multi-chamber profile well above.
  const intricacy = perimMm * wallMm / (2 * sectionMm2);
  let process: ExtrusionProcess;
  let processBasis: string;
  if (hollowRound) {
    process = odMm <= SMALL_TUBE_OD_MM ? 'tube-medical' : 'pipe';
    processBasis = `round hollow section Ø${fmt(odMm, 1)} mm, ${fmt(wallMm, 2)} mm wall — `
      + (process === 'pipe' ? 'a pipe' : `a small tube (≤ Ø${SMALL_TUBE_OD_MM} mm) on the precision tube line`);
  } else {
    const complex = perimMm > 6 * Math.sqrt(sectionMm2) || intricacy > 1.3;
    process = complex ? 'profile-complex' : 'profile';
    processBasis = `${fmt(cross[0], 0)} × ${fmt(cross[1], 0)} mm section, ${fmt(sectionMm2, 0)} mm², `
      + `${fmt(perimMm, 0)} mm of outline — ` + (complex ? 'a hollow or intricate profile' : 'a simple profile');
  }
  const complexity: DieComplexity = process === 'profile-complex' ? 'complex'
    : process === 'profile' ? 'moderate' : 'simple';

  const line = EXTRUSION_LINES[process];
  const family = extrusionFamilyOf(resin.grade ?? resin.materialId ?? '');
  const rate = estimateExtrusionLineRate({
    screwDiameterMm: line.screwMm, family, screwType: 'single',
    wallThicknessMm: wallMm, profileKgPerM: kgPerM, cooling: line.cooling,
  });

  // Start-up purge per run — a quarter-hour of the screw's rated output while
  // the section comes to size — spread over the run. Runs are monthly, but
  // never shorter than a shift: a small tube's month is under two hours.
  const annualKg = ctx.annualVolume * partKg;
  const runs = Math.max(1, Math.min(MAX_RUNS_PER_YEAR, Math.floor(annualKg / rate.lineRateKgHr / MIN_RUN_HR)));
  const runKg = Math.max(1, annualKg / runs);
  const purgeKg = rate.outputLimitedKgHr * STARTUP_HR;
  const startupScrap = Math.round(Math.min(0.3, purgeKg / runKg) * 10_000) / 10_000;
  const startupBasis = `${fmt(purgeKg, 0)} kg purge and size-up (${STARTUP_HR} h at the screw's ${rate.outputLimitedKgHr} kg/h) `
    + `÷ ${fmt(runKg, 0)} kg a run (${runs} run${runs === 1 ? '' : 's'} a year, each at least a shift)`;

  const dieSizeMm = Math.round(cross[0]);
  const die = estimateExtrusionDieCost({ process, sizeMm: dieSizeMm, layers: 1, complexity });

  return {
    advice: {
      resin, family, lengthMm, sectionMm2, kgPerM, partKg, wallMm, perimMm, odMm,
      process, processBasis, complexity, line, rate, startupScrap, startupBasis, die, dieSizeMm,
    },
  };
}

type Src = 'geometry' | 'rule' | 'library' | 'advisor' | 'engineer';
function fromAdvice<T extends string | number | boolean>(
  id: string, fieldId: string | undefined, label: string,
  pick: (a: ExtAdvice, ctx: RuleContext) => { value: T; source: Src; basis: string; confidence: number },
) {
  return {
    id, path: id, ...(fieldId ? { fieldId } : {}), label,
    evaluate: (ctx: RuleContext) => {
      const r = advise(ctx);
      if ('blocked' in r) return r.blocked;
      const v = pick(r.advice, ctx);
      return decided(id, v.value, v.source, v.basis, v.confidence);
    },
  };
}

export const EXTRUSION_RULES: CommodityRuleSpec = {
  commodity: 'extrusion',
  header: 'EXTRUSION COST INPUT RULES:',
  rules: [
    fromAdvice('extrusion.materialId', 'ext-mat', 'materialId', a => ({
      value: a.resin.materialId!, source: 'engineer', basis: a.resin.basis, confidence: 1 })),
    fromAdvice('extrusion.partWeightKg', undefined, 'partWeightKg', a => ({
      value: a.partKg, source: 'geometry', basis: a.resin.basis, confidence: 0.95 })),
    fromAdvice('extrusion.process', 'ext-process', 'process', a => ({
      value: a.process, source: 'geometry', basis: a.processBasis, confidence: 0.75 })),
    fromAdvice('extrusion.partLengthM', 'ext-length', 'partLengthM', a => ({
      value: Math.round(a.lengthMm) / 1000, source: 'geometry', confidence: 0.95,
      basis: `${fmt(a.lengthMm, 0)} mm cut length — the long axis of a constant section` })),
    fromAdvice('extrusion.profileWeightKgPerM', 'ext-kg-per-m', 'profileWeightKgPerM', a => ({
      value: a.kgPerM, source: 'geometry', confidence: 0.9,
      basis: `${fmt(a.sectionMm2, 1)} mm² section (volume ÷ length) × ${a.resin.densityKgPerM3} kg/m³` })),
    fromAdvice('extrusion.wallThicknessMm', 'ext-wall', 'wallThicknessMm', a => ({
      value: a.wallMm, source: 'geometry', confidence: 0.85,
      basis: `2·V/S, the mean wall of the section (${fmt(a.perimMm, 0)} mm of outline)` })),
    fromAdvice('extrusion.machineId', 'ext-mach', 'machineId', a => ({
      value: a.line.machineId, source: 'rule', confidence: 0.75, basis: a.line.label })),
    fromAdvice('extrusion.screwDiameterMm', 'ext-screw', 'screwDiameterMm', a => ({
      value: a.line.screwMm, source: 'rule', confidence: 0.7, basis: a.line.label })),
    fromAdvice('extrusion.cooling', 'ext-cooling', 'cooling', a => ({
      value: a.line.cooling, source: 'rule', confidence: 0.7,
      basis: a.line.cooling === 'vacuum-tank' ? 'vacuum sizing / calibration holds the section while it cools' : 'water bath after the sizing die' })),
    // The line rate itself, on both paths (the screen used to fall back to a
    // 90 mm screw when none was set, the module to a 75 mm one).
    fromAdvice('extrusion.lineRateKgPerHr', 'ext-rate', 'lineRateKgPerHr', a => ({
      value: a.rate.lineRateKgHr, source: 'advisor', confidence: 0.65,
      basis: `the lesser of the screw's ${a.rate.outputLimitedKgHr} kg/h and the cooling-limited `
        + `${a.rate.coolingLimitedKgHr ?? '—'} kg/h (${a.rate.lineSpeedMPerMin ?? '—'} m/min at ${fmt(a.wallMm, 2)} mm wall) — `
        + `limited by ${a.rate.limitedBy === 'cooling' ? 'cooling' : 'the screw'}` })),
    fromAdvice('extrusion.startupScrapFraction', 'ext-scrap', 'startupScrapFraction', a => ({
      value: a.startupScrap, source: 'rule', confidence: 0.55, basis: a.startupBasis })),
    fromAdvice('extrusion.steadyScrapFraction', 'ext-steady-scrap', 'steadyScrapFraction', () => ({
      value: STEADY_SCRAP, source: 'rule', confidence: 0.55, basis: 'sampling, gauge drift and saw ends: 2%' })),
    fromAdvice('extrusion.colourChangesPerDay', 'ext-colour-chg', 'colourChangesPerDay', () => ({
      value: 0, source: 'rule', confidence: 0.5, basis: 'the run is one colour — the change-over purge is the start-up scrap' })),
    fromAdvice('extrusion.dieChangesPerDay', 'ext-die-chg', 'dieChangesPerDay', () => ({
      value: 0, source: 'rule', confidence: 0.5, basis: 'one die change a run — inside the start-up scrap' })),
    fromAdvice('extrusion.dieSizeMm', 'ext-die-size', 'dieSizeMm', a => ({
      value: a.dieSizeMm, source: 'geometry', confidence: 0.8, basis: 'the larger section dimension' })),
    fromAdvice('extrusion.dieLayers', 'ext-die-layers', 'dieLayers', () => ({
      value: 1, source: 'rule', confidence: 0.6, basis: 'mono-layer — a co-ex layer is a specification, not a shape' })),
    fromAdvice('extrusion.dieComplexity', 'ext-die-cx', 'dieComplexity', a => ({
      value: a.complexity, source: 'rule', confidence: 0.6, basis: a.processBasis })),
    fromAdvice('extrusion.dieCostGBP', 'ext-die-cost', 'dieCostGBP', a => ({
      value: a.die.total, source: 'advisor', confidence: 0.6,
      basis: `${a.process} die £${a.die.die.toLocaleString('en-GB')} + calibration £${a.die.calibration.toLocaleString('en-GB')} `
        + `at ${a.dieSizeMm} mm, ${a.complexity}` })),
    fromAdvice('extrusion.energyPricePerKwh', 'ext-kwh', 'energyPricePerKwh', () => ({
      value: Math.round(ukElectricityPerKwh() * 10_000) / 10_000, source: 'library', confidence: 0.8, basis: 'UK industrial electricity tariff' })),
    fromAdvice('extrusion.specificEnergyKwhPerKg', undefined, 'specificEnergyKwhPerKg', a => ({
      value: estimateExtrusionSpecificEnergy(a.family, 'single'), source: 'advisor', confidence: 0.7,
      basis: `melt + drive + chilling for ${a.family} (the module derives it)` })),
    fromAdvice('extrusion.labourId', 'ext-lab', 'labourId', () => ({
      value: 'lab-uk-semiskilled', source: 'library', confidence: 0.7, basis: 'extrusion line operator' })),
    fromAdvice('extrusion.manning', 'ext-manning', 'manning', () => ({
      value: 0.5, source: 'rule', confidence: 0.55, basis: 'one operator across two running lines (in-line saw and stacker)' })),
    fromAdvice('extrusion.oee', 'ext-oee', 'oee', () => ({
      value: 0.80, source: 'rule', confidence: 0.6, basis: 'shop OEE, as every route' })),
    fromAdvice('extrusion.labourEfficiency', 'ext-lab-eff', 'labourEfficiency', () => ({
      value: 0.92, source: 'rule', confidence: 0.6, basis: 'shop labour efficiency, as every route' })),
    fromAdvice('extrusion.leakTest', 'ext-leak', 'leakTest', () => ({
      value: false, source: 'rule', confidence: 0.4,
      basis: 'not assumed — a fluid line\'s pressure test is a specification; tick it if the drawing calls one' })),
  ],
};
