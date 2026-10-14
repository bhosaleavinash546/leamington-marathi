/**
 * Software effort calibration to the user's own completed work (software review P2 #21, Oct 2026).
 *
 * The commercial estimating tools all let a team feed back what its finished modules actually took; CostVision did this
 * for parts (calibration.ts) but not for software. Here an engineer logs, per finished module, the settings it was built
 * at (ASIL, complexity, reuse) and the engineering effort it actually took. The model re-estimates each one ALONE at those
 * settings, uncalibrated, and the factor is the ratio of sums:
 *
 *     factor = Σ actual person-months ÷ Σ modelled person-months      (n = modules logged)
 *
 * Ratio of sums, not the mean of ratios: a large module counts in proportion to its size, and one tiny module with a
 * wild ratio cannot swing the factor. The factor is applied only when the user chooses to (`effortCalibration`); with
 * fewer than 3 modules it is reported as indicative. Effort is compared, not £ — the user's actuals carry their own
 * rates, which the rate book already handles.
 *
 * "Person-months" here is ALL engineering effort the model costs for the module: development + test + integration +
 * cybersecurity + calibration (effortPersonMonths), so log the module's whole engineering effort.
 */
import { computeSWProgram, defaultSWProgramInputs, SW_MODULES } from './sw-should-cost.js';
import type { ASILLevel, SWComplexity, SWReuse, SWProgramInputs } from './sw-should-cost.js';

export interface SWEffortActual {
  moduleId:           string;
  asil:               ASILLevel;
  complexity:         SWComplexity;
  reuse:              SWReuse;
  /** All engineering effort the finished module took, person-months. */
  actualPersonMonths: number;
  /** Free text: project / vehicle it came from. */
  project?:           string;
  /** Its size, KSLOC, when known: the model then estimates it from the COCOMO II size path, so a size-based estimate
   *  is calibrated against like (P3 #16). */
  sizeKSLOC?:         number;
}

export interface SWCalibrationRow extends SWEffortActual { modelledPersonMonths: number; ratio: number }

export interface SWCalibrationResult {
  n:                 number;
  /** Σ actual ÷ Σ modelled; null with no usable rows. */
  factor:            number | null;
  sumActualPM:       number;
  sumModelledPM:     number;
  rows:              SWCalibrationRow[];
  /** Plain-language caveats (few points, wide spread, out of the accepted range). */
  warnings:          string[];
}

/** What the model estimates for this module alone at these settings, uncalibrated (effort person-months). */
export function modelledEffortPM(a: Pick<SWEffortActual, 'moduleId' | 'asil' | 'complexity' | 'reuse' | 'sizeKSLOC'>): number {
  const prog = defaultSWProgramInputs();
  prog.powertrain = undefined;
  prog.effortCalibration = undefined;
  prog.scheduleCompression = undefined;
  prog.platformAnnualVolume = undefined;
  prog.modules = prog.modules.map(m => m.moduleId === a.moduleId
    ? { ...m, enabled: true, asil: a.asil, complexity: a.complexity, reuse: a.reuse, customPersonMonths: null,
        ...(a.sizeKSLOC ? { sizeKSLOC: a.sizeKSLOC } : {}) }
    : { ...m, enabled: false });
  const r = computeSWProgram(prog, { summaryOnly: true });
  return r.summary.totalEffortPersonMonths;
}

export function calibrateSWEffort(actuals: SWEffortActual[]): SWCalibrationResult {
  const known = new Set(SW_MODULES.map(m => m.id));
  const rows: SWCalibrationRow[] = actuals
    .filter(a => known.has(a.moduleId) && Number.isFinite(a.actualPersonMonths) && a.actualPersonMonths > 0)
    .map(a => {
      const modelledPersonMonths = modelledEffortPM(a);
      return { ...a, modelledPersonMonths, ratio: modelledPersonMonths > 0 ? a.actualPersonMonths / modelledPersonMonths : NaN };
    })
    .filter(r => r.modelledPersonMonths > 0);
  const sumActualPM = rows.reduce((t, r) => t + r.actualPersonMonths, 0);
  const sumModelledPM = rows.reduce((t, r) => t + r.modelledPersonMonths, 0);
  const factor = rows.length && sumModelledPM > 0 ? sumActualPM / sumModelledPM : null;
  const warnings: string[] = [];
  if (actuals.length > rows.length) warnings.push(`${actuals.length - rows.length} logged row(s) ignored (unknown module or no effort).`);
  if (rows.length > 0 && rows.length < 3) warnings.push(`Only ${rows.length} module(s) logged — treat the factor as indicative until there are at least 3.`);
  if (rows.length >= 2) {
    const ratios = rows.map(r => r.ratio);
    const lo = Math.min(...ratios), hi = Math.max(...ratios);
    if (hi / lo > 3) warnings.push(`The modules disagree widely (actual ÷ model from ${lo.toFixed(2)} to ${hi.toFixed(2)}) — check the settings each was logged at before applying one factor.`);
  }
  if (factor !== null && (factor < 0.2 || factor > 5)) warnings.push(`A factor of ${factor.toFixed(2)} is outside 0.2–5 and cannot be applied: the logged effort and the model are not describing the same work.`);
  return { n: rows.length, factor, sumActualPM, sumModelledPM, rows, warnings };
}

// ── Bulk actuals: a template of the modules in scope, filled in and read back (improvement round, 14 Oct 2026) ──────

const CSV_HEAD = ['module_id', 'module_name', 'asil', 'complexity', 'reuse', 'size_ksloc', 'actual_person_months', 'project'];
const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** A CSV the engineering team fills in: one row per catalogue module in scope, at the settings this programme costs it,
 *  with the actual effort column blank. Your own modules are left out (they carry your effort already). */
export function actualsTemplateCsv(prog: Pick<SWProgramInputs, 'modules'>): string {
  const rows = prog.modules.filter(m => m.enabled && SW_MODULES.some(d => d.id === m.moduleId)).map(m => {
    const d = SW_MODULES.find(x => x.id === m.moduleId)!;
    return [m.moduleId, d.name, m.asil, m.complexity, m.reuse, m.sizeKSLOC ?? '', '', ''].map(q).join(',');
  });
  return [CSV_HEAD.join(','), ...rows].join('\n') + '\n';
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
    else if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** Read a filled template back. A row with no actual effort is skipped (not filled in); a row that cannot be costed is
 *  reported with its line number and never guessed. */
export function parseActualsCsv(text: string): { actuals: SWEffortActual[]; notFilled: number; problems: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  const problems: string[] = [];
  if (!lines.length) return { actuals: [], notFilled: 0, problems: ['The file is empty.'] };
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const col = (n: string) => head.indexOf(n);
  for (const n of ['module_id', 'asil', 'complexity', 'reuse', 'actual_person_months']) if (col(n) < 0) problems.push(`Missing column "${n}" — use the template.`);
  if (problems.length) return { actuals: [], notFilled: 0, problems };
  const known = new Set(SW_MODULES.map(m => m.id));
  const ASILS = ['QM', 'A', 'B', 'C', 'D'], CPLX = ['Low', 'Medium', 'High', 'Very High'], REUSE = ['Fresh', 'Light', 'Medium', 'Heavy', 'Platform'];
  const actuals: SWEffortActual[] = []; let notFilled = 0;
  lines.slice(1).forEach((l, i) => {
    const c = splitCsvLine(l), line = i + 2;
    const pmRaw = c[col('actual_person_months')] ?? '';
    if (pmRaw === '') { notFilled++; return; }
    const pm = Number(pmRaw), id = c[col('module_id')], asil = c[col('asil')], cx = c[col('complexity')], reuse = c[col('reuse')];
    const kRaw = col('size_ksloc') >= 0 ? c[col('size_ksloc')] ?? '' : '', k = Number(kRaw);
    if (!known.has(id)) { problems.push(`Line ${line}: unknown module "${id}".`); return; }
    if (!(pm > 0 && pm <= 100_000)) { problems.push(`Line ${line}: actual effort "${pmRaw}" is not a positive number of person-months.`); return; }
    if (!ASILS.includes(asil) || !CPLX.includes(cx) || !REUSE.includes(reuse)) { problems.push(`Line ${line}: ASIL / complexity / reuse "${asil} / ${cx} / ${reuse}" is not one of the tool's settings.`); return; }
    if (kRaw !== '' && !(k >= 0.1 && k <= 10_000)) { problems.push(`Line ${line}: size "${kRaw}" must be 0.1–10,000 KSLOC or blank.`); return; }
    actuals.push({ moduleId: id, asil: asil as ASILLevel, complexity: cx as SWComplexity, reuse: reuse as SWReuse, actualPersonMonths: pm,
      ...(kRaw !== '' ? { sizeKSLOC: k } : {}), ...(col('project') >= 0 && c[col('project')] ? { project: c[col('project')] } : {}) });
  });
  return { actuals, notFilled, problems };
}
