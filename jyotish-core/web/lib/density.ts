/**
 * The density mode (REVIEW-360 §1 A2, DESIGN.md §6).
 *
 * Two readers want opposite things from the same ChartFacts: the practitioner
 * wants every table open, the seeker wants the sheet approachable. DESIGN.md §6
 * is explicit that the difference is "default disclosure states", not different
 * data — so the mode is a cookie the server can read while rendering, and each
 * dense section takes its default open/closed state from it.
 *
 * A cookie rather than localStorage, deliberately: the patrika is
 * server-rendered, and a client-side preference would paint the practitioner
 * layout first and then collapse it — a flash of the wrong density on every
 * load for exactly the reader who asked for less.
 *
 * The default, when no choice has been made, is the practitioner: POSITIONING.md
 * names the practitioner as the primary user, and the full sheet is also the
 * state every existing test and printout was built against.
 */
export type Density = 'practitioner' | 'seeker';

export const DENSITY_COOKIE = 'jyotish_density';
export const DEFAULT_DENSITY: Density = 'practitioner';

export function parseDensity(value: string | undefined | null): Density | null {
  return value === 'practitioner' || value === 'seeker' ? value : null;
}
