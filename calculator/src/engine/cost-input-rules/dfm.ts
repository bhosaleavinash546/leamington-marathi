/**
 * DFM from the measurement instead of from typing.
 *
 * Ten `analyse*DFM` functions exist in `modules/*-advisor.ts`. Nine are already
 * wired into the browser — and every one of them from a **manual advisor
 * button** that reads hand-entered fields (`#sm-adv-bends`, `#forge-adv-web`)
 * and paints the result into a side panel. `analyseCastingDFM` has no
 * production caller at all. None of them has ever seen a measurement, and none
 * of their output has ever reached the analysis or the report.
 *
 * The kernel already measures what most of them want: minimum and maximum wall,
 * draft angle, bend count, undercut faces, hole diameters, the envelope. So
 * this feeds them from geometry and puts the result where the report reads it.
 *
 * ## What it deliberately leaves alone
 *
 * Each analyser takes more inputs than the kernel can supply — a tolerance
 * callout, whether a weld line falls on a critical face, whether a gasket's
 * flash line sits on the sealing surface. Those are drawing and function
 * questions, not shapes. They are simply not passed, and the analysers already
 * treat an absent optional input as "do not run that check" rather than as a
 * zero. An unrun check produces no issue, which is correct: the alternative is
 * a fabricated input generating a fabricated warning.
 *
 * That does mean the issue list is a floor, not a ceiling, and
 * `analysisLimitations` says so.
 */
import type { DFMIssue, OCCTGeometry } from '../ai-analysis.js';
import type { RuleContext } from './types.js';
import { analyseCastingDFM, type CastingProcess } from '../modules/casting-advisor.js';
import { analyseForgingDFM, type ForgingProcess } from '../modules/forging-advisor.js';
import { analyseSheetMetalDFM, type SMMaterialFamily } from '../modules/sheet-metal-advisor.js';
import { analyseInjectionDFM } from '../modules/injection-advisor.js';
import { analyseBlowDFM, type BlowProcess } from '../modules/blow-advisor.js';
import { analyseThermoformingDFM, thermoformFamilyOf, type ThermoformMethod } from '../modules/thermoforming-advisor.js';
import { analyseRotoDFM, type RotoMaterialFamily } from '../modules/roto-advisor.js';
import { analyseRubberDFM, type RubberCompoundFamily } from '../modules/rubber-advisor.js';

/** The advisors' four-level severity, mapped onto the report's. */
function mapSeverity(s: string): DFMIssue['severity'] {
  return s === 'critical' ? 'Critical' : s === 'major' ? 'High' : s === 'minor' ? 'Medium' : 'Low';
}

interface AdvisorIssue {
  severity: string; category?: string; title: string;
  description: string; recommendation: string;
}

function toDFM(issues: AdvisorIssue[]): DFMIssue[] {
  return issues.map(i => ({
    severity: mapSeverity(i.severity),
    area: i.category ?? 'geometry',
    description: `${i.title} — ${i.description}`,
    impact: i.title,
    fix: i.recommendation,
  }));
}

/**
 * Draft angle, measured.
 *
 * The kernel classifies faces rather than reporting an angle, so this reads the
 * classification: any zero-draft face means the minimum draft on the part is
 * effectively 0°, which is what every analyser's draft check is looking for.
 * With no analysis at all, return undefined so the check does not run.
 */
function draftDeg(geo: OCCTGeometry): number | undefined {
  const d = geo.draftAnalysis;
  if (!d || d.analyzedFaceCount === 0) return undefined;
  if ((d.undercutFaceCount ?? 0) > 0) return -1;      // an undercut is negative draft
  if ((d.zeroDraftFaceCount ?? 0) > 0) return 0;
  return 2;   // every analysed face carried at least 1° — the kernel's own bar
}

/** Smallest measured hole, for the punch/drill checks. */
function minHoleDiaMm(geo: OCCTGeometry): number | undefined {
  const holes = (geo.featureTable ?? []).filter(r => r.kind === 'hole' && r.diaMm > 0);
  return holes.length ? Math.min(...holes.map(r => r.diaMm)) : undefined;
}

const sorted = (geo: OCCTGeometry): [number, number, number] => {
  const bb = geo.boundingBox;
  if (!bb) return [0, 0, 0];
  const [a, b, c] = [bb.xMm, bb.yMm, bb.zMm].sort((x, y) => y - x);
  return [a, b, c];
};

/**
 * Run the right analyser for the commodity, from the measurement.
 *
 * `chosen` is what the rules decided — the casting subtype, the forging route,
 * the resin — so the DFM check is run against the process that was actually
 * costed rather than a default.
 */
export function analyseDFMFromGeometry(
  ctx: RuleContext,
  chosen: { process?: string; materialFamily?: string; compoundFamily?: string; materialId?: string },
): DFMIssue[] {
  const geo = ctx.geo;
  const w = geo.wallThickness;
  const minWall = w?.minMm;
  const maxWall = w?.maxMm;
  const meanWall = w?.meanMm;
  const draft = draftDeg(geo);
  const [maxDim, midDim, minDim] = sorted(geo);
  const undercuts = geo.draftAnalysis?.undercutFaceCount ?? 0;

  try {
    switch (ctx.commodity) {
      case 'casting':
      case 'cast_and_machine':
        if (minWall == null || maxWall == null || draft == null) return [];
        return toDFM(analyseCastingDFM({
          process: (chosen.process ?? 'hpdc') as CastingProcess,
          minWallThicknessMm: minWall,
          maxWallThicknessMm: maxWall,
          draftAngleDeg: draft,
          maxSectionRatio: minWall > 0 ? maxWall / minWall : undefined,
        }).issues);

      case 'forging':
        if (minWall == null || draft == null) return [];
        return toDFM(analyseForgingDFM({
          process: (chosen.process ?? 'closed-die') as ForgingProcess,
          minWebThicknessMm: minWall,
          draftAngleDeg: draft,
        }).issues);

      case 'sheet_metal':
      case 'sheet_metal_fab': {
        const gauge = geo.sheetMetal?.thicknessMm ?? minWall;
        if (!gauge) return [];
        return toDFM(analyseSheetMetalDFM({
          thicknessMm: gauge,
          materialFamily: (chosen.materialFamily === 'aluminium' ? 'aluminium' : 'steel') as SMMaterialFamily,
          bendCount: geo.sheetMetal?.bendCount,
          minHoleDiameterMm: minHoleDiaMm(geo),
        }).issues);
      }

      case 'injection_moulding':
        if (meanWall == null) return [];
        return toDFM(analyseInjectionDFM({
          wallThicknessMm: meanWall,
          minWallMm: minWall,
          maxWallMm: maxWall,
          draftAngleDeg: draft,
          undercutCount: undercuts,
          // Flow length from the gate is unknown; the longest dimension is the
          // worst case and the only measurement that bounds it.
          flowLengthMm: maxDim || undefined,
        }).issues);

      case 'blow_moulding':
        if (meanWall == null) return [];
        return toDFM(analyseBlowDFM({
          process: (chosen.process ?? 'ebm') as BlowProcess,
          wallThicknessMm: meanWall,
          parisonLtoD: midDim > 0 ? maxDim / midDim : undefined,
        }).issues);

      case 'thermoforming':
        if (meanWall == null) return [];
        return toDFM(analyseThermoformingDFM({
          family: thermoformFamilyOf(chosen.materialId ?? ''),
          method: (chosen.process ?? 'vacuum') as ThermoformMethod,
          sheetThicknessMm: meanWall,
          depthMm: minDim || undefined,
          minOpeningMm: midDim || undefined,
          unsupportedSpanMm: maxDim || undefined,
          draftAngleDeg: draft,
          hasUndercut: undercuts > 0,
        }).issues);

      case 'rotational_moulding':
        if (meanWall == null) return [];
        return toDFM(analyseRotoDFM({
          wallThicknessMm: meanWall,
          material: (chosen.materialFamily ?? 'pe') as RotoMaterialFamily,
          draftAngleDeg: draft,
          flatUnsupportedSpanMm: maxDim || undefined,
        }).issues);

      case 'rubber': {
        const section = maxWall ?? meanWall;
        if (section == null) return [];
        return toDFM(analyseRubberDFM({
          compoundFamily: chosen.compoundFamily as RubberCompoundFamily | undefined,
          thicknessMm: section,
          minWallMm: minWall,
          maxWallMm: maxWall,
          draftAngleDeg: draft,
          undercutCount: undercuts,
        }).issues);
      }

      default:
        // machining and composites have no DFM analyser in the tree. Returning
        // nothing is honest; `analysisLimitations` distinguishes it from a clean
        // bill of health.
        return [];
    }
  } catch {
    // An analyser throwing must not take the costing down with it.
    return [];
  }
}

/** Commodities that have an analyser at all — so "no issues" can be qualified. */
export const DFM_ANALYSED_COMMODITIES = new Set([
  'casting', 'cast_and_machine', 'forging', 'sheet_metal', 'sheet_metal_fab',
  'injection_moulding', 'blow_moulding', 'thermoforming', 'rotational_moulding', 'rubber',
]);
