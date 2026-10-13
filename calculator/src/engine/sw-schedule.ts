/**
 * Software schedule and staffing (Chief Engineer review, Oct 2026 — the benchmark's #1 gap: SEER, SLIM and COCOMO all
 * give a duration and a team size; CostVision gave neither, and its "average FTE" divided development effort by the
 * PRODUCTION life).
 *
 * Duration per module: COCOMO II.2000 schedule equation, TDEV = C × PM^F, F = D + 0.2 × (E − B), with C = 3.67,
 * D = 0.28, B = 0.91 and E the nominal effort exponent 1.0997 (Boehm et al., COCOMO II Model Definition Manual
 * v2000.0, §"Schedule estimation"; the manual's worked example gives 29.7 months for 586.6 PM at E = 1.15 — tested).
 * PM is the module's costed engineering effort (development + test + integration + cyber + calibration).
 *
 * Programme: the modules are taken to be developed in PARALLEL by their own teams (CostVision assumption, stated), so
 * the longest module sets the minimum duration; the average team is all effort ÷ the development window. No staffing
 * curve is drawn: the Norden–Rayleigh curve was not built for software and Putnam's equation is disputed (benchmark
 * G §5) — we print the two numbers the sources support.
 */

import { SW_COCOMO_EXPONENT, SW_DEFAULT_DEVELOPMENT_MONTHS, type SWProgramResult } from './sw-should-cost.js';

export const COCOMO_SCHEDULE = { C: 3.67, D: 0.28, B: 0.91,
  source: 'Boehm et al., COCOMO II Model Definition Manual v2000.0 (USC CSE) — TDEV = 3.67 × PM^(0.28 + 0.2 × (E − 0.91))' } as const;

/** COCOMO II.2000 nominal development schedule, months, for `pm` person-months at effort exponent `e`. */
export function cocomoTdevMonths(pm: number, e: number = SW_COCOMO_EXPONENT): number {
  if (!(pm > 0)) return 0;
  return COCOMO_SCHEDULE.C * Math.pow(pm, COCOMO_SCHEDULE.D + 0.2 * (e - COCOMO_SCHEDULE.B));
}

export interface SWScheduleRow {
  moduleId:   string;
  name:       string;
  effortPM:   number;
  tdevMonths: number;
  /** Average team on the module over its own duration: effort ÷ TDEV. */
  avgStaff:   number;
}

export interface SWSchedule {
  rows:               SWScheduleRow[];       // longest first
  longestMonths:      number;
  longestModule:      string;
  developmentMonths:  number;
  /** All costed effort ÷ the development window — the average engineering headcount the programme carries. */
  averageTeam:        number;
  /** Modules whose COCOMO duration exceeds the development window: they need more parallel staff than nominal
   *  (schedule compression) or an earlier start. */
  overrunning:        string[];
  basis:              string;
}

export function swSchedule(result: SWProgramResult): SWSchedule {
  const devMonths = result.inputs.developmentMonths ?? SW_DEFAULT_DEVELOPMENT_MONTHS;
  const rows = result.modules
    .filter(m => m.effortPersonMonths > 0)
    .map(m => {
      const tdev = cocomoTdevMonths(m.effortPersonMonths);
      return { moduleId: m.moduleId, name: m.moduleName, effortPM: m.effortPersonMonths, tdevMonths: tdev,
        avgStaff: tdev > 0 ? m.effortPersonMonths / tdev : 0 };
    })
    .sort((a, b) => b.tdevMonths - a.tdevMonths);
  const total = result.summary.totalEffortPersonMonths;
  return {
    rows,
    longestMonths: rows[0]?.tdevMonths ?? 0,
    longestModule: rows[0]?.name ?? '—',
    developmentMonths: devMonths,
    averageTeam: devMonths > 0 ? total / devMonths : 0,
    overrunning: rows.filter(r => r.tdevMonths > devMonths).map(r => r.name),
    basis: `${COCOMO_SCHEDULE.source}; E = ${SW_COCOMO_EXPONENT.toFixed(4)} (nominal scale factors). Modules in parallel `
      + '(CostVision assumption); average team = all effort ÷ the development window.',
  };
}
