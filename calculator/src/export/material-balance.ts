/**
 * The MATERIAL BALANCE of a casting or forging costing (PKG-6 / CF-17, CF-18, Nov 2026): what is bought, what is made,
 * what machining removes and where the rest goes — input → raw part → finished → removed → losses, each stream marked
 * credited, remelted in house, recoverable but not credited, or not recoverable. ONE model, printed by the cost card, the
 * core PDF, the audit pack and the workbook.
 *
 * Every kg is one the costing already holds: the stack's net and utilisation (bought, made), the rules' weight set
 * (`formWeights`: as cast / as forged, finished, flash, yield, reject), the saw kerf rule, the poured weight the melt
 * energy line states, and the machining-stock components the as-cast / as-forged weight rule printed in its basis. A
 * stream the costing does not hold is listed as "not itemised by this costing" (a forging's scale and crop are inside
 * its stock-yield ratio) — never estimated here.
 *
 * CF-18: the screen said "near-net (no extra material)" while the as-cast weight carried 0.527 kg of machining stock on
 * the bracket. The balance states the stock instead — "as cast X kg = finished Y kg + machining stock Z kg" — and names
 * its parts as the rule costed them: the face stock (a casting's assumed RMA + ½ DCTG, a forging's IS 3469 finish
 * stock), the turning stock (2 mm a side, engineering-typical, not sourced), holes drilled from solid and draft metal.
 * No value changes.
 */
import type { UniversalStackInput, PartCostResult, CommodityType } from '../engine/types.js';
import { formWeights } from './form-weights.js';

type RuleValue = { label: string; value: unknown; fieldId?: string; basis?: string; ruleValue?: unknown; edited?: boolean };

export type BalanceStage = 'input' | 'internal' | 'raw' | 'finished' | 'removed' | 'loss';
export type BalanceRecovery = 'bought' | 'part' | 'in process' | 'credited' | 'remelted' | 'recoverable, not credited' | 'not recoverable' | 'not itemised';

export interface BalanceLine {
  stage: BalanceStage;
  label: string;
  /** kg a good part; null when the costing does not hold it. */
  kg: number | null;
  recovery: BalanceRecovery;
  note: string;
  /** A stream the closure counts (input = finished + removed + losses). */
  inClosure: boolean;
}

/** One part of the machining stock, as the as-cast / as-forged weight rule costed it. */
export interface StockPart { label: string; cm3: number; kg: number | null; mmASide: number | null; source: string }

export interface MaterialBalance {
  form: 'cast' | 'forged';
  lines: BalanceLine[];
  /** The CF-18 statement: as formed = finished + machining stock (null when the costing holds no finished weight). */
  stock: { formedKg: number; finishedKg: number; stockKg: number; parts: StockPart[]; text: string; partsNote: string } | null;
  /** input − (finished + removed + losses), kg; null when a stream the closure needs is not held. */
  closureKg: number | null;
  closes: boolean | null;
  /** kg a good part by treatment, and the credit the stack gave (= the bridge's scrap / return credit). */
  summary: { creditedKg: number; recoverableNotCreditedKg: number; remeltedKg: number | null; notRecoverableKg: number; notItemisedKg: number };
  scrapPricePerKg: number;
  creditGbp: number;
  notItemised: string[];
  note: string;
}

const n = (s: string | undefined) => (s == null ? NaN : Number(s.replace(/,/g, '')));
const k3 = (v: number) => `${v.toFixed(3)} kg`;

/** The machining-stock components an as-cast / as-forged weight rule printed in its basis (casting.ts asCastBasis,
 *  forging.ts forgedBasis), and the density it states. Empty when the basis does not itemise them. */
export function stockPartsFromBasis(basis: string | undefined, form: 'cast' | 'forged', density: number | null): StockPart[] {
  if (!basis) return [];
  const parts: StockPart[] = [];
  const kg = (cm3: number) => (density && density > 0 ? cm3 * density : null);
  const holes = /\+ ([\d,.]+) cm³ of (?:(\d+) hole\(s\)[^+]*?drilled from solid|holes drilled from solid)/.exec(basis);
  if (holes && n(holes[1]) > 0) {
    parts.push({ label: `Holes drilled from solid${holes[2] ? ` (${holes[2]})` : ''}`, cm3: n(holes[1]), kg: kg(n(holes[1])), mmASide: null,
      source: 'the measured holes the casting / forging does not core or pierce' });
  }
  const face = /\+ ([\d,.]+) cm³ machining stock \(([\d.]+) mm a side on the machined faces/.exec(basis);
  if (face) {
    const clause = basis.slice(face.index).split(' + ')[0];   // this term only, up to the next " + "
    const source = form === 'forged'
      ? (/IS 3469/.test(clause) ? 'IS 3469 (Part I):1974 Table 1.5 minimum finish stock' : 'CostVision engineering-typical, not sourced')
      : 'assumed — engineering-typical, not sourced (under ISO 8062-3 the RMA + ½ the DCTG tolerance; neither grade is read)';
    parts.push({ label: 'Face machining stock', cm3: n(face[1]), kg: kg(n(face[1])), mmASide: Number(face[2]), source });
  }
  const turn = /\+ ([\d,.]+) cm³ turning stock on the ([\d,.]+) cm² [^(]*\(([\d.]+) mm a side/.exec(basis);
  if (turn && n(turn[1]) > 0) {
    parts.push({ label: `Turning stock on the ${turn[2]} cm² turned surface`, cm3: n(turn[1]), kg: kg(n(turn[1])), mmASide: Number(turn[3]),
      source: form === 'forged' ? 'CostVision engineering-typical, not sourced (the near-net turning stock — not the face stock\'s IS 3469 figure)'
        : 'the casting\'s face stock a side, on the turned surface' });
  }
  const draft = /\+ ([\d,.]+) cm³ draft metal/.exec(basis);
  if (draft && n(draft[1]) > 0) {
    parts.push({ label: 'Draft metal on zero-draft forged faces', cm3: n(draft[1]), kg: kg(n(draft[1])), mmASide: null, source: 'IS 3469 (Part I):1974 Table 1.4 draft angles' });
  }
  return parts;
}

/**
 * The material balance of a casting or forging (see the module header), a good part. Null for any other commodity.
 * `ruleValues` are the rules' values as the costing applied them (the report's `checks.ruleValues`; headless: the
 * provenance); `measuredWeightKg` is the finished part (measured volume × the costed grade's density) when no rule states it.
 */
export function buildMaterialBalance(a: {
  input: UniversalStackInput; result: PartCostResult; commodity: CommodityType | string | null;
  ruleValues?: ReadonlyArray<RuleValue> | null; measuredWeightKg?: number | null;
}): MaterialBalance | null {
  const c = String(a.commodity ?? '');
  const forged = /forg/.test(c);
  if (!forged && !/cast/.test(c)) return null;
  const rm = a.input.rawMaterial;
  if (rm.directCost !== undefined || !(rm.netWeightKg > 0) || !(rm.materialUtilization > 0)) return null;
  const form: 'cast' | 'forged' = forged ? 'forged' : 'cast';
  const rvs = (a.ruleValues ?? []) as RuleValue[];
  const rv = (id: string) => rvs.find(r => r.fieldId === id);
  const num = (id: string) => { const r = rv(id); const v = r ? Number(String(r.value ?? '').replace(/,/g, '')) : NaN; return Number.isFinite(v) ? v : null; };
  const edited = (r: RuleValue | undefined) => !!r && (r.edited === true || (r.ruleValue != null && String(r.ruleValue) !== String(r.value)));
  const w = formWeights(rvs.map(r => ({ label: r.label, value: r.value, fieldId: r.fieldId, ruleValue: r.ruleValue })), a.input, c);

  const traced = (f: string) => a.result.traceability.find(t => t.field === f)?.value;
  const scrapPrice = traced('material.scrapRecoveryPricePerKg') ?? 0;
  const G = rm.netWeightKg / rm.materialUtilization;   // bought a good part
  const N = rm.netWeightKg;                             // made a good part (the stack's net)
  const credited = rm.lossIsNotScrap ? 0 : G - N;
  const creditGbp = credited * scrapPrice;
  const lines: BalanceLine[] = [];
  const notItemised: string[] = [];
  const line = (l: BalanceLine) => lines.push(l);

  // the as-formed rule (its basis itemises the stock) and the finished weight
  const asFormedRv = forged ? rv('forge-part-wt') : (rv('cam-cast-wt') ?? undefined);
  const finishedRv = forged ? undefined : (rv('cam-finish-wt') ?? rv('cast-part-wt'));
  const basisFinished = asFormedRv?.basis && !edited(asFormedRv) ? /^([\d,.]+) kg finished/.exec(asFormedRv.basis)?.[1] : undefined;
  const A = w?.asFormedKg ?? null;
  // the casting route names one weight when nothing is machined (formWeights drops the finished one): finished = as cast
  const sameAsCast = !forged && w != null && w.finishedKg == null && finishedRv != null;
  const F = w?.finishedKg ?? (basisFinished ? n(basisFinished) : null) ?? (sameAsCast ? w!.asFormedKg : null)
    ?? (a.measuredWeightKg && a.measuredWeightKg > 0 ? a.measuredWeightKg : null);
  const finishedSource = w?.finishedKg != null ? 'the finished weight the costing states' : basisFinished ? 'the finished weight the as-forged rule states'
    : sameAsCast ? 'nothing machined — the casting is the part' : F != null ? 'the measured volume × the costed grade\'s density' : '';
  const word = forged ? 'forged' : 'cast';

  line({ stage: 'input', label: forged ? 'Bar bought' : 'Metal charge bought', kg: G, recovery: 'bought', inClosure: false,
    note: `net ${k3(N)} ÷ ${rm.materialUtilization.toFixed(4)} utilisation — the material line's kg` });

  let closure: number | null = null;
  let remelted: number | null = null;
  let notItemisedKg = 0;
  if (forged) {
    const r = w?.rejectRate ?? 0;
    const d = 1 / (1 - r);
    const FS = w?.flashKg ?? null;
    const y = w?.yieldFraction ?? null;
    const K = num('forge-saw-kerf');
    if (A != null && FS != null && y && y > 0) {
      const billet = (A + FS) / y;
      const kerf = K ?? 0;
      const rest = billet - A - FS;
      line({ stage: 'internal', label: 'Billet', kg: billet * d, recovery: 'in process', inClosure: false,
        note: `(${k3(A)} as forged + ${k3(FS)} flash) ÷ ${y.toFixed(3)} stock yield = ${k3(billet)} a forging${r > 0 ? `, ÷ ${(1 - r).toFixed(2)} for ${+(r * 100).toFixed(1)} % scrap forgings` : ''}` });
      if (K != null) line({ stage: 'loss', label: 'Saw kerf', kg: kerf * d, recovery: rm.lossIsNotScrap ? 'not recoverable' : 'credited', inClosure: true,
        note: `${k3(kerf)} a billet, bought as bar and lost in the cut` });
      else { notItemised.push('saw kerf (no billet cut-off rule on this costing)'); }
      line({ stage: 'loss', label: 'Flash', kg: FS * d, recovery: rm.lossIsNotScrap ? 'not recoverable' : 'credited', inClosure: true,
        note: `${k3(FS)} a forging, trimmed off (the forging's flash-and-scale input holds the flash; scale is in the line below)` });
      line({ stage: 'loss', label: 'Scale, crop ends and pierce wad', kg: rest * d, recovery: rm.lossIsNotScrap ? 'not recoverable' : 'credited', inClosure: true,
        note: `not itemised by this costing: ${k3(rest)} a billet inside the stock-yield ratio (billet − as forged − flash); the costing credits it as scrap — scale is not recoverable in practice` });
      notItemised.push('scale, crop ends and pierce wad separately (inside the stock-yield ratio)');
      if (r > 0) line({ stage: 'loss', label: 'Scrap forgings', kg: A * r * d, recovery: 'recoverable, not credited', inClosure: true,
        note: `${+(r * 100).toFixed(1)} % of forgings made are scrapped; their metal is in the costed net and not credited` });
      line({ stage: 'raw', label: 'As forged (one forging)', kg: A, recovery: 'part', inClosure: false, note: 'the raw part: finished + machining stock + drilled holes + draft metal' });
      const implied = (billet + kerf) * d;
      if (Math.abs(implied - G) > 0.0005) {
        const gap = G - implied;
        notItemisedKg += gap;
        line({ stage: 'loss', label: 'Not itemised by this costing', kg: gap, recovery: 'not itemised', inClosure: true,
          note: 'bought − the streams above: the weights on the form do not rebuild the material line (a typed figure?)' });
      }
    } else {
      line({ stage: 'loss', label: 'Bought and not in the part', kg: G - N, recovery: rm.lossIsNotScrap ? 'not recoverable' : 'credited', inClosure: true,
        note: 'flash, scale, crop and kerf — not itemised by this costing' });
      notItemised.push('flash, scale, crop and kerf separately');
      if (A != null && N > A + 0.0005) line({ stage: 'loss', label: 'Scrap forgings', kg: N - A, recovery: 'recoverable, not credited', inClosure: true, note: 'in the costed net, not credited' });
    }
  } else {
    // a casting: the charge bought is the as-cast casting + the melt loss on the returns; gating, feeders and rejected
    // castings are remelted in house (the poured weight the melt energy line states)
    const poured = /([\d,.]+) kg poured a good casting/.exec(rm.energyKwh?.basis ?? '')?.[1];
    if (poured && A != null) {
      remelted = n(poured) - A;
      line({ stage: 'internal', label: 'Poured', kg: n(poured), recovery: 'in process', inClosure: false, note: 'the melt energy line\'s poured weight a good casting' });
      line({ stage: 'internal', label: 'Gating, feeders and rejected castings', kg: remelted, recovery: 'remelted', inClosure: false,
        note: 'poured − as cast: remelted in house — not bought again, only their melt loss is (no credit)' });
    } else {
      notItemised.push('the poured weight and the remelted returns (gating, feeders, rejected castings)');
    }
    const lost = G - N;
    if (lost > 0.0000005) line({ stage: 'loss', label: rm.lossIsNotScrap ? 'Melt loss and dross' : 'Bought and not in the casting', kg: lost,
      recovery: rm.lossIsNotScrap ? 'not recoverable' : 'credited', inClosure: true,
      note: rm.lossIsNotScrap ? 'metal lost remelting the returns — bought, not credited' : 'bought − made, sold back as scrap' });
    if (A != null && N > A + 0.0005) line({ stage: 'loss', label: 'Rejected castings', kg: N - A, recovery: 'recoverable, not credited', inClosure: true,
      note: 'in the costed net (the melt shop is off), not credited' });
    if (A != null) line({ stage: 'raw', label: 'As cast (one casting)', kg: A, recovery: 'part', inClosure: false, note: 'the raw part: finished + machining stock + drilled holes' });
  }

  // finished and removed by machining
  let stock: MaterialBalance['stock'] = null;
  if (A == null) {
    notItemised.push(`the as-${word} weight (no rule weight on this costing)`);
  } else if (F == null) {
    notItemised.push('the finished weight (no measured part on this costing) — machining stock not itemised');
  } else {
    const removed = A - F;
    line({ stage: 'finished', label: 'Finished part', kg: F, recovery: 'part', inClosure: true, note: finishedSource });
    line({ stage: 'removed', label: 'Removed by machining (swarf)', kg: removed, recovery: 'recoverable, not credited', inClosure: true,
      note: `as ${word} ${k3(A)} − finished ${k3(F)}; swarf is not credited by this costing` });
    const fmlBasis = asFormedRv && !edited(asFormedRv) ? asFormedRv.basis : undefined;
    const dens = [fmlBasis, finishedRv?.basis, rv(forged ? 'forge-mat' : 'cam-mat')?.basis]
      .map(b => /× ([\d.]+) kg\/cm³/.exec(b ?? '')?.[1]).find(x => x != null);
    const parts = stockPartsFromBasis(fmlBasis, form, dens ? Number(dens) : null);
    const partsNote = parts.length ? parts.map(p => `${p.label} ${p.cm3.toFixed(1)} cm³${p.kg != null ? ` (${p.kg.toFixed(3)} kg)` : ''}`
      + `${p.mmASide != null ? ` — ${p.mmASide} mm a side` : ''}, ${p.source}`).join('; ')
      : asFormedRv && edited(asFormedRv) ? `the as-${word} weight was typed — its stock is not itemised`
      : `not itemised by this costing (the as-${word} weight is stated without its parts)`;
    stock = { formedKg: A, finishedKg: F, stockKg: removed, parts, partsNote,
      text: `As ${word} ${k3(A)} = finished ${k3(F)} + machining stock ${k3(removed)}` };
  }

  const inClosure = lines.filter(l => l.inClosure && l.kg != null);
  if (A != null && F != null) {
    closure = G - inClosure.reduce((s, l) => s + (l.kg ?? 0), 0);
  }
  const sum = (p: (l: BalanceLine) => boolean) => lines.filter(l => l.inClosure && p(l)).reduce((s, l) => s + (l.kg ?? 0), 0);
  return {
    form, lines, stock,
    closureKg: closure, closes: closure == null ? null : Math.abs(closure) < 0.001,
    summary: {
      creditedKg: sum(l => l.recovery === 'credited'), recoverableNotCreditedKg: sum(l => l.recovery === 'recoverable, not credited'),
      remeltedKg: remelted, notRecoverableKg: sum(l => l.recovery === 'not recoverable'), notItemisedKg,
    },
    scrapPricePerKg: rm.lossIsNotScrap ? 0 : scrapPrice, creditGbp, notItemised,
    note: `A good part: bought = finished + removed by machining + losses. Credited streams are sold back at the scrap price a kg (the material line's credit); `
      + `${forged ? 'swarf and scrap forgings are not credited' : 'gating, feeders and rejected castings are remelted in house (only the melt loss is bought); swarf is not credited'} by this costing.`,
  };
}

/** The balance's lines as printed — the same strings on every surface. */
export function balancePrintRows(b: MaterialBalance): Array<{ stage: string; label: string; kg: string; recovery: string; note: string }> {
  const STAGE: Record<BalanceStage, string> = { input: 'Input', internal: 'In process', raw: 'Raw part', finished: 'Finished', removed: 'Removed', loss: 'Loss' };
  return b.lines.map(l => ({ stage: STAGE[l.stage], label: l.label, kg: l.kg == null ? 'not itemised' : l.kg.toFixed(3), recovery: l.recovery, note: l.note }));
}

/**
 * The form's machined-features readout for a near-net casting or forging (CF-18): the stock the as-cast / as-forged
 * weight carries, stated — never "no extra material". `formedKg` / `finishedKg` are what the form costs (the as-cast
 * weight the casting form pours, the as-forged weight on the forging form, the finished CAD part); a missing one says
 * where the stock is without a figure.
 */
export function nearNetStockText(form: 'cast' | 'forged', formedKg: number | null, finishedKg: number | null): string {
  const word = form === 'forged' ? 'forged' : 'cast';
  if (formedKg != null && finishedKg != null && formedKg > 0 && finishedKg > 0) {
    return ` · near-net: as ${word} ${k3(formedKg)} = finished ${k3(finishedKg)} + machining stock ${k3(Math.max(0, formedKg - finishedKg))} (poured / forged, then machined off)`;
  }
  return ` · near-net: the machining stock is in the as-${word} weight costed (not itemised without a measured part)`;
}
