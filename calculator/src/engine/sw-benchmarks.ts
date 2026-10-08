/**
 * Published software-programme figures — ONE list for the engine's benchmark table and the validation back-test.
 *
 * Status (software review, Oct 2026): NONE of these is verified. No entry carries a link, two carried different source
 * names in the two files that held them, and web checks for two (BMW iX "Berylls 2023", Tesla "Morgan Stanley") found
 * nothing. The published £/vehicle figures are also inconsistent with the published totals over the configured volume
 * and life (BMW iX: £620M ÷ (70k × 9) = £984, listed £4,800). They are kept so the screen can show them, clearly
 * labelled, and so a sourced figure can replace any one of them: set `sourceUrl` and `verified: true`.
 */
export interface SWPublishedProgramme {
  vehicle:             string;
  totalGBP:            number;
  /** As stated by the named source; NOT consistent with totalGBP over the validation config (see above). */
  perVehicleGBP:       number;
  source:              string;
  sourceUrl:           string | null;
  verified:            boolean;
}

const UNVERIFIED = { sourceUrl: null, verified: false } as const;

export const SW_PUBLISHED_PROGRAMMES: SWPublishedProgramme[] = [
  { vehicle: 'BMW iX (2021–2026)',            totalGBP: 620e6, perVehicleGBP: 4_800, source: 'Named as "Berylls Strategy Advisors estimate, 2023" — not found', ...UNVERIFIED },
  { vehicle: 'Porsche Taycan (2019–2024)',    totalGBP: 480e6, perVehicleGBP: 5_200, source: 'Named as "SBD Automotive teardown + SW analysis" — no link', ...UNVERIFIED },
  { vehicle: 'Mercedes EQS (2021–2026)',      totalGBP: 710e6, perVehicleGBP: 5_500, source: 'Named as "analyst estimate" / "McKinsey 2022" (two names in two files) — no link', ...UNVERIFIED },
  { vehicle: 'Range Rover (L460, 2022–2027)', totalGBP: 390e6, perVehicleGBP: 3_800, source: 'Named as "JLR programme estimate" / "JLR investor reports" (two names) — no link', ...UNVERIFIED },
  { vehicle: 'Tesla Model S (Gen 3 HW4)',     totalGBP: 850e6, perVehicleGBP: 3_200, source: 'Named as "Morgan Stanley Research" — not found', ...UNVERIFIED },
  { vehicle: 'Audi Q8 e-tron (2023–2028)',    totalGBP: 520e6, perVehicleGBP: 4_600, source: 'Named as "VW Group Annual Report + EY SW cost model" — no link', ...UNVERIFIED },
  { vehicle: 'Lucid Air (2022–2027)',         totalGBP: 380e6, perVehicleGBP: 7_800, source: 'Named as "Lucid investor notes" — no link', ...UNVERIFIED },
];

/** True when at least one published figure has a source link — peer comparisons are shown only then. */
export const hasVerifiedBenchmark = (): boolean => SW_PUBLISHED_PROGRAMMES.some(p => p.verified && !!p.sourceUrl);
