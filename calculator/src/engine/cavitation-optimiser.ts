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
import {
  estimateClampingTonnage, estimateMouldCost, pickIMMPressId, steelClassFor,
  type MouldSteelClass,
} from './modules/injection-moulding.js';
import { DEFAULT_RATE_LIBRARY } from './rate-library.js';
import type { RateLibrary } from './types.js';

export interface CavitationInputs {
  /** projected area of ONE cavity, cm². */
  areaPerCavityCm2: number;
  cavityPressureMPa: number;
  /** fill + pack + cool + eject, seconds — cavity-count invariant. */
  shotSeconds: number;
  annualVolume: number;
  sideActionsLifters: number;
  /** kernel parametric mould estimate — level-calibrates the NRE when present. */
  occtMouldCostGBP?: number | null;
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
  const library = p.library ?? DEFAULT_RATE_LIBRARY;
  const years = p.programmeYears ?? 5;
  const amortVol = Math.max(1, p.amortizationVolume ?? p.annualVolume);
  const maxClamp = p.maxClampTonnes ?? 3500;
  const oee = p.oee ?? 0.80;
  const manning = p.manning ?? 1;
  const labourEff = p.labourEfficiency ?? 0.92;
  const reject = p.rejectRate ?? 0.03;
  const labourRate = library.labour.find(l => l.id === (p.labourId ?? 'lab-uk-semiskilled'))
    ?.fullyLoadedRatePerHr ?? 19.80;

  // Level calibration for the mould NRE: when the kernel's parametric estimate
  // exists, the shipped 1-cavity convention is the geometric mean of advisor
  // and OCCT. Scaling every candidate by √(occt/est(1)) reproduces that blend
  // bit-for-bit at n=1 while keeping the advisor's SHAPE in n — blending each
  // candidate against the same OCCT figure would dampen NRE growth as est^0.5
  // and systematically under-charge multi-cavity tools.
  const est1 = estimateMouldCost({
    cavities: 1, projectedAreaCm2: p.areaPerCavityCm2,
    steelClass: steelClassFor(p.annualVolume * years).cls,
    sideActionsLifters: p.sideActionsLifters, runnerSystem: 'cold',
  }).total;
  // Clamped to a sane band: the geometric-mean blend reconciles two estimators
  // in the same ballpark. When they disagree by an order of magnitude one of
  // them is out of its domain, and letting the square root swing the WHOLE
  // cavitation decision on it would launder that error into the cavity count.
  const rawScale = p.occtMouldCostGBP && p.occtMouldCostGBP > 0 && est1 > 0
    ? Math.sqrt(p.occtMouldCostGBP / est1)
    : 1;
  const levelScale = Math.min(3, Math.max(1 / 3, rawScale));

  const shotHr = (p.shotSeconds / 3600) / (1 - reject);
  const all: CavitationCandidate[] = [];
  const infeasible: Array<{ n: number; clampTonnes: number }> = [];

  for (const n of p.candidates ?? [1, 2, 4, 8]) {
    const clampTonnes = Math.round(estimateClampingTonnage({
      projectedAreaCm2: p.areaPerCavityCm2 * n,
      cavityPressureMPa: p.cavityPressureMPa,
    }));
    const feasible = clampTonnes <= maxClamp || n === 1;
    if (!feasible) { infeasible.push({ n, clampTonnes }); continue; }

    const pressId = pickIMMPressId(clampTonnes);
    const rate = library.machines.find(m => m.id === pressId)?.computedRatePerHr ?? 0;
    const steel = steelClassFor((p.annualVolume * years) / n);
    const est = estimateMouldCost({
      cavities: n, projectedAreaCm2: p.areaPerCavityCm2 * n,
      steelClass: steel.cls, sideActionsLifters: p.sideActionsLifters, runnerSystem: 'cold',
    }).total;
    const mouldCostGBP = Math.round(est * levelScale);
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
      detail: `${pressId} £${rate.toFixed(0)}/hr, ${steel.cls} tool `
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
