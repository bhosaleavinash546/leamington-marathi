# Decision log

Why the load-bearing choices were made — so they can be challenged with context instead of
rediscovered by archaeology. Add an entry whenever a decision would surprise a newcomer.
Format: decision · why · what would change it.

1. **AI proposes, engine verifies.** Every cost figure comes from the deterministic engine; the
   LLM ideates, explains, extracts, critiques. *Why:* LLM cost figures are confidently wrong and
   indefensible in sourcing reviews. *Changes it:* nothing foreseeable — this is the product.

2. **Engines compute EUR; GBP is display-only via `fx-rates.mjs`.** *Why:* one base currency keeps
   engine math and calibration coherent; display conversion is lossless. *Changes it:* nothing —
   never put FX inside an engine.

3. **`server.mjs` monolith + `routes/*.mjs` with injected deps.** *Why:* the monolith predates the
   split; extraction happens per endpoint-family as they're touched, keeping diffs reviewable.
   *Changes it:* continued extraction is welcome; wholesale rewrite is not worth the risk.

4. **BM25 over embeddings for idea retrieval (`idea-index.mjs`).** *Why:* at ~1.6k docs it's
   <1 ms, dependency-free and explainable; an embedding store adds infra for marginal recall.
   *Changes it:* corpus ×10, or measured recall failures in the ideation eval.

5. **All structured LLM output via forced tool-use (`messagesJson`), never text-JSON parsing.**
   *Why:* schema-shaped at the API layer; eliminates the parse-failure class. *Changes it:* a
   native structured-output API strictly better than tool-forcing.

6. **Benchmarks are held-out gates; no tuning constants to fixtures.** *Why:* an overfit benchmark
   is a lie the roadmap gets built on (PCB v2 was corrected twice on physics, then tuning stopped
   deliberately at 29.4%). *Changes it:* nothing; new fixtures welcome, anchor-chasing is not.

7. **`BRAINSPARK_IDEATION_MODE=legacy` keeps the pre-upgrade generation pipeline in one build.**
   *Why:* honest A/B needs a single-variable comparison; cross-commit comparisons smuggle in
   confounds. *Changes it:* retire once a measured baseline is recorded and stale.

8. **Deep Mode is opt-in with token cost disclosed; Elo influence bounded ×0.85–1.15.** *Why:*
   3–5× cost must be a user choice; LLM judges rank soft axes only and must never outweigh the
   engine verdict. *Changes it:* eval evidence that a different bound ranks better.

9. **PCB detailed CBD view must reconcile with the simple engine (<0.5% parity, tested).** *Why:*
   two views of one engine, not two engines — divergence would mean one of them is wrong.
   *Changes it:* nothing; the parity test is the contract.

10. **External data (DigiKey/Octopart, PatentsView) is dependency-injected and degrades honestly.**
    *Why:* tests must run offline; an unconfigured integration must say "unverified", never
    fabricate. *Changes it:* nothing — this generalises to every future integration.

11. **Marketplace ideas carry `origin: curated | community`.** *Why:* most of the corpus is
    seeded from benchmark curation; presenting it as community-submitted would violate the
    honesty rule the whole product stands on. *Changes it:* nothing.

12. **`src/config/tools.ts` is the only nav source.** *Why:* five hand-rolled nav lists once
    disagreed and orphaned a page. *Changes it:* nothing — extend the registry, never a surface.

13. **Knowledge bases live in `src/data/*.ts`; `kb-pack.json` is generated (`npm run kb:export`).**
    *Why:* one substrate for display and generation; two copies drifted before. *Changes it:*
    a build-time hook could replace the manual export step.

14. **Horizon foresight is deterministic machinery over a curated register, not LLM prediction.**
    *Why:* "predict future technologies" is exactly where an LLM will hallucinate confident
    dates; instead the register (`src/data/tech-foresight-register.mjs`) carries curated TRL /
    adoption / dated regulations with production evidence, and `foresight.mjs` computes phases,
    horizons, Bass adoption and Wright cost indices from it — the LLM only narrates on the cards
    it is handed. Confidence tiers (committed/probable/speculative) and integrity tests (high
    adoption requires evidence; TRL≤5 cannot claim adoption; unresolvable queries return
    nothing, never the whole register) keep it honest. Projections are labelled "modelled".
    *Changes it:* an evidence engine (patent velocity, live search) can strengthen the register,
    but numbers must keep coming from the deterministic cores.

15. **Foresight anchors carry legal status; only real law pulls a horizon (2026 audit).**
    *Why:* the audit found a proposal (ELV recast) treated as committed law with the wrong
    bite-year — the exact failure mode a foresight tool must not have. Anchors now carry
    `in-force | adopted | proposed | under-revision`; proposed/under-revision anchors give
    context and weak momentum only. Same audit added per-tech adoption ceilings (a 90%
    default is false precision for niche techs) and ±q uncertainty bands on crossing years
    (a single year is a point estimate pretending to be a fact). *Changes it:* nothing —
    these are honesty invariants, now test-enforced.

16. **Crossing milestones are shares of each technology's OWN ceiling, not of the segment (2026).**
    *Why:* the old 25%/50%-of-segment thresholds made every technology with a curated ceiling
    below those bars return "not in range" forever — 32 register entries (20%) had NO future
    prediction by construction, which users correctly read as "the tool doesn't predict".
    Milestones are now ¼ and ½ of the modelled ceiling, with the absolute share (`share25`/
    `share50`) and the ceiling returned alongside so nothing hides behind a percentage-of-a-
    percentage; a `peakGrowth` year (Bass inflection t* = ln(q/p)/(p+q)) marks when supplier
    capacity gets tight. Every entry now carries at least one dated forward milestone (0 blind
    entries, test-enforced). *Changes it:* nothing — display layers must always print the
    absolute share next to a relative milestone.

17. **The horizon lane is WHEN THE DECISION LANDS, not how mature the technology is (2026).**
    *Why:* the lane rule was pure maturity (`trl >= 8 → H1`), which filed 51 of 130 H1 entries as
    "adopt / quote now" while they sat at 1-5% adoption — production-proven somewhere, but years
    from a sourcing decision. That single rule is why a foresight tool read as a catalogue of
    today: 18 of 30 realistic part queries returned technologies but nothing in a future lane.
    The lane now comes from the modelled decision year (quarter-ceiling crossing), bounded by a
    maturity cap (lab-stage work can never be dragged into a near lane) and a scale floor
    (already at half its ceiling ⇒ H1 regardless). Register lanes went H1 130→94, H2 25→68.
    *Changes it:* nothing — but note that relevance ranking is now asserted WITHIN a lane, since
    lanes are the report's organising principle.

18. **Forward research runs inside /predict when the register is thin — walled off from curated data.**
    *Why:* 169 curated entries cannot cover a 20,000-part vehicle, so half of real queries returned
    two mainstream technologies and stopped. `foresight-research.mjs` now searches live sources for
    CANDIDATE FUTURE technologies whenever coverage is thin or no future lane exists, and positions
    them with the same deterministic cores. The honesty boundary is enforced in code, never in a
    prompt: candidates never enter the curated `horizons` lanes (own array, own report page, violet
    not gold); every candidate must cite a retrieved URL or is dropped; TRL/adoption are AI
    estimates so every projection carries `estimatedInputs: true` and says so; and no retrieved
    evidence means the LLM is never called at all. *Changes it:* if a future version promotes a
    researched candidate into the register, it must arrive with curated evidence like any other
    entry — promotion is a human curation act, not an automatic one.

19. **The register grows from usage: landscape floor + knowledge flywheel (2026 root-cause fix).**
    *Why:* three gap-fill waves later, 41% of BOM leaves still returned thin or future-less
    landscapes. Measured root cause: (a) the match fallback was all-or-nothing — one weak term
    match suppressed the whole commodity net ("cylinder head" → 1 card with 20+ Powertrain
    techs behind it); (b) every forward-research result was discarded after the response —
    the tool could not learn from use; (c) the CI gate asserted "resolves to ≥1", so thin
    landscapes were invisible. Fixes: few matches now WIDEN with the commodity net (widened
    entries stamped `related`, exact matches keep every lane's top, and research triggering
    counts only exact matches so a floor-widened landscape still researches); research results
    cache for 30 days (never caching emptiness); and a curator can PROMOTE a researched
    candidate into the live register — validated by the same structural rules as shipped
    entries, stamped `origin: 'promoted'` with its source URL, demotable any time, folded into
    the shipped register at re-curation. The honesty ladder is explicit: AI-researched →
    cached → promoted (human act) → curated. Coverage is now quality-gated in CI: every BOM
    leaf and Analyze name must score 3+ technologies with a future lane (`npm run
    horizon:coverage`). *Changes it:* nothing — promotion must stay a human act; auto-promoting
    research would collapse the ladder.

20. **Technology KIND: the register must see more than part swaps (2026 internet benchmark).**
    *Why:* benchmarking Horizon against independent live internet research on air suspension
    scored 7/10 — and all three misses were the same shape. `replaces` is a required field and
    the research prompt asked only "what does it displace", so 169 of 169 entries were part
    substitutions. That ontology is structurally blind to (a) FUNCTION shifts — hardware
    already on the car earning a new job and a new business case (air-suspension ride height
    bought for aerodynamic range, competing against battery cost per kWh rather than against
    steel springs), (b) ORCHESTRATION — software layers coordinating actuators they replace
    none of (ZF cubiX, Bosch VMM), and (c) LIFECYCLE — service/warranty model shifts
    (air-spring leak prognostics). Every entry now declares `kind`; `replaces` stays required
    for all kinds but for non-substitutions it names what is displaced in COST terms, which is
    what a cost engineer needs. The research schema forces a kind and the prompt explicitly
    hunts all four; the auditor tracks `byKind`/`nonSubstitutionPct`; tests fail if any
    non-substitution kind falls to zero. *Changes it:* nothing — but note the gate discipline
    held: adding four entries pushed curation debt past the CI limit, and the fix was to cite
    the most recent evidence the research actually found (which the stale-evidence flag was
    correctly demanding), not to raise the threshold.

21. **The search plan, not the prompt, decides what foresight can see (2026 benchmark, part 2).**
    *Why:* after adding the `kind` ontology (#20), the tool was still going to miss the same
    class of technology on every OTHER part — because the four search probes all asked
    roadmap/cost questions. A kind-aware schema over a substitution-biased plan still returns
    substitutions: the model can only reason about sources it was actually shown, and the
    materials, diagnostics and chassis-software sources were never retrieved. The plan now
    carries seven labelled probes — four substitution angles (roadmap, emerging, China cost,
    materials/patent) plus one each for `lifecycle`, `orchestration` and `function` — and a
    test asserts every part gets all four kinds probed. Blindness is also now reported PER
    COMMODITY (`ontologyBlindCommodities`), because fixing air suspension made Chassis
    kind-diverse and left eight commodities at 100% part swaps — a register-wide percentage
    would have hidden exactly that. *Changes it:* nothing — but the remaining 165
    substitution-only entries are curation debt, now visible worst-first in `horizon:audit`
    rather than invisible.

22. **The frontier check is region-NEUTRAL: look in more than one place, wherever that is (2026).**
    *Why:* the original lesson was that this register was Western-anchored and missed the
    Chinese frontier (0.15mm laminations in Xiaomi motors while the file said 0.20mm). The fix
    for that asked a single question — "is a Chinese entity named?" — which hardwired the
    correction into the auditor (`no-china-frontier`), the search plan (a probe literally
    naming China) and the curation rule. That is the same blindness pointing the other way: a
    Korea-led (LG/Samsung SDI) or Japan-led (Toyota solid-state, Denso) technology would have
    been marked deficient for not mentioning China, and a curator's cheapest way to clear the
    flag was to bolt on a Chinese name whether or not it belonged. The check is now
    `single-region-view`: an entry that names players from only ONE region is un-checked,
    whichever region that is. Measured at changeover it flags 24 Europe-only entries AND 12
    China-only ones — proof it cuts both ways. The search plan lost its hardcoded country and
    gained a region-neutral cost-frontier probe plus a multi-region one; the research prompt
    now says explicitly not to assume the frontier is Western OR Chinese. Reporting moved from
    a single-country percentage to a full region mix (Europe 113, China 96, North America 96,
    Japan 31, Korea 26, India 11). *Changes it:* the gate was re-baselined 129 → 119 because
    the flag now MEANS something different, not because the register got worse — that
    re-baseline is legitimate only because the check changed definition, and it is documented
    here so it cannot be repeated as a way of absorbing real debt.

23. **Worldwide means the SOURCES, not just the words (2026).**
    *Why:* #22 made the register's frontier check and the search plan region-neutral, which
    fixed the bias in what the tool ASKS. It did not fix what the tool READS. Every probe was
    English and `performSearch` passed no locale, so an English query hit an English index and
    returned the Anglophone commentary ABOUT a global industry rather than the industry's own
    sources — the Baolong cost forecasts surfaced through an English report on China, not from
    Chinese material. `performSearch` now accepts `{ country, searchLang }` (Brave supports
    both) and the plan carries two cheap native-language frontier probes (zh-hans/cn and
    jp/jp, 2 hits each) alongside eight region-neutral English ones. Tests assert the locale
    actually reaches the provider AND that global probes stay unpinned, so worldwide reach
    cannot be bought by pinning everything to one market. *Known limit, stated not hidden:*
    without a Brave key the fallback is DuckDuckGo's Instant Answer API — encyclopedia
    abstracts, not a web index — so locale gains nothing there. Worldwide retrieval needs a
    search key; the tool degrades honestly and says so rather than pretending.

24. **Technology dossiers: depth, and BOTH sides (2026 depth audit).**
    *Why:* a reader said the report was too superficial to understand, citing axial flux —
    fairly: its whole entry was a 119-character note. `note` is one paragraph and there was
    nowhere to put mechanism, origin, or forward view. Worse, a scan of all 180 entries found
    ZERO carrying a single disadvantage. A register that lists only upside is a sales
    brochure, and a cost engineer choosing between architectures needs the reasons not to as
    much as the reasons to. Entries now take an optional `detail` dossier — `howItWorks`,
    `origin`, `benefits[]`, `tradeoffs[]`, `outlook` — rendered in the PDF as a brief with
    benefits and trade-offs in facing columns, trade-offs in their own colour so the report
    cannot be mistaken for advocacy. `one-sided` (benefits with no trade-offs) is curation
    DEBT and gated at zero. Dossier depth is tracked SEPARATELY as `depthPct` rather than
    folded into `flaggedCount`, because a dimension that starts at 0% would swamp a gate whose
    job is catching regressions in evidence/region/findability. *Changes it:* nothing — but
    note the rendering bug this created and how it was caught: the first cut used a
    mid-column break guard that silently dropped trade-offs at a page bottom. Dropping the
    downside specifically is the worst failure this report could have; the block now
    pre-measures and paginates with both columns intact.

25. **A powertrain named in the query is a ranking signal, not noise (2026).**
    *Why:* "HEV battery" ranked the register's one MHEV-specific technology 24th, behind 23
    BEV-first entries — the engine matched on "battery" and threw "HEV" away, leaving the user
    to discover the powertrain dropdown. `powertrainHint()` now reads MHEV/PHEV/BEV/ICE intent
    out of free text and BOOSTS applicable entries. Boost, not filter: HEV and BEV battery
    technology overlap heavily (chemistry, cell contacting, thermal barriers are shared), so
    hiding BEV entries would lose real content. The boost is also PROPORTIONAL —
    `matching/total powertrains × 4` — because a flat bonus lifted almost everything (most BEV
    battery entries also list PHEV) and changed nothing; weighting by how much of an entry's
    applicability is the hinted powertrain puts an MHEV-only technology above a BEV technology
    that merely also applies. *Changes it:* nothing — but note the failure mode found while
    fixing it: the first, binary version looked like it worked and moved the target entry only
    four places. Measuring the actual rank, not eyeballing the list, is what caught it.

26. **The Innovation Studio report renders `analysis` generically, not per method (2026).**
    *Why:* eleven methods (twelve counting TRIZ on its own page) each return a differently
    shaped deterministic result — a FAST function-cost matrix, a characteristic register, a
    teardown-delta list, a TRIZ contradiction. A `switch (method.id)` in the exporter would
    mean every new method silently exports as a blank page until someone remembers to add a
    branch, and nobody would notice because the export still "works". So the report walks the
    `analysis` object: short scalars become a metric strip, long scalars become named
    paragraphs, arrays of objects become tables with proportional column widths, and arrays of
    plain values become lists. TRIZ feeds the same generator through a thin adapter (the
    contradiction and the principles applied ARE its analysis; a principle is its lens), which
    is the proof the generality is real and not shaped around one method.
    *Changes it:* the pdf-qa fixture carries two payload shapes deliberately — if a future
    change quietly special-cases the FAST matrix, the TRIZ fixture shows it.

27. **The engine verdict is the report's spine, and it is decided in testable code (2026).**
    *Why:* the house rule only means anything if a contradicted idea is as visible as a
    confirmed one. `verdictOf` lives in `innovation-report-core.mjs` as a pure function
    returning a semantic TONE, and the exporters map tone to colour — so the honesty decision
    is made once, in something node:test can exercise, rather than twice inside two renderers.
    Three specifics it enforces: an unrecognised status is surfaced VERBATIM rather than
    flattened into "unchecked" (saying "we do not know what this means" beats falsely claiming
    nothing happened); `savingPct: 0` and negative savings stay visible instead of being
    falsy-filtered away; and an idea with no check at all gets an explicit "the engine had no
    comparable basis" sentence rather than an empty space the reader would read as a pass.
    The PDF also gives the three verdicts a legend page, and the Excel tints contradicted rows
    red — the disagreement is a feature of the deliverable, not a blemish hidden from it.
    *Changes it:* nothing — but this is why the exporters must never filter the idea list.

28. **DFM geometry is measured on the TESSELLATION, not on analytic surfaces (2026).**
    *Why:* the previous draft analysis inspected only `PLANE` and `CYLINDER` faces. Real
    die-cast and moulded automotive parts are mostly freeform, so on a truncated pyramid
    with an EXACT 3.000° draft on all four walls it found ZERO drafted faces and invented
    two undercuts (the flat top and bottom), because `ThruSections` produces B-spline walls.
    The wall-thickness ray-cast accepted any hit, so a 10 mm plate measured 39.95 mm — the
    part's WIDTH — from four UV-midpoint samples, several of which land outside a trimmed
    face. Working on the tessellation fixes both at once: a triangle centroid is always
    inside its face, and a triangle has a normal whatever the underlying surface is. It also
    costs ~0.02 s, which is what pays for sweeping candidate draw directions instead of
    hard-coding +Z. *Changes it:* nothing — but note two bugs the fixtures caught that
    reading could not. A tessellation chord sits INSIDE the true cylinder, so a 0.01 mm ray
    offset left the origin buried in the solid and every boss read as an undercut (the offset
    now scales with mesh deflection). And stdDev called a constant 2.50 mm shell
    "non-uniform" because a few rim rays measure down the wall, so uniformity uses a robust
    spread ratio.

29. **Undercuts are separated from zero-draft drag faces — four states, not two (2026).**
    *Why:* a zero-draft wall is fixable with a degree of taper; an undercut buys a slide or a
    lifter. Collapsing them is the easiest way to produce a confident wrong report, and an
    early probe of mine did exactly that, scoring a clean box 62.6% undercut. Classification
    is now `partingParallel | releasing | zeroDraft | undercut`, area-weighted, with the
    undercut test being ray occlusion in both tool halves rather than a normal sign.
    *Changes it:* nothing — the `box-side-hole` fixture gates it, requiring 1 undercut and 4
    zero-draft faces at +Z.

30. **Feature recognition is HYBRID, because AAG alone cannot see a through hole (2026).**
    *Why:* decomposing the attributed adjacency graph at concave edges is the standard method
    and it works — a blind hole comes back as `[CYLINDER, PLANE]`, a rectangular pocket as
    five planes. But a through hole has NO concave edges: convex rim top and bottom, no
    floor. A probe on a part with a through hole and a pocket found only the pocket. So
    cylindrical features keep coming from the exact analytic pass and prismatic features from
    the graph. Getting the convexity label itself right took three attempts: UV-midpoint
    normals left 16 of 18 edges unclassifiable, and probing along `n1+n2` with a solid
    classifier discriminates NOTHING (that direction exits the solid for convex and concave
    alike, scoring a pocketed box 24/0). What works is the dihedral test using each edge's own
    pcurve, signed by the edge's orientation in face 1's wire. *Changes it:*
    `through-hole-and-pocket.step` exists to fail if anyone "simplifies" this to pure AAG.

31. **A DFM rule has three outcomes: pass, fail, and NOT EVALUATED (2026).**
    *Why:* the recogniser does not yet produce pocket bounding boxes or bend features, so
    several rules cannot be measured on a given part. Treating those as passes would let the
    report claim a clean bill of health it never checked. `extractMeasures` therefore never
    returns a fallback — a test asserts every measure is `undefined` on empty geometry — and
    unmeasurable rules are listed with their reason, in their own PDF section and their own
    Excel SHEET headed "these were NOT checked and are NOT passes". Two consequences follow:
    `coveragePct` always appears beside the score, and the score is computed over evaluated
    rules only, returning `null` when nothing ran. *Changes it:* a live render caught the
    inverse failure — with zero evaluated rules the report printed a green "no rule was
    breached", an all-clear on a family nobody looked at. That line now requires
    `evaluatedCount > 0` and states the count.

32. **A finding is priced by the existing engines or not priced at all (2026).**
    *Why:* the house rule says the engine produces every number. Wall thickness and setup
    count are modelled cost drivers, so those findings are re-costed through
    `computeShouldCost` / `featuredMachiningCost` at the NEAREST compliant value — the
    smallest change that clears the rule, not the most flattering one. Draft, undercuts,
    corner radii and warp are not piece-price drivers in these engines, so those come back
    `priced: false` WITH the reason. Where the literature gives a range it is passed through
    labelled "cited literature, NOT an engine result". `summarisePricedImpact` excludes the
    unpriced ones and names how many were left out, because they may well be the expensive
    ones — an undercut buys tooling, not piece price. *Changes it:* the DFM rule family is
    now DERIVED from the chosen costing process. A live run on an aluminium die-cast bracket
    ran injection-moulding rules too and priced EUR 36,000/yr of moulding savings on a part
    nobody will mould; with no process given, the report says in amber that every family was
    run speculatively and the figures must not be summed.

33. **DFA symmetry is measured by rotating the solid, and the index is withheld until a
    human answers (2026).**
    *Why:* Boothroyd's handling time depends on size, thickness, weight and α/β symmetry, and
    every commercial DFA tool asks an engineer to read those off the part and type them in.
    All four are geometric. Equal principal moments are NECESSARY but not SUFFICIENT for
    rotational symmetry — a cube has three equal moments and is not a sphere — so inertia only
    proposes a candidate axis and the symmetry is verified by rotating the solid and
    intersecting it with itself (cylinder 1.000 at every angle, cube 1.000 at 90° but 0.944 at
    7.3°, 60×40 plate 1.000 at 180° and 0.667 at 90°). But the three minimum-part questions
    are about FUNCTION and INTENT, which a static solid model cannot answer: geometry
    proposes a probable fastener at low confidence and notes that a dowel and a bolt look
    identical to a solid modeller, and the user confirms. Until every part is answered,
    `theoreticalMinParts` and `designEfficiencyPct` are `null` and the completeness block
    names the outstanding parts. *Changes it:* the time model is OURS. Boothroyd & Dewhurst's
    method is public and is what we follow; their tables are copyrighted and licensed with
    their software, so `dfa-time-model.mjs` is MTM-structured with every coefficient exposed
    as data for calibration, and a test asserts the provenance string.

34. **Rib recognition is deliberately LOOSER than the rules that judge ribs (2026).**
    *Why:* a rib is a pair of opposed side faces with MATERIAL between them, standing on a
    common base. Two tests do the work and both are needed. First, one signed dot product:
    for a protrusion the far face lies behind the near face's outward normal
    (`(c_far - c_near) . n_near < 0`); for a pocket or slot the walls look at each other and
    the sign flips. That separates a rib from a depression with no solid classification at
    all. Second, both sides must reach a common base by a CONCAVE arc — without it a plain
    40×40×8 plate qualifies, since it has two opposed faces with material between them and a
    height-to-thickness ratio of 5, which is a textbook rib shape and emphatically not a rib.
    The recognition gate is then only "taller than it is thick". It is NOT the 40–60%-of-wall
    threshold, and that is the point: gating recognition on the rule would make an over-thick
    rib disappear from the model rather than be flagged, turning a finding into silence. The
    `ribbed-plate.step` fixture carries a deliberately over-thick rib to hold that open.
    *Changes it:* ribs are removed from the graph before prismatic decomposition. Each rib
    meets its base concavely on all four sides, so three ribs on a plate left the base
    concave-connected to twelve rib faces and decomposed into a single 13-face "pocket" —
    three protrusions reported as one depression, measured before the fix. Thickness is
    reported at the BASE, where the guideline is written: on a drafted rib the sides lean
    apart, so `height * tan(draft)` is added rather than reporting the thinner mid-height
    separation. And the ratio against the nominal wall is computed in `dfm-rules.mjs`, the one
    place both the rib and the measured wall exist — when the wall could not be measured the
    ratio stays undefined and all six rib rules abstain instead of dividing by a default.

35. **The symmetry budget is wall clock, measured, and degrades per solid (2026).**
    *Why:* the DFA symmetry cap was `MAX_SYMMETRY_PARTS = 60` — sixty SOLIDS, with no
    reference to how complex any of them was, and set without measuring anything. Measured
    since, one solid at a time: 6 faces 0.13 s, 14 faces 2.30 s, 26 faces 4.45 s, 36 faces
    7.08 s — roughly 0.2 s per face past a dozen faces. Sixty solids of that 36-face part is
    425 s against the bridge's 120 s timeout, so the cap would have let a real assembly run
    straight into a bare "timed out" after two minutes with nothing to show. Every automotive
    part is well past 36 faces. The budget is now 45 s of wall clock, which is robust to any
    geometry the cap could not anticipate, plus a 150-face per-solid guard so one large part
    cannot starve everything queued behind it. *Changes it:* the degradation is PER SOLID.
    Whatever is measured before the deadline keeps its symmetry; the rest carry
    `measured: false` with the reason, `symmetryMeasuredCount` says how many made it, and the
    DFA limits block reports "measured on 12 of 40 solids" rather than a binary that hides
    which parts still have a real orientation term. A partial answer that states how partial
    it is beats an all-or-nothing cap in both directions.

36. **The catalogue names the rules it does NOT have (2026).**
    *Why:* the build plan named about 25 DFM rules; 26 are written and five are deliberately
    absent — tool reachability, tolerance stack-up, sink/warp prediction, blank nesting, and
    press tonnage/station count. Each needs a measurement the pipeline does not produce: a
    reachability sweep, PMI annotations that a STEP solid does not carry, a mould-flow
    simulation, or an unfolded flat pattern. A rule whose measure never resolves can only
    ever report NOT EVALUATED, so shipping those five would have raised the advertised rule
    count while LOWERING the coverage figure on every part forever — exactly the criticism
    the sheet-metal family earned when all four of its rules depended on measures nothing
    produced. `UNWRITTEN_RULES` exports each gap with the measurement it would need, and
    `GET /api/dfm/rules` returns it beside the catalogue. *Changes it:* the recogniser's own
    `knownLimits` is finally RENDERED — on the page, in the PDF and as its own Excel sheet.
    It had been emitted since the feature shipped and displayed nowhere, while the PDF
    carried a hand-written limits list that had gone stale: it told every reader that
    "sheet-metal rules require bend recognition, which is not yet implemented" for the entire
    life of the wave that implemented it. A hand-maintained capability list drifts; the
    engine's own does not.

37. **Degenerate fixtures are part of the gate, not a separate concern (2026).**
    *Why:* every accuracy fixture is a well-formed, sharp-edged, millimetre solid, and that
    is precisely how a 100% gate coexisted with four live bugs — a surface model crashed with
    `KeyError 'meanMm'`, a metre-scale part returned HTTP 200 and a confident 0.05 mm wall
    with three findings, and an unreadable file showed the user OCCT's own ANSI-coloured
    parser output. The bugs were fixed and proven live; no fixture held them dead. Four now
    do, and their truth is not a measurement — it is that the tool degrades HONESTLY: a typed
    result, never a stack-trace fragment or kernel internals, no wall published for a shape
    with no thickness, and every dimensional rule WITHHELD when the units are suspect (the
    gate records that the raw engine would have evaluated 3 rules and found 2, at a scale
    nobody checked). *Changes it:* `generate.py` now normalises the STEP header timestamp.
    OCCT stamps wall-clock time into every file, so each regeneration rewrote all sixteen
    committed fixtures with nothing but a new date — the module docstring promised
    byte-comparable output and did not deliver it. A fixture diff should mean the geometry
    moved, which is the only reason anyone should be reviewing one.

38. **Ray casting is budgeted, and the budget was set by timing REAL parts (2026).**
    *Why:* six genuine automotive STEP files — CATIA V5 and Creo exports, 209 to 426 faces —
    were the first non-synthetic geometry this feature ever saw, and one of them timed out at
    the bridge's 120 s limit in front of the user. Every analytic fixture is a primitive with
    a few hundred triangles, so a ray cast PER TRIANGLE cost nothing and the gate ran at 100%
    the whole time. On the smallest real part: wall thickness 24.4 s over 4000 rays, and the
    draw sweep 34.2 s over 22,728 (three axes x every triangle). A draft ANGLE is arithmetic
    on a triangle normal and stays exact for all of them; only VISIBILITY needs a ray, so only
    that is sampled, each sampled triangle standing for the ones it strides over so the area
    fractions remain unbiased. The sweep also became two-stage: ranking three axes needs a
    coarse sample, and only the winner is re-classified at full budget. Budgets come from a
    measured curve, not a guess — on the 426-face bracket the undercut fraction moved 0.02
    points between 800 and 3000 rays while the cost went 8 s to 30 s, and wall p50 was
    identical at every budget. Worst case fell from a 120 s timeout to 37.5 s. *Changes it:*
    the result carries `sampled`, `raysCast` and `trianglesTotal`, and the route raises a
    limit saying the draft percentages are estimates — a figure that silently changes from a
    census to an estimate as parts get bigger is exactly the kind of number this feature
    exists not to produce. A wall-clock budget now also skips a stage WITH A REASON rather
    than letting the process be killed with nothing to show.

39. **A sheet has ONE thickness, and it must agree with the measured wall (2026).**
    *Why:* the same six real parts exposed something worse than the timeout. Bend recognition
    pairs coaxial cylinders of differing radius — which is also the exact signature of a hole
    and its counterbore, or a boss and its blend. So an aluminium casting was reported as
    "0.5 mm sheet with 11 bends" and a machined block as "11.5 mm sheet", both were handed to
    the sheet-metal rule family, and both produced findings — including a negative
    hole-to-bend clearance — computed from geometry that is not a bend. Nothing is 11.5 mm
    sheet. Three tests, every one of them read off the measured data rather than invented:
    a pair sweeping 180 deg is a bore, not a fold (every false positive came back at exactly
    180.0 deg while the genuine folded bracket's bends ran 30-100 deg); the implied
    thicknesses must agree with each other (the real sheet part returned 1.602 mm on all 38
    bends, the casting returned 6.5 / 3.5 / 4.8 / 0.5); and the radius-derived thickness must
    agree with the INDEPENDENTLY ray-cast wall (1.602 against 1.60 on the real part, 0.5
    against 15.84 on the casting). Two different methods landing on the same number is what
    makes it a measurement rather than a coincidence. *Changes it:* rejection is explicit —
    the reason names both figures — and `counterbore-plate`, `boss-plate` and
    `plate-two-holes` now gate it, asserting both that the part is refused AND that the
    sheet-metal family then evaluates nothing. Rib recognition was tightened the same way:
    at a 1.0 height/thickness gate it called a 25.5 x 26.4 mm lump on a machined block a rib.

40. **When two draw directions score alike, that is reported, not resolved (2026).**
    *Why:* the coarse ranking that made the sweep affordable could not separate close
    candidates, and the choice changes every number downstream. Measured on a real die-cast
    bracket: the winning axis flipped X -> Z -> X as the ranking budget went 250 -> 600 ->
    2000, because at full resolution those two sit 0.59 points apart on undercut area
    (6.94% vs 7.53%) — and the reported wall-area-below-draft swung 38% to 75% with it.
    Two fixes, and the second matters more than the first. Any candidate within 8 points of
    the coarse leader is now re-measured at FULL budget before the winner is chosen, so the
    ranking no longer depends on the sampling rate. And when the top two remain within 2
    points after that full measurement, the result carries `drawDirectionAmbiguous` with the
    margin, and the report says the parting direction is a DESIGN DECISION rather than a
    geometric conclusion. On the six real parts the margins came out 0.59 (ambiguous), 9.1,
    11.6, 17.5 and 49.9 — so exactly one part is genuinely a judgement call and it says so.
    *Changes it:* a tool that silently picks one of two near-equal partings and prints its
    draft percentages as fact is hiding a decision the toolmaker owns. Surfacing the tie is
    more useful than resolving it.
