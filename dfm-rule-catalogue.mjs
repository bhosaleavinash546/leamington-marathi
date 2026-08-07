// ─────────────────────────────────────────────────────────────────────────────
// DFM rule catalogue — DATA, deliberately not code.
//
// Every rule is a plain object with a threshold, a unit and a SOURCE. Keeping it
// as data rather than a pile of if-statements means an engineer can review the
// whole ruleset in one sitting, argue with a number, and change it without
// touching the evaluator — and it means the report can print where each
// threshold came from instead of asserting it.
//
// `measure` names a value the evaluator pulls out of the measured geometry (see
// dfm-rules.mjs `MEASURES`). `compare` is one of lt / gt / lte / gte. A rule that
// cannot be measured on a given part is reported as NOT EVALUATED — never as a
// pass. Silence about an unchecked rule reads as a clean bill of health.
//
// Thresholds are industry design-guideline values, not laws of physics. They are
// starting points for a conversation with a supplier: a good foundry will beat
// several of them, and a marginal one will miss them. The report says so.
// ─────────────────────────────────────────────────────────────────────────────

/** Severity drives ordering and colour in the report, nothing else. */
export const SEVERITIES = ['high', 'medium', 'low'];

export const PROCESS_FAMILIES = {
  machining: 'Machining (CNC mill/turn)',
  'injection-moulding': 'Injection moulding',
  hpdc: 'High-pressure die casting',
  'sheet-metal': 'Sheet metal / stamping',
};

export const DFM_RULES = [
  // ── Machining ──────────────────────────────────────────────────────────────
  {
    id: 'mach-pocket-depth-ratio',
    process: 'machining',
    severity: 'high',
    title: 'Deep pocket relative to its width',
    measure: 'maxPocketDepthToWidth',
    compare: 'lte',
    threshold: 4,
    unit: 'depth/width',
    rationale:
      'Beyond about 4:1 the cutter must be stepped down in a long, slender tool with reduced feed, and chip evacuation becomes the limiting factor. Cycle time rises faster than depth.',
    fix: 'Open the pocket out, split it across two setups, or accept a larger corner radius so a shorter, stiffer tool reaches the floor.',
    source: 'General machining design guidance (tool L/D and chip-evacuation limits).',
  },
  {
    id: 'mach-internal-corner-radius',
    process: 'machining',
    severity: 'medium',
    title: 'Internal corner radius forces a small cutter',
    measure: 'minInternalCornerRadiusMm',
    compare: 'gte',
    threshold: 3,
    unit: 'mm',
    rationale:
      'An internal corner cannot be smaller than the cutter that makes it. A sharp internal corner on a drawing is either impossible or forces a very small, slow, fragile tool for the whole pocket.',
    fix: 'Specify the largest corner radius the function allows — often a third of the pocket depth — so a rigid cutter can be used.',
    source: 'General machining design guidance (an internal corner radius equals the tool radius).',
  },
  {
    id: 'mach-setup-count',
    process: 'machining',
    severity: 'medium',
    title: 'Features approached from many directions',
    measure: 'setupCount',
    compare: 'lte',
    threshold: 3,
    unit: 'setups',
    rationale:
      'Each additional setup adds fixturing, re-datuming and its own tolerance stack. Setup time is charged whether the batch is 10 parts or 1000.',
    fix: 'Group features onto fewer faces, or design a fixture that presents several faces in one clamping.',
    source: 'Setup-driven cost is modelled directly in machining-feature-cost.mjs.',
  },
  {
    id: 'mach-thin-web',
    process: 'machining',
    severity: 'high',
    title: 'Thin web will chatter or deflect under the cutter',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 1.5,
    unit: 'mm',
    rationale:
      'A thin unsupported web deflects away from the tool, so the cut is inaccurate and the surface chatters. It usually forces a finishing pass at reduced depth of cut, or a support fixture.',
    fix: 'Thicken the web, add a rib, or leave sacrificial support material to be removed last.',
    source: 'General machining design guidance (workpiece rigidity).',
  },

  // ── Injection moulding ─────────────────────────────────────────────────────
  {
    id: 'im-wall-thickness-range',
    process: 'injection-moulding',
    severity: 'high',
    title: 'Wall thickness outside the practical moulding range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [1.0, 3.0],
    unit: 'mm',
    rationale:
      'Below about 1 mm the cavity is hard to fill before the melt freezes; above about 3 mm the part is cooling-limited, so cycle time climbs roughly with the square of the wall and sink marks appear over thick sections.',
    fix: 'Core out thick sections to a uniform nominal wall and add ribs for stiffness instead of solid mass.',
    source: 'Injection-moulding design guidance; practical range for engineering thermoplastics.',
  },
  {
    id: 'im-wall-uniformity',
    process: 'injection-moulding',
    severity: 'medium',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.6,
    unit: '(p95-p5)/p50',
    rationale:
      'Uneven walls cool at different rates, which drives differential shrinkage — the usual root cause of warp, sink and locked-in stress. Transitions should be tapered rather than stepped.',
    fix: 'Even out the nominal wall; where a change is unavoidable, blend it over about a 3:1 taper.',
    source: 'Injection-moulding design guidance (3:1 transition rule).',
  },
  {
    id: 'im-draft-minimum',
    process: 'injection-moulding',
    severity: 'high',
    title: 'Wall area below the minimum draft angle',
    measure: 'wallAreaBelowMinDraftPct',
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'A wall with no draft drags on the core as the part ejects, scuffing the surface and raising ejection force. Textured surfaces need considerably more draft than smooth ones.',
    fix: 'Add at least 0.5 to 1 degree per side on smooth walls; allow 2 to 5 degrees where the surface is textured.',
    source: 'Injection-moulding design guidance (0.5–1 deg/side smooth, 2–5 deg textured).',
    measuredAt: { minDraftDeg: 1.0 },
  },
  {
    id: 'im-undercuts',
    process: 'injection-moulding',
    severity: 'high',
    title: 'Undercuts require side actions',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'Any feature the two mould halves cannot form in a straight pull needs a slide, lifter or collapsible core. Each mechanism adds tooling cost, adds a moving part that can wear, and lengthens the cycle.',
    fix: 'Redesign the feature so it forms in the draw direction, relocate the parting line, or accept the side action with its tooling cost priced in.',
    source: 'Injection-moulding design guidance (side actions add roughly $500–$5,000 of tooling per feature).',
  },

  // Rib proportions are checked with THREE rules rather than one "40-60% of
  // wall" band, because a band is a single comparison and a part has many ribs.
  // Reporting one number against a band would mean choosing which rib to speak
  // for and silently dropping the rest; max and min are unambiguous facts about
  // the whole part, and each failure mode — sink over a thick rib, short shots
  // in a thin one, filling and ejection in a tall one — gets its own finding
  // with its own fix.
  {
    id: 'im-rib-thickness-max',
    process: 'injection-moulding',
    severity: 'medium',
    title: 'Rib too thick at its base for the wall it stands on',
    measure: 'maxRibThicknessToWall',
    compare: 'lte',
    threshold: 0.6,
    unit: 'rib t / wall t',
    rationale:
      'A rib meeting the wall at more than about 60% of the wall thickness makes a heavy junction that is the last place to solidify. It shows as a sink mark on the opposite — usually visible — surface, and as a void inside the section.',
    fix: 'Thin the rib to 40–60% of the nominal wall and add more ribs, or gusset it, if stiffness is lost.',
    source: 'Injection-moulding design guidance (rib base 40–60% of nominal wall).',
  },
  {
    id: 'im-rib-thickness-min',
    process: 'injection-moulding',
    severity: 'low',
    title: 'Rib too thin to fill reliably',
    measure: 'minRibThicknessToWall',
    compare: 'gte',
    threshold: 0.4,
    unit: 'rib t / wall t',
    rationale:
      'A rib much below 40% of the wall is a narrow, high-resistance flow path off the main cavity. It fills late or not at all, and a short-shot rib contributes none of the stiffness it was drawn for.',
    fix: 'Take the rib back up to 40% of the wall, or delete it and thicken the wall locally instead.',
    source: 'Injection-moulding design guidance (rib base 40–60% of nominal wall).',
  },
  {
    id: 'im-rib-height',
    process: 'injection-moulding',
    severity: 'medium',
    title: 'Rib taller than three wall thicknesses',
    measure: 'maxRibHeightToWall',
    compare: 'lte',
    threshold: 3,
    unit: 'rib h / wall t',
    rationale:
      'A tall thin rib is a long dead-end for the melt and a deep, narrow slot in the tool steel that is hard to vent and hard to cool. It also grips the core on ejection, so it needs more draft than the rest of the part.',
    fix: 'Cap the rib at about 3x the nominal wall and use two or three shorter ribs, or a cross-rib, to recover the section modulus.',
    source: 'Injection-moulding design guidance (rib height <= 3x nominal wall).',
  },

  // ── High-pressure die casting ──────────────────────────────────────────────
  {
    id: 'hpdc-wall-thickness-range',
    process: 'hpdc',
    severity: 'high',
    title: 'Wall thickness outside the die-casting range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [1.0, 3.5],
    unit: 'mm',
    rationale:
      'Below about 1 mm the die will not fill reliably and cold shuts appear; above about 3.5 mm the section traps porosity as it solidifies and holds the cycle open.',
    fix: 'Hold a uniform nominal wall in the 2.0–3.5 mm band and core out heavy sections.',
    source: 'Aluminium HPDC design guidance (1.0 mm minimum, 2.0–3.5 mm recommended).',
  },
  {
    id: 'hpdc-draft-minimum',
    process: 'hpdc',
    severity: 'high',
    title: 'Wall area below the minimum die-casting draft',
    measure: 'wallAreaBelowMinDraftPct',
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'Aluminium shrinks onto the die steel as it solidifies, so a die casting needs more draft than a moulding. Insufficient draft galls the die surface and shortens die life as well as risking ejector distortion.',
    fix: 'Allow 1 to 2 degrees on external walls and 2 to 3 degrees on internal walls and cores; use 3 to 5 degrees on deep features.',
    source: 'Aluminium HPDC design guidance (1–2 deg external, 2–3 deg internal, 3–5 deg deep).',
    measuredAt: { minDraftDeg: 1.0 },
  },
  {
    id: 'hpdc-internal-radius',
    process: 'hpdc',
    severity: 'medium',
    title: 'Sharp internal corners concentrate stress and restrict flow',
    measure: 'minInternalCornerRadiusMm',
    compare: 'gte',
    threshold: 1.6,
    unit: 'mm',
    rationale:
      'A sharp internal corner is a hot spot in the casting and a stress raiser in the die, where it becomes the first place a heat-check crack starts.',
    fix: 'Fillet internal corners to at least 1.5 times the adjacent wall thickness, and never below about 1.6 mm.',
    source: 'Die-casting design guidance (minimum ~1.6 mm fillet; 1.5x wall preferred).',
  },
  {
    id: 'hpdc-undercuts',
    process: 'hpdc',
    severity: 'high',
    title: 'Undercuts require slides or lifters in the die',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'A die-cast undercut needs a slide or a loose core. Both add die cost and maintenance, and a loose core adds a manual handling step to every shot.',
    fix: 'Reorient the part to the draw, move the parting line, or price the slide explicitly.',
    source: 'Die-casting design guidance.',
  },

  // A die-cast rib may be RELATIVELY THICKER than a moulded one, and the band is
  // deliberately different for that reason: aluminium fills a thin section far
  // less readily than a thermoplastic, so a rib below about 60% of the wall
  // risks a cold shut, while the sink mark that caps a moulded rib at 60%
  // matters less on a casting that is machined or hidden.
  {
    id: 'hpdc-rib-thickness-max',
    process: 'hpdc',
    severity: 'medium',
    title: 'Rib heavier than the wall it stands on',
    measure: 'maxRibThicknessToWall',
    compare: 'lte',
    threshold: 0.8,
    unit: 'rib t / wall t',
    rationale:
      'A rib approaching the full wall thickness makes the junction the thickest section in the casting. That is where shrinkage porosity collects, and it holds the die open while it solidifies.',
    fix: 'Bring the rib base to roughly 60–80% of the adjoining wall and fillet the root rather than thickening it.',
    source: 'Die-casting design guidance (rib base ~60–80% of the adjoining wall).',
  },
  {
    id: 'hpdc-rib-thickness-min',
    process: 'hpdc',
    severity: 'medium',
    title: 'Rib too thin to fill before it freezes',
    measure: 'minRibThicknessToWall',
    compare: 'gte',
    threshold: 0.6,
    unit: 'rib t / wall t',
    rationale:
      'Aluminium loses superheat fast in a thin section. A rib much below 60% of the wall chills before the cavity is full and leaves a cold shut at the rib tip — a crack starter, not just a cosmetic defect.',
    fix: 'Thicken the rib toward 60–80% of the wall, or shorten it so the flow path to its tip is shorter.',
    source: 'Die-casting design guidance (rib base ~60–80% of the adjoining wall).',
  },
  {
    id: 'hpdc-rib-height',
    process: 'hpdc',
    severity: 'medium',
    title: 'Rib taller than three wall thicknesses',
    measure: 'maxRibHeightToWall',
    compare: 'lte',
    threshold: 3,
    unit: 'rib h / wall t',
    rationale:
      'A deep rib is a deep, narrow blade of die steel. It runs hotter than the rest of the die, heat-checks first, and is the feature most likely to break out in service; the casting also grips it hard on ejection.',
    fix: 'Limit rib height to about 3x the wall, or split one deep rib into several shallower ones and increase the draft on what remains.',
    source: 'Die-casting design guidance (rib height <= 3x wall; deep ribs need 3–5 deg draft).',
  },

  // ── Sheet metal / stamping ─────────────────────────────────────────────────
  {
    id: 'sm-bend-radius',
    process: 'sheet-metal',
    severity: 'medium',
    title: 'Inside bend radius below one material thickness',
    measure: 'minBendRadiusToThickness',
    compare: 'gte',
    threshold: 1,
    unit: 'r/t',
    rationale:
      'Bending tighter than about one thickness works the outer fibre beyond its uniform elongation and cracks it. Less ductile alloys need considerably more.',
    fix: 'Open the inside radius to at least 1x thickness; allow 1.5–2x for stainless or 6061-T6.',
    source: 'Sheet-metal design guidance (1x t typical, 1.5–2x for stainless and 6061-T6).',
  },
  {
    id: 'sm-hole-diameter',
    process: 'sheet-metal',
    severity: 'medium',
    title: 'Punched hole smaller than the material thickness',
    measure: 'minHoleDiaToThickness',
    compare: 'gte',
    threshold: 1,
    unit: 'd/t',
    rationale:
      'A punch narrower than the sheet is thick is loaded in buckling and breaks often. It becomes a consumable rather than a tool.',
    fix: 'Increase the hole diameter to at least one thickness, or drill rather than punch.',
    source: 'Sheet-metal design guidance (minimum punched hole diameter ~1x thickness).',
  },
  {
    id: 'sm-hole-to-bend',
    process: 'sheet-metal',
    severity: 'high',
    title: 'Hole too close to a bend line',
    measure: 'holeToBendClearanceMm',
    compare: 'gte',
    threshold: 0,
    unit: 'mm clear of 2t+r',
    rationale:
      'A hole inside the bend deformation zone is pulled oval as the bend forms, and no amount of press setup recovers the shape.',
    fix: 'Move the hole clear of the bend zone (at least 2 thicknesses plus the bend radius), or pierce it after forming.',
    source: 'Sheet-metal design guidance (hole-to-bend >= 2T + R).',
  },
  {
    id: 'sm-flange-length',
    process: 'sheet-metal',
    severity: 'medium',
    title: 'Flange too short to form',
    measure: 'minFlangeToThickness',
    compare: 'gte',
    threshold: 3,
    unit: 'flange/t',
    rationale:
      'A flange shorter than about three thicknesses gives the press-brake tooling nothing to hold, so the bend wanders and the angle is not repeatable.',
    fix: 'Lengthen the flange to at least 3x thickness, or form it as part of a larger feature and trim after.',
    source: 'Sheet-metal design guidance (minimum flange ~3x thickness).',
  },
];

/** Rules grouped by process, in the order the report should present them. */
export function rulesFor(process) {
  return DFM_RULES.filter(r => r.process === process);
}

export const RULE_BY_ID = Object.fromEntries(DFM_RULES.map(r => [r.id, r]));
