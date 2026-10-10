/**
 * Cavitation optimiser — the cavity count is a COST decision, not a weight class.
 *
 * The old rule was a mass ladder (>50 g → 1 cavity, 10–50 g → 2, <10 g → 4)
 * capped by clamp force. Mass is a proxy; the real trade is volume economics:
 * every cavity buys 1/n of the shot cycle per part — machine AND labour, since
 * `partsPerCycle` divides both in core.ts — and pays for it with ~n^0.9 mould
 * NRE (estimateMouldCost) and a bigger press whose rate is higher. Which n wins
 * depends on the annual volume, the shot cycle, the part's footprint and the
 * press ladder — all numbers the engine already has. So it is arithmetic, and
 * the tool does the arithmetic (the routing-optimiser principle applied to the
 * moulder's side of the quote).
 *
 * Conventions deliberately mirror what the mapper will actually charge
 * (SHOP_DEFAULTS + core.ts): reject uplift on the cycle, OEE on machine time,
 * labour at the semi-skilled UK rate with the shop's manning and efficiency.
 * Unlike the machining routing optimiser — which excludes labour because labour
 * follows the operation whatever machine runs it — labour is IN this ranking:
 * every per-hour cost divides by n here, and excluding it would systematically
 * understate the multi-cavity win. Material is OUT: runner waste per part is
 * n-invariant (the runner rule ships the whole shot's runner), so it cancels.
 *
 * Ranked on UK base rates like the routing optimiser: regional factors scale
 * the moulding family together, so the RANKING is region-stable while the
 * estimate's pounds still come from the regional engine run. Deterministic:
 * same inputs, same choice, same words.
 */
import { activeRates } from './rate-context.js';
import {
  estimateClampingTonnage, estimateMouldCost, pickIMMPressId, steelClassFor,
  type MouldSteelClass,
} from './modules/injection-moulding.js';
import type { RateLibrary } from './types.js';

export interface CavitationInputs {
  /** projected area of ONE cavity, cm². */
  areaPerCavityCm2: number;
  cavityPressureMPa: number;
  /** fill + pack + cool + eject, seconds — the fallback when no per-press cycle is given. */
  shotSeconds: number;
  /**
   * The shot on a given press with n cavities, s. A bigger press has a longer
   * dry cycle and a faster injection unit, and n cavities inject n parts' worth,
   * so the shot is NOT cavity-count invariant once those are modelled.
   */
  cycleSecondsFor?: (pressId: string, n: number) => number;
  /** Part depth along the draw, cm — the cavity block's depth in the tool build-up. */
  depthCm?: number;
  runnerSystem?: 'cold' | 'hot';
  /** Hot-runner drops per cavity when hot (large parts take several). */
  dropsPerCavity?: number;
  /** Shot volume for n cavities, cm³ — the press must shoot it within SHOT_USE_MAX of its barrel. */
  shotCm3For?: (n: number) => number;
  /** The mould's short side for n cavities, mm — it must pass between the tie bars. */
  mouldShortSideFor?: (n: number) => number;
  /** Clamp area multiplier for the runner (a cold runner adds its own projected area). */
  runnerAreaFactor?: number;
  annualVolume: number;
  sideActionsLifters: number;
  /** turns annual volume into programme shots for the steel class. */
  programmeYears?: number;
  /** the mapper amortises tooling over this; defaults to the annual volume. */
  amortizationVolume?: number;
  candidates?: readonly number[];
  maxClampTonnes?: number;
  oee?: number;
  manning?: number;
  labourEfficiency?: number;
  rejectRate?: number;
  labourId?: string;
  library?: RateLibrary;
}

export interface CavitationCandidate {
  n: number;
  feasible: boolean;
  clampTonnes: number;
  pressId: string;
  pressRatePerHr: number;
  steelClass: MouldSteelClass;
  mouldLife: number;
  mouldCostGBP: number;
  /** machine + labour, £/part at UK base rates. */
  machineLabourPerPart: number;
  /** amortised mould NRE, £/part. */
  toolingPerPart: number;
  costPerPart: number;
  detail: string;
}

export interface CavitationChoice {
  chosen: CavitationCandidate;
  /** feasible candidates, cheapest first (chosen is [0]). */
  alternatives: CavitationCandidate[];
  /** candidates the largest press cannot close, with the tonnage that killed them. */
  infeasible: Array<{ n: number; clampTonnes: number }>;
  savingVsNext: number;
  basis: string;
}

const fmtGBP = (v: number, dp = 2) => `£${v.toFixed(dp)}`;

/**
 * Rank the feasible cavitations in pounds and return the cheapest, losers
 * priced in the basis. n=1 is always kept even above the clamp cap — the press
 * ladder already answers an oversize part with the largest press, and refusing
 * to cost the part at all would be worse than the shipped honest answer.
 */
export function optimiseCavitation(p: CavitationInputs): CavitationChoice {
  const library = p.library ?? activeRates();   // the costed country's book (rate-context.ts) — it was the UK's
  const years = p.programmeYears ?? 5;
  const amortVol = Math.max(1, p.amortizationVolume ?? p.annualVolume);
  const maxClamp = p.maxClampTonnes ?? 3500;
  const oee = p.oee ?? 0.80;
  const manning = p.manning ?? 1;
  const labourEff = p.labourEfficiency ?? 0.92;
  const reject = p.rejectRate ?? 0.03;
  const labourRate = library.labour.find(l => l.id === (p.labourId ?? 'lab-uk-semiskilled'))
    ?.fullyLoadedRatePerHr ?? 19.80;

  // The tool is the toolmaker build-up alone. It used to be level-scaled by
  // √(kernel / build-up) — the kernel's figure is B-rep face count × £120 plus
  // £8,000 per undercut face, capped at £200k, and the scaling dragged the one
  // tool we hold a quotation for (the bumper, £420k; build-up £424k) towards the
  // cap. (Injection-moulding review, 2 Oct 2026.)
  const mould = (n: number, cls: MouldSteelClass) => estimateMouldCost({
    cavities: n, projectedAreaCm2: p.areaPerCavityCm2 * n, steelClass: cls,
    sideActionsLifters: p.sideActionsLifters, runnerSystem: p.runnerSystem ?? 'cold',
    ...(p.runnerSystem === 'hot' ? { hotRunnerDrops: n * Math.max(1, p.dropsPerCavity ?? 1) } : {}),
    ...(p.depthCm ? { depthCm: p.depthCm } : {}),
  }).total;
  const all: CavitationCandidate[] = [];
  const infeasible: Array<{ n: number; clampTonnes: number }> = [];

  for (const n of p.candidates ?? [1, 2, 4, 8]) {
    const clampTonnes = Math.round(estimateClampingTonnage({
      projectedAreaCm2: p.areaPerCavityCm2 * n * (p.runnerAreaFactor ?? 1),
      cavityPressureMPa: p.cavityPressureMPa,
    }));
    const feasible = clampTonnes <= maxClamp || n === 1;
    if (!feasible) { infeasible.push({ n, clampTonnes }); continue; }

    const pressId = pickIMMPressId(clampTonnes, {
      ...(p.shotCm3For ? { shotCm3: p.shotCm3For(n) } : {}),
      ...(p.mouldShortSideFor ? { mouldShortSideMm: p.mouldShortSideFor(n) } : {}),
    });
    const rate = library.machines.find(m => m.id === pressId)?.computedRatePerHr ?? 0;
    const steel = steelClassFor((p.annualVolume * years) / n);
    const mouldCostGBP = Math.round(mould(n, steel.cls));
    const shotSec = p.cycleSecondsFor ? p.cycleSecondsFor(pressId, n) : p.shotSeconds;
    const shotHr = (shotSec / 3600) / (1 - reject);
    const numMoulds = Math.max(1, Math.ceil((amortVol / n) / steel.life));
    const toolingPerPart = mouldCostGBP * numMoulds / amortVol;
    const machineLabourPerPart = shotHr * (rate / oee + labourRate * manning / labourEff) / n;
    const costPerPart = Math.round((machineLabourPerPart + toolingPerPart) * 10_000) / 10_000;

    all.push({
      n, feasible: true, clampTonnes, pressId, pressRatePerHr: rate,
      steelClass: steel.cls, mouldLife: steel.life, mouldCostGBP,
      machineLabourPerPart: Math.round(machineLabourPerPart * 10_000) / 10_000,
      toolingPerPart: Math.round(toolingPerPart * 10_000) / 10_000,
      costPerPart,
      detail: `${pressId} £${rate.toFixed(2)}/hr, ${shotSec.toFixed(1)} s shot, ${steel.cls} tool `
        + `£${mouldCostGBP.toLocaleString()} → ${fmtGBP(toolingPerPart, 4)}/part NRE`
        + (clampTonnes > maxClamp ? ` (${clampTonnes} t exceeds the largest press — costed on it regardless)` : ''),
    });
  }

  // Cheapest first; exact ties go to fewer cavities (lower tooling risk).
  all.sort((a, b) => a.costPerPart - b.costPerPart || a.n - b.n);
  const chosen = all[0];
  const next = all[1];
  const savingVsNext = next ? Math.round((next.costPerPart - chosen.costPerPart) * 10_000) / 10_000 : 0;

  const basis = `cost-ranked ${all.length} cavitation(s) at ${p.annualVolume.toLocaleString()}/yr: `
    + all.map(c => `${c.n}-up ${fmtGBP(c.costPerPart, 4)}/part (${c.detail})`).join(' vs ')
    + ` → ${chosen.n}-up`
    + (next ? `, ${fmtGBP(savingVsNext, 4)}/part cheaper than ${next.n}-up` : '')
    + (infeasible.length
      ? `; ${infeasible.map(i => `${i.n}-up infeasible (${i.clampTonnes.toLocaleString()} t > ${maxClamp.toLocaleString()} t largest press)`).join(', ')}`
      : '')
    + ' — machine+labour+tool NRE; material cancels (runner is per-shot)';

  return { chosen, alternatives: all, infeasible, savingVsNext, basis };
}
