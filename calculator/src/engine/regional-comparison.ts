/**
 * The country comparison, by RE-COSTING the part in each country's rate book.
 *
 * `computeRegionalComparison` estimates a country by scaling the costed breakdown
 * with a handful of multipliers (material × one factor, process × the machine
 * multiplier, labour × the semi-skilled ratio). That is not what selecting the
 * country does — `buildRegionalLibrary` re-prices every material by family,
 * every labour grade by category and re-tariffs every machine's energy — so the
 * table's China row and a China costing of the same part disagreed. This runs
 * the part through `computeUniversalStack` in each book instead, so a row IS the
 * costing that selecting that country would give.
 *
 * What the input carries as £ rather than as a rate is moved explicitly:
 * tooling by the toolroom factor (a tool is built where the part is made),
 * overhead %, packaging and logistics by the region's shop multipliers — the
 * same `regionalShopDefaults` the country switch applies.
 */
import type { RateLibrary, UniversalStackInput } from './types.js';
import { computeUniversalStack } from './core.js';
import {
  REGIONAL_DATA, DEFAULT_RC_REGIONS, LANDED_ADDERS, buildRegionalLibrary, toolroomFactorFor,
  type ManufacturingRegion, type RegionalComparisonRow,
} from './regional-rates.js';
import { withRates } from './rate-context.js';

export function computeRegionalComparisonExact(
  input: UniversalStackInput,
  baseLibrary: RateLibrary,
  opts: {
    regions?: ManufacturingRegion[]; sourceRegion?: ManufacturingRegion; baseRegion?: ManufacturingRegion; landed?: boolean;
    /** The headline result in the source country — its row shows exactly that. */
    sourceResult?: { breakdown: import('./types.js').Breakdown8Bucket; total: number };
  } = {},
): RegionalComparisonRow[] {
  const source = opts.sourceRegion ?? 'UK';
  const base = opts.baseRegion ?? source;
  const regions = [...new Set([...(opts.regions ?? DEFAULT_RC_REGIONS), source])];
  const src = REGIONAL_DATA[source] ?? REGIONAL_DATA.UK;
  const rows = regions.map((code): RegionalComparisonRow | null => {
    const rd = REGIONAL_DATA[code];
    if (!rd) return null;
    const lib = code === 'UK' ? baseLibrary : buildRegionalLibrary(baseLibrary, code);
    const inR: UniversalStackInput = {
      ...input,
      tooling: { ...input.tooling, totalToolingCost: input.tooling.totalToolingCost * toolroomFactorFor(code) / (toolroomFactorFor(source) || 1) },
      overheadPct: input.overheadPct * rd.overheadMultiplier / (src.overheadMultiplier || 1),
      packagingPerPart: input.packagingPerPart * rd.packagingMultiplier / (src.packagingMultiplier || 1),
      logisticsPerPart: input.logisticsPerPart * rd.logisticsMultiplier / (src.logisticsMultiplier || 1),
    };
    const r = code === source && opts.sourceResult ? opts.sourceResult : withRates(lib, () => computeUniversalStack(inR, lib));
    const b = r.breakdown;
    const exWorks = b.rawMaterial + b.process + b.labour + b.tooling + b.overhead;
    const add = opts.landed ? (LANDED_ADDERS[code] ?? { duty: 0.05, shipping: 0.05 }) : { duty: 0, shipping: 0 };
    const total = r.total + exWorks * add.duty + exWorks * add.shipping;
    return {
      code, name: rd.name, currency: rd.currency,
      material: b.rawMaterial, process: b.process, labour: b.labour, tooling: b.tooling, overhead: b.overhead,
      exWorks, packaging: b.packaging, logistics: b.logistics, margin: b.margin,
      total, vsBasePct: 0, isBase: code === base,
    };
  }).filter((x): x is RegionalComparisonRow => x !== null);
  const baseTotal = rows.find(r => r.code === base)?.total ?? rows[0]?.total ?? 0;
  rows.forEach(r => { r.vsBasePct = baseTotal > 0 ? ((baseTotal - r.total) / baseTotal) * 100 : 0; });
  return rows;
}
