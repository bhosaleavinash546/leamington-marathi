// ─────────────────────────────────────────────────────────────────────────────
// CAD feature engine (pure, unit-tested) — kernel-free.
//
// Turns mesh aggregates (volume, surface area, bbox, surface-normal distribution)
// into a defensible feature map + process inference + DFMA findings. Everything
// here is DETERMINISTIC and only uses quantities that are reliably derivable from
// a triangle mesh. We deliberately do NOT fabricate exact hole/rib/thread counts
// (those need a B-rep kernel) — instead we expose planar-vs-curved area split and
// a characteristic wall thickness, which are honest and genuinely useful signals.
// ─────────────────────────────────────────────────────────────────────────────

function round(n, dp = 2) {
  if (!isFinite(n)) return 0;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/**
 * Summarise the surface-normal area histogram into planar/curved metrics.
 * @param {number[]} bucketAreas  area (any unit) accumulated per quantised normal bucket
 * @param {number} totalArea
 * @returns {{flatAreaFraction:number, curvedAreaFraction:number, dominantOrientations:number}}
 */
export function summarizeOrientations(bucketAreas, totalArea) {
  if (!totalArea || totalArea <= 0 || !bucketAreas || bucketAreas.length === 0) {
    return { flatAreaFraction: 0, curvedAreaFraction: 1, dominantOrientations: 0 };
  }
  // A "dominant" (planar) orientation holds >=2% of total surface area.
  const threshold = 0.02 * totalArea;
  let flat = 0, dominant = 0;
  for (const a of bucketAreas) {
    if (a >= threshold) { flat += a; dominant += 1; }
  }
  const flatFraction = Math.min(1, flat / totalArea);
  return {
    flatAreaFraction: round(flatFraction, 3),
    curvedAreaFraction: round(1 - flatFraction, 3),
    dominantOrientations: dominant,
  };
}

/**
 * Derive the feature map from mesh aggregates.
 * @param {object} a
 * @param {number} a.volumeCm3
 * @param {number} a.surfaceAreaCm2
 * @param {{x:number,y:number,z:number}} a.bbox  (mm)
 * @param {{flatAreaFraction:number,curvedAreaFraction:number,dominantOrientations:number}} [a.orientation]
 * @returns {object} featureMap
 */
export function deriveFeatureMap(a) {
  const bbox = a.bbox || { x: 0, y: 0, z: 0 };
  const dims = [bbox.x, bbox.y, bbox.z].filter(d => d > 0);
  const maxDim = dims.length ? Math.max(...dims) : 0;
  const minDim = dims.length ? Math.min(...dims) : 0;
  const bboxVolMm3 = (bbox.x || 0) * (bbox.y || 0) * (bbox.z || 0);
  const volMm3 = (a.volumeCm3 || 0) * 1000;
  const areaMm2 = (a.surfaceAreaCm2 || 0) * 100;

  const solidity = bboxVolMm3 > 0 ? Math.min(1, volMm3 / bboxVolMm3) : 0;
  const aspectRatio = minDim > 0 ? maxDim / minDim : 0;
  // Characteristic thickness t ≈ 2V/A — recovers plate/shell thickness well.
  const charThicknessMm = areaMm2 > 0 ? (2 * volMm3) / areaMm2 : 0;
  const saToVolume = volMm3 > 0 ? areaMm2 / volMm3 : 0;

  const o = a.orientation || { flatAreaFraction: 0, curvedAreaFraction: 1, dominantOrientations: 0 };

  return {
    solidity: round(solidity, 3),
    aspectRatio: round(aspectRatio, 2),
    maxDimMm: round(maxDim, 1),
    minDimMm: round(minDim, 1),
    charThicknessMm: round(charThicknessMm, 2),
    saToVolumeRatio: round(saToVolume, 3),
    flatAreaFraction: o.flatAreaFraction,
    curvedAreaFraction: o.curvedAreaFraction,
    dominantOrientations: o.dominantOrientations,
    // Boolean DFMA flags
    prismatic: o.flatAreaFraction >= 0.7,
    thinWalled: charThicknessMm > 0 && charThicknessMm < 2,
    slender: aspectRatio >= 8,
    chunky: solidity >= 0.55,
    hollow: solidity > 0 && solidity < 0.3,
    highCurvature: o.curvedAreaFraction >= 0.5,
  };
}

/**
 * Infer likely manufacturing process(es), ranked, with rationale.
 * @returns {{process:string, confidence:'high'|'medium'|'low', rationale:string}[]}
 */
export function inferProcess(fm) {
  const out = [];
  const push = (process, confidence, rationale) => out.push({ process, confidence, rationale });

  if (fm.thinWalled && fm.flatAreaFraction >= 0.6) {
    // A thin, mostly-flat part. (Note: thin plates legitimately have a HIGH
    // length/thickness aspect ratio, so aspect ratio is NOT a disqualifier here.)
    push('Sheet metal / stamping', 'high', `Characteristic thickness ${fm.charThicknessMm} mm with ${Math.round(fm.flatAreaFraction * 100)}% planar area — a thin, mostly-flat part.`);
  }
  if (fm.chunky && fm.highCurvature && !fm.thinWalled) {
    push('Die casting / investment casting', 'high', `High solidity ${fm.solidity} with ${Math.round(fm.curvedAreaFraction * 100)}% curved area — a bulky near-net shape with organic surfaces.`);
  }
  if (fm.chunky && fm.prismatic && !fm.thinWalled) {
    push('Forging → machining', 'medium', `High solidity ${fm.solidity}, mostly prismatic — suits a forged blank finished by machining.`);
  }
  if (fm.hollow && fm.flatAreaFraction >= 0.6) {
    push('Machined from billet', 'medium', `Low solidity ${fm.solidity} (lots of removed material) on a prismatic body — typical of billet machining (watch material utilisation).`);
  }
  if (fm.highCurvature && fm.aspectRatio >= 4 && !fm.thinWalled) {
    push('Turned / extruded', 'low', `Elongated body (aspect ${fm.aspectRatio}) with high curved-area fraction — may be turned or extruded.`);
  }
  if (out.length === 0) {
    push('Machined / cast (indeterminate)', 'low', `Geometry signals are mixed (solidity ${fm.solidity}, flat ${Math.round(fm.flatAreaFraction * 100)}%) — confirm with a drawing or STEP model.`);
  }
  return out;
}

/**
 * Fire DFMA rules from the feature map (+ optional drawing-derived tolerance text).
 * @returns {{id:string, severity:'high'|'medium'|'low', finding:string, metric:string}[]}
 */
export function runDfmaRules(fm, opts = {}) {
  const findings = [];
  const add = (id, severity, finding, metric) => findings.push({ id, severity, finding, metric });

  if (fm.thinWalled) {
    add('thin-wall', 'high',
      'Characteristic wall is thin — verify it exceeds the process minimum (≈2 mm cast Al, ≈1 mm moulded, ≈0.7 mm stamped) to avoid fill/warp/fracture.',
      `charThickness ${fm.charThicknessMm} mm`);
  }
  if (fm.slender) {
    add('slenderness', 'medium',
      'Slender part — high distortion/handling risk; consider ribs, a stiffer section, or splitting into stamped sub-parts.',
      `aspectRatio ${fm.aspectRatio}`);
  }
  if (fm.hollow) {
    add('material-utilisation', 'high',
      'Low solidity means a billet-machined version removes most of the stock — switch to a net-shape process (casting/forging/extrusion) or a tube/profile to cut material + cycle time.',
      `solidity ${fm.solidity}`);
  }
  if (fm.chunky && !fm.highCurvature) {
    add('mass-reduction', 'medium',
      'Bulky, mostly-prismatic solid — likely over-built; add cored pockets/lightening or topology optimisation to remove non-load-path mass.',
      `solidity ${fm.solidity}`);
  }
  if (fm.dominantOrientations >= 12) {
    add('feature-complexity', 'medium',
      'Many distinct planar orientations — high setup/fixturing complexity if machined; rationalise faces or design for fewer set-ups.',
      `${fm.dominantOrientations} dominant orientations`);
  }
  if (fm.highCurvature && fm.curvedAreaFraction >= 0.7) {
    add('freeform-surfaces', 'low',
      'Mostly free-form surfaces — confirm they are functionally required (sealing/aero) vs stylistic; flat/ruled surfaces are cheaper to tool.',
      `curved ${Math.round(fm.curvedAreaFraction * 100)}%`);
  }
  // Drawing-derived tolerance signal (when a drawing/notes string is provided)
  const tol = String(opts.toleranceText || '');
  if (/±?\s*0?\.0[0-5]\b|h[567]\b|IT[4-6]\b|0\.00[1-9]/.test(tol)) {
    add('tight-tolerance', 'medium',
      'Tight tolerance callouts detected — confirm each is functionally required; relaxing non-critical tolerances cuts inspection, scrap and process cost.',
      'drawing callout');
  }
  return findings;
}

/**
 * One-call convenience: aggregates → { featureMap, processes, dfma }.
 */
export function analyzeFeatures(aggregates, opts = {}) {
  const orientation = aggregates.orientation
    || summarizeOrientations(aggregates.bucketAreas || [], aggregates.totalArea || 0);
  const featureMap = deriveFeatureMap({ ...aggregates, orientation });
  return {
    featureMap,
    processes: inferProcess(featureMap),
    dfma: runDfmaRules(featureMap, opts),
  };
}
