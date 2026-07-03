/**
 * Forging process/technology advisor + DFM rules + secondary-process adders.
 * Deterministic — no AI API required. Reference data is engineering-typical
 * and index-anchored to the 2026-07 rate-library basis; treat cost bands as
 * indicative and override with real quotes via the admin Rate Library.
 */
import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

export type ForgingProcess =
  | 'open-die' | 'closed-die' | 'precision' | 'ring-rolling' | 'cold-forming';

export type ForgingAlloyFamily =
  | 'carbon-steel' | 'alloy-steel' | 'microalloyed-steel' | 'stainless-steel'
  | 'aluminium' | 'titanium' | 'superalloy' | 'copper';

export type ComplexityLevel = 'low' | 'medium' | 'high';
export type ToleranceClass = 'loose' | 'standard' | 'tight';

// ─── Process reference table (engineering-typical) ────────────────────────────

export interface ForgingProcessReference {
  process: ForgingProcess;
  label: string;
  yieldBand: [number, number];        // finished weight / input stock weight
  toolingBand: string;                // £ band for die/tooling NRE
  toleranceMm: string;                // as-forged dimensional capability
  weightRangeKg: [number, number];    // practical forging weight window
  minWebMm: number;                   // minimum reliably-forged web/rib
  draftDegMin: number;                // minimum recommended die draft
  surfaceFinishRaUm: string;          // as-forged surface finish
}

export const FORGING_PROCESS_REFERENCE: Record<ForgingProcess, ForgingProcessReference> = {
  'open-die': {
    process: 'open-die',
    label: 'Open-Die Forging',
    yieldBand: [0.40, 0.70],
    toolingBand: '£1k–£10k (flat/vee dies, manipulators)',
    toleranceMm: '±1.5–6 mm (heavy machining stock)',
    weightRangeKg: [5, 300000],
    minWebMm: 12,
    draftDegMin: 0,
    surfaceFinishRaUm: 'Ra 12.5–50 µm',
  },
  'closed-die': {
    process: 'closed-die',
    label: 'Closed-Die (Impression) Forging',
    yieldBand: [0.55, 0.80],
    toolingBand: '£8k–£120k (impression die sets)',
    toleranceMm: '±0.3–1.5 mm',
    weightRangeKg: [0.1, 350],
    minWebMm: 3.0,
    draftDegMin: 3,
    surfaceFinishRaUm: 'Ra 3.2–12.5 µm',
  },
  precision: {
    process: 'precision',
    label: 'Precision / Near-Net Forging',
    yieldBand: [0.70, 0.92],
    toolingBand: '£25k–£300k (precision + isothermal dies)',
    toleranceMm: '±0.1–0.5 mm',
    weightRangeKg: [0.02, 100],
    minWebMm: 1.5,
    draftDegMin: 0.5,
    surfaceFinishRaUm: 'Ra 1.6–6.3 µm',
  },
  'ring-rolling': {
    process: 'ring-rolling',
    label: 'Seamless Ring Rolling',
    yieldBand: [0.60, 0.85],
    toolingBand: '£5k–£40k (preform + roll tooling)',
    toleranceMm: '±0.5–3 mm (dia-dependent)',
    weightRangeKg: [0.5, 80000],
    minWebMm: 8,
    draftDegMin: 0,
    surfaceFinishRaUm: 'Ra 6.3–25 µm',
  },
  'cold-forming': {
    process: 'cold-forming',
    label: 'Cold Forging / Heading',
    yieldBand: [0.85, 0.98],
    toolingBand: '£10k–£80k (multi-station cold tooling)',
    toleranceMm: '±0.05–0.2 mm',
    weightRangeKg: [0.001, 5],
    minWebMm: 1.0,
    draftDegMin: 0,
    surfaceFinishRaUm: 'Ra 0.4–1.6 µm',
  },
};

// ─── Process advisor ──────────────────────────────────────────────────────────

export interface ForgingAdvisorInputs {
  annualVolume: number;
  partWeightKg: number;
  complexity: ComplexityLevel;
  alloyFamily: ForgingAlloyFamily;
  toleranceClass?: ToleranceClass;
  /** Axisymmetric ring/flange/gear-blank shape — candidate for ring rolling. */
  isRingShape?: boolean;
  /** Safety-critical / fatigue-loaded (aerospace, powertrain) — drives NDT. */
  safetyCritical?: boolean;
}

export interface ForgingProcessRecommendation {
  process: ForgingProcess;
  processLabel: string;
  reference: ForgingProcessReference;
  processRoute: string[];
  reason: string;
  suggestedSecondary: string[];
}

const ALLOY_LABEL: Record<ForgingAlloyFamily, string> = {
  'carbon-steel': 'carbon steel', 'alloy-steel': 'alloy steel',
  'microalloyed-steel': 'microalloyed steel', 'stainless-steel': 'stainless steel',
  aluminium: 'aluminium', titanium: 'titanium',
  superalloy: 'nickel superalloy', copper: 'copper alloy',
};

const HARD_TO_FORGE: ForgingAlloyFamily[] = ['titanium', 'superalloy'];

export function adviseForgingProcess(inputs: ForgingAdvisorInputs): ForgingProcessRecommendation {
  const alloy = ALLOY_LABEL[inputs.alloyFamily];
  const tol = inputs.toleranceClass ?? 'standard';
  const hardToForge = HARD_TO_FORGE.includes(inputs.alloyFamily);

  const build = (
    process: ForgingProcess,
    reason: string,
    route: string[],
    secondary: string[],
  ): ForgingProcessRecommendation => ({
    process,
    processLabel: FORGING_PROCESS_REFERENCE[process].label,
    reference: FORGING_PROCESS_REFERENCE[process],
    processRoute: route,
    reason,
    suggestedSecondary: secondary,
  });

  // 1. Ring/flange/gear-blank geometry → seamless ring rolling.
  if (inputs.isRingShape && inputs.partWeightKg >= 0.5) {
    return build('ring-rolling',
      `axisymmetric ring geometry in ${alloy} — seamless ring rolling gives circumferential grain flow and far better stock utilisation than sawing from plate/bar`,
      ['Billet shear', 'Upset + punch (preform)', 'Ring roll', 'Heat treat', 'Machine'],
      [...(inputs.safetyCritical ? ['UT / MPI NDT'] : []), 'Heat treat']);
  }

  // 2. Titanium / superalloy or tight-tolerance high-value → precision/isothermal.
  if (hardToForge || (tol === 'tight' && inputs.complexity === 'high' && inputs.partWeightKg <= 100)) {
    return build('precision',
      `${hardToForge ? `${alloy} is forged near-net to conserve expensive stock and control grain flow` : `tight-tolerance complex ${alloy}`} — precision/isothermal forging cuts machining and buy-to-fly ratio`,
      ['Preform', 'Isothermal/precision forge', 'Solution + age', ...(inputs.safetyCritical ? ['CT / UT NDT'] : []), 'Finish machine'],
      ['Heat treat', ...(inputs.safetyCritical ? ['CT/UT NDT'] : []), 'Near-net machining']);
  }

  // 3. Small, high-volume, simple → cold forging / heading.
  if (inputs.partWeightKg <= 5 && inputs.annualVolume >= 100000 && inputs.complexity !== 'high'
      && (inputs.alloyFamily === 'carbon-steel' || inputs.alloyFamily === 'alloy-steel' || inputs.alloyFamily === 'aluminium' || inputs.alloyFamily === 'copper')) {
    return build('cold-forming',
      `small ${alloy} part at ${inputs.annualVolume.toLocaleString()}/yr — cold forging gives near-100% material yield, work-hardened strength and a machined-quality finish with no flash`,
      ['Wire/slug cut', 'Multi-station cold form', 'Trim', ...(inputs.alloyFamily === 'aluminium' ? ['Age (T6)'] : ['Optional Q&T'])],
      ['Phosphate/lube prep', 'Optional heat treat']);
  }

  // 4. Very large / one-off / low volume → open-die.
  if (inputs.partWeightKg > 350 || inputs.annualVolume < 200) {
    return build('open-die',
      `${alloy}${inputs.partWeightKg > 350 ? `, large forging (${inputs.partWeightKg} kg)` : ''}${inputs.annualVolume < 200 ? `, low volume (${inputs.annualVolume.toLocaleString()}/yr)` : ''} — open-die needs no impression tooling; shafts, blocks and cylinders finish by heavy machining`,
      ['Ingot/billet heat', 'Open-die forge (draw/upset)', 'Rough machine', 'Heat treat', 'Finish machine'],
      ['Q&T heat treat', ...(inputs.safetyCritical ? ['UT NDT'] : []), 'Stress relieve']);
  }

  // 5. Default: closed-die (impression) forging.
  return build('closed-die',
    `${alloy} at ${inputs.annualVolume.toLocaleString()}/yr — closed-die impression forging is the volume workhorse: net-shape grain flow, good tolerance, lowest piece cost once dies amortise`,
    ['Billet shear + heat', 'Block/finish impressions', 'Flash trim', 'Heat treat', 'Shot blast'],
    ['Flash trim', 'Heat treat', 'Shot blast', ...(inputs.safetyCritical ? ['MPI NDT'] : [])]);
}

// ─── DFM rules (draft / web / fillet / grain flow / near-net) ──────────────────

export interface ForgingDFMInputs {
  process: ForgingProcess;
  minWebThicknessMm: number;
  draftAngleDeg: number;
  /** Smallest corner/fillet radius on the forging in mm. */
  filletRadiusMm?: number;
  /** True if the primary load path follows the forged grain flow (good). */
  grainFlowAligned?: boolean;
  /** Rib height / rib thickness ratio — deep thin ribs are hard to fill. */
  ribHeightToThickness?: number;
  /** Single-side machining stock allowance in mm. */
  machiningStockMm?: number;
  /** Parting line runs through a highly-loaded / sealing surface (bad). */
  partingLineOnCriticalFace?: boolean;
}

export interface ForgingDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface ForgingDFMResult {
  process: ForgingProcess;
  score: number;         // 1–10, 10 = clean
  issues: ForgingDFMIssue[];
  summary: string;
}

export function analyseForgingDFM(inputs: ForgingDFMInputs): ForgingDFMResult {
  const ref = FORGING_PROCESS_REFERENCE[inputs.process];
  const issues: ForgingDFMIssue[] = [];

  // Web/rib below process minimum → non-fill / laps / die overload.
  if (inputs.minWebThicknessMm < ref.minWebMm) {
    issues.push({
      severity: 'critical',
      category: 'geometry',
      title: `Web ${inputs.minWebThicknessMm} mm below ${ref.process} minimum ${ref.minWebMm} mm`,
      description: 'Thin webs cool fast and resist metal flow — incomplete fill, forging laps and excessive die pressure/wear.',
      recommendation: `Thicken the web to ≥ ${ref.minWebMm} mm, or move to a lower-web process (precision ${FORGING_PROCESS_REFERENCE.precision.minWebMm} mm / cold ${FORGING_PROCESS_REFERENCE['cold-forming'].minWebMm} mm).`,
    });
  }

  // Draft below process minimum → part sticks in die / ejection damage.
  if (inputs.draftAngleDeg < ref.draftDegMin) {
    issues.push({
      severity: ref.draftDegMin >= 3 ? 'major' : 'minor',
      category: 'tooling',
      title: `Draft ${inputs.draftAngleDeg}° below recommended ${ref.draftDegMin}°`,
      description: 'Insufficient die draft prevents clean part release — galling, ejection cracks and rapid die wear.',
      recommendation: `Add ≥ ${ref.draftDegMin}° draft on impression walls (deep cavities need 5–7°). Precision/warm forging can run reduced draft with ejectors.`,
    });
  }

  // Sharp fillets → poor metal flow, laps, stress raisers.
  if (inputs.filletRadiusMm !== undefined && inputs.filletRadiusMm < 3
      && inputs.process !== 'cold-forming') {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: `Sharp fillet radius ${inputs.filletRadiusMm} mm`,
      description: 'Small corner/fillet radii choke metal flow into the impression, causing laps/cold shuts and concentrating die stress.',
      recommendation: 'Open fillet radii to ≥ 3–5 mm; generous radii improve die fill and die life and reduce forging load.',
    });
  }

  // Deep thin ribs → non-fill.
  if (inputs.ribHeightToThickness !== undefined && inputs.ribHeightToThickness > 4) {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: `Deep thin rib (height:thickness ≈ ${inputs.ribHeightToThickness.toFixed(1)}:1)`,
      description: 'Tall thin ribs are the hardest features to fill and the first to lap or under-fill.',
      recommendation: 'Reduce rib aspect ratio (<4:1), add draft and radius, or split into a two-blow preform + finish sequence.',
    });
  }

  // Grain flow not aligned with load path → fatigue underperformance.
  if (inputs.grainFlowAligned === false) {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: 'Grain flow not aligned with primary load path',
      description: 'The core advantage of forging is continuous grain flow; cutting across it in a highly-loaded region forfeits fatigue life vs a bar-stock machining.',
      recommendation: 'Reorient the parting line/preform so forged fibre follows the main stress direction; avoid machining through end-grain on loaded faces.',
    });
  }

  // Parting line on a critical face → flash/mismatch on a functional surface.
  if (inputs.partingLineOnCriticalFace) {
    issues.push({
      severity: 'minor',
      category: 'tooling',
      title: 'Parting line on a loaded/sealing face',
      description: 'Flash line and die mismatch land on a functional surface — extra machining and a fatigue/sealing risk.',
      recommendation: 'Move the parting line to a non-critical face, or add clean-up machining stock only where the flash line falls.',
    });
  }

  // Excess machining stock → near-net opportunity.
  if (inputs.machiningStockMm !== undefined && inputs.machiningStockMm > 3
      && inputs.process !== 'open-die') {
    issues.push({
      severity: 'opportunity',
      category: 'process',
      title: `Machining stock ${inputs.machiningStockMm} mm exceeds near-net target`,
      description: 'Excess all-over envelope adds input weight, forging load and machining — swarf worth only scrap value.',
      recommendation: 'Tighten the forging to near-net (precision route) and cut stock toward 1–2 mm on functional faces only.',
    });
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? `No forging DFM issues flagged for ${ref.process}; geometry is within reference guidelines.`
    : `${issues.length} forging DFM issue${issues.length === 1 ? '' : 's'} for ${ref.process} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { process: inputs.process, score, issues, summary };
}

// ─── Secondary-process cost adders (heat-treat / descale / NDT / coining) ──────

export interface ForgingSecondaryInputs {
  alloyFamily: ForgingAlloyFamily;
  partWeightKg: number;
  /** Heat-treat route after forging. */
  heatTreat?: 'none' | 'normalise' | 'quench-temper' | 'anneal' | 'solution-age';
  descale?: boolean;
  shotBlast?: boolean;
  /** Coining / sizing / straightening pass for tight post-forge tolerance. */
  coining?: boolean;
  /** NDT level: none, MPI (magnetic particle), UT (ultrasonic), or CT. */
  ndt?: 'none' | 'mpi' | 'ut' | 'ct';
}

export interface ForgingSecondaryAdder {
  label: string;
  basis: 'per-kg' | 'per-part';
  unitCostGbp: number;      // £/kg or £/part
  costPerPartGbp: number;   // resolved £/part
  note: string;
}

export interface ForgingSecondaryResult {
  adders: ForgingSecondaryAdder[];
  totalPerPartGbp: number;
}

const HEAT_TREAT_COST_PER_KG: Record<'normalise' | 'quench-temper' | 'anneal' | 'solution-age', number> = {
  normalise: 0.30,
  'quench-temper': 0.65,     // Q&T — furnace + quench + temper
  anneal: 0.35,
  'solution-age': 1.20,      // Ti/superalloy/PH — solution + age
};

const NDT_COST_PER_PART: Record<'mpi' | 'ut' | 'ct', number> = {
  mpi: 2.5,             // magnetic particle (ferrous surface)
  ut: 6.0,             // ultrasonic (sub-surface)
  ct: 32.0,            // industrial CT (safety-critical)
};

export function estimateForgingSecondaryAdders(inputs: ForgingSecondaryInputs): ForgingSecondaryResult {
  const adders: ForgingSecondaryAdder[] = [];
  const wt = Math.max(inputs.partWeightKg, 0);

  if (inputs.heatTreat && inputs.heatTreat !== 'none') {
    const unit = HEAT_TREAT_COST_PER_KG[inputs.heatTreat];
    const label = inputs.heatTreat === 'quench-temper' ? 'Q&T'
      : inputs.heatTreat === 'solution-age' ? 'Solution + age'
      : inputs.heatTreat.charAt(0).toUpperCase() + inputs.heatTreat.slice(1);
    adders.push({
      label: `Heat treat (${label})`,
      basis: 'per-kg', unitCostGbp: unit, costPerPartGbp: unit * wt,
      note: inputs.heatTreat === 'quench-temper'
        ? 'Quench + temper to target strength/toughness for alloy-steel forgings.'
        : inputs.heatTreat === 'solution-age' ? 'Solution + age for Ti/superalloy/PH-stainless forgings.'
        : inputs.heatTreat === 'normalise' ? 'Normalise to refine grain and relieve forge stresses.'
        : 'Anneal for machinability / stress relief.',
    });
  }

  if (inputs.descale) {
    adders.push({
      label: 'Descale / pickle',
      basis: 'per-kg', unitCostGbp: 0.12, costPerPartGbp: 0.12 * wt,
      note: 'Remove forge scale before machining/inspection; per kg of forging.',
    });
  }

  if (inputs.shotBlast) {
    adders.push({
      label: 'Shot blast / surface prep',
      basis: 'per-part', unitCostGbp: 0.35, costPerPartGbp: 0.35,
      note: 'Cleans scale and keys the surface for coating/inspection.',
    });
  }

  if (inputs.coining) {
    adders.push({
      label: 'Coining / sizing / straighten',
      basis: 'per-part', unitCostGbp: 0.55, costPerPartGbp: 0.55,
      note: 'Cold restrike to hit tight flatness/thickness tolerance after forging.',
    });
  }

  if (inputs.ndt && inputs.ndt !== 'none') {
    const unit = NDT_COST_PER_PART[inputs.ndt];
    adders.push({
      label: `NDT (${inputs.ndt.toUpperCase()})`,
      basis: 'per-part', unitCostGbp: unit, costPerPartGbp: unit,
      note: inputs.ndt === 'ct' ? 'Industrial CT — full internal 3D defect map for safety-critical forgings.'
        : inputs.ndt === 'ut' ? 'Ultrasonic — sub-surface inclusion/crack screening.'
        : 'Magnetic-particle — surface/near-surface crack detection on ferrous forgings.',
    });
  }

  const totalPerPartGbp = adders.reduce((s, a) => s + a.costPerPartGbp, 0);
  return { adders, totalPerPartGbp };
}
