/**
 * Aluminium casting heat treatment (T6 / T5) as a STATION build-up — ESTIMATE, grade D (gravity research round, 5 Nov
 * 2026: scripts/research/2026-11-gravity-lpdc/data.json rows H1–H3). It replaced a flat £1.10/kg (engineering-typical,
 * not sourced) that every other country took × a STEEL quench-and-temper ratio (`heatTreatServiceFactor`), which is not
 * an aluminium T6: in China it priced ¥4.59/kg against the research's bottom-up ¥1.0–2.0/kg.
 *
 * No toll price was found in any country, so the station is built up from one published furnace set (H1, a Chinese
 * dealer's T6 drop-bottom solution / quench furnace + ageing furnace, its specification and price) and priced in the
 * COSTED country's own book: the kWh go to the core as electricity (its tariff), the furnace operator is an operation at
 * its foundry furnace labour rate, and the furnace capital — a traded machine, priced the same everywhere (at par) — is a
 * £ a kg. The UK figure comes from the same build-up. Baskets, quench water and its treatment are NOT costed (no figure).
 */
import { serviceUk } from './service-rates.js';
import { fmt } from './cost-input-rules/types.js';

export type AlHeatTreatment = 'T6' | 'T5';

/** H1 — Nanjing Boqiao T6 set, Made-in-China product page (C, read 5 Nov 2026). */
export const AL_HT_FURNACE = {
  /** Solution / quench furnace: 150 + 7.5 + 5.5 kW, 1.5 t load, empty heat-up 2.5 h (H1). */
  solutionKw: 150 + 7.5 + 5.5,
  solutionHeatUpHr: 2.5,
  /** Ageing furnace CR-45-3: 30 kW, 1.5 t, empty heat-up 1.5 h (H1). */
  ageKw: 30,
  ageHeatUpHr: 1.5,
  grossLoadT: 1.5,
  /** US$40,000–60,000 a set; the midpoint at the book FX £1 = US$1.3344 (research FX) = £37,470. */
  setUsd: [40_000, 60_000] as const,
  usdPerGbp: 1.3344,
  source: 'H1 — Nanjing Boqiao "aluminum quenching furnace T6 heat treatment" set, Made-in-China product page: solution / quench '
    + 'furnace 150 + 7.5 + 5.5 kW, 1.5 t, empty heat-up 2.5 h; ageing furnace 30 kW, 1.5 t, empty heat-up 1.5 h; US$40,000–60,000 a set (C)',
} as const;

/** The judgements of the build-up (grade D — H3's assumptions, each stated). */
export const AL_HT_ASSUMPTIONS = {
  /** A356 / LM25 T6: solution ~6 h soak at ~540 °C, age ~5 h at ~155 °C — ASM-typical, not read this round. */
  solutionSoakHr: 6,
  ageSoakHr: 5,
  /** Net castings a load: 1.0 t of the 1.5 t gross (baskets and fixtures the rest) — H3, D. */
  netLoadKg: 1000,
  /** Average draw over the cycle, 60 % of rated — the midpoint of H3's 55–65 %, D. */
  drawShare: 0.60,
  /** Loads a year the furnace capital is spread over — H3, D (≈ 5,500 h of the solution furnace at 8.5 h a load). */
  loadsPerYear: 650,
  /** Capital life — H3. */
  lifeYears: 10,
  /** Maintenance, % of capex a year — the library's own line build-up rule (3.5 %). */
  maintenancePct: 0.035,
  /** One furnace operator for the load cycle of the pacing furnace — H3, D. */
  operators: 1,
  labourId: 'lab-uk-furnace',
} as const;

export interface AlHeatTreatStation {
  treatment: AlHeatTreatment;
  /** Electricity, kWh a kg of castings. */
  kwhPerKg: number;
  /** Furnace-operator hours a kg of castings. */
  labourHrPerKg: number;
  labourId: string;
  /** Furnace capital + maintenance, £ a kg (a traded machine at par in every book). */
  capitalGbpPerKg: number;
  /** The arithmetic, every step. */
  basis: string;
}

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** The T6 (solution + quench + age) or T5 (age only) station, per kg of castings. */
export function alHeatTreatStation(t: AlHeatTreatment): AlHeatTreatStation {
  const F = AL_HT_FURNACE, A = AL_HT_ASSUMPTIONS;
  // £ a set: the active book's `heat-treat.al-furnace-set` row (rates flow R2; built-in = the US$ midpoint ÷ the FX above)
  const setGbp = serviceUk('heat-treat.al-furnace-set');
  const solHr = F.solutionHeatUpHr + A.solutionSoakHr;
  const ageHr = F.ageHeatUpHr + A.ageSoakHr;
  const solKwh = F.solutionKw * solHr * A.drawShare;
  const ageKwh = F.ageKw * ageHr * A.drawShare;
  const t6 = t === 'T6';
  const kwhLoad = (t6 ? solKwh : 0) + ageKwh;
  const kwhPerKg = r6(kwhLoad / A.netLoadKg);
  // The pacing furnace sets the load cycle the operator tends: the solution furnace on T6, the ageing furnace on T5.
  const paceHr = t6 ? solHr : ageHr;
  const labourHrPerKg = r6(A.operators * paceHr / A.netLoadKg);
  // T5 uses the ageing furnace only: its share of the set by rated kW (engineering-typical split — the set is priced whole).
  const kwShare = t6 ? 1 : F.ageKw / (F.solutionKw + F.ageKw);
  const capex = setGbp * kwShare;
  const annual = capex / A.lifeYears + capex * A.maintenancePct;
  const capitalGbpPerKg = r6(annual / (A.loadsPerYear * A.netLoadKg));
  const what = t6 ? 'T6 (solution + quench + age)' : 'T5 (artificial age only)';
  const basis = `ESTIMATE (grade D — a build-up, no toll price was found in any country): ${what} on a batch furnace set — ${F.source}. `
    + `Energy: ${t6 ? `solution ${fmt(F.solutionKw, 1)} kW × (${F.solutionHeatUpHr} h heat-up + ${A.solutionSoakHr} h soak) × ${A.drawShare} = ${fmt(solKwh, 1)} kWh + ` : ''}`
    + `age ${F.ageKw} kW × (${F.ageHeatUpHr} h + ${A.ageSoakHr} h) × ${A.drawShare} = ${fmt(ageKwh, 1)} kWh = ${fmt(kwhLoad, 1)} kWh a load ÷ `
    + `${A.netLoadKg.toLocaleString('en-GB')} kg net = ${kwhPerKg} kWh/kg of electricity, priced at the costed country's tariff. `
    + `Furnace operator: ${A.operators} for the ${fmt(paceHr, 1)} h ${t6 ? 'solution' : 'ageing'} load cycle ÷ ${A.netLoadKg.toLocaleString('en-GB')} kg = `
    + `${labourHrPerKg} h/kg at the costed country's furnace-operator rate. Capital: US$${F.setUsd[0].toLocaleString('en-GB')}–${F.setUsd[1].toLocaleString('en-GB')} `
    + `midpoint ÷ ${F.usdPerGbp} $/£ = £${setGbp.toLocaleString('en-GB')}${t6 ? ' (the set)' : ` × ${fmt(kwShare, 4)} (the ageing furnace's share by rated kW, engineering-typical)`} `
    + `= £${Math.round(capex).toLocaleString('en-GB')}; £${Math.round(capex).toLocaleString('en-GB')} ÷ ${A.lifeYears} yr + ${(A.maintenancePct * 100).toFixed(1)} % of it for maintenance a year (the library's line build-up rule) = £${fmt(annual, 2)} a year ÷ `
    + `(${A.loadsPerYear} loads × ${A.netLoadKg.toLocaleString('en-GB')} kg) = £${capitalGbpPerKg}/kg — a traded machine, at par in every country. `
    + `Judgements (grade D): ${A.solutionSoakHr} h solution soak and ${A.ageSoakHr} h age (ASM-typical A356 cycle, not read this round), `
    + `${A.netLoadKg.toLocaleString('en-GB')} kg net of the ${F.grossLoadT} t gross load, ${A.drawShare * 100} % average draw (55–65 %), `
    + `${A.loadsPerYear} loads a year. Baskets, quench water and its treatment are NOT costed (no figure). `
    + 'A heat treater\'s £/kg typed as the heat-treat cost replaces the station';
  return { treatment: t, kwhPerKg, labourHrPerKg, labourId: A.labourId, capitalGbpPerKg, basis };
}

/** The station's £ a kg in a book: kWh × tariff + operator h × rate ÷ labour efficiency + capital (for a reader's check). */
export function alHeatTreatGbpPerKg(s: AlHeatTreatStation, electricityPerKwh: number, labourRatePerHr: number, labourEfficiency = 1): number {
  return s.kwhPerKg * electricityPerKwh + s.labourHrPerKg * labourRatePerHr / labourEfficiency + s.capitalGbpPerKg;
}
