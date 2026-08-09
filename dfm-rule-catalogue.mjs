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
  // ── The permanent-mould and specialist casting families ──────────────────
  // Each one exists because its geometric limits genuinely differ from its
  // nearest neighbour's, not because the process has a different name. Where
  // the limits are the SAME — vacuum-assisted die casting against plain HPDC —
  // the registry routes the process to the existing family and says why.
  lpdc: 'Low-pressure die casting',
  'squeeze-casting': 'Squeeze casting',
  'semi-solid': 'Semi-solid casting (thixo / rheo)',
  'shell-mould': 'Shell mould casting',
  centrifugal: 'Centrifugal casting',
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
    byMaterialFamily: {
      titanium: { threshold: 2, source: 'Every titanium setup costs more than a steel one: the fixture must be more rigid, the cutting data are slower, and re-datuming a part that springs is harder. Fewer setups matter more.' },
    },
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
    byMaterialFamily: {
      ferrous: { threshold: 0.8, source: 'Minimum machined web in steel: 0.8 mm. Steel is three times stiffer than aluminium, so it deflects less under the same cutting force and tolerates a thinner web — the opposite of what "harder material, thicker wall" intuition suggests.' },
      castiron: { threshold: 1.0, source: 'Minimum machined web in cast iron: 1.0 mm. Stiff, but brittle, so a thin web chips at the exit rather than deflecting.' },
      titanium: { threshold: 1.2, source: 'Minimum machined web in titanium: 1.2 mm. Titanium is only half as stiff as steel and work-hardens under a rubbing tool, so a thin web chatters badly.' },
      aluminium: { threshold: 1.0, source: 'Minimum machined web in aluminium: 1.0 mm. Low cutting forces offset the low stiffness.' },
      magnesium: { threshold: 1.2, source: 'Minimum machined web in magnesium: 1.2 mm — the least stiff of the common structural metals.' },
      plastic: { threshold: 2.0, source: 'Minimum machined web in an engineering thermoplastic: 2.0 mm. Two orders of magnitude less stiff than steel, and it heats and creeps away from the cutter.' },
    },
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
    byMaterialFamily: {
      aluminium: { threshold: 6, source: 'Drill depth in aluminium: 6x diameter with a standard jobber drill. Short chips and high thermal conductivity keep the flutes clear further than in steel.' },
      ferrous: { threshold: 4, source: 'Drill depth in steel: 4x diameter before pecking. Long stringy chips pack the flutes.' },
      castiron: { threshold: 5, source: 'Drill depth in cast iron: 5x diameter. Graphite flake breaks the chip, which helps evacuation.' },
      titanium: { threshold: 3, source: 'Drill depth in titanium: 3x diameter. Poor thermal conductivity puts the heat into the tool, not the chip, so the drill fails before the hole is finished.' },
      plastic: { threshold: 6, source: 'Drill depth in thermoplastic: 6x diameter, limited by melting and re-welding of the chip rather than by tool wear.' },
    },
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
      'PC/ABS blend': { threshold: [1.2, 3.5], source: 'PC/ABS moulding guidance: 1.2 mm minimum. The blend flows better than neat PC and holds a fuller wall than ABS alone, which is why it dominates automotive interior trim.' },
      'PBT': { threshold: [0.8, 3.0], source: 'PBT moulding guidance: 0.8 mm minimum. Very fluid, which is why it fills the thin walls of an electrical connector body.' },
      'PP-T20 (talc-filled)': { threshold: [1.2, 4.0], source: '20% talc-filled PP: a fuller wall than neat PP. Mineral filler raises viscosity, and the compound is chosen for stiffness in thick bumper and trim sections.' },
      'PET': { threshold: [1.0, 3.5], source: 'PET moulding guidance: 1.0 mm minimum; crystallisation rate makes the wall and the mould temperature interdependent.' },
      'PPS': { threshold: [0.8, 3.0], source: 'PPS moulding guidance: 0.8 mm minimum. Extremely fluid at melt temperature — it is chosen for thin, hot, chemically-attacked parts.' },
      'PEEK': { threshold: [1.0, 4.0], source: 'PEEK moulding guidance: 1.0 mm minimum, and every millimetre is expensive — the resin is the dominant cost, so a thick wall here is a direct piece-price problem.' },
      'TPU (thermoplastic PU)': { threshold: [1.0, 4.0], source: 'TPU moulding guidance: 1.0 mm minimum; a soft, high-viscosity melt that needs a generous gate as well as a generous wall.' },
      'HDPE': { threshold: [1.0, 5.0], source: 'HDPE moulding guidance: 1.0 mm minimum, and it tolerates a heavier wall than most because it is cheap and dimensionally forgiving.' },
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
    byMaterial: {
      'PBT': { threshold: 0.5, source: 'PBT is semi-crystalline and shrinks heavily; a rib above half the wall reads through the show face as a sink line.' },
      'HDPE': { threshold: 0.5, source: 'HDPE has the highest shrinkage of the commodity resins — a full-thickness rib sinks visibly.' },
      'PP-T20 (talc-filled)': { threshold: 0.6, source: 'Talc suppresses shrinkage, so the filled compound hides a fuller rib than neat PP.' },
      'POM (Acetal)': { threshold: 0.5, source: 'Acetal shrinks about 2% — twice an amorphous resin — so a rib at 60% of the wall sinks visibly on the show face. 50% is the practical ceiling.' },
      'PA6 (Nylon)': { threshold: 0.5, source: 'Nylon is semi-crystalline and shrinks heavily; a rib above half the wall reads through as a sink mark.' },
      'PA66-GF30 (glass-filled)': { threshold: 0.6, source: 'Glass fill suppresses shrinkage in the flow direction, so a filled nylon tolerates a fuller rib than the unfilled resin.' },
      'ABS': { threshold: 0.6, source: 'ABS is amorphous and shrinks about 0.5%, so it hides a fuller rib.' },
      'Polycarbonate (PC)': { threshold: 0.6, source: 'PC is amorphous and low-shrink; the limit is sink on a gloss surface rather than the rib itself.' },
    },
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
    byMaterial: {
      'PA66-GF30 (glass-filled)': { threshold: 0.5, source: 'A 30% glass compound is far more viscous than the unfilled resin, so a rib below half the wall will not fill and pack before the gate freezes.' },
      'Polypropylene (PP)': { threshold: 0.3, source: 'PP is the easiest-flowing commodity resin and fills a thinner rib than any engineering grade.' },
    },
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
    byMaterial: {
      'POM (Acetal)': { threshold: 2.5, source: 'Acetal shrinks about 2%, so a tall rib pulls a visible sink on the opposite face long before it fails to fill.' },
      'PA6 (Nylon)': { threshold: 2.5, source: 'Nylon shrinks heavily and a tall rib reads through as a sink line on the show surface.' },
    },
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
    byMaterial: {
      'PA66-GF30 (glass-filled)': { threshold: 2.5, source: 'A filled compound is stiff and abrasive; a tall boss cored in it wears the pin and will not pack to the top.' },
      'Polycarbonate (PC)': { threshold: 3, source: 'PC is notch-sensitive, so a tall boss concentrates stress at its base and crazes under load rather than failing to fill.' },
    },
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
    byMaterialFamily: {
      magnesium: { threshold: 8, source: 'Magnesium shrinks onto the die less than aluminium and releases more readily, so a larger share of wall area below the nominal draft is tolerable before ejection becomes the problem.' },
    },
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
    byMaterialFamily: {
      magnesium: { threshold: 12, source: 'Magnesium enters the die cooler than aluminium and erodes core pins less, so a longer pin survives production.' },
    },
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
    byMaterialFamily: {
      magnesium: { threshold: 0.5, source: 'Magnesium is more fluid than aluminium and fills a thinner rib, which is a large part of why magnesium castings are ribbed rather than thickened.' },
    },
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
    byMaterialFamily: {
      magnesium: { threshold: 4, source: 'Magnesium fills a taller rib than aluminium at the same thickness, because it enters the die with lower viscosity.' },
    },
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
      'Steel DP600 (dual-phase)': { threshold: 2.5, source: 'Bend-radius guidance for DP600: 2.5 r/t. A dual-phase steel gets its strength from hard martensite islands in soft ferrite, and those islands are where a tight bend initiates the crack.' },
      'Steel DP980 (dual-phase)': { threshold: 4.0, source: 'Bend-radius guidance for DP980: 4 r/t and upward. At this strength level the uniform elongation is small enough that bendability, not springback, is the binding constraint.' },
      'Steel 22MnB5 (press-hardened)': { threshold: 6.0, source: 'A press-hardened 22MnB5 part is formed HOT and quenched in the die; the finished part is fully martensitic at about 1500 MPa and is not cold formed at all. Any bend in the CAD must have been made in the hot stage — this figure exists to flag a feature that assumes cold forming of a grade that cannot be cold formed.' },
      'Stainless Steel 316L': { threshold: 1.0, source: 'Bend-radius guidance for annealed 316L: 1 r/t, as 304. Austenitic stainless work-hardens rapidly, so springback is large even where the minimum radius is not.' },
      'Stainless Steel 430': { threshold: 1.5, source: 'Bend-radius guidance for ferritic 430: 1.5 r/t. Ferritic stainless has lower ductility than the austenitic grades and is more prone to orange-peel and edge cracking.' },
      'Aluminium 5052 (sheet)': { threshold: 1.0, source: 'Bend-radius guidance for 5052-H32: 1 r/t. Its formability is precisely why 5052 is the default aluminium sheet grade — three times better than 6061-T6 on this measure.' },
      'Aluminium 6082': { threshold: 3.0, source: 'Bend-radius guidance for 6082-T6: 3 r/t, as 6061-T6. The European structural equivalent behaves the same way in bending.' },
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
    byMaterial: {
      'Steel DP980 (dual-phase)': { threshold: 1.5, source: 'Minimum pierced hole in DP980: 1.5x thickness. Punch force scales with strength and slender punches snap.' },
      'Steel 22MnB5 (press-hardened)': { threshold: 2.5, source: 'A hardened 22MnB5 part is not pierced at all — holes are cut before hardening or lasered afterwards. This threshold flags a hole that assumes conventional piercing of a martensitic grade.' },
      'Stainless Steel 316L': { threshold: 1.2, source: 'Minimum pierced hole in 316L: 1.2x thickness, as 304 — the austenitic work-hardening rim is what sets it.' },
      'Stainless Steel 304': { threshold: 1.2, source: 'Minimum pierced hole in annealed 304: 1.2x thickness. Austenitic stainless work-hardens as the punch enters, so it needs a larger hole than mild steel to avoid punch breakage.' },
      'Steel (high-strength)': { threshold: 1.5, source: 'Minimum pierced hole in AHSS/HSLA: 1.5x thickness and upward with yield strength — the punch force scales with strength and slender punches snap.' },
      'Aluminium 6061': { threshold: 1.0, source: 'Minimum pierced hole in 6061: 1.0x thickness.' },
    },
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
    byMaterial: {
      'Aluminium 6061': { threshold: 4, source: 'Minimum flange in 6061-T6: 4x thickness. The larger bend radius the alloy demands consumes more of the flange in the bend allowance, so less flat remains for the tooling to grip.' },
      'Steel (high-strength)': { threshold: 4, source: 'Minimum flange in AHSS: 4x thickness, for the same reason — a larger minimum radius eats the flat.' },
    },
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
    byMaterial: {
      'Steel DP980 (dual-phase)': { threshold: 2.5, source: 'Minimum web between pierced holes in DP980: 2.5x thickness — a high-strength web tears rather than stretching.' },
      'Steel (high-strength)': { threshold: 2.5, source: 'Minimum web between pierced holes in AHSS: 2.5x thickness. A high-strength web has less uniform elongation and tears rather than stretching.' },
      'Stainless Steel 304': { threshold: 2.5, source: 'Minimum web between pierced holes in 304: 2.5x thickness, because the work-hardened rim of the first hole embrittles the web for the second.' },
    },
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
    byMaterial: {
      'Steel DP600 (dual-phase)': { threshold: 2.5, source: 'Minimum edge distance in DP600: 2.5x thickness. Dual-phase sheared edges carry micro-cracks at the ferrite/martensite boundaries and are notoriously sensitive to edge stretching.' },
      'Steel DP980 (dual-phase)': { threshold: 3.0, source: 'Minimum edge distance in DP980: 3x thickness. Sheared-edge ductility is the classic failure mode of the highest-strength dual-phase grades.' },
      'Steel (high-strength)': { threshold: 2.5, source: 'Minimum edge distance in AHSS: 2.5x thickness — the sheared edge is already work-hardened and cracks propagate from it.' },
    },
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
    byMaterial: {
      'Aluminium 6061': { threshold: 6, source: 'Minimum flat between parallel bends in 6061-T6: 6x thickness. The bend radius is three times the mild-steel figure, so the land the brake needs grows with it.' },
      'Steel (high-strength)': { threshold: 5, source: 'Minimum flat between parallel bends in AHSS: 5x thickness, and springback pulls the first bend out of angle as the second is formed.' },
    },
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
  {
    id: 'sm-min-aperture',
    sourceStatus: 'industry-consensus',
    process: 'sheet-metal',
    severity: 'medium',
    title: 'Cut-out smaller than the material thickness',
    measure: 'minApertureToThickness',
    compare: 'gte',
    threshold: 1,
    unit: 'size/t',
    byMaterial: {
      'Steel DP980 (dual-phase)': { threshold: 1.5, source: 'Minimum aperture in DP980: 1.5x thickness. Punch force scales with strength and a slender punch snaps whatever its shape.' },
      'Stainless Steel 304': { threshold: 1.2, source: 'Minimum aperture in 304: 1.2x thickness — austenitic stainless work-hardens against the punch as it enters.' },
    },
    rationale:
      'A punch narrower than the sheet is thick buckles under the piercing load, and the shape of the aperture does not change that — a 3 mm slot in 4 mm plate breaks the same punch a 3 mm hole would. This is the same limit `sm-hole-diameter` applies to round holes, extended to the slots, obrounds and shaped cut-outs that make up most of a real stamping.',
    fix: 'Open the smallest cut-out to at least one material thickness across, or laser it rather than piercing it and price the slower operation.',
    source: 'Sheet-metal piercing guidance (punch slenderness), applied to the aperture\'s size rather than to a diameter it may not have.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPTH FOR THE FAMILIES THAT HAD ONLY A HEADLINE RULE.
  //
  // Gravity die, sand, investment, zinc HPDC, roll forming, hydroforming,
  // forging and RTM each arrived with three or four rules — enough to say the
  // family existed, not enough to review a part with. What follows is the same
  // physics the older families already check, at each process's own numbers:
  // the thinnest LOCAL section (a median wall can be healthy while one web
  // misruns, and a misrun is scrap rather than a tolerance), rib proportions
  // against the nominal wall, boss slenderness against the core that makes it,
  // and section uniformity where the process cares.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gdc-min-section',
    byMaterialFamily: {
      copper: { threshold: 3.5, source: 'Gravity-cast copper alloys chill hard against a steel mould, so the local minimum sits above the aluminium figure.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'high',
    title: 'Local section below the process minimum',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 2.5,
    unit: 'mm',
    rationale:
      'Gravity casting fills under its own head. The MEDIAN wall can be healthy while one thin web misruns, and a misrun is scrap rather than a tolerance problem — so the thinnest place is checked separately from the nominal.',
    fix: 'Thicken the thinnest region, or move the feature to where the section is already full.',
    source: 'Process minimum-section guidance. Checked on the 5th-percentile wall, which is the thinnest measured place rather than the nominal.',
  },
  {
    id: 'sand-min-section',
    byMaterialFamily: {
      ferrous: { threshold: 5.0, source: 'Sand-cast steel: the least fluid of the common cast metals, so a local web below 5 mm misruns even where the nominal wall is healthy.' },
      castiron: { threshold: 4.0, source: 'Sand-cast grey iron: more fluid than steel thanks to its high carbon and silicon, so it carries a thinner local web.' },
      copper: { threshold: 4.0, source: 'Sand-cast bronze and brass: fluid, but they oxidise on the pour, and a thin section skins over before it fills.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'high',
    title: 'Local section below the process minimum',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 3.5,
    unit: 'mm',
    rationale:
      'A sand mould is weak and the metal must carry itself through it. One thin web below about 3.5 mm in aluminium misruns or erodes the sand into the casting, whatever the median section says.',
    fix: 'Thicken the thinnest region, or move the feature to where the section is already full.',
    source: 'Process minimum-section guidance. Checked on the 5th-percentile wall, which is the thinnest measured place rather than the nominal.',
  },
  {
    id: 'inv-min-section',
    byMaterialFamily: {
      ferrous: { threshold: 1.6, source: 'Investment-cast steel: the shell is preheated, but steel still misruns before aluminium does.' },
      titanium: { threshold: 2.0, source: 'Investment-cast titanium: poured in vacuum and reactive with the shell, so a thin local section comes out with an alpha case that has to be machined off.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'high',
    title: 'Local section below the process minimum',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 1.2,
    unit: 'mm',
    rationale:
      'The preheated shell keeps metal fluid a long way, but below about 1.2 mm even investment casting misruns. This is the process floor, not the design target.',
    fix: 'Thicken the thinnest region, or move the feature to where the section is already full.',
    source: 'Process minimum-section guidance. Checked on the 5th-percentile wall, which is the thinnest measured place rather than the nominal.',
  },
  {
    id: 'hpdc-zinc-min-section',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'high',
    title: 'Local section below the process minimum',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 0.5,
    unit: 'mm',
    rationale:
      'Zinc fills thinner than any other die-cast alloy, and 0.5 mm is roughly where even zinc stops. A local web thinner than the nominal wall is where a short shot starts.',
    fix: 'Thicken the thinnest region, or move the feature to where the section is already full.',
    source: 'Process minimum-section guidance. Checked on the 5th-percentile wall, which is the thinnest measured place rather than the nominal.',
  },
  {
    id: 'rubber-min-section',
    sourceStatus: 'industry-consensus',
    process: 'rubber-moulding',
    severity: 'high',
    title: 'Local section below the process minimum',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 0.8,
    unit: 'mm',
    rationale:
      'Uncured rubber is stiff and slow-flowing. A local section below about 0.8 mm will not fill before the compound scorches.',
    fix: 'Thicken the thinnest region, or move the feature to where the section is already full.',
    source: 'Process minimum-section guidance. Checked on the 5th-percentile wall, which is the thinnest measured place rather than the nominal.',
  },
  {
    id: 'rtm-min-section',
    sourceStatus: 'industry-consensus',
    process: 'composite-rtm',
    severity: 'high',
    title: 'Local section below the process minimum',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 1.0,
    unit: 'mm',
    rationale:
      'A laminate cannot be thinner than the plies it is built from. Below about 1 mm there are too few plies to lay up repeatably and the resin flow front stalls.',
    fix: 'Thicken the thinnest region, or move the feature to where the section is already full.',
    source: 'Process minimum-section guidance. Checked on the 5th-percentile wall, which is the thinnest measured place rather than the nominal.',
  },
  {
    id: 'hydro-min-section',
    sourceStatus: 'industry-consensus',
    process: 'hydroforming',
    severity: 'high',
    title: 'Local section below the process minimum',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 0.8,
    unit: 'mm',
    rationale:
      'The tube thins where it expands, and the thinnest surviving section is what bursts. It is the measure that predicts the failure, not the average.',
    fix: 'Thicken the thinnest region, or move the feature to where the section is already full.',
    source: 'Process minimum-section guidance. Checked on the 5th-percentile wall, which is the thinnest measured place rather than the nominal.',
  },
  {
    id: 'forge-hot-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'forging-hot',
    severity: 'medium',
    title: 'Section varies more than the process tolerates',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.9,
    unit: '(p95-p5)/p50',
    rationale:
      'Metal flows from thick to thin under the die, and a large section change means the thin region fills last, against the most die chilling. It is also where the die cracks, because the pressure needed to fill it is highest.',
    fix: 'Even out the section and add generous fillets so metal reaches the thin regions.',
    source: 'Process section-uniformity guidance.',
  },
  {
    id: 'forge-cold-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'forging-cold',
    severity: 'medium',
    title: 'Section varies more than the process tolerates',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.7,
    unit: '(p95-p5)/p50',
    rationale:
      'Cold forging work-hardens as it flows, so a large section change means the last region to fill is also the hardest to fill. Tool life is set by that region.',
    fix: 'Even out the section, or split the shape across two blows with an intermediate anneal.',
    source: 'Process section-uniformity guidance.',
  },
  {
    id: 'rtm-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'composite-rtm',
    severity: 'medium',
    title: 'Section varies more than the process tolerates',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.8,
    unit: '(p95-p5)/p50',
    rationale:
      'Resin flows fastest through the thickest part of the preform, so an uneven laminate traps dry spots at the flow-front convergence. Thickness change is also where a laminate delaminates.',
    fix: 'Even out the ply count, and taper thickness changes over at least 20:1 rather than stepping them.',
    source: 'Process section-uniformity guidance.',
  },
  {
    id: 'gdc-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'medium',
    title: 'Undercuts complicate the tool',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'A permanent mould opens on a fixed axis. An undercut needs a loose piece or a sand core set into the steel die, which adds a core-making operation and a setting step to every cycle.',
    fix: 'Re-orient the part on the mould split, or design the feature to be formed by the sand core that is already there.',
    source: 'Process tooling guidance (split lines, loose pieces and cores).',
  },
  {
    id: 'inv-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'low',
    title: 'Undercuts complicate the tool',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'The ceramic shell is broken away, so the CASTING has no undercut problem — but the wax pattern still has to leave its own die, and that die is a two-part tool. An undercut moves the cost into the wax tooling rather than removing it.',
    fix: 'Re-orient the pattern on its die split, or accept a loose piece in the wax tool.',
    source: 'Process tooling guidance (split lines, loose pieces and cores).',
  },
  {
    id: 'rubber-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'rubber-moulding',
    severity: 'low',
    title: 'Undercuts complicate the tool',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'Rubber strips off undercuts that would lock a rigid part in the tool — that elasticity is a genuine design freedom. Each one still slows demoulding and eventually tears the part, so the count is a cycle-time driver.',
    fix: 'Keep undercuts shallow enough to strip, or split the tool where they are deep.',
    source: 'Process tooling guidance (split lines, loose pieces and cores).',
  },
  {
    id: 'gdc-rib-thickness-max',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'medium',
    title: 'Rib heavier than the wall it stands on',
    measure: 'maxRibThicknessToWall',
    compare: 'lte',
    threshold: 0.8,
    unit: 'rib/wall',
    rationale:
      'A gravity casting freezes slowly, so a rib fuller than about 80% of the wall becomes a hot spot with no feed path and draws shrinkage into the junction.',
    fix: 'Thin the rib, or add two thinner ribs instead of one heavy one.',
    source: 'Casting rib-proportion guidance (rib thickness against nominal wall).',
  },
  {
    id: 'gdc-rib-thickness-min',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'medium',
    title: 'Rib too thin to fill before it freezes',
    measure: 'minRibThicknessToWall',
    compare: 'gte',
    threshold: 0.5,
    unit: 'rib/wall',
    rationale:
      'A rib is the last thing to fill and the first thing to freeze, because it presents the most surface for its volume. Below this fraction of the nominal wall it will not fill reliably.',
    fix: 'Thicken the rib towards the process minimum, or shorten it so the metal has less distance to travel.',
    source: 'Casting rib-proportion guidance (fill limit against nominal wall).',
  },
  {
    id: 'gdc-rib-height',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'low',
    title: 'Rib taller than the wall can support',
    measure: 'maxRibHeightToWall',
    compare: 'lte',
    threshold: 4,
    unit: 'rib height/wall',
    rationale:
      'A tall rib must fill against die chilling along its whole length, and it also concentrates stress at its base where the section changes.',
    fix: 'Reduce the rib height, or use more shorter ribs and generous base fillets.',
    source: 'Casting rib-proportion guidance (height against nominal wall).',
  },
  {
    id: 'sand-rib-thickness-max',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'medium',
    title: 'Rib heavier than the wall it stands on',
    measure: 'maxRibThicknessToWall',
    compare: 'lte',
    threshold: 1.0,
    unit: 'rib/wall',
    rationale:
      'Sand cools slowest of all, so it tolerates the fullest ribs — but a rib heavier than the wall it stands on inverts the freezing order and pulls a shrinkage cavity into the joint.',
    fix: 'Thin the rib, or add two thinner ribs instead of one heavy one.',
    source: 'Casting rib-proportion guidance (rib thickness against nominal wall).',
  },
  {
    id: 'sand-rib-thickness-min',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'medium',
    title: 'Rib too thin to fill before it freezes',
    measure: 'minRibThicknessToWall',
    compare: 'gte',
    threshold: 0.6,
    unit: 'rib/wall',
    rationale:
      'A rib is the last thing to fill and the first thing to freeze, because it presents the most surface for its volume. Below this fraction of the nominal wall it will not fill reliably.',
    fix: 'Thicken the rib towards the process minimum, or shorten it so the metal has less distance to travel.',
    source: 'Casting rib-proportion guidance (fill limit against nominal wall).',
  },
  {
    id: 'sand-rib-height',
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'low',
    title: 'Rib taller than the wall can support',
    measure: 'maxRibHeightToWall',
    compare: 'lte',
    threshold: 4,
    unit: 'rib height/wall',
    rationale:
      'A tall rib must fill against die chilling along its whole length, and it also concentrates stress at its base where the section changes.',
    fix: 'Reduce the rib height, or use more shorter ribs and generous base fillets.',
    source: 'Casting rib-proportion guidance (height against nominal wall).',
  },
  {
    id: 'hpdc-zinc-rib-thickness-max',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Rib heavier than the wall it stands on',
    measure: 'maxRibThicknessToWall',
    compare: 'lte',
    threshold: 1.0,
    unit: 'rib/wall',
    rationale:
      'Zinc fills thin ribs readily, which is why zinc parts are ribbed rather than thick. A rib heavier than the wall wastes that advantage and slows the cycle.',
    fix: 'Thin the rib, or add two thinner ribs instead of one heavy one.',
    source: 'Casting rib-proportion guidance (rib thickness against nominal wall).',
  },
  {
    id: 'hpdc-zinc-rib-thickness-min',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Rib too thin to fill before it freezes',
    measure: 'minRibThicknessToWall',
    compare: 'gte',
    threshold: 0.5,
    unit: 'rib/wall',
    rationale:
      'A rib is the last thing to fill and the first thing to freeze, because it presents the most surface for its volume. Below this fraction of the nominal wall it will not fill reliably.',
    fix: 'Thicken the rib towards the process minimum, or shorten it so the metal has less distance to travel.',
    source: 'Casting rib-proportion guidance (fill limit against nominal wall).',
  },
  {
    id: 'hpdc-zinc-rib-height',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'low',
    title: 'Rib taller than the wall can support',
    measure: 'maxRibHeightToWall',
    compare: 'lte',
    threshold: 5,
    unit: 'rib height/wall',
    rationale:
      'A tall rib must fill against die chilling along its whole length, and it also concentrates stress at its base where the section changes.',
    fix: 'Reduce the rib height, or use more shorter ribs and generous base fillets.',
    source: 'Casting rib-proportion guidance (height against nominal wall).',
  },
  {
    id: 'hpdc-zinc-boss-height',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Boss taller than the core pin can hold',
    measure: 'maxBossHeightToDia',
    compare: 'lte',
    threshold: 4,
    unit: 'height/dia',
    rationale:
      'A tall boss is cored by a pin standing in the flow, and the taller it is the more it deflects and the sooner it erodes. Zinc is kinder to pins than aluminium but the geometry still governs.',
    fix: 'Shorten the boss, widen it, or support it with ribs to its base.',
    source: 'Die-casting boss-proportion guidance.',
  },
  {
    id: 'gdc-boss-height',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'medium',
    title: 'Boss taller than the core can hold',
    measure: 'maxBossHeightToDia',
    compare: 'lte',
    threshold: 3,
    unit: 'height/dia',
    rationale:
      'A gravity-cast boss is cored by steel or bonded sand and neither is injected against, but a slender core still floats and distorts as the metal rises around it.',
    fix: 'Shorten the boss, widen it, or cast it solid and drill afterwards.',
    source: 'Permanent-mould boss-proportion guidance.',
  },
  {
    id: 'roll-hole-to-bend',
    sourceStatus: 'industry-consensus',
    process: 'roll-forming',
    severity: 'high',
    title: 'Hole too close to a formed corner',
    measure: 'holeToBendClearanceMm',
    compare: 'gte',
    threshold: 0,
    unit: 'mm clear of 2t+r',
    rationale:
      'A hole pre-punched in the strip distorts as the corner is worked up over successive stations. Roll forming spreads the deformation over more stations than a press brake, which helps, but the hole still pulls oval if it sits inside the bend allowance.',
    fix: 'Move the hole clear of the forming zone, or pierce it after forming in a secondary station.',
    source: 'Roll-forming design guidance (pre-punched features and the forming zone).',
  },
  {
    id: 'roll-hole-diameter',
    sourceStatus: 'industry-consensus',
    process: 'roll-forming',
    severity: 'medium',
    title: 'Pierced hole smaller than the material thickness',
    measure: 'minHoleDiaToThickness',
    compare: 'gte',
    threshold: 1,
    unit: 'd/t',
    rationale:
      'A punch narrower than the sheet is thick buckles under the piercing load. This is a punch-strength limit and it is the same in the strip as it is in a press.',
    fix: 'Open the hole to at least one material thickness, or drill it after forming.',
    source: 'Sheet-metal piercing guidance (punch slenderness).',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOLERANCE CAPABILITY — the family that could not exist until AP242 semantic
  // PMI was readable.
  //
  // `tightestToleranceMm` is the smallest TOTAL tolerance band called out on the
  // part, read from the STEP's own PMI. Each process declares the tightest band
  // it holds economically WITHOUT a secondary operation, so a callout below that
  // line is not a tolerance problem — it is a routing decision that has not been
  // taken. A +/-0.05 mm bore on a sand casting is a machining operation, a
  // fixture, a datum scheme and a second cost centre, and it is the single most
  // common way a drawing quietly doubles a part's price.
  //
  // EVERY RULE HERE ABSTAINS ON A FILE WITH NO PMI, and that is the important
  // half. Most STEP files in circulation carry none — the tolerances are on a
  // drawing this tool has never seen — and reporting "no tolerance problems" for
  // such a part would be the most dangerous sentence in the report.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'mach-tolerance-capability',
    byMaterialFamily: {
      titanium: { threshold: 0.08, source: 'Machining tolerance in titanium: about +/-0.04 mm. Low stiffness, springback and heat build-up all fight repeatability.' },
      plastic: { threshold: 0.20, source: 'Machining tolerance in an engineering thermoplastic: about +/-0.1 mm. The part moves with temperature and moisture faster than the machine can hold it.' },
      aluminium: { threshold: 0.05, source: 'Machining tolerance in aluminium: about +/-0.025 mm, routine on a rigid part.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'machining',
    severity: 'high',
    title: 'Tolerance tighter than machining holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.05,
    unit: 'mm total band',
    rationale:
      'A general machining tolerance of +/-0.025 mm (0.05 total) is routine on a rigid part. Tighter than that needs grinding, temperature control or in-process gauging, and each is a different cost base — not a tighter setting on the same machine.',
    fix: 'Open the tolerance to +/-0.025 mm or tighter only where the function needs it, and say WHICH feature needs it rather than applying a blanket tolerance to the drawing.',
    source: 'General machining tolerance guidance (ISO 2768 fine class and shop practice).',
  },
  {
    id: 'im-tolerance-capability',
    byMaterial: {
      'PC/ABS blend': { threshold: 0.22, source: 'PC/ABS: amorphous-dominated and low-shrink, so it holds close to neat PC.' },
      'PBT': { threshold: 0.35, source: 'PBT is semi-crystalline and shrinks about 1.8%, so its achievable band is far wider than an amorphous resin of the same stiffness.' },
      'PP-T20 (talc-filled)': { threshold: 0.30, source: '20% talc cuts PP shrinkage by roughly a third and makes it more isotropic, so the filled compound holds tighter than the neat resin.' },
      'HDPE': { threshold: 0.50, source: 'HDPE shrinks 1.5-3% and keeps moving after ejection — the widest band of the common moulding resins.' },
      'PEEK': { threshold: 0.25, source: 'PEEK is dimensionally stable once crystallised, and parts are usually annealed, so it holds tighter than most semi-crystallines.' },
      'PPS': { threshold: 0.25, source: 'PPS shrinks little and is highly stable at temperature, which is much of its appeal.' },
      'POM (Acetal)': { threshold: 0.35, source: 'Acetal shrinks about 2% and keeps moving for days after ejection, so its achievable band is far wider than an amorphous resin.' },
      'PA6 (Nylon)': { threshold: 0.35, source: 'Nylon shrinks heavily AND absorbs moisture, so the part grows on the shelf; a machined-part tolerance cannot be held.' },
      'PA66-GF30 (glass-filled)': { threshold: 0.30, source: 'Glass fill cuts shrinkage but makes it directional, so the band narrows without becoming isotropic.' },
      'ABS': { threshold: 0.20, source: 'ABS is amorphous and low-shrink — the best of the commodity resins for dimensional control.' },
      'Polycarbonate (PC)': { threshold: 0.20, source: 'PC is amorphous and dimensionally stable once dried.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'injection-moulding',
    severity: 'high',
    title: 'Tolerance tighter than injection moulding holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.2,
    unit: 'mm total band',
    rationale:
      'Moulding tolerance is dominated by shrinkage, which varies with fill, pack and the batch of resin. About 0.2 mm total on a 50 mm dimension is normal for an engineering thermoplastic; a filled or semi-crystalline grade is worse, not better.',
    fix: 'Open the tolerance, or machine the feature after moulding and price the secondary operation.',
    source: 'Injection-moulding dimensional tolerance guidance (DIN 16901 / SPI commercial class).',
  },
  {
    id: 'hpdc-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'hpdc',
    severity: 'high',
    title: 'Tolerance tighter than high-pressure die casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.2,
    unit: 'mm total band',
    rationale:
      'As-cast linear tolerance is about +/-0.1 mm on a small dimension and grows with size. Anything tighter is machined after casting, which means a fixture, a datum scheme and a second cost centre.',
    fix: 'Open the as-cast tolerance and machine only the features that need to be accurate, with the datums declared.',
    source: 'NADCA Product Specification Standards, linear dimensional tolerances (as-cast).',
  },
  {
    id: 'hpdc-zinc-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'high',
    title: 'Tolerance tighter than high-pressure die casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.15,
    unit: 'mm total band',
    rationale:
      'Zinc holds tighter as-cast tolerances than aluminium because it runs cooler and shrinks less onto the die — about +/-0.075 mm on a small dimension. That accuracy is one of the reasons to choose the alloy.',
    fix: 'Take advantage of the alloy: hold the tolerance as-cast rather than adding a machining operation.',
    source: 'Zinc die-casting dimensional tolerance guidance (tighter than aluminium by roughly a third).',
  },
  {
    id: 'gdc-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'gravity-die',
    severity: 'high',
    title: 'Tolerance tighter than gravity die casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.6,
    unit: 'mm total band',
    rationale:
      'A gravity casting cools slowly against a steel mould and moves as it does. About ISO 8062 CT8-10 is normal, which is roughly +/-0.3 mm on a 50 mm dimension.',
    fix: 'Open the as-cast tolerance and machine the functional faces.',
    source: 'ISO 8062 casting tolerance grades CT8-CT10 (permanent mould).',
  },
  {
    id: 'sand-tolerance-capability',
    byMaterialFamily: {
      ferrous: { threshold: 1.60, source: 'Sand-cast steel shrinks about 2% against aluminium\'s 1.2%, and the pattern allowance carries that error, so the achievable band is wider again.' },
      castiron: { threshold: 1.00, source: 'Grey iron expands on graphite formation, partly cancelling its contraction, so it holds tighter as-cast than either steel or aluminium.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'sand-casting',
    severity: 'high',
    title: 'Tolerance tighter than sand casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 1.2,
    unit: 'mm total band',
    rationale:
      'Sand moves. The mould is rammed, the cores are set by hand and the casting contracts against a yielding medium, so ISO 8062 CT11-13 is the realistic band — roughly +/-0.6 mm on a 50 mm dimension.',
    fix: 'Machine every functional surface and open everything else. A tight as-cast tolerance on a sand casting is a scrap rate, not a specification.',
    source: 'ISO 8062 casting tolerance grades CT11-CT13 (sand, hand-moulded).',
  },
  {
    id: 'inv-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'high',
    title: 'Tolerance tighter than investment casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.3,
    unit: 'mm total band',
    rationale:
      'The wax pattern is moulded to a machined die and the ceramic shell is rigid, so investment casting holds ISO 8062 CT5-7 — roughly +/-0.15 mm. This is the accuracy the process is bought for.',
    fix: 'Hold the tolerance as-cast where you can; if it must be tighter, machine only that feature.',
    source: 'ISO 8062 casting tolerance grades CT5-CT7 (investment).',
  },
  {
    id: 'sm-tolerance-capability',
    byMaterial: {
      'Steel DP980 (dual-phase)': { threshold: 0.80, source: 'Formed-feature tolerance in DP980: springback rises steeply with yield strength and varies coil to coil, so the achievable band is roughly double the mild-steel figure.' },
      'Steel 22MnB5 (press-hardened)': { threshold: 0.30, source: 'A press-hardened part is quenched in the die and holds its shape unusually well — hot forming removes springback almost entirely, which is a large part of why the process is used.' },
      'Aluminium 5052 (sheet)': { threshold: 0.40, source: 'Formed-feature tolerance in 5052-H32: closer to mild steel than to 6061-T6, because springback scales with yield strength and 5052 is a soft alloy.' },
      'Steel (high-strength)': { threshold: 0.60, source: 'Formed-feature tolerance in AHSS: springback rises with yield strength and varies coil to coil, so the achievable band is roughly half again the mild-steel figure.' },
      'Aluminium 6061': { threshold: 0.60, source: 'Formed-feature tolerance in 6061-T6: high springback and low elongation widen the band against mild steel.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'sheet-metal',
    severity: 'high',
    title: 'Tolerance tighter than sheet metal / stamping holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.4,
    unit: 'mm total band',
    rationale:
      'A formed feature carries springback, and springback varies with the coil, not just the tool. About +/-0.2 mm on a formed dimension is normal; a pierced hole in the flat is far better than a formed feature and should be toleranced separately.',
    fix: 'Tolerance pierced features tightly and formed features loosely, and datum from the pierced ones.',
    source: 'Sheet-metal forming tolerance guidance (springback-dominated, formed vs pierced features).',
  },
  {
    id: 'roll-tolerance-capability',
    byMaterial: {
      'Aluminium 6061': { threshold: 0.80, source: 'Roll-formed 6061-T6 springs back further than mild steel at every station, and the error accumulates along the profile.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'roll-forming',
    severity: 'high',
    title: 'Tolerance tighter than roll forming holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.6,
    unit: 'mm total band',
    rationale:
      'A roll-formed profile is worked gradually through many stations and springs back at every one, so cross-section tolerance is looser than a press brake and length tolerance depends on the flying cut.',
    fix: 'Open the profile tolerance and add a secondary operation for anything that must locate.',
    source: 'Roll-forming dimensional tolerance guidance.',
  },
  {
    id: 'hydro-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'hydroforming',
    severity: 'high',
    title: 'Tolerance tighter than hydroforming holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.5,
    unit: 'mm total band',
    rationale:
      'The tube conforms to the die under pressure, so the formed shape is repeatable, but the wall thins unevenly and the ends move as the tube is fed. About +/-0.25 mm is realistic.',
    fix: 'Tolerance from the die-formed faces, not from the tube ends.',
    source: 'Tube hydroforming tolerance guidance.',
  },
  {
    id: 'forge-hot-tolerance-capability',
    byMaterialFamily: {
      aluminium: { threshold: 0.60, source: 'Aluminium forgings run cooler and shrink less on cooling, so they hold roughly half the band of a steel forging.' },
      titanium: { threshold: 1.40, source: 'Titanium forgings run hottest and the dies wear fastest, so the as-forged band is the widest of the three.' },
    },
    sourceStatus: 'industry-consensus',
    process: 'forging-hot',
    severity: 'high',
    title: 'Tolerance tighter than forging holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 1.0,
    unit: 'mm total band',
    rationale:
      'A hot forging shrinks as it cools, the dies wear, and the flash line moves with die closure. About +/-0.5 mm is the realistic as-forged band, and it grows across the parting line.',
    fix: 'Machine every functional surface. As-forged tolerances belong on the non-functional envelope only.',
    source: 'Closed-die hot forging tolerance guidance (die wear and thermal contraction).',
  },
  {
    id: 'forge-cold-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'forging-cold',
    severity: 'high',
    title: 'Tolerance tighter than forging holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.2,
    unit: 'mm total band',
    rationale:
      'Cold forging holds far tighter than hot because nothing shrinks on cooling — about +/-0.1 mm — and that accuracy is most of the reason to pay for the tooling.',
    fix: 'Hold the tolerance as-forged; adding a machining operation gives away the advantage that justified the process.',
    source: 'Cold forging / cold heading tolerance guidance.',
  },
  {
    id: 'extr-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'extrusion',
    severity: 'high',
    title: 'Tolerance tighter than extrusion holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.5,
    unit: 'mm total band',
    rationale:
      'An extruded profile is pulled through a die that wears and deflects, and it twists and bows as it cools on the run-out table. Straightness and twist usually bind before the section tolerance does.',
    fix: 'Tolerance the section loosely and specify straightness and twist separately; machine any locating feature.',
    source: 'Aluminium extrusion tolerance guidance (EN 12020 / supplier standard practice).',
  },
  {
    id: 'rubber-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'rubber-moulding',
    severity: 'high',
    title: 'Tolerance tighter than rubber moulding holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.5,
    unit: 'mm total band',
    rationale:
      'Rubber shrinks heavily on cure and keeps moving afterwards, and it deforms under its own measurement. Tolerances are graded (RMA A/B/C) and even the closest is loose against a rigid part.',
    fix: 'Use a graded rubber tolerance class rather than a machined-part tolerance, and dimension in the free state.',
    source: 'RMA rubber dimensional tolerance classes.',
  },
  {
    id: 'rtm-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'composite-rtm',
    severity: 'high',
    title: 'Tolerance tighter than composite layup / rtm holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.5,
    unit: 'mm total band',
    rationale:
      'A laminate takes the tool surface accurately on the tool side and the bag or second tool side less so, and it springs in as it cures off a corner. Thickness varies with fibre volume fraction.',
    fix: 'Tolerance from the tool face, and allow for spring-in at every corner.',
    source: 'Composite moulding tolerance guidance (tool-side vs bag-side, cure spring-in).',
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
    byMaterialFamily: {
      copper: { threshold: [4.0, 10.0], source: 'Gravity-cast brass and bronze: a fuller section than aluminium. The alloys are denser and pour hotter, so a thin wall erodes the mould and a heavy one still feeds.' },
      aluminium: { threshold: [3.0, 8.0], source: 'Gravity / permanent-mould aluminium: 3 mm practical minimum, 4-6 mm typical.' },
    },
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
    byMaterialFamily: {
      copper: { threshold: 3, source: 'Copper-alloy gravity castings grip the die harder as they contract and need more draft than aluminium; a tighter allowance on short-run tooling is common practice.' },
    },
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
    byMaterialFamily: {
      copper: { threshold: 0.6, source: 'Copper alloys conduct heat away fastest, so the gate freezes early and a heavy section is cut off from its feeder sooner than in aluminium.' },
    },
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
    byMaterialFamily: {
      castiron: { threshold: [5.0, 15.0], source: 'Sand-cast grey iron: about 5 mm minimum; graphite expansion on freezing feeds the section, so iron tolerates heavier walls than aluminium.' },
      ferrous: { threshold: [6.0, 18.0], source: 'Sand-cast steel: about 6 mm minimum. Steel has the highest freezing range and the worst fluidity of the common cast metals, so thin sections misrun.' },
      aluminium: { threshold: [4.0, 12.0], source: 'Sand-cast aluminium: about 4 mm minimum, 5-10 mm typical.' },
      copper: { threshold: [5.0, 12.0], source: 'Sand-cast bronze and brass: about 5 mm minimum.' },
    },
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
    byMaterialFamily: {
      ferrous: { threshold: 3, source: 'Sand-cast steel shrinks about 2% — the most of any common cast metal — and drags hardest on the mould as it does, so more of the wall may sit below the nominal draft before the pattern draw becomes the binding problem.' },
      castiron: { threshold: 7, source: 'Grey iron EXPANDS as graphite forms during freezing, so it releases from rammed sand far more readily than steel or aluminium. This is the one casting family where low draft is genuinely cheap.' },
    },
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
    byMaterialFamily: {
      ferrous: { threshold: [2.0, 6.0], source: 'Investment-cast steel: about 2 mm minimum. Steel is less fluid than aluminium even into a preheated shell.' },
      titanium: { threshold: [2.5, 8.0], source: 'Investment-cast titanium: about 2.5 mm minimum. It must be poured in vacuum and reacts with the shell, so thin sections come out with an alpha case.' },
      aluminium: { threshold: [1.5, 5.0], source: 'Investment-cast aluminium: about 1.5 mm minimum.' },
    },
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
    byMaterialFamily: {
      ferrous: { threshold: 0.6, source: 'Investment-cast steel has the widest freezing range of the common alloys, so an isolated heavy section stays liquid longest after its feed path has frozen.' },
    },
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
    byMaterialFamily: {
      ferrous: { threshold: 3.0, source: 'Steel tube hydroforming: about 3 r/t before the corner thins to failure.' },
      aluminium: { threshold: 4.0, source: 'Aluminium tube hydroforming: about 4 r/t. Lower uniform elongation than steel means the corner splits sooner, and this is the most common reason an aluminium hydroformed part fails at the prototype stage.' },
    },
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
    byMaterialFamily: {
      aluminium: { threshold: 10, source: 'Aluminium forges at a lower temperature and shrinks onto the die far less than steel, so it strips with about 3 degrees where steel wants 5-7 — a larger share of wall below the steel figure is acceptable.' },
      titanium: { threshold: 3, source: 'Titanium forgings are hot, reactive and grip the die hard; they need MORE draft than steel, so less of the wall may sit below the nominal.' },
    },
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
    byMaterialFamily: {
      aluminium: { threshold: 2.5, source: 'Aluminium has the lowest flow stress of the common forged metals and fills a thinner web.' },
      ferrous: { threshold: 3.5, source: 'Steel forgings: 3.5 mm minimum web. Higher flow stress and more die chilling.' },
      titanium: { threshold: 5.0, source: 'Titanium forgings: 5 mm minimum web. Very high flow stress in a narrow temperature window, and the dies must be heated.' },
    },
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
    byMaterialFamily: {
      ferrous: { threshold: 2.0, source: 'Cold-forged steel: 2 mm minimum web. Work hardening drives forming pressure up sharply as the section thins.' },
      aluminium: { threshold: 1.2, source: 'Cold-forged aluminium: 1.2 mm minimum web — the softest of the commonly cold-formed metals.' },
    },
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
    byMaterialFamily: {
      copper: { threshold: 0.25, source: 'Copper and brass extrude at far higher pressure than aluminium, so an unbalanced section deflects the die more and twists the profile worse.' },
    },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // AS-CAST FEATURE SIZE — a question this catalogue could not previously ask
  //
  // Every casting family already carried a core SLENDERNESS rule (`*-core-ld`):
  // how DEEP a core pin may go for its diameter. Not one carried a core
  // DIAMETER rule: how thin a pin may be at all. They are different failure
  // modes and only one of them was being checked.
  //
  //   * slenderness fails by DEFLECTION — the pin bends, the hole walks off
  //     position and the wall around it goes eccentric;
  //   * diameter fails by EXISTENCE — below the family's floor the pin snaps on
  //     the first shots, or no toolmaker will cut it, and the hole is not cast
  //     at all. It is drilled afterwards, at a cost nobody put in the quote.
  //
  // A Ø3 hole in a permanent-mould part is the single most common example: it
  // passes every slenderness check ever written and it is still not a cast hole.
  //
  // The threshold is a DIAMETER in millimetres, and each family's floor is its
  // own. Zinc fills a finer pin than aluminium; a ceramic investment core goes
  // finer than either; a permanent-mould steel pin is the coarsest of the lot.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'hpdc-min-cored-hole',
    sourceStatus: 'industry-consensus',
    process: 'hpdc',
    severity: 'medium',
    title: 'Hole too small to be cast — it will be drilled',
    measure: 'minHoleDiaMm',
    compare: 'gte',
    threshold: 2.5,
    unit: 'mm dia',
    byMaterial: {
      'Magnesium AZ91D (die-cast)': { threshold: 2.0, source: 'Magnesium fills a finer core than aluminium at the same pin strength, so the practical as-cast floor sits nearer 2 mm. The limit is still the PIN, not the alloy: an unsupported core pin below about 1.5 mm is not run in production whatever is flowing round it.' },
    },
    rationale:
      'The hole is made by a steel pin standing in the die, taking the full shot pressure on every cycle. Below roughly 2.5 mm in aluminium the pin is too slender to survive production — it soldiers, bends and eventually snaps — and unsupported pins under about 1.5 mm are not run at all. The feature does not disappear from the part; it moves to the drill, and a drilling operation nobody costed is a piece price nobody predicted.',
    fix: 'Open the hole to at least 2.5 mm to cast it, or delete it from the casting and quote it as a drilled feature so the secondary operation is in the price from the start.',
    source: 'Die casting core-pin design guidance: unsupported core pins below about 1.5 mm are avoided or reinforced; the practical as-cast aluminium hole floor sits above that at roughly 2.5 mm. Consistent across supplier design guides; no primary standard audited.',
  },
  {
    id: 'hpdc-zinc-min-cored-hole',
    sourceStatus: 'industry-consensus',
    process: 'hpdc-zinc',
    severity: 'medium',
    title: 'Hole too small to be cast — it will be drilled',
    measure: 'minHoleDiaMm',
    compare: 'gte',
    threshold: 1.5,
    unit: 'mm dia',
    rationale:
      'Zinc runs cooler and thinner than aluminium and is the least aggressive of the die-casting alloys on tooling, so a hot-chamber die will hold a finer core pin than an aluminium die will. It will not hold an arbitrarily fine one: below about 1.5 mm the pin is unsupported steel in a pressurised cavity and breaks.',
    fix: 'Open the hole to at least 1.5 mm, or move it to a drilling operation and cost that operation.',
    source: 'Die casting core-pin design guidance: avoid unsupported cores below about 1.5 mm diameter, or reinforce them. Zinc is the alloy this floor is most nearly achievable in. No primary standard audited.',
  },
  {
    id: 'gdc-min-cored-hole',
    sourceStatus: 'standard-named',
    process: 'gravity-die',
    severity: 'medium',
    title: 'Hole too small to be cast — it will be drilled',
    measure: 'minHoleDiaMm',
    compare: 'gte',
    threshold: 6.0,
    unit: 'mm dia',
    rationale:
      'A gravity-poured permanent mould has no shot pressure to force metal down a fine pin, and the pin itself sits in a hot die for a long, slow fill. The published permanent-mould floor is 6 mm, and the hole must run parallel to the draw. Anything finer is a drilled feature wearing a cast feature\'s drawing callout.',
    fix: 'Open the hole to at least 6 mm and align it with the draw direction, or delete it from the casting and quote the drilling.',
    source: 'Permanent-mould (gravity die) design guidance, citing NADCA: minimum cored hole diameter 6.0 mm, parallel to the direction of draw. The standard is NAMED by the design guide; the NADCA document itself has not been read first-hand.',
  },
  {
    id: 'inv-min-cored-hole',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'medium',
    title: 'Hole too small for a ceramic core',
    measure: 'minHoleDiaMm',
    compare: 'gte',
    threshold: 1.5,
    unit: 'mm dia',
    rationale:
      'Investment casting makes a hole with a ceramic core inside a wax pattern, not with a steel pin. Ceramic is brittle but it is also formed, not machined, so it goes finer than any die pin — down to about 1.5 mm. Below that the core breaks during wax injection or dewax and the hole closes.',
    fix: 'Open the hole to at least 1.5 mm, or drill it after casting — investment castings machine easily and the stock is already there.',
    source: 'Investment casting design guidance: minimum hole diameter approximately 1.5 mm (some houses quote 2.0 mm for through holes), with tolerances of the order of ±0.13 mm up to 25 mm. Consistent across several foundry design guides; no primary standard audited.',
  },
  // The BLIND / THROUGH split, which the combined slenderness measure could not
  // express. A through core is supported at BOTH ends; a blind one is a
  // cantilever, and investment casting writes the two limits separately because
  // they differ by more than a factor of two. Judging a supported through core
  // by the cantilever limit is how a perfectly good design gets flagged.
  {
    id: 'inv-blind-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'high',
    title: 'Blind cored hole too deep for an unsupported ceramic core',
    measure: 'maxBlindHoleDepthToDia',
    compare: 'lte',
    threshold: 2,
    unit: 'blind core L/D',
    rationale:
      'A blind hole is formed by a ceramic core held at one end only. Past about two diameters the cantilever cannot survive wax injection and shell build, and it snaps off inside the pattern where nobody sees it until the casting is sectioned.',
    fix: 'Reduce the depth to twice the diameter, open the diameter, or take the hole through so the core can be supported at both ends.',
    source: 'Investment casting design guidance: depth/diameter ratio for BLIND holes should be under 2, and for THROUGH holes under 5. Consistent across several foundry design guides; no primary standard audited.',
  },
  {
    id: 'inv-through-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'investment-casting',
    severity: 'medium',
    title: 'Through cored hole too deep for a ceramic core',
    measure: 'maxThroughHoleDepthToDia',
    compare: 'lte',
    threshold: 5,
    unit: 'through core L/D',
    rationale:
      'A through hole lets the ceramic core be anchored at both ends, which roughly doubles the slenderness it survives against a blind one. It is still ceramic: past about five diameters it bows during shell build and the bore goes out of straightness.',
    fix: 'Open the diameter, shorten the hole, or accept a drilled bore and leave machining stock.',
    source: 'Investment casting design guidance: depth/diameter ratio for THROUGH holes should be under 5, against under 2 for blind holes. Consistent across several foundry design guides; no primary standard audited.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOW-PRESSURE DIE CASTING
  //
  // The route a wheel rim and most structural housings actually take, and it had
  // no entry at all — selecting it was only possible by mis-selecting gravity
  // die, which prices a different yield and judges a different wall.
  //
  // What makes it its own family: metal is pushed UP into the mould from a
  // sealed furnace at 0.3-1.5 bar and the pressure is held through
  // solidification, so it fills a thinner section than gravity (2.0 mm against
  // 3.0) and holds a tighter tolerance (ISO 8062 CT6-CT7 against CT7-CT9). The
  // core hardware is the same steel-in-a-permanent-mould as gravity, so the
  // cored-hole floor is gravity's, not HPDC's.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'lpdc-min-section',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'high',
    title: 'Local section below what a low-pressure fill reaches',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 2.0,
    unit: 'mm',
    rationale:
      'Low-pressure filling is slow and bottom-fed, which is what makes it clean — and also what limits it. Below about 2 mm the front freezes before the section is full and the result is a misrun or a cold shut, the two defects the process is otherwise chosen to avoid.',
    fix: 'Thicken the section to at least 2 mm, or move the part to high-pressure die casting, which fills a 1.0-1.5 mm wall.',
    source: 'Low-pressure die casting is quoted at 2.0-3.0 mm thin-wall capability, against gravity die casting requiring 3 mm and up, where cold shuts and misruns appear at 4 mm. Consistent across process-comparison guides; no primary standard audited.',
  },
  {
    id: 'lpdc-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'high',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.7,
    unit: '(p95-p5)/p50',
    rationale:
      'The held pressure feeds shrinkage from the fill tube upward, so a heavy section ABOVE a thin one is cut off from its own feed path and shrinks into porosity. Uniformity matters more here than in gravity casting, not less, because the feed direction is fixed by the process.',
    fix: 'Even out the section, or re-orient the part so heavy sections sit low, nearest the fill tube.',
    source: 'Casting design guidance on uniform wall thickness and gradual transitions, applied to a bottom-fed directional-solidification process. No primary standard audited.',
  },
  {
    id: 'lpdc-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'high',
    title: 'Wall area below the minimum permanent-mould draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 1.0,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'The part shrinks onto a steel mould as it solidifies under pressure. Without taper it grips, and the ejectors either mark the face or tear it.',
    fix: 'Add at least 1° of draft to every drawn wall, 2-3° on deep or cosmetic faces.',
    source: 'Permanent-mould design guidance: minimum draft about 1°, with 2-3° generally recommended and 2° specified on box-section walls perpendicular to the parting plane. No primary standard audited.',
  },
  {
    id: 'lpdc-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'medium',
    title: 'Undercuts need a slide or a sand core',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'A permanent mould opens along one axis. An undercut buys either a slide — mechanism, maintenance and cycle time — or a sand core, which reintroduces the sand handling the permanent mould was chosen to escape.',
    fix: 'Re-orient the part, or move the undercut feature to a machined operation.',
    source: 'Permanent-mould design guidance on parting-line selection and slide cost. No primary standard audited.',
  },
  {
    id: 'lpdc-min-cored-hole',
    sourceStatus: 'standard-named',
    process: 'lpdc',
    severity: 'medium',
    title: 'Hole too small to be cast — it will be drilled',
    measure: 'minHoleDiaMm',
    compare: 'gte',
    threshold: 6.0,
    unit: 'mm dia',
    rationale:
      'The core hardware is the same steel-in-a-permanent-mould as gravity die casting, and 0.3-1.5 bar is not the 500-1000 bar that lets high-pressure die casting run a finer pin. The permanent-mould floor applies unchanged: 6 mm, parallel to the draw.',
    fix: 'Open the hole to at least 6 mm and align it with the draw, or quote it as drilled.',
    source: 'Permanent-mould (gravity and low-pressure die) design guidance, citing NADCA: minimum cored hole diameter 6.0 mm, parallel to the direction of draw. The standard is NAMED by the design guide; the NADCA document itself has not been read first-hand.',
  },
  {
    id: 'lpdc-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'medium',
    title: 'Cored hole beyond the core slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 6,
    unit: 'core L/D',
    rationale:
      'Past about six diameters a core pin deflects under the metal front and the hole walks off position, taking the wall around it eccentric with it.',
    fix: 'Open the diameter, shorten the hole, or support the pin at both ends by taking it through.',
    source: 'Die casting core-pin guidance: past an L/D of 6:1 deflection risk rises sharply and additional support, a larger diameter or reduced local pressure is needed. No primary standard audited.',
  },
  {
    id: 'lpdc-rib-thickness-max',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'medium',
    title: 'Rib heavier than the wall it stands on',
    measure: 'maxRibThicknessToWall',
    compare: 'lte',
    threshold: 1.0,
    unit: 'rib/wall',
    rationale:
      'A rib thicker than its wall is a heavy section hanging off a thin one. It solidifies last, draws metal it cannot get, and leaves a sink on the show face opposite.',
    fix: 'Bring the rib base to 0.6-1.0 times the wall.',
    source: 'Die casting rib guidance: rib base thickness 0.6-1.0 × wall, height ≤ 5 × rib thickness, fillet 1.0-1.25 × rib thickness, draft 1-3°. No primary standard audited.',
  },
  {
    id: 'lpdc-rib-thickness-min',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'low',
    title: 'Rib too thin to fill',
    measure: 'minRibThicknessToWall',
    compare: 'gte',
    threshold: 0.6,
    unit: 'rib/wall',
    rationale:
      'A rib much thinner than the wall freezes off before the slow low-pressure front reaches its tip, and the stiffness it was drawn for is not there.',
    fix: 'Bring the rib base to at least 0.6 of the wall.',
    source: 'Die casting rib guidance: rib base thickness 0.6-1.0 × wall. No primary standard audited.',
  },
  {
    id: 'lpdc-rib-height',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'low',
    title: 'Rib taller than it can be filled and drawn',
    measure: 'maxRibHeightToWall',
    compare: 'lte',
    threshold: 5,
    unit: 'rib height/wall',
    rationale:
      'A tall thin rib is a deep narrow slot in the mould: hard to fill, hard to vent, and hard to draw without tearing.',
    fix: 'Keep rib height within five times the wall, or split one tall rib into two shorter ones.',
    source: 'Die casting rib guidance: rib height ≤ 5 × rib thickness. No primary standard audited.',
  },
  {
    id: 'lpdc-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'lpdc',
    severity: 'high',
    title: 'Tolerance tighter than low-pressure die casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.6,
    unit: 'mm total band',
    rationale:
      'Low-pressure die casting is the most accurate of the permanent-mould routes — ISO 8062 CT6-CT7 against gravity\'s CT7-CT9 — but it is still a casting. A band tighter than about 0.6 mm total is a machining requirement, and the stock for it has to be on the part.',
    fix: 'Open the tolerance, or add machining stock on that feature and quote the operation.',
    source: 'Low-pressure die casting quoted at ISO 8062 CT6-CT7 and ±0.3 mm, against gravity die casting at CT7-CT9. Consistent across process-comparison guides; no primary standard audited.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SQUEEZE CASTING
  //
  // Poured, then pressurised through solidification on a hydraulic press. The
  // applied pressure feeds shrinkage, which is why it exists: no riser, low
  // porosity, heat-treatable. Geometrically it sits between gravity die and
  // HPDC — thinner than gravity, thicker than HPDC — and it needs MORE draft
  // than either because the part is squeezed onto the die.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'squeeze-min-section',
    sourceStatus: 'industry-consensus',
    process: 'squeeze-casting',
    severity: 'high',
    title: 'Local section below what squeeze casting fills',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 2.0,
    unit: 'mm',
    rationale:
      'Squeeze casting fills slowly and relies on pressure rather than velocity, so it does not chase a thin section the way a high-pressure shot does. Below about 2 mm the section is short-filled before the press closes on it.',
    fix: 'Thicken the section to at least 2 mm, or move the part to high-pressure die casting.',
    source: 'Squeeze casting is quoted as producing walls of 2.0-2.5 mm at 800-1200 mm length, and 2.5-3.5 mm at 900-2000 mm. No primary standard audited.',
  },
  {
    id: 'squeeze-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'squeeze-casting',
    severity: 'medium',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.9,
    unit: '(p95-p5)/p50',
    rationale:
      'Applied pressure feeds shrinkage, which is precisely why squeeze casting tolerates a heavier section than gravity does — but the pressure has to reach it. A heavy pocket isolated behind a thin wall freezes off from the feed path and shrinks anyway.',
    fix: 'Even out the section, or place the heavy section where the ram pressure acts directly on it.',
    source: 'Casting design guidance on uniform wall thickness, relaxed for a process whose applied pressure feeds solidification shrinkage. No primary standard audited.',
  },
  {
    id: 'squeeze-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'squeeze-casting',
    severity: 'high',
    title: 'Wall area below the minimum squeeze-casting draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 1.5,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'The part is held against the die under load while it solidifies, so it grips harder than a free-shrinking casting. Zero-draft walls that a die caster would accept will not release here.',
    fix: 'Add at least 1.5° of draft to every drawn wall, 2-3° on deep pockets.',
    source: 'Die casting draft guidance of 1-3°, with 2-3° minimum on deep pockets, applied to a process that solidifies under applied load. No primary standard audited.',
  },
  {
    id: 'squeeze-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'squeeze-casting',
    severity: 'medium',
    title: 'Undercuts need a slide in a pressurised die',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'A slide in a squeeze die carries the full press load, not just a shot pressure spike. It is a more expensive mechanism than the same slide in a gravity mould and it is the first thing to wear.',
    fix: 'Re-orient the part, or machine the undercut afterwards.',
    source: 'Permanent-mould design guidance on parting-line selection and slide cost, applied to a load-bearing die. No primary standard audited.',
  },
  {
    id: 'squeeze-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'squeeze-casting',
    severity: 'medium',
    title: 'Cored hole beyond the core slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 5,
    unit: 'core L/D',
    rationale:
      'A core pin in a squeeze die is loaded by the ram for the whole solidification, not by a shot for milliseconds. The slenderness it survives is below the die-casting figure, not above it.',
    fix: 'Open the diameter, shorten the hole, or drill it afterwards.',
    source: 'Die casting core-pin guidance (deflection risk rising sharply past L/D 6:1), tightened for a core loaded through solidification rather than during fill. Derived, not quoted — treat as a screening value.',
  },
  {
    id: 'squeeze-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'squeeze-casting',
    severity: 'high',
    title: 'Tolerance tighter than squeeze casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.6,
    unit: 'mm total band',
    rationale:
      'Squeeze casting works in a steel die and holds a permanent-mould class of tolerance. A band tighter than about 0.6 mm total is a machining requirement.',
    fix: 'Open the tolerance, or leave machining stock and quote the operation.',
    source: 'Permanent-mould tolerance class (ISO 8062 CT6-CT8) applied to a steel-die process. No primary standard audited.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SEMI-SOLID CASTING (thixo / rheo)
  //
  // Injected as a slurry rather than a liquid. Laminar fill, almost no trapped
  // gas, so the part is heat-treatable and weldable — and, distinctively, it
  // draws with far less taper than any other die process. This family exists
  // mainly to STOP a good design being flagged: a 0.5° wall that HPDC rules
  // correctly reject is perfectly castable here, and judging it by the HPDC
  // family would send an engineer to add draft they do not need.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ssm-min-section',
    sourceStatus: 'industry-consensus',
    process: 'semi-solid',
    severity: 'high',
    title: 'Local section below what a semi-solid slurry fills',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 0.5,
    unit: 'mm',
    rationale:
      'A semi-solid slurry fills thinner than liquid metal because it does not spray and freeze off at the front. Walls down to 0.5 mm over palm-sized areas are documented — but 0.5 mm is the floor, not the target.',
    fix: 'Thicken the section to at least 0.5 mm; anything below that is not a casting feature.',
    source: 'Thixomolding design guidance: wall thickness as low as 0.5 mm over 150 × 100 mm areas, with parts up to 18-19 mm thick also moulded. No primary standard audited.',
  },
  {
    id: 'ssm-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'semi-solid',
    severity: 'medium',
    title: 'Wall area below the minimum semi-solid draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 0.5,
    compare: 'lte',
    threshold: 10,
    unit: '% of wall area',
    rationale:
      'This is the one die process that draws with almost no taper — zero draft has been used in production. The rule is here to catch a wall with NO taper across a large area, not to demand the 1-2° a die caster would ask for. A part flagged by the HPDC draft rule is very often fine here, and that difference is the reason to choose the route.',
    fix: 'Add half a degree where the drawn area is large, or confirm zero-draft ejection with the moulder before committing.',
    source: 'Thixomolding design guidance: parts can be moulded with minimum draft angles or none at all, and zero draft has been used. The threshold here is deliberately permissive against the 1-3° die-casting norm. No primary standard audited.',
  },
  {
    id: 'ssm-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'semi-solid',
    severity: 'medium',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 0.9,
    unit: '(p95-p5)/p50',
    rationale:
      'Laminar filling and a low superheat mean less solidification shrinkage than a fully liquid shot, so the section change this process tolerates is wider than HPDC\'s. It is not unlimited: a heavy boss on a thin wall still sinks.',
    fix: 'Even out the section, or core out the heavy region.',
    source: 'Thixomolding design guidance: concentrate on uniform wall thickness and cavity filling; match bosses and studs to wall thickness. No primary standard audited.',
  },
  {
    id: 'ssm-undercuts',
    sourceStatus: 'industry-consensus',
    process: 'semi-solid',
    severity: 'medium',
    title: 'Undercuts need a slide',
    measure: 'undercutFaceCount',
    compare: 'lte',
    threshold: 0,
    unit: 'regions',
    rationale:
      'Low draft does not mean no draw. The die still opens along one axis, and an undercut still buys a slide or a lifter.',
    fix: 'Re-orient the part on the parting line, or machine the undercut afterwards.',
    source: 'Thixomolding design guidance on gating, ejection and tool opening. No primary standard audited.',
  },
  {
    id: 'ssm-rib-thickness-max',
    sourceStatus: 'industry-consensus',
    process: 'semi-solid',
    severity: 'medium',
    title: 'Rib heavier than the wall it stands on',
    measure: 'maxRibThicknessToWall',
    compare: 'lte',
    threshold: 1.0,
    unit: 'rib/wall',
    rationale:
      'A rib heavier than its wall is a late-freezing section on an early-freezing one, and it sinks the show face opposite whatever the fill physics.',
    fix: 'Match the rib base to the wall or bring it below it.',
    source: 'Thixomolding design guidance: match bosses and studs to wall thickness. No primary standard audited.',
  },
  {
    id: 'ssm-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'semi-solid',
    severity: 'high',
    title: 'Tolerance tighter than semi-solid casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.4,
    unit: 'mm total band',
    rationale:
      'Low shrinkage and a laminar fill make semi-solid the most repeatable of the die routes, so it holds a tighter band than plain HPDC. It is still a die process with thermal growth in the tool, and a band under about 0.4 mm total belongs to machining.',
    fix: 'Open the tolerance, or leave stock and machine the feature.',
    source: 'Semi-solid processing is quoted as holding tighter dimensional repeatability than conventional die casting on account of reduced solidification shrinkage. Positioned tighter than the HPDC band used elsewhere in this catalogue; no primary standard audited.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHELL MOULD CASTING
  //
  // Resin-bonded sand cured against a heated metal pattern. The MOULD is sand,
  // so the core and section limits are the sand family's — that is stated in
  // each source string rather than left for the reader to assume. What differs,
  // and the only reason this is a separate family, is accuracy and finish: a
  // shell holds a tighter band than green sand because the mould is rigid and
  // dimensionally stable rather than rammed.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'shell-min-section',
    sourceStatus: 'industry-consensus',
    process: 'shell-mould',
    severity: 'high',
    title: 'Local section below what a shell mould fills',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 2.5,
    unit: 'mm',
    rationale:
      'A resin shell chills faster than rammed green sand, so it fills a thinner section than green sand does — but it is still a gravity pour into a sand-class mould, not a pressurised one.',
    fix: 'Thicken the section, or move the part to a permanent-mould or pressurised route.',
    source: 'Shell moulding is quoted as reaching thinner sections and a better finish (Ra 1.6-3.2 µm) than green sand casting. The figure here sits between the sand-casting minimum used elsewhere in this catalogue and the permanent-mould minimum; it is DERIVED from that ordering, not quoted, and should be the first threshold a foundry review corrects.',
  },
  {
    id: 'shell-draft-minimum',
    sourceStatus: 'industry-consensus',
    process: 'shell-mould',
    severity: 'high',
    title: 'Wall area below the minimum shell-mould draft',
    measure: 'wallAreaBelowDraftPct',
    draftCutoffDeg: 1.0,
    compare: 'lte',
    threshold: 5,
    unit: '% of wall area',
    rationale:
      'The pattern is drawn from a cured resin shell, which is rigid — so it needs less taper than green sand, where the mould crumbles if the pattern rubs, but more than nothing.',
    fix: 'Add at least 1° of draft to every drawn wall.',
    source: 'Casting draft allowance guidance of 1-3° per vertical face, taken at the lower end because the cured shell is rigid where green sand is not. No primary standard audited.',
  },
  {
    id: 'shell-wall-uniformity',
    sourceStatus: 'industry-consensus',
    process: 'shell-mould',
    severity: 'high',
    title: 'Non-uniform wall thickness',
    measure: 'wallSpreadRatio',
    compare: 'lte',
    threshold: 1.0,
    unit: '(p95-p5)/p50',
    rationale:
      'A gravity pour feeds shrinkage through risers, and a riser only feeds a section it can still reach through liquid metal. Isolated heavy sections shrink whatever the mould is made of.',
    fix: 'Even out the section, or add a feeder path to the heavy region.',
    source: 'Casting design guidance on uniform wall thickness and gradual transitions. No primary standard audited.',
  },
  {
    id: 'shell-core-ld',
    sourceStatus: 'industry-consensus',
    process: 'shell-mould',
    severity: 'medium',
    title: 'Cored hole beyond the sand-core slenderness limit',
    measure: 'maxHoleDepthToDia',
    compare: 'lte',
    threshold: 10,
    unit: 'core L/D',
    rationale:
      'A resin-bonded core is far stronger than a green-sand one, but it is still bonded sand. Past roughly ten diameters unsupported it is too brittle to handle without damage, let alone to survive the pour.',
    fix: 'Support the core at both ends, open the diameter, or drill the hole after casting.',
    source: 'Foundry core guidance: an unsupported core length-to-diameter ratio beyond about 10-15 forces alternatives to conventional sand cores. The lower end of that band is used here. No primary standard audited.',
  },
  {
    id: 'shell-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'shell-mould',
    severity: 'high',
    title: 'Tolerance tighter than shell moulding holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.8,
    unit: 'mm total band',
    rationale:
      'A rigid cured shell holds a tighter band than rammed green sand — that accuracy, with the finish, is the whole reason to pay for the heated pattern — but it does not approach a steel die.',
    fix: 'Open the tolerance, or leave machining stock and quote the operation.',
    source: 'Shell moulding sits between green sand and permanent mould on the ISO 8062 CT scale. The value here is positioned between the sand-casting and gravity-die bands used elsewhere in this catalogue; DERIVED from that ordering, not quoted.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTRIFUGAL CASTING
  //
  // The only family in this catalogue whose FIRST question is not a dimension.
  // The mould spins, so the part must be a body of revolution — a rule about
  // SHAPE, which nothing in the geometry engine could answer until the
  // axisymmetry measure was written for it. Adding this family without that
  // measure would have produced a page of NOT EVALUATED and a rule count that
  // flattered the tool.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'cent-body-of-revolution',
    // THE ONLY BLOCKING RULE IN THE CATALOGUE, and it should stay rare. Every
    // other finding here says "this will cost you"; this one says "this route
    // cannot make this part". An undercut buys a slide. A part that is not round
    // buys nothing — the mould spins or it does not.
    blocking: true,
    sourceStatus: 'engine-derived',
    process: 'centrifugal',
    severity: 'high',
    title: 'Part is not a body of revolution',
    measure: 'axisymmetricAreaPct',
    compare: 'gte',
    threshold: 90,
    unit: '% of surface area',
    rationale:
      'Centrifugal casting forms the part by spinning the mould: the outer surface is the mould bore and the inner surface is a free liquid surface held by rotation. A feature that is not axisymmetric — a lug, a flat, a bolt boss — cannot be produced by that motion at all. This is not a tolerance to negotiate; it is whether the route exists for this part.',
    fix: 'Cast an axisymmetric blank and machine the non-axisymmetric features, or choose a route with a static mould.',
    source: 'Derived from the process kinematics rather than from a design guide: a spinning mould can only generate surfaces of revolution about its own axis. The 90% threshold allows for small machined-in features on an otherwise round part; it is this tool\'s own screening value, not a published one.',
  },
  {
    id: 'cent-min-section',
    sourceStatus: 'industry-consensus',
    process: 'centrifugal',
    severity: 'medium',
    title: 'Local section below what a spun pour fills',
    measure: 'wallP5Mm',
    compare: 'gte',
    threshold: 5.0,
    unit: 'mm',
    rationale:
      'Centrifugal castings are liners, rings and bushings: the wall is set by the mould bore and the pour volume, and the inner surface carries the dross that has to be machined off. A thin as-cast wall leaves nothing to remove it from.',
    fix: 'Thicken the as-cast wall, or choose a route that casts closer to net shape.',
    source: 'Centrifugal casting practice: the bore is machined to remove the dross layer that collects on the inside diameter, so the as-cast wall must carry that allowance on top of the finished wall. Machining allowances of 1-3 mm are quoted for casting processes generally. DERIVED from that practice, not quoted as a wall minimum.',
  },
  {
    id: 'cent-tolerance-capability',
    sourceStatus: 'industry-consensus',
    process: 'centrifugal',
    severity: 'high',
    title: 'Tolerance tighter than centrifugal casting holds',
    measure: 'tightestToleranceMm',
    compare: 'gte',
    threshold: 0.5,
    unit: 'mm total band',
    rationale:
      'Rotation gives a dense, well-controlled OUTER diameter — the tightest as-cast surface of any sand-class process. The bore is a free liquid surface and is not controlled at all; it is machined.',
    fix: 'Open the tolerance, or apply the tight band to the outer diameter only and machine the bore.',
    source: 'Centrifugal casting is quoted at radial tolerance CT3-CT8 (±0.1-0.5%) with a surface finish of Ra 3-8 µm. The value here takes the loose end of that band as a screening figure; no primary standard audited.',
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
    topic: 'Minimum as-cast cored hole diameter for SAND casting',
    needs: 'A published sand-foundry figure for the smallest hole worth coring. Every other casting family in this catalogue now carries one — HPDC 2.5 mm, zinc 1.5 mm, permanent mould 6.0 mm, investment 1.5 mm — and sand does not, because the research turned up a sand CORE cross-section floor (about 1.6 mm for stability against the melt) and an unsupported core L/D band (10-15), but no sand cored-HOLE minimum from any source. Interpolating one from the permanent-mould 6 mm would have looked identical on the page to the four that are sourced.',
    proxy: '`sand-core-ld` still catches a sand core that is too SLENDER. Nothing catches one that is simply too fine, so a small hole on a sand casting is currently unjudged rather than passed — it appears under NOT EVALUATED with this reason.',
  },
  {
    topic: 'Vacuum-assisted die casting as a distinct GEOMETRIC family',
    needs: 'Nothing — and that is the point. Evacuating the cavity changes the gas in it, not the shape the die can make: wall, draft, core slenderness and undercut limits are the die-casting limits either way. What vacuum buys is porosity low enough to heat-treat and weld, which is a metallurgical property this tool does not measure. The process is offered in the picker and priced separately, and routed to the HPDC rule family on purpose.',
    proxy: 'The `hpdc` family judges it, correctly. A near-copy family would have invented six thresholds to restate the same limits and inflated the catalogue count by six.',
  },
  {
    topic: 'Tool HOLDER and machine-envelope collision (machining)',
    needs: 'The holder geometry, the spindle nose and the machine work envelope. The shank-clearance sweep behind `mach-tool-access` now measures whether a cutter of a given diameter can reach each face along each approach direction, which is the larger half of this — but a face it calls reachable can still be unreachable once the holder is on the tool.',
    proxy: '`mach-tool-access` measures shank clearance and reports it as a LOWER bound on the access problem.',
  },
  {
    topic: 'Tolerance STACK-UP along a dimensional chain',
    needs: 'The datum reference frames and the chain of dimensions between them, so accumulated variation can be propagated feature to feature. Reading individual callouts is not the same problem: a part can pass every tolerance on the drawing and still fail at assembly because they add up.',
    // This entry used to claim GD&T "lives in the drawing, not in the solid
    // geometry a STEP file carries", which stopped being true when the AP242
    // reader landed. A stale gap declaration is worse than none: it tells a
    // reader the tool cannot see something it now measures.
    proxy: 'Individual dimensions, geometric tolerances and datums ARE read from semantic AP242 PMI, and the tightest callout is checked against each process\'s capability. What is missing is the accumulation, not the reading.',
  },
  {
    topic: 'Datum reference frames (AP242 PMI)',
    needs: 'The link from each geometric tolerance to the datums it is measured from. The reader extracts datum labels, but on the round-trip fixture written by this repo none survived the write, so the datum path is IMPLEMENTED AND UNVERIFIED — it has never been proved against a file with datums in it.',
    proxy: 'Datum COUNT is reported and is zero on every file tested so far, which is honest but untested. Treat a non-zero datum count from a vendor CAD export as unproven until a fixture confirms it.',
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
