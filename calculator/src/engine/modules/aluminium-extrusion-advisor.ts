/**
 * Aluminium extrusion — the process plan (built Oct 2026).
 *
 * Given a section (area, perimeter, circumscribing circle, voids, thinnest
 * wall), a cut length, an alloy and a volume, this decides what an extrusion
 * planner decides, in the order a planner decides it:
 *
 *   1. route      direct (the default), indirect (2xxx / 7xxx, seamless tube),
 *                 hydrostatic, Conform (continuous, from rod) or impact (cups)
 *   2. die type   solid / semi-hollow / porthole / bridge / seamless / multi-port
 *   3. press      the smallest that takes the circumscribing circle, keeps the
 *                 extrusion ratio inside the alloy's window, and has the force
 *                 for an economic billet: breakthrough pressure = Johnson's
 *                 σ·(a + b·ln R) (× weld chambers on a hollow) + container
 *                 friction 4·m·(σ/√3)·L/D on a direct press — so the force
 *                 sets the longest billet the press can push
 *   4. holes      more die openings when a single one would over-reduce
 *   5. speed      the alloy's exit speed, slowed for hollows, thin walls,
 *                 intricate sections, and capped by the ram
 *   6. billet     cut to give whole mill lengths of whole parts on the run-out,
 *                 no longer than the press force allows
 *   7. cycle      dead cycle + push time
 *   8. yield      butt, strand ends, mill-length trims, saw kerf
 *   9. die        cost by type and circle, life in tonnes, nitriding
 *
 * Every constant is in al-extrusion-data.ts with its basis. Nothing here sets a
 * price: it decides quantities the cost module multiplies by library rates.
 */
import {
  AL_ALLOYS, AL_PRESSES, AL_CONFORM, AL_IMPACT, AL_DIES, AL_DIE_NITRIDE, AL_LINE,
  type AlAlloy, type AlExtrusionRoute, type AlDieType, type AlPress,
} from '../al-extrusion-data.js';

export interface AlSection {
  areaMm2: number;
  perimeterMm: number;
  ccdMm: number;
  voids: number;
  minWallMm: number;
  partLengthMm: number;
  /** Largest tongue ratio of the outline (space ÷ gap²); ≥ 3 means a semi-hollow die. */
  tongueRatio?: number;
}

export interface AlPlanInput extends AlSection {
  alloy: AlAlloy;
  annualVolume: number;
  route?: AlExtrusionRoute;
  dieType?: AlDieType;
}

export interface AlPressPlan {
  route: AlExtrusionRoute;
  dieType: AlDieType;
  pressId: string;
  pressLabel: string;
  containerMm: number;
  holes: number;
  ratio: number;
  pressureMPa: number;
  forceT: number;
  forceUsePct: number;
  exitSpeedMPerMin: number;
  speedBasis: string;
  billetMm: number;
  billetKg: number;
  /** The longest billet the press force allows on this section (direct press), mm. */
  forceLimitedBilletMm: number | null;
  strandM: number;
  /** Mill lengths a strand is cut into, their length, and parts in each. */
  millLengthsPerStrand: number;
  millLengthMm: number;
  partsPerMillLength: number;
  partsPerStrand: number;
  partsPerPush: number;
  deadCycleSec: number;
  pushSec: number;
  cycleSecPerPush: number;
  billetKgPerPart: number;
  extrudedKgPerPart: number;
  recovery: number;
  buttKg: number;
  runsPerYear: number;
  dieCostGbp: number;
  dieLifeKg: number;
  dieBasis: string;
  crew: number;
  warnings: string[];
  basis: string[];
}

const G = 9806.65;   // N per tonne-force

/** Holes a die of this circle can carry in this container. */
function maxHoles(ccd: number, containerMm: number, dieType: AlDieType): number {
  if (dieType === 'seamless-mandrel') return 1;
  const usable = 0.80 * containerMm;
  const pitch = ccd + 15;
  const n = pitch >= usable ? 1 : Math.floor(0.70 * (usable / pitch) ** 2);
  const cap = dieType === 'solid' ? 8 : dieType === 'multi-port' ? 2 : 4;
  return Math.max(1, Math.min(cap, n));
}

export function chooseDieType(s: AlSection, _alloy: AlAlloy, route: AlExtrusionRoute): { type: AlDieType; basis: string } {
  if (s.voids === 0 && (s.tongueRatio ?? 0) >= AL_LINE.semiHollowTongueRatio) {
    return { type: 'semi-hollow', basis: `no enclosed void, but a ${s.tongueRatio!.toFixed(1)}:1 tongue (space ÷ gap², ≥ ${AL_LINE.semiHollowTongueRatio}:1) — a semi-hollow die` };
  }
  if (s.voids === 0) return { type: 'solid', basis: `no enclosed void${s.tongueRatio ? `, tongue ${s.tongueRatio.toFixed(1)}:1` : ''} — a solid (flat) die` };
  if (s.voids >= 6 && s.minWallMm < 0.8) return { type: 'multi-port', basis: `${s.voids} voids at a ${s.minWallMm.toFixed(2)} mm wall — a micro multi-port die` };
  if (route === 'indirect' && s.voids === 1) return { type: 'seamless-mandrel', basis: 'one void on an indirect press — seamless, pierced over a mandrel (no weld seams for a high-strength alloy)' };
  if (s.ccdMm > 250) return { type: 'hollow-bridge', basis: `${s.voids}-void hollow on a ${s.ccdMm.toFixed(0)} mm circle — a bridge die` };
  return { type: 'hollow-porthole', basis: `${s.voids}-void hollow — a porthole (spider) die; the metal splits and re-welds` };
}

export function chooseRoute(alloy: AlAlloy, _s?: AlSection): { route: AlExtrusionRoute; basis: string } {
  const a = AL_ALLOYS[alloy];
  if (a.prefersIndirect) return { route: 'indirect', basis: `${a.label} — extruded indirect: no container friction, even properties, seamless hollows` };
  return { route: 'direct', basis: 'direct (forward) extrusion — the mainstream route for this alloy' };
}

/** Exit speed, m/min, and why. */
export function exitSpeed(alloy: AlAlloy, s: AlSection, dieType: AlDieType, press: Pick<AlPress, 'maxRamMmPerSec' | 'route'>, ratio: number):
  { v: number; basis: string } {
  const a = AL_ALLOYS[alloy];
  let v = a.baseExitSpeedMPerMin;
  const f: string[] = [`${a.baseExitSpeedMPerMin} m/min for ${alloy}`];
  if (press.route === 'indirect') { v *= 1.5; f.push('×1.5 indirect (no friction heat)'); }
  if (press.route === 'hydrostatic') { v *= 1.3; f.push('×1.3 hydrostatic'); }
  if (dieType === 'hollow-porthole' || dieType === 'hollow-bridge') { v *= 0.75; f.push('×0.75 hollow (weld chambers)'); }
  if (dieType === 'semi-hollow') { v *= 0.85; f.push('×0.85 semi-hollow (tongue)'); }
  if (dieType === 'multi-port') { v *= 0.5; f.push('×0.5 multi-port'); }
  if (s.minWallMm < 1.0) { v *= 0.55; f.push('×0.55 wall under 1 mm'); }
  else if (s.minWallMm < 1.5) { v *= 0.75; f.push('×0.75 wall under 1.5 mm'); }
  // Intricacy: the outline against a thin ring of the same area (fins, tongues).
  const intricacy = s.perimeterMm * Math.max(0.5, s.minWallMm) / (2 * s.areaMm2);
  if (intricacy > 1.3) { v *= 0.8; f.push('×0.8 intricate outline (fins / tongues)'); }
  const ramCap = press.maxRamMmPerSec * ratio * 60 / 1000;
  if (ramCap < v) { v = ramCap; f.push(`capped at ${ramCap.toFixed(1)} m/min by the ${press.maxRamMmPerSec} mm/s ram × R ${ratio.toFixed(0)}`); }
  v = Math.min(v, 100);
  return { v: Math.round(v * 10) / 10, basis: f.join(', ') };
}

export function dieCost(type: AlDieType, ccdMm: number, holes: number, s: AlSection): { gbp: number; lifeKg: number; basis: string } {
  const d = AL_DIES[type];
  let gbp = (d.baseGbp + d.perMmGbp * ccdMm) * (1 + 0.45 * (holes - 1));
  const notes = [`£${d.baseGbp} + £${d.perMmGbp}/mm × ${ccdMm.toFixed(0)} mm circle`];
  if (holes > 1) notes.push(`× ${(1 + 0.45 * (holes - 1)).toFixed(2)} for ${holes} openings`);
  if (s.voids > 2) { gbp *= 1.3; notes.push('×1.3 multi-void'); }
  const intricacy = s.perimeterMm * Math.max(0.5, s.minWallMm) / (2 * s.areaMm2);
  if (intricacy > 1.3) { gbp *= 1.3; notes.push('×1.3 intricate outline'); }
  return { gbp: Math.round(gbp), lifeKg: d.lifeT * 1000, basis: `${d.label}: ${notes.join(' ')}; life ${d.lifeT} t (H13 30–80 t published), nitrided every ${AL_DIE_NITRIDE.everyT} t` };
}

/** The full press plan for a profile. */
export function planAlExtrusion(inp: AlPlanInput): AlPressPlan {
  const a = AL_ALLOYS[inp.alloy];
  const warnings: string[] = [];
  const basis: string[] = [];
  const routeChoice = inp.route ? { route: inp.route, basis: 'route set' } : chooseRoute(inp.alloy, inp);
  const route = routeChoice.route === 'conform' || routeChoice.route === 'impact' ? 'direct' : routeChoice.route;
  basis.push(routeChoice.basis);
  const dt = inp.dieType ? { type: inp.dieType, basis: 'die type set' } : chooseDieType(inp, inp.alloy, route);
  basis.push(dt.basis);
  const hollow = dt.type !== 'solid' && dt.type !== 'semi-hollow';
  const rho = a.densityKgPerM3;

  const candidates = AL_PRESSES.filter(p => p.route === route);
  const weld = hollow ? AL_LINE.weldChamberFactor : 1;
  const k = a.flowStressMPa / Math.sqrt(3);                 // shear flow stress
  // Breakthrough pressure on a billet of length L in container D.
  const pDef = (ratio: number) => a.flowStressMPa * (AL_LINE.johnsonA + AL_LINE.johnsonB * Math.log(Math.max(1.5, ratio))) * weld;
  const pFricPerMm = (D: number) => route === 'direct' ? 4 * AL_LINE.containerFrictionM * k / D : 0;
  type Pick = { press: AlPress; holes: number; ratio: number; pd: number; lForce: number };
  let chosen: Pick | null = null;
  for (const press of candidates) {
    const ccdLimit = hollow ? press.maxCcdHollowMm : press.maxCcdSolidMm;
    if (inp.ccdMm > ccdLimit) continue;
    const ac = Math.PI / 4 * press.containerMm ** 2;
    const nMax = maxHoles(inp.ccdMm, press.containerMm, dt.type);
    let holes = 1;
    let ratio = ac / inp.areaMm2;
    // More openings while one would over-reduce (beyond the alloy's window, or
    // above ~60 where speed and pressure suffer) — and the circle allows.
    while (holes < nMax && (ratio > a.maxRatio || ratio > 60) && ac / ((holes + 1) * inp.areaMm2) >= Math.max(AL_LINE.minRatio, 15)) {
      holes += 1; ratio = ac / (holes * inp.areaMm2);
    }
    if (ratio < AL_LINE.minRatio) continue;           // section too big for this container
    const pMax = AL_LINE.forceUse * press.forceT * G / ac;
    const pd = pDef(ratio);
    if (pd >= pMax) continue;
    const fr = pFricPerMm(press.containerMm);
    const lForce = fr > 0 ? (pMax - pd) / fr : Infinity;
    // The force must allow an economic billet on this press, or try the next one.
    if (lForce < AL_LINE.minBilletDiameters * press.containerMm) continue;
    chosen = { press, holes, ratio, pd, lForce };
    break;
  }
  if (!chosen) {
    const press = candidates[candidates.length - 1];
    const ac = Math.PI / 4 * press.containerMm ** 2;
    const ratio = ac / inp.areaMm2;
    const pd = pDef(ratio);
    const pMax = AL_LINE.forceUse * press.forceT * G / ac;
    const fr = pFricPerMm(press.containerMm);
    chosen = { press, holes: 1, ratio, pd, lForce: fr > 0 ? Math.max(a.buttMm + 100, (pMax - pd) / fr) : Infinity };
    warnings.push(`No ${route} press in the library takes this section cleanly (circle ${inp.ccdMm.toFixed(0)} mm, ratio ${ratio.toFixed(1)}, `
      + `${pd.toFixed(0)} MPa before container friction) — costed on the ${press.label}; a larger or flat-container press is needed.`);
  }
  const { press, holes, ratio, pd, lForce } = chosen;
  if (ratio > a.maxRatio) warnings.push(`Extrusion ratio ${ratio.toFixed(0)} is above ${inp.alloy}'s practical ${a.maxRatio} — expect slow speed or a pre-extruded feed.`);

  const sp = exitSpeed(inp.alloy, inp, dt.type, press, ratio);
  const ac = Math.PI / 4 * press.containerMm ** 2;
  const buttMm = a.buttMm;
  const kerf = AL_LINE.sawKerfMm;
  const trim = AL_LINE.millEndTrimMm;
  const billetCapMm = Math.min(press.maxBilletMm, lForce);
  // Mill lengths: as many parts as fit a mill length (two end trims), then as
  // many mill lengths as fit the strand the billet and the run-out allow.
  const maxStrandM = Math.min(press.runoutM, (billetCapMm - buttMm) * ac / (holes * inp.areaMm2) / 1000);
  const partPitch = inp.partLengthMm + kerf;
  // The planner's choice: how many mill lengths, each holding how many parts, so
  // the strand the press can make carries the most parts (fewest mills on a tie).
  // Whole 7 m mill lengths alone left most of a third mill on the floor.
  const usableMm = maxStrandM * 1000 - AL_LINE.endScrapM * 1000;
  const kMax = Math.max(1, Math.floor((AL_LINE.millLengthMaxMm - 2 * trim) / partPitch));
  let mills = 0; let partsPerMill = 0;
  for (let n = 1; n <= 20; n++) {
    const k = Math.min(kMax, Math.floor((usableMm / n - 2 * trim) / partPitch));
    if (k < 1) break;
    // Too short to stack and age, unless one part already fills it.
    if (k * partPitch + 2 * trim < AL_LINE.millLengthMinMm && k > 1) continue;
    if (k === 1 && partPitch + 2 * trim < AL_LINE.millLengthMinMm && n > 1) continue;
    if (n * k > mills * partsPerMill) { mills = n; partsPerMill = k; }
  }
  if (mills < 1) {
    mills = 1; partsPerMill = 1;
    warnings.push(`A ${(partPitch + 2 * trim).toFixed(0)} mm mill length plus ${AL_LINE.endScrapM} m of strand ends does not fit the ${maxStrandM.toFixed(1)} m strand this press can make — costed one to a strand.`);
  }
  const millLengthMm = partsPerMill * partPitch + 2 * trim;
  const partsPerStrand = mills * partsPerMill;
  const strandM = mills * millLengthMm / 1000 + AL_LINE.endScrapM;
  const billetMm = buttMm + strandM * 1000 * holes * inp.areaMm2 / ac;
  const p = pd + pFricPerMm(press.containerMm) * billetMm;
  const forceT = p * ac / G;
  const billetKg = ac * billetMm * 1e-9 * rho;
  const buttKg = ac * buttMm * 1e-9 * rho;
  const partsPerPush = partsPerStrand * holes;
  const pushSec = strandM / sp.v * 60;
  const cycle = press.deadCycleSec + pushSec;
  const extrudedKgPerPart = inp.areaMm2 * inp.partLengthMm * 1e-9 * rho;
  const billetKgPerPart = billetKg / partsPerPush;
  basis.push(`${press.label}: circle ${inp.ccdMm.toFixed(0)} mm ≤ ${hollow ? press.maxCcdHollowMm : press.maxCcdSolidMm} mm, `
    + `${holes} opening${holes === 1 ? '' : 's'}, ratio ${ratio.toFixed(1)}; breakthrough ${p.toFixed(0)} MPa `
    + `(deformation ${pd.toFixed(0)}${route === 'direct' ? ` + container friction ${(p - pd).toFixed(0)} on a ${billetMm.toFixed(0)} mm billet` : ', no container friction'}) `
    + `→ ${forceT.toFixed(0)} t of ${press.forceT} t`
    + (Number.isFinite(lForce) && lForce < press.maxBilletMm ? `; the force allows a ${lForce.toFixed(0)} mm billet at most` : ''));
  basis.push(`billet ${billetMm.toFixed(0)} mm (${billetKg.toFixed(1)} kg) → ${holes} × ${strandM.toFixed(1)} m strand = ${mills} mill length${mills === 1 ? '' : 's'} `
    + `of ${(millLengthMm / 1000).toFixed(2)} m × ${partsPerMill} part${partsPerMill === 1 ? '' : 's'} → ${partsPerPush} parts a push; `
    + `butt ${buttMm} mm, strand ends ${AL_LINE.endScrapM} m, trims 2 × ${trim} mm a mill length, kerf ${kerf} mm → recovery ${(extrudedKgPerPart / billetKgPerPart * 100).toFixed(1)}%`);
  basis.push(`exit ${sp.v} m/min (${sp.basis}); push ${pushSec.toFixed(0)} s + dead cycle ${press.deadCycleSec} s`);

  // Runs: monthly, but never shorter than a few press hours (a die change each).
  const pressHrsPerYear = inp.annualVolume / partsPerPush * cycle / 3600;
  const runsPerYear = Math.max(1, Math.min(AL_LINE.runsPerYear, Math.floor(pressHrsPerYear / AL_LINE.minRunHr)));
  const die = dieCost(dt.type, inp.ccdMm, holes, inp);

  return {
    route, dieType: dt.type, pressId: press.id, pressLabel: press.label, containerMm: press.containerMm, holes,
    ratio: Math.round(ratio * 10) / 10, pressureMPa: Math.round(p), forceT: Math.round(forceT),
    forceUsePct: Math.round(forceT / press.forceT * 100),
    exitSpeedMPerMin: sp.v, speedBasis: sp.basis,
    billetMm: Math.round(billetMm), billetKg: Math.round(billetKg * 1000) / 1000,
    forceLimitedBilletMm: Number.isFinite(lForce) ? Math.round(lForce) : null,
    strandM: Math.round(strandM * 100) / 100, millLengthsPerStrand: mills, millLengthMm: Math.round(millLengthMm),
    partsPerMillLength: partsPerMill, partsPerStrand, partsPerPush,
    deadCycleSec: press.deadCycleSec, pushSec: Math.round(pushSec * 10) / 10, cycleSecPerPush: Math.round(cycle * 10) / 10,
    billetKgPerPart: Math.round(billetKgPerPart * 10_000) / 10_000,
    extrudedKgPerPart: Math.round(extrudedKgPerPart * 10_000) / 10_000,
    recovery: Math.round(extrudedKgPerPart / billetKgPerPart * 1000) / 1000,
    buttKg: Math.round(buttKg * 1000) / 1000,
    runsPerYear,
    dieCostGbp: die.gbp, dieLifeKg: die.lifeKg, dieBasis: die.basis,
    crew: press.crew, warnings, basis,
  };
}

/** Conform: continuous from rod, output-limited. */
export function planConform(s: AlSection, alloy: AlAlloy): { feasible: boolean; kgPerHr: number; basis: string } {
  const ok = s.ccdMm <= AL_CONFORM.maxCcdMm && AL_CONFORM.alloys.includes(alloy);
  return {
    feasible: ok, kgPerHr: AL_CONFORM.outputKgPerHr,
    basis: ok ? `Conform from ${alloy} rod at ~${AL_CONFORM.outputKgPerHr} kg/h, no butt, no billet heating`
      : `Conform takes circles ≤ ${AL_CONFORM.maxCcdMm} mm in ${AL_CONFORM.alloys.join(' / ')} only`,
  };
}

/** Impact extrusion of a cup: slug, strokes, tool. */
export function planImpact(partKg: number, outerDiaMm: number): { slugKg: number; secPerPart: number; toolGbp: number; toolLifeHits: number; basis: string } {
  const slugKg = partKg * (1 + AL_IMPACT.trimAllowance);
  return {
    slugKg, secPerPart: 60 / AL_IMPACT.strokesPerMin,
    toolGbp: Math.round(AL_IMPACT.toolBaseGbp + AL_IMPACT.toolPerMmGbp * outerDiaMm), toolLifeHits: AL_IMPACT.toolLifeHits,
    basis: `slug ${slugKg.toFixed(3)} kg (+${AL_IMPACT.trimAllowance * 100}% trim), ${AL_IMPACT.strokesPerMin} strokes/min`,
  };
}
