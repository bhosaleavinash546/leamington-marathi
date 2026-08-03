/**
 * Near-net finish-machining envelope.
 *
 * The OCCT CNC estimator (`_estimate_cnc_cycle` in cad-geometry-engine.py) times
 * milling as `planar_face_area / feed_rate` — it mills EVERY planar face as if
 * the part were cut from solid billet. That is right for a machined-from-solid
 * part and badly wrong for a casting or a forging, where only a thin finish
 * stock comes off a few datum and journal faces.
 *
 * Left unchecked, a 2.8 kg gravity die-cast stub axle carried ~0.9 h of
 * machining and came out at ~£116 against a realistic ~£30 — the machining
 * dwarfed a casting that should cost ~£15-18.
 *
 * This lives in the engine rather than under `server/` because both the
 * deterministic cost-input rules and the server's AI-path guard need the same
 * ceiling, and two copies of a calibration constant is how they drift apart.
 * `server/utils/cad-machining-guard.ts` re-exports it and adds the
 * apply-to-an-analysis wrapper.
 *
 * Pure functions: no I/O, no AI.
 */

/** Commodities that arrive near-net and only need finish machining. */
export const NEAR_NET_COMMODITIES = new Set(['cast_and_machine', 'casting', 'forging']);

// Finish-machining envelope: a near-net part only needs its datum faces trued,
// journals/bores finished and holes drilled/tapped — not the whole envelope
// milled from solid. These bound the plausible ceiling, they don't set the value.
// Tunable against real machined-casting actuals (see nearNetMachiningCeilingHr).
export const NEAR_NET_ENVELOPE = {
  setupHr: 0.10,        // ~6 min: one or two datum/fixture setups
  finishHrPerKg: 0.07,  // ~4.2 min/kg of finish machining — generous ceiling
};

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/**
 * Finish-machining time ceiling (hours) for a near-net part of the given mass.
 * Calibratable: pass an override to tune against known machined-casting actuals.
 */
export function nearNetMachiningCeilingHr(
  weightKg: number,
  env: { setupHr: number; finishHrPerKg: number } = NEAR_NET_ENVELOPE,
): number {
  return env.setupHr + env.finishHrPerKg * n(weightKg);
}

export interface MachiningCapResult {
  machiningHr: number;
  capped: boolean;
  ceilingHr: number;
  reason?: string;
}

/**
 * Cap a from-solid machining estimate to the near-net finish-machining envelope
 * for cast / forged commodities. Machined-from-solid commodities are returned
 * unchanged — there the from-solid estimate is exactly right.
 */
export function capNearNetMachiningHr(rawHr: number, weightKg: number, commodity: string): MachiningCapResult {
  const raw = n(rawHr);
  if (!NEAR_NET_COMMODITIES.has(commodity)) {
    return { machiningHr: raw, capped: false, ceilingHr: Infinity };
  }
  // Without a usable weight the envelope cannot be sized — do NOT collapse the
  // ceiling to bare setup time (that would under-cost large machined castings).
  if (n(weightKg) <= 0) {
    return { machiningHr: raw, capped: false, ceilingHr: Infinity };
  }
  const ceilingHr = nearNetMachiningCeilingHr(weightKg);
  if (raw > ceilingHr) {
    return {
      machiningHr: round4(ceilingHr),
      capped: true,
      ceilingHr: round4(ceilingHr),
      reason: `Machining time ${raw.toFixed(2)} h looked machined-from-solid; a ${n(weightKg).toFixed(1)} kg near-net ${commodity} part only needs finish machining — capped to ${ceilingHr.toFixed(2)} h.`,
    };
  }
  return { machiningHr: raw, capped: false, ceilingHr: round4(ceilingHr) };
}
