/**
 * Causal cost model — the agent's belief about *why* a part costs what it does.
 *
 * A should-cost number is more powerful when it knows its own drivers. For any
 * costed part we link the material bucket to the commodity index that drives it
 * (aluminium part → aluminium index, steel → steel, …) and expose:
 *
 *   • counterfactuals  — "if aluminium −10%, this part should fall £X"
 *   • quote diagnosis  — "a supplier quote of £Q implies aluminium +14% above
 *                          spot — here is your defensible counter"
 *   • what-if drift    — "if steel +10%, these N portfolio parts cross underwater"
 *
 * Deterministic and glass-box: the elasticity is just the material £ passed
 * through the same overhead/margin stack the engine already uses, so every
 * number the coach produces can be defended line-by-line. This is a *conditional*
 * model ("if the index moves"), never a price forecast — so it stays defensible
 * even when the commodity feed is an indicative benchmark rather than a live tick.
 */

/** A commodity price index the model can reason about (from the live commodity panel). */
export interface CommodityIndexRef {
  category: string;       // 'Steel', 'Aluminium', 'Copper', …
  currentPrice: number;   // current index level
  unit?: string;          // '£/t', '£/kg', …
}

/** Map a rate-library material family to a commodity index category. */
const FAMILY_TO_INDEX: Record<string, string> = {
  aluminium: 'Aluminium', aluminum: 'Aluminium',
  steel: 'Steel', 'stainless': 'Steel', 'stainless steel': 'Steel',
  'hss': 'Steel', 'mild steel': 'Steel', 'carbon steel': 'Steel', galvanised: 'Steel',
  copper: 'Copper', brass: 'Copper', bronze: 'Copper',
  magnesium: 'Magnesium', titanium: 'Titanium', zinc: 'Zinc', nickel: 'Nickel',
};

/** Normalise a family/category string to a canonical index category, or null. */
export function indexCategoryForFamily(family: string | undefined): string | null {
  if (!family) return null;
  const key = family.trim().toLowerCase();
  if (FAMILY_TO_INDEX[key]) return FAMILY_TO_INDEX[key];
  // substring fallback (e.g. "Aluminium 6061-T6")
  for (const [k, v] of Object.entries(FAMILY_TO_INDEX)) if (key.includes(k)) return v;
  return null;
}

export interface CausalDriver {
  family: string;            // the material family as costed
  indexCategory: string;     // matched commodity index category
  currentPrice: number;      // current index level
  unit: string;
  materialCostGBP: number;   // the raw-material £ this driver explains
  passThrough: number;       // (1 + overhead%)(1 + margin%) — material→total amplifier
  gbpPer1pctIndex: number;   // £ change in part TOTAL per +1% move in the index
}

export interface CausalCostModel {
  partTotal: number;
  materialCostGBP: number;
  driver: CausalDriver | null;   // primary index driver (from the material family); null if unmapped
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Build the causal model for a costed part.
 * @param overheadPct / marginPct as fractions (0.12, 0.08) — the stack the engine uses.
 */
export function buildCausalModel(args: {
  partTotal: number;
  materialCostGBP: number;
  materialFamily?: string;
  overheadPct: number;
  marginPct: number;
  indices: CommodityIndexRef[];
}): CausalCostModel {
  const { partTotal, materialCostGBP, materialFamily, overheadPct, marginPct, indices } = args;
  const cat = indexCategoryForFamily(materialFamily);
  const idx = cat ? indices.find(i => i.category.toLowerCase() === cat.toLowerCase()) : undefined;
  if (!cat || !idx || !(materialCostGBP > 0)) {
    return { partTotal, materialCostGBP, driver: null };
  }
  const passThrough = (1 + overheadPct) * (1 + marginPct);
  const gbpPer1pctIndex = (materialCostGBP / 100) * passThrough;   // full precision for math; round on display
  return {
    partTotal, materialCostGBP,
    driver: {
      family: materialFamily ?? cat, indexCategory: cat,
      currentPrice: idx.currentPrice, unit: idx.unit ?? '',
      materialCostGBP: round2(materialCostGBP),
      passThrough: round2(passThrough),
      gbpPer1pctIndex,
    },
  };
}

export interface Counterfactual {
  indexDeltaPct: number;   // the hypothetical index move
  newTotal: number;        // expected part total under that move
  deltaGBP: number;        // change in total (signed)
  deltaPct: number;        // change as % of the original total
}

/** "If the driving index moves by indexDeltaPct, this part should become …" */
export function counterfactual(model: CausalCostModel, indexDeltaPct: number): Counterfactual | null {
  if (!model.driver) return null;
  const deltaGBP = round2(model.driver.gbpPer1pctIndex * indexDeltaPct);
  const newTotal = round2(model.partTotal + deltaGBP);
  const deltaPct = model.partTotal > 0 ? round1((deltaGBP / model.partTotal) * 100) : 0;
  return { indexDeltaPct, newTotal, deltaGBP, deltaPct };
}

/**
 * Given a supplier quote above should-cost, back out the index premium the quote
 * implies IF the whole gap sits in material — i.e. "your price is only justified
 * if [Aluminium] is this far above spot." Returns null when the quote is at/below
 * should-cost or the part has no index driver.
 */
export function impliedIndexPremiumPct(model: CausalCostModel, supplierQuote: number): number | null {
  if (!model.driver || !(supplierQuote > model.partTotal) || !(model.driver.materialCostGBP > 0)) return null;
  const gapGBP = supplierQuote - model.partTotal;
  // Undo the pass-through to attribute the gap to material, then express vs material cost.
  const materialGapGBP = gapGBP / model.driver.passThrough;
  return round1((materialGapGBP / model.driver.materialCostGBP) * 100);
}

/** The defensible negotiation sentence the agent hands the buyer. */
export function coachSentence(model: CausalCostModel, supplierQuote: number | null, fmt: (n: number) => string): string | null {
  const d = model.driver;
  if (!d) return null;
  const base = `Material is ${fmt(d.materialCostGBP)} of this part, driven by ${d.indexCategory} at ${d.currentPrice.toLocaleString()}${d.unit ? ' ' + d.unit : ''}. Every 1% move in the ${d.indexCategory} index shifts the piece price by ${fmt(d.gbpPer1pctIndex)}.`;
  if (supplierQuote && supplierQuote > model.partTotal) {
    const prem = impliedIndexPremiumPct(model, supplierQuote);
    if (prem !== null && prem > 0) {
      return `${base} A quote of ${fmt(supplierQuote)} is only justified if ${d.indexCategory} were ~${prem}% above today's index — ask the supplier to show that, or hold at ${fmt(model.partTotal)}.`;
    }
  }
  return base;
}

// ── Portfolio what-if (conditional, defensible — not a forecast) ───────────────

export interface PortfolioCase {
  partName: string;
  commodity: string;
  materialFamily?: string;
  totalCost: number;
  actualCost?: number;
  materialCostGBP: number;   // from the stored breakdown.rawMaterial
  overheadPct?: number;      // optional; defaults applied if absent
  marginPct?: number;
}

export interface ScenarioImpact {
  partName: string;
  commodity: string;
  indexCategory: string;
  currentTotal: number;
  scenarioTotal: number;
  deltaGBP: number;
  crossesUnderwater: boolean;    // scenario pushes actual below should-cost (was above)
  crossesRenegotiation: boolean; // scenario pushes should-cost above actual (opens a gap)
}

/**
 * Apply a hypothetical index move per commodity category to every portfolio case
 * and report which parts change status. Conditional ("if X moves"), so it stays
 * defensible regardless of feed quality.
 */
export function scenarioPortfolioDrift(
  cases: PortfolioCase[],
  indexDeltaByCategory: Record<string, number>,   // e.g. { Steel: 10, Aluminium: -5 }
  defaults: { overheadPct: number; marginPct: number } = { overheadPct: 0.12, marginPct: 0.08 },
): ScenarioImpact[] {
  const out: ScenarioImpact[] = [];
  for (const c of cases) {
    const cat = indexCategoryForFamily(c.materialFamily);
    if (!cat) continue;
    const deltaPct = indexDeltaByCategory[cat];
    if (deltaPct === undefined || deltaPct === 0) continue;
    const oh = c.overheadPct ?? defaults.overheadPct;
    const mg = c.marginPct ?? defaults.marginPct;
    const passThrough = (1 + oh) * (1 + mg);
    const deltaGBP = round2((c.materialCostGBP / 100) * passThrough * deltaPct);
    const scenarioTotal = round2(c.totalCost + deltaGBP);
    const actual = c.actualCost;
    // Was the actual above should-cost (a renegotiation lead)? Does the scenario flip it?
    const wasUnder = actual !== undefined && actual < c.totalCost;       // supplier below should-cost today
    const nowUnder = actual !== undefined && actual < scenarioTotal;     // …and below the higher scenario should-cost
    const wasGap = actual !== undefined && actual > c.totalCost;
    const nowGap = actual !== undefined && actual > scenarioTotal;
    out.push({
      partName: c.partName, commodity: c.commodity, indexCategory: cat,
      currentTotal: c.totalCost, scenarioTotal, deltaGBP,
      crossesUnderwater: !wasUnder && nowUnder,       // scenario newly makes the supplier underwater
      crossesRenegotiation: !wasGap && nowGap,        // scenario newly opens a renegotiation gap
    });
  }
  return out.sort((a, b) => Math.abs(b.deltaGBP) - Math.abs(a.deltaGBP));
}
