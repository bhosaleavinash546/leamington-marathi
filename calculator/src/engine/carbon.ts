import type { MaterialRate, RateLibrary, PartCostResult, UniversalStackInput } from './types.js';

/**
 * Carbon co-costing — embodied CO₂e (kg) per part, alongside the £ should-cost.
 *
 * Cradle-to-gate estimate = material production + process energy (region grid)
 * + inbound logistics. Increasingly an RFQ requirement in automotive/aerospace,
 * and it reuses data the cost model already has (mass, commodity, region).
 *
 * Confidence is LOW/indicative — factors are representative cradle-to-gate values
 * (kgCO₂e/kg, kWh/kg, kgCO₂e/kWh); swap for supplier-specific EPDs when available.
 */

export interface CarbonEstimate {
  materialKgCO2e: number;
  processKgCO2e: number;
  logisticsKgCO2e: number;
  totalKgCO2e: number;
  perNetKgCO2e: number;      // total ÷ net part weight
  gridKgPerKwh: number;
  processKwh: number;
  materialFactorKgPerKg: number;
  materialClass: string;
  notes: string[];
}

// ── Material production intensity (kgCO₂e per kg, cradle-to-gate, representative) ──
// Metals are far higher than commodity plastics; recycled/secondary content lowers them.
function materialCarbonFactor(m: MaterialRate | undefined): { factor: number; cls: string } {
  const s = `${m?.category ?? ''} ${m?.grade ?? ''} ${m?.id ?? ''}`.toLowerCase();
  const has = (...k: string[]) => k.some(x => s.includes(x));
  // Metals
  if (has('titanium')) return { factor: 35.0, cls: 'Titanium' };
  if (has('nickel', 'inconel', 'superalloy')) return { factor: 14.0, cls: 'Ni superalloy' };
  if (has('alumin')) return { factor: 8.6, cls: 'Aluminium (primary mix)' };
  if (has('magnesium')) return { factor: 18.0, cls: 'Magnesium' };
  if (has('copper', 'brass', 'bronze')) return { factor: 4.2, cls: 'Copper alloy' };
  if (has('stainless')) return { factor: 6.15, cls: 'Stainless steel' };
  if (has('electrical steel', 'silicon steel', 'grain-oriented', 'go-', 'nife', 'cofe')) return { factor: 3.0, cls: 'Electrical steel' };
  if (has('steel', 'iron', 'ferrous', 'hslä', 'hsla', 'dp', 'boron')) return { factor: 2.1, cls: 'Steel' };
  // Composites — TRUE structural laminates only. A glass-FILLED thermoplastic
  // (e.g. "PP GF30 (Short Glass)", "PA66 GF30") is NOT a GFRP composite: it is
  // mostly its base resin and is priced/emitted near it, so it must fall through
  // to the resin ladder below and pick up a small filler uplift — not the 8.1
  // structural-composite factor. Match explicit composite tokens, not bare "glass".
  if (has('carbon fibre', 'carbon fiber', 'cfrp', 'prepreg')) return { factor: 24.0, cls: 'Carbon-fibre composite' };
  if (has('gfrp', 'grp', 'smc', 'bmc', 'fibreglass', 'fiberglass', 'glass fibre', 'glass-fibre', 'glass fiber', 'glass-fiber', 'glass laminate'))
    return { factor: 8.1, cls: 'Glass-fibre composite' };
  // Plastics / elastomers — resin base factor, then a glass/mineral-fill uplift.
  const filled = /\bgf\d|\bmf\d|\bgb\d|short glass|glass.?fill|mineral.?fill|talc|\d+%\s*(glass|gf|mineral|talc)/i.test(
    `${m?.grade ?? ''} ${m?.id ?? ''}`,
  );
  const withFill = (r: { factor: number; cls: string }) =>
    filled ? { factor: Math.round(r.factor * 1.35 * 10) / 10, cls: `${r.cls} (filled)` } : r;
  if (has('peek', 'pei', 'ultem', 'pps', 'psu')) return withFill({ factor: 8.5, cls: 'High-perf polymer' });
  if (has('pa6', 'pa66', 'pa12', 'nylon', 'polyamide')) return withFill({ factor: 7.0, cls: 'Polyamide' });
  if (has('pc/abs', 'pc-abs', 'polycarbon', 'pc ')) return withFill({ factor: 5.5, cls: 'Polycarbonate' });
  if (has('abs')) return withFill({ factor: 3.5, cls: 'ABS' });
  if (has('pmma', 'acrylic')) return withFill({ factor: 5.0, cls: 'Acrylic' });
  if (has('pbt', 'pet', 'petg', 'apet', 'cpet')) return withFill({ factor: 2.7, cls: 'Polyester (PET/PBT)' });
  if (has('pvc')) return withFill({ factor: 2.4, cls: 'PVC' });
  if (has('hips', 'gpps', 'polystyr', ' ps ')) return withFill({ factor: 3.2, cls: 'Polystyrene' });
  if (has('pp', 'polypropyl')) return withFill({ factor: 2.0, cls: 'Polypropylene' });
  if (has('pe', 'hdpe', 'ldpe', 'lldpe', 'polyethyl')) return withFill({ factor: 2.1, cls: 'Polyethylene' });
  if (has('silicone', 'lsr')) return { factor: 5.0, cls: 'Silicone' };
  if (has('epdm', 'nbr', 'rubber', 'elastomer', 'tpe', 'tpu', 'tpv')) return { factor: 3.0, cls: 'Rubber/elastomer' };
  return { factor: 3.0, cls: 'Generic (assumed)' };   // conservative default
}

// ── Process energy intensity (kWh per kg of part) by commodity — the energy-heavy step ──
const PROCESS_KWH_PER_KG: Record<string, number> = {
  machining: 1.4, sheet_metal: 0.35, sheet_metal_fab: 0.6, casting: 4.5, cast_and_machine: 5.2,
  forging: 3.2, injection_moulding: 1.1, blow_moulding: 1.0, extrusion: 0.9, thermoforming: 1.0,
  rotational_moulding: 2.4, rubber: 1.3, composites: 4.0, painting: 0.8, biw_assembly: 0.5,
  pcb_fab: 3.0, pcba: 1.5, wiring_harness: 0.2,
};

// ── Grid carbon intensity (kgCO₂e per kWh) by region code (2024-ish averages) ──
const GRID_KG_PER_KWH: Record<string, number> = {
  UK: 0.21, DE: 0.35, FR: 0.06, PL: 0.62, CN: 0.55, IN: 0.63, US: 0.37,
  MX: 0.42, VN: 0.47, TH: 0.51, JP: 0.47, KR: 0.44, IT: 0.30, ES: 0.19, TR: 0.44, BR: 0.10,
};
export function gridCarbon(region: string | undefined): number {
  return GRID_KG_PER_KWH[(region ?? 'UK').toUpperCase()] ?? 0.40;
}

// Inbound logistics: representative kgCO₂e per kg by sourcing region (road+sea to a
// Western OEM); local (UK/DE/FR) low, long-haul Asia higher.
const LOGISTICS_KG_PER_KG: Record<string, number> = {
  UK: 0.02, DE: 0.04, FR: 0.04, PL: 0.06, IT: 0.05, ES: 0.06,
  CN: 0.16, IN: 0.17, VN: 0.16, TH: 0.16, US: 0.10, MX: 0.09,
};

export interface CarbonInputs {
  result: PartCostResult;
  input: UniversalStackInput;
  library: RateLibrary;
  commodity: string;
  region: string;
}

/** Estimate embodied CO₂e (kg) for one part. */
export function computeCarbon({ input, library, commodity, region }: CarbonInputs): CarbonEstimate {
  const notes: string[] = [];
  const netKg = Math.max(0, input.rawMaterial.netWeightKg);
  const util = input.rawMaterial.materialUtilization > 0 ? input.rawMaterial.materialUtilization : 1;
  const grossKg = netKg / util;   // material produced includes the machined-off / trimmed scrap

  const mat = library.materials.find(m => m.id === input.rawMaterial.materialId);
  const { factor: matFactor, cls } = materialCarbonFactor(mat);
  // Material carbon is on the GROSS mass produced, less a recycled-scrap credit for
  // the portion recovered (scrap recovery price > 0 ⇒ the offcut re-enters the loop).
  const scrapKg = Math.max(0, grossKg - netKg);
  const recycledCreditFrac = mat && mat.scrapRecoveryPricePerKg > 0 ? 0.85 : 0;   // avoided primary production
  const materialKgCO2e = matFactor * (grossKg - scrapKg * recycledCreditFrac);
  if (recycledCreditFrac > 0 && scrapKg > 0) notes.push(`Scrap re-melt credit applied to ${(scrapKg).toFixed(3)} kg offcut.`);

  const kwhPerKg = PROCESS_KWH_PER_KG[commodity] ?? 1.2;
  const grid = gridCarbon(region);
  const processKwh = kwhPerKg * grossKg;
  const processKgCO2e = processKwh * grid;

  const logFactor = LOGISTICS_KG_PER_KG[(region ?? 'UK').toUpperCase()] ?? 0.08;
  const logisticsKgCO2e = logFactor * netKg;

  const totalKgCO2e = materialKgCO2e + processKgCO2e + logisticsKgCO2e;
  notes.push(`${cls} ${matFactor} kgCO₂e/kg · grid ${grid} kgCO₂e/kWh (${(region ?? 'UK').toUpperCase()}) · process ${kwhPerKg} kWh/kg.`);
  notes.push('Indicative cradle-to-gate estimate — replace with supplier EPDs for reporting.');

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    materialKgCO2e: r2(materialKgCO2e),
    processKgCO2e: r2(processKgCO2e),
    logisticsKgCO2e: r2(logisticsKgCO2e),
    totalKgCO2e: r2(totalKgCO2e),
    perNetKgCO2e: netKg > 0 ? r2(totalKgCO2e / netKg) : 0,
    gridKgPerKwh: grid,
    processKwh: r2(processKwh),
    materialFactorKgPerKg: matFactor,
    materialClass: cls,
    notes,
  };
}
