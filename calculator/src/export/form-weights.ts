/**
 * A casting's or forging's ONE weight set (finished, as cast / as forged, billet, bought, scrap), read off the values the
 * rules set and the stack's own net / utilisation. Its own module so the screen's cost card can name the weights the
 * way the core report and the workbook do without loading the report builder (fresh review, Nov 2026).
 */
import type { UniversalStackInput } from '../engine/types.js';

/** A casting's or forging's weights, each named once: what is made, what is bought, what is sold back as scrap. */
export interface CoreWeights {
  form: 'forged' | 'cast';
  /** The finished (machined) part, kg — when the costing states it. */
  finishedKg: number | null;
  /** One forging / casting as it leaves the press or the mould (machining stock and drilled metal on), kg. */
  asFormedKg: number;
  /** Flash a forging, kg (forging only). */
  flashKg: number | null;
  /** Billet a forging = (as forged + flash) ÷ stock yield, kg (forging only). */
  billetKg: number | null;
  yieldFraction: number | null;
  /** Scrap forgings / castings, 0–1 (the stack buys and makes 1 ÷ (1 - r) a good part). */
  rejectRate: number;
  /** Bought a GOOD part (billet / poured charge ÷ (1 - reject)), kg — the material line's kg. */
  boughtKg: number;
  /** Sold back as scrap a good part, kg — the scrap-credit line's kg (0 when the loss is not scrap). */
  scrapKg: number;
  /** The set as one sentence, printed under the material split. */
  line: string;
}

/**
 * The weight set of a casting or forging read off the values the rules set (as-formed, flash, yield, reject) and the
 * stack's own net / utilisation — so page 2 (material, £/kg), page 4 (descale on the forging) and page 5 (stock yield,
 * flash) print the same weights under the same names. Null for other commodities or without the rules' as-formed weight.
 */
export function formWeights(rvs: ReadonlyArray<{ label: string; value: unknown; fieldId?: string; ruleValue?: unknown }>,
  input: UniversalStackInput, commodity: string | null): CoreWeights | null {
  const c = String(commodity ?? '');
  const forged = /forg/.test(c);
  if (!forged && !/cast/.test(c)) return null;
  const num = (re: RegExp): number | null => {
    const r = rvs.find(x => re.test(x.fieldId ?? ''));
    if (!r) return null;
    const v = Number(String(r.ruleValue ?? r.value ?? '').replace(/,/g, ''));
    return Number.isFinite(v) ? v : null;
  };
  // as-formed: the forging's part weight (as forged, CLAUDE forging notes); cast + machine's as-cast weight. Finished:
  // cast + machine's finished weight (the STEP's).
  // The CASTING route's form field (cast-part-wt) is the FINISHED weight: since secondary-machining parity (Nov 2026)
  // the route pours it with the machining stock of the rows it machines on (asCastWeight), so the material line is
  // costed on the as-cast weight the stack carries — the bracket's "£1.8355/kg as cast (2.512 kg)" divided by the
  // finished 2.512 kg while the shot-blast line said "3.04 kg as cast" (fresh review, Nov 2026).
  const castRoute = !forged && c !== 'cast_and_machine';
  const rm = input.rawMaterial;
  let asFormed: number | null;
  let finished: number | null;
  if (forged) { asFormed = num(/^forge-part-wt$/); finished = null; }
  else if (castRoute) {
    finished = num(/^cast-part-wt$/);
    // the stack's net is the poured as-cast casting with the melt shop on (rejects remelted); off, it carries the rejects
    const castReject = Math.max(0, Math.min(0.9, num(/^cast-reject$/) ?? 0));
    const net = rm?.netWeightKg ?? 0;
    const poured = rm?.lossIsNotScrap ? net : net * (1 - castReject);
    asFormed = finished && poured > finished - 1e-6 ? poured : finished;
    if (asFormed != null && finished != null && Math.abs(asFormed - finished) < 0.0005) finished = null;   // nothing machined: one weight
  } else { asFormed = num(/^cam-cast-wt$/); finished = num(/^cam-finish-wt$/); }
  if (!(asFormed && asFormed > 0)) return null;
  // the forging stack buys and makes 1 ÷ (1 − reject) a good part (modules/forging.ts); the casting stack does not fold
  // its reject into the material weights
  const reject = forged ? Math.max(0, Math.min(0.9, num(/^forge-reject$/) ?? 0)) : 0;
  const flash = forged ? Math.max(0, num(/^forge-flash$/) ?? 0) : null;
  const yieldF = forged ? num(/^forge-yield$/) : null;
  const billet = forged && yieldF && yieldF > 0 ? (asFormed + (flash ?? 0)) / yieldF : null;
  const bought = rm.materialUtilization > 0 ? rm.netWeightKg / rm.materialUtilization : rm.netWeightKg;
  const scrap = rm.lossIsNotScrap ? 0 : Math.max(0, bought - rm.netWeightKg);
  const k = (v: number) => `${v.toFixed(3)} kg`;
  const one = forged ? 'a forging' : 'a casting';
  const per = reject > 0 ? ` (÷ ${(1 - reject).toFixed(2)} for ${+(reject * 100).toFixed(1)} % scrap ${forged ? 'forgings' : 'castings'})` : '';
  const line = `Weights: ${finished ? `finished ${k(finished)} · ` : ''}as ${forged ? 'forged' : 'cast'} ${k(asFormed)} ${one}`
    + (forged && flash ? ` + flash ${k(flash)}` : '')
    + (billet ? ` · billet ${k(billet)} ${one} = (${k(asFormed)} + ${k(flash ?? 0)} flash) ÷ ${yieldF!.toFixed(3)} stock yield` : '')
    + ` · bought ${k(bought)} a good part${per}`
    + (scrap > 0 ? ` · scrap sold ${k(scrap)} a good part (bought - ${k(rm.netWeightKg)} made a good part)` : rm.lossIsNotScrap ? ' · the metal lost is not sold as scrap' : '')
    + '. The £/kg figures are on the weight of ONE ' + (forged ? 'forging as forged' : 'casting as cast') + '.';
  return { form: forged ? 'forged' : 'cast', finishedKg: finished, asFormedKg: asFormed, flashKg: flash, billetKg: billet, yieldFraction: yieldF,
    rejectRate: reject, boughtKg: bought, scrapKg: scrap, line };
}
