// ─────────────────────────────────────────────────────────────────────────────
// Should-cost calibration fixtures.
//
// Each fixture is a representative automotive part with a REFERENCE piece-price
// the deterministic engine is scored against. `tol` is the acceptable ± band
// (parametric costing is a band, not a point).
//
// IMPORTANT: the reference prices below are ILLUSTRATIVE anchors derived from
// public teardown/industry norms — they are NOT proprietary supplier quotes.
// Replace `refPriceEur` / `tol` with your own validated quotes to turn this into
// a real accuracy gate; the harness structure does not change.
//
// refPriceEur — landed piece price in EUR at the stated annual volume/region.
// tol         — fractional tolerance (0.30 = ±30%).
// source      — basis for the reference (for auditability).
// ─────────────────────────────────────────────────────────────────────────────

export const COST_FIXTURES = [
  {
    name: 'Steering knuckle (ductile iron, sand cast)',
    input: { material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting', weightKg: 6.7, annualVolume: 200000, region: 'China' },
    refPriceEur: 12.5, tol: 0.30,
    source: 'Public teardown norm: cast ductile-iron knuckle ~€10–14 at 200k/yr, China.',
  },
  {
    name: 'Suspension bracket (Al, high-pressure die cast)',
    input: { material: 'Aluminium A356 (cast)', process: 'Die Casting (Aluminium)', weightKg: 1.2, annualVolume: 150000, region: 'Germany' },
    refPriceEur: 8.5, tol: 0.30,
    source: 'HPDC Al structural bracket ~€7–10 at 150k/yr, EU plant.',
  },
  {
    name: 'Stamped steel bracket',
    input: { material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 0.8, annualVolume: 300000, region: 'Czech Republic' },
    refPriceEur: 1.8, tol: 0.35,
    source: 'Progressive-die mild-steel bracket ~€1.2–2.2 at 300k/yr, EU-East.',
  },
  {
    name: 'PP clip housing (injection moulded)',
    input: { material: 'Polypropylene (PP)', process: 'Injection Moulding', weightKg: 0.15, annualVolume: 500000, region: 'China' },
    refPriceEur: 0.70, tol: 0.35,
    source: 'Small PP moulded housing ~€0.5–0.9 at 500k/yr, China.',
  },
  {
    name: 'Forged control arm (high-strength steel)',
    input: { material: 'Steel (high-strength)', process: 'Forging (Hot)', weightKg: 2.5, annualVolume: 120000, region: 'Spain' },
    refPriceEur: 10.0, tol: 0.30,
    source: 'Hot-forged HSS control arm ~€8–12 at 120k/yr, EU-South.',
  },
  {
    name: 'CNC-machined aluminium fitting (low volume)',
    input: { material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 0.4, annualVolume: 40000, region: 'Germany' },
    refPriceEur: 13.0, tol: 0.30,
    source: 'Billet-machined Al fitting ~€11–16 at 40k/yr, EU.',
  },
  {
    name: 'CNC-machined steel bracket (mid volume)',
    input: { material: 'Steel (mild)', process: 'Machining (CNC)', weightKg: 0.9, annualVolume: 25000, region: 'Germany' },
    refPriceEur: 24.0, tol: 0.30,
    source: 'Billet-machined steel bracket ~€19–29 at 25k/yr, EU (slower MRR than Al).',
  },
  {
    name: 'CNC-machined aluminium housing (larger, low volume)',
    input: { material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 1.5, annualVolume: 15000, region: 'USA' },
    refPriceEur: 46.0, tol: 0.30,
    source: 'Billet-machined Al housing ~€38–55 at 15k/yr, US.',
  },
  {
    name: 'Zinc die-cast lock cam',
    input: { material: 'Zinc (ZAMAK 5)', process: 'Die Casting (Zinc)', weightKg: 0.12, annualVolume: 200000, region: 'China' },
    refPriceEur: 1.10, tol: 0.35,
    source: 'ZAMAK die-cast latch cam ~€0.8–1.6 at 200k/yr, China.',
  },
  {
    name: 'Roll-formed steel rail',
    input: { material: 'Steel (mild)', process: 'Roll Forming', weightKg: 3.0, annualVolume: 250000, region: 'Mexico' },
    refPriceEur: 3.2, tol: 0.30,
    source: 'Roll-formed mild-steel rail ~€3–6 at 250k/yr, NAFTA.',
  },
  {
    name: 'Investment-cast 304 bracket',
    input: { material: 'Stainless Steel 304', process: 'Investment Casting', weightKg: 0.8, annualVolume: 20000, region: 'Germany' },
    refPriceEur: 24.0, tol: 0.30,
    source: 'EU stainless investment casting ~€18–35/kg (shell route), raw+fettled, 20k/yr.',
  },
  {
    name: 'LPDC aluminium head (gravity/permanent-mould model)',
    input: { material: 'Aluminium A356 (cast)', process: 'Gravity Die Casting', weightKg: 6.0, annualVolume: 100000, region: 'Germany' },
    refPriceEur: 30.0, tol: 0.30,
    source: 'Low-pressure/permanent-mould Al casting ~€4–6/kg raw at 100k/yr, EU.',
  },
  {
    name: 'Cold-headed high-strength bolt (M10-class)',
    input: { material: 'Steel (high-strength)', process: 'Forging (Cold)', weightKg: 0.02, annualVolume: 5000000, region: 'China' },
    refPriceEur: 0.10, tol: 0.40,
    source: 'Traceable automotive cold-headed 10.9 fastener ~€0.06–0.15 at 5M/yr, Asia.',
  },
];
