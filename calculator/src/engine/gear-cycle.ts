/**
 * Gear cutting kinematics — cycle time from the gear's own geometry.
 *
 * ## Why this file carries no citations
 *
 * Everywhere else in this engine, a threshold or a constant needs a published
 * source before it ships. Nothing here does, because nothing here is a claim
 * about the world. Hobbing time is not a correlation fitted to shop data; it is
 * the arithmetic of the generating motion. A hob with `Ns` starts turning at
 * `nHob` rpm drives a `z`-tooth workpiece at `nHob x Ns / z` rev/min, because
 * one hob revolution advances the work by `Ns` tooth spaces. That is a gear
 * train, not an estimate. Feed the same numbers to a Liebherr, a Gleason and a
 * pencil and you get the same answer.
 *
 * What IS empirical — the cutting speed, the feed per revolution, how many cuts
 * a module needs, the strokes per minute a shaper will hold — lives in
 * `gear-shop-data.ts` as a dated, sourced, replaceable table. The split matters:
 * it means an unverified shop table produces a cycle time that is wrong in a
 * knowable, correctable way, rather than wrong in an unknowable one.
 *
 * ## The convention every function here shares
 *
 * Lengths in mm, angles in degrees at the boundary (radians internally), times
 * in seconds, speeds in m/min, feeds in mm per WORK revolution unless the name
 * says otherwise. Returning seconds rather than hours is deliberate: gear cycles
 * run from ~20 s to ~40 min, and a cycle expressed in hours to four decimals is
 * unreadable in a trace drawer.
 */

const RAD = Math.PI / 180;

/** Guard every divisor the caller could legitimately pass as zero. */
const safe = (n: number, floor = 1e-9): number => (Number.isFinite(n) && n > floor ? n : floor);

// ─── Gear geometry (ISO/DIN standard proportions) ────────────────────────────

/**
 * Transverse module from normal module and helix angle.
 *
 * A helical gear is cut with a hob of the NORMAL module, but its diameter is set
 * by the TRANSVERSE module — which is why a 30-degree helix makes a gear 15%
 * bigger than the same tooth count would suggest, and can push it past a
 * machine's swing.
 */
export function transverseModuleMm(normalModuleMm: number, helixAngleDeg: number): number {
  return normalModuleMm / Math.cos(helixAngleDeg * RAD);
}

/** Pitch diameter, mm. `z x m_t` — the reference circle the teeth are cut on. */
export function pitchDiameterMm(teeth: number, normalModuleMm: number, helixAngleDeg: number): number {
  return teeth * transverseModuleMm(normalModuleMm, helixAngleDeg);
}

/**
 * Full tooth depth, mm — standard proportions: addendum 1.0 x m_n,
 * dedendum 1.25 x m_n. This is the depth the cutter must reach, which sets both
 * the number of cuts and the hob approach length.
 */
export function toothDepthMm(normalModuleMm: number): number {
  return 2.25 * normalModuleMm;
}

/**
 * Volume of metal removed cutting one gear, mm^3.
 *
 * The tooth space is approximated as a trapezoid of depth `h`: full circular
 * pitch at the root, narrowing to roughly half at the tip for a standard 20-degree
 * pressure angle. Multiplied by the tooth count and the face width along the
 * helix.
 *
 * Its job is NOT to price the cut — the kinematic time does that. Its job is to
 * give the audit layer an independent cross-check: a cycle time that implies a
 * removal rate outside the machine's envelope is a bug, in the same way
 * `cad-machining-guard.ts` catches a near-net casting billed for from-solid
 * cutting time.
 */
export function toothSpaceVolumeMm3(p: {
  teeth: number; normalModuleMm: number; helixAngleDeg: number; faceWidthMm: number;
}): number {
  const h = toothDepthMm(p.normalModuleMm);
  const circularPitch = Math.PI * p.normalModuleMm;      // normal circular pitch
  const meanWidth = circularPitch * 0.75;                // root ~1.0p, tip ~0.5p
  const lengthAlongHelix = p.faceWidthMm / Math.cos(p.helixAngleDeg * RAD);
  return p.teeth * meanWidth * h * lengthAlongHelix;
}

// ─── Hobbing ─────────────────────────────────────────────────────────────────

export interface HobbingCycleInputs {
  teeth: number;
  normalModuleMm: number;
  helixAngleDeg: number;
  faceWidthMm: number;
  /** Hob outside diameter, mm. Sets the approach length — a big hob costs travel. */
  hobDiameterMm: number;
  /** Threads on the hob. Doubling starts halves the time, and costs quality. */
  hobStarts: number;
  /** Surface speed, m/min. Empirical — from the shop table. */
  cuttingSpeedMPerMin: number;
  /** Axial feed per WORK revolution, mm. Empirical — from the shop table. */
  axialFeedMmPerRev: number;
  /** Passes over the face. Empirical: heavy modules take a rough + a finish cut. */
  cuts: number;
  /** Non-cutting time per part: load, clamp, index, retract, unload. Seconds. */
  loadUnloadSec: number;
}

export interface CycleBreakdown {
  cuttingSec: number;
  loadUnloadSec: number;
  totalSec: number;
  /** The arithmetic, printable end to end. No cycle time ships without one. */
  basis: string;
  /** Implied volumetric removal rate, mm^3/min — the audit layer's cross-check. */
  removalRateMm3PerMin: number;
}

/**
 * Hob approach length, mm.
 *
 * The hob must travel far enough for its full depth to clear the face before
 * cutting starts. Geometrically that is the chord of the hob circle at depth
 * `h`: sqrt(h x (D - h)). Ignoring it under-states the cut on coarse modules,
 * where approach can exceed the face width itself on a narrow gear.
 */
export function hobApproachMm(toothDepth: number, hobDiameterMm: number): number {
  const h = Math.min(toothDepth, hobDiameterMm / 2);
  return Math.sqrt(Math.max(0, h * (hobDiameterMm - h)));
}

/**
 * Hobbing cycle, seconds.
 *
 *   nHob   = 1000 v / (pi D_hob)                rpm, from surface speed
 *   nWork  = nHob x Ns / z                      the generating train
 *   tPass  = Ltravel / (fa x nWork) x 60        seconds
 *
 * Substituting gives the closed form the shop floor uses:
 *
 *   tPass  = Ltravel x z x 60 / (fa x nHob x Ns)
 *
 * Note what the tooth count does: time is LINEAR in `z` at fixed feed, because
 * every extra tooth is another tooth space the work must index through. That is
 * why a 90-tooth gear is not "a bit slower" than a 30-tooth one on the same
 * blank — it is three times slower.
 */
export function hobbingCycleSec(i: HobbingCycleInputs): CycleBreakdown {
  const h = toothDepthMm(i.normalModuleMm);
  const approach = hobApproachMm(h, i.hobDiameterMm);
  const overrun = 2;                                       // clearance off the far face
  const lengthAlongHelix = i.faceWidthMm / Math.cos(i.helixAngleDeg * RAD);
  const travel = lengthAlongHelix + approach + overrun;

  const nHob = (1000 * i.cuttingSpeedMPerMin) / (Math.PI * safe(i.hobDiameterMm));
  const nWork = (nHob * safe(i.hobStarts)) / safe(i.teeth);
  const cuttingSec = (travel / safe(i.axialFeedMmPerRev * nWork)) * 60 * Math.max(1, i.cuts);

  const volume = toothSpaceVolumeMm3(i);
  return {
    cuttingSec,
    loadUnloadSec: i.loadUnloadSec,
    totalSec: cuttingSec + i.loadUnloadSec,
    removalRateMm3PerMin: volume / safe(cuttingSec / 60),
    basis:
      `hob ${i.hobStarts}-start Ø${i.hobDiameterMm}mm at ${i.cuttingSpeedMPerMin} m/min = `
      + `${nHob.toFixed(0)} rpm; work ${nWork.toFixed(2)} rpm (${i.teeth}z); travel `
      + `${lengthAlongHelix.toFixed(1)} + ${approach.toFixed(1)} approach + ${overrun} overrun = `
      + `${travel.toFixed(1)} mm at ${i.axialFeedMmPerRev} mm/rev x ${i.cuts} cut(s) = `
      + `${cuttingSec.toFixed(0)} s cutting + ${i.loadUnloadSec} s handling`,
  };
}

// ─── Shaping (Fellows) ───────────────────────────────────────────────────────

export interface ShapingCycleInputs {
  teeth: number;
  normalModuleMm: number;
  helixAngleDeg: number;
  faceWidthMm: number;
  /** Reciprocations per minute. Empirical — set by stroke length and machine. */
  strokesPerMin: number;
  /** Circular feed at the pitch circle, mm per stroke. Empirical. */
  circularFeedMmPerStroke: number;
  /** Radial infeed passes to reach full depth. Empirical. */
  roughingPasses: number;
  loadUnloadSec: number;
}

/**
 * Shaping cycle, seconds.
 *
 * A shaper cutter reciprocates and rolls with the work, so the cut is measured
 * around the pitch CIRCUMFERENCE rather than along the face:
 *
 *   tPass = (pi x d_pitch) / (fc x strokes/min) x 60
 *
 * The face width does not appear directly — it sets the stroke length, and
 * through it the achievable strokes/min, which the shop table supplies. This is
 * the structural reason shaping loses to skiving on anything but short faces:
 * the cutter is idle on every return stroke.
 */
export function shapingCycleSec(i: ShapingCycleInputs): CycleBreakdown {
  const d = pitchDiameterMm(i.teeth, i.normalModuleMm, i.helixAngleDeg);
  const perPassSec = ((Math.PI * d) / safe(i.circularFeedMmPerStroke * i.strokesPerMin)) * 60;
  const cuttingSec = perPassSec * Math.max(1, i.roughingPasses);
  const volume = toothSpaceVolumeMm3(i);
  return {
    cuttingSec,
    loadUnloadSec: i.loadUnloadSec,
    totalSec: cuttingSec + i.loadUnloadSec,
    removalRateMm3PerMin: volume / safe(cuttingSec / 60),
    basis:
      `pitch Ø${d.toFixed(1)}mm circumference ${(Math.PI * d).toFixed(0)} mm at `
      + `${i.circularFeedMmPerStroke} mm/stroke x ${i.strokesPerMin} strokes/min = `
      + `${perPassSec.toFixed(0)} s/pass x ${i.roughingPasses} pass(es) = `
      + `${cuttingSec.toFixed(0)} s cutting + ${i.loadUnloadSec} s handling`,
  };
}

// ─── Power skiving ───────────────────────────────────────────────────────────

export interface SkivingCycleInputs {
  teeth: number;
  normalModuleMm: number;
  helixAngleDeg: number;
  faceWidthMm: number;
  /** Teeth on the skiving cutter. Sets the generating ratio, as hob starts do. */
  cutterTeeth: number;
  cuttingSpeedMPerMin: number;
  cutterDiameterMm: number;
  /** Axial feed per WORK revolution, mm. Empirical. */
  axialFeedMmPerRev: number;
  /** Passes to full depth. Empirical. */
  cuts: number;
  loadUnloadSec: number;
}

/**
 * Power skiving cycle, seconds.
 *
 * Continuous generation like hobbing, but the cutter is a gear-shaped tool on a
 * crossed axis, so the ratio is `nWork = nCutter x zCutter / zWork` — the cutter
 * tooth count plays the role the hob's starts play. Because the cut is
 * continuous rather than reciprocating, it does not pay the shaper's idle return
 * stroke, which is where the 2-3x productivity over shaping comes from.
 *
 * Both the axial travel and the crossed-axis geometry mean skiving suits
 * INTERNAL gears, where a hob cannot reach at all.
 */
export function skivingCycleSec(i: SkivingCycleInputs): CycleBreakdown {
  const h = toothDepthMm(i.normalModuleMm);
  const lengthAlongHelix = i.faceWidthMm / Math.cos(i.helixAngleDeg * RAD);
  // Skiving runs out over roughly the tooth depth rather than a hob's chord.
  const travel = lengthAlongHelix + h + 2;

  const nCutter = (1000 * i.cuttingSpeedMPerMin) / (Math.PI * safe(i.cutterDiameterMm));
  const nWork = (nCutter * safe(i.cutterTeeth)) / safe(i.teeth);
  const cuttingSec = (travel / safe(i.axialFeedMmPerRev * nWork)) * 60 * Math.max(1, i.cuts);

  const volume = toothSpaceVolumeMm3(i);
  return {
    cuttingSec,
    loadUnloadSec: i.loadUnloadSec,
    totalSec: cuttingSec + i.loadUnloadSec,
    removalRateMm3PerMin: volume / safe(cuttingSec / 60),
    basis:
      `${i.cutterTeeth}z cutter Ø${i.cutterDiameterMm}mm at ${i.cuttingSpeedMPerMin} m/min = `
      + `${nCutter.toFixed(0)} rpm; work ${nWork.toFixed(1)} rpm; travel ${travel.toFixed(1)} mm `
      + `at ${i.axialFeedMmPerRev} mm/rev x ${i.cuts} cut(s) = ${cuttingSec.toFixed(0)} s cutting `
      + `+ ${i.loadUnloadSec} s handling`,
  };
}

// ─── Gear grinding ───────────────────────────────────────────────────────────

export interface GrindingCycleInputs {
  teeth: number;
  normalModuleMm: number;
  helixAngleDeg: number;
  faceWidthMm: number;
  /** Stock left on each flank for the grinder, mm. Set by heat-treat distortion. */
  grindingStockPerFlankMm: number;
  /** Specific removal rate, mm^3 per mm of wheel width per second. Empirical. */
  specificRemovalRateMm3PerMmSec: number;
  /** Effective wheel contact width, mm. Empirical, by wheel and method. */
  wheelWidthMm: number;
  /** Seconds of dressing amortised over the parts between dresses. Empirical. */
  dressingSecPerPart: number;
  /**
   * Spark-out passes after stock removal, set by the ISO class being held.
   *
   * A spark-out pass removes (almost) no stock — it lets the wheel run out the
   * elastic deflection in the machine and the part, which is what actually buys
   * the last classes of accuracy. Modelling it as extra time at the same removal
   * rate would be wrong; each pass is one traverse of the face at the finishing
   * feed, so it is added as time, not as volume.
   */
  sparkOutPasses?: number;
  /** Seconds per spark-out pass. Empirical. */
  sparkOutSecPerPass?: number;
  loadUnloadSec: number;
}

/**
 * Gear grinding cycle, seconds.
 *
 * Grinding is stock-limited rather than feed-limited, so the honest model is
 * volumetric: total stock = 2 flanks x z teeth x flank area x stock depth,
 * divided by the removal rate the wheel and method can hold.
 *
 * Flank area is approximated as tooth depth x face length along the helix. The
 * approximation is stated rather than hidden: the involute flank is longer than
 * its radial depth by roughly the pressure-angle cosine, so this runs slightly
 * optimistic on coarse modules, and the shop table's removal rate is where that
 * gets calibrated out against real cycle times.
 */
export function grindingCycleSec(i: GrindingCycleInputs): CycleBreakdown {
  const h = toothDepthMm(i.normalModuleMm);
  const lengthAlongHelix = i.faceWidthMm / Math.cos(i.helixAngleDeg * RAD);
  const flankAreaMm2 = h * lengthAlongHelix;
  const volume = 2 * i.teeth * flankAreaMm2 * i.grindingStockPerFlankMm;

  const rateMm3PerSec = safe(i.specificRemovalRateMm3PerMmSec * i.wheelWidthMm);
  const stockSec = volume / rateMm3PerSec;
  const passes = Math.max(0, i.sparkOutPasses ?? 0);
  const sparkOutSec = passes * (i.sparkOutSecPerPass ?? 0);
  const cuttingSec = stockSec + sparkOutSec + i.dressingSecPerPart;

  return {
    cuttingSec,
    loadUnloadSec: i.loadUnloadSec,
    totalSec: cuttingSec + i.loadUnloadSec,
    removalRateMm3PerMin: volume / safe(cuttingSec / 60),
    basis:
      `2 flanks x ${i.teeth}z x ${flankAreaMm2.toFixed(0)} mm² x `
      + `${i.grindingStockPerFlankMm} mm stock = ${volume.toFixed(0)} mm³ at `
      + `${i.specificRemovalRateMm3PerMmSec} mm³/mm·s x ${i.wheelWidthMm} mm wheel = `
      + `${stockSec.toFixed(0)} s`
      + (passes > 0 ? ` + ${passes} spark-out pass(es) ${sparkOutSec.toFixed(0)} s` : '')
      + ` + ${i.dressingSecPerPart} s dressing + ${i.loadUnloadSec} s handling`,
  };
}
