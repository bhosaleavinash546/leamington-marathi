import type { RateLibrary, MachineRate, MachineRateBuildup, MaterialRate } from './types.js';
import {
  AL_PRESSES, AL_CONFORM, AL_IMPACT, AL_DOWNSTREAM, AL_ALLOYS, AL_ALLOY_LIST, AL_MARKET, AL_LINE,
  BILLET_PREMIUM_USD_PER_T, billetPriceGbpPerKg, alScrapGbpPerKg, alBilletId,
} from './al-extrusion-data.js';

export function computeMachineRateFromBuildup(b: MachineRateBuildup): number {
  const totalAnnual =
    b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost;
  return totalAnnual / (b.annualAvailableHours * b.machineUtilization);
}

function makeMachine(
  id: string,
  machineClass: string,
  b: MachineRateBuildup,
  region: string,
  sourceNote: string
): MachineRate {
  return {
    id,
    machineClass,
    buildup: b,
    computedRatePerHr: computeMachineRateFromBuildup(b),
    region,
    effectiveDate: '2026-09-29',
    sourceNote,
    confidence: 'Medium',
  };
}

// ─── Aluminium extrusion (built Oct 2026; data and sources in al-extrusion-data.ts) ──

/**
 * A machine-rate build-up from line capex: 15-year straight line, maintenance
 * 3.5% of capex, energy at the UK tariff for the line's running load, floor at
 * £110/m²/yr, indirect support 5% and finance 4% of half the capex. ESTIMATE —
 * the capex is the figure that carries the evidence (al-extrusion-data.ts).
 */
function alBuildup(capexGbp: number, runningKw: number, floorM2: number, hours = AL_LINE.hoursPerYear, util = 0.80): MachineRateBuildup {
  return {
    annualDepreciation: Math.round(capexGbp / 15),
    maintenance: Math.round(capexGbp * 0.035),
    energy: Math.round(runningKw * hours * util * 0.268),
    floorSpace: Math.round(floorM2 * 110),
    indirectSupport: Math.round(capexGbp * 0.05),
    financeCost: Math.round(capexGbp / 2 * 0.04),
    annualAvailableHours: hours,
    machineUtilization: util,
  };
}
/** Nominal line throughput, kg/h, for the running-load energy (press electricity only; billet heat is a consumable). */
const AL_PRESS_KG_PER_HR: Record<string, number> = {
  'al-ext-press-800t': 500, 'al-ext-press-1450t': 900, 'al-ext-press-1800t': 1200, 'al-ext-press-2500t': 1700,
  'al-ext-press-3600t': 2300, 'al-ext-press-5500t': 3000, 'al-ext-press-8000t': 4000,
  'al-ext-indirect-2800t': 1200, 'al-ext-hydrostatic-1600t': 600,
};
const AL_MACHINES: MachineRate[] = [
  ...AL_PRESSES.map(p => makeMachine(p.id, `Aluminium extrusion line — ${p.label}`,
    alBuildup(p.capexGbp, (AL_PRESS_KG_PER_HR[p.id] ?? 1000) * AL_LINE.pressKwhPerKg, 1200 + p.forceT * 0.6),
    'UK', `Aluminium extrusion build 2026-10. Line = press + billet log heater + puller + cooling table + stretcher + finish saw. `
      + `Capex £${(p.capexGbp / 1e6).toFixed(1)} M ESTIMATE (bare Chinese press $0.8–1.8 M at 1,450–1,800 t, $1.5–3 M at 2,000–2,500 t; full line +40–70%; European-built line costed). `
      + `Container ${p.containerMm} mm, ${p.forceT} t.`)),
  makeMachine(AL_CONFORM.id, AL_CONFORM.label, alBuildup(AL_CONFORM.capexGbp, 350, 500), 'UK',
    'Aluminium extrusion build 2026-10. Continuous rotary extrusion from rod (busbar, MPE tube, small sections). Capex ESTIMATE.'),
  makeMachine(AL_IMPACT.id, AL_IMPACT.label, alBuildup(AL_IMPACT.capexGbp, 180, 400), 'UK',
    'Aluminium extrusion build 2026-10. Cold impact extrusion of cups, cans and housings from slugs. Capex ESTIMATE.'),
  makeMachine(AL_DOWNSTREAM.ageOven.id, AL_DOWNSTREAM.ageOven.label, alBuildup(AL_DOWNSTREAM.ageOven.capexGbp, 15, 250), 'UK',
    'Aluminium extrusion build 2026-10. Batch ageing oven, ~8 t a load, 175–185 °C. Gas charged per kg as a consumable. Capex ESTIMATE.'),
  makeMachine(AL_DOWNSTREAM.sht.id, AL_DOWNSTREAM.sht.label, alBuildup(AL_DOWNSTREAM.sht.capexGbp, 60, 300), 'UK',
    'Aluminium extrusion build 2026-10. Off-line solution heat treatment and drop quench for 2xxx / 7xxx and heavy 6xxx. Capex ESTIMATE.'),
  makeMachine(AL_DOWNSTREAM.cnc.id, AL_DOWNSTREAM.cnc.label, alBuildup(AL_DOWNSTREAM.cnc.capexGbp, 30, 120, 4000), 'UK',
    'Aluminium extrusion build 2026-10. 5-axis long-bed profile machining centre — holes, slots, end machining on profiles up to 7 m. Capex ESTIMATE.'),
  makeMachine(AL_DOWNSTREAM.ctlSaw.id, AL_DOWNSTREAM.ctlSaw.label, alBuildup(AL_DOWNSTREAM.ctlSaw.capexGbp, 15, 90, 4000), 'UK',
    'Aluminium-extrusion review 2026-10. Automatic cut-to-length saw with infeed magazine, bundle clamping and deburr station — '
      + 'cuts the aged mill lengths to part length with end trims. Capex ESTIMATE; two shifts (4,000 h).'),
  makeMachine(AL_DOWNSTREAM.bender.id, AL_DOWNSTREAM.bender.label, alBuildup(AL_DOWNSTREAM.bender.capexGbp, 40, 200, 4000), 'UK',
    'Aluminium extrusion build 2026-10. CNC stretch bender for swept bumper beams and roof rails. Capex ESTIMATE.'),
  makeMachine(AL_DOWNSTREAM.anodise.id, AL_DOWNSTREAM.anodise.label, alBuildup(AL_DOWNSTREAM.anodise.capexGbp, 400, 1500), 'UK',
    `Aluminium extrusion build 2026-10. ~${AL_DOWNSTREAM.anodise.m2PerHr} m²/h. Capex ESTIMATE; published UK anodised finish £100–130/m² on cladding is a finished-product price, not the line cost.`),
  makeMachine(AL_DOWNSTREAM.powder.id, AL_DOWNSTREAM.powder.label, alBuildup(AL_DOWNSTREAM.powder.capexGbp, 300, 1200), 'UK',
    `Aluminium extrusion build 2026-10. ~${AL_DOWNSTREAM.powder.m2PerHr} m²/h incl. chrome-free pretreatment and cure. Capex ESTIMATE.`),
  makeMachine(AL_DOWNSTREAM.ecoat.id, AL_DOWNSTREAM.ecoat.label, alBuildup(AL_DOWNSTREAM.ecoat.capexGbp, 350, 1200), 'UK',
    `Aluminium extrusion build 2026-10. ~${AL_DOWNSTREAM.ecoat.m2PerHr} m²/h. Capex ESTIMATE.`),
];


/** Casting & forging materials review (Oct 2026): the grades the review found missing.
 *  Each is priced as its library SIBLING plus the change in alloy content at the 2026-09
 *  refresh's metal prices — the method the refresh itself uses — with the arithmetic in
 *  its note. Cr and Mo are the review's sourced figures; Mn and Nb are estimates. */
const CF_REVIEW_GRADES: MaterialRate[] = [
  { id: 'mat-lm6', grade: 'LM6 / EN AC-44100 (AlSi12, gravity / sand)', category: 'Gravity/Sand Aluminium', pricePerKg: 2.92, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-lm25 £2.98 −4.00% AL × £2.85 +5.00% SI × £1.00 = £2.92/kg. Metal prices: Al $3,772/t; Si £1.00/kg (library index) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-lm4', grade: 'LM4 / AlSi5Cu3 (secondary, sand / gravity)', category: 'Gravity/Sand Aluminium', pricePerKg: 2.91, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2750, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-adc12 £2.75 (secondary ingot, as LM4 is) +6.00% AL × £2.85 −6.00% SI × £1.00 +0.50% CU × £10.77 = £2.91/kg. Metal prices: Al $3,772/t; LME Cu $14,257/t; Si £1.00/kg (library index) (2026-09 refresh indices at $1.324/£).', confidence: 'Medium' },
  { id: 'mat-almg5-cast', grade: 'EN AC-51300 (AlMg5, marine sand / gravity)', category: 'Gravity/Sand Aluminium', pricePerKg: 3.08, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-lm25 £2.98 +3.00% AL × £2.85 −7.00% SI × £1.00 +5.00% MG × £1.77 = £3.08/kg. Metal prices: Al $3,772/t; SMM Mg $2,348/t; Si £1.00/kg (library index) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-a206', grade: 'A206 / AlCu4.5MgTi (high-strength premium casting)', category: 'Gravity/Sand Aluminium', pricePerKg: 3.64, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-a357 £3.20 +1.00% AL × £2.85 −7.00% SI × £1.00 +4.50% CU × £10.77 = £3.64/kg. Metal prices: Al $3,772/t; LME Cu $14,257/t; Si £1.00/kg (library index) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-zamak2', grade: 'Zamak 2 / ZL0430 (ZnAl4Cu3, high strength)', category: 'Zinc Die Cast', pricePerKg: 3.43, scrapRecoveryPricePerKg: 1.55, densityKgPerM3: 6800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-zamak3 £3.19 −3.00% ZN × £2.91 +3.00% CU × £10.77 = £3.43/kg. Metal prices: LME Cu $14,257/t; LME Zn $3,857/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-gjs450-ssf', grade: 'EN-GJS-450-10 (solution-strengthened ferritic ductile, EN 1563:2018)', category: 'Ductile Cast Iron', pricePerKg: 0.83, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-gjs400 £0.82 +1.20% SI × £1.00 = £0.83/kg. Metal prices: Si £1.00/kg (library index) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-ni-resist-d2', grade: 'EN-GJSA-XNiCr20-2 (Ni-Resist D-2, austenitic ductile)', category: 'Ductile Cast Iron', pricePerKg: 3.15, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7400, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-gjs400 £0.82 +20.00% NI × £12.38 +2.00% CR × £1.94 −£0.18 iron displaced by the alloy (22% of £0.82) = £3.15/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-gjmb350', grade: 'EN-GJMB-350-10 (blackheart malleable iron)', category: 'Malleable Cast Iron', pricePerKg: 0.66, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-gjl250 £0.64 +£0.02 low-Si white-iron charge (ESTIMATE); the malleablising anneal is a process step, not material = £0.66/kg. Metal prices:  (2026-09 refresh indices at $1.324/£ unless stated). ESTIMATE where stated.', confidence: 'Low' },
  { id: 'mat-hicr-white', grade: 'EN-GJN-HV600(XCr23) / ASTM A532 IIIA (high-Cr white iron, wear)', category: 'White Cast Iron', pricePerKg: 1.25, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-gjl250 £0.64 +25.00% CR × £1.94 +0.50% MO × £59.78 −£0.17 iron displaced by the alloy (27% of £0.64) = £1.25/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-g20mn5', grade: 'G20Mn5 / 1.6220 (QT cast steel, automotive and structural nodes)', category: 'Cast Carbon Steel', pricePerKg: 2.10, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-gs-c25 £2.10 +0.50% MN × £0.83 = £2.10/kg. Metal prices: Mn ~£0.83/kg (ESTIMATE — no FeMn index) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-g42crmo4', grade: 'G42CrMo4 / 1.7231 (low-alloy QT cast steel)', category: 'Cast Low-Alloy Steel', pricePerKg: 2.24, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-gs-c25 £2.10 +1.00% CR × £1.94 +0.20% MO × £59.78 = £2.24/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-hadfield', grade: 'G-X120Mn12 / 1.3401 (Hadfield austenitic manganese wear steel)', category: 'Cast Wear Steel', pricePerKg: 2.20, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-gs-c25 £2.10 +12.00% MN × £0.83 = £2.20/kg. Metal prices: Mn ~£0.83/kg (ESTIMATE — no FeMn index) (2026-09 refresh indices at $1.324/£ unless stated). ESTIMATE where stated.', confidence: 'Low' },
  { id: 'mat-cf8m-cast', grade: 'CF8M / 1.4408 (316 cast stainless)', category: 'Cast Stainless Steel', pricePerKg: 6.26, scrapRecoveryPricePerKg: 1.30, densityKgPerM3: 7950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-ss304-cast £5.17 +£1.088 (Aperam 316 vs 304 alloy surcharge, Sep 2026: €3,788 − €2,521/t at €1.165/£) = £6.26/kg. Metal prices:  (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-ca6nm-cast', grade: 'CA6NM / 1.4317 (13Cr-4Ni martensitic cast stainless — pumps, turbines)', category: 'Cast Stainless Steel', pricePerKg: 4.99, scrapRecoveryPricePerKg: 1.10, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-ss304-cast £5.17 −5.50% CR × £1.94 −4.00% NI × £12.38 +0.70% MO × £59.78 = £4.99/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026); LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-cd4mcun-cast', grade: 'CD4MCuN / 1.4517 (duplex cast stainless)', category: 'Cast Stainless Steel', pricePerKg: 6.51, scrapRecoveryPricePerKg: 1.30, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-ss304-cast £5.17 +7.00% CR × £1.94 −2.50% NI × £12.38 +2.00% MO × £59.78 +3.00% CU × £10.77 = £6.51/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); LME Cu $14,257/t; Mo $79.15/kg (oxide, 4 Sep 2026); LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-in713c-cast', grade: 'Inconel 713C (investment-cast superalloy — turbocharger wheels)', category: 'Nickel Superalloy Casting', pricePerKg: 43.59, scrapRecoveryPricePerKg: 8.01, densityKgPerM3: 7910, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-inconel718-cast £42.04 +21.00% NI × £12.38 −£1.05 less Nb (2% v 5%, ~£35/kg Nb — ESTIMATE) = £43.59/kg. Metal prices: LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated). ESTIMATE where stated.', confidence: 'Low' },
  { id: 'mat-lg2-gunmetal', grade: 'LG2 / CC491K (leaded gunmetal CuSn5Zn5Pb5)', category: 'Copper Alloy', pricePerKg: 11.44, scrapRecoveryPricePerKg: 4.10, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-bronze-c905 £13.66 −3.00% CU × £10.77 −5.00% SN × £41.20 +3.00% ZN × £2.91 +5.00% PB × £1.44 = £11.44/kg. Metal prices: LME Cu $14,257/t; LME Pb $1,904.5/t; LME Sn $54,550/t; LME Zn $3,857/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-ab2-cast', grade: 'AB2 / CC333G (nickel-aluminium bronze CuAl10Fe5Ni5)', category: 'Copper Alloy', pricePerKg: 9.54, scrapRecoveryPricePerKg: 3.80, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-bronze-c905 £13.66 −8.00% CU × £10.77 −10.00% SN × £41.20 −2.00% ZN × £2.91 +10.00% AL × £2.85 +5.00% NI × £12.38 +£0.02 5% Fe = £9.54/kg. Metal prices: Al $3,772/t; LME Cu $14,257/t; LME Ni $16,388/t; LME Sn $54,550/t; LME Zn $3,857/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-brass-cast-cb754', grade: 'CC754S / CuZn39Pb1Al-C (gravity / die-cast brass)', category: 'Copper Alloy', pricePerKg: 7.88, scrapRecoveryPricePerKg: 3.30, densityKgPerM3: 8450, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-brass-cz121 £7.70 +2.00% CU × £10.77 −1.50% PB × £1.44 −0.50% ZN × £2.91 = £7.88/kg. Metal prices: LME Cu $14,257/t; LME Pb $1,904.5/t; LME Zn $3,857/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-steel-c35', grade: 'C35 / 1035 (medium-carbon forging steel)', category: 'Carbon Steel Billet', pricePerKg: 0.85, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel1020 £0.82 +0.20% MN × £0.83 +£0.03 medium-carbon SBQ grade extra (ESTIMATE) = £0.85/kg. Metal prices: Mn ~£0.83/kg (ESTIMATE — no FeMn index) (2026-09 refresh indices at $1.324/£ unless stated). ESTIMATE where stated.', confidence: 'Low' },
  { id: 'mat-steel-c45', grade: 'C45 / 1045 / CK45 (medium-carbon forging steel)', category: 'Carbon Steel Billet', pricePerKg: 0.86, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel1020 £0.82 +0.20% MN × £0.83 +£0.04 medium-carbon SBQ grade extra (ESTIMATE) = £0.86/kg. Metal prices: Mn ~£0.83/kg (ESTIMATE — no FeMn index) (2026-09 refresh indices at $1.324/£ unless stated). ESTIMATE where stated.', confidence: 'Low' },
  { id: 'mat-steel-c70s6', grade: 'C70S6 (fracture-split con-rod steel)', category: 'Carbon Steel Billet', pricePerKg: 0.92, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel1020 £0.82 +0.10% MN × £0.83 +£0.10 high-carbon, S-controlled fracture-split grade extra (ESTIMATE) = £0.92/kg. Metal prices: Mn ~£0.83/kg (ESTIMATE — no FeMn index) (2026-09 refresh indices at $1.324/£ unless stated). ESTIMATE where stated.', confidence: 'Low' },
  { id: 'mat-steel-a105', grade: 'ASTM A105 (carbon steel for flanges and valve bodies)', category: 'Carbon Steel Billet', pricePerKg: 0.84, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel1020 £0.82 +0.50% MN × £0.83 +£0.02 pressure-part certification extra (ESTIMATE) = £0.84/kg. Metal prices: Mn ~£0.83/kg (ESTIMATE — no FeMn index) (2026-09 refresh indices at $1.324/£ unless stated). ESTIMATE where stated.', confidence: 'Low' },
  { id: 'mat-steel-30mnvs6', grade: '30MnVS6 / 46MnVS3 (microalloyed, controlled-cooled)', category: 'Microalloyed Steel Billet', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel-38mnvs6 £1.15 = £1.15/kg. Metal prices:  (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-steel-42crmo4', grade: '42CrMo4 / 4140 / 1.7225 (Cr-Mo QT steel)', category: 'Alloy Steel Billet', pricePerKg: 1.61, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel4130 £1.60 +0.10% CR × £1.94 +0.02% MO × £59.78 = £1.61/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-steel-34crnimo6', grade: '34CrNiMo6 / 1.6582 (Ni-Cr-Mo QT steel)', category: 'Alloy Steel Billet', pricePerKg: 1.81, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel4130 £1.60 +0.55% CR × £1.94 +1.50% NI × £12.38 +0.02% MO × £59.78 = £1.81/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026); LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-steel-18crnimo7-6', grade: '18CrNiMo7-6 / 1.6587 (case-hardening, heavy gears)', category: 'Alloy Steel Billet', pricePerKg: 1.87, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel4130 £1.60 +0.70% CR × £1.94 +1.55% NI × £12.38 +0.10% MO × £59.78 = £1.87/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026); LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-steel-16mncr5', grade: '16MnCr5 / 1.7131 (case-hardening)', category: 'Alloy Steel Billet', pricePerKg: 1.48, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel-20mncr5 £1.48 −0.10% MN × £0.83 −0.20% CR × £1.94 = £1.48/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mn ~£0.83/kg (ESTIMATE — no FeMn index) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-steel-41cr4', grade: '41Cr4 / 5140 / 1.7035 (Cr QT steel)', category: 'Alloy Steel Billet', pricePerKg: 1.48, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel4130 £1.60 +0.10% CR × £1.94 −0.20% MO × £59.78 = £1.48/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-steel-f22', grade: 'ASTM A182 F22 (2.25Cr-1Mo, pressure forgings)', category: 'Alloy Steel Billet', pricePerKg: 2.10, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-steel4130 £1.60 +1.30% CR × £1.94 +0.80% MO × £59.78 = £2.10/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-ss420-bar', grade: '420 / 1.4021 (martensitic stainless forging bar)', category: 'Stainless Steel Billet', pricePerKg: 3.64, scrapRecoveryPricePerKg: 0.91, densityKgPerM3: 7740, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-ss410-bar £3.63 +0.50% CR × £1.94 = £3.64/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026) (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-ss431-bar', grade: '431 / 1.4057 (martensitic Ni stainless forging bar)', category: 'Stainless Steel Billet', pricePerKg: 3.95, scrapRecoveryPricePerKg: 1.00, densityKgPerM3: 7750, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-ss410-bar £3.63 +3.50% CR × £1.94 +2.00% NI × £12.38 = £3.95/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-ss2205-bar', grade: '2205 / 1.4462 / F51 (duplex stainless forging bar)', category: 'Stainless Steel Billet', pricePerKg: 6.41, scrapRecoveryPricePerKg: 1.40, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-ss316l-bar £6.33 +5.00% CR × £1.94 −5.00% NI × £12.38 +1.00% MO × £59.78 = £6.41/kg. Metal prices: HC FeCr $1.13–1.20/lb Cr cif Europe (Fastmarkets, Sep 2026); Mo $79.15/kg (oxide, 4 Sep 2026); LME Ni $16,388/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-al2014-forge', grade: '2014 (Al-Cu forging stock — aero and automotive)', category: 'Aluminium Forging Billet', pricePerKg: 3.59, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-al6082-forge £3.24 −4.40% AL × £2.85 +4.40% CU × £10.77 = £3.59/kg. Metal prices: Al $3,772/t; LME Cu $14,257/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
  { id: 'mat-ab2-forge', grade: 'CW307G / CuAl10Ni5Fe4 (nickel-aluminium bronze forging bar)', category: 'Copper Alloy Billet', pricePerKg: 10.00, scrapRecoveryPricePerKg: 3.80, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Casting & forging materials review 2026-10. Sibling + alloy content: mat-bronze-c905 £13.66 −8.00% CU × £10.77 −10.00% SN × £41.20 −2.00% ZN × £2.91 +10.00% AL × £2.85 +5.00% NI × £12.38 +£0.48 5% Fe + bar-making premium (as CZ122 over its metal) = £10.00/kg. Metal prices: Al $3,772/t; LME Cu $14,257/t; LME Ni $16,388/t; LME Sn $54,550/t; LME Zn $3,857/t (2026-09 refresh indices at $1.324/£ unless stated).', confidence: 'Medium' },
];


/** Material scope review (Oct 2026): grades missing from injection moulding, sheet metal
 *  and machining bar. Priced from a library sibling where one exists, else a sourced 2026
 *  price, else a labelled estimate — the arithmetic in each note. */
const SCOPE_REVIEW_GRADES: MaterialRate[] = [
  { id: 'mat-pbt', grade: 'PBT Unfilled', category: 'Thermoplastic', pricePerKg: 2.70, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1310, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. ESTIMATE — no 2026 public PBT price; set below the library’s PBT GF30 (£3.10) — connectors, housings.', confidence: 'Low' },
  { id: 'mat-tpe-s-im', grade: 'TPE-S (SEBS) 60 Shore A — overmould grade', category: 'Thermoplastic Elastomer', pricePerKg: 2.60, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. ESTIMATE — between the library’s TPU 85A (£2.52) and TPV (£3.21) indices. Soft-touch overmoulds and seals.', confidence: 'Low' },
  { id: 'mat-psu', grade: 'PSU (Polysulfone)', category: 'High-Performance Thermoplastic', pricePerKg: 8.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1240, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. ESTIMATE — sulfone family below PEI (£12.50 library). Transparent, steam-sterilisable housings.', confidence: 'Low' },
  { id: 'mat-ppsu', grade: 'PPSU (Polyphenylsulfone, Radel-type)', category: 'High-Performance Thermoplastic', pricePerKg: 16.00, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1290, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. ESTIMATE — above PEI (£12.50 library). Medical, aircraft interior, hot water fittings.', confidence: 'Low' },
  { id: 'mat-pla', grade: 'PLA (injection grade)', category: 'Thermoplastic', pricePerKg: 2.24, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1240, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. PLA €2.61/kg Europe, September 2026 (IMARC) at €1.165/£.', confidence: 'Medium' },
  { id: 'mat-abs-fr', grade: 'ABS FR (UL94 V0)', category: 'Thermoplastic', pricePerKg: 2.01, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1180, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + content: mat-abs £1.62 with 15% of it replaced by mat-add-fr £4.20 = £2.01/kg.', confidence: 'Medium' },
  { id: 'mat-pc-gf20', grade: 'PC GF20', category: 'Thermoplastic', pricePerKg: 2.37, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1350, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + content: mat-pc £2.52 with 20% replaced by glass fibre at ~£1.00/kg (ESTIMATE) + £0.15 compounding (ESTIMATE) = £2.37/kg.', confidence: 'Low' },
  { id: 'mat-s355mc', grade: 'S355MC Hot-Rolled Structural (EN 10149-2) — chassis, frames', category: 'High Strength Steel Sheet', pricePerKg: 0.80, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + extra: mat-hrpo £0.77 + €40/t structural grade extra (ESTIMATE) at €1.165/£.', confidence: 'Low' },
  { id: 'mat-s420mc', grade: 'S420MC Hot-Rolled Structural (EN 10149-2)', category: 'High Strength Steel Sheet', pricePerKg: 0.82, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + extra: mat-hrpo £0.77 + €60/t structural grade extra (ESTIMATE) at €1.165/£.', confidence: 'Low' },
  { id: 'mat-ss409l-sheet', grade: '409L / 1.4512 Ferritic Stainless Sheet (exhaust)', category: 'Stainless Steel Sheet', pricePerKg: 2.85, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + content: mat-aisi430 £2.97 − 6% Cr × £1.94 (HC FeCr $1.13–1.20/lb Cr, Fastmarkets Sep 2026) = £2.85/kg.', confidence: 'Medium' },
  { id: 'mat-ss441-sheet', grade: '441 / 1.4509 Ferritic Stainless Sheet (hot exhaust)', category: 'Stainless Steel Sheet', pricePerKg: 3.16, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + content: mat-aisi430 £2.97 + 1% Cr × £1.94 + 0.5% Nb × ~£35 (ESTIMATE) = £3.16/kg.', confidence: 'Low' },
  { id: 'mat-aa1050-sheet', grade: 'AA1050A-H14 Sheet (heat shields, reflectors)', category: 'Aluminium Sheet', pricePerKg: 3.01, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2705, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + content: mat-aa3003-sheet £2.99 with its 1.2% Mn (£0.83/kg, ESTIMATE) replaced by Al (£2.85) = £3.01/kg.', confidence: 'Medium' },
  { id: 'mat-steel-en3-bar', grade: 'EN3B / 1020 / S235 Bright Mild Steel Bar', category: 'Carbon Steel', pricePerKg: 0.94, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + extra: mat-en8 £0.98 − £0.04 medium-carbon extra (ESTIMATE) = £0.94/kg.', confidence: 'Low' },
  { id: 'mat-steel-11smnpb30', grade: '11SMnPb30 / 12L14 Free-Cutting Steel Bar', category: 'Carbon Steel', pricePerKg: 1.17, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + extra: EN3B £0.94 + the library’s free-cutting extra (mat-steel1141 £1.05 − mat-steel1020 £0.82) = £1.17/kg.', confidence: 'Medium' },
  { id: 'mat-al7075-bar', grade: '7075-T6 Aluminium Bar (aerospace, tooling)', category: 'Aluminium', pricePerKg: 4.85, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2810, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + content: mat-al6082-bar £3.49 + the 7075 − 6082 forging-stock difference (£4.60 − £3.24) = £4.85/kg.', confidence: 'Medium' },
  { id: 'mat-ss416-bar', grade: '416 / 1.4005 Free-Machining Martensitic Stainless Bar', category: 'Stainless Steel', pricePerKg: 3.93, scrapRecoveryPricePerKg: 0.91, densityKgPerM3: 7740, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Sibling + extra: mat-ss410-bar £3.63 + the free-machining extra (303 £3.83 − 304 £3.53) = £3.93/kg.', confidence: 'Medium' },
  { id: 'mat-c101-bar', grade: 'C101 / CW004A ETP Copper Bar (busbar, electrodes)', category: 'Copper Alloy Bar', pricePerKg: 11.05, scrapRecoveryPricePerKg: 4.20, densityKgPerM3: 8940, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Material scope review 2026-10. Cu £10.77/kg (LME $14,257/t, 2026-09 refresh) + £0.28 bar premium (CZ121 over its own metal content) = £11.05/kg.', confidence: 'Medium' },
];

/** One billet grade per alloy, at the UK price built from the market block. */
const AL_BILLETS: MaterialRate[] = AL_ALLOY_LIST.map(a => ({
  id: alBilletId(a),
  grade: `${AL_ALLOYS[a].label} extrusion billet`,
  category: 'Aluminium Extrusion Billet',
  pricePerKg: billetPriceGbpPerKg(a, 'UK'),
  scrapRecoveryPricePerKg: alScrapGbpPerKg(a),
  densityKgPerM3: AL_ALLOYS[a].densityKgPerM3,
  region: 'UK',
  effectiveDate: '2026-09',
  sourceNote: `LME $${AL_MARKET.lmeUsdPerT}/t + UK all-in billet premium $${BILLET_PREMIUM_USD_PER_T.UK.usdPerT}/t `
    + `+ alloy adder $${AL_ALLOYS[a].billetAdderUsdPerT}/t at $${AL_MARKET.usdPerGbp}/£ (${AL_MARKET.asOf}). `
    + `Scrap at LME ${AL_ALLOYS[a].scrapDiffUsdPerT >= 0 ? '+' : '−'} $${Math.abs(AL_ALLOYS[a].scrapDiffUsdPerT)}/t (${AL_ALLOYS[a].series === '6xxx' || AL_ALLOYS[a].series === '1xxx' ? 'Fastmarkets clean 6063 production scrap, delivered consumer Europe, 2026 average LME + €48/t' : 'ESTIMATE — alloyed scrap sold segregated, at a discount to 6063'}). ${BILLET_PREMIUM_USD_PER_T.UK.basis}`,
  confidence: 'Medium' as const,
}));

/** The month the built-in rates are indexed to. scripts/rate-refresh.ts moves it;
 *  tests assert every indexed rate carries it, so a partial refresh cannot pass. */
export const RATE_BASIS = '2026-09';

// UK default rate library — all rates editable at runtime
export const DEFAULT_RATE_LIBRARY: RateLibrary = {
  version: '2.2.0',
  lastModified: '2026-09-29',

  materials: [
    // ── Machining ──────────────────────────────────────────────────────────
    {
      id: 'mat-al6061',
      grade: '6061-T6',
      category: 'Aluminium',
      pricePerKg: 3.56,
      scrapRecoveryPricePerKg: 0.54,
      densityKgPerM3: 2700,
      region: 'UK',
      effectiveDate: '2026-09',
      sourceNote: 'LME + UK processor premium, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel1045',
      grade: '1045 / C45 / 080M46 (Medium-Carbon Steel)',
      category: 'Carbon Steel',
      pricePerKg: 0.95,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2026-09',
      sourceNote: 'UK steel stockholder, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.',
      confidence: 'Medium',
    },
    {
      id: 'mat-ss316l',
      grade: '316L',
      category: 'Stainless Steel',
      pricePerKg: 3.95,
      scrapRecoveryPricePerKg: 0.88,
      densityKgPerM3: 7990,
      region: 'UK',
      effectiveDate: '2026-09',
      sourceNote: 'UK stainless distributor, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: +£0.129/kg from 1kg ss_sur £2.037→£2.164/kg, 0.03kg ni £12.302→£12.378/kg; premiums held',
      confidence: 'Medium',
    },
    {
      id: 'mat-steel4140',
      grade: '4140 / 42CrMo4 / EN19 (Chromoly Alloy Steel)',
      category: 'Alloy Steel',
      pricePerKg: 1.21,
      scrapRecoveryPricePerKg: 0.22,
      densityKgPerM3: 7850,
      region: 'UK',
      effectiveDate: '2026-09',
      sourceNote: 'UK steel stockholder, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.',
      confidence: 'Medium',
    },
    {
      id: 'mat-ti6al4v',
      grade: 'Ti-6Al-4V',
      category: 'Titanium',
      pricePerKg: 47.13,
      scrapRecoveryPricePerKg: 15.88,
      densityKgPerM3: 4430,
      region: 'UK',
      effectiveDate: '2026-09',
      sourceNote: 'Titanium distributor UK, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: −£0.367/kg from 0.9kg ti £5.398→£4.989/kg; premiums held',
      confidence: 'Low',
    },
    {
      id: 'mat-virtual',
      grade: 'Virtual / Pass-through',
      category: 'Virtual',
      pricePerKg: 1.00,
      scrapRecoveryPricePerKg: 0.00,
      densityKgPerM3: 1000,
      region: 'UK',
      effectiveDate: '2026-06-14',
      sourceNote: 'Placeholder for directCost modules (painting, BIW, PCB, PCBA). Price is irrelevant — directCost overrides.',
      confidence: 'Medium',
    },
    /*
     * MACHINING STOCK PRICING BASIS (index-anchored, 2026-07). Delivered UK
     * small-lot bar/plate £/kg = LME/metal index → GBP + stockholder cut-to-
     * length premium. Al off LME $3,398/t; stainless off Ni/Cr surcharge;
     * carbon/alloy off UK stockholder; engineering-plastic stock off UK
     * distributor semi-finished (rod/sheet) list. Medium where index-anchored.
     */
    // ── Machining stock (extended metals) ──────────────────────────────────
    { id: 'mat-en8', grade: 'EN8 / 080M40 (Medium Carbon)', category: 'Carbon Steel', pricePerKg: 0.98, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 refresh. General medium-carbon machining bar — shafts, studs, general engineering. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.', confidence: 'Medium' },
    { id: 'mat-ss304-bar', grade: '304 Stainless Bar', category: 'Stainless Steel', pricePerKg: 3.53, scrapRecoveryPricePerKg: 0.83, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 refresh. General austenitic machining bar — fittings, shafts, food/chemical. | Refresh 2026-09: +£0.127/kg from 1kg ss_sur £2.037→£2.164/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-ss303', grade: '303 Free-Machining Stainless Bar', category: 'Stainless Steel', pricePerKg: 3.83, scrapRecoveryPricePerKg: 0.83, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 refresh. Sulphur-added free-machining austenitic — high-volume turned parts, fasteners. | Refresh 2026-09: +£0.127/kg from 1kg ss_sur £2.037→£2.164/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-al6082-bar', grade: '6082-T6 Aluminium Bar', category: 'Aluminium', pricePerKg: 3.49, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 refresh. Structural 6xxx machining bar/plate — brackets, jigs, structural parts. | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-al2011', grade: '2011-T3 Free-Machining Al Bar', category: 'Aluminium', pricePerKg: 3.93, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2830, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 refresh. Free-machining Al-Cu-Pb — high-speed screw-machine parts, fittings. | Refresh 2026-09: −£0.022/kg from 0.93kg al £2.910→£2.849/kg, 0.05kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    { id: 'mat-brass-cz121', grade: 'CZ121 / CW614N Free-Machining Brass', category: 'Copper Alloy Bar', pricePerKg: 7.70, scrapRecoveryPricePerKg: 3.30, densityKgPerM3: 8490, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 refresh. Standard free-machining brass bar — fittings, valve parts, connectors. | Refresh 2026-09: +£0.697/kg from 0.58kg cu £10.070→£10.768/kg, 0.39kg zn £2.164→£2.913/kg, 0.03kg pb £1.442→£1.438/kg; premiums held', confidence: 'Low' },
    { id: 'mat-bronze-pb1', grade: 'PB1 Phosphor Bronze Bar', category: 'Copper Alloy Bar', pricePerKg: 13.91, scrapRecoveryPricePerKg: 4.23, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 refresh. Phosphor bronze bar — bearings, bushes, worm wheels, high-load sliding. | Refresh 2026-09: +£4.710/kg from 0.89kg cu £10.070→£10.768/kg, 0.105kg sn £38.211→£41.201/kg, floored at commodity content £13.91/kg (previous level was below the metal it contains); premiums held', confidence: 'Low' },
    // ── Machining stock (engineering plastics — machinable semi-finished) ──
    { id: 'mat-pom-c', grade: 'POM-C (Acetal / Delrin Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Acetal copolymer rod/sheet — precision gears, bushes, manifolds; excellent machinability. | Refresh 2026-09: NOT SOURCED — pom: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-pa6-cast', grade: 'Nylon 6 (Cast PA6 Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Cast nylon rod/slab — wear pads, sprockets, rollers, guide rails. | Refresh 2026-09: NOT SOURCED — pa6: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-ptfe', grade: 'PTFE (Virgin Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 12.50, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 2170, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Virgin PTFE rod/sheet — seals, insulators, chemical/low-friction parts. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-peek-stock', grade: 'PEEK (Unfilled Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 95.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Unfilled PEEK rod/plate — high-temp/chemical machined parts, medical, aerospace. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-acrylic-cast', grade: 'Cast Acrylic (PMMA Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 4.80, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1190, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Cast acrylic sheet/rod — optical, signage, machined transparent parts. | Refresh 2026-09: NOT SOURCED — pmma: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-uhmwpe', grade: 'UHMW-PE (Stock)', category: 'Engineering Plastic (Stock)', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 940, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Ultra-high-molecular-weight PE sheet — wear strips, chute liners, guides. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Sheet Metal ────────────────────────────────────────────────────────
    // PRICING BASIS (index-anchored, refreshed 2026-07). Delivered UK small-lot
    // £/kg = mill index → GBP + stockholder/cut-to-length premium + grade premium.
    //   • Steel anchor: EU HRC €691/t (Fastmarkets, end-May 2026); CRC = HRC + ~€90/t
    //     ⇒ CRC ≈ €781/t. FX EUR→GBP 0.855 ⇒ CRC mill ≈ £668/t = £0.67/kg. UK
    //     stockholder small-lot delivered premium ≈ +£190/t ⇒ CR mild ≈ £0.86/kg.
    //   • Grade premium ladder over CR mild (£/kg): IF +0.09 · BH +0.19 · HSLA 340/420/550
    //     +0.28/0.38/0.48 · DP600/780/980/1000 +0.39/0.46/0.59/0.66 · MS1200/1300/1500
    //     +0.69/0.76/0.86 · 22MnB5 (PHS) +0.88 · AlSi-coat (Usibor) +0.20 · 3rd-gen ~+0.82.
    //   • Coating extra over CR base (£/kg): EG +0.06 · GI +0.19 · GA +0.23 · Zn-Ni +0.31 ·
    //     ZM +0.28 · tinplate +0.43.
    //   • Aluminium anchor: LME Al 3M $3,398/t (Jun 2026) + EU DDP premium ~$300/t; FX
    //     USD→GBP 0.787 ⇒ primary ≈ £2.9/kg; rolled auto sheet + conversion/small-lot
    //     ⇒ 5xxx/6xxx ≈ £3.2–3.7/kg, 7075 aerospace plate ≈ £6.8/kg.
    //   • Confidence: 'Medium' where anchored to a public index + standard premium;
    //     'Low' where the grade/alloy premium is estimated (exotic AHSS/PHS/3rd-gen).
    //   Sources: Fastmarkets EU HRC, LME Aluminium & EU duty-paid premium, MEPS Europe.
    { id: 'mat-dc01', grade: 'DC01', category: 'Mild Steel Sheet', pricePerKg: 0.91, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK CR mild sheet, delivered small-lot. Index-anchored: CRC €781/t → £0.67/kg mill + £0.19/kg stockholder premium. Basis: Fastmarkets EU HRC €691/t May-26 +€90 CRC, FX 0.855. Yield ~140 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-dc01-gi', grade: 'DC01 GI (Hot-dip Galvanised)', category: 'Galvanised Steel Sheet', pricePerKg: 1.11, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK galv coil, BIW bodywork standard. Jun 2026 Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg hdg £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-dc03-ga', grade: 'DC03 GA (Galvannealed)', category: 'Galvanised Steel Sheet', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK galvannealed coil, standard BIW inner panels. Jun 2026 Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg hdg £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-dp600', grade: 'DP600', category: 'AHSS Sheet', pricePerKg: 1.30, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil, Jun 2026 Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-hsla340', grade: 'HSLA 340', category: 'High Strength Steel Sheet', pricePerKg: 1.19, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK HSLA coil, Jun 2026 Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-22mnb5', grade: '22MnB5 (Hot Press Forming / Boron Steel)', category: 'Ultra-High Strength Steel', pricePerKg: 1.79, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK PHS coil for hot stamping (A/B-pillar, roof rail). Jun 2026 Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-aa5182', grade: 'AA5182', category: 'Aluminium Sheet', pricePerKg: 3.19, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet, Jun 2026 Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-ss304-sheet', grade: '304L Stainless Sheet', category: 'Stainless Steel Sheet', pricePerKg: 3.49, scrapRecoveryPricePerKg: 0.83, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK stainless coil, food/pharma stampings. Jun 2026 Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.127/kg from 1kg ss_sur £2.037→£2.164/kg; premiums held', confidence: 'Medium' },
    // ── Sheet Metal (extended — fabs & alloys) ─────────────────────────────
    { id: 'mat-aa5052', grade: 'AA5052-H32 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.19, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet stockholder Jun 2026. 5xxx series — marine/vehicle panels, excellent corrosion resistance. Yield 195 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-aa5083', grade: 'AA5083-H111 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2660, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet stockholder Jun 2026. 5xxx series — marine structures, shipbuilding. Higher strength than 5052. Yield 228 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-aa6082-sheet', grade: 'AA6082-T6 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.56, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet/plate stockholder Jun 2026. 6xxx series structural alloy — frames, structural parts. Yield 250 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-aisi430', grade: 'AISI 430 Ferritic SS Sheet', category: 'Stainless Steel Sheet', pricePerKg: 2.97, scrapRecoveryPricePerKg: 0.71, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK SS stockholder Jun 2026. Ferritic (magnetic) stainless — appliance panels, automotive trim. Moderate corrosion resistance. Yield 250 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.034/kg from 0.7kg hrc £0.591→£0.639/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ss316-sheet', grade: 'AISI 316L Stainless Sheet', category: 'Stainless Steel Sheet', pricePerKg: 4.54, scrapRecoveryPricePerKg: 0.93, densityKgPerM3: 7990, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK SS stockholder Jun 2026. 316L — food processing, medical, marine (Mo addition gives better chloride resistance than 304). Yield 170 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.129/kg from 1kg ss_sur £2.037→£2.164/kg, 0.03kg ni £12.302→£12.378/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-dc01-ze', grade: 'DC01+ZE (Electrogalvanised)', category: 'Electrogalvanised Steel Sheet', pricePerKg: 0.98, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK steel coil Jun 2026. Thin zinc coating — automotive body, appliance housings. Better paintability than hot-dip. Yield 140 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-hsla420', grade: 'HSLA 420 Sheet', category: 'High Strength Steel Sheet', pricePerKg: 1.29, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK HSLA coil Jun 2026. 420 MPa min yield — structural reinforcements, crash components. Higher strength premium over HSLA 340. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-hrpo', grade: 'HRPO (Hot Rolled Pickled & Oiled)', category: 'Mild Steel Sheet', pricePerKg: 0.77, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK steel coil Jun 2026. Hot-rolled, pickled and oiled — structural fabrication, heavy-gauge brackets, lower cost than CR. Yield 250 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.049/kg from 1kg hrc £0.591→£0.639/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-aa5754-sheet', grade: 'AA5754-H22 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.32, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2660, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet stockholder Jun 2026. 5754 H22 — automotive body closures, truck panels. Excellent formability. Yield 140 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-aa6061-sheet', grade: 'AA6061-T6 Sheet/Plate', category: 'Aluminium Sheet', pricePerKg: 3.66, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet stockholder Jun 2026. 6061 T6 — general structural, aerospace, vehicle frames. Yield 276 MPa. Good weldability. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-aa6063-sheet', grade: 'AA6063-T5 Sheet', category: 'Aluminium Sheet', pricePerKg: 3.49, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2690, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet stockholder Jun 2026. 6063 T5 — architectural panels, window frames, radiators. Yield 145 MPa. Anodises well. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-aa3003-sheet', grade: 'AA3003-H14 Sheet', category: 'Aluminium Sheet', pricePerKg: 2.99, scrapRecoveryPricePerKg: 0.47, densityKgPerM3: 2730, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al sheet stockholder Jun 2026. 3003 H14 — heat exchangers, chemical equipment, fuel tanks, cookware. Best formability of common Al alloys. Yield 145 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-c110-copper', grade: 'C110 ETP Copper Sheet', category: 'Copper & Brass Sheet', pricePerKg: 10.77, scrapRecoveryPricePerKg: 6.01, densityKgPerM3: 8940, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK copper stockholder Jun 2026. C110 ETP copper — busbars, electrical contacts, heat sinks, roofing. 99.9% Cu, 100% IACS. Yield 70 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£0.920/kg from 1kg cu £10.070→£10.768/kg, floored at commodity content £10.77/kg (previous level was below the metal it contains); premiums held', confidence: 'Medium' },
    { id: 'mat-cz108-brass', grade: 'CZ108 Brass Sheet (70/30)', category: 'Copper & Brass Sheet', pricePerKg: 8.42, scrapRecoveryPricePerKg: 4.77, densityKgPerM3: 8530, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK brass stockholder Jun 2026. CZ108 70/30 cartridge brass — decorative panels, heat exchangers, plumbing fittings. Excellent cold formability. Yield 105 MPa. Index-anchored 2026-07 (see PRICING BASIS). | Refresh 2026-09: +£1.000/kg from 0.7kg cu £10.070→£10.768/kg, 0.3kg zn £2.164→£2.913/kg, floored at commodity content £8.41/kg (previous level was below the metal it contains); premiums held', confidence: 'Medium' },
    // ── Sheet Metal — Advanced High-Strength Steels (AHSS, dual-phase / TRIP / complex-phase) ──
    { id: 'mat-dp780', grade: 'DP780', category: 'AHSS Sheet', pricePerKg: 1.37, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil Jul 2026. Dual-phase 780 MPa UTS — crash rails, seat structures. Needs ~1.6× press tonnage & extra restrike vs DP600; springback compensation in die. Yield ~450 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-dp980', grade: 'DP980', category: 'AHSS Sheet', pricePerKg: 1.50, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil Jul 2026. Dual-phase 980 MPa UTS — B-pillar reinforcements, longitudinals. High die wear, significant springback, limited formability. Yield ~600 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-dp1000', grade: 'DP1000', category: 'AHSS Sheet', pricePerKg: 1.57, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil Jul 2026. Dual-phase 1000 MPa UTS — cold-formed crash structures. Yield ~700 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-trip780', grade: 'TRIP780', category: 'AHSS Sheet', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil Jul 2026. Transformation-induced plasticity 780 — best strength/formability balance, energy-absorbing members. Retained austenite. Yield ~440 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-cp800', grade: 'CP800 (Complex Phase)', category: 'AHSS Sheet', pricePerKg: 1.43, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil Jul 2026. Complex-phase 800 — high yield, good edge-stretch/hole expansion for chassis & suspension parts. Yield ~680 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ms1200', grade: 'MS1200 (Martensitic)', category: 'Ultra-High Strength Steel', pricePerKg: 1.60, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK UHSS coil Jul 2026. Martensitic 1200 MPa — roll-formed bumper beams, door beams. Very low formability, roll-form only. Yield ~950 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ms1500', grade: 'MS1500 (Martensitic)', category: 'Ultra-High Strength Steel', pricePerKg: 1.77, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK UHSS coil Jul 2026. Martensitic 1500 MPa — bumper beams, intrusion beams. Roll-forming or hot forming only. Yield ~1200 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    // ── Press-Hardening / Boron Steels (hot stamping) ──
    { id: 'mat-usibor1500', grade: 'Usibor 1500 (AlSi-coated 22MnB5)', category: 'Press-Hardening Steel', pricePerKg: 2.00, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK PHS coil Jul 2026. AlSi-coated boron for hot stamping — A/B-pillar, rocker, roof rail. ~1500 MPa after press-hardening quench. Requires ~900°C furnace + water-cooled dies. Yield ~1100 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-usibor2000', grade: 'Usibor 2000', category: 'Press-Hardening Steel', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK PHS coil Jul 2026. Next-gen ~2000 MPa press-hardening steel for lightweight safety cage. Highest strength hot-stamping grade. Yield ~1400 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ms1300', grade: 'MS1300 (Martensitic)', category: 'Ultra-High Strength Steel', pricePerKg: 1.67, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK UHSS coil Jul 2026. Martensitic 1300 MPa — roll-formed reinforcements. Yield ~1050 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    // ── 3rd-generation AHSS ──
    { id: 'mat-qp980', grade: 'QP980 (Quench & Partition)', category: 'AHSS Sheet (3rd Gen)', pricePerKg: 1.73, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil Jul 2026. 3rd-gen quench-and-partition 980 — cold-formable at 980 MPa, high elongation. Structural + formable geometry. Yield ~700 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-medmn1180', grade: 'Medium-Mn 1180', category: 'AHSS Sheet (3rd Gen)', pricePerKg: 1.80, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK AHSS coil Jul 2026. 3rd-gen medium-manganese 1180 — high strength + ductility for cold-formed safety parts. Yield ~850 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    // ── HSLA / Bake-Hardening / Interstitial-Free ──
    { id: 'mat-hsla550', grade: 'HSLA 550', category: 'High Strength Steel Sheet', pricePerKg: 1.39, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK HSLA coil Jul 2026. 550 MPa min yield — chassis brackets, cross members, heavy reinforcements. Yield 550 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-bh260', grade: 'BH260 (Bake-Hardening)', category: 'Bake-Hardening Steel Sheet', pricePerKg: 1.10, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK BH coil Jul 2026. Bake-hardening +260 — outer body panels; formable when stamped, gains strength & dent resistance after paint-bake. Yield ~180 MPa (pre-bake). | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-if-dx56', grade: 'DX56D IF (Interstitial-Free)', category: 'IF Steel Sheet', pricePerKg: 1.00, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK IF coil Jul 2026. Ultra-formable interstitial-free — deep-drawn complex outer/inner panels (fenders, doors). Highest r-value/drawability. Yield ~140 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-if-hs260', grade: 'IF-HS 260 (High-Strength IF)', category: 'IF Steel Sheet', pricePerKg: 1.13, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK IF-HS coil Jul 2026. High-strength interstitial-free 260 — formable structural panels needing more strength than plain IF. Yield 260 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    // ── Deep-drawing cold-rolled ladder (CR4) ──
    { id: 'mat-dc04', grade: 'DC04 (CR4 Deep-Drawing)', category: 'Mild Steel Sheet', pricePerKg: 0.77, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK CR coil Jul 2026. Deep-drawing quality — enclosures, brackets, moderate draws. Better r-value than DC01. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-dc05', grade: 'DC05 (Extra-Deep-Drawing)', category: 'Mild Steel Sheet', pricePerKg: 0.80, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK CR coil Jul 2026. Extra-deep-drawing — sinks, housings, deeper draws without splits. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-dc06', grade: 'DC06 (Super-Deep-Drawing IF)', category: 'Mild Steel Sheet', pricePerKg: 0.85, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK CR/IF coil Jul 2026. Super-deep-drawing IF grade — complex deep pressings, fuel-filler pockets, tanks. Highest formability CR grade. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    // ── Electrical (silicon) steel — motor/transformer laminations ──
    { id: 'mat-nogo-m270-35a', grade: 'M270-35A Non-Oriented Electrical (0.35mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.59, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Low-loss non-oriented Si-steel — EV/industrial motor + generator laminations; thin gauge, low core loss (~2.7 W/kg @1.5T/50Hz). Blanked/notched at high SPM. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-nogo-m400-50a', grade: 'M400-50A Non-Oriented Electrical (0.50mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.29, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. General non-oriented Si-steel — appliance/industrial motors, pumps; 0.50mm, moderate loss. Cost-effective lamination grade. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-go-m105-30p', grade: 'M105-30P Grain-Oriented Electrical (0.30mm)', category: 'Electrical Steel Sheet', pricePerKg: 2.90, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. High-permeability grain-oriented Si-steel — transformer cores (E/I laminations, wound cores); very low loss along rolling direction. Premium over NO. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Non-oriented (NO) fully-processed ladder — motor laminations (EN 10106) ──
    { id: 'mat-m235-35a', grade: 'M235-35A NO Electrical (0.35mm, premium low-loss)', category: 'Electrical Steel Sheet', pricePerKg: 1.99, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Premium low-loss NO — high-efficiency EV/industrial traction motors; ~2.35 W/kg @1.5T/50Hz. High-Si, thin gauge. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-m330-35a', grade: 'M330-35A NO Electrical (0.35mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.74, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Mid-grade 0.35mm NO — general traction/servo motors; good loss/cost balance. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-m250-50a', grade: 'M250-50A NO Electrical (0.50mm, low-loss)', category: 'Electrical Steel Sheet', pricePerKg: 1.46, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Low-loss 0.50mm NO — efficient industrial motors, generators. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-m470-50a', grade: 'M470-50A NO Electrical (0.50mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.24, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Standard 0.50mm NO — mains-frequency industrial motors, pumps. Workhorse economy grade. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-m600-50a', grade: 'M600-50A NO Electrical (0.50mm, economy)', category: 'Electrical Steel Sheet', pricePerKg: 1.19, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7750, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Economy 0.50mm NO — small appliance/fan motors, low duty cycle. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-m700-65a', grade: 'M700-65A NO Electrical (0.65mm, mains)', category: 'Electrical Steel Sheet', pricePerKg: 1.14, scrapRecoveryPricePerKg: 0.26, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Thick 0.65mm NO — low-cost mains motors, ballasts; higher loss, cheapest lamination grade. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    // ── EV traction thin-gauge NO (≤0.27mm, high-frequency) ──
    { id: 'mat-no27-27a', grade: 'NO27 (0.27mm EV Traction)', category: 'Electrical Steel Sheet', pricePerKg: 2.44, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. 0.27mm thin-gauge NO — high-speed EV traction (200–400 Hz), low iron loss. Notch-tool-wear intensive. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-no25-25a', grade: 'NO25 (0.25mm EV Traction)', category: 'Electrical Steel Sheet', pricePerKg: 2.74, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. 0.25mm high-efficiency EV motor lamination; very low core loss, high mechanical strength grades available. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-no20-20a', grade: 'NO20 (0.20mm High-Speed EV/aero)', category: 'Electrical Steel Sheet', pricePerKg: 3.44, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. 0.20mm ultra-thin NO — high-speed (>15k rpm) EV/aerospace traction; lowest loss, premium price, low stacking factor. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    // ── Domain-refined grain-oriented (transformers) ──
    { id: 'mat-cgo-m120-27', grade: 'M120-27S CGO (0.27mm Grain-Oriented)', category: 'Electrical Steel Sheet', pricePerKg: 2.55, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Conventional grain-oriented — distribution/power transformer cores. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-hgo-m090-23', grade: 'M090-23P HGO Domain-Refined (0.23mm)', category: 'Electrical Steel Sheet', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Laser-scribed domain-refined HGO — lowest-loss transformer grade, high-efficiency power transformers. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── High-performance soft magnetics ──
    { id: 'mat-cofe-hiperco50', grade: 'Cobalt-Iron (Hiperco 50 / Vacodur 49)', category: 'Electrical Steel Sheet', pricePerKg: 58.00, scrapRecoveryPricePerKg: 4.00, densityKgPerM3: 8120, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality Jul 2026. CoFe (49Co-2V) — highest saturation (2.3T), aerospace/defence & high-power-density EV traction; needs final anneal in H₂. Premium. | Refresh 2026-09: NOT SOURCED — co: Not sourced this period: no June and September level on the same basis. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-nife-permalloy80', grade: 'Nickel-Iron Permalloy (80% Ni)', category: 'Electrical Steel Sheet', pricePerKg: 24.06, scrapRecoveryPricePerKg: 2.01, densityKgPerM3: 8740, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality Jul 2026. 80NiFe — ultra-high permeability small cores, sensors, resolvers, current transformers; low saturation, expensive. | Refresh 2026-09: +£0.061/kg from 0.8kg ni £12.302→£12.378/kg, 0.05kg mo £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-amorphous-2605sa1', grade: 'Amorphous Ribbon (Metglas 2605SA1)', category: 'Electrical Steel Sheet', pricePerKg: 8.50, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 7180, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality Jul 2026. Fe-based amorphous ribbon (~25µm) — ultra-low-loss distribution transformers, high-freq cut cores; brittle, cut/etched not conventionally stamped. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-no-semiproc-50', grade: 'Semi-Processed NO Electrical (0.50mm)', category: 'Electrical Steel Sheet', pricePerKg: 1.09, scrapRecoveryPricePerKg: 0.25, densityKgPerM3: 7750, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Semi-processed NO — magnetic properties developed by the stamper’s post-blank anneal; low coil cost, mandatory stress-relief/decarb anneal. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    // ── High-strength NO electrical steel — high-speed EV rotors ──
    { id: 'mat-hsno-rotor-700', grade: 'High-Strength NO Electrical (~700 MPa, 0.30mm rotor)', category: 'Electrical Steel Sheet', pricePerKg: 2.64, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. High-yield thin-gauge NO for high-speed EV traction rotors (bridge stresses at 15–20k rpm) — BYD/Xiaomi-class hyper-motors. Higher Si+alloy, harder to notch. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-hsno-rotor-960', grade: 'Ultra-High-Strength NO Electrical (~960 MPa, 0.20–0.27mm rotor)', category: 'Electrical Steel Sheet', pricePerKg: 3.24, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. Ultra-high-yield thin NO for >20k rpm rotors (Xiaomi HyperEngine V8s ~27,200 rpm class) — enables slim bridges + high tip speed. Premium, heavy notch-tool wear. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    // ── Flagship high-speed EV rotor / high-frequency laminations (SU7 Ultra, Yangwang U7/U8/U9) ──
    { id: 'mat-no15-15a', grade: 'NO15 Ultra-Thin NO Electrical (0.15mm)', category: 'Electrical Steel Sheet', pricePerKg: 3.94, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. 0.15mm ultra-thin NO — very high-frequency traction (SU7 Ultra V8s / high-speed EV); low eddy loss, low stacking factor, hard to blank (fine burr control). Bonded (backlack) stacks typical. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-no10-10a', grade: 'NO10 Ultra-Thin NO Electrical (0.10mm)', category: 'Electrical Steel Sheet', pricePerKg: 5.54, scrapRecoveryPricePerKg: 0.35, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. 0.10mm foil-gauge NO — extreme high-speed / high-frequency rotors (aero/hypercar & top-end EV traction). Lowest iron loss; etched/bonded rather than hard-die blanked at volume. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-si65-jnex-10', grade: '6.5% Si High-Frequency Electrical (JNEX/Super-Core class, 0.10mm)', category: 'Electrical Steel Sheet', pricePerKg: 6.84, scrapRecoveryPricePerKg: 0.35, densityKgPerM3: 7490, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality Jul 2026. 6.5% silicon steel (JFE JNEX / Super-Core class) — near-zero magnetostriction, lowest high-frequency core loss for high-rpm/high-pole EV & aerospace motors, reactors. Brittle, specialised processing. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-uhsno-1100', grade: 'Ultra-High-Strength NO Electrical (~1100 MPa, 30k-rpm rotor)', category: 'Electrical Steel Sheet', pricePerKg: 3.64, scrapRecoveryPricePerKg: 0.32, densityKgPerM3: 7600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK electrical steel Jul 2026. ~1100 MPa yield thin-gauge NO for ~30,000 rpm flagship rotors (BYD Yangwang U7/U8/U9 quad-motor, Xiaomi flagship) — holds slim bridges at extreme tip speed. Premium alloy, severe notch-tool wear. | Refresh 2026-09: +£0.041/kg from 1kg crno £0.612→£0.653/kg; premiums held', confidence: 'Low' },
    { id: 'mat-cofe-thin-010', grade: 'Cobalt-Iron Thin-Gauge (0.10mm, Vacoflux/Hiperco)', category: 'Electrical Steel Sheet', pricePerKg: 72.00, scrapRecoveryPricePerKg: 4.50, densityKgPerM3: 8120, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality Jul 2026. 0.10mm cobalt-iron (49Co-2V) — highest saturation (2.3T) + high-frequency capability for maximum power-density motors (aerospace, hypercar/flagship EV traction); H₂ final anneal, very expensive. | Refresh 2026-09: NOT SOURCED — co: Not sourced this period: no June and September level on the same basis. Held at the June 2026 price.', confidence: 'Low' },
    // ── EV motor winding conductor (hairpin) ──
    { id: 'mat-cu-hairpin', grade: 'Rectangular Enamelled Hairpin Copper (winding)', category: 'Winding Copper (Hairpin)', pricePerKg: 13.90, scrapRecoveryPricePerKg: 6.32, densityKgPerM3: 8930, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Jul 2026. Flat enamelled (grade-2/corona-resistant) rectangular copper wire for hairpin/bar-wound EV traction stators — stamped/bent hairpins, laser-welded crowns. ETP + enamel + forming premium over C110. | Refresh 2026-09: +£0.699/kg from 1kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    { id: 'mat-al-hairpin', grade: 'Rectangular Enamelled Hairpin Aluminium (winding)', category: 'Winding Aluminium (Hairpin)', pricePerKg: 4.74, scrapRecoveryPricePerKg: 1.09, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Jul 2026. Flat enamelled aluminium hairpin conductor — cost/weight-down alternative to copper in some EV traction motors; lower conductivity, larger slot fill. | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-al-busbar', grade: 'Aluminium Busbar (EV / battery)', category: 'Aluminium Sheet', pricePerKg: 3.74, scrapRecoveryPricePerKg: 0.98, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Jul 2026. 1050/6101 aluminium busbar stock — battery-pack and inverter interconnects, cell-to-body (CTB/CTC) module bars; lighter/cheaper than copper, larger cross-section. | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    // ── Spring steel strip ──
    { id: 'mat-c67s-spring', grade: 'C67S / 1.1231 (CR Spring Strip)', category: 'Spring Steel Strip', pricePerKg: 1.60, scrapRecoveryPricePerKg: 0.23, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK spring strip Jul 2026. Hardened-and-tempered carbon spring strip — stamped flat springs, clips, retainers, blades; high yield after HT. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ss301-spring', grade: '301 Spring-Temper Stainless Strip', category: 'Spring Steel Strip', pricePerKg: 4.53, scrapRecoveryPricePerKg: 0.93, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK stainless spring strip Jul 2026. Work-hardened 301 (1/2–full hard) — corrosion-resistant springs, contacts, diaphragms, EMI fingers. | Refresh 2026-09: +£0.127/kg from 1kg ss_sur £2.037→£2.164/kg; premiums held', confidence: 'Low' },
    // ── Modern coatings ──
    { id: 'mat-znni-eg', grade: 'Zn-Ni Electrogalvanised', category: 'Coated Steel Sheet', pricePerKg: 1.23, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK coated coil Jul 2026. Zinc-nickel electroplated — superior corrosion + heat resistance for underbody/fasteners. Better than plain EG. Yield ~150 MPa. | Refresh 2026-09: +£0.049/kg from 1kg hdg £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-zm-coated', grade: 'ZM (Zn-Mg-Al) Coated', category: 'Coated Steel Sheet', pricePerKg: 1.20, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK coated coil Jul 2026. Zinc-magnesium-aluminium coating — 2–3× corrosion life of GI at lower coat weight; battery trays, underbody. Yield ~180 MPa. | Refresh 2026-09: +£0.049/kg from 1kg hdg £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-tinplate-etp', grade: 'Tinplate (ETP)', category: 'Coated Steel Sheet', pricePerKg: 1.35, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK tinplate Jul 2026. Electrolytic tin-plated low-carbon — cans, enclosures, shielding. Solderable, corrosion-resistant. Yield ~230 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    // ── Automotive aluminium (outer-skin & structural) ──
    { id: 'mat-aa6016-t4', grade: 'AA6016-T4 Sheet (Auto Skin)', category: 'Aluminium Sheet', pricePerKg: 3.49, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al auto sheet Jul 2026. 6016 T4 — the dominant aluminium outer-panel skin (bonnet, door, fender); bake-hardens in paint oven, good hemming. Yield ~120 MPa (T4). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-aa6111-t4', grade: 'AA6111-T4 Sheet (Auto Skin)', category: 'Aluminium Sheet', pricePerKg: 3.64, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2710, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al auto sheet Jul 2026. 6111 T4 — higher-strength outer skin for dent resistance; NA OEM closures. Yield ~160 MPa (T4). | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-aa7075-t6', grade: 'AA7075-T6 Sheet/Plate', category: 'Aluminium Sheet', pricePerKg: 6.80, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2810, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al plate Jul 2026. 7075 T6 — aerospace-grade high-strength structural (bumper beams, reinforcements). Poor formability/weldability; cold form in W-temper. Yield ~505 MPa. | Refresh 2026-09: +£0.004/kg from 0.89kg al £2.910→£2.849/kg, 0.06kg zn £2.164→£2.913/kg, 0.02kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    // ── Sustainability-focused ──
    { id: 'mat-greensteel-dc01', grade: 'Low-CO₂ "Green" Steel (H₂-DRI, DC01 equiv.)', category: 'Low-Carbon Steel Sheet', pricePerKg: 1.10, scrapRecoveryPricePerKg: 0.21, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK green-steel offer Jul 2026. Hydrogen direct-reduced / high-scrap EAF route — DC01-equivalent properties at ~70–90% lower embodied CO₂. Premium ~15–25% over conventional. Yield ~140 MPa. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Low' },
    { id: 'mat-al-recycled-5xxx', grade: 'Recycled-Content Al 5xxx (Secondary)', category: 'Aluminium Sheet', pricePerKg: 2.55, scrapRecoveryPricePerKg: 0.49, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK secondary-Al sheet Jul 2026. High recycled-content 5xxx — non-visible inner panels/brackets; ~5% cheaper and far lower CO₂ than primary. Slightly wider property tolerance. Yield ~130 MPa. | Refresh 2026-09: −£0.052/kg from 0.85kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    // ── Injection Moulding (resins) ────────────────────────────────────────
    // coolTimeFactorSPerMm2: PP=3.16, ABS=2.0, PA66=2.0, PC=2.5, HDPE=3.5, POM=2.8, TPU=4.0
    { id: 'mat-pp', grade: 'PP Copolymer', category: 'Thermoplastic', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.027/kg from 1kg pp £0.960→£0.987/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-abs', grade: 'ABS', category: 'Thermoplastic', pricePerKg: 1.62, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: −£0.065/kg from 1kg abs £0.775→£0.710/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pa66gf30', grade: 'PA66 GF30', category: 'Thermoplastic', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pa66: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-pc', grade: 'PC (Lexan)', category: 'Thermoplastic', pricePerKg: 2.52, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pc: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-hdpe', grade: 'HDPE', category: 'Thermoplastic', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 960, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026 Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pom', grade: 'POM / Acetal (Delrin)', category: 'Thermoplastic', pricePerKg: 2.05, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026. coolFactor ~2.8 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pom: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-pbt-gf30', grade: 'PBT GF30', category: 'Thermoplastic', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1520, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026. Common connector/housing material. Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pbt: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-tpu-shore85', grade: 'TPU Shore 85A', category: 'Thermoplastic Elastomer', pricePerKg: 2.52, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor, Jun 2026. coolFactor ~4.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — tpu: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    // ── Polyethylene family ────────────────────────────────────────────────────
    { id: 'mat-ldpe', grade: 'LDPE (2426H)', category: 'Thermoplastic', pricePerKg: 1.09, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 910, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. EBM film bags. coolFactor ~3.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.217/kg from 1kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-lldpe', grade: 'LLDPE C6', category: 'Thermoplastic', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.09, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Stretch/packaging film, rotomoulding. coolFactor ~3.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.117/kg from 1kg lldpe £0.930→£1.047/kg; premiums held', confidence: 'Medium' },
    // ── PP grades ──────────────────────────────────────────────────────────────
    { id: 'mat-pp-homo', grade: 'PP Homopolymer (MFI 12)', category: 'Thermoplastic', pricePerKg: 0.99, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. High stiffness housings, caps. coolFactor ~3.16 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.027/kg from 1kg pp £0.960→£0.987/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pp-impact', grade: 'PP Impact Copolymer (PP-B)', category: 'Thermoplastic', pricePerKg: 1.04, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Bumpers, battery cases. coolFactor ~3.16 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.027/kg from 1kg pp £0.960→£0.987/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pp-gf30', grade: 'PP GF30 (Short Glass)', category: 'Thermoplastic', pricePerKg: 1.87, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1120, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. 30% short-glass PP — stiff housings, fan shrouds, pump bodies, brackets. coolFactor ~3.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.019/kg from 0.7kg pp £0.960→£0.987/kg; premiums held', confidence: 'Low' },
    // ── PET ────────────────────────────────────────────────────────────────────
    { id: 'mat-pet-bg', grade: 'PET Bottle Grade (1101)', category: 'Thermoplastic', pricePerKg: 1.21, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1380, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. SBM beverage bottles. coolFactor ~3.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pet: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-pet-gf30', grade: 'PET GF30 (Engineering)', category: 'Thermoplastic', pricePerKg: 3.05, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1520, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Gears, precision parts. coolFactor ~2.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pet: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    // ── PVC ────────────────────────────────────────────────────────────────────
    { id: 'mat-upvc', grade: 'Rigid PVC (uPVC pipe grade)', category: 'Thermoplastic', pricePerKg: 0.76, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Pipes, window profiles. coolFactor ~2.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: −£0.066/kg from 0.85kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-fpvc', grade: 'Flexible PVC (fPVC plasticised)', category: 'Thermoplastic', pricePerKg: 1.11, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Cables, hoses, medical tubing. coolFactor ~3.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: −£0.047/kg from 0.6kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Medium' },
    // ── PS grades ──────────────────────────────────────────────────────────────
    { id: 'mat-gpps', grade: 'GPPS (Crystal PS)', category: 'Thermoplastic', pricePerKg: 1.37, scrapRecoveryPricePerKg: 0.11, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Clear, rigid, brittle. CD cases, cutlery. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.369/kg from 1kg gpps £1.000→£1.369/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-hips', grade: 'HIPS (High Impact PS)', category: 'Thermoplastic', pricePerKg: 1.37, scrapRecoveryPricePerKg: 0.11, densityKgPerM3: 1040, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. TV housings, fridge liners, thermoforming sheet. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: +£0.399/kg from 1kg hips £0.970→£1.369/kg; premiums held', confidence: 'Medium' },
    // ── PC/ABS Blend ───────────────────────────────────────────────────────────
    { id: 'mat-pc-abs', grade: 'PC/ABS Blend (automotive grade)', category: 'Thermoplastic', pricePerKg: 1.92, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Automotive interior, electronics housings. coolFactor ~2.2 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: −£0.026/kg from 0.6kg pc £1.000→£1.000/kg, 0.4kg abs £0.775→£0.710/kg; premiums held', confidence: 'Medium' },
    // ── Polyamide (PA) grades ──────────────────────────────────────────────────
    { id: 'mat-pa6', grade: 'PA6 Unfilled', category: 'Thermoplastic', pricePerKg: 1.68, scrapRecoveryPricePerKg: 0.06, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Gears, under-hood. Moisture sensitive — dry before moulding. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pa6: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-pa6-gf30', grade: 'PA6 GF30', category: 'Thermoplastic', pricePerKg: 2.52, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1280, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Structural PA6 with glass fill. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pa6: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-pa66', grade: 'PA66 Unfilled', category: 'Thermoplastic', pricePerKg: 1.89, scrapRecoveryPricePerKg: 0.06, densityKgPerM3: 1140, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Higher temp than PA6. Connectors, structural. coolFactor ~2.0 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pa66: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    // ── High-Performance ───────────────────────────────────────────────────────
    { id: 'mat-peek', grade: 'PEEK Unfilled', category: 'High-Performance Thermoplastic', pricePerKg: 76.00, scrapRecoveryPricePerKg: 5.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin supplier Jun 2026. Aerospace/medical/oil&gas. High temp (Tg~143°C, use to 250°C). coolFactor ~2.5 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-peek-gf30', grade: 'PEEK GF30', category: 'High-Performance Thermoplastic', pricePerKg: 93.00, scrapRecoveryPricePerKg: 5.00, densityKgPerM3: 1430, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin supplier Jun 2026. High-stiffness structural PEEK. Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Injection Moulding — RESIN PRICING BASIS (index-anchored, 2026-07) ─────
    // Delivered UK small-lot £/kg = European polymer index → GBP + compounding/
    // colour + small-lot distributor premium.
    //   • Commodity anchor: European PP ~$1,346/t (ChemOrbis/ICIS, Mar-2026);
    //     FX USD→GBP 0.787 ⇒ PP natural ≈ £1.06/kg. PE/PS/PVC track the same
    //     naphtha→ethylene/propylene/styrene feedstock.
    //   • Premium ladder over commodity (£/kg): styrenics (ABS/ASA/SAN) +0.6–1.3 ·
    //     talc/mineral-filled PP +0.2–0.4 · PP long-glass +1.5 · engineering
    //     (PA6/PA66/POM/PBT/PC/PC-ABS) +0.6–1.7 · glass-fill +0.5–0.7 per 30% ·
    //     high-temp specialty (PPS/PPA/PEI/LCP) £5–14 · PEEK £76–93.
    //   • Confidence: 'Medium' where anchored to a public polymer index + standard
    //     compound premium; 'Low' for specialty/low-volume grades with estimated premium.
    //   Sources: ICIS / ChemOrbis Europe PP, Plastixx (PIE) polymer index, procurementresource.
    // ── Styrenics (weatherable / clarity) ──
    { id: 'mat-asa', grade: 'ASA (Weatherable)', category: 'Thermoplastic', pricePerKg: 2.24, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1070, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07 (see RESIN PRICING BASIS). UV-stable styrenic — exterior trim, grilles, mirror caps, roof rails. coolFactor ~2.0 s/mm². | Refresh 2026-09: −£0.065/kg from 1kg abs £0.775→£0.710/kg; premiums held', confidence: 'Low' },
    { id: 'mat-san', grade: 'SAN (Styrene-Acrylonitrile)', category: 'Thermoplastic', pricePerKg: 1.69, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1080, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Rigid, clear, chemical-resistant — housewares, cosmetics, lenses. coolFactor ~2.0 s/mm². | Refresh 2026-09: −£0.065/kg from 1kg abs £0.775→£0.710/kg; premiums held', confidence: 'Low' },
    // ── Filled / modified PP (automotive interiors & bumpers) ──
    { id: 'mat-pp-t20', grade: 'PP-T20 (20% Talc-filled)', category: 'Thermoplastic', pricePerKg: 1.27, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Stiffened PP — instrument-panel carriers, interior trim, HVAC. coolFactor ~3.0 s/mm². | Refresh 2026-09: +£0.022/kg from 0.8kg pp £0.960→£0.987/kg; premiums held', confidence: 'Low' },
    { id: 'mat-pp-t30', grade: 'PP-T30 (30% Mineral/Talc-filled)', category: 'Thermoplastic', pricePerKg: 1.37, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. High-stiffness PP — bumper carriers, door panels, under-body shields. coolFactor ~3.0 s/mm². | Refresh 2026-09: +£0.019/kg from 0.7kg pp £0.960→£0.987/kg; premiums held', confidence: 'Low' },
    { id: 'mat-pp-lgf30', grade: 'PP-LGF30 (Long-Glass PP)', category: 'Thermoplastic', pricePerKg: 2.62, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1120, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Long-glass-fibre PP — structural front-end carriers, door modules, seat structures (metal replacement). coolFactor ~3.0 s/mm². | Refresh 2026-09: +£0.019/kg from 0.7kg pp £0.960→£0.987/kg; premiums held', confidence: 'Low' },
    { id: 'mat-tpo', grade: 'TPO (Thermoplastic Olefin)', category: 'Thermoplastic', pricePerKg: 1.87, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Soft-touch olefinic — bumper fascia, cladding, skin/airbag covers. coolFactor ~3.2 s/mm². | Refresh 2026-09: +£0.019/kg from 0.7kg pp £0.960→£0.987/kg, 0.25kg epdm £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    // ── Elastomer & optical ──
    { id: 'mat-tpv', grade: 'TPV (Santoprene-type)', category: 'Thermoplastic Elastomer', pricePerKg: 3.21, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 970, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Vulcanised TPE — weatherseals, boots, glass encapsulation, grommets. coolFactor ~4.0 s/mm². | Refresh 2026-09: +£0.011/kg from 0.4kg pp £0.960→£0.987/kg, 0.4kg epdm £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-pmma', grade: 'PMMA (Acrylic)', category: 'Thermoplastic', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1190, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Optical-clear acrylic — lenses, light guides, tail-lamp, badges. coolFactor ~2.5 s/mm². | Refresh 2026-09: NOT SOURCED — pmma: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    // ── High-temp / e-mobility / connectors ──
    { id: 'mat-pps-gf40', grade: 'PPS GF40', category: 'High-Performance Thermoplastic', pricePerKg: 5.50, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 1650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Polyphenylene-sulfide — under-hood, e-motor components, sensors, pumps, EV. Continuous use ~200°C. coolFactor ~2.5 s/mm². | Refresh 2026-09: NOT SOURCED — pps: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-ppa-gf35', grade: 'PPA GF35 (High-Temp Polyamide)', category: 'High-Performance Thermoplastic', pricePerKg: 6.80, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1450, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Semi-aromatic PPA — high-temp connectors, e-mobility, thermal management. coolFactor ~2.2 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-pei', grade: 'PEI (Ultem, Unfilled)', category: 'High-Performance Thermoplastic', pricePerKg: 12.50, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1270, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Polyetherimide — high-temp electrical, aerospace interiors, sterilisable medical. coolFactor ~2.5 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-pei-gf30', grade: 'PEI GF30', category: 'High-Performance Thermoplastic', pricePerKg: 14.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1510, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Glass-reinforced PEI — structural high-temp. coolFactor ~2.5 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-lcp-gf30', grade: 'LCP GF30 (Liquid-Crystal Polymer)', category: 'High-Performance Thermoplastic', pricePerKg: 11.00, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 1620, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin supplier. Index-anchored 2026-07. Ultra-thin-wall flow — fine-pitch connectors, SMT sockets, sensors. coolFactor ~1.8 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Extended polyamide family ──
    { id: 'mat-pa66-gf35', grade: 'PA66 GF35', category: 'Thermoplastic', pricePerKg: 3.30, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. 35% glass PA66 — structural brackets, engine mounts, pedals. coolFactor ~2.0 s/mm². | Refresh 2026-09: NOT SOURCED — pa66: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pa66-gf50', grade: 'PA66 GF50', category: 'Thermoplastic', pricePerKg: 3.55, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1560, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. 50% glass PA66 — highest-stiffness metal-replacement structural parts. coolFactor ~2.0 s/mm². | Refresh 2026-09: NOT SOURCED — pa66: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pa66-min', grade: 'PA66 Mineral-filled (Low-Warp)', category: 'Thermoplastic', pricePerKg: 3.00, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1440, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Mineral-filled PA66 — low-warp precision housings, covers. coolFactor ~2.0 s/mm². | Refresh 2026-09: NOT SOURCED — pa66: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pa12', grade: 'PA12 (Nylon 12)', category: 'Thermoplastic', pricePerKg: 8.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1010, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Low-moisture, flexible polyamide — fuel/brake lines, air-brake tubing, quick-connectors. coolFactor ~2.2 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Engineering blends ──
    { id: 'mat-pc-pbt', grade: 'PC/PBT Blend', category: 'Thermoplastic', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1210, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Impact + chemical resistance — bumper beams, exterior body panels, sill covers. coolFactor ~2.3 s/mm². | Refresh 2026-09: NOT SOURCED — pc, pbt: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-mppe', grade: 'mPPE / PPO (Noryl-type)', category: 'Thermoplastic', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1090, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Modified PPE — dimensional stability, low moisture — EV battery components, e-mobility, panels. coolFactor ~2.2 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Flame-retardant (UL94 V0) ──
    { id: 'mat-pc-fr', grade: 'PC FR (UL94 V0)', category: 'Thermoplastic', pricePerKg: 3.60, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1220, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Flame-retardant PC — EV enclosures, chargers, HV connectors, electronics. coolFactor ~2.5 s/mm². | Refresh 2026-09: NOT SOURCED — pc: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pa66-gf25-fr', grade: 'PA66 GF25 FR (UL94 V0)', category: 'Thermoplastic', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1450, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Halogen-free FR glass-filled PA66 — HV connectors, busbar carriers, EV. coolFactor ~2.0 s/mm². | Refresh 2026-09: NOT SOURCED — pa66: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    // ── Sustainability (recycled / bio) ──
    { id: 'mat-pcr-pp', grade: 'PCR PP (Post-Consumer Recycled)', category: 'Thermoplastic', pricePerKg: 0.97, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK recycler. Index-anchored 2026-07. Recycled PP — non-visible trim, wheel-arch liners, under-body. ~10% cheaper than virgin, far lower CO₂; wider property tolerance. coolFactor ~3.16 s/mm². | Refresh 2026-09: +£0.016/kg from 0.6kg pp £0.960→£0.987/kg; premiums held', confidence: 'Low' },
    { id: 'mat-bio-pa610', grade: 'Bio-PA610 (Castor-based)', category: 'High-Performance Thermoplastic', pricePerKg: 5.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1070, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Partly bio-based polyamide — low moisture uptake, sustainable structural/fuel-system parts. coolFactor ~2.1 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-pc-glazing', grade: 'PC Glazing Grade (Automotive)', category: 'Thermoplastic', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor. Index-anchored 2026-07. Hard-coat-ready PC for polycarbonate glazing — panoramic roofs, fixed side windows, lightweighting vs glass. coolFactor ~2.5 s/mm². | Refresh 2026-09: NOT SOURCED — pc: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    // ── Casting alloys ─────────────────────────────────────────────────────
    { id: 'mat-adc12', grade: 'ADC12 / A383', category: 'Die Cast Aluminium', pricePerKg: 2.75, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: −£0.035/kg from 0.85kg al £2.910→£2.849/kg, 0.11kg si £1.000→£1.000/kg, 0.025kg cu £10.070→£10.768/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-a380', grade: 'A380 / EN AC-46000 (Al-Si Die-Cast Alloy)', category: 'Die Cast Aluminium', pricePerKg: 2.80, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: −£0.028/kg from 0.85kg al £2.910→£2.849/kg, 0.085kg si £1.000→£1.000/kg, 0.035kg cu £10.070→£10.768/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-gjl250', grade: 'EN-GJL-250', category: 'Grey Cast Iron', pricePerKg: 0.64, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK iron foundry, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    // ── Additional casting alloys (Cast+Machine module) ────────────────────
    { id: 'mat-lm25', grade: 'LM25 / A356', category: 'Gravity/Sand Aluminium', pricePerKg: 2.98, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Al alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: −£0.057/kg from 0.92kg al £2.910→£2.849/kg, 0.07kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-gjl350', grade: 'EN-GJL-350', category: 'Grey Cast Iron', pricePerKg: 0.74, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK iron foundry, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-bronze-c905', grade: 'C905 Phosphor Bronze', category: 'Copper Alloy', pricePerKg: 13.66, scrapRecoveryPricePerKg: 4.30, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK copper alloy distributor, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: +£4.760/kg from 0.88kg cu £10.070→£10.768/kg, 0.1kg sn £38.211→£41.201/kg, 0.02kg zn £2.164→£2.913/kg, floored at commodity content £13.65/kg (previous level was below the metal it contains); premiums held', confidence: 'Low' },
    { id: 'mat-mag-az91', grade: 'AZ91D Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.81, scrapRecoveryPricePerKg: 0.76, densityKgPerM3: 1810, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK Mg alloy ingot, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: −£0.184/kg from 0.9kg mg £1.972→£1.773/kg, 0.09kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ss304-cast', grade: 'CF8 / 304 Cast Stainless', category: 'Cast Stainless Steel', pricePerKg: 5.17, scrapRecoveryPricePerKg: 1.23, densityKgPerM3: 7900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK stainless foundry, Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: +£0.127/kg from 1kg ss_sur £2.037→£2.164/kg; premiums held', confidence: 'Low' },
    // ── Additional alloys ─────────────────────────────────────────────────
    { id: 'mat-adc12-secondary', grade: 'ADC12 Secondary (recycled)', category: 'Die Cast Aluminium', pricePerKg: 2.00, scrapRecoveryPricePerKg: 0.44, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK secondary Al alloy ingot — lower purity, suitable for non-structural castings. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: −£0.052/kg from 0.85kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-alsi10mg', grade: 'AlSi10Mg (A360/Scalmalloy)', category: 'Die Cast Aluminium', pricePerKg: 2.89, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Premium structural HPDC alloy, T5 heat treated. UK Al alloy ingot Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: −£0.055/kg from 0.89kg al £2.910→£2.849/kg, 0.1kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-a365', grade: 'A365 / AlSi7Mg', category: 'Die Cast Aluminium', pricePerKg: 2.77, scrapRecoveryPricePerKg: 0.51, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Structural automotive HPDC alloy (EDU housings, battery trays). UK Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: −£0.057/kg from 0.92kg al £2.910→£2.849/kg, 0.07kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-zamak3', grade: 'Zamak 3 (Zinc Die Cast)', category: 'Zinc Die Cast', pricePerKg: 3.19, scrapRecoveryPricePerKg: 1.55, densityKgPerM3: 6600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Zamak 3 zinc alloy ingot, UK distributor Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: +£0.716/kg from 0.96kg zn £2.164→£2.913/kg, 0.04kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-zamak5', grade: 'Zamak 5 (Zinc Die Cast, Hi-Strength)', category: 'Zinc Die Cast', pricePerKg: 3.24, scrapRecoveryPricePerKg: 1.54, densityKgPerM3: 6600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Zamak 5 zinc alloy ingot, higher strength than Zamak 3. UK Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: +£0.716/kg from 0.96kg zn £2.164→£2.913/kg, 0.04kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-gjs400', grade: 'EN-GJS-400-15 (Ductile Iron)', category: 'Ductile Cast Iron', pricePerKg: 0.82, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Spheroidal graphite cast iron — highest volume casting material globally. UK foundry Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-gjs600', grade: 'EN-GJS-600-3 (Ductile Iron Hi-Strength)', category: 'Ductile Cast Iron', pricePerKg: 0.90, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'High-strength ductile iron for crankshafts, diff housings. UK foundry Jun 2026. Index-anchored 2026-07 (see CASTING PRICING BASIS). | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  CASTING PRICING BASIS (index-anchored, refreshed 2026-07)
     * ══════════════════════════════════════════════════════════════════════
     *  Delivered UK small-lot foundry £/kg is built as:
     *      commodity index → GBP (FX)  +  alloying/master-alloy premium
     *      +  melt/cast/finish stockholder margin  +  grade premium ladder.
     *  FX used: USD→GBP 0.787, EUR→GBP 0.855.
     *  Commodity anchors (2026-07):
     *    • Aluminium  LME cash ~$3,398/t  → ~£2.67/kg metal; secondary
     *      die-cast ingot (ADC12/A380) lands ~£2.8/kg, structural/primary
     *      HPDC (AlSi10MnMg family) ~£3.0–3.2/kg after Mn/Mg master-alloy.
     *    • Magnesium  SMM ~$2,505/t → ~£1.97/kg metal; AZ91D die-cast
     *      alloy ~£3.9/kg, creep-resistant RE grades (AE44) ~£5/kg on the
     *      rare-earth (Ce/La) adder.
     *    • Foundry pig iron  SMM ~$375/t → ~£0.30/kg; grey/ductile castings
     *      ~£0.6–1.0/kg, CGI/SiMo/ADI ~£1.1–1.6/kg on alloying + heat-treat.
     *    • Zinc  LME ~$2,750/t → ~£2.16/kg; Zamak/ZA alloys ~£2.5–3.1/kg.
     *    • Cast stainless / 17-4PH / Ni-superalloy investment castings priced
     *      off Ni/Cr/Mo index + investment-shell yield; Inconel 718 dominated
     *      by nickel + cobalt content and low casting yield.
     *  Confidence: Medium where anchored to a published metal index; Low where
     *  the grade/premium is estimated. Real contract prices are confidential —
     *  load actuals via the admin Rate Library upload.
     * ══════════════════════════════════════════════════════════════════════
     */
    // ── Structural HPDC / megacasting aluminium ────────────────────────────
    { id: 'mat-aural5', grade: 'Aural-5 (AlSi9MnMg, Rheinfelden)', category: 'Structural HPDC Aluminium', pricePerKg: 3.07, scrapRecoveryPricePerKg: 0.57, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Ductile structural HPDC — shock towers, self-pierce-rivetable body nodes; T5/T7 heat treat. | Refresh 2026-09: −£0.055/kg from 0.89kg al £2.910→£2.849/kg, 0.1kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-silafont36', grade: 'Silafont-36 (AlSi10MnMg)', category: 'Structural HPDC Aluminium', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.57, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Crash-relevant structural HPDC — battery trays, longitudinal rails, megacastings; high elongation after T7. | Refresh 2026-09: −£0.055/kg from 0.89kg al £2.910→£2.849/kg, 0.1kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-castasil37', grade: 'Castasil-37 (AlSi9MnMoZr)', category: 'Structural HPDC Aluminium', pricePerKg: 3.03, scrapRecoveryPricePerKg: 0.57, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). As-cast high-ductility HPDC needing no heat treatment — cross-car beams, structural brackets; dimensionally stable. | Refresh 2026-09: −£0.055/kg from 0.89kg al £2.910→£2.849/kg, 0.1kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-magsimal59', grade: 'Magsimal-59 (AlMg5Si2Mn)', category: 'Structural HPDC Aluminium', pricePerKg: 3.15, scrapRecoveryPricePerKg: 0.57, densityKgPerM3: 2650, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). High-strength/high-ductility as-cast HPDC — chassis nodes, suspension parts; excellent corrosion resistance. | Refresh 2026-09: −£0.066/kg from 0.92kg al £2.910→£2.849/kg, 0.05kg mg £1.972→£1.773/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-al-hpdc-lowco2', grade: 'Low-CO₂ Recycled HPDC (AlSi10MnMg)', category: 'Structural HPDC Aluminium', pricePerKg: 3.00, scrapRecoveryPricePerKg: 0.59, densityKgPerM3: 2670, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). ≥75% recycled-content structural HPDC alloy — same mechanicals as Silafont, ~3–4 kg CO₂/kg vs ~8–20 for primary; OEM green-casting programmes. | Refresh 2026-09: −£0.055/kg from 0.89kg al £2.910→£2.849/kg, 0.1kg si £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-htf-gigacast', grade: 'Heat-Treat-Free Giga-Casting Alloy (Xiaomi Titan / Tesla-class)', category: 'Structural HPDC Aluminium', pricePerKg: 3.30, scrapRecoveryPricePerKg: 0.59, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Self-developed heat-treat-free AlSi(Mn)Mg family for single-piece rear/front-underbody megacastings on 6,000–9,000T+ giga-presses (Xiaomi "Titan Metal", Tesla HTF, BYD). As-cast ductility, no distortion-prone T7; represents the OEM self-alloyed class — override price with the actual supply quote. | Refresh 2026-09: −£0.055/kg from 0.89kg al £2.910→£2.849/kg, 0.1kg si £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    // ── Die-cast aluminium (extended) ──────────────────────────────────────
    { id: 'mat-a413', grade: 'A413 / AlSi12 (Eutectic Die Cast)', category: 'Die Cast Aluminium', pricePerKg: 2.75, scrapRecoveryPricePerKg: 0.53, densityKgPerM3: 2660, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Near-eutectic high-fluidity alloy — thin-wall pressure-tight housings, pump bodies, intricate die castings. | Refresh 2026-09: −£0.053/kg from 0.87kg al £2.910→£2.849/kg, 0.12kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-a319', grade: 'A319 / AlSi6Cu4', category: 'Die Cast Aluminium', pricePerKg: 2.97, scrapRecoveryPricePerKg: 0.58, densityKgPerM3: 2790, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). General-purpose Al-Si-Cu — sand/permanent-mould engine blocks, manifolds, cylinder heads; good machinability. | Refresh 2026-09: +£0.210/kg from 0.89kg al £2.910→£2.849/kg, 0.06kg si £1.000→£1.000/kg, 0.04kg cu £10.070→£10.768/kg, floored at commodity content £2.97/kg (previous level was below the metal it contains); premiums held', confidence: 'Medium' },
    { id: 'mat-a390', grade: 'A390 / AlSi17Cu (Hypereutectic)', category: 'Die Cast Aluminium', pricePerKg: 3.30, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2730, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Hypereutectic wear-resistant alloy — compressor scrolls, pistons, cylinder liners; low CTE, high hardness. | Refresh 2026-09: −£0.017/kg from 0.78kg al £2.910→£2.849/kg, 0.17kg si £1.000→£1.000/kg, 0.045kg cu £10.070→£10.768/kg; premiums held', confidence: 'Medium' },
    // ── Gravity / permanent-mould aluminium (extended) ─────────────────────
    { id: 'mat-a357', grade: 'A357 / AlSi7Mg0.6 (Premium T6)', category: 'Gravity/Sand Aluminium', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2680, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Premium high-integrity T6 alloy — aerospace structural, motorsport wheels, suspension uprights; HIP-capable. | Refresh 2026-09: −£0.057/kg from 0.92kg al £2.910→£2.849/kg, 0.07kg si £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    // ── Grey & ductile iron (extended) ─────────────────────────────────────
    { id: 'mat-gjl200', grade: 'EN-GJL-200 (Grey Iron)', category: 'Grey Cast Iron', pricePerKg: 0.60, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). General-purpose grey iron — housings, covers, counterweights; good damping and machinability. | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-gjl300', grade: 'EN-GJL-300 (Grey Iron Hi-Strength)', category: 'Grey Cast Iron', pricePerKg: 0.70, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 7200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Higher-strength grey iron — engine blocks, brake discs/drums, machine-tool structures. | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-gjs500', grade: 'EN-GJS-500-7 (Ductile Iron)', category: 'Ductile Cast Iron', pricePerKg: 0.86, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Mid-grade ductile iron — steering knuckles, hubs, brackets; balance of strength and ductility. | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-gjs700', grade: 'EN-GJS-700-2 (Ductile Iron Hi-Strength)', category: 'Ductile Cast Iron', pricePerKg: 0.95, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). High-strength ductile iron — heavy-duty gears, crankshafts, hydraulic bodies. | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-gjv450', grade: 'EN-GJV-450 (Compacted Graphite Iron)', category: 'Compacted Graphite Iron', pricePerKg: 1.12, scrapRecoveryPricePerKg: 0.16, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). CGI — high-output diesel cylinder blocks/heads, exhaust manifolds; ~75% stronger than grey iron with better thermal fatigue. | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-simo', grade: 'EN-GJS-SiMo (Heat-Resistant Ductile)', category: 'Ductile Cast Iron', pricePerKg: 1.35, scrapRecoveryPricePerKg: 0.16, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). SiMo heat-resistant ductile iron — exhaust manifolds, turbocharger housings; stable to ~800°C. | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-adi', grade: 'EN-GJS-800 ADI (Austempered Ductile Iron)', category: 'Ductile Cast Iron', pricePerKg: 1.58, scrapRecoveryPricePerKg: 0.16, densityKgPerM3: 7100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Austempered ductile iron — gears, crankshafts, suspension arms; steel-like strength at lower weight/cost, austempering heat-treat included. | Refresh 2026-09: NOT SOURCED — pigiron, scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    // ── Magnesium die cast (extended) ──────────────────────────────────────
    { id: 'mat-mag-am60', grade: 'AM60B Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.66, scrapRecoveryPricePerKg: 0.76, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). High-ductility Mg — steering wheels, seat frames, instrument-panel beams; better elongation than AZ91. | Refresh 2026-09: −£0.190/kg from 0.94kg mg £1.972→£1.773/kg, 0.055kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-mag-am50', grade: 'AM50A Magnesium Die Cast', category: 'Magnesium Alloy', pricePerKg: 3.71, scrapRecoveryPricePerKg: 0.76, densityKgPerM3: 1770, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Highest-ductility standard Mg die-cast alloy — safety-critical energy-absorbing structures, IP beams, brackets. | Refresh 2026-09: −£0.190/kg from 0.94kg mg £1.972→£1.773/kg, 0.055kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    { id: 'mat-mag-ae44', grade: 'AE44 Magnesium (Creep-Resistant)', category: 'Magnesium Alloy', pricePerKg: 5.02, scrapRecoveryPricePerKg: 0.87, densityKgPerM3: 1820, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Rare-earth (Ce/La) creep-resistant Mg — powertrain, engine cradles, transmission cases at elevated temperature; RE adder over AZ/AM grades. | Refresh 2026-09: −£0.185/kg from 0.92kg mg £1.972→£1.773/kg, 0.04kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    // ── Zinc die cast (extended) ───────────────────────────────────────────
    { id: 'mat-za8', grade: 'ZA-8 (Zinc-Aluminium Die Cast)', category: 'Zinc Die Cast', pricePerKg: 3.50, scrapRecoveryPricePerKg: 1.55, densityKgPerM3: 6300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Hot-chamber ZA-8 — higher strength/creep than Zamak; hardware, gears, bushings. | Refresh 2026-09: +£0.683/kg from 0.91kg zn £2.164→£2.913/kg, 0.08kg al £2.910→£2.849/kg, 0.01kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    { id: 'mat-za27', grade: 'ZA-27 (High-Strength Zinc-Aluminium)', category: 'Zinc Die Cast', pricePerKg: 3.63, scrapRecoveryPricePerKg: 1.35, densityKgPerM3: 5000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Highest-strength ZA alloy — bronze-replacement bearings, high-load gravity/sand castings; lower density than Zamak. | Refresh 2026-09: +£0.529/kg from 0.71kg zn £2.164→£2.913/kg, 0.27kg al £2.910→£2.849/kg, 0.02kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    // ── Steel & superalloy castings (investment / sand) ────────────────────
    { id: 'mat-gs-c25', grade: 'GS-C25 (Cast Carbon Steel)', category: 'Cast Carbon Steel', pricePerKg: 2.10, scrapRecoveryPricePerKg: 0.28, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). General-purpose cast carbon steel — structural brackets, valve bodies, machine frames; weldable, machinable. | Refresh 2026-09: NOT SOURCED — scrap: Not sourced this period: no June 2026 foundry pig iron or steel scrap price found on a like-for-like basis (Turkish HMS ’June’ figure found was a 2020 article; UK yard prices not comparable). Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-17-4ph-cast', grade: '17-4PH (Investment Cast Stainless)', category: 'Cast Stainless Steel', pricePerKg: 9.60, scrapRecoveryPricePerKg: 1.52, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Precipitation-hardening martensitic stainless investment casting — pump/valve internals, aerospace fittings, high strength + corrosion resistance. | Refresh 2026-09: +£0.101/kg from 0.6kg ss_sur £2.037→£2.164/kg, 0.035kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    { id: 'mat-inconel718-cast', grade: 'Inconel 718 (Investment Cast Superalloy)', category: 'Nickel Superalloy Casting', pricePerKg: 42.04, scrapRecoveryPricePerKg: 8.01, densityKgPerM3: 8190, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see CASTING PRICING BASIS). Ni-Cr-Fe superalloy investment casting — turbine/hot-section, high-temperature structural; nickel + cobalt dominated, low casting yield. | Refresh 2026-09: +£0.040/kg from 0.53kg ni £12.302→£12.378/kg, 0.03kg mo £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    // ── Forging billets ────────────────────────────────────────────────────
    { id: 'mat-steel1020', grade: '1020 / S20C', category: 'Carbon Steel Billet', pricePerKg: 0.82, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK steel billet, Jun 2026. Index-anchored 2026-07 (see FORGING PRICING BASIS). | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.', confidence: 'Medium' },
    { id: 'mat-steel4340', grade: '4340 / 40NiCrMo22 / EN24 (Ni-Cr-Mo Alloy Steel)', category: 'Alloy Steel Billet', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK alloy billet, Jun 2026. Index-anchored 2026-07 (see FORGING PRICING BASIS). | Refresh 2026-09: −£0.002/kg from 1kg bar £0.861→£0.858/kg, 0.018kg ni £12.302→£12.378/kg, 0.0025kg mo £1.000→£1.000/kg; premiums held', confidence: 'Medium' },
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  FORGING PRICING BASIS (index-anchored, refreshed 2026-07)
     * ══════════════════════════════════════════════════════════════════════
     *  Delivered UK small-lot forging billet/bar £/kg is built as:
     *      commodity index → GBP (FX)  +  alloying premium  +  bar/billet
     *      conversion (rolling/peeling/cut-to-length) + stockholder margin.
     *  FX used: USD→GBP 0.787, EUR→GBP 0.855.
     *  Commodity anchors (2026-07):
     *    • Carbon/alloy steel bar off UK/EU rebar-plus-conversion — plain
     *      carbon (1045/C45) ~£0.9–1.1/kg, low-alloy (4140/4340/8620)
     *      ~£1.4–1.7/kg, bearing (52100) ~£1.7/kg, UHS aero (300M) ~£3.8/kg.
     *    • Stainless bar off Ni/Cr surcharge — 410 ~£3.6/kg, 304L ~£4.6/kg,
     *      316L ~£6.2/kg, PH grades (17-4/15-5) ~£9–10/kg.
     *    • Aluminium forging stock off LME ~$3,398/t → 6xxx ~£3.3–3.4/kg,
     *      7075 ~£4.6/kg, 2618 piston/aero ~£5.2/kg.
     *    • Titanium sponge/bar — CP Gr2 ~£26/kg, Ti-6Al-4V (Gr5) ~£38/kg.
     *    • Nickel superalloy bar — Inconel 718 ~£44/kg, Waspaloy ~£70/kg
     *      (Ni + Co + Mo dominated, VIM/VAR remelt).
     *    • Forging brass (CZ122) off copper/zinc index ~£7.2/kg.
     *  Confidence: Medium where anchored to a published metal index; Low where
     *  the grade/premium is estimated. Mill/stockholder contract prices are
     *  confidential — load actuals via the admin Rate Library upload.
     * ══════════════════════════════════════════════════════════════════════
     */
    // ── Carbon & microalloyed forging steel (extended) ─────────────────────
    // (1045/C45 medium-carbon and 4140/42CrMo4 low-alloy already exist as
    //  general stock — mat-steel1045 / mat-steel4140 — usable for forging.)
    { id: 'mat-steel1141', grade: '1141 / 1144 (Free-Machining)', category: 'Carbon Steel Billet', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Resulphurised free-machining carbon steel — high-volume machined forgings, studs, couplings. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.', confidence: 'Medium' },
    { id: 'mat-steel-38mnvs6', grade: '38MnVS6 (Microalloyed)', category: 'Microalloyed Steel Billet', pricePerKg: 1.15, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Air-hardening V-microalloyed steel — con-rods, crankshafts; controlled-cooled from forge heat, no separate Q&T. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.', confidence: 'Medium' },
    // ── Alloy & case-hardening forging steel (extended) ────────────────────
    { id: 'mat-steel4130', grade: '4130 / 25CrMo4', category: 'Alloy Steel Billet', pricePerKg: 1.60, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Weldable chromoly — aerospace/pressure fittings, tube-and-node structures. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.', confidence: 'Medium' },
    { id: 'mat-steel8620', grade: '8620 (Case-Hardening)', category: 'Alloy Steel Billet', pricePerKg: 1.50, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Carburising gear steel — pinions, ring gears, bearings; tough core + hard case. | Refresh 2026-09: −£0.003/kg from 1kg bar £0.861→£0.858/kg, 0.005kg ni £12.302→£12.378/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-steel-20mncr5', grade: '20MnCr5 (Gear Steel)', category: 'Alloy Steel Billet', pricePerKg: 1.48, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). European case-hardening gear steel — transmission gears, shafts; excellent hardenability and grain control. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.', confidence: 'Medium' },
    { id: 'mat-steel-52100', grade: '52100 / 100Cr6 (Bearing Steel)', category: 'Alloy Steel Billet', pricePerKg: 1.70, scrapRecoveryPricePerKg: 0.22, densityKgPerM3: 7810, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). High-carbon chromium bearing steel — rings, rollers, races; clean, through-hardening. | Refresh 2026-09: INDEX FLAT — Index flat: Kallanish N-Europe wire rod ’stable’ (Jun 2026), ’decrease slightly’ (Jul), ’remain stable’ / ’flat’ (Sep 2026) — carbon and alloy bar unchanged.', confidence: 'Medium' },
    { id: 'mat-steel-300m', grade: '300M (UHS Aerospace)', category: 'Alloy Steel Billet', pricePerKg: 3.80, scrapRecoveryPricePerKg: 0.30, densityKgPerM3: 7830, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Ultra-high-strength Si-modified 4340 — landing gear, aerospace structural; VAR remelt, tight cleanliness. | Refresh 2026-09: −£0.002/kg from 1kg bar £0.861→£0.858/kg, 0.018kg ni £12.302→£12.378/kg, 0.0025kg mo £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    // ── Stainless forging bar ──────────────────────────────────────────────
    { id: 'mat-ss410-bar', grade: '410 (Martensitic Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 3.63, scrapRecoveryPricePerKg: 0.91, densityKgPerM3: 7740, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Hardenable martensitic stainless — valve stems, fasteners, turbine blades; moderate corrosion resistance. | Refresh 2026-09: +£0.034/kg from 0.7kg hrc £0.591→£0.639/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ss304l-bar', grade: '304L (Austenitic Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 4.73, scrapRecoveryPricePerKg: 1.23, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). General-purpose austenitic forging bar — flanges, fittings, food/chemical; Ni/Cr surcharge driven. | Refresh 2026-09: +£0.127/kg from 1kg ss_sur £2.037→£2.164/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ss316l-bar', grade: '316L (Austenitic Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 6.33, scrapRecoveryPricePerKg: 1.43, densityKgPerM3: 8000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Mo-bearing austenitic — marine/chemical flanges, valve bodies; higher pitting resistance than 304. | Refresh 2026-09: +£0.129/kg from 1kg ss_sur £2.037→£2.164/kg, 0.03kg ni £12.302→£12.378/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ss17-4ph-bar', grade: '17-4PH (PH Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 9.30, scrapRecoveryPricePerKg: 1.62, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Precipitation-hardening martensitic stainless — aerospace fittings, pump/valve, high strength + corrosion. | Refresh 2026-09: +£0.101/kg from 0.6kg ss_sur £2.037→£2.164/kg, 0.035kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ss15-5ph-bar', grade: '15-5PH (PH Stainless Bar)', category: 'Stainless Steel Billet', pricePerKg: 9.90, scrapRecoveryPricePerKg: 1.62, densityKgPerM3: 7800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Transverse-toughness PH stainless — aerospace structural, landing-gear fittings; cleaner than 17-4. | Refresh 2026-09: +£0.101/kg from 0.6kg ss_sur £2.037→£2.164/kg, 0.035kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    // ── Aluminium forging stock ────────────────────────────────────────────
    { id: 'mat-al6061-forge', grade: '6061 (Al Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 3.34, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). General-purpose forged aluminium — brackets, fittings, structural; T6 heat-treatable, weldable. | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    ...AL_BILLETS,
    ...CF_REVIEW_GRADES,
    ...SCOPE_REVIEW_GRADES,
    { id: 'mat-al6082-forge', grade: '6082 (Al Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 3.24, scrapRecoveryPricePerKg: 0.54, densityKgPerM3: 2700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). European structural forging alloy — suspension arms, chassis brackets; higher strength than 6061. | Refresh 2026-09: −£0.060/kg from 0.97kg al £2.910→£2.849/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-al7075-forge', grade: '7075 (Al Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 4.60, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2810, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). High-strength Al-Zn — aerospace/defence structural forgings, motorsport uprights; T73 for SCC resistance. | Refresh 2026-09: +£0.004/kg from 0.89kg al £2.910→£2.849/kg, 0.06kg zn £2.164→£2.913/kg, 0.02kg cu £10.070→£10.768/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-al2618-forge', grade: '2618 (Al-Cu Piston/Aero)', category: 'Aluminium Forging Billet', pricePerKg: 5.18, scrapRecoveryPricePerKg: 0.55, densityKgPerM3: 2760, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Elevated-temperature Al-Cu — forged pistons, compressor/turbo wheels; creep-resistant to ~200°C. | Refresh 2026-09: −£0.022/kg from 0.93kg al £2.910→£2.849/kg, 0.05kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    // ── Titanium forging bar ───────────────────────────────────────────────
    { id: 'mat-ti-cp-gr2', grade: 'CP Titanium Grade 2 (Forging Bar)', category: 'Titanium Forging Billet', pricePerKg: 25.59, scrapRecoveryPricePerKg: 3.94, densityKgPerM3: 4510, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Commercially-pure titanium — chemical/marine, medical, corrosion service; readily forged/formed. | Refresh 2026-09: −£0.408/kg from 1kg ti £5.398→£4.989/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ti-6al4v-forge', grade: 'Ti-6Al-4V Grade 5 (Forging Bar)', category: 'Titanium Forging Billet', pricePerKg: 37.63, scrapRecoveryPricePerKg: 5.45, densityKgPerM3: 4430, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Workhorse aerospace/medical titanium — airframe/engine forgings, implants; high strength-to-weight, β-forged for toughness. | Refresh 2026-09: −£0.367/kg from 0.9kg ti £5.398→£4.989/kg; premiums held', confidence: 'Low' },
    // ── Nickel superalloy forging bar ──────────────────────────────────────
    { id: 'mat-inconel718-forge', grade: 'Inconel 718 (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 44.04, scrapRecoveryPricePerKg: 8.01, densityKgPerM3: 8190, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Age-hardenable Ni-Cr superalloy — turbine discs, shafts, rings; VIM/VAR remelt, high hot-strength. | Refresh 2026-09: +£0.040/kg from 0.53kg ni £12.302→£12.378/kg, 0.03kg mo £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-waspaloy-forge', grade: 'Waspaloy (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 70.04, scrapRecoveryPricePerKg: 12.01, densityKgPerM3: 8190, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Co-strengthened Ni superalloy — hot-section turbine discs, seals; retains strength to ~700°C, Co adder over 718. | Refresh 2026-09: +£0.044/kg from 0.58kg ni £12.302→£12.378/kg, 0.13kg co £1.000→£1.000/kg, 0.04kg mo £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-inconel625-forge', grade: 'Inconel 625 (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 38.05, scrapRecoveryPricePerKg: 7.01, densityKgPerM3: 8440, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Solid-solution Ni-Cr-Mo — marine/chemical, exhaust, subsea; excellent corrosion + weldability, non-age-hardening. | Refresh 2026-09: +£0.046/kg from 0.61kg ni £12.302→£12.378/kg, 0.09kg mo £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-hastelloy-c276-forge', grade: 'Hastelloy C-276 (Forging Bar)', category: 'Nickel Superalloy Billet', pricePerKg: 55.04, scrapRecoveryPricePerKg: 9.01, densityKgPerM3: 8890, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Ni-Mo-Cr — severe chemical/acid, flue-gas, subsea valves; outstanding pitting/crevice resistance, high Mo adder. | Refresh 2026-09: +£0.043/kg from 0.57kg ni £12.302→£12.378/kg, 0.16kg mo £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-monel400-forge', grade: 'Monel 400 (Forging Bar)', category: 'Nickel Alloy Billet', pricePerKg: 28.27, scrapRecoveryPricePerKg: 5.05, densityKgPerM3: 8800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Ni-Cu — marine shafting, valves, seawater service; resists chlorides and HF, non-hardenable. | Refresh 2026-09: +£0.267/kg from 0.66kg ni £12.302→£12.378/kg, 0.31kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ti-6242-forge', grade: 'Ti-6Al-2Sn-4Zr-2Mo (Forging Bar)', category: 'Titanium Forging Billet', pricePerKg: 51.65, scrapRecoveryPricePerKg: 6.46, densityKgPerM3: 4540, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Near-α high-temp titanium — compressor discs/blades to ~540°C, engine forgings; premium over Ti-6Al-4V. | Refresh 2026-09: −£0.351/kg from 0.86kg ti £5.398→£4.989/kg; premiums held', confidence: 'Low' },
    { id: 'mat-al7050-forge', grade: '7050 (Al-Zn Aero Forging Stock)', category: 'Aluminium Forging Billet', pricePerKg: 8.50, scrapRecoveryPricePerKg: 1.10, densityKgPerM3: 2830, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). High-strength aerospace 7xxx — thick-section airframe fittings, bulkheads; better SCC resistance than 7075. | Refresh 2026-09: +£0.004/kg from 0.89kg al £2.910→£2.849/kg, 0.06kg zn £2.164→£2.913/kg, 0.02kg cu £10.070→£10.768/kg; premiums held', confidence: 'Low' },
    { id: 'mat-mg-az31-forge', grade: 'AZ31B (Mg Forging Bar)', category: 'Magnesium Forging Billet', pricePerKg: 6.31, scrapRecoveryPricePerKg: 0.87, densityKgPerM3: 1770, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Wrought Mg-Al-Zn — lightweight brackets, aerospace/defence, portable structures; forged warm (~300–400°C). | Refresh 2026-09: −£0.192/kg from 0.96kg mg £1.972→£1.773/kg, 0.03kg al £2.910→£2.849/kg; premiums held', confidence: 'Low' },
    // ── Copper alloy forging stock ─────────────────────────────────────────
    { id: 'mat-brass-cz122-forge', grade: 'CZ122 / CW617N (Forging Brass)', category: 'Copper Alloy Billet', pricePerKg: 7.90, scrapRecoveryPricePerKg: 3.29, densityKgPerM3: 8500, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07 (see FORGING PRICING BASIS). Hot-stamping brass — valve bodies, fittings, plumbing; excellent forgeability and machinability. | Refresh 2026-09: +£0.697/kg from 0.58kg cu £10.070→£10.768/kg, 0.39kg zn £2.164→£2.913/kg, 0.03kg pb £1.442→£1.438/kg; premiums held', confidence: 'Low' },
    // ── Paint / coating materials (price per kg wet paint) ─────────────────
    { id: 'mat-paint-ecoat', grade: 'E-coat (Cathodic)', category: 'Paint', pricePerKg: 3.68, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Low' },
    { id: 'mat-paint-primer', grade: '2K Primer', category: 'Paint', pricePerKg: 6.10, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1350, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Low' },
    { id: 'mat-paint-basecoat', grade: 'Waterborne Basecoat', category: 'Paint', pricePerKg: 8.62, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Low' },
    { id: 'mat-paint-clearcoat', grade: '2K Clearcoat', category: 'Paint', pricePerKg: 9.98, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK coating supplier, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Low' },
    { id: 'mat-paint-powder', grade: 'Powder Coat (Polyester)', category: 'Paint', pricePerKg: 3.36, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK powder coat supplier, Jun 2026. Index-anchored 2026-07 refresh. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Medium' },
    // ── Paint / coating (extended) ─────────────────────────────────────────
    { id: 'mat-paint-1k-primer', grade: '1K Etch Primer', category: 'Paint', pricePerKg: 5.40, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Single-pack etch/adhesion primer — pretreat for aluminium/mixed substrates. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Low' },
    { id: 'mat-paint-sb-basecoat', grade: 'Solventborne Basecoat', category: 'Paint', pricePerKg: 9.20, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Solventborne colour basecoat — refinish/low-volume lines where waterborne cure is impractical. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Low' },
    { id: 'mat-paint-uv-clear', grade: 'UV-Cure Clearcoat', category: 'Paint', pricePerKg: 14.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1080, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. UV-cure clearcoat — instant cure, high scratch resistance, headlamp lenses and trim. | Refresh 2026-09: INDEX FLAT — Index flat: automotive coatings increases (PPG up to 20% Apr, BASF 7% May 2026) took effect before the June anchor; no Q3 2026 automotive coatings increase announced.', confidence: 'Low' },
    { id: 'mat-paint-pvc-underbody', grade: 'PVC Underbody / Anti-Chip Sealer', category: 'Paint', pricePerKg: 2.57, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Sprayable PVC underbody/anti-chip coating — sills, wheel arches, stone-chip protection. | Refresh 2026-09: −£0.031/kg from 0.4kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Low' },
    // ── Blow Moulding Polymers ───────────────────────────────────────────────
    { id: 'mat-pp-bm', grade: 'PP Blow Grade (MFI 1.0, random co-polymer)', category: 'Blow Moulding', pricePerKg: 1.11, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. PP blow grade (random co-polymer, MFI 1.0) — automotive ducts, coolant reservoirs, squeeze bottles. CoolFactor ~3.16 s/mm². Index-anchored 2026-07 refresh. | Refresh 2026-09: +£0.027/kg from 1kg pp £0.960→£0.987/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-petg-bm', grade: 'PETG Clear Blow Grade', category: 'Blow Moulding', pricePerKg: 2.18, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1270, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. PETG — clear cosmetic/food bottles, chemical containers. Excellent clarity. CoolFactor ~3.0 s/mm². Index-anchored 2026-07 refresh. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Medium' },
    { id: 'mat-pvc-bm', grade: 'PVC Rigid Blow Grade (uPVC bottle grade)', category: 'Blow Moulding', pricePerKg: 0.85, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1380, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. Rigid PVC blow grade — detergent/shampoo/food bottles. Good chemical resistance. CoolFactor ~2.5 s/mm². Index-anchored 2026-07 refresh. | Refresh 2026-09: −£0.066/kg from 0.85kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-tpe-bm', grade: 'TPE Blow Grade 40 Shore A', category: 'Blow Moulding', pricePerKg: 2.48, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. TPE blow grade — soft-touch squeeze bottles, medical bulbs, automotive boots, flexible ducts. Shore 40A. Index-anchored 2026-07 refresh. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-eva-bm', grade: 'EVA Blow Grade (14% VA)', category: 'Blow Moulding', pricePerKg: 1.85, scrapRecoveryPricePerKg: 0.09, densityKgPerM3: 930, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor Jun 2026. EVA 14% vinyl acetate — flexible squeeze bottles, wine casks, co-extrusion tie layers. CoolFactor ~3.3 s/mm². Index-anchored 2026-07 refresh. | Refresh 2026-09: +£0.173/kg from 0.8kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Low' },
    // ── Blow Moulding (extended) ─────────────────────────────────────────────
    { id: 'mat-hdpe-bm', grade: 'HDPE Blow Grade (jerry can / drum)', category: 'Blow Moulding', pricePerKg: 1.14, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Blow-moulding HDPE (high MW) — jerry cans, drums, IBC bottles, industrial containers. The workhorse blow resin. CoolFactor ~3.0 s/mm². | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-hdpe-fuel-coex', grade: 'HDPE Coex Fuel-Tank Grade (6-layer/EVOH)', category: 'Blow Moulding', pricePerKg: 1.54, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Multilayer HDPE/EVOH barrier grade — automotive fuel tanks, permeation-controlled containers. CoolFactor ~3.0 s/mm². | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Low' },
    { id: 'mat-pa6-bm', grade: 'PA6 Blow Grade (charge-air / ducts)', category: 'Blow Moulding', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. High-melt-strength PA6 — 3D-blown charge-air ducts, turbo hoses, under-bonnet. CoolFactor ~2.4 s/mm². | Refresh 2026-09: NOT SOURCED — pa6: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pc-bm', grade: 'PC Blow Grade (clear/impact)', category: 'Blow Moulding', pricePerKg: 3.90, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Blow-grade polycarbonate — water bottles (5-gal), light globes, impact-clear containers. CoolFactor ~2.5 s/mm². | Refresh 2026-09: NOT SOURCED — pc: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-ldpe-bm', grade: 'LDPE Blow Grade', category: 'Blow Moulding', pricePerKg: 1.20, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Soft squeeze bottles, tubes — low stiffness, high ESCR. CoolFactor ~3.5 s/mm². | Refresh 2026-09: +£0.217/kg from 1kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-lldpe-bm', grade: 'LLDPE Blow Grade', category: 'Blow Moulding', pricePerKg: 1.17, scrapRecoveryPricePerKg: 0.11, densityKgPerM3: 925, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Tough small containers, toys — better ESCR/impact than HDPE. CoolFactor ~3.4 s/mm². | Refresh 2026-09: +£0.117/kg from 1kg lldpe £0.930→£1.047/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pet-preform', grade: 'PET Stretch-Blow Bottle Grade', category: 'Blow Moulding', pricePerKg: 1.25, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1370, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. SBM water/CSD/juice bottles (preform reheat-blow). IV ~0.80. CoolFactor ~3.0 s/mm². | Refresh 2026-09: NOT SOURCED — pet: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-tritan-bm', grade: 'Tritan Copolyester (BPA-free clear)', category: 'Blow Moulding', pricePerKg: 6.50, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1180, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Premium clarity + impact, BPA-free — reusable bottles, tumblers, medical. CoolFactor ~3.0 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-biope-bm', grade: 'Bio-PE Blow Grade (sugarcane HDPE)', category: 'Blow Moulding', pricePerKg: 2.20, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Drop-in renewable HDPE (I’m green) — cosmetics/food bottles, low-CO₂ packaging. CoolFactor ~3.0 s/mm². | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-rhdpe-bm', grade: 'Recycled HDPE Blow Grade (PCR)', category: 'Blow Moulding', pricePerKg: 0.94, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Post-consumer HDPE — non-food bottles, detergent, drums; wider property spread. CoolFactor ~3.0 s/mm². | Refresh 2026-09: −£0.008/kg from 0.6kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Low' },
    { id: 'mat-rpp-bm', grade: 'Recycled PP Blow Grade (PCR)', category: 'Blow Moulding', pricePerKg: 0.92, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Post-consumer PP — non-visible/industrial containers; lower CO₂, wider tolerance. CoolFactor ~3.16 s/mm². | Refresh 2026-09: +£0.016/kg from 0.6kg pp £0.960→£0.987/kg; premiums held', confidence: 'Low' },
    // ── Extrusion-Grade Polymers (pipe / profile / sheet / cable / tube / foam) ─
    { id: 'mat-pe100-pipe', grade: 'PE100 Pipe Grade (black, PE4710)', category: 'Extrusion', pricePerKg: 1.34, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 960, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK pipe-resin benchmark 2026-07. High-MW bimodal HDPE — pressure water/gas pipe (PE4710). Die swell ~15%. | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pe80-pipe', grade: 'PE80 Pipe Grade', category: 'Extrusion', pricePerKg: 1.27, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK pipe-resin benchmark 2026-07. Medium-density pipe grade — gas/drainage pipe. | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-upvc-pipe', grade: 'uPVC Pipe Compound (K67, dry-blend)', category: 'Extrusion', pricePerKg: 0.83, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1420, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK PVC compounder 2026-07. Rigid PVC-U pressure/soil pipe compound (Ca-Zn stabilised). Low die swell ~5%. Heat-sensitive — limits output. | Refresh 2026-09: −£0.066/kg from 0.85kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pvc-cable', grade: 'PVC Cable Compound (flexible, insulation)', category: 'Extrusion', pricePerKg: 1.30, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1350, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK cable-compound benchmark 2026-07. Plasticised PVC insulation/sheathing — building wire, flex cords. | Refresh 2026-09: −£0.047/kg from 0.6kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-xlpe-cable', grade: 'XLPE Cable Insulation Compound', category: 'Extrusion', pricePerKg: 2.32, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 925, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK cable-compound benchmark 2026-07. Crosslinkable PE (peroxide/silane) — MV/HV cable insulation. Cured, non-recyclable scrap. | Refresh 2026-09: +£0.217/kg from 1kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Low' },
    { id: 'mat-gpps-ext', grade: 'GPPS Extrusion Sheet Grade', category: 'Extrusion', pricePerKg: 1.67, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor 2026-07. General-purpose PS — clear thermoforming/sign sheet. Low die swell. | Refresh 2026-09: +£0.369/kg from 1kg gpps £1.000→£1.369/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-abs-ext-sheet', grade: 'ABS Extrusion Sheet Grade', category: 'Extrusion', pricePerKg: 1.79, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor 2026-07. Extrusion ABS — automotive/appliance thermoforming sheet, capstock. | Refresh 2026-09: −£0.065/kg from 1kg abs £0.775→£0.710/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pmma-ext-sheet', grade: 'PMMA Extrusion Sheet (acrylic)', category: 'Extrusion', pricePerKg: 2.60, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1190, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor 2026-07. Extruded acrylic sheet — glazing, signage, light guides. Low die swell. | Refresh 2026-09: NOT SOURCED — pmma: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pc-ext-sheet', grade: 'PC Extrusion/Solid Sheet Grade', category: 'Extrusion', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor 2026-07. Extruded polycarbonate solid/multiwall sheet — glazing, machine guards. High melt temp → high energy. | Refresh 2026-09: NOT SOURCED — pc: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pvc-medical-tube', grade: 'Medical PVC Tubing Compound (DEHP-free)', category: 'Extrusion', pricePerKg: 1.90, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK medical-compound benchmark 2026-07. Non-phthalate plasticised PVC — IV/medical tubing, ISO 10993. | Refresh 2026-09: −£0.047/kg from 0.6kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Low' },
    { id: 'mat-tpu-medical-tube', grade: 'Medical TPU Tubing (85A)', category: 'Extrusion', pricePerKg: 6.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK medical-compound benchmark 2026-07. Aliphatic/aromatic TPU — catheters, medical tube; biocompatible. | Refresh 2026-09: NOT SOURCED — tpu: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-tpe-profile', grade: 'TPE-S Extrusion Profile (60 Shore A)', category: 'Extrusion', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 940, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor 2026-07. Styrenic TPE — soft-touch seals, glazing gaskets (recyclable EPDM alternative). Die swell ~10%. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-pvc-foam', grade: 'Rigid PVC Foam (Celuka) Profile', category: 'Extrusion', pricePerKg: 1.08, scrapRecoveryPricePerKg: 0.03, densityKgPerM3: 700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK PVC compounder 2026-07. Free-foam/Celuka rigid PVC — trim board, cladding, furniture profile. Low bulk density. | Refresh 2026-09: −£0.066/kg from 0.85kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Low' },
    { id: 'mat-pp-ext-sheet', grade: 'PP Extrusion Sheet Grade', category: 'Extrusion', pricePerKg: 1.18, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK resin distributor 2026-07. High-melt-strength PP — thermoforming/packaging sheet, corrugated board. | Refresh 2026-09: +£0.027/kg from 1kg pp £0.960→£0.987/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pa12-ext-tube', grade: 'PA12 Extrusion (fuel/brake line tube)', category: 'Extrusion', pricePerKg: 6.20, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1010, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality resin 2026-07. Nylon 12 — automotive fuel/brake/air-brake tube, multi-layer barrier line. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Extrusion grades added in the aluminium-extrusion review (Oct 2026): window and seal
    //    profile PVC, PP-R and PE-X pipe, PA11 / PVDF / PEEK tube, TPV weatherseal, stock
    //    shapes, capstock. Sourced where a 2026 price was found; else the library's own index.
    { id: 'mat-upvc-window-profile', grade: 'PVC-U Window Profile Compound (impact-modified, Ca-Zn)', category: 'Extrusion', pricePerKg: 1.29, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1450, region: 'UK', effectiveDate: '2026-09', sourceNote: 'EU rigid PVC compound EUR 1,200–1,800/t (IndexBox EU PVC compounds, 2026) — mid-point €1.50/kg at €1.165/£. Window, door and cladding profiles (EN 12608). Impact-modified, Ca-Zn stabilised, TiO₂. Aluminium-extrusion review 2026-10.', confidence: 'Medium' },
    { id: 'mat-pvcp-profile', grade: 'PVC-P Flexible Profile / Seal Compound (70 Shore A)', category: 'Extrusion', pricePerKg: 1.54, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1280, region: 'UK', effectiveDate: '2026-09', sourceNote: 'EU flexible PVC compound EUR 1,400–2,200/t (IndexBox EU PVC compounds, 2026) — mid-point €1.80/kg at €1.165/£. Glazing gaskets, edge trim, co-extruded seals. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-ppr-pipe', grade: 'PP-R Pipe Grade (random copolymer, hot & cold water)', category: 'Extrusion', pricePerKg: 1.17, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'PPR pipe grade €1,358/t, week 36 2026 (plasticportal.eu Europe price report) at €1.165/£. PP-R / PP-RCT pressure pipe (EN ISO 15874). Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-pex-pipe', grade: 'PE-Xb Crosslinkable Pipe Compound (silane, Monosil)', category: 'Extrusion', pricePerKg: 1.61, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 945, region: 'UK', effectiveDate: '2026-09', sourceNote: 'ESTIMATE — no 2026 PE-Xb compound price found: PE100 pipe grade £1.34/kg + ~20% for the silane graft and catalyst masterbatch. Underfloor heating and plumbing pipe (EN ISO 15875); crosslinked after extrusion, so no regrind credit. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-pa11-tube', grade: 'PA11 Tube Grade (Rilsan-type, bio-based)', category: 'Extrusion', pricePerKg: 6.32, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1030, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Arkema Rilsan PA11 HT grade listed at $8,390/t (plas.com, 2026) at $1.3285/£. Air-brake, fuel and hydraulic tube, offshore umbilicals. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-pvdf-ext', grade: 'PVDF Extrusion Grade (homopolymer)', category: 'Extrusion', pricePerKg: 9.03, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1780, region: 'UK', effectiveDate: '2026-09', sourceNote: 'PVDF homopolymer $11–13/kg (2026 Asian supplier listings) — $12/kg at $1.3285/£; a European contract price is likely higher, so treat as a floor. Chemical pipe, liners, cable jacket. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-tpv-profile', grade: 'TPV Extrusion Profile (EPDM/PP, automotive weatherseal)', category: 'Extrusion', pricePerKg: 3.21, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 970, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Same index as the library’s mat-tpv (TPV Santoprene-type, refreshed 2026-09 on PP 40% + EPDM 40%). Glass-run channels, belt-line and door seals. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-pom-rod', grade: 'POM Extrusion Grade (rod / tube stock shapes)', category: 'Extrusion', pricePerKg: 2.32, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1410, region: 'UK', effectiveDate: '2026-09', sourceNote: 'POM natural €2.70/kg, September 2026 (Europe price report) at €1.165/£. Extruded rod, tube and plate stock. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-hdpe-profile', grade: 'HDPE Extrusion Grade (profile / tube / conduit)', category: 'Extrusion', pricePerKg: 1.05, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 955, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Same index as the library’s mat-hdpe (HDPE pellet, refreshed 2026-09). Fractional-MFI extrusion grade for profiles, conduit, duct. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-ldpe-tube', grade: 'LDPE Extrusion Grade (soft tube, cable sheath)', category: 'Extrusion', pricePerKg: 1.09, scrapRecoveryPricePerKg: 0.12, densityKgPerM3: 922, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Same index as the library’s mat-ldpe (LDPE 2426H, refreshed 2026-09). Soft tube, drip line, cable jacket. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-pa6-ext-tube', grade: 'PA6 Extrusion Grade (corrugated conduit / tube)', category: 'Extrusion', pricePerKg: 1.68, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Same index as the library’s mat-pa6 (PA6 unfilled, refreshed 2026-09). Corrugated wiring conduit, pneumatic tube. Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-tpu-ext-hose', grade: 'TPU Extrusion Grade (85A, hose and tube)', category: 'Extrusion', pricePerKg: 2.52, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Same index as the library’s mat-tpu-shore85 (refreshed 2026-09). Pneumatic and fuel hose, cable jacket (not medical — see mat-tpu-medical-tube). Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-peek-ext', grade: 'PEEK Extrusion Grade (tube, rod, film)', category: 'Extrusion', pricePerKg: 76.00, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Same index as the library’s mat-peek (PEEK unfilled). High-temperature tube and rod; regrind not credited (the 0.10 is nominal). Review 2026-10.', confidence: 'Medium' },
    { id: 'mat-asa-capstock', grade: 'ASA Capstock Grade (co-extruded weather layer)', category: 'Extrusion', pricePerKg: 2.24, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1070, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Same index as the library’s mat-asa (refreshed 2026-09 on ABS). Weatherable cap layer co-extruded over PVC or ABS profiles. Review 2026-10.', confidence: 'Medium' },
    // ── Additives / Masterbatch (let-down adders — see extrusion additive input) ─
    { id: 'mat-mb-colour', grade: 'Colour Masterbatch (universal)', category: 'Additive / Masterbatch', pricePerKg: 4.63, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK MB supplier 2026-07. Universal colour concentrate; let-down ~2–4%. | Refresh 2026-09: +£0.130/kg from 0.6kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-mb-white-tio2', grade: 'White Masterbatch (70% TiO₂)', category: 'Additive / Masterbatch', pricePerKg: 3.29, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1600, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK MB supplier 2026-07. High-TiO₂ white; let-down ~3–6%. | Refresh 2026-09: +£0.087/kg from 0.6kg tio2 £1.000→£1.000/kg, 0.4kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-mb-black', grade: 'Black Masterbatch (40% carbon)', category: 'Additive / Masterbatch', pricePerKg: 2.23, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK MB supplier 2026-07. Carbon-black concentrate (also UV shield); let-down ~2–3%. | Refresh 2026-09: +£0.130/kg from 0.4kg carbonblack £1.000→£1.000/kg, 0.6kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-add-uv', grade: 'UV Stabiliser Masterbatch (HALS)', category: 'Additive / Masterbatch', pricePerKg: 6.80, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK additive supplier 2026-07. HALS/UV-absorber concentrate for outdoor profiles/pipe; let-down ~1–3%. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-add-antistat', grade: 'Anti-Static Additive Masterbatch', category: 'Additive / Masterbatch', pricePerKg: 5.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK additive supplier 2026-07. Migratory/permanent anti-stat; let-down ~1–2%. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-add-fr', grade: 'Flame-Retardant Masterbatch (halogen-free)', category: 'Additive / Masterbatch', pricePerKg: 4.20, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK additive supplier 2026-07. Non-halogen FR for cable/profile; high let-down ~10–25% (property-driven). | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-add-impact', grade: 'Impact Modifier (acrylic/CPE)', category: 'Additive / Masterbatch', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK additive supplier 2026-07. Impact modifier for rigid PVC/PP; let-down ~4–8%. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-add-procaid', grade: 'Processing Aid (fluoropolymer PPA)', category: 'Additive / Masterbatch', pricePerKg: 8.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK additive supplier 2026-07. Fluoropolymer PPA — eliminates melt fracture, boosts output; let-down ~0.05–0.1%. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Thermoforming Sheet (gauge stock; regrind recovery = trimmed skeleton value) ─
    // Commodity thermoplastics
    { id: 'mat-hips-tf', grade: 'HIPS Thermoforming Sheet', category: 'Thermoforming Sheet', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.41, densityKgPerM3: 1040, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. High-impact PS gauge sheet — cups, trays, signage, refrigerator liners. Wide forming window; skeleton fully regrindable. | Refresh 2026-09: +£0.399/kg from 1kg hips £0.970→£1.369/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-abs-tf', grade: 'ABS Thermoforming Sheet', category: 'Thermoforming Sheet', pricePerKg: 1.94, scrapRecoveryPricePerKg: 0.44, densityKgPerM3: 1050, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. Automotive/appliance ABS gauge sheet — interior trim, cargo liners, luggage; SPI texture capable. | Refresh 2026-09: −£0.065/kg from 1kg abs £0.775→£0.710/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-petg-tf', grade: 'PETG Thermoforming Sheet (clear)', category: 'Thermoforming Sheet', pricePerKg: 1.85, scrapRecoveryPricePerKg: 0.45, densityKgPerM3: 1270, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. Glycol-modified PET — clear packaging, medical trays, retail; easy deep draw, no pre-dry. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Medium' },
    { id: 'mat-apet-tf', grade: 'APET Sheet (amorphous, food pack)', category: 'Thermoforming Sheet', pricePerKg: 1.55, scrapRecoveryPricePerKg: 0.40, densityKgPerM3: 1340, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. Amorphous PET — clear food trays/clamshells, blister; highest-volume packaging sheet. rPET content common. | Refresh 2026-09: NOT SOURCED — pet: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-cpet-tf', grade: 'CPET Sheet (crystalline, dual-ovenable)', category: 'Thermoforming Sheet', pricePerKg: 1.75, scrapRecoveryPricePerKg: 0.35, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. Crystallising PET — dual-ovenable ready-meal trays (-40 to +220°C); needs hot tool + long crystallisation cycle. | Refresh 2026-09: NOT SOURCED — pet: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-rpvc-tf', grade: 'Rigid PVC Thermoforming Sheet', category: 'Thermoforming Sheet', pricePerKg: 1.28, scrapRecoveryPricePerKg: 0.19, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. Rigid PVC gauge sheet — blister packs, ID/credit cards, medical; low forming temp, heat-sensitive. | Refresh 2026-09: −£0.066/kg from 0.85kg pvc £0.453→£0.375/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pp-tf', grade: 'PP Thermoforming Sheet (HMS)', category: 'Thermoforming Sheet', pricePerKg: 1.33, scrapRecoveryPricePerKg: 0.31, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. High-melt-strength PP — hot-fill cups, deli tubs, medical; narrow window, needs sag control. Lightest sheet. | Refresh 2026-09: +£0.027/kg from 1kg pp £0.960→£0.987/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-hdpe-tf', grade: 'HDPE Thermoforming Sheet', category: 'Thermoforming Sheet', pricePerKg: 1.24, scrapRecoveryPricePerKg: 0.35, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. HDPE gauge sheet — industrial trays, liners, kayaks (heavy-gauge); heavy sag, low melt strength. | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ldpe-tf', grade: 'LDPE Thermoforming Sheet', category: 'Thermoforming Sheet', pricePerKg: 1.52, scrapRecoveryPricePerKg: 0.35, densityKgPerM3: 925, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. LDPE gauge sheet — soft protective trays, flexible packaging inserts. Very low melt strength. | Refresh 2026-09: +£0.217/kg from 1kg ldpe £0.870→£1.087/kg; premiums held', confidence: 'Low' },
    { id: 'mat-ps-foam-tf', grade: 'PS Foam Sheet (foamed tray stock)', category: 'Thermoforming Sheet', pricePerKg: 1.97, scrapRecoveryPricePerKg: 0.18, densityKgPerM3: 120, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. Expanded PS foam sheet — egg cartons, meat/produce trays, insulation; low density, high stiffness-per-kg. | Refresh 2026-09: +£0.369/kg from 1kg gpps £1.000→£1.369/kg; premiums held', confidence: 'Low' },
    // Engineering & high-performance thermoplastics
    { id: 'mat-pmma-tf', grade: 'PMMA / Acrylic Sheet (cast/extruded)', category: 'Thermoforming Sheet', pricePerKg: 2.90, scrapRecoveryPricePerKg: 0.35, densityKgPerM3: 1190, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet distributor 2026-07. Acrylic sheet — baths/spas, skylights, lightboxes, displays; excellent clarity, low sag (high melt strength). | Refresh 2026-09: NOT SOURCED — pmma: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pc-tf', grade: 'PC Thermoforming Sheet', category: 'Thermoforming Sheet', pricePerKg: 3.40, scrapRecoveryPricePerKg: 0.35, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet distributor 2026-07. Polycarbonate sheet — machine guards, glazing, riot shields, aircraft interiors; high forming temp → high oven energy, must pre-dry. | Refresh 2026-09: NOT SOURCED — pc: Not sourced this period: engineering resin prices are paywalled (PIE/ICIS). Direction only: PC rising through Aug 2026, PA6 rebounding, PA66 under pressure, PET declining — no like-for-like June→Sep figures. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-pei-tf', grade: 'PEI (Ultem) Sheet (aerospace)', category: 'Thermoforming Sheet', pricePerKg: 28.00, scrapRecoveryPricePerKg: 1.00, densityKgPerM3: 1270, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality 2026-07. Polyetherimide sheet — aircraft interior panels/ducting (FST/OSU compliant); very high forming temp ~250°C. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-pps-tf', grade: 'PPS Sheet (high-temp)', category: 'Thermoforming Sheet', pricePerKg: 14.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1350, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK speciality 2026-07. Polyphenylene sulphide sheet — chemical/high-temp trays, under-bonnet; ~285°C forming, semi-crystalline. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // Multi-layer / co-extruded sheets
    { id: 'mat-abs-pmma-tf', grade: 'ABS/PMMA Co-ex Sheet (capped)', category: 'Thermoforming Sheet', pricePerKg: 2.56, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1080, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. ABS substrate + acrylic cap — sanitaryware, caravan/RV panels, spas; UV/scratch cap. Multilayer regrind limited. | Refresh 2026-09: −£0.039/kg from 0.6kg abs £0.775→£0.710/kg, 0.4kg pmma £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-abs-pc-tf', grade: 'ABS/PC Co-ex Sheet', category: 'Thermoforming Sheet', pricePerKg: 3.07, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. PC/ABS blend/co-ex — automotive exterior, luggage, high-impact housings; higher forming temp than ABS. | Refresh 2026-09: −£0.026/kg from 0.6kg pc £1.000→£1.000/kg, 0.4kg abs £0.775→£0.710/kg; premiums held', confidence: 'Low' },
    { id: 'mat-pp-tpo-tf', grade: 'PP/TPO Automotive Sheet', category: 'Thermoforming Sheet', pricePerKg: 1.92, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. TPO-skinned PP — automotive interior skins, load floors, underbody shields; soft-touch grain, recyclable. | Refresh 2026-09: +£0.019/kg from 0.7kg pp £0.960→£0.987/kg, 0.25kg epdm £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-petg-barrier-tf', grade: 'PETG/EVOH Barrier Sheet', category: 'Thermoforming Sheet', pricePerKg: 2.40, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK sheet extruder 2026-07. Multilayer PET/EVOH/tie barrier — MAP food trays, extended shelf-life; EVOH barrier core. Regrind cross-contamination limits recovery. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Rotational Moulding Polymers ─────────────────────────────────────────
    { id: 'mat-lldpe-roto', grade: 'LLDPE Roto Powder (natural)', category: 'Rotational Moulding', pricePerKg: 1.47, scrapRecoveryPricePerKg: 0.11, densityKgPerM3: 940, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Primary roto resin — tanks, containers, playground; ground to ~35 mesh (add grinding premium).  | Refresh 2026-09: +£0.117/kg from 1kg lldpe £0.930→£1.047/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-hdpe-roto', grade: 'HDPE Roto Powder', category: 'Rotational Moulding', pricePerKg: 1.29, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Stiffer roto grade — large tanks, agricultural, marine. Higher modulus than LLDPE. | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-pp-roto', grade: 'PP Roto Powder', category: 'Rotational Moulding', pricePerKg: 1.48, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 905, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Higher-temp roto grade — chemical/hot-fill tanks, ducting. Narrower processing window. | Refresh 2026-09: +£0.027/kg from 1kg pp £0.960→£0.987/kg; premiums held', confidence: 'Low' },
    { id: 'mat-xlpe-roto', grade: 'Cross-Linked PE (XLPE) Roto', category: 'Rotational Moulding', pricePerKg: 1.74, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 940, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Cross-linked PE — fuel/chemical tanks, ESCR-critical; not regrindable, needs longer bake. | Refresh 2026-09: −£0.013/kg from 1kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Low' },
    { id: 'mat-pa12-roto', grade: 'PA12 Roto Powder', category: 'Rotational Moulding', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 1010, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. High-performance roto — air ducts, fuel tanks, aerospace; high melt temp, long cycle. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-fr-pe-roto', grade: 'Flame-Retardant PE Roto', category: 'Rotational Moulding', pricePerKg: 2.68, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 970, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. FR-compounded PE — enclosures, transit, rail (UL94/EN45545). Additive-loaded. | Refresh 2026-09: +£0.082/kg from 0.7kg lldpe £0.930→£1.047/kg; premiums held', confidence: 'Low' },
    { id: 'mat-foam-pe-roto', grade: 'Foamable PE Roto (structural foam core)', category: 'Rotational Moulding', pricePerKg: 1.99, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 700, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Chemical-blowing-agent PE for foamed sandwich walls — stiffness-per-kg, insulation. | Refresh 2026-09: +£0.094/kg from 0.8kg lldpe £0.930→£1.047/kg; premiums held', confidence: 'Low' },
    { id: 'mat-cond-pe-roto', grade: 'Conductive/Antistatic PE Roto', category: 'Rotational Moulding', pricePerKg: 2.49, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1010, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Carbon-loaded PE — ATEX/ESD tanks, fuel handling; surface resistivity <10^6 Ω. | Refresh 2026-09: +£0.094/kg from 0.8kg lldpe £0.930→£1.047/kg; premiums held', confidence: 'Low' },
    { id: 'mat-rpe-roto', grade: 'Recycled PE Roto Powder', category: 'Rotational Moulding', pricePerKg: 0.94, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 945, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Recyclate roto grade — non-critical tanks, planters, civils; wider property spread. | Refresh 2026-09: −£0.008/kg from 0.6kg hdpe £1.060→£1.047/kg; premiums held', confidence: 'Low' },
    // ── Rubber Compounds ─────────────────────────────────────────────────────
    { id: 'mat-epdm', grade: 'EPDM 70 Shore A', category: 'Rubber', pricePerKg: 1.90, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK rubber compounder Jun 2026. EPDM seals, hoses, weatherstrips. Shore 70A. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — epdm, carbonblack: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-nbr', grade: 'NBR 70 Shore A', category: 'Rubber', pricePerKg: 2.32, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK rubber compounder Jun 2026. Nitrile rubber — oil/fuel seals, O-rings. Shore 70A. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — nbr, carbonblack: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-silicone-hcr', grade: 'HCR Silicone 60 Shore A', category: 'Rubber', pricePerKg: 8.92, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK silicone supplier Jun 2026. High Consistency Rubber — compression/transfer moulding. Shore 60A. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — silicone: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-lsr', grade: 'LSR 40 Shore A', category: 'Rubber', pricePerKg: 15.75, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1130, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK silicone supplier Jun 2026. Liquid Silicone Rubber — injection moulding, medical/auto seals. Shore 40A. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — silicone: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-nr', grade: 'Natural Rubber SMR20', category: 'Rubber', pricePerKg: 1.84, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK rubber importer Jun 2026. Natural rubber SMR20 grade — tyre compounds, anti-vibration mounts. Index-anchored 2026-07 refresh. | Refresh 2026-09: +£0.119/kg from 0.5kg nr £1.697→£1.935/kg, 0.25kg carbonblack £1.000→£1.000/kg; premiums held', confidence: 'Low' },
    { id: 'mat-viton-fkm', grade: 'FKM Viton 75 Shore A', category: 'Rubber', pricePerKg: 23.10, scrapRecoveryPricePerKg: 0.20, densityKgPerM3: 1850, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK fluoroelastomer supplier Jun 2026. FKM Viton — high-temp/chemical seals (>200°C). Shore 75A. Index-anchored 2026-07 refresh. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-sbr', grade: 'SBR 65 Shore A', category: 'Rubber', pricePerKg: 1.45, scrapRecoveryPricePerKg: 0.03, densityKgPerM3: 1100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK rubber compounder Jun 2026. Styrene Butadiene Rubber — general-purpose seals, gaskets, belts, anti-vibration pads. Shore 65A. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — sbr, carbonblack: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-cr', grade: 'CR Neoprene 60 Shore A', category: 'Rubber', pricePerKg: 3.87, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1230, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK rubber compounder Jun 2026. Chloroprene/Neoprene — oil/weather-resistant seals, CV boots, hoses, cable sheaths. Shore 60A. Index-anchored 2026-07 refresh. | Refresh 2026-09: +£0.049/kg from 1kg crc £0.668→£0.717/kg; premiums held', confidence: 'Medium' },
    { id: 'mat-hnbr', grade: 'HNBR 70 Shore A', category: 'Rubber', pricePerKg: 5.65, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK rubber compounder Jun 2026. Hydrogenated Nitrile — high-temp oil seals to 150°C+, cam cover gaskets, power steering. Shore 70A. Index-anchored 2026-07 refresh. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-iir', grade: 'Butyl Rubber IIR 55 Shore A', category: 'Rubber', pricePerKg: 2.18, scrapRecoveryPricePerKg: 0.03, densityKgPerM3: 920, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK rubber importer Jun 2026. Butyl rubber — excellent gas impermeability, tire inner liners, vibration dampers, membrane seals. Shore 55A. Index-anchored 2026-07 refresh. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-pu-elastomer', grade: 'Polyurethane Elastomer 70 Shore A', category: 'Rubber', pricePerKg: 4.25, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK PU elastomer supplier Jun 2026. Cast/moulded polyurethane — wear-resistant seals, guide bushes, rollers, suspension bump stops. Shore 70A. Index-anchored 2026-07 refresh. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Medium' },
    // ── Rubber Compounds (extended — specialty elastomers) ───────────────────
    { id: 'mat-fvmq', grade: 'FVMQ Fluorosilicone 60 Shore A', category: 'Rubber', pricePerKg: 34.00, scrapRecoveryPricePerKg: 0.15, densityKgPerM3: 1400, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Fluorosilicone — fuel/oil resistance with silicone low-temp flexibility; aerospace/fuel-system seals. Shore 60A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-acm', grade: 'ACM Polyacrylate 70 Shore A', category: 'Rubber', pricePerKg: 6.80, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Polyacrylate — hot-oil transmission/engine seals to ~150°C, better than NBR. Shore 70A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-aem', grade: 'AEM (Vamac) 60 Shore A', category: 'Rubber', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Ethylene-acrylic — automotive hoses, boots, seals; heat + oil + weather resistance. Shore 60A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-eco', grade: 'ECO Epichlorohydrin 65 Shore A', category: 'Rubber', pricePerKg: 5.90, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1300, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Epichlorohydrin — fuel hoses, diaphragms; excellent fuel/ozone resistance and low permeability. Shore 65A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-csm', grade: 'CSM Hypalon 65 Shore A', category: 'Rubber', pricePerKg: 6.20, scrapRecoveryPricePerKg: 0.08, densityKgPerM3: 1500, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Chlorosulphonated PE — chemical/weather/ozone-resistant seals, roofing, cable jackets. Shore 65A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-br', grade: 'BR Polybutadiene (high-cis) 60 Shore A', category: 'Rubber', pricePerKg: 1.75, scrapRecoveryPricePerKg: 0.04, densityKgPerM3: 1000, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. High-cis polybutadiene — blended with NR/SBR for abrasion resistance & low rolling resistance; tyres, anti-vibration, rollers. Shore 60A. | Refresh 2026-09: NOT SOURCED — butadiene, carbonblack: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-bromobutyl', grade: 'Bromobutyl (BIIR) 50 Shore A', category: 'Rubber', pricePerKg: 2.85, scrapRecoveryPricePerKg: 0.04, densityKgPerM3: 930, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Brominated butyl — tyre inner liners, pharma closures/stoppers, curing bladders; low permeability + faster cure than plain IIR. Shore 50A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-chlorobutyl', grade: 'Chlorobutyl (CIIR) 55 Shore A', category: 'Rubber', pricePerKg: 2.75, scrapRecoveryPricePerKg: 0.04, densityKgPerM3: 930, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Chlorinated butyl — tyre inner liners, pharma stoppers, heat-resistant seals; co-vulcanisable with diene rubbers. Shore 55A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-ffkm', grade: 'FFKM Perfluoroelastomer (Kalrez-type) 75 Shore A', category: 'Rubber', pricePerKg: 320.00, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 2010, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Perfluoroelastomer — extreme chemical + >300°C seals for semicon, aerospace, oil&gas; the highest-cost elastomer, tiny O-rings. Shore 75A. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-nbr-high-acn', grade: 'NBR High-ACN (fuel) 75 Shore A', category: 'Rubber', pricePerKg: 2.55, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1250, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. High-acrylonitrile nitrile — maximum fuel/oil resistance for fuel hoses, gaskets; stiffer, worse low-temp than standard NBR. Shore 75A. | Refresh 2026-09: NOT SOURCED — nbr, carbonblack: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-epdm-peroxide', grade: 'EPDM Peroxide-Cured 70 Shore A', category: 'Rubber', pricePerKg: 2.15, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1150, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Peroxide-cured EPDM — better heat-ageing & compression set than sulphur-cured; coolant/steam seals, under-bonnet. Shore 70A. | Refresh 2026-09: NOT SOURCED — epdm, carbonblack: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-silicone-medical', grade: 'LSR Medical-Grade 30 Shore A', category: 'Rubber', pricePerKg: 16.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1120, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. USP Class VI / ISO 10993 liquid silicone — medical seals, valves, baby/health products; biocompatible, premium over industrial LSR. Shore 30A. | Refresh 2026-09: NOT SOURCED — silicone: Not sourced this period: synthetic rubber moves were weekly and mixed (ERJ, w/e 23 Sep 2026: SBR −2.3%, EPDM −1%, NBR +1%); no June→Sep level. Held at the June 2026 price.', confidence: 'Low' },
    // ── Composite fibre and resin materials ────────────────────────────────────
    { id: 'mat-cfrp-prepreg-t700', grade: 'T700 CF/Epoxy Prepreg (125°C cure)', category: 'Composite', pricePerKg: 33.60, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1560, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK composite supplier Jun 2026. T700/250F prepreg — structural automotive/aerospace hand layup. Vf~0.60. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — cf, epoxy: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-gfrp-prepreg-e', grade: 'E-glass/Epoxy Prepreg (120°C cure)', category: 'Composite', pricePerKg: 7.88, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK composite supplier Jun 2026. E-glass/epoxy prepreg — semi-structural panels, marine. Vf~0.55. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — gf, epoxy: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-cf-dry-3k', grade: 'Carbon Fibre 3K Twill Dry Fabric', category: 'Composite', pricePerKg: 25.20, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1750, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK composite supplier Jun 2026. 3K 2×2 twill dry CF — RTM, VARTM, filament winding. Pair with infusion resin. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — cf: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-gf-dry-e', grade: 'E-glass Woven Dry Fabric (600 g/m²)', category: 'Composite', pricePerKg: 3.99, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1800, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK composite supplier Jun 2026. Woven E-glass 600 g/m² — marine, wind, automotive GFRP. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — gf: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-epoxy-infusion', grade: 'Epoxy Infusion Resin System (LT cure)', category: 'Composite', pricePerKg: 13.65, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1200, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK composite supplier Jun 2026. Low-temp infusion epoxy (Gurit / Hexion). RTM/VARTM. Vf 0.50–0.60. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — epoxy: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-vinylester-rtm', grade: 'Vinyl Ester RTM Resin', category: 'Composite', pricePerKg: 5.46, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 1140, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK composite supplier Jun 2026. Vinyl ester RTM resin — marine, pipes, corrosion-resistant structures. Index-anchored 2026-07 refresh. | Refresh 2026-09: NOT SOURCED — upr: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-aramid-k49', grade: 'Aramid (Kevlar 49) Woven Fabric', category: 'Composite', pricePerKg: 31.50, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1440, region: 'UK', effectiveDate: '2026-09', sourceNote: 'UK composite supplier Jun 2026. Kevlar 49 — ballistic protection, aircraft flooring, helmets. Index-anchored 2026-07 refresh. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    // ── Composite (extended — UD prepreg, moulding compounds, thermoplastic, cores) ──
    { id: 'mat-cf-uni-t800', grade: 'T800 Unidirectional CF/Epoxy Prepreg', category: 'Composite', pricePerKg: 46.00, scrapRecoveryPricePerKg: 0.50, densityKgPerM3: 1580, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Intermediate-modulus UD prepreg — primary aerospace/motorsport structures, autoclave cure. Vf~0.60. | Refresh 2026-09: NOT SOURCED — cf, epoxy: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Low' },
    { id: 'mat-smc-gf', grade: 'SMC (Glass-Filled Sheet Moulding Compound)', category: 'Composite', pricePerKg: 2.85, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1900, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Glass/polyester SMC — compression-moulded body panels, structural covers, EV battery lids. | Refresh 2026-09: NOT SOURCED — upr, gf: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-bmc', grade: 'BMC (Bulk Moulding Compound)', category: 'Composite', pricePerKg: 3.10, scrapRecoveryPricePerKg: 0.10, densityKgPerM3: 1950, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Glass/polyester BMC — electrical housings, headlamp reflectors, motor components; injection/compression moulded. | Refresh 2026-09: NOT SOURCED — upr, gf: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-csm-gf', grade: 'E-glass Chopped Strand Mat (450 g/m²)', category: 'Composite', pricePerKg: 3.20, scrapRecoveryPricePerKg: 0.05, densityKgPerM3: 1550, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Chopped strand mat — hand-layup/spray-up GFRP, marine hulls, tanks, enclosures. | Refresh 2026-09: NOT SOURCED — gf: Not sourced this period: composites inputs (epoxy China 12,500–12,900 CNY/t Sep 2026; glass fibre ’mild downward pressure’) have no June level on the same basis. Held at the June 2026 price.', confidence: 'Medium' },
    { id: 'mat-cf-peek-organo', grade: 'CF/PEEK Organosheet (Thermoplastic)', category: 'Composite', pricePerKg: 62.00, scrapRecoveryPricePerKg: 1.00, densityKgPerM3: 1550, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Continuous CF-reinforced PEEK laminate — stamp-formable aerospace brackets/clips, recyclable, weldable. | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-nomex-honeycomb', grade: 'Nomex Honeycomb Core', category: 'Composite', pricePerKg: 42.00, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 48, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Aramid-paper honeycomb — sandwich-panel core for aircraft floors/interiors; density is core bulk (~48 kg/m³). | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
    { id: 'mat-pet-foam-core', grade: 'PET Structural Foam Core', category: 'Composite', pricePerKg: 9.50, scrapRecoveryPricePerKg: 0.00, densityKgPerM3: 100, region: 'UK', effectiveDate: '2026-09', sourceNote: 'Index-anchored 2026-07. Recyclable PET foam core — wind blades, marine, transport sandwich panels; density is core bulk (~100 kg/m³). | Refresh 2026-09: SPECIALTY — no public market index for this grade; held at the June 2026 price — refresh by supplier quote', confidence: 'Low' },
  ],

  machines: [
    makeMachine(
      'mach-lathe-cnc',
      'CNC Lathe (2-axis)',
      {
        annualDepreciation: 40480,
        maintenance: 22211,
        energy: 23304,
        floorSpace: 8077,
        indirectSupport: 22158,
        financeCost: 16000,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'UK Tier-2 CNC turning centre (Doosan/Hyundai class). Target £40/hr. Jun 2026'
    ),
    makeMachine(
      'mach-vmc3',
      'CNC VMC 3-axis',
      {
        annualDepreciation: 55660,
        maintenance: 30288,
        energy: 32626,
        floorSpace: 12115,
        indirectSupport: 30215,
        financeCost: 21000,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'UK Tier-2 3-axis VMC (HAAS VF/VM class). Target £55/hr. Jun 2026'
    ),
    makeMachine(
      'mach-vmc5',
      'CNC VMC 5-axis',
      {
        annualDepreciation: 96140,
        maintenance: 45431,
        energy: 40783,
        floorSpace: 18173,
        indirectSupport: 48344,
        financeCost: 24200,
        annualAvailableHours: 4000,
        machineUtilization: 0.78,
      },
      'UK',
      'UK Tier-1 5-axis machining centre (DMG/Hermle class). Target £85/hr. Jun 2026'
    ),
    makeMachine(
      'mach-drill',
      'CNC Drilling Centre',
      {
        annualDepreciation: 28336,
        maintenance: 12115,
        energy: 20974,
        floorSpace: 8077,
        indirectSupport: 16115,
        financeCost: 14000,
        annualAvailableHours: 4000,
        machineUtilization: 0.80,
      },
      'UK',
      'UK Tier-2 CNC drilling/tapping centre. Target £30/hr. Jun 2026'
    ),
    makeMachine(
      'mach-grind',
      'CNC Cylindrical Grinder',
      {
        annualDepreciation: 55660,
        maintenance: 30288,
        energy: 32626,
        floorSpace: 10096,
        indirectSupport: 28201,
        financeCost: 20600,
        annualAvailableHours: 4000,
        machineUtilization: 0.78,
      },
      'UK',
      'UK Tier-2 CNC cylindrical grinder. Target £55/hr (precision, high coolant cost). Jun 2026'
    ),

    // ── Gear cutting and finishing ────────────────────────────────────────────
    // Tiered by workpiece envelope (module × diameter × face width), not force —
    // see GEAR_HOBBER_TIERS et al in machine-sizing.ts. The build-ups follow the
    // same shape as every other machine here, but the CLASS BOUNDARIES and these
    // rates are representative: no machine-builder catalogue was reachable from
    // the build environment. Replace with the plant's own machine list and £/hr
    // before quoting — `gearDataWarning()` says so on every gear estimate.
    makeMachine(
      'gear-hob-small',
      'CNC Gear Hobber — small (≤m4, ≤Ø200)',
      {
        annualDepreciation: 62744, maintenance: 32307, energy: 30296, floorSpace: 11106,
        indirectSupport: 30215, financeCost: 21000,
        annualAvailableHours: 4000, machineUtilization: 0.80,
      },
      'UK',
      'REPRESENTATIVE — UK small CNC hobber class. Target ~£56/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-hob-medium',
      'CNC Gear Hobber — medium (≤m8, ≤Ø500)',
      {
        annualDepreciation: 89056, maintenance: 42403, energy: 39617, floorSpace: 16154,
        indirectSupport: 40287, financeCost: 23500,
        annualAvailableHours: 4000, machineUtilization: 0.78,
      },
      'UK',
      'REPRESENTATIVE — UK medium CNC hobber class. Target ~£78/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-hob-large',
      'CNC Gear Hobber — large (≤m25, ≤Ø1600)',
      {
        annualDepreciation: 151800, maintenance: 62594, energy: 60591, floorSpace: 30288,
        indirectSupport: 58416, financeCost: 32000,
        annualAvailableHours: 3800, machineUtilization: 0.70,
      },
      'UK',
      'REPRESENTATIVE — UK large CNC hobber class. Target ~£140/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-shaper-small',
      'CNC Gear Shaper — small (≤m6, ≤Ø300)',
      {
        annualDepreciation: 58696, maintenance: 34326, energy: 27965, floorSpace: 11106,
        indirectSupport: 30215, financeCost: 20500,
        annualAvailableHours: 4000, machineUtilization: 0.78,
      },
      'UK',
      'REPRESENTATIVE — UK small CNC shaper class. Target ~£56/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-shaper-large',
      'CNC Gear Shaper — large (≤m12, ≤Ø800)',
      {
        annualDepreciation: 96140, maintenance: 48460, energy: 41948, floorSpace: 20192,
        indirectSupport: 42301, financeCost: 25000,
        annualAvailableHours: 3800, machineUtilization: 0.74,
      },
      'UK',
      'REPRESENTATIVE — UK large CNC shaper class. Target ~£95/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-skive-small',
      'Power Skiving Machine — small (≤m4, ≤Ø250)',
      {
        annualDepreciation: 111320, maintenance: 46441, energy: 37287, floorSpace: 14135,
        indirectSupport: 42301, financeCost: 27000,
        annualAvailableHours: 4000, machineUtilization: 0.80,
      },
      'UK',
      'REPRESENTATIVE — UK small power skiving class. Target ~£85/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-skive-medium',
      'Power Skiving Machine — medium (≤m8, ≤Ø600)',
      {
        annualDepreciation: 156860, maintenance: 60575, energy: 51270, floorSpace: 22211,
        indirectSupport: 54387, financeCost: 33000,
        annualAvailableHours: 4000, machineUtilization: 0.78,
      },
      'UK',
      'REPRESENTATIVE — UK medium power skiving class. Target ~£120/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-broach',
      'Vertical Internal Gear Broach',
      {
        annualDepreciation: 72864, maintenance: 38364, energy: 34957, floorSpace: 18173,
        indirectSupport: 34244, financeCost: 22000,
        annualAvailableHours: 4000, machineUtilization: 0.85,
      },
      'UK',
      'REPRESENTATIVE — UK internal gear/spline broach class. Target ~£63/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-grind-generating',
      'Generating Gear Grinder (threaded wheel, ≤m6)',
      {
        annualDepreciation: 166980, maintenance: 68652, energy: 64087, floorSpace: 22211,
        indirectSupport: 58416, financeCost: 35000,
        annualAvailableHours: 4000, machineUtilization: 0.78,
      },
      'UK',
      'REPRESENTATIVE — UK generating (threaded-wheel) gear grinder class. Target ~£130/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-grind-profile',
      'Profile Gear Grinder (form wheel, ≤m12)',
      {
        annualDepreciation: 192280, maintenance: 78748, energy: 72244, floorSpace: 28269,
        indirectSupport: 66473, financeCost: 40000,
        annualAvailableHours: 3800, machineUtilization: 0.72,
      },
      'UK',
      'REPRESENTATIVE — UK profile (form-wheel) gear grinder class. Target ~£170/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-shave',
      'Gear Shaving Machine',
      {
        annualDepreciation: 48576, maintenance: 26249, energy: 23304, floorSpace: 10096,
        indirectSupport: 26186, financeCost: 18000,
        annualAvailableHours: 4000, machineUtilization: 0.80,
      },
      'UK',
      'REPRESENTATIVE — UK gear shaving class. Target ~£45/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-hone',
      'Gear Honing Machine',
      {
        annualDepreciation: 97152, maintenance: 44422, energy: 34957, floorSpace: 14135,
        indirectSupport: 38272, financeCost: 25000,
        annualAvailableHours: 4000, machineUtilization: 0.78,
      },
      'UK',
      'REPRESENTATIVE — UK gear honing class (NVH finishing). Target ~£80/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-deburr',
      'Gear Chamfer / Deburr Cell',
      {
        annualDepreciation: 26312, maintenance: 14134, energy: 13983, floorSpace: 8077,
        indirectSupport: 18129, financeCost: 9000,
        annualAvailableHours: 4000, machineUtilization: 0.82,
      },
      'UK',
      'REPRESENTATIVE — UK chamfer/deburr cell class. Target ~£26/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-induction',
      'Gear Induction Hardening Cell (RF + quench + temper)',
      {
        annualDepreciation: 62744, maintenance: 26249, energy: 48939, floorSpace: 9086,
        indirectSupport: 20143, financeCost: 15000,
        annualAvailableHours: 4000, machineUtilization: 0.80,
      },
      'UK',
      'REPRESENTATIVE — UK gear induction hardening cell. Energy-heavy (RF generator + quench '
      + 'recirculation). Target ~£55/hr. Replace with plant data.'
    ),
    makeMachine(
      'gear-checker',
      'CNC Gear Checker (profile / lead / pitch)',
      {
        annualDepreciation: 58696, maintenance: 22211, energy: 11652, floorSpace: 12115,
        indirectSupport: 30215, financeCost: 15000,
        annualAvailableHours: 4000, machineUtilization: 0.65,
      },
      'UK',
      'REPRESENTATIVE — UK CNC gear metrology class (Klingelnberg/Gleason type). Target ~£56/hr. Replace with plant data.'
    ),

    makeMachine(
      'bench-assembly',
      'Assembly Workbench',
      { annualDepreciation: 506, maintenance: 202, energy: 350, floorSpace: 808, indirectSupport: 504, financeCost: 50, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'UK', 'Assembly bench — low machine rate; cost primarily driven by labour'
    ),
    // ── Named Machining Centres (Cast+Machine dataset) ─────────────────────
    // HAAS VF-2 3-axis Mill: total=90000, util=0.50 → rate=90000/(4000×0.50)=£45/hr
    makeMachine('mach-haas-vf2', 'HAAS VF-2 (3-axis Mill)',
      { annualDepreciation: 38456, maintenance: 18173, energy: 12235, floorSpace: 5048, indirectSupport: 9568, financeCost: 9000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'HAAS VF-2 benchmark, UK Tier-2 machining shop'),
    // DMG Mori DMU 50 5-axis Mill: total=190000, util=0.50 → rate=£95/hr
    makeMachine('mach-dmg-dmu50', 'DMG Mori DMU 50 (5-axis Mill)',
      { annualDepreciation: 86020, maintenance: 35335, energy: 23304, floorSpace: 8077, indirectSupport: 22158, financeCost: 20000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'DMG Mori DMU 50 benchmark, UK Tier-1 precision shop'),
    // HAAS UMC-500 5-axis Mill: total=150000, util=0.50 → rate=£75/hr
    makeMachine('mach-haas-umc500', 'HAAS UMC-500 (5-axis Mill)',
      { annualDepreciation: 65780, maintenance: 28268, energy: 18644, floorSpace: 7067, indirectSupport: 18129, financeCost: 16000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'HAAS UMC-500 benchmark, UK Tier-2 machining shop'),
    // Mazak Quick Turn 200 Turning: total=100000, util=0.50 → rate=£50/hr
    makeMachine('mach-mazak-qt200', 'Mazak Quick Turn 200 (Turning)',
      { annualDepreciation: 42504, maintenance: 20192, energy: 12817, floorSpace: 5048, indirectSupport: 12086, financeCost: 10000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'Mazak Quick Turn 200 benchmark, UK Tier-2 machining shop'),
    // Gravity Die Casting Machine: total=76000, util=0.50 → rate=76000/(4000×0.50)=£38/hr ≈ £35/hr target
    makeMachine('grav-die-cast-std', 'Gravity Die Casting Machine',
      { annualDepreciation: 28336, maintenance: 14134, energy: 11652, floorSpace: 8077, indirectSupport: 9065, financeCost: 7000, annualAvailableHours: 4000, machineUtilization: 0.50 },
      'UK', 'Standard gravity die casting machine, UK foundry benchmark'),
    // Investment Casting Furnace: total=100000, util=0.60 → rate=100000/(4000×0.60)≈£41.67/hr ≈ £42/hr
    makeMachine('invest-cast-furnace', 'Investment Casting Furnace',
      { annualDepreciation: 40480, maintenance: 16153, energy: 20974, floorSpace: 8077, indirectSupport: 9669, financeCost: 8400, annualAvailableHours: 4000, machineUtilization: 0.60 },
      'UK', 'Investment casting furnace, UK foundry benchmark'),
    makeMachine('heat-treat-furnace', 'Heat Treatment / Ageing Furnace',
      { annualDepreciation: 22264, maintenance: 8077, energy: 40783, floorSpace: 6058, indirectSupport: 5036, financeCost: 2750, annualAvailableHours: 6000, machineUtilization: 0.75 },
      'UK', 'T5/T6 solution + ageing furnace, UK foundry benchmark'),
    // ── Sheet Metal Presses ────────────────────────────────────────────────
    // Generic press-shop presses: STANDARD/AMORTISED mechanical presses (general
    // subcontract press shop). Rates are intentionally lower than the named
    // premium automotive stamping lines (press-schuler-400t ~£150/hr,
    // press-aida-200t ~£120/hr) which model NEW servo/transfer capex — pick the
    // named machines when quoting a dedicated automotive stamping programme.
    makeMachine('press-100t', '100T Mechanical Press (general press shop)',
      { annualDepreciation: 18216, maintenance: 9086, energy: 5826, floorSpace: 5048, indirectSupport: 4029, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-200t', '200T Mechanical Press (general press shop)',
      { annualDepreciation: 28336, maintenance: 14134, energy: 8739, floorSpace: 7572, indirectSupport: 6043, financeCost: 3500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-400t', '400T Mechanical Press (general press shop)',
      { annualDepreciation: 50600, maintenance: 22211, energy: 12817, floorSpace: 10096, indirectSupport: 9065, financeCost: 6250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press; new servo transfer line: use press-schuler-400t), Jun 2026'),
    makeMachine('press-630t', '630T Mechanical Press (general press shop)',
      { annualDepreciation: 75900, maintenance: 35335, energy: 17478, floorSpace: 15144, indirectSupport: 14100, financeCost: 9375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-800t', '800T Mechanical Press (general press shop)',
      { annualDepreciation: 91080, maintenance: 42403, energy: 20974, floorSpace: 18173, indirectSupport: 16115, financeCost: 11250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (standard/amortised mechanical press), Jun 2026'),
    makeMachine('press-1000t', '1000T Mechanical Press (general press shop)',
      { annualDepreciation: 116380, maintenance: 52498, energy: 25635, floorSpace: 22211, indirectSupport: 20143, financeCost: 14375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (large stamping press — deep-draw panels, structural), Jun 2026'),
    makeMachine('press-1250t', '1250T Mechanical Press (general press shop)',
      { annualDepreciation: 146740, maintenance: 65623, energy: 31461, floorSpace: 26250, indirectSupport: 24172, financeCost: 18125, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK general press-shop benchmark (heavy stamping press — large body/chassis panels), Jun 2026'),
    makeMachine('press-fineblank-250t', '250T Fine-Blanking Press (triple-action)',
      { annualDepreciation: 60720, maintenance: 28268, energy: 13983, floorSpace: 12115, indirectSupport: 11079, financeCost: 7500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK fine-blanking benchmark. Triple-action FB press — full-shear precision edges (gears, levers, seat recliners). Jun 2026'),
    makeMachine('press-hotstamp-1000t', '1000T Hot-Stamping Press (water-cooled dies)',
      { annualDepreciation: 182160, maintenance: 80767, energy: 34957, floorSpace: 25240, indirectSupport: 24172, financeCost: 22500, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK hot-stamping line press. Forms + quenches austenitised boron blanks in water-cooled dies (B-pillar, rocker). Quench-dwell limited. Jun 2026'),
    makeMachine('furnace-roller-hearth', 'Roller-Hearth Austenitising Furnace (hot stamping)',
      { annualDepreciation: 91080, maintenance: 40383, energy: 58261, floorSpace: 40384, indirectSupport: 20143, financeCost: 11250, annualAvailableHours: 6000, machineUtilization: 0.80 },
      'UK', 'UK hot-stamping furnace. ~900–950°C austenitising roller hearth. Capital/standby only — per-part austenitising heat is a separate energy consumable. Jun 2026'),
    // ── E-Motor Lamination processing ──────────────────────────────────────
    makeMachine('notching-machine', 'CNC Notching Machine (laminations)',
      { annualDepreciation: 40480, maintenance: 18173, energy: 11652, floorSpace: 10096, indirectSupport: 9065, financeCost: 5000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK electrical-steel benchmark. Single-slot rotary notching for prototype / low-volume stator & rotor laminations (no hard progressive die). Jun 2026'),
    makeMachine('lamination-anneal-furnace', 'Stress-Relief Annealing Furnace (laminations)',
      { annualDepreciation: 70840, maintenance: 30288, energy: 46609, floorSpace: 20192, indirectSupport: 15108, financeCost: 8750, annualAvailableHours: 6000, machineUtilization: 0.80 },
      'UK', 'UK electrical-steel benchmark. ~750–850°C continuous N₂/H₂ stress-relief/decarb anneal to restore core loss after blanking. Per-part heat is a separate energy consumable. Jun 2026'),
    makeMachine('backlack-bonding-oven', 'Backlack Bonding Oven/Press (self-bonded stacks)',
      { annualDepreciation: 45540, maintenance: 20192, energy: 29130, floorSpace: 12115, indirectSupport: 10072, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK electrical-steel benchmark. Heat+pressure cure of self-bonding (backlack) varnish — lowest-loss laminated stacks, EV traction. Jun 2026'),
    makeMachine('laser-stack-welder', 'Laser Stack Welder (stator OD welds)',
      { annualDepreciation: 91080, maintenance: 35335, energy: 17478, floorSpace: 10096, indirectSupport: 14100, financeCost: 11250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK electrical-steel benchmark. Laser welding of stacked stator laminations along the OD — fast, but weld shorts a few edge laminations (small loss penalty). Jun 2026'),
    // ── Injection Moulding Machines ────────────────────────────────────────
    // IMM energy: reflects actual running power (hydraulic pump + heaters + cooling).
    // Energy £ lines are on the UK £0.23/kWh basis (matches REGIONAL_DATA.UK) so
    // buildRegionalLibrary can re-tariff them at each region's actual electricity price.
    // Approx avg power: 50T ~12 kW · 100T ~22 kW · 200T ~38 kW · 350T ~57 kW ·
    // 400T ~65 kW · 500T ~78 kW · 800T ~114 kW · 1200T ~163 kW.
    makeMachine('imm-50t', '50T Injection Moulding Machine',
      { annualDepreciation: 9108, maintenance: 4543, energy: 12817, floorSpace: 2524, indirectSupport: 2014, financeCost: 1125, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark (small precision/technical mouldings), Jun 2026'),
    makeMachine('imm-100t', '100T Injection Moulding Machine',
      { annualDepreciation: 14168, maintenance: 7067, energy: 23304, floorSpace: 3534, indirectSupport: 3022, financeCost: 1750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-200t', '200T Injection Moulding Machine',
      { annualDepreciation: 22264, maintenance: 11105, energy: 40783, floorSpace: 5048, indirectSupport: 4532, financeCost: 2750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-350t', '350T Injection Moulding Machine',
      { annualDepreciation: 34408, maintenance: 15649, energy: 60591, floorSpace: 7067, indirectSupport: 6849, financeCost: 4250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-400t', '400T Injection Moulding Machine',
      { annualDepreciation: 40480, maintenance: 18173, energy: 69913, floorSpace: 8077, indirectSupport: 8057, financeCost: 5000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-500t', '500T Injection Moulding Machine',
      { annualDepreciation: 50600, maintenance: 22211, energy: 83896, floorSpace: 9591, indirectSupport: 10072, financeCost: 6250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-800t', '800T Injection Moulding Machine',
      { annualDepreciation: 70840, maintenance: 32307, energy: 122348, floorSpace: 14135, indirectSupport: 14100, financeCost: 8750, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark, Jun 2026'),
    makeMachine('imm-1200t', '1200T Injection Moulding Machine',
      { annualDepreciation: 101200, maintenance: 46441, energy: 174783, floorSpace: 20192, indirectSupport: 20143, financeCost: 12500, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark (large structural mouldings), Jun 2026'),
    makeMachine('imm-2000t', '2000T Injection Moulding Machine',
      { annualDepreciation: 159896, maintenance: 72690, energy: 270331, floorSpace: 30288, indirectSupport: 31222, financeCost: 19750, annualAvailableHours: 4000, machineUtilization: 0.76 },
      'UK', 'UK plastics benchmark (large automotive mouldings — door panels, cladding), Jun 2026'),
    makeMachine('imm-3500t', '3500T Injection Moulding Machine',
      { annualDepreciation: 268180, maintenance: 121150, energy: 454436, floorSpace: 48461, indirectSupport: 50358, financeCost: 33125, annualAvailableHours: 4000, machineUtilization: 0.74 },
      'UK', 'UK plastics benchmark (very large automotive — bumpers, IPs, tailgates; high clamp tonnage), Jun 2026'),
    // ── HPDC Machines ─────────────────────────────────────────────────────
    makeMachine('hpdc-500t', 'HPDC 500T',
      { annualDepreciation: 50600, maintenance: 25240, energy: 46609, floorSpace: 12115, indirectSupport: 10072, financeCost: 6250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    makeMachine('hpdc-800t', 'HPDC 800T',
      { annualDepreciation: 80960, maintenance: 38364, energy: 64087, floorSpace: 18173, indirectSupport: 15108, financeCost: 10000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    makeMachine('hpdc-1600t', 'HPDC 1600T',
      { annualDepreciation: 141680, maintenance: 65623, energy: 116522, floorSpace: 28269, indirectSupport: 25179, financeCost: 17500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    // ── Giga / mega casting presses (single-piece EV underbody) ──
    makeMachine('hpdc-giga-6100t', 'Giga-Casting Press 6100T (megacasting)',
      { annualDepreciation: 526240, maintenance: 242300, energy: 372870, floorSpace: 121153, indirectSupport: 90645, financeCost: 65000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'Giga-press benchmark. 6,100T locking force — single-piece rear/front underbody megacastings (Tesla-class, BYD). Very high capital; huge cell (vacuum, thermal control, laser trim). Jun 2026'),
    makeMachine('hpdc-giga-9000t', 'Giga-Casting Press 9000T (Xiaomi/Tesla-class)',
      { annualDepreciation: 789360, maintenance: 363451, energy: 559306, floorSpace: 181730, indirectSupport: 141004, financeCost: 97500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'Giga-press benchmark. 9,000T+ locking force (Xiaomi 9,100T "die-casting cluster", Tesla, largest OEM presses) — full one-piece underbody. Highest capital in the tool. Jun 2026'),
    makeMachine('sand-cast-line', 'Sand Casting Moulding Line',
      { annualDepreciation: 25300, maintenance: 12115, energy: 29130, floorSpace: 10096, indirectSupport: 8057, financeCost: 3125, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK foundry benchmark, Jun 2026'),
    makeMachine('hpdc-160t', 'HPDC 160T (Zinc/Small Al)',
      { annualDepreciation: 18216, maintenance: 9086, energy: 16313, floorSpace: 5048, indirectSupport: 4029, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'Small HPDC / zinc die casting machine, UK foundry benchmark'),
    // ── Forging Machines ──────────────────────────────────────────────────
    // Forge press/hammer energy = press motor / compressor only (UK £0.23/kWh basis,
    // re-tariffed regionally). Billet furnace/induction heating is a SEPARATE per-part
    // cost via the heatingEnergyKwhPerKg input — do not fold it into these rates.
    // Presses/screw/upsetter are force-rated (tonnage in the id → load validation);
    // hammers are energy/ram-mass rated and are NOT tonnage-validated.
    makeMachine('forge-press-500t', '500T Mechanical Forge Press',
      { annualDepreciation: 45540, maintenance: 22211, energy: 64087, floorSpace: 12115, indirectSupport: 10072, financeCost: 5625, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark, Jun 2026'),
    makeMachine('forge-press-1600t', '1600T Mechanical Forge Press',
      { annualDepreciation: 91080, maintenance: 42403, energy: 99044, floorSpace: 20192, indirectSupport: 18129, financeCost: 11250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (mid-size crank press), Jun 2026'),
    makeMachine('forge-press-2500t', '2500T Mechanical Forge Press',
      { annualDepreciation: 131560, maintenance: 60575, energy: 139826, floorSpace: 28269, indirectSupport: 26186, financeCost: 16250, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (automotive crank/con-rod press), Jun 2026'),
    makeMachine('forge-press-4000t', '4000T Hydraulic Forge Press',
      { annualDepreciation: 202400, maintenance: 90863, energy: 203914, floorSpace: 40384, indirectSupport: 40287, financeCost: 25000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (large hydraulic press), Jun 2026'),
    makeMachine('forge-press-8000t', '8000T Hydraulic Forge Press',
      { annualDepreciation: 384560, maintenance: 171629, energy: 372870, floorSpace: 70673, indirectSupport: 75538, financeCost: 47500, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK forge shop benchmark (heavy structural/aero press), Jun 2026'),
    makeMachine('forge-screw-1000t', '1000T Screw Press',
      { annualDepreciation: 70840, maintenance: 32307, energy: 69913, floorSpace: 16154, indirectSupport: 14100, financeCost: 8750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (screw press — precision/near-net), Jun 2026'),
    makeMachine('forge-upsetter-1000t', '1000T Horizontal Upsetter',
      { annualDepreciation: 60720, maintenance: 28268, energy: 46609, floorSpace: 14135, indirectSupport: 12086, financeCost: 7500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (upset forging — gears, valves, flanges), Jun 2026'),
    makeMachine('forge-hammer-2t', '2T Pneumatic Forge Hammer',
      { annualDepreciation: 20240, maintenance: 10096, energy: 32626, floorSpace: 10096, indirectSupport: 6043, financeCost: 2500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (small drop hammer), Jun 2026'),
    makeMachine('forge-hammer-5t', '5T Pneumatic Forge Hammer',
      { annualDepreciation: 35420, maintenance: 18173, energy: 52435, floorSpace: 15144, indirectSupport: 9065, financeCost: 4375, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark, Jun 2026'),
    makeMachine('forge-hammer-10t', '10T Counterblow Forge Hammer',
      { annualDepreciation: 60720, maintenance: 30288, energy: 81565, floorSpace: 22211, indirectSupport: 15108, financeCost: 7500, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (heavy counterblow hammer), Jun 2026'),
    makeMachine('forge-ring-mill', 'CNC Seamless Ring Rolling Mill',
      { annualDepreciation: 121440, maintenance: 55527, energy: 104870, floorSpace: 30288, indirectSupport: 25179, financeCost: 15000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK forge shop benchmark (radial-axial ring mill), Jun 2026'),
    // ── Painting ──────────────────────────────────────────────────────────
    makeMachine('paint-line-std', 'Standard Paint Line (E-coat + Topcoat)',
      { annualDepreciation: 121440, maintenance: 50479, energy: 93218, floorSpace: 40384, indirectSupport: 30215, financeCost: 15000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK OEM paint line benchmark, Jun 2026. The £80k energy line is the whole line — '
      + 'gas-fired cure and dry-off ovens plus heated tanks, roughly 580 kW over 3,280 productive '
      + 'hours. Surface-treatment stage energy is therefore ALREADY here and must not be added '
      + 'again on top (see surface-treatment-rate.ts).'),
    // ── Plating and anodising ─────────────────────────────────────────────
    // Added because a zinc-plate route was being costed on the paint line above,
    // whose build-up is gas ovens, spray booths and an RTO. A plating line has
    // none of those: it is rectifiers, tanks and an effluent plant, at roughly
    // half the hourly rate. Costing one on the other over-stated plated parts.
    makeMachine('plating-line-barrel', 'Barrel Plating Line (zinc, high volume)',
      { annualDepreciation: 45540, maintenance: 22211, energy: 40783, floorSpace: 18173, indirectSupport: 20143, financeCost: 8000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'REPRESENTATIVE — UK barrel zinc line class: tanks, rectifiers, barrels, effluent '
      + 'plant and discharge consent. Rectifier-dominated electrical load, no ovens. Target '
      + '~£46/hr. Replace with plant data.'),
    makeMachine('plating-line-rack', 'Rack Plating / Anodising Line',
      { annualDepreciation: 70840, maintenance: 30288, energy: 52435, floorSpace: 25240, indirectSupport: 28201, financeCost: 12000, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'REPRESENTATIVE — UK rack plating and sulphuric anodising class. Higher capital and '
      + 'lower throughput than barrel: parts are jigged individually. Target ~£67/hr. Replace '
      + 'with plant data.'),
    // ── Mechanical prep and mass-basis finishing ──────────────────────────
    // Sheet metal, casting and forging routes start on equipment a paint line
    // does not have. Costing shot blasting on a paint line's build-up — gas
    // ovens, spray booths, an RTO — over-states it about 3x; these are the
    // machines those stages actually run on. Throughput is set by the barrel or
    // bowl in KILOGRAMS, which is why the stages that use them are mass-basis.
    makeMachine('blast-machine', 'Shot Blast Machine (tumble / hanger)',
      { annualDepreciation: 26312, maintenance: 18173, energy: 16313, floorSpace: 9086, indirectSupport: 11079, financeCost: 4500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'REPRESENTATIVE — UK descaling/cleaning cell class: blast wheels, shot recovery and '
      + 'separation, dust extraction. Maintenance is high relative to capital because blades, '
      + 'liners and the separator are consumable wear parts. Replace with plant data.'),
    makeMachine('mass-finish-bowl', 'Vibratory / Mass Finishing Bowl',
      { annualDepreciation: 14168, maintenance: 9086, energy: 8157, floorSpace: 7067, indirectSupport: 8057, financeCost: 2400, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'REPRESENTATIVE — UK deburr/polish cell class: bowl, media separation, compound '
      + 'dosing, water treatment. Low capital, long cycles; media and compound are the real '
      + 'variable cost and are charged as stage chemistry. Replace with plant data.'),
    makeMachine('galvanising-kettle', 'Hot Dip Galvanising Kettle (batch, EN ISO 1461)',
      { annualDepreciation: 202400, maintenance: 106006, energy: 279653, floorSpace: 60577, indirectSupport: 55394, financeCost: 34000, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'REPRESENTATIVE — UK batch galvanising plant class: kettle, furnace, flux and pickle '
      + 'tanks, fume extraction, effluent. Energy dominates because the kettle is held molten '
      + 'continuously whether or not work is passing. The ZINC is NOT in this rate — it is a '
      + 'separate pass-through that scales with surface area, not with kettle time.'),
    makeMachine('impregnation-plant', 'Vacuum Resin Impregnation Plant (casting porosity)',
      { annualDepreciation: 30360, maintenance: 15144, energy: 12817, floorSpace: 8077, indirectSupport: 10072, financeCost: 5200, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'REPRESENTATIVE — UK casting impregnation cell class: vacuum vessel, resin recovery, '
      + 'wash and cure stations. Casting-specific; its value is the pressure-test reject it '
      + 'prevents rather than anything it adds to the part. Replace with plant data.'),
    // ── BIW / Assembly ────────────────────────────────────────────────────
    makeMachine('robot-weld-station', 'Robot Welding Station',
      { annualDepreciation: 35420, maintenance: 14134, energy: 6991, floorSpace: 8077, indirectSupport: 7050, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK body shop benchmark, Jun 2026'),
    // ── Electronics ───────────────────────────────────────────────────────
    makeMachine('smt-line', 'SMT Pick & Place + Reflow Line',
      { annualDepreciation: 80960, maintenance: 30288, energy: 17478, floorSpace: 20192, indirectSupport: 20143, financeCost: 10000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK EMS benchmark, Jun 2026'),
    makeMachine('smt-high-speed-line', 'High-Speed SMT Line (Fuji/Juki/ASM)',
      { annualDepreciation: 182160, maintenance: 80767, energy: 64087, floorSpace: 30288, indirectSupport: 100717, financeCost: 47000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'High-speed SMT line 80000+ CPH. Automotive EMS benchmark. Target £150/hr. Jun 2026'),
    makeMachine('laser-drill-75um', 'Laser Drill — 75 µm Microvia (CO₂/UV)',
      { annualDepreciation: 151800, maintenance: 60575, energy: 46609, floorSpace: 25240, indirectSupport: 80574, financeCost: 38600, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'CO₂/UV laser drill for HDI microvias (≥75 µm). UK PCB fab benchmark. Target £120/hr. Jun 2026'),
    makeMachine('xray-bga-inspection', 'X-Ray BGA Inspection Cell (2D/3D AXI)',
      { annualDepreciation: 121440, maintenance: 45431, energy: 29130, floorSpace: 20192, indirectSupport: 65466, financeCost: 20200, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', '2D/3D automated X-ray inspection for BGA solder joints. EMS automotive benchmark. Target £90/hr. Jun 2026'),
    makeMachine('ict-automotive', 'ICT Bed-of-Nails Test System (Automotive)',
      { annualDepreciation: 131560, maintenance: 55527, energy: 34957, floorSpace: 25240, indirectSupport: 85609, financeCost: 36600, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'In-circuit test fixture for IATF 16949 automotive boards. Target £110/hr. Jun 2026'),
    // ── Blow Moulding ─────────────────────────────────────────────────────────
    makeMachine('blow-ebm-100l', 'EBM Blow Moulder (up to 5L)',
      { annualDepreciation: 25300, maintenance: 12115, energy: 20974, floorSpace: 6058, indirectSupport: 5036, financeCost: 3125, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. EBM for bottles/containers up to 5L. Jun 2026'),
    makeMachine('blow-ebm-500l', 'EBM Blow Moulder (5–100L tanks/drums)',
      { annualDepreciation: 45540, maintenance: 20192, energy: 34957, floorSpace: 12115, indirectSupport: 9065, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. EBM for large industrial containers, automotive fuel tanks. Jun 2026'),
    makeMachine('blow-ebm-2head', 'EBM 2-Head (Bottles 1–5L)',
      { annualDepreciation: 30360, maintenance: 14134, energy: 25635, floorSpace: 7067, indirectSupport: 6043, financeCost: 3750, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark Jun 2026. Continuous 2-head EBM for HDPE/LDPE/PP bottles and containers 1–5L. High output, straightforward tooling, typical dairy/detergent packaging.'),
    makeMachine('blow-ebm-coex3', '3-Layer Co-Ex EBM',
      { annualDepreciation: 60720, maintenance: 25240, energy: 40783, floorSpace: 12115, indirectSupport: 12086, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark Jun 2026. 3-layer co-extrusion EBM — HDPE/regrind/HDPE or HDPE/barrier/HDPE for fuel tanks and barrier packaging. Higher capital and manning than mono-layer.'),
    makeMachine('blow-ebm-coex5', '5-Layer Co-Ex EBM (High-Barrier)',
      { annualDepreciation: 101200, maintenance: 40383, energy: 58261, floorSpace: 18173, indirectSupport: 20143, financeCost: 12500, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK plastics benchmark Jun 2026. 5-layer co-ex EBM — HDPE/tie/EVOH/tie/HDPE for automotive fuel systems, food packaging requiring high oxygen/fuel barrier. Complex, high capital.'),
    makeMachine('blow-ebm-large', 'Large EBM Accumulator Head (20–200L)',
      { annualDepreciation: 70840, maintenance: 32307, energy: 52435, floorSpace: 20192, indirectSupport: 14100, financeCost: 8750, annualAvailableHours: 4000, machineUtilization: 0.77 },
      'UK', 'UK plastics benchmark Jun 2026. Large accumulator-head EBM for drums (20–200L), IBCs, automotive fuel tanks. Long cycle, single cavity, high tonnage clamp.'),
    makeMachine('blow-ibm-rotary', 'IBM Rotary Machine (Pharma/Cosmetics)',
      { annualDepreciation: 80960, maintenance: 28268, energy: 29130, floorSpace: 15144, indirectSupport: 16115, financeCost: 10000, annualAvailableHours: 5000, machineUtilization: 0.88 },
      'UK', 'UK plastics benchmark Jun 2026. Injection blow moulding rotary — 3/4-station indexing. No flash, dimensional accuracy ±0.05mm. Pharma vials, cosmetics jars, eye-drop bottles. PP/PE/PET.'),
    makeMachine('blow-ibm-linear', 'IBM Linear Machine (Medium Volume)',
      { annualDepreciation: 55660, maintenance: 20192, energy: 23304, floorSpace: 12115, indirectSupport: 11079, financeCost: 6875, annualAvailableHours: 4500, machineUtilization: 0.85 },
      'UK', 'UK plastics benchmark Jun 2026. Injection blow moulding linear indexing. Wide-mouth jars, pharmaceutical bottles, narrow-neck containers. No flash. PP/PE.'),
    makeMachine('blow-sbm-1stage', 'SBM Single-Stage (Preform + Blow)',
      { annualDepreciation: 65780, maintenance: 24230, energy: 40783, floorSpace: 14135, indirectSupport: 13093, financeCost: 8125, annualAvailableHours: 4500, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark Jun 2026. Single-stage stretch blow moulding — preform injection and stretch-blow in one machine. PET/PP wide-mouth jars, cosmetics, condiment bottles. Excellent clarity.'),
    makeMachine('blow-sbm-2stage', 'SBM Two-Stage Reheat (High-Speed PET)',
      { annualDepreciation: 91080, maintenance: 35335, energy: 46609, floorSpace: 16154, indirectSupport: 18129, financeCost: 11250, annualAvailableHours: 6000, machineUtilization: 0.90 },
      'UK', 'UK plastics benchmark Jun 2026. Two-stage reheat SBM — preforms made separately, reheated and blown at 20,000–80,000 bph. Dominant for PET water/CSD/juice bottles. Very low per-part cost at volume.'),
    makeMachine('blow-deflash-trimmer', 'Deflash Trim Robot / Station',
      { annualDepreciation: 15180, maintenance: 6058, energy: 9322, floorSpace: 6058, indirectSupport: 3022, financeCost: 1875, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'UK', 'UK plastics benchmark Jun 2026. Automated deflash trim station / robot for EBM parts. Removes pinch-off flash from bottles, tanks, automotive parts. 6–15s per part cycle.'),
    // ── Extrusion Lines ────────────────────────────────────────────────────────
    makeMachine('extruder-75mm', 'Single Screw Extruder 75mm',
      { annualDepreciation: 20240, maintenance: 8077, energy: 40783, floorSpace: 5048, indirectSupport: 4029, financeCost: 2500, annualAvailableHours: 5000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark. 75mm SSE for profile/pipe/sheet. ~200–400 kg/hr. Jun 2026'),
    makeMachine('extruder-150mm', 'Twin Screw Compounding/Extrusion Line 150mm',
      { annualDepreciation: 80960, maintenance: 30288, energy: 81565, floorSpace: 15144, indirectSupport: 15108, financeCost: 10000, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. 150mm TSE compounding/extrusion line. ~800–1500 kg/hr. Jun 2026'),
    makeMachine('extruder-pipe-line', 'Pipe Extrusion Line 90mm (SSE + vacuum tank + haul-off + saw)',
      { annualDepreciation: 45540, maintenance: 15144, energy: 64087, floorSpace: 12115, indirectSupport: 9065, financeCost: 6000, annualAvailableHours: 6000, machineUtilization: 0.85 },
      'UK', 'UK plastics benchmark 2026-07. 90mm SSE pipe line — die, vacuum-sizing tank, spray cooling, caterpillar haul-off, planetary saw. PE/PVC pressure & drainage pipe.'),
    makeMachine('extruder-profile-line', 'Profile Extrusion Line 75mm (SSE + calibration table + haul-off)',
      { annualDepreciation: 30360, maintenance: 12115, energy: 46609, floorSpace: 8077, indirectSupport: 7050, financeCost: 4000, annualAvailableHours: 5500, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark 2026-07. 75mm SSE profile line — dry/vacuum calibration table, cooling, haul-off, cut-off. Window/trim/seal profiles.'),
    makeMachine('extruder-sheet-line', 'Sheet Extrusion Line (die + 3-roll stack + winder)',
      { annualDepreciation: 91080, maintenance: 32307, energy: 99044, floorSpace: 20192, indirectSupport: 16115, financeCost: 11000, annualAvailableHours: 6000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark 2026-07. Sheet line — coat-hanger die, polished 3-roll calender stack, edge-trim, thickness gauging, winder/guillotine. PS/PP/PET/ABS sheet.'),
    makeMachine('extruder-cable-line', 'Cable/Wire Line (crosshead + CV/cooling + capstan)',
      { annualDepreciation: 40480, maintenance: 14134, energy: 52435, floorSpace: 10096, indirectSupport: 8057, financeCost: 5000, annualAvailableHours: 6500, machineUtilization: 0.85 },
      'UK', 'UK cable benchmark 2026-07. Crosshead wire/cable coating line — pay-off, crosshead die, cooling trough or CV, spark test, capstan, take-up. PVC/XLPE insulation & sheathing.'),
    makeMachine('extruder-coex-3', '3-Layer Co-Extrusion Line (3 extruders + feed block/manifold die)',
      { annualDepreciation: 121440, maintenance: 40383, energy: 110696, floorSpace: 22211, indirectSupport: 20143, financeCost: 14000, annualAvailableHours: 6000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark 2026-07. 3-extruder co-extrusion line — feed-block/multi-manifold die for skin/tie/barrier layers. Barrier pipe, weatherseals, packaging sheet.'),
    makeMachine('extruder-micro-tube', 'Medical Micro-Tubing Line (precision + laser gauge + cleanroom-ready)',
      { annualDepreciation: 60720, maintenance: 18173, energy: 34957, floorSpace: 8077, indirectSupport: 12086, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.75 },
      'UK', 'UK medical-extrusion benchmark 2026-07. Precision micro-tubing/multi-lumen line — vacuum sizing, laser OD/ID gauging, precision haul-off, cut-to-length. Catheter/medical tube.'),
    makeMachine('extrusion-finish-qa', 'Cut-off, Coil & Inspection Station',
      { annualDepreciation: 4048, maintenance: 2019, energy: 3496, floorSpace: 2019, indirectSupport: 2014, financeCost: 500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK benchmark 2026-07. Downstream cut/coil + dimensional inspection station for extruded product (mostly labour).'),
    makeMachine('extrusion-leak-test', 'Pipe/Tube Pressure & Leak Test Rig',
      { annualDepreciation: 6072, maintenance: 2524, energy: 2330, floorSpace: 2019, indirectSupport: 2518, financeCost: 800, annualAvailableHours: 4000, machineUtilization: 0.70 },
      'UK', 'UK benchmark 2026-07. Hydrostatic/air pressure & leak test rig for pipe, hose and tubing.'),
    // ── Thermoforming ──────────────────────────────────────────────────────────
    makeMachine('thermoform-small', 'Thermoformer (Small/Single Station)',
      { annualDepreciation: 15180, maintenance: 6058, energy: 13983, floorSpace: 4038, indirectSupport: 3022, financeCost: 1875, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark. Single-station vacuum former, up to 800×600mm sheet. Jun 2026'),
    makeMachine('thermoform-large', 'Thermoformer (Inline/Rotary, Large)',
      { annualDepreciation: 45540, maintenance: 18173, energy: 32626, floorSpace: 10096, indirectSupport: 9065, financeCost: 5625, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK plastics benchmark. Inline rotary thermoformer, 1200×1000mm+ sheet. Jun 2026'),
    makeMachine('thermoform-pressure', 'Pressure Former (3–6 bar, cut-sheet)',
      { annualDepreciation: 32384, maintenance: 13125, energy: 25635, floorSpace: 7067, indirectSupport: 7050, financeCost: 4000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark 2026-07. Cut-sheet pressure former — compressed-air box (3–6 bar) for crisp detail/texture (appliance fascias, medical). Higher energy + steel/CNC-Al tool.'),
    makeMachine('thermoform-twinsheet', 'Twin-Sheet Thermoformer',
      { annualDepreciation: 60720, maintenance: 24230, energy: 46609, floorSpace: 14135, indirectSupport: 12086, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark 2026-07. Twin-sheet former — two heated webs blow-bonded into a hollow part (fuel tanks, pallets, ducts, seat backs). Two ovens, two-half tooling.'),
    makeMachine('thermoform-rollfed', 'Roll-Fed Inline Thermoformer (packaging)',
      { annualDepreciation: 91080, maintenance: 32307, energy: 64087, floorSpace: 16154, indirectSupport: 16115, financeCost: 11250, annualAvailableHours: 5000, machineUtilization: 0.85 },
      'UK', 'UK packaging benchmark 2026-07. High-speed roll-fed former-filler line — cups/trays/blister from reel; form-cut-stack at 20–40 cycles/min. Highest throughput, lowest £/part at volume.'),
    makeMachine('thermoform-oven', 'Standalone Sheet Pre-Heat Oven',
      { annualDepreciation: 9108, maintenance: 4038, energy: 18644, floorSpace: 3029, indirectSupport: 2014, financeCost: 1125, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark 2026-07. Standalone radiant/convection sheet oven — pre-heat for heavy-gauge/twin-station forming. Energy-dominated (quartz/ceramic emitters).'),
    makeMachine('thermoform-trim-router', 'CNC Trim Router / Trim Robot (5-axis)',
      { annualDepreciation: 22264, maintenance: 9086, energy: 9322, floorSpace: 5048, indirectSupport: 5036, financeCost: 2750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics benchmark 2026-07. 5-axis CNC router / trim robot — finishes heavy-gauge formed parts; no part-specific trim die (offsets tool cost vs steel-rule).'),
    // ── Rotational Moulding ────────────────────────────────────────────────────
    // Roto energy = oven (gas/electric) + drives; embedded here as a lump, re-tariffed regionally.
    makeMachine('rotomould-biaxial', 'Biaxial Rotational Moulder (3-arm carousel)',
      { annualDepreciation: 30360, maintenance: 14134, energy: 46609, floorSpace: 20192, indirectSupport: 8057, financeCost: 3750, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK plastics benchmark. 3-arm biaxial carousel. Large tanks/playground equip. Jun 2026'),
    makeMachine('rotomould-lab-1arm', 'Single-Arm Rotational Moulder (small/lab)',
      { annualDepreciation: 12144, maintenance: 5048, energy: 17478, floorSpace: 8077, indirectSupport: 3022, financeCost: 1500, annualAvailableHours: 3500, machineUtilization: 0.65 },
      'UK', 'UK plastics benchmark. Single-arm / lab roto — small tanks, prototyping, low volume. Jun 2026'),
    makeMachine('rotomould-shuttle', 'Shuttle Rotational Moulder (1–2 station)',
      { annualDepreciation: 26312, maintenance: 12115, energy: 40783, floorSpace: 18173, indirectSupport: 7050, financeCost: 3250, annualAvailableHours: 3500, machineUtilization: 0.72 },
      'UK', 'UK plastics benchmark. Shuttle roto — mid volume, large/awkward parts, flexible tool changes. Jun 2026'),
    makeMachine('rotomould-rocknroll', 'Rock-and-Roll Rotational Moulder',
      { annualDepreciation: 22264, maintenance: 10096, energy: 34957, floorSpace: 15144, indirectSupport: 6043, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.72 },
      'UK', 'UK plastics benchmark. Rock-and-roll — long narrow parts (kayaks, ducts, pontoons); minor-axis rock + major-axis roll. Jun 2026'),
    makeMachine('rotomould-carousel-4arm', '4-Arm Fixed Carousel Rotational Moulder',
      { annualDepreciation: 45540, maintenance: 20192, energy: 69913, floorSpace: 28269, indirectSupport: 12086, financeCost: 5625, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK plastics benchmark. 4-arm fixed-carousel — high-volume independent-arm production, best oven utilisation. Jun 2026'),
    // ── Plastic Joining / Welding ──────────────────────────────────────────────
    makeMachine('ultrasonic-welder', 'Ultrasonic Welder',
      { annualDepreciation: 8096, maintenance: 3029, energy: 2330, floorSpace: 1514, indirectSupport: 2014, financeCost: 1000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. 3kW+ ultrasonic welder, small–medium plastic parts. Jun 2026'),
    makeMachine('hot-plate-welder', 'Hot Plate Welder',
      { annualDepreciation: 12144, maintenance: 4038, energy: 3496, floorSpace: 3029, indirectSupport: 2518, financeCost: 1500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. Hot plate welding for tanks and manifolds. Jun 2026'),
    makeMachine('vibration-welder', 'Vibration Welder',
      { annualDepreciation: 18216, maintenance: 7067, energy: 4661, floorSpace: 4038, indirectSupport: 4029, financeCost: 2250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK plastics assembly benchmark. Vibration welding, large flat interfaces (automotive ducts). Jun 2026'),
    // ── Sheet Metal Fab — Laser Cutters (named brands) ──────────────────────────
    makeMachine('laser-trumpf-3030', 'Trumpf TruLaser 3030 (6kW Fiber)',
      { annualDepreciation: 91080, maintenance: 65623, energy: 37287, floorSpace: 10096, indirectSupport: 40287, financeCost: 18000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Trumpf TruLaser 3030, 6kW fiber, 3000×1500 bed. UK fab shop benchmark. Target £85/hr. Jun 2026'),
    makeMachine('laser-bystronic-3015', 'Bystronic BySmart 3015 (4kW Fiber)',
      { annualDepreciation: 68816, maintenance: 50479, energy: 27965, floorSpace: 9086, indirectSupport: 35251, financeCost: 24000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Bystronic BySmart 3015, 4kW fiber, 3000×1500 bed. UK fab shop benchmark. Target £70/hr. Jun 2026'),
    // ── Sheet Metal Fab — Turret Punches ──────────────────────────────────────────
    makeMachine('punch-amada-emz3610', 'Amada EMZ 3610 Turret Punch (30T)',
      { annualDepreciation: 58696, maintenance: 45431, energy: 20974, floorSpace: 9086, indirectSupport: 30215, financeCost: 18000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Amada EMZ 3610, 30T, 58-tool capacity. UK fab shop benchmark. Target £65/hr. Jun 2026'),
    makeMachine('punch-trumpf-5000', 'Trumpf TruPunch 5000 (30T)',
      { annualDepreciation: 68816, maintenance: 55527, energy: 25635, floorSpace: 10096, indirectSupport: 33237, financeCost: 22000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Trumpf TruPunch 5000, 30T, 72-tool capacity. UK fab shop benchmark. Target £75/hr. Jun 2026'),
    // ── Sheet Metal Fab — Press Brakes ────────────────────────────────────────────
    makeMachine('brake-amada-hfe100', 'Amada HFE 100T Press Brake (3m)',
      { annualDepreciation: 48576, maintenance: 38364, energy: 16313, floorSpace: 9086, indirectSupport: 22158, financeCost: 14000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'Amada HFE3i 100T, 3000mm. UK fab shop benchmark. Target £55/hr. Jun 2026'),
    makeMachine('brake-trumpf-5230', 'Trumpf TruBend 5230 (230T)',
      { annualDepreciation: 62744, maintenance: 48460, energy: 20974, floorSpace: 10096, indirectSupport: 28201, financeCost: 18000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'Trumpf TruBend 5230, 230T, 3230mm. UK fab shop benchmark. Target £70/hr. Jun 2026'),
    // ── Sheet Metal Fab — High-Volume Stamping Presses ────────────────────────────
    makeMachine('press-schuler-400t', 'Schuler 400T Stamping Press',
      { annualDepreciation: 146740, maintenance: 85310, energy: 64087, floorSpace: 20192, indirectSupport: 65466, financeCost: 40000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'Schuler 400T mechanical stamping press. UK automotive press shop. Target £150/hr. Jun 2026'),
    makeMachine('press-aida-200t', 'AIDA 200T Stamping Press',
      { annualDepreciation: 111320, maintenance: 70671, energy: 46609, floorSpace: 18173, indirectSupport: 55394, financeCost: 35000, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'AIDA 200T servo stamping press. UK press shop benchmark. Target £120/hr. Jun 2026'),
    // ── Sheet Metal Fab — Roll Forming ────────────────────────────────────────────
    makeMachine('rollform-dimeco-20st', 'Dimeco Roll Forming Line (20 stations)',
      { annualDepreciation: 151800, maintenance: 95911, energy: 64087, floorSpace: 35336, indirectSupport: 70502, financeCost: 40000, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'Dimeco 20-station roll forming line. UK fabricator. Target £110/hr. Jun 2026'),
    // ── Sheet Metal Fab — Joining ──────────────────────────────────────────────────
    makeMachine('robot-spotweld-kuka', 'KUKA Spot Welding Robot Cell',
      { annualDepreciation: 91080, maintenance: 55527, energy: 29130, floorSpace: 15144, indirectSupport: 65466, financeCost: 38000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'KUKA robot spot weld cell. UK automotive body shop. Target £90/hr. Jun 2026'),
    makeMachine('mig-welder-manual', 'Manual MIG/MAG Welder Station',
      { annualDepreciation: 4048, maintenance: 2019, energy: 4661, floorSpace: 2019, indirectSupport: 2014, financeCost: 500, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Manual MIG/MAG station. Machine rate low — cost dominated by operator labour. UK fab shop. Jun 2026'),
    makeMachine('tig-welder-manual', 'Manual TIG Welder Station',
      { annualDepreciation: 5060, maintenance: 2524, energy: 4078, floorSpace: 2019, indirectSupport: 2014, financeCost: 700, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'Manual TIG station. Machine rate low — cost dominated by skilled operator labour. UK fab shop. Jun 2026'),
    // ── Sheet Metal Fab — Laser (additional) ─────────────────────────────────
    makeMachine('laser-trumpf-5030', 'Trumpf TruLaser 5030 (10kW Fiber)',
      { annualDepreciation: 136620, maintenance: 90863, energy: 58261, floorSpace: 14135, indirectSupport: 55394, financeCost: 28000, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'UK', 'UK fab shop benchmark Jun 2026. Trumpf TruLaser 5030, 10kW fiber, 3000×1500 bed. High-speed cutting of thick plate (25mm mild steel, 15mm SS). Dynamic beam shaping BrightLine.'),
    makeMachine('laser-amada-ensis-3015', 'Amada ENSIS 3015 AJ (3kW Fiber)',
      { annualDepreciation: 72864, maintenance: 52498, energy: 25635, floorSpace: 9086, indirectSupport: 36258, financeCost: 15000, annualAvailableHours: 4000, machineUtilization: 0.76 },
      'UK', 'UK fab shop benchmark Jun 2026. Amada ENSIS 3015 AJ, 3kW variable-beam fiber, 3000×1500 bed. Intelligent beam control — cuts thin to thick sheet without mode change.'),
    // ── Sheet Metal Fab — Plasma Cutting ─────────────────────────────────────
    makeMachine('plasma-hypertherm-xpr300', 'Hypertherm XPR300 Plasma Table',
      { annualDepreciation: 38456, maintenance: 28268, energy: 25635, floorSpace: 14135, indirectSupport: 18129, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Hypertherm XPR300 plasma — 300A, cuts up to 80mm mild steel. Plasma table for structural steel, heavy plate, general fabrication. Better edge quality than HiFocus for thick plate.'),
    makeMachine('plasma-kjellberg-hifocus280', 'Kjellberg HiFocus 280i Plasma Table',
      { annualDepreciation: 32384, maintenance: 24230, energy: 23304, floorSpace: 14135, indirectSupport: 16115, financeCost: 6500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Kjellberg HiFocus 280i — 280A HD plasma for precision cutting up to 50mm. Better edge perpendicularity than standard plasma.'),
    // ── Sheet Metal Fab — Waterjet ────────────────────────────────────────────
    makeMachine('waterjet-flow-mach500', 'Flow Mach 500 Waterjet (60K psi)',
      { annualDepreciation: 45540, maintenance: 32307, energy: 32626, floorSpace: 16154, indirectSupport: 20143, financeCost: 9000, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Flow Mach 500, 4000×2000 bed, 60,000 psi. Cuts steel, Al, SS, titanium, glass, ceramic. No HAZ — ideal for hardened/heat-sensitive materials.'),
    makeMachine('waterjet-omax-80x', 'Omax 80X Waterjet (60K psi)',
      { annualDepreciation: 38456, maintenance: 28268, energy: 27965, floorSpace: 14135, indirectSupport: 18129, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Omax 80X, 2286×2286 bed, 60,000 psi. Versatile shop waterjet — metal, glass, stone, composites. Intelli-MAX software with optimised path generation.'),
    // ── Sheet Metal Fab — Shearing ────────────────────────────────────────────
    makeMachine('shear-hydraulic-3m', 'Hydraulic Guillotine Shear (3m × 6mm)',
      { annualDepreciation: 14168, maintenance: 8077, energy: 5826, floorSpace: 6058, indirectSupport: 5036, financeCost: 2500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Hydraulic guillotine shear, 3000mm × 6mm mild steel capacity. Straight-line blanking. Very low cycle cost — ideal for simple rectangular blanks.'),
    makeMachine('shear-guillotine-6mm', 'Hydraulic Shear Heavy Duty (4m × 6mm)',
      { annualDepreciation: 20240, maintenance: 10096, energy: 8157, floorSpace: 8077, indirectSupport: 7050, financeCost: 3500, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Heavy-duty hydraulic shear, 4000mm × 6mm (12mm MS). For heavy plate blanking and structural steel service centres.'),
    // ── Sheet Metal Fab — Press Brakes (additional) ───────────────────────────
    makeMachine('brake-amada-hfe170', 'Amada HFE3i 170T Press Brake (4m)',
      { annualDepreciation: 60720, maintenance: 46441, energy: 20974, floorSpace: 11106, indirectSupport: 28201, financeCost: 17000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Amada HFE3i 170T, 4000mm. Larger brake for heavier plate forming and longer parts. ATC (Auto Tool Changer) option available.'),
    makeMachine('brake-trumpf-trubend3100', 'Trumpf TruBend 3100 (100T)',
      { annualDepreciation: 45540, maintenance: 35335, energy: 15148, floorSpace: 9086, indirectSupport: 20143, financeCost: 13000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. Trumpf TruBend 3100, 100T, 3000mm. CNC press brake with BendGuard safety and TASC adaptive bending for high angle accuracy.'),
    makeMachine('brake-lvd-ppeb135', 'LVD PPEB 135T/30 Press Brake',
      { annualDepreciation: 52624, maintenance: 40383, energy: 17478, floorSpace: 10096, indirectSupport: 24172, financeCost: 15000, annualAvailableHours: 3500, machineUtilization: 0.75 },
      'UK', 'UK fab shop benchmark Jun 2026. LVD PPEB 135T/30, 3000mm. Electro-hydraulic CNC brake with Touch-B offline programming and angle measurement system.'),
    // ── Sheet Metal Fab — Joining (additional) ────────────────────────────────
    makeMachine('spotweld-gun-manual', 'Pedestal Spot Welding Machine',
      { annualDepreciation: 6072, maintenance: 3029, energy: 5826, floorSpace: 4038, indirectSupport: 3022, financeCost: 1000, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK fab shop benchmark Jun 2026. Pedestal spot welder, 100kVA, programmable pressure/time/current. Manual C-gun also available. For body panel tack welding and structural joins.'),
    makeMachine('robot-mig-cell', 'Robotic MIG/MAG Welding Cell',
      { annualDepreciation: 75900, maintenance: 40383, energy: 23304, floorSpace: 12115, indirectSupport: 45323, financeCost: 30000, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'UK', 'UK fab shop benchmark Jun 2026. 6-axis robot MIG cell (Fanuc/KUKA), dual-station fixture, arc-sensing seam tracking. Deposition speed 0.5–1.2 m/min. For high-volume structural welding.'),
    // ── Rubber Processing ─────────────────────────────────────────────────────
    makeMachine('compression-mould-std', 'Compression Moulding Press 250T',
      { annualDepreciation: 18216, maintenance: 8077, energy: 11652, floorSpace: 5048, indirectSupport: 4029, financeCost: 2250, annualAvailableHours: 3500, machineUtilization: 0.80 },
      'UK', 'UK rubber moulding benchmark Jun 2026. 250T compression press — EPDM/NR/NBR gaskets, mounts.'),
    makeMachine('transfer-mould-std', 'Transfer Moulding Press 200T',
      { annualDepreciation: 22264, maintenance: 10096, energy: 13983, floorSpace: 6058, indirectSupport: 5036, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK rubber moulding benchmark Jun 2026. 200T transfer press — bonded rubber-metal parts, complex geometry.'),
    makeMachine('lsr-injection-machine', 'LSR Injection Moulding Machine',
      { annualDepreciation: 35420, maintenance: 14134, energy: 23304, floorSpace: 7067, indirectSupport: 7050, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK silicone moulding benchmark Jun 2026. Liquid silicone rubber injection (Engel/Arburg/Sumitomo). Medical/auto seals.'),
    makeMachine('cure-oven-rubber', 'Rubber Cure / Vulcanisation Oven',
      { annualDepreciation: 10120, maintenance: 4038, energy: 29130, floorSpace: 6058, indirectSupport: 3022, financeCost: 1250, annualAvailableHours: 5000, machineUtilization: 0.82 },
      'UK', 'UK rubber benchmark Jun 2026. Salt-bath or hot-air oven for EPDM/NBR extrusion vulcanisation.'),
    makeMachine('extruder-rubber-60mm', 'Rubber Extruder 60mm (Cold-feed)',
      { annualDepreciation: 15180, maintenance: 6058, energy: 20974, floorSpace: 4038, indirectSupport: 3525, financeCost: 1875, annualAvailableHours: 5000, machineUtilization: 0.80 },
      'UK', 'UK rubber benchmark Jun 2026. 60mm cold-feed rubber extruder — EPDM seals, hose profiles.'),
    makeMachine('die-cut-press-rubber', 'Hydraulic Die-Cutting Press 20T',
      { annualDepreciation: 8096, maintenance: 3534, energy: 5826, floorSpace: 3029, indirectSupport: 2014, financeCost: 1000, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'UK', 'UK rubber benchmark Jun 2026. 20T hydraulic die-cutting press — flat gaskets, seals, strips. Blanks pre-vulcanised EPDM/SBR/NBR/CR sheet at high throughput.'),
    // ── Composite Manufacturing Equipment ────────────────────────────────────
    makeMachine('autoclave-1200mm', 'Production Autoclave 1200mm dia',
      { annualDepreciation: 60720, maintenance: 25240, energy: 58261, floorSpace: 20192, indirectSupport: 15108, financeCost: 7500, annualAvailableHours: 4000, machineUtilization: 0.70 },
      'UK', 'UK composites benchmark Jun 2026. 1200mm × 3000mm production autoclave. CFRP aerospace/auto structures.'),
    makeMachine('oven-composite-cure', 'Composite Cure Oven (Fan-Assisted)',
      { annualDepreciation: 18216, maintenance: 6058, energy: 34957, floorSpace: 12115, indirectSupport: 5036, financeCost: 2250, annualAvailableHours: 5000, machineUtilization: 0.75 },
      'UK', 'UK composites benchmark Jun 2026. Fan-assisted oven cure — prepreg (no autoclave pressure), wet layup post-cure.'),
    ...AL_MACHINES,
    makeMachine('rtm-press-std', 'RTM / VARTM Injection Press',
      { annualDepreciation: 22264, maintenance: 9086, energy: 13983, floorSpace: 8077, indirectSupport: 6043, financeCost: 2750, annualAvailableHours: 3500, machineUtilization: 0.78 },
      'UK', 'UK composites benchmark Jun 2026. Resin Transfer Moulding injection press. Structural automotive CFRP/GFRP.'),
    makeMachine('waterjet-5ax-composite', '5-Axis Waterjet Trim System',
      { annualDepreciation: 35420, maintenance: 14134, energy: 23304, floorSpace: 12115, indirectSupport: 10072, financeCost: 4375, annualAvailableHours: 4000, machineUtilization: 0.75 },
      'UK', 'UK composites benchmark Jun 2026. 5-axis waterjet trim/drill for CFRP panels. 380 MPa, 0.4mm orifice.'),
    makeMachine('mach-afp-atl', 'AFP/ATL Composite Cell',
      { annualDepreciation: 425040, maintenance: 161534, energy: 93218, floorSpace: 40384, indirectSupport: 60430, financeCost: 24000, annualAvailableHours: 4000, machineUtilization: 0.70 },
      'UK', 'Automated Fibre/Tape Placement cell. Rate includes robot, gantry, head, NC software, maintenance. Setup: 4.0 hr. UK composites benchmark Jun 2026.'),
    // ── Wiring Harness Equipment ───────────────────────────────────────────
    makeMachine('harness-test-sys', 'Electrical Harness Test System (Continuity + HiPot)',
      { annualDepreciation: 18216, maintenance: 5048, energy: 3496, floorSpace: 4038, indirectSupport: 5036, financeCost: 2250, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'UK', 'UK harness benchmark Jun 2026. Automated electrical test: continuity, insulation resistance, HiPot. IATF-compliant.'),

    // ══════════════════════════════════════════════════════════════════════════
    // REGIONAL MACHINE RATES — China, India, Germany, Poland, Mexico
    // Depreciation & finance cost same as UK (capital equipment is globally traded).
    // Energy, floor-space, maintenance & indirect support scaled to regional rates.
    // Energy ratios vs UK £0.23/kWh: CN=0.26, IN=0.35, DE=0.87, PL=0.52, MX=0.39
    // Floor ratios vs UK: CN=0.15, IN=0.10, DE=0.80, PL=0.35, MX=0.20
    // Indirect/maintenance ratios vs UK: CN=0.30, IN=0.22, DE=1.40, PL=0.45, MX=0.30
    // ══════════════════════════════════════════════════════════════════════════

    // ── CNC Machining — VMC 3-axis ────────────────────────────────────────────
    makeMachine('mach-vmc3-cn', 'VMC 3-axis CNC (China)',
      { annualDepreciation: 22264, maintenance: 2423, energy: 1515, floorSpace: 530, indirectSupport: 2266, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'CN', 'China CNC machining benchmark. 3-axis VMC, Jiangsu/Guangdong region. Jun 2026'),
    makeMachine('mach-vmc3-in', 'VMC 3-axis CNC (India)',
      { annualDepreciation: 22264, maintenance: 2019, energy: 2039, floorSpace: 353, indirectSupport: 1511, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'IN', 'India CNC machining benchmark. Pune/Chennai corridor. Jun 2026'),
    makeMachine('mach-vmc3-de', 'VMC 3-axis CNC (Germany)',
      { annualDepreciation: 22264, maintenance: 11307, energy: 5069, floorSpace: 2827, indirectSupport: 10575, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.87 },
      'DE', 'Germany precision machining benchmark. Baden-Württemberg. Jun 2026'),
    makeMachine('mach-vmc3-pl', 'VMC 3-axis CNC (Poland)',
      { annualDepreciation: 22264, maintenance: 3635, energy: 3030, floorSpace: 1237, indirectSupport: 3399, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'PL', 'Poland CNC machining benchmark. Silesia/Lower Silesia. Jun 2026'),
    makeMachine('mach-vmc3-mx', 'VMC 3-axis CNC (Mexico)',
      { annualDepreciation: 22264, maintenance: 2423, energy: 2272, floorSpace: 707, indirectSupport: 2266, financeCost: 5850, annualAvailableHours: 4000, machineUtilization: 0.85 },
      'MX', 'Mexico CNC machining benchmark. Monterrey/Guanajuato. Jun 2026'),

    // ── Injection Moulding — 200T ──────────────────────────────────────────────
    makeMachine('imm-200t-cn', 'Injection Moulding 200T (China)',
      { annualDepreciation: 28336, maintenance: 3029, energy: 4894, floorSpace: 1212, indirectSupport: 3022, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.85 },
      'CN', 'China injection moulding benchmark. Taizhou/Guangdong plastics belt. Jun 2026'),
    makeMachine('imm-200t-in', 'Injection Moulding 200T (India)',
      { annualDepreciation: 28336, maintenance: 2524, energy: 6525, floorSpace: 808, indirectSupport: 2216, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.83 },
      'IN', 'India injection moulding benchmark. Pune/Rajkot plastics cluster. Jun 2026'),
    makeMachine('imm-200t-de', 'Injection Moulding 200T (Germany)',
      { annualDepreciation: 28336, maintenance: 14134, energy: 16220, floorSpace: 6462, indirectSupport: 22561, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.87 },
      'DE', 'Germany injection moulding benchmark. Jun 2026'),
    makeMachine('imm-200t-pl', 'Injection Moulding 200T (Poland)',
      { annualDepreciation: 28336, maintenance: 4543, energy: 9695, floorSpace: 2827, indirectSupport: 7252, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.85 },
      'PL', 'Poland injection moulding benchmark. Jun 2026'),
    makeMachine('imm-200t-mx', 'Injection Moulding 200T (Mexico)',
      { annualDepreciation: 28336, maintenance: 3029, energy: 7271, floorSpace: 1615, indirectSupport: 3022, financeCost: 7000, annualAvailableHours: 5000, machineUtilization: 0.84 },
      'MX', 'Mexico injection moulding benchmark. Monterrey/Saltillo. Jun 2026'),

    // ── HPDC Casting — 500T ──────────────────────────────────────────────────
    makeMachine('hpdc-500t-cn', 'HPDC 500T (China)',
      { annualDepreciation: 55660, maintenance: 6058, energy: 9089, floorSpace: 2272, indirectSupport: 7554, financeCost: 13750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'CN', 'China HPDC foundry benchmark. ADC12 Al alloy. Guangdong/Jiangsu. Jun 2026'),
    makeMachine('hpdc-500t-in', 'HPDC 500T (India)',
      { annualDepreciation: 55660, maintenance: 5048, energy: 12235, floorSpace: 1514, indirectSupport: 5539, financeCost: 13750, annualAvailableHours: 4000, machineUtilization: 0.78 },
      'IN', 'India HPDC foundry benchmark. Rajkot/Pune auto cluster. Jun 2026'),
    makeMachine('hpdc-500t-mx', 'HPDC 500T (Mexico)',
      { annualDepreciation: 55660, maintenance: 6058, energy: 13633, floorSpace: 3029, indirectSupport: 7554, financeCost: 13750, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'MX', 'Mexico HPDC benchmark. Monterrey auto zone. Jun 2026'),

    // ── Sheet Metal Stamping — 400T ────────────────────────────────────────────
    makeMachine('press-400t-cn', 'Stamping Press 400T (China)',
      { annualDepreciation: 38456, maintenance: 3635, energy: 6059, floorSpace: 3029, indirectSupport: 4532, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'CN', 'China press shop benchmark. Wuhan/Shanghai auto stamping. Jun 2026'),
    makeMachine('press-400t-in', 'Stamping Press 400T (India)',
      { annualDepreciation: 38456, maintenance: 3029, energy: 8157, floorSpace: 2019, indirectSupport: 3324, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.80 },
      'IN', 'India press shop benchmark. Pune/NCR auto cluster. Jun 2026'),
    makeMachine('press-400t-pl', 'Stamping Press 400T (Poland)',
      { annualDepreciation: 38456, maintenance: 5452, energy: 12118, floorSpace: 5300, indirectSupport: 6798, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'PL', 'Poland stamping press benchmark. Silesia auto suppliers. Jun 2026'),
    makeMachine('press-400t-mx', 'Stamping Press 400T (Mexico)',
      { annualDepreciation: 38456, maintenance: 3635, energy: 9089, floorSpace: 4038, indirectSupport: 4532, financeCost: 9500, annualAvailableHours: 4000, machineUtilization: 0.82 },
      'MX', 'Mexico stamping benchmark. Saltillo auto corridor. Jun 2026'),

    // ── Manual Assembly / Bench ────────────────────────────────────────────────
    makeMachine('bench-assembly-cn', 'Manual Assembly Bench (China)',
      { annualDepreciation: 3036, maintenance: 303, energy: 303, floorSpace: 606, indirectSupport: 1007, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'CN', 'China assembly benchmark. Shenzhen/Suzhou. Harness, PCBA, BIW subassembly. Jun 2026'),
    makeMachine('bench-assembly-in', 'Manual Assembly Bench (India)',
      { annualDepreciation: 3036, maintenance: 252, energy: 408, floorSpace: 404, indirectSupport: 755, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'IN', 'India assembly benchmark. Pune/Nashik auto corridor. Jun 2026'),
    makeMachine('bench-assembly-mx', 'Manual Assembly Bench (Mexico)',
      { annualDepreciation: 3036, maintenance: 303, energy: 454, floorSpace: 808, indirectSupport: 1007, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'MX', 'Mexico assembly benchmark. Juárez/Monterrey maquiladora. Jun 2026'),
    makeMachine('bench-assembly-vn', 'Manual Assembly Bench (Vietnam)',
      { annualDepreciation: 3036, maintenance: 202, energy: 364, floorSpace: 303, indirectSupport: 604, financeCost: 750, annualAvailableHours: 4800, machineUtilization: 0.92 },
      'VN', 'Vietnam assembly benchmark. Ho Chi Minh City / Hanoi. Wiring harness. Jun 2026'),
    makeMachine('bench-assembly-pl', 'Manual Assembly Bench (Poland)',
      { annualDepreciation: 3036, maintenance: 454, energy: 727, floorSpace: 1060, indirectSupport: 1360, financeCost: 750, annualAvailableHours: 4500, machineUtilization: 0.90 },
      'PL', 'Poland assembly benchmark. Łódź/Wrocław. Harness, electronics. Jun 2026'),
  ],

  labour: [
    {
      id: 'lab-uk-skilled',
      region: 'UK',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 26.19,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK AMT wage survey Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'High',
    },
    {
      id: 'lab-uk-semiskilled',
      region: 'UK',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 19.94,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK AMT wage survey Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'High',
    },
    {
      id: 'lab-uk-engineer',
      region: 'UK',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 42.80,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK engineering salary benchmark Jun 2026 | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-in-skilled',
      region: 'India',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 5.14,
      effectiveDate: '2026-09-29',
      sourceNote: 'India manufacturing wage benchmark Jun 2026 | Refresh 2026-09: local wages +2.30% (EY Future of Pay 2026: manufacturing/automotive increments 9.5%, one quarter); INR 125.2→127.2 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-skilled',
      region: 'China',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 8.08,
      effectiveDate: '2026-09-29',
      sourceNote: 'China manufacturing wage benchmark Jun 2026 | Refresh 2026-09: local wages +0.98% (2026 salary budget ~4.0% (china-briefing survey), one quarter); CNY 8.989→8.88 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-uk-foundry',
      region: 'UK',
      skillLevel: 'Foundry Operative',
      fullyLoadedRatePerHr: 18.63,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK foundry/casting operator wage survey Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-inspector',
      region: 'UK',
      skillLevel: 'CMM / Quality Inspector',
      fullyLoadedRatePerHr: 27.70,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK quality/inspection wage benchmark Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-technician',
      region: 'UK',
      skillLevel: 'Maintenance / Mould-Setter Technician',
      fullyLoadedRatePerHr: 28.81,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK process/maintenance technician benchmark Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-supervisor',
      region: 'UK',
      skillLevel: 'Shift / Production Supervisor',
      fullyLoadedRatePerHr: 35.35,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK production supervisor benchmark Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-forge',
      region: 'UK',
      skillLevel: 'Forge Operator / Hammer-man',
      fullyLoadedRatePerHr: 24.17,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK drop-forge operator wage benchmark Jun 2026, incl. NI + benefits + hot-work allowance | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-furnace',
      region: 'UK',
      skillLevel: 'Furnace / Heat Operator',
      fullyLoadedRatePerHr: 22.16,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK furnace/induction heat operator wage benchmark Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-blow',
      region: 'UK',
      skillLevel: 'Blow Moulding Operator',
      fullyLoadedRatePerHr: 20.65,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK blow-moulding machine operator wage benchmark Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-roto',
      region: 'UK',
      skillLevel: 'Rotational Moulding Operator',
      fullyLoadedRatePerHr: 20.14,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK roto-moulding operator wage benchmark Jun 2026, incl. NI + benefits (hot demould/charge) | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-thermoform',
      region: 'UK',
      skillLevel: 'Thermoforming Operator',
      fullyLoadedRatePerHr: 19.64,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK thermoforming machine operator wage benchmark Jun 2026, incl. NI + benefits (sheet load, form, unload) | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-uk-trim-router',
      region: 'UK',
      skillLevel: 'CNC Trim / Router Operator',
      fullyLoadedRatePerHr: 22.66,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK CNC router / trim-cell operator wage benchmark Jun 2026, incl. NI + benefits (programmes/jigs formed parts) | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-skilled',
      region: 'Germany',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 40.77,
      effectiveDate: '2026-09-29',
      sourceNote: 'Germany IG Metall wage survey Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.01% (Destatis nominal wages Q2 2026 +4.1% y/y, one quarter); EUR 1.161→1.165 per £',
      confidence: 'Medium',
    },
    {
      id: 'lab-pl-skilled',
      region: 'Poland',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 11.90,
      effectiveDate: '2026-09-29',
      sourceNote: 'Poland manufacturing wage benchmark Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.44% (GUS enterprise-sector wages Aug 2026 +5.9% y/y, one quarter); PLN 4.98→5.096 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-mx-skilled',
      region: 'Mexico',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 7.39,
      effectiveDate: '2026-09-29',
      sourceNote: 'Mexico manufacturing wage benchmark Jun 2026 (IMSS included) | Refresh 2026-09: local wages +1.44% (IMSS average registered wage +5.9% y/y (Jul 2026), one quarter); MXN 23.15→23.84 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-uk-electronics',
      region: 'UK',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 17.63,
      effectiveDate: '2026-09-29',
      sourceNote: 'UK EMS operator wage benchmark Jun 2026, incl. NI + benefits | Refresh 2026-09: local wages +0.72% (ONS AWE manufacturing regular pay May–Jul 2026 +2.9% y/y, one quarter)',
      confidence: 'Medium',
    },
    // ── Germany ──────────────────────────────────────────────────────────────
    {
      id: 'lab-de-semiskilled',
      region: 'Germany',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 32.21,
      effectiveDate: '2026-09-29',
      sourceNote: 'Germany IG Metall Lohngruppe 3 Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.01% (Destatis nominal wages Q2 2026 +4.1% y/y, one quarter); EUR 1.161→1.165 per £',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-foundry',
      region: 'Germany',
      skillLevel: 'Foundry Operative',
      fullyLoadedRatePerHr: 28.19,
      effectiveDate: '2026-09-29',
      sourceNote: 'Germany foundry Tarifvertrag Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.01% (Destatis nominal wages Q2 2026 +4.1% y/y, one quarter); EUR 1.161→1.165 per £ | Country-rates review 2026-10: was £35.23/hr, disagreeing with this country’s rate in regional-rates.ts (£28.19) — the rate a costing in this country actually uses; aligned',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-electronics',
      region: 'Germany',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 30.20,
      effectiveDate: '2026-09-29',
      sourceNote: 'Germany EMS operator benchmark Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.01% (Destatis nominal wages Q2 2026 +4.1% y/y, one quarter); EUR 1.161→1.165 per £',
      confidence: 'Medium',
    },
    {
      id: 'lab-de-engineer',
      region: 'Germany',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 65.43,
      effectiveDate: '2026-09-29',
      sourceNote: 'Germany engineering salary benchmark Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.01% (Destatis nominal wages Q2 2026 +4.1% y/y, one quarter); EUR 1.161→1.165 per £',
      confidence: 'Medium',
    },
    // ── Poland ───────────────────────────────────────────────────────────────
    {
      id: 'lab-pl-semiskilled',
      region: 'Poland',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 8.92,
      effectiveDate: '2026-09-29',
      sourceNote: 'Poland manufacturing wage benchmark Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.44% (GUS enterprise-sector wages Aug 2026 +5.9% y/y, one quarter); PLN 4.98→5.096 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-pl-electronics',
      region: 'Poland',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 10.41,
      effectiveDate: '2026-09-29',
      sourceNote: 'Poland EMS sector benchmark Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.44% (GUS enterprise-sector wages Aug 2026 +5.9% y/y, one quarter); PLN 4.98→5.096 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-pl-foundry',
      region: 'Poland',
      skillLevel: 'Foundry Operative',
      fullyLoadedRatePerHr: 7.93,
      effectiveDate: '2026-09-29',
      sourceNote: 'Poland foundry wage benchmark Jun 2026, incl. social costs | Refresh 2026-09: local wages +1.44% (GUS enterprise-sector wages Aug 2026 +5.9% y/y, one quarter); PLN 4.98→5.096 per £ | Country-rates review 2026-10: was £9.91/hr, disagreeing with this country’s rate in regional-rates.ts (£7.93) — the rate a costing in this country actually uses; aligned',
      confidence: 'Low',
    },
    // ── China ─────────────────────────────────────────────────────────────────
    {
      id: 'lab-cn-semiskilled',
      region: 'China',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 5.62,
      effectiveDate: '2026-09-29',
      sourceNote: 'China Pearl/Yangtze delta manufacturing wage benchmark Jun 2026 | Refresh 2026-09: local wages +0.98% (2026 salary budget ~4.0% (china-briefing survey), one quarter); CNY 8.989→8.88 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-electronics',
      region: 'China',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 6.64,
      effectiveDate: '2026-09-29',
      sourceNote: 'China EMS operator benchmark Jun 2026 (Shenzhen/Suzhou) | Refresh 2026-09: local wages +0.98% (2026 salary budget ~4.0% (china-briefing survey), one quarter); CNY 8.989→8.88 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-cn-engineer',
      region: 'China',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 18.40,
      effectiveDate: '2026-09-29',
      sourceNote: 'China manufacturing engineer salary benchmark Jun 2026 | Refresh 2026-09: local wages +0.98% (2026 salary budget ~4.0% (china-briefing survey), one quarter); CNY 8.989→8.88 per £',
      confidence: 'Low',
    },
    // ── India ─────────────────────────────────────────────────────────────────
    {
      id: 'lab-in-semiskilled',
      region: 'India',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 3.52,
      effectiveDate: '2026-09-29',
      sourceNote: 'India manufacturing wage benchmark Jun 2026 (Pune/Chennai) | Refresh 2026-09: local wages +2.30% (EY Future of Pay 2026: manufacturing/automotive increments 9.5%, one quarter); INR 125.2→127.2 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-in-electronics',
      region: 'India',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 4.53,
      effectiveDate: '2026-09-29',
      sourceNote: 'India EMS operator benchmark Jun 2026 (Bangalore/Chennai) | Refresh 2026-09: local wages +2.30% (EY Future of Pay 2026: manufacturing/automotive increments 9.5%, one quarter); INR 125.2→127.2 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-in-engineer',
      region: 'India',
      skillLevel: 'Process Engineer',
      fullyLoadedRatePerHr: 12.08,
      effectiveDate: '2026-09-29',
      sourceNote: 'India manufacturing engineer salary benchmark Jun 2026 | Refresh 2026-09: local wages +2.30% (EY Future of Pay 2026: manufacturing/automotive increments 9.5%, one quarter); INR 125.2→127.2 per £',
      confidence: 'Low',
    },
    // ── Mexico ────────────────────────────────────────────────────────────────
    {
      id: 'lab-mx-semiskilled',
      region: 'Mexico',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 5.71,
      effectiveDate: '2026-09-29',
      sourceNote: 'Mexico manufacturing wage benchmark Jun 2026 (Monterrey/Juárez, IMSS included) | Refresh 2026-09: local wages +1.44% (IMSS average registered wage +5.9% y/y (Jul 2026), one quarter); MXN 23.15→23.84 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-mx-electronics',
      region: 'Mexico',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 6.40,
      effectiveDate: '2026-09-29',
      sourceNote: 'Mexico EMS operator benchmark Jun 2026 (Juárez/Tijuana, IMSS included) | Refresh 2026-09: local wages +1.44% (IMSS average registered wage +5.9% y/y (Jul 2026), one quarter); MXN 23.15→23.84 per £',
      confidence: 'Low',
    },
    // ── Turkey ────────────────────────────────────────────────────────────────
    {
      id: 'lab-tr-skilled',
      region: 'Turkey',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 6.62,
      effectiveDate: '2026-09-29',
      sourceNote: 'Turkey manufacturing wage benchmark Jun 2026 (Bursa/İzmir, SGK included) | Refresh 2026-09: local wages +7.00% (TurkStat gross wages in manufacturing index Q1→Q2 2026 +7.0% q/q, carried into Q3); TRY 61.74→64.86 per £ | Country-rates review 2026-10: was £8.66/hr, disagreeing with this country’s rate in regional-rates.ts (£6.62) — the rate a costing in this country actually uses; aligned',
      confidence: 'Low',
    },
    {
      id: 'lab-tr-semiskilled',
      region: 'Turkey',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 5.09,
      effectiveDate: '2026-09-29',
      sourceNote: 'Turkey manufacturing wage benchmark Jun 2026 (SGK included) | Refresh 2026-09: local wages +7.00% (TurkStat gross wages in manufacturing index Q1→Q2 2026 +7.0% q/q, carried into Q3); TRY 61.74→64.86 per £ | Country-rates review 2026-10: was £6.11/hr, disagreeing with this country’s rate in regional-rates.ts (£5.09) — the rate a costing in this country actually uses; aligned',
      confidence: 'Low',
    },
    // ── Vietnam ───────────────────────────────────────────────────────────────
    {
      id: 'lab-vn-skilled',
      region: 'Vietnam',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 3.92,
      effectiveDate: '2026-09-29',
      sourceNote: 'Vietnam manufacturing wage benchmark Jun 2026 (Ho Chi Minh / Hanoi) | Refresh 2026-09: local wages +1.73% (2026 projected wage increase 7.1%, one quarter); VND 34814→34350 per £ | Country-rates review 2026-10: was £4.12/hr, disagreeing with this country’s rate in regional-rates.ts (£3.92) — the rate a costing in this country actually uses; aligned',
      confidence: 'Low',
    },
    {
      id: 'lab-vn-semiskilled',
      region: 'Vietnam',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 2.89,
      effectiveDate: '2026-09-29',
      sourceNote: 'Vietnam manufacturing wage benchmark Jun 2026 | Refresh 2026-09: local wages +1.73% (2026 projected wage increase 7.1%, one quarter); VND 34814→34350 per £',
      confidence: 'Low',
    },
    // ── South Korea ───────────────────────────────────────────────────────────
    {
      id: 'lab-kr-skilled',
      region: 'South Korea',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 25.44,
      effectiveDate: '2026-09-29',
      sourceNote: 'Korea manufacturing wage benchmark Jun 2026 (Ulsan/Busan, incl. health + pension) | Refresh 2026-09: local wages +1.44% (MoEL manufacturing wages H1 2026 +5.9% y/y, one quarter); KRW 2049.5→1798 per £',
      confidence: 'Low',
    },
    {
      id: 'lab-kr-electronics',
      region: 'South Korea',
      skillLevel: 'SMT / Electronics Operator',
      fullyLoadedRatePerHr: 19.66,
      effectiveDate: '2026-09-29',
      sourceNote: 'Korea EMS operator benchmark Jun 2026 (Suwon/Gumi) | Refresh 2026-09: local wages +1.44% (MoEL manufacturing wages H1 2026 +5.9% y/y, one quarter); KRW 2049.5→1798 per £ | Country-rates review 2026-10: was £21.39/hr, disagreeing with this country’s rate in regional-rates.ts (£19.66) — the rate a costing in this country actually uses; aligned',
      confidence: 'Low',
    },
    // ── Romania ───────────────────────────────────────────────────────────────
    {
      id: 'lab-ro-skilled',
      region: 'Romania',
      skillLevel: 'Skilled Machinist',
      fullyLoadedRatePerHr: 7.45,
      effectiveDate: '2026-09-29',
      sourceNote: 'Romania manufacturing wage benchmark Jun 2026 (Cluj/Timișoara, CAS included) | Refresh 2026-09: local wages +0.45% (Eurostat hourly wage cost Q2 2026 +1.8% y/y, one quarter); RON 6.086→6.151 per £ | Country-rates review 2026-10: was £7.95/hr, disagreeing with this country’s rate in regional-rates.ts (£7.45) — the rate a costing in this country actually uses; aligned',
      confidence: 'Low',
    },
    {
      id: 'lab-ro-semiskilled',
      region: 'Romania',
      skillLevel: 'Semi-skilled Operator',
      fullyLoadedRatePerHr: 5.76,
      effectiveDate: '2026-09-29',
      sourceNote: 'Romania manufacturing wage benchmark Jun 2026 (CAS included) | Refresh 2026-09: local wages +0.45% (Eurostat hourly wage cost Q2 2026 +1.8% y/y, one quarter); RON 6.086→6.151 per £ | Country-rates review 2026-10: was £6.46/hr, disagreeing with this country’s rate in regional-rates.ts (£5.76) — the rate a costing in this country actually uses; aligned',
      confidence: 'Low',
    },
  ],

  energy: [
    {
      id: 'energy-uk',
      region: 'UK',
      electricityPerKwh: 0.268,
      gasPerKwh: 0.067,
      effectiveDate: '2026-09-29',
      sourceNote: 'Electricity: Ofgem industrial tariff Q1 2026. Gas CORRECTED 2026-08: DESNZ  | Refresh 2026-09: UK: previous tariff + wholesale change passed through — baseload power £114.5→£152.55/MWh (+3.8p/kWh), NBP gas ~104→182.25 p/therm (+2.67p/kWh), Jun→24 Sep 2026 (Prestige Business Solutions market reports)'
        + 'Quarterly Energy Prices puts manufacturing-sector gas at 3.5-3.7 p/kWh; the previous '
        + '6.5 p was a non-industrial figure and over-stated every gas-fired furnace.',
      confidence: 'High',
    },
    {
      id: 'energy-eu',
      region: 'EU',
      electricityPerKwh: 0.184,
      gasPerKwh: 0.066,
      effectiveDate: '2026-09-29',
      sourceNote: 'Eurostat industrial energy Q1 2026 | Refresh 2026-09: EU average: local tariff held at EUR FX move; gas + TTF move passed through',
      confidence: 'Medium',
    },
    {
      id: 'energy-de',
      region: 'Germany',
      electricityPerKwh: 0.199,
      gasPerKwh: 0.068,
      effectiveDate: '2026-09-29',
      sourceNote: 'Bundesnetzagentur industrial tariff Q1 2026 | Refresh 2026-09: local tariff held, converted at EUR 1.161→1.165 per £; gas + Dutch TTF move €48.5→€72.9/MWh Jun→23 Sep 2026 (gmk.center, tradingpedia) passed through; EU power has no sourced Sep average — held',
      confidence: 'Medium',
    },
    {
      id: 'energy-pl',
      region: 'Poland',
      electricityPerKwh: 0.137,
      gasPerKwh: 0.080,
      effectiveDate: '2026-09-29',
      sourceNote: 'URE Poland industrial energy Q1 2026 | Refresh 2026-09: local tariff held, converted at PLN 4.98→5.096 per £; gas + Dutch TTF move €48.5→€72.9/MWh Jun→23 Sep 2026 (gmk.center, tradingpedia) passed through; EU power has no sourced Sep average — held',
      confidence: 'Low',
    },
    {
      id: 'energy-cn',
      region: 'China',
      electricityPerKwh: 0.071,
      gasPerKwh: 0.030,
      effectiveDate: '2026-09-29',
      sourceNote: 'NDRC China industrial electricity benchmark Jun 2026 | Refresh 2026-09: local tariff held, converted at CNY 8.989→8.88 per £',
      confidence: 'Low',
    },
    {
      id: 'energy-in',
      region: 'India',
      electricityPerKwh: 0.069,
      gasPerKwh: 0.030,
      effectiveDate: '2026-09-29',
      sourceNote: 'India industrial electricity benchmark Jun 2026 (MSEDCL/TNEB avg) | Refresh 2026-09: local tariff held, converted at INR 125.2→127.2 per £',
      confidence: 'Low',
    },
    {
      id: 'energy-mx',
      region: 'Mexico',
      electricityPerKwh: 0.078,
      gasPerKwh: 0.039,
      effectiveDate: '2026-09-29',
      sourceNote: 'CFE Mexico industrial tariff Jun 2026 | Refresh 2026-09: local tariff held, converted at MXN 23.15→23.84 per £',
      confidence: 'Low',
    },
    {
      id: 'energy-tr',
      region: 'Turkey',
      electricityPerKwh: 0.086,
      gasPerKwh: 0.038,
      effectiveDate: '2026-09-29',
      sourceNote: 'EPDK Turkey industrial tariff Jun 2026 | Refresh 2026-09: local tariff held, converted at TRY 61.74→64.86 per £; regulated tariff unchanged in Q3 2026 (ERC Ft, EVN, KEPCO, EPDK)',
      confidence: 'Low',
    },
    {
      id: 'energy-kr',
      region: 'South Korea',
      electricityPerKwh: 0.148,
      gasPerKwh: 0.068,
      effectiveDate: '2026-09-29',
      sourceNote: 'KEPCO Korea industrial tariff Jun 2026 | Refresh 2026-09: local tariff held, converted at KRW 2050→1798 per £; regulated tariff unchanged in Q3 2026 (ERC Ft, EVN, KEPCO, EPDK)',
      confidence: 'Low',
    },
    {
      id: 'energy-vn',
      region: 'Vietnam',
      electricityPerKwh: 0.061,
      gasPerKwh: 0.030,
      effectiveDate: '2026-09-29',
      sourceNote: 'EVN Vietnam industrial electricity benchmark Jun 2026 | Refresh 2026-09: local tariff held, converted at VND 3.481e+04→3.435e+04 per £; regulated tariff unchanged in Q3 2026 (ERC Ft, EVN, KEPCO, EPDK)',
      confidence: 'Low',
    },
    {
      id: 'energy-ro',
      region: 'Romania',
      electricityPerKwh: 0.109,
      gasPerKwh: 0.070,
      effectiveDate: '2026-09-29',
      sourceNote: 'ANRE Romania industrial tariff Jun 2026 | Refresh 2026-09: local tariff held, converted at RON 6.086→6.151 per £; gas + Dutch TTF move €48.5→€72.9/MWh Jun→23 Sep 2026 (gmk.center, tradingpedia) passed through; EU power has no sourced Sep average — held',
      confidence: 'Low',
    },
  ],

  fx: [
    { id: 'fx-gbp-eur', fromCurrency: 'GBP', toCurrency: 'EUR', rate: 1.165, effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-usd', fromCurrency: 'GBP', toCurrency: 'USD', rate: 1.324, effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-inr', fromCurrency: 'GBP', toCurrency: 'INR', rate: 127.2, effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-cny', fromCurrency: 'GBP', toCurrency: 'CNY', rate: 8.88, effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-mxn', fromCurrency: 'GBP', toCurrency: 'MXN', rate: 23.84,    effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-thb', fromCurrency: 'GBP', toCurrency: 'THB', rate: 44.52,    effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-vnd', fromCurrency: 'GBP', toCurrency: 'VND', rate: 34350, effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-brl', fromCurrency: 'GBP', toCurrency: 'BRL', rate: 6.916,    effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
    { id: 'fx-gbp-krw', fromCurrency: 'GBP', toCurrency: 'KRW', rate: 1798,  effectiveDate: '2026-09-29', sourceNote: 'fawazahmed0/currency-api daily snapshots 2026-06-30 and 2026-09-29 (npm @fawazahmed0/currency-api)' },
  ],

  overheadDefaults: [
    { id: 'oh-machining-t2',         commodityType: 'machining',          supplierTier: 'Tier 2', overheadPct: 0.12, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-machining-t1',         commodityType: 'machining',          supplierTier: 'Tier 1', overheadPct: 0.15, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-sheet-metal-t2',       commodityType: 'sheet_metal',        supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.07, sourceNote: 'Industry benchmark' },
    { id: 'oh-injection-moulding-t2',commodityType: 'injection_moulding', supplierTier: 'Tier 2', overheadPct: 0.11, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-casting-t2',           commodityType: 'casting',            supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-forging-t2',           commodityType: 'forging',            supplierTier: 'Tier 2', overheadPct: 0.12, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-painting-t2',          commodityType: 'painting',           supplierTier: 'Tier 2', overheadPct: 0.08, marginPct: 0.06, sourceNote: 'Industry benchmark' },
    { id: 'oh-biw-t2',               commodityType: 'biw_assembly',       supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.07, sourceNote: 'Industry benchmark' },
    { id: 'oh-pcb-fab-t2',           commodityType: 'pcb_fab',            supplierTier: 'Tier 2', overheadPct: 0.08, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-pcba-t2',              commodityType: 'pcba',               supplierTier: 'Tier 2', overheadPct: 0.08, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-cast-and-machine-t2',  commodityType: 'cast_and_machine',   supplierTier: 'Tier 2', overheadPct: 0.12, marginPct: 0.09, sourceNote: 'Industry benchmark' },
    { id: 'oh-blow-moulding-t2',    commodityType: 'blow_moulding',       supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-aluminium_extrusion-t1', commodityType: 'aluminium_extrusion', supplierTier: 'Tier 1', overheadPct: 0.12, marginPct: 0.08, sourceNote: 'Aluminium extrusion build 2026-10 — integrated extruder with fabrication and finishing' },
    { id: 'oh-aluminium_extrusion-t2', commodityType: 'aluminium_extrusion', supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.07, sourceNote: 'Aluminium extrusion build 2026-10 — profile extruder' },
    { id: 'oh-aluminium_extrusion-t3', commodityType: 'aluminium_extrusion', supplierTier: 'Tier 3', overheadPct: 0.08, marginPct: 0.05, sourceNote: 'Aluminium extrusion build 2026-10 — commodity profile mill' },
    { id: 'oh-extrusion-t1',        commodityType: 'extrusion',           supplierTier: 'Tier 1', overheadPct: 0.12, marginPct: 0.10, sourceNote: 'Industry benchmark — Tier-1/OEM in-house extrusion (higher overhead, full validation)' },
    { id: 'oh-extrusion-t2',        commodityType: 'extrusion',           supplierTier: 'Tier 2', overheadPct: 0.09, marginPct: 0.07, sourceNote: 'Industry benchmark' },
    { id: 'oh-extrusion-t3',        commodityType: 'extrusion',           supplierTier: 'Tier 3', overheadPct: 0.07, marginPct: 0.05, sourceNote: 'Industry benchmark — high-volume commodity extruder (lean overhead/margin)' },
    { id: 'oh-thermoforming-t1',    commodityType: 'thermoforming',       supplierTier: 'Tier 1', overheadPct: 0.13, marginPct: 0.10, sourceNote: 'Industry benchmark — Tier-1/OEM thermoforming (automotive interior, full validation/PPAP; higher overhead)' },
    { id: 'oh-thermoforming-t2',    commodityType: 'thermoforming',       supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-thermoforming-t3',    commodityType: 'thermoforming',       supplierTier: 'Tier 3', overheadPct: 0.07, marginPct: 0.05, sourceNote: 'Industry benchmark — high-volume packaging thermoformer (roll-fed, lean overhead/margin)' },
    { id: 'oh-rotomoulding-t2',     commodityType: 'rotational_moulding', supplierTier: 'Tier 2', overheadPct: 0.11, marginPct: 0.09, sourceNote: 'Industry benchmark' },
    { id: 'oh-sheet-metal-fab-t2', commodityType: 'sheet_metal_fab',     supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
    { id: 'oh-rubber-t2', commodityType: 'rubber', supplierTier: 'Tier 2', overheadPct: 0.11, marginPct: 0.09, sourceNote: 'Industry benchmark' },
    { id: 'oh-composites-t2',    commodityType: 'composites',     supplierTier: 'Tier 2', overheadPct: 0.14, marginPct: 0.10, sourceNote: 'Industry benchmark' },
    { id: 'oh-wiring-harness-t2',commodityType: 'wiring_harness', supplierTier: 'Tier 2', overheadPct: 0.10, marginPct: 0.08, sourceNote: 'Industry benchmark' },
  ],
};

export function getLibraryFromStorage(): RateLibrary {
  if (typeof localStorage === 'undefined') return DEFAULT_RATE_LIBRARY;
  const stored = localStorage.getItem('shouldCostRateLibrary');
  if (!stored) return DEFAULT_RATE_LIBRARY;
  try {
    return JSON.parse(stored) as RateLibrary;
  } catch {
    return DEFAULT_RATE_LIBRARY;
  }
}

export function saveLibraryToStorage(lib: RateLibrary): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('shouldCostRateLibrary', JSON.stringify(lib));
}

export function recomputeMachineRates(lib: RateLibrary): RateLibrary {
  return {
    ...lib,
    machines: lib.machines.map(m => ({
      ...m,
      computedRatePerHr: computeMachineRateFromBuildup(m.buildup),
    })),
  };
}

const REGION_ALIASES: Record<string, string[]> = {
  UK:          ['uk', 'united kingdom', 'gb', 'great britain'],
  Germany:     ['de', 'germany', 'deutschland'],
  Poland:      ['pl', 'poland', 'polska'],
  China:       ['cn', 'china', 'prc'],
  India:       ['in', 'india'],
  Mexico:      ['mx', 'mexico', 'méxico'],
  Turkey:      ['tr', 'turkey', 'türkiye'],
  Vietnam:     ['vn', 'vietnam', 'viet nam'],
  'South Korea': ['kr', 'korea', 'south korea'],
  Romania:     ['ro', 'romania'],
  EU:          ['eu', 'europe', 'eurozone'],
};

function resolveRegion(input: string): string | null {
  const lower = input.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(REGION_ALIASES)) {
    if (aliases.includes(lower)) return canonical;
  }
  return null;
}

/**
 * Returns a filtered RateLibrary containing only entries for the given region
 * (plus UK entries as fallback where region-specific entries are absent).
 * `region` accepts full name or ISO-2 code (case-insensitive).
 */
export function getRegionalLibrary(region: string): RateLibrary {
  const canonical = resolveRegion(region) ?? region;
  const base = getLibraryFromStorage();

  const machines = base.machines.filter(m => m.region === canonical || m.region === 'UK');
  const labour   = base.labour.filter(l => l.region === canonical || l.region === 'UK');
  const energy   = base.energy.filter(e => e.region === canonical || e.region === 'EU' || e.region === 'UK');

  return {
    ...base,
    machines: machines.length > 0 ? machines : base.machines.filter(m => m.region === 'UK'),
    labour:   labour.length   > 0 ? labour   : base.labour.filter(l => l.region === 'UK'),
    energy:   energy.length   > 0 ? energy   : base.energy.filter(e => e.region === 'UK'),
  };
}
