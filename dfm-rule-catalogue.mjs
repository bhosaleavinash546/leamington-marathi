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
// PROVENANCE IS GRADED, BECAUSE IT IS UNEVEN. Every rule carries a `source`
// string, and until this grading existed each one read like a citation while
// being an attribution written from engineering knowledge — "Die-casting design
// guidance", with no standard, author or page behind it. `sourceStatus` says
// which of three things a threshold actually rests on:
//
//   'standard-named'     a specific published standard is named (e.g. NADCA
//                        S-4A-7) and its value was corroborated. The standards
//                        themselves are paywalled and have NOT been read
//                        first-hand, so even this grade is "named", not "audited".
//   'industry-consensus'  multiple independent suppliers and design guides agree,
//                        but no primary standard was consulted. This is most of
//                        the catalogue. Some of these values are actively
//                        DISPUTED by practising manufacturers and say so.
//   'engine-derived'     the threshold comes from our own cost model, so it is
//                        verifiable in this repository.
//
// None of these thresholds has been validated against a controlled study, a
// supplier's own standards, or measured scrap data. They are screening values:
// good enough to rank parts and open a conversation, not to specify one. A tool
// that prints "SOURCE:" beside an unaudited number is making a claim it has not
// earned, which is the same failure this feature calls out everywhere else.
// ─────────────────────────────────────────────────────────────────────────────

/** Severity drives ordering and colour in the report, nothing else. */
export const SEVERITIES = ['high', 'medium', 'low'];

export const PROCESS_FAMILIES = {
  machining: 'Machining (CNC mill/turn)',
  'injection-moulding': 'Injection moulding',
  hpdc: 'High-pressure die casting (Al / Mg)',
  'hpdc-zinc': 'High-pressure die casting (Zinc)',
  'gravity-die': 'Gravity die casting',
  'sand-casting': 'Sand casting',
  'investment-casting': 'Investment casting',
  'sheet-metal': 'Sheet metal / stamping',
  'roll-forming': 'Roll forming',
  hydroforming: 'Hydroforming',
  'forging-hot': 'Forging (hot)',
  'forging-cold': 'Forging (cold)',
  extrusion: 'Extrusion',
  'rubber-moulding': 'Rubber moulding',
  'composite-rtm': 'Composite layup / RTM',
};

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL-SPECIFIC THRESHOLDS
//
// A threshold that ignores the material is a generic threshold, and a generic
// threshold produces a generic finding. Three of these were wrong enough to
// matter on real parts:
//
//   * one HPDC wall band of 1.0-3.5 mm covered aluminium, magnesium and zinc.
//     Zinc fills a 0.6 mm section; aluminium needs 1.5. The same band cannot be
//     right for both, and on zinc it hid a genuine lightweighting opportunity.
//   * one injection-moulding band of 1.0-3.0 mm covered PP and PA66-GF30. A
//     30% glass-filled nylon needs a fuller wall to fill and pack.
//   * one sheet-metal bend radius of 1 r/t covered mild steel and 6061-T6.
//     6061-T6 cracks below about 3 r/t; judging it at 1 passes a part that will
//     split on the press.
//
// A rule may therefore carry `byMaterial` (exact grade) and `byMaterialFamily`
// (the costing engine's family tag), each with its OWN source string. `threshold`
// remains the band used when the material is not known — and when that fallback
// is used the finding is stamped `thresholdBasis: 'process-generic'` so the
// report can say the number was not tuned to the alloy, rather than implying it
// was. Resolution order: grade, then family, then generic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick the threshold for a rule given the chosen material.
 *
 * @returns {{threshold, source, basis: 'material'|'material-family'|'process-generic', matchedOn: string|null}}
 */
export function resolveThreshold(rule, material, materialFamily, override) {
  // A PLANT'S OWN STANDARD OUTRANKS EVERY PUBLISHED GUIDELINE, and it must say
  // so. When a customer sets their own value it wins over the material band and
  // the process band, and its provenance becomes 'customer-standard' — which is
  // a STRONGER grade than the industry consensus it replaced, because someone
  // accountable put their name to it. Presenting it under the original source
  // string would credit a handbook for a number the handbook never gave.
  if (override && override.threshold !== undefined && override.threshold !== null) {
    return {
      threshold: override.threshold,
      source: override.note
        ? `Company standard: ${override.note}`
        : 'Company standard set in this workspace, replacing the published guideline.',
      basis: 'customer-standard',
      matchedOn: 'company standard',
      sourceStatus: 'customer-standard',
    };
  }
  const byGrade = material && rule.byMaterial?.[material];
  if (byGrade) {
    return {
      threshold: byGrade.threshold, source: byGrade.source ?? rule.source,
      basis: 'material', matchedOn: material,
    };
  }
  const byFamily = materialFamily && rule.byMaterialFamily?.[materialFamily];
  if (byFamily) {
    return {
      threshold: byFamily.threshold, source: byFamily.source ?? rule.source,
      basis: 'material-family', matchedOn: materialFamily,
    };
  }
  return {
    threshold: rule.threshold, source: rule.source,
    basis: 'process-generic', matchedOn: null,
  };
}

export const DFM_RULES = [
  // ── Machining ──────────────────────────────────────────────────────────────
  {
    id: 'mach-pocket-depth-ratio',
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'engine-derived',
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
    sourceStatus: 'industry-consensus',
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

  {
    id: 'mach-hole-depth-ratio',
    sourceStatus: 'industry-consensus',
    process: 'machining',
    severity: 'medium',
    title: 'Hole deeper than five diameters',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 5,
    unit: 'depth/dia',
    rationale:
      'Past about 5x diameter a standard jobber drill stops clearing its own chips, so the cycle becomes a peck cycle — retract, clear, re-enter — and the tool wanders off centre. Past roughly 10x it is a gun-drilling or coolant-through operation on different equipment.',
    fix: 'Open the hole diameter, drill from both ends where the tolerance allows, or accept the deep-hole process and price it as one.',
    source: 'General machining design guidance (chip evacuation and drill L/D limits).',
  },

  {
    id: 'mach-tool-access',
    sourceStatus: 'industry-consensus',
    process: 'machining',
    severity: 'high',
    title: 'Surface a standard cutter cannot reach',
    measure: 'unreachableAreaPct',
    compare: 'lte',
    threshold: 2,
    unit: '% of surface area',
    rationale:
      'A face a cutter cannot physically get to is not a machining problem to be priced — it is a feature that has to be made another way. The usual answers are EDM, a long-reach or custom tool, an extra setup, or a redesign, and all four cost more than the feature looks like it should.',
    fix: 'Open the pocket or slot so a standard cutter fits, increase the internal corner radii, or split the feature so it can be approached from a face that is already being machined.',
    source: 'General machining design guidance (tool reach and shank clearance). Measured by sweeping a cylinder of the tool diameter along each approach direction — the HOLDER and machine envelope are not modelled, so this is a lower bound on the access problem, not an upper one.',
  },

  // ── Injection moulding ─────────────────────────────────────────────────────
  {
    id: 'im-wall-thickness-range',
    byMaterial: {
      'Polypropylene (PP)': { threshold: [0.8, 3.0], source: 'PP moulding guidance: 0.8 mm minimum, 1.5-3.0 mm typical. PP is one of the easiest-flowing commodity resins.' },
      'ABS': { threshold: [1.2, 3.5], source: 'ABS moulding guidance: 1.2 mm minimum, 1.5-3.5 mm typical.' },
      'PA6 (Nylon)': { threshold: [0.8, 3.0], source: 'PA6 moulding guidance: 0.8 mm minimum, 1.0-3.0 mm typical; nylon flows well but is moisture-sensitive.' },
      'PA66-GF30 (glass-filled)': { threshold: [1.5, 4.0], source: '30% glass-filled PA66 moulding guidance: 1.5 mm minimum. A short-glass compound is far more viscous than the unfilled resin and needs a fuller wall to fill and pack.' },
      'POM (Acetal)': { threshold: [0.8, 3.0], source: 'POM moulding guidance: 0.8 mm minimum, 1.5-3.0 mm typical. Acetal shrinks heavily, so a thick section sinks badly.' },
      'Polycarbonate (PC)': { threshold: [1.0, 4.0], source: 'PC moulding guidance: 1.0 mm minimum, 1.5-4.0 mm typical; PC is viscous but tolerates a thicker section than most commodity resins.' },
    },
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
    process: 'injection-moulding',
    severity: 'high',
    title: 'Wall area below the minimum draft angle',
    measure: 'wallAreaBelowDraftPct',
    // 1 degree per side is the smooth-wall figure. Texture needs far more, and
    // texture is not in the solid — see `rationale`.
    draftCutoffDeg: 1.0,
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
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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
    source: 'Injection-moulding design guidance (rib base 40-60% of nominal wall). Widely published, and actively DISPUTED by practising moulders — Mack Molding publish "Why 60% Rib-to-Wall Ratio is NOT Sacred", arguing the limit depends on resin, texture and whether the opposite face is cosmetic. Treat as a screening threshold, not a specification.',
  },
  {
    id: 'im-rib-thickness-min',
    sourceStatus: 'industry-consensus',
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
    source: 'Injection-moulding design guidance (rib base 40-60% of nominal wall). See the rib-thickness-max note: the 60% figure is disputed by practising moulders and depends on resin and cosmetics.',
  },
  {
    id: 'im-rib-height',
    sourceStatus: 'industry-consensus',
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

  {
    id: 'im-boss-height',
    sourceStatus: 'industry-consensus',
    process: 'injection-moulding',
    severity: 'medium',
    title: 'Boss taller than three times its diameter',
    measure: 'maxBossHeightToDia',
    compare: 'lte',
    threshold: 3,
    unit: 'height/dia',
    rationale:
      'A tall boss is formed by a long, slender core pin standing alone in the cavity. The melt front pushes it sideways, so the hole drifts off position and the pin fatigues; the boss itself is also a thick section that sinks on the show surface behind it.',
    fix: 'Shorten the boss, or support it with gussets and blend it into a nearby wall so the core pin is not standing free.',
    source: 'Injection-moulding design guidance (boss height <= 3x outside diameter; support tall bosses with ribs or gussets).',
  },

  // ── High-pressure die casting ──────────────────────────────────────────────
  {
    id: 'hpdc-wall-thickness-range',
    byMaterialFamily: {
      aluminium: {
        threshold: [1.5, 4.0],
        source: 'Aluminium HPDC design guidance: 1.5 mm practical minimum for a small part, 2.5-4.0 mm typical nominal. Aluminium freezes fast and will not run a 1 mm section reliably at production yield.',
      },
      magnesium: {
        threshold: [1.3, 3.5],
        source: 'Magnesium HPDC design guidance: magnesium has lower viscosity and higher fluidity than aluminium, so it fills a thinner section — 1.3 mm minimum, 2.0-3.5 mm typical nominal.',
      },
    },
    sourceStatus: 'industry-consensus',
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
    source: 'Aluminium HPDC design guidance (1.0 mm minimum, 2.0-3.5 mm recommended). Widely published and mutually consistent across die-casting suppliers; NOT audited against NADCA or a foundry standard.',
  },
  {
    id: 'hpdc-draft-minimum',
    sourceStatus: 'standard-named',
    process: 'hpdc',
    severity: 'high',
    title: 'Wall area below the minimum die-casting draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 1.0,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'Aluminium shrinks onto the die steel as it solidifies, so a die casting needs more draft than a moulding. Insufficient draft galls the die surface and shortens die life as well as risking ejector distortion.',
    fix: 'Allow 1 to 2 degrees on external walls and 2 to 3 degrees on internal walls and cores; use 3 to 5 degrees on deep features.',
    source: 'NADCA Product Specification Standards, S-4A-7 (Draft Constants). NADCA standard tolerances give 1 deg minimum on outside surfaces and 2 deg on inside; the 1 deg threshold used here is the outside-wall figure. Designation and values corroborated from secondary summaries — the standard itself is paywalled and has NOT been read.',
    measuredAt: { minDraftDeg: 1.0 },
  },
  {
    id: 'hpdc-internal-radius',
    sourceStatus: 'industry-consensus',
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
    source: 'Die-casting design guidance (minimum ~1.6 mm fillet; 1.5x wall preferred). Industry consensus, no primary source audited.',
  },
  {
    id: 'hpdc-undercuts',
    sourceStatus: 'industry-consensus',
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

  {
    id: 'hpdc-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'hpdc',
    severity: 'medium',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.6,
    unit: '(p95-p5)/p50',
    rationale:
      'A heavy section next to a thin one is the last place to freeze and has no feed path once the gate has solidified, so it draws shrinkage porosity. It also distorts the casting as the two sections contract at different times.',
    fix: 'Core out the heavy sections to a uniform nominal wall and blend the transitions rather than stepping them.',
    source: 'Die-casting design guidance (uniform section thickness; heavy sections trap shrinkage porosity).',
  },
  {
    id: 'hpdc-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'hpdc',
    severity: 'high',
    title: 'Cored hole beyond the core-pin slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 10,
    unit: 'core L/D',
    rationale:
      'A cored hole is a steel pin standing in the die with molten aluminium injected around it at speed. Beyond about 10:1 the pin deflects under that pressure, the hole drifts, and the pin becomes a consumable that breaks mid-run and stops the cell.',
    fix: 'Shorten the cored depth and drill the rest, open the diameter, or core from both ends so each pin is half the length.',
    source: 'Die-casting design guidance (core pin L/D <= 10:1 for aluminium).',
  },

  // A die-cast rib may be RELATIVELY THICKER than a moulded one, and the band is
  // deliberately different for that reason: aluminium fills a thin section far
  // less readily than a thermoplastic, so a rib below about 60% of the wall
  // risks a cold shut, while the sink mark that caps a moulded rib at 60%
  // matters less on a casting that is machined or hidden.
  {
    id: 'hpdc-rib-thickness-max',
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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
    byMaterial: {
      'Aluminium 6061': { threshold: 3.0, source: 'Bend-radius guidance for 6061 in the T6 temper: 3 r/t minimum across the grain. 6061-T6 has low elongation and splits at the tight radii mild steel tolerates — the single most common material-blind DFM error on an aluminium bracket.' },
      'Aluminium 7075': { threshold: 4.0, source: 'Bend-radius guidance for 7075-T6: 4 r/t minimum and often more. 7075 is a bending-hostile alloy and is normally formed in the O or W temper and aged afterwards.' },
      'Steel (high-strength)': { threshold: 2.0, source: 'Bend-radius guidance for AHSS / high-strength low-alloy grades: 2 r/t and upward with strength. Higher yield means less uniform elongation before the outer fibre splits.' },
      'Stainless Steel 304': { threshold: 1.0, source: 'Bend-radius guidance for annealed 304: 1 r/t. Austenitic stainless work-hardens rapidly, so springback is large even though the minimum radius is not.' },
      'Steel (mild)': { threshold: 1.0, source: 'Bend-radius guidance for mild steel: 1 r/t, and 0.5 r/t is achievable on thin gauge with a sharp punch.' },
    },
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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
    sourceStatus: 'industry-consensus',
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

  {
    id: 'sm-hole-to-hole',
    sourceStatus: 'industry-consensus',
    process: 'sheet-metal',
    severity: 'medium',
    title: 'Holes too close together',
    measure: 'minHoleToHoleToThickness',
    compare: 'gte',
    threshold: 2,
    unit: 'gap/t',
    rationale:
      'The web of material between two punched holes is pulled in both directions as each is pierced. Below about two material thicknesses it distorts, tears, or wears the punch and die out of tolerance early.',
    fix: 'Move the holes apart to at least 2t edge-to-edge, or pierce them in separate stations so the web is not loaded twice at once.',
    source: 'Sheet-metal design guidance (minimum web between pierced holes, typically 2t).',
  },
  {
    id: 'sm-hole-to-edge',
    sourceStatus: 'industry-consensus',
    process: 'sheet-metal',
    severity: 'medium',
    title: 'Hole too close to the part edge',
    measure: 'minHoleToEdgeToThickness',
    compare: 'gte',
    threshold: 2,
    unit: 'gap/t',
    rationale:
      'A hole pierced near a trimmed edge pushes material sideways with nothing to react against, so the edge bulges and the hole goes oval. Below about two thicknesses the web can shear away entirely.',
    fix: 'Move the hole inboard to at least 2t from the edge, or pierce it before the blank is trimmed.',
    source: 'Sheet-metal design guidance (minimum edge distance for a pierced hole, typically 2t).',
  },
  {
    id: 'sm-bend-to-bend',
    sourceStatus: 'industry-consensus',
    process: 'sheet-metal',
    severity: 'medium',
    title: 'Parallel bends too close to form',
    measure: 'minBendToBendToThickness',
    compare: 'gte',
    threshold: 4,
    unit: 'flat/t',
    rationale:
      'A press brake needs flat material to clamp between two bends. When the land between parallel bends falls below roughly four thicknesses there is nothing for the tooling to hold, and the second bend pulls the first out of angle.',
    fix: 'Open the land between the bends to at least 4t, or form them in one operation with a dedicated tool.',
    source: 'Sheet-metal design guidance (minimum flat between parallel bends).',
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // THE CASTING FAMILIES ARE NOT ONE FAMILY.
  //
  // Every casting rule below used to be borrowed from high-pressure die casting:
  // "Gravity Die Casting" was routed to the HPDC rules and "Sand Casting" to
  // nothing at all. The wall bands alone show why that cannot stand — HPDC 1.5-4,
  // gravity 3-8, sand 4-12, investment 1.5-6 mm. A gravity casting judged at the
  // HPDC band fails the wall rule on every part, automatically, and is then
  // priced for a saving that does not exist.
  //
  // The physics behind the spread is heat. A die casting is injected into cooled
  // steel and freezes in milliseconds, so a thin section fills and a thick one
  // traps porosity. Sand insulates, so the casting cools slowly: thin sections
  // misrun before they fill, and thick ones are feedable through risers. Draft
  // follows the same logic — steel dies release at 1 degree, rammed sand needs
  // 1.5-3 to strip without tearing, and a wax pattern in investment casting
  // needs almost none.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── High-pressure die casting, zinc (hot chamber) ──────────────────────────
  {
    id: 'hpdc-zinc-wall-thickness-range',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'high',
    title: 'Wall thickness outside the zinc die-casting range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [0.6, 3.0],
    unit: 'mm',
    rationale:
      'Zinc runs at a far lower melting point than aluminium in a hot-chamber machine, so it fills sections aluminium cannot — 0.6 mm is routine and 0.4 mm is achievable on small parts. That thinness is the reason to choose zinc at all. Above about 3 mm the section is heavy, slow to freeze and porous, and the material cost of a dense alloy starts to dominate.',
    fix: 'Take advantage of the alloy: thin the nominal wall towards 1.0-1.5 mm and add ribs for stiffness. A zinc part left at an aluminium wall is paying for metal it does not need.',
    source: 'Zinc hot-chamber die-casting design guidance (ZAMAK): 0.6 mm practical minimum, 1.0-2.0 mm typical nominal.',
  },
  {
    id: 'hpdc-zinc-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Wall area below the minimum zinc die-casting draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 0.5,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'Zinc shrinks onto the die much less than aluminium and runs cooler, so it strips with about half the draft. Half a degree on an external wall is normal practice and holding an aluminium part\'s 1-2 degrees on a zinc part gives away dimensional accuracy for nothing.',
    fix: 'Allow 0.5 degrees on external walls and 1 degree on internal walls and cores.',
    source: 'Zinc die-casting design guidance (draft constants roughly half the aluminium values).',
  },
  {
    id: 'hpdc-zinc-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.6,
    unit: '(p95-p5)/p50',
    rationale:
      'A heavy section beside a thin one is the last place to freeze and has no feed path once the gate solidifies, so it draws shrinkage porosity and distorts as the two sections contract at different times.',
    fix: 'Core out the heavy sections to a uniform nominal wall and blend the transitions rather than stepping them.',
    source: 'Die-casting design guidance (uniform section thickness).',
  },
  {
    id: 'hpdc-zinc-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Undercuts require slides or lifters in the die',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'An undercut needs a slide or a loose core, which adds die cost and maintenance. Zinc dies carry slides more readily than aluminium dies because the alloy is far kinder to the tooling, so this is a cost question rather than a feasibility one.',
    fix: 'Re-orient the part on the parting line, or split the feature so it forms between the two die halves.',
    source: 'Die-casting design guidance (side actions and loose cores).',
  },
  {
    id: 'hpdc-zinc-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Cored hole beyond the core-pin slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 12,
    unit: 'core L/D',
    rationale:
      'A cast hole is made by a steel pin standing in the flow. Zinc enters cooler than aluminium, so the pin survives a longer reach before it bends or erodes, but a slender pin is still the first thing in the die to fail.',
    fix: 'Shorten the cored hole, open its diameter, or cast it partly and drill the rest.',
    source: 'Zinc die-casting design guidance (core-pin length-to-diameter limits).',
  },

  // ── Gravity die casting (permanent mould) ─────────────────────────────────
  {
    id: 'gdc-wall-thickness-range',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'high',
    title: 'Wall thickness outside the gravity die-casting range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [3.0, 8.0],
    unit: 'mm',
    rationale:
      'Gravity casting fills under its own head, not under pressure, so a thin section misruns before it fills — 3 mm is about the practical floor and 4-6 mm is normal. Because the mould is steel and cools quickly, sections beyond about 8 mm need risering to stay sound. This band is nothing like the die-casting band, and judging a gravity part at 1.0-3.5 mm fails it automatically.',
    fix: 'Hold 4-6 mm as the nominal wall. If the design needs a section thinner than 3 mm, gravity casting is the wrong process — look at high-pressure die casting.',
    source: 'Gravity / permanent-mould aluminium casting design guidance: 3 mm practical minimum, 4-6 mm typical.',
  },
  {
    id: 'gdc-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'high',
    title: 'Wall area below the minimum gravity die-casting draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 1.5,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'The casting solidifies slowly against a steel mould and grips it hard as it contracts, so it needs more draft than a die casting to strip without tearing or scoring the tool.',
    fix: 'Allow 1.5-2 degrees on external walls and 2-3 degrees on internal walls and cores.',
    source: 'Permanent-mould casting design guidance (draft above die-casting values because of the longer contact time).',
  },
  {
    id: 'gdc-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'high',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.7,
    unit: '(p95-p5)/p50',
    rationale:
      'Gravity casting relies on directional solidification: metal must freeze progressively towards a riser. An isolated heavy section freezes last with no feed path and draws a shrinkage cavity, which is the dominant defect in this process.',
    fix: 'Taper the section towards the risers so the casting freezes progressively, and core out isolated heavy masses.',
    source: 'Permanent-mould casting design guidance (directional solidification and riser feeding).',
  },
  {
    id: 'gdc-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'medium',
    title: 'Cored hole beyond the core slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 6,
    unit: 'core L/D',
    rationale:
      'Gravity die cores are steel or bonded sand and are not injected against, but a slender core still floats, distorts or breaks on extraction, and a sand core has no strength to spare.',
    fix: 'Shorten the cored hole, open its diameter, or drill it after casting.',
    source: 'Permanent-mould casting design guidance (core slenderness limits).',
  },

  // ── Sand casting ──────────────────────────────────────────────────────────
  {
    id: 'sand-wall-thickness-range',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'high',
    title: 'Wall thickness outside the sand-casting range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [4.0, 12.0],
    unit: 'mm',
    rationale:
      'Sand insulates, so the metal stays liquid longer and fills a long path — but the mould is weak and the section must carry itself, and below about 4 mm in aluminium (5 mm in iron) the casting misruns or the sand erodes. Because cooling is slow, sand tolerates far heavier sections than any die process.',
    fix: 'Hold 5-8 mm as the nominal wall. A part needing a 2 mm wall is not a sand casting.',
    source: 'Sand-casting design guidance: about 4 mm minimum in aluminium and 5 mm in grey iron; 5-10 mm typical nominal.',
  },
  {
    id: 'sand-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'high',
    title: 'Wall area below the minimum sand-casting draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 1.5,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'The pattern is drawn out of rammed sand. Without taper it tears the mould wall on the way out, and the casting carries the damage. Sand needs the most draft of any casting process.',
    fix: 'Allow 1.5-3 degrees on all drawn surfaces, and more on deep pockets.',
    source: 'Sand-casting design guidance (pattern draw taper, typically 1.5-3 degrees).',
  },
  {
    id: 'sand-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'medium',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.9,
    unit: '(p95-p5)/p50',
    rationale:
      'Slow cooling in sand gives a heavy section time to feed from a riser, so sand tolerates more section change than any die process — but an isolated hot spot with no feed path still draws shrinkage.',
    fix: 'Taper sections towards the risers and avoid isolated heavy bosses far from a feed path.',
    source: 'Sand-casting design guidance (feeding distance and hot spots).',
  },
  {
    id: 'sand-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'low',
    title: 'Undercuts require a core or a loose pattern piece',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'Sand casting handles undercuts more cheaply than any die process — a core box or a loose pattern piece, not a hydraulic slide in hardened steel. Each one still adds a core to make, set and remove, so the count is a cost driver rather than a feasibility limit.',
    fix: 'Where a core is unavoidable, design it to be set on prints at both ends so it cannot float.',
    source: 'Sand-casting design guidance (cores and loose pieces).',
  },
  {
    id: 'sand-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'medium',
    title: 'Cored hole beyond the sand-core slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 4,
    unit: 'core L/D',
    rationale:
      'A bonded sand core has almost no strength in bending and is buoyant in liquid metal. A slender core floats, sags or washes away, and the hole ends up bent or absent.',
    fix: 'Open the hole, support the core on prints at both ends, or drill after casting.',
    source: 'Sand-casting design guidance (core strength and buoyancy).',
  },

  // ── Investment casting ────────────────────────────────────────────────────
  {
    id: 'inv-wall-thickness-range',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'high',
    title: 'Wall thickness outside the investment-casting range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [1.5, 6.0],
    unit: 'mm',
    rationale:
      'The ceramic shell is preheated before pouring, so the metal stays fluid and fills thinner than sand allows — about 1.5 mm routinely and under 1 mm on small parts. Heavy sections are limited by feeding, as in any gravity process.',
    fix: 'Hold 2-4 mm as the nominal wall; investment casting is chosen for thin, complex sections, so leaving a heavy wall wastes the process.',
    source: 'Investment-casting design guidance: about 1.5 mm general minimum, 2-4 mm typical.',
  },
  {
    id: 'inv-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'low',
    title: 'Wall area below the minimum investment-casting draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 0.5,
    compare: 'lte',
    threshold: 10,
    unit: '% of wall area',
    rationale:
      'Nothing is drawn out of the ceramic shell — it is broken away. Draft is needed only to release the wax pattern from its own die, and zero-draft walls are routinely cast. This is the reason to choose investment casting for a part that cannot carry draft.',
    fix: 'Allow a nominal 0.5 degrees where it costs nothing; genuinely zero-draft walls are acceptable and should be discussed with the founder rather than redesigned.',
    source: 'Investment-casting design guidance (draft needed only for wax-pattern release).',
  },
  {
    id: 'inv-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'medium',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.7,
    unit: '(p95-p5)/p50',
    rationale:
      'The shell is a poor conductor, so an isolated heavy section stays liquid after its feed path has frozen and draws a shrinkage cavity.',
    fix: 'Blend section changes and place heavy masses where a feeder can reach them.',
    source: 'Investment-casting design guidance (feeding and hot spots).',
  },
  {
    id: 'inv-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'high',
    title: 'Cored hole beyond the ceramic-core slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 4,
    unit: 'core L/D',
    rationale:
      'An investment-cast internal passage is made by a ceramic core that has to survive wax injection, shell building, burnout and pouring, and then be leached out. Ceramic cores are the most fragile of any casting process.',
    fix: 'Open the passage, shorten it, or accept a drilled hole after casting.',
    source: 'Investment-casting design guidance (ceramic core fragility).',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMING FAMILIES. Roll forming and hydroforming are NOT press-brake
  // stamping, and the difference is the defining constraint of each: a roll
  // former can only make a CONSTANT cross-section, and a hydroformed tube can
  // only expand so far before it splits.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Roll forming ──────────────────────────────────────────────────────────
  {
    id: 'roll-section-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'roll-forming',
    severity: 'high',
    title: 'Section is not constant along the part',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.15,
    unit: '(p95-p5)/p50',
    rationale:
      'A roll former makes ONE profile continuously and cuts it to length. It cannot vary the section along the run — that is the whole nature of the process, and it is why roll forming is cheap per metre. A part whose section changes cannot be roll formed at all.',
    fix: 'Hold one constant profile and put any variation into secondary punching, or move to press-brake forming or stamping.',
    source: 'Roll-forming design guidance (constant cross-section is inherent to the process).',
  },
  {
    id: 'roll-bend-radius',
    sourceStatus: 'industry-consensus',
    process: 'roll-forming',
    severity: 'medium',
    title: 'Inside bend radius below one material thickness',
    measure: 'minBendRadiusToThickness',
    compare: 'gte',
    threshold: 1.0,
    unit: 'r/t',
    byMaterial: {
      'Aluminium 6061': { threshold: 3.0, source: 'Roll-forming guidance for 6061-T6: as in press braking, 3 r/t minimum across the grain.' },
      'Steel (high-strength)': { threshold: 2.0, source: 'Roll-forming guidance for high-strength grades: 2 r/t and upward with yield strength.' },
    },
    rationale:
      'Roll forming works the bend up gradually over many stations, so it is gentler than a press brake — but the outer fibre still has to stretch, and below about 1 r/t it splits.',
    fix: 'Open the corner radius, or add stations so the bend is developed over a longer run.',
    source: 'Roll-forming design guidance (minimum inside radius about 1 r/t for mild steel).',
  },
  {
    id: 'roll-flange-length',
    sourceStatus: 'industry-consensus',
    process: 'roll-forming',
    severity: 'medium',
    title: 'Flange too short for the rolls to grip',
    measure: 'minFlangeToThickness',
    compare: 'gte',
    threshold: 3,
    unit: 'flange/t',
    rationale:
      'A short flange has nothing for the rolls to hold and wanders, so the profile is out of tolerance along its length.',
    fix: 'Lengthen the flange to at least three material thicknesses, or form it in a secondary operation.',
    source: 'Roll-forming design guidance (minimum flange length).',
  },

  // ── Hydroforming ──────────────────────────────────────────────────────────
  {
    id: 'hydro-corner-radius',
    sourceStatus: 'industry-consensus',
    process: 'hydroforming',
    severity: 'high',
    title: 'Corner radius too tight for the forming pressure available',
    measure: 'minBendRadiusToThickness',
    compare: 'gte',
    threshold: 3.0,
    unit: 'r/t',
    rationale:
      'A hydroformed corner is filled by internal pressure pushing the wall into the die, and the pressure needed rises as the radius falls. Below about 3 r/t the tube thins and splits at the corner before the die is filled.',
    fix: 'Open the corner radii, or accept a two-stage form with an intermediate anneal.',
    source: 'Tube hydroforming design guidance (corner radius against forming pressure and wall thinning).',
  },
  {
    id: 'hydro-section-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'hydroforming',
    severity: 'high',
    title: 'Section varies more than the expansion limit allows',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.3,
    unit: '(p95-p5)/p50',
    rationale:
      'A hydroformed part starts as a tube of one wall thickness and thins wherever it expands. A large variation in the finished section means a large expansion ratio somewhere, and past roughly 30-40% expansion the wall splits.',
    fix: 'Reduce the largest expansion, start from a pre-bent tube closer to the final shape, or use a thicker starting gauge.',
    source: 'Tube hydroforming design guidance (expansion ratio and wall thinning limits).',
  },
  {
    id: 'hydro-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'hydroforming',
    severity: 'high',
    title: 'Undercuts prevent the die from opening',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'The formed tube is trapped in a two-part die that must open along one axis. An undercut locks the part in the tool.',
    fix: 'Re-orient the part relative to the die parting line, or split the feature so it forms between the halves.',
    source: 'Hydroforming design guidance (die opening and part extraction).',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK FORMING AND EXTRUSION.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Hot forging ───────────────────────────────────────────────────────────
  {
    id: 'forge-hot-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'forging-hot',
    severity: 'high',
    title: 'Wall area below the minimum hot-forging draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 5.0,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'A hot forging shrinks onto the die as it cools and is knocked out mechanically, so it needs far more draft than any casting — 3 degrees on external surfaces and 5-7 on internal ones is normal. This is the single largest difference between forging and casting geometry.',
    fix: 'Allow 3 degrees on external walls and 5-7 degrees on internal walls and pockets.',
    source: 'Closed-die hot forging design guidance (draft typically 3 degrees external, 5-7 degrees internal).',
  },
  {
    id: 'forge-hot-min-web',
    sourceStatus: 'industry-consensus',
    process: 'forging-hot',
    severity: 'high',
    title: 'Web too thin to forge',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 3.0,
    unit: 'mm',
    rationale:
      'Metal must flow to fill a thin web, and a thin web chills against the die before it fills. It also drives forging load up sharply, because the thinner the web the higher the pressure needed to make the material move.',
    fix: 'Thicken the web to at least 3 mm, or machine the thin region after forging.',
    source: 'Closed-die forging design guidance (minimum web thickness and forging load).',
  },
  {
    id: 'forge-hot-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'forging-hot',
    severity: 'high',
    title: 'Undercuts cannot be forged',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'A forging die has two halves and no slides. There is no forging equivalent of a side action: an undercut simply cannot be forged and must be machined afterwards.',
    fix: 'Remove the undercut from the forged shape and machine it as a secondary operation, or re-orient the part on the parting line.',
    source: 'Closed-die forging design guidance (two-part dies, no side actions).',
  },
  {
    id: 'forge-hot-rib-height',
    sourceStatus: 'industry-consensus',
    process: 'forging-hot',
    severity: 'medium',
    title: 'Rib too tall for the metal to fill',
    measure: 'maxRibHeightToWall',
    compare: 'lte',
    threshold: 4,
    unit: 'rib height / wall',
    rationale:
      'A tall, thin rib is the hardest thing to fill in a forging: the metal must flow furthest against the most die chilling, and an unfilled rib is scrap.',
    fix: 'Reduce the rib height, thicken it, or add generous fillets at its base so metal reaches the top.',
    source: 'Closed-die forging design guidance (rib height-to-width and die filling).',
  },

  // ── Cold forging ──────────────────────────────────────────────────────────
  {
    id: 'forge-cold-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'forging-cold',
    severity: 'low',
    title: 'Wall area below the minimum cold-forging draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 0.5,
    compare: 'lte',
    threshold: 10,
    unit: '% of wall area',
    rationale:
      'A cold forging does not shrink onto the die the way a hot one does, and it is ejected by a knock-out pin rather than being drawn. Near-zero draft is normal, which is a large part of why cold forging holds tolerances that hot forging cannot.',
    fix: 'Allow 0.5 degrees where the function permits; zero-draft walls are usually acceptable here.',
    source: 'Cold forging / cold heading design guidance (draft near zero because there is no thermal shrink onto the die).',
  },
  {
    id: 'forge-cold-min-web',
    sourceStatus: 'industry-consensus',
    process: 'forging-cold',
    severity: 'high',
    title: 'Web too thin for the forming load available',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 1.5,
    unit: 'mm',
    rationale:
      'Cold forging works the material below its recrystallisation temperature, so it work-hardens as it flows. A thin web needs very high pressure to fill and is where the tool cracks.',
    fix: 'Thicken the web, add an intermediate anneal, or machine the thin region afterwards.',
    source: 'Cold forging design guidance (forming pressure and tool life against web thickness).',
  },
  {
    id: 'forge-cold-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'forging-cold',
    severity: 'high',
    title: 'Undercuts cannot be cold forged',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'The part is ejected from a closed die by a knock-out pin along one axis. An undercut locks it in the tool.',
    fix: 'Machine the undercut as a secondary operation, or re-orient the part on the die axis.',
    source: 'Cold forging design guidance (axial ejection).',
  },

  // ── Extrusion ─────────────────────────────────────────────────────────────
  {
    id: 'extr-section-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'extrusion',
    severity: 'high',
    title: 'Section is not uniform enough for the die to run balanced',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.35,
    unit: '(p95-p5)/p50',
    rationale:
      'Metal flows faster through a thick part of the die than a thin one. A profile whose wall varies sharply comes out twisted or bowed, and the die has to be corrected by trial — which is why extruders charge more for an unbalanced section and reject the worst of them outright.',
    fix: 'Even out the wall across the profile, and where a thick region is structurally necessary, blend into it rather than stepping.',
    source: 'Aluminium extrusion design guidance (balanced metal flow and die correction).',
  },
  {
    id: 'extr-min-wall',
    sourceStatus: 'industry-consensus',
    process: 'extrusion',
    severity: 'high',
    title: 'Wall thinner than the die can hold',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 1.0,
    unit: 'mm',
    byMaterialFamily: {
      copper: { threshold: 1.5, source: 'Copper and brass extrusion guidance: a higher minimum than aluminium because the extrusion pressure and die wear are both greater.' },
    },
    rationale:
      'The die tongue that forms a thin wall is unsupported and deflects under extrusion pressure. Below about 1 mm in a solid aluminium profile the tongue chatters or breaks, and a hollow profile needs more again.',
    fix: 'Thicken the thinnest wall to 1.5-2 mm, especially on any hollow section.',
    source: 'Aluminium extrusion design guidance: about 1.0 mm minimum for a solid profile, 1.5-2.0 mm for a hollow.',
  },
  {
    id: 'extr-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'extrusion',
    severity: 'high',
    title: 'Feature blocks the profile leaving the die',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'An extrusion is a constant profile pushed through a fixed opening. Any feature that is not open along the extrusion axis cannot exist in the extruded shape and must be machined afterwards.',
    fix: 'Remove the feature from the profile and machine it after extrusion, or reconsider the extrusion axis.',
    source: 'Extrusion design guidance (constant profile along the extrusion axis).',
  },

  // ── Rubber moulding ───────────────────────────────────────────────────────
  {
    id: 'rubber-wall-thickness-range',
    sourceStatus: 'industry-consensus',
    process: 'rubber-moulding',
    severity: 'medium',
    title: 'Wall thickness outside the practical rubber-moulding range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [1.0, 6.0],
    unit: 'mm',
    rationale:
      'Rubber cures from the outside in, and cure time rises with the square of the section — a thick part is a slow part and risks an under-cured core. Below about 1 mm the uncured compound will not fill reliably.',
    fix: 'Hold 2-4 mm as the nominal section and hollow out heavy masses.',
    source: 'Rubber moulding design guidance (cure time against section thickness).',
  },
  {
    id: 'rubber-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'rubber-moulding',
    severity: 'low',
    title: 'Wall area below the minimum rubber-moulding draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 0.5,
    compare: 'lte',
    threshold: 15,
    unit: '% of wall area',
    rationale:
      'Rubber is elastic and strips off modest undercuts and zero-draft walls that would lock a rigid part in the tool. Draft helps but is rarely the constraint.',
    fix: 'Allow 0.5-1 degree where it is free; a zero-draft rubber wall is usually acceptable.',
    source: 'Rubber moulding design guidance (elastic recovery permits low draft).',
  },
  {
    id: 'rubber-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'rubber-moulding',
    severity: 'medium',
    title: 'Non-uniform section cures unevenly',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.8,
    unit: '(p95-p5)/p50',
    rationale:
      'The cure is set by the thickest section, so a part with one heavy region holds the whole press open while the thin regions over-cure and lose elongation.',
    fix: 'Even out the section, or hollow the heavy region.',
    source: 'Rubber moulding design guidance (cure uniformity).',
  },

  // ── Composite layup / RTM ─────────────────────────────────────────────────
  {
    id: 'rtm-wall-thickness-range',
    sourceStatus: 'industry-consensus',
    process: 'composite-rtm',
    severity: 'medium',
    title: 'Laminate thickness outside the practical RTM range',
    measure: 'wallP50Mm',
    compare: 'between',
    threshold: [1.5, 10.0],
    unit: 'mm',
    rationale:
      'A laminate is built from plies of finite thickness, so a very thin wall has too few plies to be laid up repeatably, and a very thick one is slow to wet out and exotherms as it cures.',
    fix: 'Hold 2-5 mm and vary stiffness through the lay-up and ply orientation rather than through thickness.',
    source: 'RTM / resin-transfer moulding design guidance (ply count and cure exotherm).',
  },
  {
    id: 'rtm-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'composite-rtm',
    severity: 'medium',
    title: 'Wall area below the minimum RTM draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 1.0,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'A cured laminate is stiff and grips a matched tool hard. Without draft it cannot be released without damaging the part or the tool surface.',
    fix: 'Allow 1-3 degrees on all tool-contact surfaces.',
    source: 'Composite tooling design guidance (part release from matched moulds).',
  },
  {
    id: 'rtm-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'composite-rtm',
    severity: 'high',
    title: 'Undercuts trap the cured part in the tool',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'A cured laminate has no give. An undercut needs a split or collapsible tool, which multiplies tooling cost and cycle time.',
    fix: 'Re-orient the part on the tool split line, or bond the undercut feature on as a secondary part.',
    source: 'Composite tooling design guidance (split tools and collapsible cores).',
  },

];

/**
 * Rules deliberately NOT in the catalogue, and why.
 *
 * Each of these was named in the build plan and is a real design driver. None is
 * written, because every one needs a measurement the geometry pipeline does not
 * produce — and a rule with no measurement can only ever report NOT EVALUATED.
 * Shipping five of those would inflate the rule count while lowering the
 * coverage figure on every part forever, which is precisely the criticism that
 * the sheet-metal family earned before bend recognition existed.
 *
 * This list is exported so the report can state the gap rather than leave a
 * reader to infer that the catalogue is complete.
 */
export const UNWRITTEN_RULES = [
  {
    topic: 'Tool HOLDER and machine-envelope collision (machining)',
    needs: 'The holder geometry, the spindle nose and the machine work envelope. The shank-clearance sweep behind `mach-tool-access` now measures whether a cutter of a given diameter can reach each face along each approach direction, which is the larger half of this — but a face it calls reachable can still be unreachable once the holder is on the tool.',
    proxy: '`mach-tool-access` measures shank clearance and reports it as a LOWER bound on the access problem.',
  },
  {
    topic: 'Tolerance stack-up (machining)',
    needs: 'GD&T and datum callouts, which live in the drawing or in PMI annotations — not in the solid geometry a STEP file carries.',
    proxy: null,
  },
  {
    topic: 'Sink and warp prediction (injection moulding)',
    needs: 'A mould-flow simulation: fill pattern, cooling layout and differential shrinkage.',
    proxy: 'Wall uniformity and rib proportions cover the two geometric causes the engine CAN see.',
  },
  {
    topic: 'Blank nesting utilisation (sheet metal)',
    needs: 'A flat pattern and a strip layout. Unfolding a formed part is a solver in its own right and the recogniser does not do it.',
    proxy: null,
  },
  {
    topic: 'Press tonnage and station count (sheet metal)',
    needs: 'Cut perimeter from the flat pattern, plus a progressive-die strip layout. The same unfolding gap as nesting.',
    proxy: 'stampingFeatureCost estimates forming cost from the recognised bend count, which is a cost output rather than a design rule.',
  },
];

/** Rules grouped by process, in the order the report should present them. */
export function rulesFor(process) {
  return DFM_RULES.filter(r => r.process === process);
}

export const RULE_BY_ID = Object.fromEntries(DFM_RULES.map(r => [r.id, r]));
