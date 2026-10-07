/**
 * Which rate-library grades each commodity buys — ONE table for the engine and
 * the screen (material scope review, Oct 2026).
 *
 * Matched against a material's `category`, exactly. Before this table the
 * scopes lived only in the UI, as loose substrings, and the engine had none:
 *
 *   - sheet metal (`/Sheet/`) listed the 18 PLASTIC thermoforming sheets and
 *     missed 22MnB5, Usibor and the martensitic MS grades — the hot-stamping
 *     grades of every BIW part;
 *   - machining and forging (`/Billet/`) listed the 30 aluminium EXTRUSION logs;
 *   - injection moulding listed the machining stock shapes and the masterbatches
 *     as base resins;
 *   - casting listed two machining bars (they shared "Copper Alloy");
 *   - the gear drop-down had no scope and listed all ~430 grades;
 *   - and the rules accepted ANY library id as a resin, a compound or an AI
 *     materialId — a sheet grade on a casting would have been priced as given.
 *
 * Now the screen offers only these grades and the engine costs only these
 * grades: an out-of-scope id is replaced by the commodity's representative
 * grade, and the substitution is stated (`toCostParams` → `assumed`).
 */
export const MATERIAL_SCOPE_BY_COMMODITY: Record<string, RegExp> = {
  machining: /^(Carbon Steel|Alloy Steel|Stainless Steel|Aluminium|Titanium|Copper Alloy Bar|Magnesium Alloy|Spring Steel Strip|Engineering Plastic \(Stock\)|Grey Cast Iron|Ductile Cast Iron|(Carbon|Alloy|Microalloyed|Stainless) Steel Billet|(Aluminium|Titanium|Magnesium) Forging Billet|Nickel (Superalloy|Alloy) Billet|Copper Alloy Billet)$/i,
  casting: /^(Die Cast Aluminium|Structural HPDC Aluminium|Gravity\/Sand Aluminium|Grey Cast Iron|Ductile Cast Iron|Compacted Graphite Iron|Malleable Cast Iron|White Cast Iron|Cast Carbon Steel|Cast Low-Alloy Steel|Cast Wear Steel|Cast Stainless Steel|Nickel Superalloy Casting|Copper Alloy|Zinc Die Cast|Magnesium Alloy)$/i,
  cast_and_machine: /^(Die Cast Aluminium|Structural HPDC Aluminium|Gravity\/Sand Aluminium|Grey Cast Iron|Ductile Cast Iron|Compacted Graphite Iron|Malleable Cast Iron|White Cast Iron|Cast Carbon Steel|Cast Low-Alloy Steel|Cast Wear Steel|Cast Stainless Steel|Nickel Superalloy Casting|Copper Alloy|Zinc Die Cast|Magnesium Alloy)$/i,
  forging: /^((Carbon|Alloy|Microalloyed|Stainless) Steel Billet|(Aluminium|Titanium|Magnesium) Forging Billet|Nickel (Superalloy|Alloy) Billet|Copper Alloy Billet)$/i,
  gear: /^(Carbon Steel|Alloy Steel|Stainless Steel|Copper Alloy Bar|Engineering Plastic \(Stock\)|Ductile Cast Iron|Grey Cast Iron|(Carbon|Alloy|Microalloyed|Stainless) Steel Billet)$/i,
  sheet_metal: /^((Mild|Galvanised|Electrogalvanised|Coated|Low-Carbon|IF|Bake-Hardening|High Strength|Stainless|Electrical) Steel Sheet|AHSS Sheet( \(3rd Gen\))?|Aluminium Sheet|Copper & Brass Sheet|Press-Hardening Steel|Ultra-High Strength Steel|Spring Steel Strip)$/i,
  sheet_metal_fab: /^((Mild|Galvanised|Electrogalvanised|Coated|Low-Carbon|IF|Bake-Hardening|High Strength|Stainless|Electrical) Steel Sheet|AHSS Sheet( \(3rd Gen\))?|Aluminium Sheet|Copper & Brass Sheet|Press-Hardening Steel|Ultra-High Strength Steel|Spring Steel Strip)$/i,
  injection_moulding: /^(Thermoplastic|Thermoplastic Elastomer|High-Performance Thermoplastic)$/i,
  blow_moulding: /^(Blow Moulding|Thermoplastic Elastomer)$/i,
  rotational_moulding: /^Rotational Moulding$/i,
  thermoforming: /^Thermoforming Sheet$/i,
  extrusion: /^Extrusion$/i,
  aluminium_extrusion: /^Aluminium Extrusion Billet$/i,
  rubber: /^(Rubber|Thermoplastic Elastomer)$/i,
  // EV traction motor laminations (EV propulsion build, Oct 2026).
  e_motor: /^Electrical Steel Sheet$/i,
  composites: /^Composite$/i,
  painting: /^Paint$/i,
  /** Not a commodity: the let-down additives the extrusion and thermoforming forms add to a base grade. */
  additive: /^Additive \/ Masterbatch$/i,
};

/** True when a commodity buys grades of this category (no scope → true). */
export function inMaterialScope(commodity: string, category: string): boolean {
  const re = MATERIAL_SCOPE_BY_COMMODITY[commodity];
  return re ? re.test(category) : true;
}
