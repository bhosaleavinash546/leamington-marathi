/**
 * Is this model hollow — really?
 *
 * The kernel's `enclosesSealedVoid` is pure topology: `shells − solids ≥ 1`.
 * That is exactly right for a mathematically sealed cavity and exactly wrong
 * for the thing blow moulding actually makes: **a real fuel tank has a filler
 * neck**, so its cavity communicates with the outside, OCCT sees one connected
 * boundary shell, and the "sealed void" count is zero. The first real tank this
 * tool met was blocked with "this model does not enclose a sealed void — is it
 * really blow moulded?", which is the machine confidently asking the engineer
 * to confirm the obvious.
 *
 * The discriminator the topology alone cannot give is in the metrics the kernel
 * already reports and nothing used. The real fuel tank taught us which one:
 * it has 3 solids and **264 free edges** (3.4% — stray sliver faces from the
 * production export, not a cut boundary), so "any free edge → surface model"
 * would still have blocked it. The crisp signal is `solidCount`:
 *
 *  - `solidCount === 0` → a genuine surface/half model. No solid exists, the
 *    volume is unreliable, and the hard ask is RIGHT.
 *  - solids exist + thin wall + near-empty envelope → a hollow body whose
 *    cavity has openings. A 10.6 L body filling 1.8% of a 1.5 m envelope at a
 *    ~4.6 mm wall is a container, whatever the shell count says.
 *  - everything else → genuinely solid; hollow processes are wrong for it.
 */
import type { OCCTGeometry } from '../../ai-analysis.js';

export type HollowVerdict =
  /** Topology found a mathematically sealed internal cavity. */
  | 'sealed'
  /** Solid thin body — hollow with openings (filler neck, spout, mouth). */
  | 'near-enclosed'
  /** No solid at all: a surface or half-section model. Ask the human. */
  | 'open-surface'
  /** A genuine solid. Hollow processes are the wrong route. */
  | 'solid'
  /** No topology signal available. */
  | 'unknown';

/** Fill ratio below which a watertight body reads as a container, not a solid. */
const NEAR_ENCLOSED_MAX_FILL = 0.08;
/** Wall above this is not a blown/rotomoulded shell whatever the fill says. */
const NEAR_ENCLOSED_MAX_WALL_MM = 12;

export function hollowVerdict(geo: OCCTGeometry): HollowVerdict {
  const t = geo.topology;
  if (!t?.available) return 'unknown';
  if (t.enclosesSealedVoid === true) return 'sealed';
  // Strict >= 1 on a PRESENT count: an absent solidCount must not read as a
  // solid, or a minimal fixture with no topology detail would silently pass.
  const isSolidModel = (t.solidCount ?? 0) >= 1;
  if (!isSolidModel) return 'open-surface';
  const fill = geo.fillRatio ?? 1;
  const wall = geo.wallThickness?.meanMm ?? null;
  if (fill < NEAR_ENCLOSED_MAX_FILL && (wall == null || wall <= NEAR_ENCLOSED_MAX_WALL_MM)) {
    return 'near-enclosed';
  }
  return 'solid';
}

/** One-line basis for a near-enclosed call, for provenance trails. */
export function nearEnclosedBasis(geo: OCCTGeometry): string {
  const fill = ((geo.fillRatio ?? 0) * 100).toFixed(1);
  const wall = geo.wallThickness?.meanMm;
  return `solid thin body at ${fill}% envelope fill`
    + (wall ? ` and ${wall.toFixed(1)} mm wall` : '')
    + ' — a hollow container whose cavity communicates through openings (e.g. a filler neck), '
    + 'which topology alone reports as "no sealed void"';
}
