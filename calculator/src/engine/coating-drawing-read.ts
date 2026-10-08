/**
 * Bounds on what an AI read of a drawing's finish note may put into the coating cost.
 *
 * The drawing read returns a deposit thickness and a count of masked features; both reached the
 * plating dwell, the deposited-metal mass and the masking stages with no limit (AI-path audit, Oct
 * 2026). A read is now used only when it is a credible value for the route it was mapped to:
 *
 * - thickness: inside the route's range — the plating routes are the only ones whose cost reads it;
 * - masked features: no more than the holes and bosses the kernel MEASURED on the part (what a
 *   plater plugs or caps).
 *
 * Anything outside is not used: the form keeps its own value and the note says why.
 */

/** Deposit ranges for the plating routes. Ranges are the designations of the named standard as
 *  commonly specified — a CostVision engineering heuristic, not read from the standard's text. */
export const PLATING_THICKNESS_RANGE_UM: Record<string, { lo: number; hi: number; basis: string }> = {
  zinc_plate:  { lo: 5, hi: 25, basis: 'ISO 2081 zinc designations Fe//Zn5 – Fe//Zn25' },
  zinc_nickel: { lo: 5, hi: 15, basis: 'ISO 19598 zinc-nickel designations, typically 5 – 12 µm' },
  anodise:     { lo: 5, hi: 25, basis: 'ISO 7599 anodic classes AA5 – AA25 (hard anodise is not this route)' },
};

export interface DrawingCoatingRead {
  route: string;
  thicknessUm?: number | null;
  maskedFeatureCount?: number | null;
  /** Holes + bosses measured by the kernel; undefined when the part has no feature table (an STL). */
  measuredMaskableFeatures?: number;
}

export interface BoundedCoating {
  thicknessUm: number | null;
  maskedFeatureCount: number | null;
  notes: string[];
}

export function boundDrawingCoating(read: DrawingCoatingRead): BoundedCoating {
  const notes: string[] = [];
  let thicknessUm: number | null = null;
  let maskedFeatureCount: number | null = null;

  const t = read.thicknessUm;
  if (typeof t === 'number' && t > 0) {
    const range = PLATING_THICKNESS_RANGE_UM[read.route];
    if (!range) {
      notes.push(`Drawing read a ${t} µm finish thickness; the "${read.route || 'unmapped'}" route does not price by `
        + 'deposit thickness, so it is not used.');
    } else if (t < range.lo || t > range.hi) {
      notes.push(`Drawing read ${t} µm, outside ${range.lo}–${range.hi} µm for this route (${range.basis}) — not used; `
        + 'the form keeps its own thickness. Check the drawing.');
    } else {
      thicknessUm = t;
      notes.push(`Deposit ${t} µm read from the drawing (inside ${range.lo}–${range.hi} µm, ${range.basis}) — `
        + 'an AI read of a drawing note; confirm it.');
    }
  }

  const m = read.maskedFeatureCount;
  if (typeof m === 'number' && m > 0) {
    const n = Math.round(m);
    const cap = read.measuredMaskableFeatures;
    if (cap === undefined) {
      notes.push(`Drawing read ${n} masked feature(s), but the part has no measured feature table to check it against — `
        + 'not used; enter the masking count yourself.');
    } else if (n > cap) {
      notes.push(`Drawing read ${n} masked feature(s), more than the ${cap} holes and bosses measured on the part — `
        + 'not used; enter the masking count yourself.');
    } else {
      maskedFeatureCount = n;
      notes.push(`${n} masked feature(s) read from the drawing (≤ ${cap} measured holes and bosses) — confirm it.`);
    }
  }
  return { thicknessUm, maskedFeatureCount, notes };
}
