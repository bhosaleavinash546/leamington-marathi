/**
 * Casting DFM, measured per feature.
 *
 * What this replaces: the entire casting block in `dfm-dfa.ts` is two rules —
 * "die cost > 18% of part cost" and "material < 35%, verify alloy grade". Both
 * are cost-ratio observations. Neither is casting DFM, and neither can name a
 * face. A foundry engineer asks about draft, section transitions, hot spots,
 * fillets and cores; that is what is here.
 *
 * Thresholds are published figures, cited per rule. Where a source gives a band
 * rather than a number the midpoint is used and the note says so.
 */
import type { GeometricRule, PartContext, ManufacturingFeature } from '../types.js';
import { finding, plausibleWall, isBlend, undercutEvidence, onMachinedFace } from '../types.js';
import { coredAbove } from './machining.js';
import { featureMinutesEach, nearNetHoleMinutes } from '../../feature-machining.js';

/**
 * Minimum draft by casting route, degrees per side, on an external wall.
 *
 * NADCA publishes 1/2°–1° for die casting on external surfaces; sand casting
 * guidance is 1°–3°; investment tolerates the least because the pattern is
 * consumed. The lower bound of each published band is used as the FAILURE
 * threshold — a wall below the lower bound is unarguable, a wall inside the
 * band is a judgement call and this engine does not raise judgement calls.
 */
export const MIN_DRAFT_DEG: Record<string, number> = {
  hpdc: 0.5, diecast: 0.5, gravity: 1.0, sand: 1.0, investment: 0.5, shell: 1.0,
};
const DEFAULT_MIN_DRAFT = 0.5;   // the most permissive — never over-report

/**
 * The draft source depends on the ROUTE, and getting this wrong is the kind of
 * error a foundry engineer spots immediately: NADCA is the die-casting
 * association and has nothing to say about sand practice. Each route therefore
 * carries its own citation rather than sharing one.
 */
const DRAFT_SOURCE: Record<string, { standard: string; clause?: string; note?: string }> = {
  hpdc: {
    standard: 'NADCA Product Specification Standards for Die Castings (S-4A-7, draft) \u2014 used as a floor',
    note: 'NADCA computes draft from wall depth (draft distance \u221aL / C, aluminium C = 12 outside walls, 6 inside); it is '
        + 'not a fixed band. 0.5\u00b0 is the tool\u2019s own floor, reported only below it \u2014 a deep inside wall needs more, '
        + 'which this check does not compute.',
  },
  investment: {
    standard: 'CostVision engineering heuristic (not a published standard)',
    note: '0.5\u00b0 floor for investment casting. No published figure was read for it; patterns can be drawn with less.',
  },
  sand: {
    standard: 'CostVision engineering heuristic (not a published standard) \u2014 1\u00b0 floor for a sand pattern',
    note: 'Pattern draft for sand moulds is set by EN 12890 (patterns, pattern equipment and core boxes for sand moulds and '
        + 'cores) by feature height and pattern class; that table is not applied here. 1\u00b0 is the tool\u2019s own floor '
        + '(engineering-typical, not sourced) \u2014 a wall below it is reported, a deep wall can need more.',
  },
};
const GENERIC_DRAFT_SOURCE = {
  standard: 'CostVision engineering heuristic (not a published standard)',
  note: 'Route not stated, so the most permissive floor (0.5\u00b0) is applied \u2014 this under-reports rather than over-reports '
      + 'when the process is unknown.',
};
DRAFT_SOURCE.diecast = DRAFT_SOURCE.hpdc;
DRAFT_SOURCE.gravity = {
  standard: 'Permanent-mould (gravity die) practice \u2014 used as a floor',
  note: 'Permanent-mould draft depends on wall depth and is larger on shallow walls; 1\u00b0 is the tool\u2019s own floor '
      + '(engineering-typical, not sourced), so shallow walls are under-reported.',
};
DRAFT_SOURCE.shell = DRAFT_SOURCE.sand;

export const CASTING_RULES: readonly GeometricRule[] = [
  {
    id: 'casting.draft.insufficient',
    commodity: 'casting',
    title: 'Wall below minimum draft for the casting route',
    appliesTo: ['planar_face'],
    // Declared source is the generic one; `evaluate` swaps in the route-specific
    // citation so the printed reference always matches the threshold applied.
    source: GENERIC_DRAFT_SOURCE,
    evaluate(f, part) {
      // Draft is only defined on wall-like faces. `not_applicable` means an end
      // face perpendicular to the draw — nothing to check, not a failure.
      if (f.draftClass === 'not_applicable' || f.draftDeg === undefined) return null;
      if (f.draftClass === 'undercut') return null;      // its own rule below
      if (onMachinedFace(f, part)) return null;          // a machined face carries stock, not draft
      const route = String(part.process ?? '').toLowerCase();
      const min = MIN_DRAFT_DEG[route] ?? DEFAULT_MIN_DRAFT;
      if (f.draftDeg >= min) return null;
      const scoped = { ...this, source: DRAFT_SOURCE[route] ?? GENERIC_DRAFT_SOURCE };
      const area = f.areaMm2 !== undefined ? ` (${f.areaMm2.toFixed(0)} mm²)` : '';
      return finding(scoped, f, part, {
        severity: 'risk',
        detail: `As-cast face ${f.faceIds.join(', ')}${area} draws at ${f.draftDeg.toFixed(2)}° against a `
              + `${min}° minimum for ${part.process ?? 'this route'}.`,
        measuredField: 'draftDeg', measuredValue: f.draftDeg, unit: '°',
        thresholdValue: min, comparator: '<',
        recommendation: draftRemedy(route, min),
      });
    },
  },

  {
    id: 'casting.undercut.requires-core',
    commodity: 'casting',
    title: 'Undercut face — needs a slide or a core',
    appliesTo: ['planar_face'],
    source: {
      standard: 'Moulding principle (a face blocked along its line of release cannot leave the mould) \u2014 not a numeric threshold',
      note: 'A face the part blocks along its line of release (toward the half it faces) cannot release on the main parting: '
          + 'a sand or gravity mould forms it with a core, a die casting with a slide or a loose core.',
    },
    evaluate(f, part) {
      if (f.draftClass !== 'undercut') return null;
      if (onMachinedFace(f, part)) return null;          // cut after casting, not formed by the mould
      const route = String(part.process ?? '').toLowerCase();
      const die = DIE_ROUTES.has(route);
      const cored = CORED_ROUTES.has(route);
      const scoped = die
        ? { ...this, title: 'Undercut face — needs a die slide or core', ...(route === 'gravity' ? {} : { source: UNDERCUT_DIE_SOURCE }) }
        : cored ? { ...this, title: 'Undercut face — formed by a core', source: UNDERCUT_CORE_SOURCE } : this;
      return finding(scoped, f, part, {
        // Ordinary practice on every casting route, and the costing already carries it (cores and core boxes on sand, the
        // die's complexity class on a die) — information, not a defect.
        severity: 'info',
        ...undercutEvidence(f, die ? 'die' : cored ? 'mould (pattern)' : 'mould or die'),
        recommendation: die
          ? 'Re-orient the parting line or redesign the face so it draws, to take the slide or core out of the die.'
          : cored
            ? 'To remove the core, redesign the face so it draws from the pattern (a cored bore that can be cast solid and '
              + 'drilled, or a pocket opened toward the parting).'
            : 'Re-orient the parting line, or form the face with a core (sand) or a slide (die casting).',
      });
    },
  },

  {
    id: 'casting.section.abrupt-change',
    commodity: 'casting',
    title: 'Abrupt section change',
    appliesTo: ['planar_face'],
    source: {
      standard: 'CostVision engineering heuristic (not a published standard; ASM Vol. 15 discusses the topic but the threshold is the tool\u2019s own)',
      note: 'A thick-to-thin ratio above ~2:1 across a junction concentrates solidification '
          + 'shrinkage and residual stress. Widely published as a 2:1 guideline; blended '
          + 'transitions are the standard remedy.',
    },
    evaluate(f, part) {
      // Gated at the source: on a solid part `sectionRatio` is never emitted,
      // because single-ray thickness there measures the envelope, not a wall.
      if (part.featureSet.wallAnalysisValid === false) return null;
      if (f.sectionRatio === undefined || f.neighbourMinThicknessMm === undefined) return null;
      if (onMachinedFace(f, part)) return null;          // machined away: not the as-cast section
      // both sides must be walls, not a ray across a cavity or a graze at a sliver
      if (!plausibleWall(f.thicknessMm, part) || !plausibleWall(f.neighbourMinThicknessMm, part)) return null;
      if (f.sectionRatio <= 2) return null;
      return finding(this, f, part, {
        severity: 'risk',
        detail: `Section steps ${f.sectionRatio.toFixed(2)}:1 at as-cast face ${f.faceIds.join(', ')} `
              + `(${f.thicknessMm?.toFixed(1)} mm against an adjacent ${f.neighbourMinThicknessMm.toFixed(1)} mm).`,
        measuredField: 'sectionRatio', measuredValue: f.sectionRatio, unit: ':1',
        thresholdValue: 2, comparator: '>',
        recommendation: 'Blend the transition with a taper or a generous fillet so the section '
          + 'changes gradually; otherwise ask the foundry to confirm feeding at this junction by solidification simulation '
          + '(shrinkage porosity risk).',
      });
    },
  },

  {
    id: 'casting.fillet.sharp-internal-corner',
    commodity: 'casting',
    title: 'Sharp internal corner',
    appliesTo: ['fillet'],
    source: {
      standard: 'CostVision engineering heuristic (not a published standard; ASM Vol. 15 discusses the topic but the threshold is the tool\u2019s own)',
      note: 'Internal corners are stress raisers and hot spots. Common guidance is a fillet of '
          + 'roughly half the local wall; a radius under ~1 mm is treated as effectively sharp.',
    },
    evaluate(f, part) {
      if (f.concave !== true || !isBlend(f)) return null; // an internal corner blend; an external round is not this kind of stress raiser
      if (onMachinedFace(f, part)) return null;          // a radius cut with a machined face is the tool's, not the mould's
      if (f.radiusMm === undefined) return null;
      if (f.radiusMm >= 1.0) return null;
      return finding(this, f, part, {
        severity: 'risk',
        detail: `As-cast internal corner at face ${f.faceIds.join(', ')} is R${f.radiusMm.toFixed(2)} mm — `
              + 'effectively a sharp internal corner.',
        measuredField: 'radiusMm', measuredValue: f.radiusMm, unit: 'mm',
        thresholdValue: 1.0, comparator: '<',
        recommendation: 'Increase the fillet toward half the adjoining wall thickness to relieve '
          + 'the stress concentration and the local hot spot.',
      });
    },
  },
];

/**
 * Hot spots are a PART-level finding, not a per-feature one — they come from
 * the thickness field rather than from a named feature — so they are produced
 * separately and appended by the runner.
 */
export function castingHotSpotFindings(part: PartContext) {
  const fs = part.featureSet;
  if (fs.wallAnalysisValid === false) return [];
  const med = fs.medianThicknessMm;
  if (!med || !fs.hotSpots?.length) return [];
  const rule: GeometricRule = {
    id: 'casting.hotspot.isolated-heavy-section',
    commodity: 'casting',
    title: 'Isolated heavy section — shrinkage porosity risk',
    appliesTo: ['planar_face'],
    source: {
      standard: 'CostVision engineering heuristic (not a published standard; ASM Vol. 15 discusses the topic but the threshold is the tool\u2019s own)',
      note: 'A section markedly heavier than the surrounding wall solidifies last and cannot be '
          + 'fed, producing centreline shrinkage. Flagged at 2x the part median wall.',
    },
    evaluate: () => null,
  };
  const machined = new Set(part.machined?.faceIds ?? []);
  return fs.hotSpots.filter(h => plausibleWall(h.thicknessMm, part) && !machined.has(h.faceId)).map(h => finding(
    rule,
    { id: `HS${h.faceId}`, kind: 'planar_face', faceIds: [h.faceId],
      positionMm: h.positionMm as [number, number, number] } as ManufacturingFeature,
    part,
    {
      severity: 'risk',
      detail: `As-cast face ${h.faceId} measures ${h.thicknessMm.toFixed(1)} mm against a part median of `
            + `${med.toFixed(1)} mm — ${h.vsMedianRatio.toFixed(1)}x heavier.`,
      measuredField: 'thicknessMm', measuredValue: h.thicknessMm, unit: 'mm',
      thresholdValue: med * 2, comparator: '>',
      recommendation: 'Core out the heavy section, or ask the foundry to feed it (riser / chill) and confirm by '
        + 'solidification simulation. Untreated, expect centreline shrinkage porosity here.',
    },
  ));
}

/**
 * What casting DFM cannot check from geometry, whatever the part.
 *
 * Printed on every report. A short finding list must never be mistaken for a
 * clean part — these are the checks a foundry engineer would expect and that
 * no amount of B-rep analysis can supply.
 */
export const CASTING_LIMITATIONS: readonly string[] = [
  'Tolerance and datum callouts were not checked — they live on the drawing, not in the solid.',
  'Parting-line position was assumed to lie perpendicular to the draw direction; a different '
  + 'parting choice changes which faces are undercuts.',
  'Machining stock allowance on cast surfaces was not assessed — it is a process decision, not a '
  + 'measurable feature.',
  'Gating and feeding layout was not evaluated: where to place risers is a foundry decision.',
];

/** Casting routes that form an undercut with an expendable CORE (sand: the core rule prices it; investment: core boxes). */
export const CORED_ROUTES: ReadonlySet<string> = new Set(['sand', 'shell', 'investment']);
/** Permanent-mould routes: an undercut is a slide or a metal / sand core in the die. */
export const DIE_ROUTES: ReadonlySet<string> = new Set(['hpdc', 'diecast', 'gravity']);

/** Where the costing already carries a casting undercut — the reason the finding adds no £ of its own. */
export function castingUndercutInPrice(route: string | undefined): string {
  const r = String(route ?? '').toLowerCase();
  if (r === 'sand' || r === 'shell') {
    return 'Already in the price: the sand route prices a core a part and the core boxes in the pattern equipment from the '
      + 'measured undercut count. This finding adds no £ of its own.';
  }
  if (r === 'investment') return 'Already in the price: the investment tool carries core boxes from the measured undercut count.';
  if (DIE_ROUTES.has(r)) {
    return 'Already in the price as a complexity class: the die estimate reads the measured undercut count (about one slide '
      + 'per few faces). The die model does not price a single slide, so no £ is separated for this face.';
  }
  return 'Route not stated: a sand core or a die slide, each priced on its route; no £ is separated here.';
}

const UNDERCUT_CORE_SOURCE = {
  standard: 'Sand-moulding principle (a face blocked along its line of release cannot leave the pattern) \u2014 not a numeric threshold',
  note: 'The pattern draws from the sand along the parting; a face the part blocks along that line is formed by a core set in '
      + 'the mould. Pattern equipment and core boxes for sand moulds are specified under EN 12890.',
};
const UNDERCUT_DIE_SOURCE = {
  standard: 'NADCA Product Specification Standards for Die Castings',
  clause: 'Undercuts and moving die components',
  note: 'A face the part blocks along its line of release cannot release on the main parting; in a die it needs a slide or '
      + 'a loose core, each of which adds die cost and cycle time.',
};

/** What draft costs on this route, said in the route's own terms (a sand mould has no die and no ejection). */
export function draftRemedy(route: string, min: number): string {
  if (DIE_ROUTES.has(route)) {
    return `Add draft to at least ${min}° per side, or accept the ejection drag and the die wear it causes.`;
  }
  if (CORED_ROUTES.has(route)) {
    return `Add draft to at least ${min}° per side. With none the pattern drags the mould wall as it is drawn (sand `
      + 'inclusions, dimensional scatter). Draft adds metal: the costed weight is the finished model plus machining stock and '
      + 'carries no draft metal.';
  }
  return `Add draft to at least ${min}° per side (route not stated: on a die this is ejection drag and die wear, in a sand `
    + 'mould pattern-draw damage).';
}

/**
 * What the hot-spot check did, as a line the report prints — "no finding" must not read as "not checked".
 */
export function hotSpotStatement(part: PartContext, reported: number): string {
  const fs = part.featureSet;
  if (fs.wallAnalysisValid === false) {
    return 'Hot-spot check did not run: on a solid-bodied part a single-ray thickness measures the part, not a section.';
  }
  const med = fs.medianThicknessMm;
  if (!med) return 'Hot-spot check did not run: no median wall was measured.';
  const n = (fs.hotSpots ?? []).length;
  return `Hot-spot check ran on the as-cast faces: ${reported} section(s) above 2× the ${med.toFixed(1)} mm median wall reported`
    + (n > reported ? ` (${n - reported} reading(s) set aside as machined faces or rays across a cavity)` : '') + '.';
}

/**
 * NADCA maximum cored depth for aluminium die castings — Ø (mm) → deepest a core of that diameter can
 * form (mm). From the Product Specification Standards §4A "Cored Holes" table (inch values converted).
 * Below the smallest listed diameter a hole is not cored at all.
 */
export const NADCA_AL_CORED_DEPTH: ReadonlyArray<[number, number]> = [
  [3.175, 7.94], [3.97, 12.7], [4.76, 15.9], [6.35, 25.4], [9.525, 38.1], [12.7, 50.8],
  [15.875, 79.4], [19.05, 114.3], [25.4, 152.4],
];

/** Deepest a die-cast core of this diameter can form, mm (null below the table: not cored). */
export function nadcaMaxCoredDepthMm(diaMm: number): number | null {
  const t = NADCA_AL_CORED_DEPTH;
  if (diaMm < t[0][0]) return null;
  if (diaMm >= t[t.length - 1][0]) return diaMm * (t[t.length - 1][1] / t[t.length - 1][0]);
  for (let i = 1; i < t.length; i++) {
    if (diaMm <= t[i][0]) {
      const [d0, h0] = t[i - 1], [d1, h1] = t[i];
      return h0 + ((h1 - h0) * (diaMm - d0)) / (d1 - d0);
    }
  }
  return null;
}

export const CORED_HOLE_RULE: GeometricRule = {
  id: 'casting.hole.beyond-cored-depth',
  commodity: 'casting',
  title: 'Hole too small or too deep to die-cast — drilled after casting',
  appliesTo: ['hole'],
  source: {
    standard: 'NADCA Product Specification Standards for Die Castings, §4A "Cored Holes" (maximum cored depth by diameter)',
    url: 'https://www.abdiecasting.com/wp-content/uploads/2024/09/Section-04a-Tolerancing.pdf',
    note: 'Aluminium column; holes under Ø12.5 mm are limited to about 4:1 depth-to-diameter, and below Ø3.2 mm a hole is '
      + 'not cored. Read from a supplier-hosted copy of the NADCA table.',
  },
  evaluate(f, part) {
    const route = (part.process ?? '').toLowerCase();
    if (route !== 'hpdc' && route !== 'diecast') return null; // measured or silent: the table is die casting only
    if (f.diaMm === undefined || f.depthMm === undefined || f.diaMm <= 0) return null;
    if (f.openEnds !== 1) return null; // the table is for blind cores; a through core is supported at both ends
    // Holes the costing drills anyway (at or under its cored size) are not a finding — only holes the cost
    // sheet assumes are CORED but that no core of that diameter can form that deep.
    if (f.diaMm <= coredAbove(route)) return null;
    const max = nadcaMaxCoredDepthMm(f.diaMm);
    if (max !== null && f.depthMm <= max) return null;
    // Both times in the costing's own model, so the note is arithmetic, not a claim: the sheet prices this hole as cored
    // + finish-bored; it will be drilled from solid. The difference is a routing correction, not a design saving — and
    // it can go either way (a short cored-and-bored hole costs MORE than drilling it).
    const tf = part.cost?.timeFactor ?? 1;
    const row = { kind: 'hole' as const, diaMm: f.diaMm, depthMm: f.depthMm, through: false, count: 1 };
    const asCosted = nearNetHoleMinutes(row, coredAbove(route)) * tf;
    const drilled = featureMinutesEach(row) * tf;
    return finding(this, f, part, {
      severity: 'info',
      detail: `Blind ⌀${f.diaMm.toFixed(1)} mm hole ${f.depthMm.toFixed(1)} mm deep — a die-cast core of that diameter forms `
        + `${(max ?? 0).toFixed(1)} mm at most, so it is drilled after casting. The cost sheet prices it as cored + finish-bored `
        + `(${asCosted.toFixed(2)} min); drilled from solid it is ${drilled.toFixed(2)} min in the same time model `
        + `(${drilled >= asCosted ? '+' : '−'}${Math.abs(drilled - asCosted).toFixed(2)} min a hole).`,
      measuredField: 'depthMm', measuredValue: f.depthMm, unit: 'mm',
      thresholdValue: Math.round((max ?? 0) * 10) / 10, comparator: '>',
      recommendation: 'Open the diameter or shorten the hole so it can be cored, or route it as drilled after casting on the '
        + 'cost sheet (the times above are the difference).',
    });
  },
};
(CASTING_RULES as GeometricRule[]).push(CORED_HOLE_RULE);
