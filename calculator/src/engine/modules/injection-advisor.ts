import type { DFMSeverity, DFMCategory } from '../dfm-dfa.js';

/**
 * Injection-moulding DFM analyser — parity with the casting / forging /
 * sheet-metal advisers. Flags the geometry and process risks that drive scrap,
 * cycle time and tooling cost on moulded parts: thick/thin walls, non-uniform
 * wall (sink/warp), rib and boss proportioning, draft, undercuts (side actions),
 * weld lines, flow-length/thickness ratio and gate count. Returns a 1–10 score
 * with actionable issues, using the shared severity/category vocabulary.
 */

export type ResinType = 'amorphous' | 'semi_crystalline' | 'filled';

export interface InjectionDFMInputs {
  /** Nominal wall thickness, mm. */
  wallThicknessMm: number;
  /** Thinnest and thickest wall on the part (for uniformity check), mm. */
  minWallMm?: number;
  maxWallMm?: number;
  /** Resin behaviour — semi-crystalline & filled shrink/warp more. */
  resinType?: ResinType;
  /** Rib thickness as a fraction of nominal wall (sink risk > ~0.6). */
  ribThicknessRatio?: number;
  /** Boss outer-wall thickness as a fraction of nominal wall (sink risk > ~0.6). */
  bossWallRatio?: number;
  /** Minimum draft angle on any vertical face, degrees. */
  draftAngleDeg?: number;
  /** Texture depth called up (needs ~1°/0.025 mm draft) — raises draft demand. */
  textured?: boolean;
  /** Number of undercuts requiring side-actions / lifters. */
  undercutCount?: number;
  /** Longest flow path from the gate, mm (flow-length check). */
  flowLengthMm?: number;
  /** Number of gates / drops (weld-line & fill-balance context). */
  gateCount?: number;
  /** True if a weld/knit line falls on a cosmetic or load-bearing region. */
  weldLineOnCriticalFace?: boolean;
  /** Tightest tolerance called up on the part, mm. */
  toleranceMm?: number;
}

export interface InjectionDFMIssue {
  severity: DFMSeverity;
  category: DFMCategory;
  title: string;
  description: string;
  recommendation: string;
}

export interface InjectionDFMResult {
  score: number;   // 1–10, 10 = clean
  issues: InjectionDFMIssue[];
  summary: string;
}

/** Practical injection wall-thickness window (mm) by resin behaviour. */
function wallWindow(resin: ResinType | undefined): { min: number; max: number } {
  if (resin === 'filled') return { min: 1.0, max: 3.5 };          // glass/mineral filled
  if (resin === 'semi_crystalline') return { min: 0.8, max: 3.5 }; // PP/PE/PA/POM
  return { min: 0.8, max: 4.0 };                                   // amorphous ABS/PC/PS
}

/** Max sensible flow-length-to-wall ratio (L/t) before short-shots/high pressure. */
function maxFlowRatio(resin: ResinType | undefined): number {
  if (resin === 'filled') return 150;          // filled resins flow shorter
  if (resin === 'semi_crystalline') return 250;
  return 200;                                   // amorphous
}

export function analyseInjectionDFM(inputs: InjectionDFMInputs): InjectionDFMResult {
  const issues: InjectionDFMIssue[] = [];
  const t = inputs.wallThicknessMm;
  const win = wallWindow(inputs.resinType);

  // 1. Nominal wall thickness inside the mouldable window.
  if (t > 0 && t > win.max) {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: `Wall ${t} mm exceeds ${win.max} mm — thick-section sink & cycle penalty`,
      description: 'Thick walls cool as the square of thickness, stretching cycle time, and shrink internally to form sinks and voids.',
      recommendation: 'Core out the section to a uniform 2–3 mm wall with ribs for stiffness; add gas-assist only if a heavy section is unavoidable.',
    });
  }
  if (t > 0 && t < win.min) {
    issues.push({
      severity: 'major',
      category: 'geometry',
      title: `Wall ${t} mm below ${win.min} mm — short-shot / high-pressure risk`,
      description: 'Walls thinner than the resin can reliably fill cause short shots, high injection pressure and premature freeze-off.',
      recommendation: `Increase wall to ≥ ${win.min} mm, add flow leaders, or move the gate closer to the thin region.`,
    });
  }

  // 2. Wall uniformity — sink & warp from thick/thin transitions.
  if (inputs.minWallMm !== undefined && inputs.maxWallMm !== undefined && inputs.minWallMm > 0) {
    const ratio = inputs.maxWallMm / inputs.minWallMm;
    if (ratio > 2.0) {
      const semiOrFilled = inputs.resinType === 'semi_crystalline' || inputs.resinType === 'filled';
      issues.push({
        severity: semiOrFilled ? 'critical' : 'major',
        category: 'geometry',
        title: `Wall varies ${ratio.toFixed(1)}× (${inputs.minWallMm}–${inputs.maxWallMm} mm) — differential shrink`,
        description: semiOrFilled
          ? 'Semi-crystalline / filled resins shrink strongly and unevenly; a >2× wall variation warps the part and cracks at transitions.'
          : 'Uneven walls cool at different rates, causing sink marks on the thick side and internal stress at the transition.',
        recommendation: 'Hold wall within ±25% of nominal; blend transitions over ≥3×wall and relocate mass into ribs rather than solid sections.',
      });
    }
  }

  // 3. Rib thickness — sink on the show face.
  if (inputs.ribThicknessRatio !== undefined && inputs.ribThicknessRatio > 0.6) {
    issues.push({
      severity: inputs.ribThicknessRatio > 0.8 ? 'major' : 'minor',
      category: 'geometry',
      title: `Rib ${(inputs.ribThicknessRatio * 100).toFixed(0)}% of wall — visible sink`,
      description: 'A rib thicker than ~60% of the nominal wall pulls a sink mark on the opposite (show) face as it shrinks.',
      recommendation: 'Thin ribs to 40–60% of nominal wall; if strength needs more, use multiple thin ribs or a gusset rather than one thick rib.',
    });
  }

  // 4. Boss wall — sink & voids.
  if (inputs.bossWallRatio !== undefined && inputs.bossWallRatio > 0.6) {
    issues.push({
      severity: 'minor',
      category: 'geometry',
      title: `Boss wall ${(inputs.bossWallRatio * 100).toFixed(0)}% of nominal — sink risk`,
      description: 'A boss joined to the wall at >60% thickness sinks and traps gas at the base.',
      recommendation: 'Set boss outer wall to ~60% of nominal, connect with ribs, and cored to a uniform thickness; add a base radius.',
    });
  }

  // 5. Draft angle — ejection drag / scuffing.
  if (inputs.draftAngleDeg !== undefined) {
    const minDraft = inputs.textured ? 3 : 1;   // textured faces need ~1°/0.025 mm depth
    if (inputs.draftAngleDeg < minDraft) {
      issues.push({
        severity: inputs.draftAngleDeg <= 0 ? 'critical' : 'major',
        category: 'geometry',
        title: `Draft ${inputs.draftAngleDeg}° below ${minDraft}° minimum${inputs.textured ? ' (textured)' : ''}`,
        description: inputs.draftAngleDeg <= 0
          ? 'Zero/negative draft means the part cannot release — it drags, scuffs and jams on ejection.'
          : 'Insufficient draft scuffs walls, needs high ejection force and marks textured surfaces.',
        recommendation: `Add ≥ ${minDraft}° draft to all vertical faces (more for deep or textured walls); increase toward 5° for heavy grain.`,
      });
    }
  }

  // 6. Undercuts — side-action / lifter tooling cost.
  if (inputs.undercutCount !== undefined && inputs.undercutCount > 0) {
    issues.push({
      severity: inputs.undercutCount > 2 ? 'major' : 'minor',
      category: 'tooling',
      title: `${inputs.undercutCount} undercut${inputs.undercutCount === 1 ? '' : 's'} need side-actions / lifters`,
      description: 'Each undercut adds a slide or lifter — raising tool cost, maintenance and cycle time, and capping cavitation.',
      recommendation: 'Design out undercuts with pass-through cores / bump-offs where the resin allows, or consolidate them onto one moving side.',
    });
  }

  // 7. Flow length vs wall — fill / short-shot.
  if (inputs.flowLengthMm !== undefined && t > 0) {
    const ratio = inputs.flowLengthMm / t;
    const maxRatio = maxFlowRatio(inputs.resinType);
    if (ratio > maxRatio) {
      issues.push({
        severity: 'major',
        category: 'process',
        title: `Flow-length/wall ${ratio.toFixed(0)} exceeds ~${maxRatio} (L/t)`,
        description: 'Beyond the resin\'s L/t limit the melt freezes before filling — short shots, high pressure and weak weld lines.',
        recommendation: 'Add gates to shorten each flow path, thicken flow leaders, or select a higher-flow (higher-MFI) grade.',
      });
    }
  }

  // 8. Weld line on a critical face.
  if (inputs.weldLineOnCriticalFace) {
    issues.push({
      severity: 'major',
      category: 'process',
      title: 'Weld/knit line on a cosmetic or load-bearing face',
      description: 'Weld lines are visible witness marks and carry 10–60% less strength — a liability on show surfaces and structural regions.',
      recommendation: 'Relocate the gate to move the weld line off the critical area, raise melt/mould temperature, or add an overflow well.',
    });
  }

  // 9. Tight tolerance for moulding.
  if (inputs.toleranceMm !== undefined && inputs.toleranceMm > 0 && inputs.toleranceMm < 0.10) {
    const filled = inputs.resinType === 'filled';
    issues.push({
      severity: inputs.toleranceMm < 0.05 ? 'major' : 'minor',
      category: 'tolerance',
      title: `Tolerance ±${inputs.toleranceMm} mm is tight for moulding`,
      description: filled
        ? 'Sub-0.1 mm tolerances fight anisotropic shrink in glass-filled resin — hard to hold without tool tuning and controlled conditions.'
        : 'Sub-0.1 mm tolerances on moulded features fight shrinkage and process drift, driving scrap and inspection.',
      recommendation: 'Relax to ±0.1–0.2 mm where function allows, datum critical features together, or add a post-mould machining step only on the critical dimension.',
    });
  }

  let score = 10;
  for (const i of issues) {
    score -= i.severity === 'critical' ? 3 : i.severity === 'major' ? 1.5 : i.severity === 'minor' ? 0.5 : 0;
  }
  score = Math.max(1, Math.round(score));

  const summary = issues.length === 0
    ? 'No injection DFM issues flagged; geometry is within reference moulding guidelines.'
    : `${issues.length} injection DFM issue${issues.length === 1 ? '' : 's'} — ${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major.`;

  return { score, issues, summary };
}
