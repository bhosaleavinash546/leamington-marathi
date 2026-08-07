/**
 * DFA from geometry — the Boothroyd-Dewhurst handling half, measured.
 *
 * Today "DFA" in this tool is `opCount`, `manning` and `labPct`: assembly
 * ECONOMICS, not design for assembly. Boothroyd & Dewhurst's method assigns
 * handling and insertion times from a part's GEOMETRIC characteristics —
 * symmetry, size, thickness — and compares the total against a theoretical
 * minimum. The geometric half of that is computable from the B-rep, and this
 * computes it.
 *
 * ## What this is not
 *
 * Full Boothroyd DFA needs the ASSEMBLY: the theoretical minimum part count
 * comes from the three-question test applied to every part against its
 * neighbours (does it move relative to them, must it be a different material,
 * must it be separable for assembly). We cost a single part, so the minimum
 * part count is not knowable here and no design-efficiency ratio is reported.
 * What is reported is the handling and insertion time for this part, which is
 * real, and the report says exactly this rather than implying a full analysis.
 *
 * Time values follow the published structure of the Boothroyd handling and
 * insertion tables — a base time modified by symmetry, size and thickness — and
 * the constants used are stated on every line so they can be argued with.
 */
import type { GeoSeverity, PartContext, RuleSource } from './types.js';

export const BOOTHROYD_SOURCE: RuleSource = {
  standard: 'Boothroyd, Dewhurst & Knight — Product Design for Manufacture and Assembly',
  clause: 'Manual handling and insertion time tables',
  note: 'Handling time is derived from the geometric characteristics the tables key on '
      + '(rotational symmetry, size, thickness). The theoretical-minimum part count, and '
      + 'therefore the design-efficiency index, requires the assembly and is not computed for a '
      + 'single part.',
};

/** Base manual handling time for an easy-to-grasp part, seconds. */
export const BASE_HANDLING_SEC = 1.13;
/** The nominal per-part assembly time the method uses for the ideal case, seconds. */
export const IDEAL_PART_SEC = 3.0;

/** Below this smallest dimension a part needs tweezers rather than fingers, mm. */
export const SMALL_PART_MM = 6;
/** Below this thickness a flat part is hard to pick off a surface, mm. */
export const THIN_PART_MM = 2;
/** Above this largest dimension a part needs two hands or assistance, mm. */
export const LARGE_PART_MM = 380;

export interface DFAHandlingResult {
  available: boolean;
  /** Estimated one-handed manual handling time, seconds. */
  handlingTimeSec?: number;
  /** Estimated insertion time, seconds. */
  insertionTimeSec?: number;
  totalTimeSec?: number;
  /** Multiple of the ideal 3 s part — how much harder than best case. */
  vsIdealRatio?: number;
  /** Each penalty applied, with the measurement that triggered it. */
  penalties: Array<{
    reason: string; addedSec: number; measured: string; severity: GeoSeverity;
  }>;
  source: RuleSource;
  limitations: string[];
}

/**
 * Alpha/beta rotational symmetry, approximated from the bounding box.
 *
 * Boothroyd keys handling on the sum of the two rotational symmetries: a part
 * that can be presented any way up is quickest to orient. A true symmetry test
 * needs the inertia tensor and a shape comparison under rotation; the bounding
 * box gives a sound approximation for the three common cases and is honest
 * about being an approximation.
 */
export function symmetryClass(bbox: { x: number; y: number; z: number }):
  'cubic' | 'square_prism' | 'cylindrical_like' | 'asymmetric' {
  const d = [bbox.x, bbox.y, bbox.z].sort((a, b) => a - b);
  const [s, m, l] = d;
  if (l <= 0) return 'asymmetric';
  const near = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) < 0.05;
  if (near(s, m) && near(m, l)) return 'cubic';
  if (near(s, m) || near(m, l)) return 'square_prism';
  if (l / s > 3) return 'cylindrical_like';
  return 'asymmetric';
}

export function analyseDFAHandling(part: PartContext): DFAHandlingResult {
  const limitations = [
    'Theoretical minimum part count, and therefore the Boothroyd design-efficiency index, '
    + 'requires the full assembly — this analysis covers one part, so no efficiency ratio is given.',
    'Nesting and tangling risk is not assessed: it depends on how parts are presented in bulk, '
    + 'which the geometry alone does not determine.',
    'Rotational symmetry is approximated from the bounding box, not from an inertia-tensor '
    + 'shape comparison.',
  ];
  const bbox = part.bboxMm;
  if (!bbox || !(bbox.x > 0 && bbox.y > 0 && bbox.z > 0)) {
    return { available: false, penalties: [], source: BOOTHROYD_SOURCE,
      limitations: ['Bounding box was not measured, so handling time could not be derived.'] };
  }

  const penalties: DFAHandlingResult['penalties'] = [];
  let handling = BASE_HANDLING_SEC;

  const dims = [bbox.x, bbox.y, bbox.z].sort((a, b) => a - b);
  const [smallest, , largest] = dims;

  const sym = symmetryClass(bbox);
  if (sym === 'asymmetric') {
    handling += 0.5;
    penalties.push({
      reason: 'Asymmetric envelope — the part must be oriented before insertion',
      addedSec: 0.5, severity: 'minor',
      measured: `bounding box ${bbox.x.toFixed(0)}×${bbox.y.toFixed(0)}×${bbox.z.toFixed(0)} mm, no two dimensions within 5%`,
    });
  } else if (sym === 'square_prism') {
    handling += 0.25;
    penalties.push({
      reason: 'Partial symmetry — one orientation decision remains',
      addedSec: 0.25, severity: 'advisory',
      measured: `bounding box ${bbox.x.toFixed(0)}×${bbox.y.toFixed(0)}×${bbox.z.toFixed(0)} mm`,
    });
  }

  if (smallest < SMALL_PART_MM) {
    handling += 0.9;
    penalties.push({
      reason: 'Small part — needs tweezers or a fixture rather than fingers',
      addedSec: 0.9, severity: 'major',
      measured: `smallest dimension ${smallest.toFixed(1)} mm < ${SMALL_PART_MM} mm`,
    });
  }
  if (smallest < THIN_PART_MM) {
    handling += 0.7;
    penalties.push({
      reason: 'Thin part — hard to pick off a flat surface',
      addedSec: 0.7, severity: 'major',
      measured: `thickness ${smallest.toFixed(2)} mm < ${THIN_PART_MM} mm`,
    });
  }
  if (largest > LARGE_PART_MM) {
    handling += 1.5;
    penalties.push({
      reason: 'Large part — two-handed handling or mechanical assistance',
      addedSec: 1.5, severity: 'major',
      measured: `largest dimension ${largest.toFixed(0)} mm > ${LARGE_PART_MM} mm`,
    });
  }

  // Insertion: a part with no through-features is a simple place; each distinct
  // aligned hole axis is an alignment the operator must satisfy.
  // Defensive: a truncated or malformed kernel payload must degrade to "no
  // insertion penalty", never take down the whole DFM run.
  const holes = (part.featureSet?.features ?? []).filter(f => f.kind === 'hole');
  const axes = new Set(holes.map(h => (h.axis ?? []).map(v => Math.abs(Math.round(v * 20) / 20)).join(',')));
  let insertion = 1.5;
  if (axes.size > 1) {
    const add = 0.7 * (axes.size - 1);
    insertion += add;
    penalties.push({
      reason: 'Fasteners approach from more than one direction — the part must be re-oriented '
            + 'or the fixture indexed during assembly',
      addedSec: add, severity: axes.size > 2 ? 'major' : 'minor',
      measured: `${axes.size} distinct hole axes across ${holes.length} holes`,
    });
  }

  const total = handling + insertion;
  return {
    available: true,
    handlingTimeSec: round(handling),
    insertionTimeSec: round(insertion),
    totalTimeSec: round(total),
    vsIdealRatio: round(total / IDEAL_PART_SEC),
    penalties,
    source: BOOTHROYD_SOURCE,
    limitations,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
