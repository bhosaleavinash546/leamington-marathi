/**
 * CO2e per part + CBAM € line — computed from the SAME mass/energy drivers as the
 * cost engine, so cost and carbon always agree on the physics.
 *
 * Factors are INDICATIVE industry averages (worldsteel, IAI, PlasticsEurope,
 * Ember grid intensities) — good for comparing design/sourcing options, not for
 * regulatory reporting. Every output is labelled accordingly.
 */

// kg CO2e per kg of MATERIAL INPUT (cradle-to-gate, typical EU supply mix).
export const MATERIAL_CO2E_PER_KG = {
  'Steel (mild)': 2.1,
  'Steel (high-strength)': 2.3,
  'Stainless Steel 304': 4.5,
  'Cast Iron (Grey)': 1.6,
  'Cast Iron (Ductile/GJS)': 1.7,
  'Aluminium 6061': 7.0,        // EU consumption mix; primary ~16, secondary ~0.6
  'Aluminium 7075': 7.5,
  'Aluminium A356 (cast)': 5.0, // foundry alloys carry high secondary content
  'Magnesium AZ31': 14.0,
  'Titanium Ti-6Al-4V': 30.0,
  'Brass (CuZn39)': 3.5,
  'Zinc (ZAMAK 5)': 3.2,
  'Polypropylene (PP)': 1.9,
  'PA6 (Nylon)': 5.5,
  'PA66-GF30 (glass-filled)': 6.0,
  'ABS': 3.4,
  'POM (Acetal)': 3.2,
  'Polycarbonate (PC)': 3.8,
  'CFRP (Carbon Fibre)': 26.0,
};

// Process electricity/fuel intensity, kWh per kg of PART processed (indicative).
export const PROCESS_KWH_PER_KG = {
  'Die Casting (Aluminium)': 1.1,   // melt + hold + cell
  'Die Casting (Zinc)': 0.6,
  'Sand Casting': 1.0,
  'Investment Casting': 1.6,
  'Gravity Die Casting': 1.0,
  'Forging (Hot)': 0.55,            // induction to 1250 °C ≈ 0.45 kWh/kg input
  'Forging (Cold)': 0.25,
  'Stamping / Deep Drawing': 0.15,
  'Roll Forming': 0.12,
  'Hydroforming': 0.2,
  'Laser Cutting + Bending': 0.35,
  'Injection Moulding': 0.9,
  'Composite Layup (RTM)': 1.2,
  'Machining (CNC)': 1.5,           // per kg of finished part (billet route)
  'Machining (secondary ops)': 0.4,
  'Extrusion': 0.5,
  'MIG Welding Assembly': 0.3,
  'Resistance Spot Welding': 0.2,
  'Heat Treatment (batch)': 0.7,
  'E-coat (KTL)': 0.25,
  'Powder Coating': 0.35,
  'Zinc Plating': 0.3,
  'Grinding (finish)': 0.5,
  'Washing & Final Inspection': 0.05,
};

// Grid intensity, g CO2e per kWh (Ember 2024/25 vintages, rounded).
export const GRID_G_CO2_PER_KWH = {
  'Germany': 350, 'UK': 210, 'Czech Republic': 400, 'Spain': 160, 'Mexico': 420,
  'USA': 370, 'China': 530, 'India': 630, 'Korea': 410,
};

// EU-CBAM: applies to imports INTO the EU. EU production regions carry EU ETS
// costs through their rates already; the CBAM line prices the embedded carbon of
// a non-EU source at the ETS reference so region comparisons are like-for-like.
const EU_REGIONS = new Set(['Germany', 'Czech Republic', 'Spain']);
export const ETS_EUR_PER_T_CO2E = 80;   // admin-tunable reference price

/**
 * @param {{material:string, process?:string, route?:string[], region:string}} input
 * @param {{inputMassKg:number}} drivers  from the engine result (buy-to-fly mass)
 * @returns carbon block: material/process/total kg CO2e + indicative CBAM €.
 */
export function computeCarbon(input, drivers) {
  const matFactor = MATERIAL_CO2E_PER_KG[input.material];
  if (!Number.isFinite(matFactor)) return null;
  const inputMass = Number(drivers?.inputMassKg) || 0;
  const finished = Number(drivers?.finishedMassKg) || inputMass;
  const materialKg = inputMass * matFactor;

  const ops = Array.isArray(input.route) && input.route.length ? input.route : [input.process];
  const grid = (GRID_G_CO2_PER_KWH[input.region] ?? 400) / 1000;   // kg/kWh
  let processKg = 0;
  for (const op of ops) {
    const kwhPerKg = PROCESS_KWH_PER_KG[op] ?? 0.4;
    processKg += kwhPerKg * finished * grid;
  }
  const totalKg = materialKg + processKg;
  const importedToEU = !EU_REGIONS.has(input.region);
  return {
    materialKgCo2e: Number(materialKg.toFixed(2)),
    processKgCo2e: Number(processKg.toFixed(2)),
    totalKgCo2e: Number(totalKg.toFixed(2)),
    cbam: importedToEU
      ? { eur: Number((totalKg / 1000 * ETS_EUR_PER_T_CO2E).toFixed(3)), basis: `embedded CO2e × €${ETS_EUR_PER_T_CO2E}/t ETS reference — indicative, assumes EU-destined import` }
      : null,
    basis: 'Indicative industry-average factors (worldsteel/IAI/PlasticsEurope/Ember) — for option comparison, not regulatory reporting.',
  };
}
