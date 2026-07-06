/**
 * Material → commodity bridge
 * ------------------------------------------------------------------
 * The should-cost engine's `MATERIALS[key].price` (€/kg) is a static library
 * baseline. This module maps each grade to a live commodity in the server's
 * `priceCache` and derives an effective €/kg = commodity €/kg × factor + premium,
 * so the deterministic estimate MOVES with the LME / EU steel index instead of a
 * frozen seed. `factor` covers alloying/loss vs the pure exchange metal; `premium`
 * covers the semi-fabrication step (ingot→casting alloy, coil→blank, etc.).
 *
 * Only mapped materials with a live price are overridden; everything else keeps
 * its library baseline. Nothing here mutates global state — callers get a fresh
 * library clone plus a per-material `basis` for audit/UI disclosure.
 */

// material key → { commodityKey, factor, premium (€/kg), note }
// factor/premium chosen so the live-derived €/kg lands on the library baseline at
// the seed commodity values, then tracks the commodity from there.
export const MATERIAL_COMMODITY_MAP = {
  'Steel (mild)':             { commodityKey: 'steel_hrc_eu',  factor: 1.0,  premium: -0.09, note: 'HRC coil, tracks EU steel index' },
  // Cast irons have no daily foundry-melt index — proxied to the EU steel index
  // (scrap-charge economics track it) and flagged `proxy` so the UI is honest.
  'Cast Iron (Grey)':         { commodityKey: 'steel_hrc_eu',  factor: 0.704, premium: 0, proxy: true, note: 'proxy: EU steel index (foundry melt-charge basis)' },
  'Cast Iron (Ductile/GJS)':  { commodityKey: 'steel_hrc_eu',  factor: 0.817, premium: 0, proxy: true, note: 'proxy: EU steel index (foundry melt-charge basis)' },
  'Steel (high-strength)':    { commodityKey: 'dp780_ahss',    factor: 1.0,  premium: 0.10, note: 'AHSS grade + premium' },
  'Stainless Steel 304':      { commodityKey: 'stainless_304',  factor: 1.0,  premium: 0.00, note: '304 flat product' },
  'Aluminium 6061':           { commodityKey: 'aluminium_lme', factor: 1.0,  premium: 0.15, note: 'LME Al + 6xxx billet/extrusion premium' },
  'Aluminium 7075':           { commodityKey: 'aluminium_lme', factor: 1.0,  premium: 1.50, note: 'LME Al + 7xxx aerospace-grade premium' },
  'Aluminium A356 (cast)':    { commodityKey: 'al_hpdc_a380',  factor: 1.0,  premium: -0.25, note: 'Foundry casting alloy (A356 slightly below A380)' },
  'Magnesium AZ31':           { commodityKey: 'magnesium_ingot', factor: 1.0, premium: 1.00, note: 'Mg ingot + wrought-alloy premium' },
  'Brass (CuZn39)':           { commodityKey: 'copper_lme',    factor: 0.61, premium: -0.64, note: '0.61·Cu (CuZn39), tracks copper' },
  'Zinc (ZAMAK 5)':           { commodityKey: 'zinc_lme',      factor: 1.0,  premium: -0.20, note: 'LME Zn + ~4% Al alloying' },
  'Polypropylene (PP)':       { commodityKey: 'pp_td20',       factor: 1.0,  premium: 0.00, note: 'PP compound' },
  'PA6 (Nylon)':              { commodityKey: 'pa6_gf30',      factor: 1.0,  premium: 0.00, note: 'PA6 compound' },
  'PA66-GF30 (glass-filled)': { commodityKey: 'pa66_gf30',     factor: 1.0,  premium: -0.10, note: 'PA66-GF30 compound' },
  'ABS':                      { commodityKey: 'abs_auto',      factor: 1.0,  premium: 0.00, note: 'ABS automotive grade' },
  'POM (Acetal)':             { commodityKey: 'pom_acetal',    factor: 1.0,  premium: -0.30, note: 'POM (acetal)' },
  // NOTE: no live mapping for CFRP (baseline is raw-fibre €/kg, the only commodity
  // is finished prepreg at ~3x — different product form), Titanium, cast irons,
  // or polycarbonate — no matching mass commodity exists, so they keep baseline.
};

// Normalise a priceCache entry to €/kg. Returns null for non-mass units
// (€/kWh, €/kW, …) which cannot price a material by mass.
export function commodityPerKg(entry) {
  if (!entry || typeof entry.value !== 'number' || !Number.isFinite(entry.value)) return null;
  switch (entry.unit) {
    case '€/kg': return entry.value;
    case '€/t':  return entry.value / 1000;
    default:     return null;
  }
}

/**
 * Return a library clone whose mapped MATERIALS carry live-derived €/kg, plus a
 * `priceBasis` map (per material: commodity, its €/kg, factor, premium, effective
 * €/kg) and `pricedAt` (the price vintage) for disclosure. Materials without a
 * mapping or a usable live price keep their baseline price untouched.
 *
 * @param {object} library  active library { MATERIALS, PROCESSES, REGIONS, constants }
 * @param {{data:object,lastRefresh:number}} priceCache  server commodity cache
 */
export function applyLiveMaterialPrices(library, priceCache) {
  const data = priceCache?.data || {};
  const materials = {};
  const priceBasis = {};
  for (const [key, mat] of Object.entries(library.MATERIALS)) {
    const map = MATERIAL_COMMODITY_MAP[key];
    const perKg = map ? commodityPerKg(data[map.commodityKey]) : null;
    const effective = (map && perKg != null) ? perKg * map.factor + map.premium : null;
    // Guard against a bad/crashed commodity print (esp. with negative premiums):
    // if the derived price is implausible (< 25% of the library baseline) fall back
    // to the baseline rather than serve a near-zero "live" €/kg.
    if (effective != null && effective >= 0.25 * mat.price) {
      materials[key] = { ...mat, price: Number(effective.toFixed(4)) };
      priceBasis[key] = {
        commodityKey: map.commodityKey,
        commodityLabel: data[map.commodityKey]?.label || map.commodityKey,
        commodityPerKg: Number(perKg.toFixed(4)),
        factor: map.factor,
        premium: map.premium,
        effectivePerKg: Number(effective.toFixed(4)),
        ...(map.proxy ? { proxy: true } : {}),
        note: map.note,
      };
    } else {
      materials[key] = mat;   // keep baseline
    }
  }
  return {
    library: { ...library, MATERIALS: materials },
    priceBasis,
    pricedAt: priceCache?.lastRefresh ? new Date(priceCache.lastRefresh).toISOString() : null,
  };
}
