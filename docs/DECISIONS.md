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

41. **A saving that needs a drastic redesign is labelled a CEILING, at the top (2026).**
    *Why:* the wall-thickness pricer scales mass by the thickness ratio, which is the right
    first-order physics for coring a section out. On a real die-cast bracket measuring a
    15.84 mm median wall, taking it to the 3.5 mm band implies removing 78% of the part's
    mass, and the engine priced that at EUR 411,000/yr — a correct calculation and an
    indefensible conclusion, because nobody cores a structural bracket down to nothing. The
    finding stands; the figure now carries `upperBound` and a caveat saying it is reached
    only if the heavy sections can be cored to the nominal wall throughout, and that a
    structural part recovers the fraction its loads allow. *Changes it:* the caveat is not
    enough on its own. The first render put a clean "EUR 411,000" in a green cover tile with
    the qualification three pages away — and the cover number is what a reader carries out of
    the room. Both headline positions, the cover tile and the per-process header, now read
    UPPER BOUND / CEILING whenever an upper-bound finding contributes to the total. A
    six-figure number that quietly assumes the most flattering redesign available is the
    single easiest way for this tool to lose a room's trust.

42. **Threshold provenance is GRADED, because it is uneven (2026).**
    *Why:* asked whether the thresholds had been compared against a proper reference, the
    answer was no. All 26 `source` strings read like citations — "Die-casting design
    guidance", "General machining design guidance" — and not one named a standard, an author,
    a page or a document number. They were written from engineering knowledge and printed
    under a `SOURCE:` label, which claims an authority the tool had not earned. That is the
    same failure this feature calls out everywhere else, committed by the feature itself.
    `sourceStatus` now grades each one: `standard-named` (1 rule — NADCA S-4A-7 for
    die-casting draft, designation and values corroborated, standard paywalled and NOT read
    first-hand), `industry-consensus` (24 rules — widely published and mutually consistent
    across suppliers, no primary source audited), `engine-derived` (1 rule — from our own
    cost model, verifiable in this repo). The grade prints beside the source on the page and
    in the PDF, and a standing paragraph on the report's first page separates the two kinds
    of number: the geometry is measured and reproducible, the guideline values it is compared
    against are not of the same standing. *Changes it:* where a value is DISPUTED, the rule
    says so. Mack Molding publish "Why 60% Rib-to-Wall Ratio is NOT Sacred", arguing the
    limit depends on resin, texture and whether the opposite face is cosmetic — so the two
    rib-thickness rules carry that dissent in their own source text rather than presenting a
    contested number as settled. None of these thresholds has been validated against
    controlled trials or measured scrap data; they are screening values, and the report now
    says which is which.

43. **One face-id convention, and a gate that resolves ids to surfaces (2026).**
    *Why:* four passes numbered faces four different ways and two of them were wired
    together, so the 3D highlight painted the WRONG FACE on every part ever uploaded.
    `dfm_geometry.tessellate` counted with a `TopExp_Explorer` (1-based, incrementing before
    the triangulation check); `feature_recognition.build_aag` and `_extract_feature_table`
    used a 1-based `TopTools_IndexedMapOfShape`; the viewer's `tessellate_to_stl` used a
    SEPARATE 0-based counter that advanced only on faces the mesher handled. Proven against
    known truth on `box-side-hole.step`, whose single undercut IS the cylindrical bore: the
    analysis reported face 6, the viewer painted its face 6 — a PLANE — and the bore was
    face 5. The two enumerations also differ in kind, not just origin: `MapShapes`
    deduplicates by TShape+location+orientation and an explorer does not, so the error grows
    on compounds. Everything now uses the 1-based indexed map, untriangulated faces keep
    their slot with `meshed: false` so numbering stays dense, and the payload declares
    `faceIdBase` / `faceIdOrder` so no consumer has to infer it. *Changes it:* the viewer
    looked faces up as `meta.faces[faceId]` — BY ARRAY POSITION — in three places, which
    would have relocated the bug rather than fixed it; it now keys a Map by the engine's id.
    And the gate no longer counts, it RESOLVES: each reported id is looked up in the
    tessellation metadata the browser actually receives and its surface type asserted from
    construction (the undercut must be a cylinder). An off-by-one changes no count, which is
    why 92 green checks coexisted with a highlight that was wrong on every single part.

44. **Face overlays are LAYERS, and every finding carries where it is (2026).**
    *Why:* the viewer painted highlights into a single mesh held in one variable, and
    `selectFace` called `clearHighlight()` before painting its own — so the instant a user
    clicked a face to read its diameter, every undercut highlight on the part vanished. The
    two paths shared one slot. Overlays are now a `Map` keyed by layer: selection has its
    own, findings have theirs, and inspecting geometry never erases the analysis painted on
    it. `applyClipping` iterates every layer, because a section plane that cuts the part but
    leaves a highlight floating in the removed material puts the evidence where the material
    is not. *Changes it:* `classify_draft` was throwing away the triangle centroids it
    already had, so a finding could say "34 undercut regions" and point at none of them. It
    now accumulates an area-weighted centroid per face and emits `undercutRegions` /
    `zeroDraftRegions` — face id, position, area and the draft that made it a finding. Gated
    against construction: the Ø12 bore through a 60x40x30 box must anchor at (30, 20, 15),
    its axis mid-span, and it does exactly. An anchor that drifts would leave every callout
    pointing at empty space while the counts stayed green — the same class of invisible
    failure as the face-id off-by-one.

45. **The viewer opens on upload, not after the analysis (2026).**
    *Why:* `CadViewer3D` was mounted inside the results block, so a user chose a file and
    then watched a form for up to 30 seconds with their own part invisible. `CadToCostPage`
    had always done the opposite — the viewer sits above the analysis flow, commented
    "Independent of the parse/analyse flow below" — and that is the right way round: the part
    appears the moment it is chosen and the findings paint onto it when they arrive.
    *Changes it:* the handle is now programmable. `setView`, `fit`, snapshot, section planes
    and per-layer painting existed already as UI-only closures with no way in from outside;
    they are exposed on `CADViewerHandle`, and `CadViewer3D` became a `forwardRef` so a page
    can drive them. Every ref method resolves off the LOAD promise rather than the create
    promise — a snapshot taken against a half-tessellated scene is a picture of nothing, and
    a caller has no way to detect that from outside. The toolbar's own snapshot button now
    routes through the same function as the report capture, so the two cannot drift to
    different resolutions.

46. **Every located finding is gated against its construction coordinates (2026).**
    *Why:* V2 gave findings positions, and a position is exactly the kind of value that can
    drift without any test noticing — a callout anchored 20 mm off still renders, still
    counts, and points at bare material. So each anchor is checked against arithmetic from
    the fixture's own construction, not against what the engine said last time. The Ø12 bore
    through a 60x40x30 box anchors at (30, 20, 15), its axis mid-span. The three ribs built
    at x = 10, 45 and 80 spanning y = 20..60 anchor at 11.5 / 46.2 / 82.5, each at y = 40.
    The blind-hole floor in a 10 mm plate reads 4.00 mm at the hole's own coordinates.
    *Changes it:* three sources of position were already being computed and discarded.
    `classify_draft` had the triangle centroids; `wall_thickness` had the ray origin and the
    face for every sample; `build_aag` computed a bounding box per face and kept only its
    aspect ratio. None of it survived to the wire, so a prismatic feature was a bag of face
    ids with nowhere to point. Keeping what was already in hand cost nothing and is what
    makes annotation possible at all. One real bug fell out en route: `axisPointXYZ` was
    dropped when compound holes were assembled, and the sheet-metal flange logic keys off
    that field on hole rows — so every counterbored and countersunk hole had been silently
    skipped there.

47. **Callouts are DOM, and deliberately not in the pixels (2026).**
    *Why:* findings are now pinned to the geometry that caused them — a ring on the face, a
    leader line, the label and its measured value, coloured by severity. `CSS2DRenderer`
    does the pinning and ships inside the installed `three`, so it is a lazy import beside
    the existing `OrbitControls` one and not a new dependency. DOM labels rather than
    canvas sprites because sprite text blurs on zoom and cannot carry markup. *Changes it:*
    this has a consequence the PDF work depends on. `renderer.domElement.toDataURL()`
    captures the WebGL canvas ONLY — a DOM overlay is not in it. So a report figure cannot
    just screenshot the annotated view; it captures the clean render and draws its callouts
    as VECTOR on top, using `projectAnchors()` to place them. That is the better outcome
    anyway: callout text ends up sharp at print resolution instead of upscaled screen
    pixels. `projectAnchors` returns a `visible` flag and the caller must DROP the
    off-screen ones rather than clamp them, because a clamped leader line points at a face
    that is not in the picture.
    *Also:* an anchor arrives in the PART's own coordinates while the mesh is both
    re-centred on a discarded offset and rotated -90 deg on X by `partGroup`. Both
    transforms are undone in one place (`toWorld`), and the centring offset — previously a
    local const, thrown away after use — is now remembered. Without it every callout would
    have been pinned confidently to the wrong place, which is precisely the failure the
    face-id work existed to end.

48. **The progress the user watches is the progress that actually happened (2026).**
    *Why:* a real part takes 5-30 s and the page showed a spinner for all of it. The engine
    already ran in discrete phases, so it now prints one `@stage {json}` line to stdout the
    moment each phase GENUINELY COMPLETES, carrying the figure it just measured — 7,862
    triangles, a 1.60 mm median wall over 1,000 rays, the winning draw axis and its undercut
    percentage. The bridge already read stdout incrementally, and `extractJson` already
    scanned for the last parseable line, so a non-JSON progress line interleaved ahead of
    the result needed no protocol change at all. `POST /api/dfm/analyze` streams these when
    the caller sends `Accept: text/event-stream` and returns exactly the same JSON otherwise
    — the benchmark and every existing caller are untouched. Nothing is predicted or
    interpolated: there is no percentage, and a stage skipped by the time budget reports
    `skipped` with its reason, which is what the UI then shows.
    *Changes it:* the first working version streamed the result and silently dropped every
    stage. `req.on('close')` fires when the REQUEST STREAM ends, and for a multipart upload
    that is the moment multer finishes reading the body — not when the client disconnects.
    So every caller was marked gone before the analysis started and every progress event was
    swallowed, while the final result still went out. It watches `res.on('close')` now. The
    symptom is worth remembering: a stream that appeared to work and showed no progress.

49. **The report carries the part with its findings marked ON it (2026).**
    *Why:* this is the thing the incumbents do and we did not. A DFM report that says "34
    undercut regions, 38.38% below minimum draft" makes a supplier open CAD to find out
    where; DFMA and aPriori put the finding on the geometry. The export now captures the
    viewer at 1400x1000 from three angles and embeds each with numbered markers on the
    faces that caused the findings, plus a legend carrying each measured value.
    NUMBERED MARKERS AND A LEGEND, not floating labels: labels placed at their anchors
    collide the moment two findings are near each other, and the usual fixes — nudging,
    leader elbows — fail on a dense casting. A numbered ring on the geometry and a numbered
    list beneath is what an engineering drawing has always done and it never collides.
    Off-screen anchors are DROPPED, never clamped to the frame edge, because a leader line
    pointing off the picture is worse than none; a view with nothing visible says so.
    *Changes it:* figures are the SECOND ARGUMENT to `exportDfmPdf`, not a field on the data
    object. `deepPdfSafe` walks every string codepoint by codepoint with rope
    concatenation, so a megabyte of base64 through it would visibly jank the export, and a
    non-string image payload would be silently rebuilt as a plain object and destroyed.
    Image data never enters the sanitiser. The markers are drawn as VECTOR over the raster,
    which is both sharper in print and unavoidable: the viewer's own callouts are DOM and
    never appear in a WebGL capture at all. And the headless QA harness now renders the
    report TWICE — once without figures, the branch a browserless caller and any failed
    capture takes, and once with a real data URI, proving jsPDF decodes it in node where
    there is no canvas. A PDF byte-size gate came with it: there was none, and the failure
    mode of embedded renders is a report too large to email.

50. **A body id IS a DFA part index — verified, not assumed (2026).**
    *Why:* shading an assembly by handling time means colouring viewer body N with part N's
    figure, which is the same class of cross-producer correspondence that made the face-id
    highlight wrong on every part. Both sides walk the solids with the same
    `TopExp_Explorer(TopAbs_SOLID)`, so they should agree — but "should" is exactly what was
    believed about faces. Checked empirically on `bolted-assembly.step`: the viewer reports
    body 0 with 6 faces (a box — the plate) and bodies 1 and 2 with 3 each (a cylinder is
    3 faces — the pins), while the DFA reports 40000 mm3 then 1257 twice, in that order. The
    correspondence holds, and the reasoning is written down beside the code that relies on
    it. *Changes it:* the assembly is shaded against the SLOWEST part on the same assembly
    rather than an absolute scale, because handling seconds mean nothing without comparison
    — 4 s is slow for a bracket and fast for a wiring loom. Parts the engine could not time
    are left out of the colour map entirely and stay neutral, rather than being shaded as
    though they were quick. The explode control only appears when there is genuinely more
    than one solid: on a single-part file it would do nothing while implying the tool had
    found an assembly. And a body sitting at the assembly centre has no direction to
    explode along and stays put — correct, since it is the thing everything else comes off.

51. **A hole must close a full revolution; through-vs-blind is classified, not compared to
    a bounding box (2026).**
    *Why:* two real automotive parts were run through the Studio and both feature tables
    were wrong. `_extract_feature_table` accepted ANY cylindrical face as a hole or boss and
    never asked whether the surface closes. On the aluminium casting the fourteen largest
    cylindrical faces swept 20–126° — curved walls, filleted corners, the rounded end of the
    part — and every one became a feature, including a "boss Ø100 × 25.8" that is the
    casting's own outer wall. A drilled hole or a turned boss is a body of revolution: 360°,
    whole or split by the modeller into arcs that sum to 360. A wall never closes.
    *Changes it:* cylindrical faces are grouped by axis line and radius, split into bores by
    axial overlap, and re-expressed in ONE angular frame per group — each STEP face carries
    its own parametric origin, so raw U bounds from two half-cylinders cannot simply be
    added. Grouping is by TOLERANCE, not a rounded key: the two halves of one bore reach us
    with separate `AXIS2_PLACEMENT_3D`s that agree only to write precision, and an exact key
    split a real Ø4.4 hole into two 180° arcs that each failed the test. Through/blind now
    classifies a point just past each end of the bore against the solid; the old test
    compared depth to the part's bbox extent along the axis, which called every hole in a
    1.6 mm pressing blind because the extent it measured against was the whole 341 mm part.

52. **A prismatic feature is single-approach, planar-bounded and bigger than the cutter
    (2026).**
    *Why:* the concave-arc decomposition finds concave junctions, and a junction is not a
    feature. It merged the entire interior of a casting into one 43-face "pocket" of
    14,716 mm² — 23% of the part's whole skin, wrapping around it, reported with "high"
    confidence — and found twelve "steps" of 3–65 mm² on a stamped cross member, two of them
    a torus meeting a NURBS patch. *Changes it:* three physical gates. A pocket, slot or step
    is a volume a tool reaches from ONE direction, so every face normal must fit inside a
    cone of 100° (90° is the geometric limit; the margin is for draft). It is bounded by at
    least one PLANAR face — freeform meeting freeform is a formed-surface transition. And at
    least two of its faces must exceed the floor area of the smallest practical end mill.
    Face normals are SAMPLED for every surface type, because 39 of that casting's 230 faces
    are planar and a planes-only test had nothing to measure on the parts that needed it.
    Casting 4 → 1 feature, cross member 21 → 3.

53. **The geometry gets a vote on what process this is (2026).**
    *Why:* a live report on a 1.6 mm seat cross member opened with "no manufacturing process
    was specified, so EVERY rule family was run speculatively" and then judged a pressing
    against machining rules — while the same analysis had already recognised 38 bends and a
    uniform 1.60 mm wall. The measurement was in the payload; nothing read it.
    *Changes it:* `inferProcessFamily` is a measurement, not a guess. Folded sheet is
    asserted only when bend recognition and the independent ray-cast wall agree. Draft plus a
    thick section says the part leaves a TOOL and stops there — geometry cannot tell a die
    casting from an injection moulding, the material does, and naming one would put the wrong
    family on the report. Machining is asserted from positive evidence (constant section,
    prismatic features, no draft), never as the leftover bucket. It chooses the family when
    nobody named one, and it CONTRADICTS a named one — loudly, on the cover — but only from
    a `measured` reading, never an indicative one.

54. **No nominal wall, no wall saving (2026).**
    *Why:* `priceWallThickness` models coring a uniform section down to the band edge. On a
    bracket whose section runs 4.95 to 44 mm the p50 is a median, not a nominal wall, and
    there is no "the wall" to core — but the engine priced it anyway, at EUR 328,800/yr, and
    that number was the largest thing on the report's cover. The arithmetic was right and the
    conclusion was a category error. *Changes it:* the pricer refuses above the same spread
    threshold the uniformity rules use, so the two can never disagree, and states why. The
    FINDING stands — that section is out of band — and the non-uniformity finding beside it
    is the one that actually describes the problem. Also: a wall reading above the part's
    smallest overall dimension is rejected outright, since nothing inside a part can be
    thicker than its narrowest span; one ray on that cross member returned 85.3 mm on 1.6 mm
    sheet, and a handful of those landing in or out of a sample swung the p95 from 1.61 mm
    ("uniform") to 5.67 mm ("non-uniform") between two runs of the same file.

55. **A marker for a face you cannot see is a lie (2026).**
    *Why:* `projectAnchors` projected every anchor and reported it visible if it was inside
    the frustum. A finding on the far side of the part therefore drew its marker exactly
    where it would sit if it were on the near side, and the report's evidence page carried 43
    of them, on both the isometric and the front view, with an identical 43-line legend under
    each. *Changes it:* the camera's own ray is cast at each anchor and anything occluded by
    the part is dropped, with a skin tolerance scaled to the part so the anchor's own face is
    not counted as blocking itself. The legend is built from the surviving callouts, so it
    now lists what is actually marked on that view and nothing else.

56. **The material and the process decide the threshold — one rule set is not four (2026).**
    *Why:* the Studio hand-typed a ten-material, six-process subset of the tables already in
    `costing-engine.mjs` and collapsed it into four DFM families. Two of the six mappings were
    wrong: "Gravity Die Casting" was routed to the HPDC rules — a 1.0-3.5 mm wall band against
    gravity's 3-8, so every gravity part failed the wall rule automatically and was priced for
    a saving that cannot exist — and "Sand Casting" mapped to nothing, falling through to a
    speculative sweep that judged a sand casting against injection-moulding rules. Every
    threshold was also material-blind: one bend radius of 1 r/t for mild steel and 6061-T6
    (which cracks below about 3), one HPDC wall band for aluminium, magnesium and zinc (which
    fills at 0.6 mm), one moulding band for PP and 30% glass-filled PA66.
    *Changes it:* `dfm-process-registry.mjs` derives the pickers and the routing from the cost
    model's own `MATERIALS` and `PROCESSES` tables, so the two halves cannot drift again — a
    test asserts every costing process is either routed to a family or carries a written reason
    why it has no geometric rules. 4 rule families became 15 and 26 rules became 66, split so
    that HPDC, zinc HPDC, gravity die, sand and investment casting each carry their own wall
    band, draft angle, uniformity limit and core slenderness. Thresholds resolve grade → family
    → generic, and a finding is STAMPED with which it got: a generic band and a band tuned to
    6061-T6 look identical on a page unless the report says which, and the difference decides
    whether the part cracks on the press. The picker only offers processes whose `families` tag
    accepts the chosen material, so injection-moulding a steel bracket is unselectable rather
    than warned about. The selector is labelled **Manufacturing process**, not "Costing
    process" — as cost metadata it read as optional, so it was left unset and every part got a
    speculative sweep.

57. **Draft is a curve, not a point (2026).**
    *Why:* `wallAreaBelowMinDraftPct` was computed against a hardcoded 1.0 degree and then
    compared by rules that mean different angles — zinc die casting releases at 0.5, aluminium
    wants 1-2, sand needs 1.5-3, a hot forging 5-7. Judging all of them at one cutoff is the
    exact "generic DFM" the catalogue exists to avoid. *Changes it:* the classifier already
    measures a draft angle per triangle, so it now emits the whole cumulative curve at 0.5, 1,
    1.5, 2, 3, 5 and 7 degrees, and each rule names the angle it means in `draftCutoffDeg`.
    Verified against the old figure: the 1-degree point reproduces the previous number exactly.

58. **Every viable route, from one measurement (2026).**
    *Why:* a DFM report answers "is this part good for the process you named". The question a
    cost engineer arrives with is "which process should make it", and answering it needed no
    new measurement — the geometry is measured once and each candidate is the existing rule
    engine plus the existing cost engine plus the existing carbon model run with a different
    process. *Changes it:* `dfm-routing.mjs` returns COLUMNS, never a blended ranking. Cost,
    manufacturability and CO₂e are three questions in three units and one number would hide
    the trade-off the reader came for. Carbon is fed the cost engine's own buy-to-fly mass
    rather than the finished weight, so a sand casting at 55% yield carries the carbon of
    everything it pours — on the finished weight every route would have shown the same figure.
    Tooling is reported as the TOTAL cheque as well as the amortised slice, because two routes
    at the same piece price are not the same decision when one needs a €141k die. A route the
    cost model refuses keeps its row and its reason; a table that drops what it failed on
    reads as "these are the options". On the real casting: machining scores 100 at €27.54 and
    9.98 kg CO₂e, aluminium die casting scores 13 at €6.60.

59. **A finding names the features that break it (2026).**
    *Why:* "max hole depth/diameter is 8.2" sends a supplier hunting through the model.
    *Changes it:* the ratio measures keep their offenders — diameter, depth, count and
    coordinates, worst first — and a finding lists only the ones that actually fail, because
    putting all twenty holes under a "hole too deep" finding buries the two that are wrong.
    A passing rule lists nothing but still reports how many it checked, so a pass is visibly
    a pass over something.

60. **A plant's own standard outranks a published one, and is graded higher (2026).**
    *Why:* this is how a DFM tool gets adopted — the organisation encodes ITS thresholds
    rather than accepting a vendor's. *Changes it:* per-workspace overrides stored against the
    rule id, validated against the rule's own shape (a `between` rule takes `[min, max]`, a
    comparison rule takes a number) so a stored threshold cannot make a rule silently
    unevaluatable. An overridden threshold carries `sourceStatus: 'customer-standard'` and the
    author's note as its source line — a STRONGER grade than the industry consensus it
    replaced, because someone accountable put their name to it, and crediting a handbook for a
    number the handbook never gave would be the reverse. A rule switched off leaves the
    denominator too: `coveragePct` means "what could not be measured", and dragging it down
    for a check the plant deliberately does not run would corrupt that.

61. **Tool accessibility is shank clearance, not line of sight — and bores are excluded (2026).**
    *Why:* the check DFMPro leads its machining family with, and this engine had declared it
    unwritten since the catalogue existed with setup count as the acknowledged proxy. Setup
    count answers a different question. *Changes it:* for each of six approach directions, a
    cylinder of the tool diameter is swept from each surface point to infinity and must clear
    the solid — four circumference probes plus the axis. A pocket floor is VISIBLE down a 3 mm
    slot and a 10 mm cutter still cannot get there, so a centre-ray test would call it
    reachable every time. The union across directions is computed per triangle, not by adding
    per-direction percentages, or a face reachable from three sides would count three times.
    **Bores are excluded**, and without that exclusion the measure produced a false finding on
    the most ordinary part there is: a plain plate with two drilled holes scored 7.2%
    unreachable, because a Ø8 hole is not reachable by a Ø10 end mill and does not need to be —
    it is drilled by a Ø8 drill. Bore slenderness is the drill-depth rule's job. The holder,
    spindle nose and machine envelope are NOT modelled and that is published with the result:
    this is a lower bound on the access problem. Gated by the strongest analytic truth
    available — a convex solid must be exactly 100% reachable, since no material can lie
    between a face and infinity along its own outward normal.

62. **A batch is a portfolio, and an unreadable part keeps its row (2026).**
    *Why:* a plant head does not care about one bracket; they care about which twenty of five
    hundred are worst, and the tool was strictly one-part-at-a-time. *Changes it:* up to 25
    parts per request, analysed sequentially because each forks a Python OCP process the
    bridge already rate-limits — firing them in parallel would queue behind that cap while
    holding 25 file buffers. Worst first, with the cheapest viable route per part so the table
    is actionable rather than a ranking of badness. A part that could not be read keeps its
    row with the reason.

63. **Tolerances are read, not guessed — and their absence is the important answer (2026).**
    *Why:* tolerance stack-up was UNWRITTEN because the measurement did not exist. Everything
    else this tool measures comes from the SHAPE; tolerances are annotations beside it, and
    only AP242 with semantic PMI carries them at all. *Changes it:* `cad-engine/pmi_extract.py`
    reads dimensions, geometric tolerances and datums through `STEPCAFControl_Reader` with GDT
    mode — OCCT's own PMI path, not a hand-rolled parse of the STEP text — and 15 new
    tolerance-capability rules, one per process family, compare the tightest callout against
    the band that process holds without a secondary operation. A ±0.05 bore on a sand casting
    is a machining operation, a fixture and a second cost centre, and it is the commonest way
    a drawing quietly doubles a price. **`present: false` always travels with a reason and
    every tolerance rule ABSTAINS**: most STEP files carry no PMI, the tolerances are on a
    drawing this tool has never seen, and "no tolerance problems found" would be the single
    most dangerous sentence the report could print. Two things had to be right for the gate
    fixture to round-trip and both were wrong first: the STEP controller must be initialised
    before `write.step.schema` is settable (it silently stayed AP214 and dropped every PMI
    entity), and a dimension must relate TWO shape aspects or OCCT's reader discards it. The
    geometric-tolerance names are read from OCCT's own enum — a hand-typed map returned
    "symmetry" for a flatness callout.

64. **The material decides the threshold on a quarter of the catalogue (2026).**
    *Why:* the resolution machinery shipped with only 5 rules using it, so "not generic" was
    true of 7% of the rules. *Changes it:* 24 of 111 rules now carry material bands, 69
    distinct material-specific thresholds. Some invert the intuition and that is the point:
    the minimum machined web in STEEL (0.8 mm) is thinner than in aluminium (1.0 mm), because
    steel is three times stiffer and deflects less under the same cutting force. Drill depth
    runs 6×D in aluminium and 3×D in titanium; sand-cast minimum wall runs 4 mm in aluminium
    and 6 mm in steel; acetal takes a 50% rib where ABS takes 60%, because it shrinks twice as
    much and sinks. A generic band and a band tuned to the alloy are still stamped differently
    on every finding.

65. **The base part is always necessary (2026).**
    *Why:* found by building a ten-solid assembly, which is what item 3 was for. Boothroyd's
    three questions are asked of a part RELATIVE TO THOSE ALREADY ASSEMBLED, and the first
    part has nothing to be assembled to — assembly has to start somewhere. The engine counted
    only YES answers behind a `Math.max(1, necessaryCount)` floor, which is correct only while
    no OTHER part is necessary. On a bracket with the housing marked a different material and
    the base answered no to all three, the theoretical minimum came back 1 instead of 2 and
    the design efficiency it drives was reported at 9.2% instead of 18.3% — half its true
    value, on the one number a DFA review is remembered by. The three-solid fixture could not
    show it, because there the single necessary part WAS the base. *Changes it:* the base is
    counted whether or not its own answers say so, and the gate asserts all three cases.
    **Still true and still worth saying: every customer file supplied so far is a single
    solid, so the DFA path has never met a real multi-part STEP. The ten-solid fixture is the
    closest available substitute, not a replacement for one.**

66. **The API knowing something is not the report saying it (2026).**
    *Why:* an audit of what actually reaches `dfm-report.ts` found six things shipped to the
    API and never printed: the route comparison, per-instance offenders, the PMI block, tool
    reach, the company standards in force, and the material/process and no-rules banners. The
    routing table — the headline of two waves — existed on screen and not in the document a
    director is handed. Worst of the six was PMI: a file with no tolerances showed its
    tolerance rules under NOT EVALUATED with the generic *"no measurement available for
    tightestToleranceMm"*, while the sentence a reader actually needs — *"your file carries no
    semantic PMI; the tolerances are on a drawing this tool has never seen"* — sat in the
    engine and was never printed. *Changes it:* all six render, and the QA fixture grew two
    payloads to exercise them — one carrying every block, one carrying the states that must
    never look like a clean sheet (an impossible material/process pair, a process that shapes
    nothing, and absent PMI). A `customer-standard` source grade was added at the same time:
    it existed in the engine but had no label in the report, so a plant's own threshold would
    have printed under the handbook citation it replaced.

67. **A stale gap declaration is worse than no gap declaration (2026).**
    *Why:* `UNWRITTEN_RULES` went on saying tolerance stack-up "needs GD&T and datum callouts,
    which live in the drawing — not in the solid geometry a STEP file carries" for a week
    after the AP242 reader shipped. A reader trusting that list would conclude the tool cannot
    see something it now measures. *Changes it:* the entry is narrowed to what is genuinely
    missing — accumulating variation along a dimensional CHAIN, which is a different problem
    from reading individual callouts — with the working half named as its proxy. A new entry
    declares the datum path IMPLEMENTED AND UNVERIFIED: the reader extracts datum labels, but
    none survived the round-trip fixture, so a non-zero datum count from a vendor export is
    unproven. A test now asserts no declared gap claims the tool cannot see what it measures.

68. **Material bands: 22% to 38% of the catalogue (2026).**
    *Why:* the claim "not generic" was true of 5 rules, then 24. *Changes it:* 42 of 111 rules
    now vary by material, over 98 distinct thresholds, and a test pins the floor at 40 so it
    cannot quietly regress — plus a shape check, because a band that is a number where the
    rule wants `[min, max]` would silently make that rule unevaluatable for everyone who
    selects that material. Grey iron is the one that best shows why this matters: it EXPANDS
    as graphite forms during freezing, so it strips from rammed sand more readily than steel
    or aluminium and holds a tighter as-cast tolerance than either — the opposite of what a
    single "casting" threshold would say about it.

69. **The viewer looked faceted for a shading reason, not a mesh reason (2026).**
    *Why:* a user compared the 3D viewer against CATIA and SolidWorks and called it basic and
    not HD. The instinct is to blame mesh density, and density WAS part of it — but the larger
    cause was that an STL carries no shared vertices, so `computeVertexNormals()` produces one
    normal per FACET. A cylinder tessellated into a thousand segments still renders as a
    thousand flat strips, because each strip is lit as though it were flat. Welding every
    vertex in the mesh is worse: it rounds off chamfers and the part turns to soap.
    *Changes it:* normals are welded WITHIN a B-rep face and never across one. Every triangle
    already carries the id of the face it came from, and a face boundary IS an edge — that is
    what it means for two faces to meet — so this reproduces exactly the hard/soft split the
    modeller drew, with no angle threshold to tune and no smoothing group to guess. Normals
    accumulate as un-normalised cross products, which weights each by twice the triangle's
    area for free, so a sliver cannot pull a vertex normal as hard as the large triangle
    beside it.

70. **Angular deflection is what "HD" means, and it was 28.6 degrees (2026).**
    *Why:* the viewer meshed at 0.5 RADIANS of angular deflection — about thirteen segments
    around a full circle, so a Ø13 bore rendered as a visible polygon. Nothing in the gate
    could see it: every DFM measurement runs on a separate, coarser tessellation and none of
    them cares how the part looks. *Changes it:* 0.15 rad (8.6 degrees, ~42 segments) and
    linear deflection diag/1200. Measured on a real 218 mm casting, all settings meshing in
    well under a second: diag/300 + 0.50 rad gave 6,929 triangles; diag/1200 + 0.20 gave
    28,361; diag/2000 + 0.12 gave 72,977. Meshing time did not move, so the old numbers were
    buying nothing. The gate now counts segments around a bore in the VIEWER's own
    tessellation and fails below 32.

71. **A metal with nothing to reflect renders as dead grey (2026).**
    *Why:* the material was `MeshStandardMaterial` at metalness 0.45 with no `scene.environment`.
    That is a physical metal in a void — it resolves to a uniform flat grey no matter how many
    lamps are added, which is most of why the shading read as cheap plastic. *Changes it:*
    `RoomEnvironment` through `PMREMGenerator` for image-based lighting, which ships inside
    three itself so it costs no download and no asset pipeline, plus ACES tone mapping because
    the lights run above 1.0 and were clipping highlights to flat white. The directional lamps
    were dimmed to 0.9/0.25 — left at full strength on top of an environment they blow out
    every highlight and flatten the form again.

72. **Depth precision, backface culling and damping — the "not smooth" three (2026).**
    *Why:* near/far was radius/1000 to radius*100, a ratio of 100,000:1, which spends most of a
    24-bit depth buffer on empty space hundreds of part-lengths behind the model. Surfaces a
    fraction of a millimetre apart then quantise to the same depth and flicker against each
    other as the camera moves — and the edge overlay draws at exactly the surface depth, so it
    shimmered on every orbit. *Changes it:* 4,000:1, plus polygon offset on the mesh so edges
    win cleanly. Backfaces are culled unless a section plane is cutting (a clipped solid is an
    open shell and needs them; a sealed one does not, and DoubleSide was doubling fragment work
    for a surface nobody can see). Damping went 0.12 to 0.06 — the old value killed the glide
    almost immediately, which is what made orbiting feel steppy — with rotate speed at 0.6 so a
    full drag is about half a turn rather than a full one.

73. **"How is this part made?" is a step, not a setting (2026).**
    *Why:* the material and manufacturing-process selectors were built, cascading and wired
    into the thresholds — and still easy to miss entirely. They sat as two cells of a
    five-column row below a visually dominant dashed dropzone, in `text-xs text-slate-400`
    on a near-identical dark card, both defaulting to "Not set" with labels too long for a
    200 px select so they truncated mid-sentence. `Analyse` was enabled on the file alone.
    The shortest path through the page was therefore upload → Analyse → a speculative sweep
    across all fifteen rule families, with findings for processes the part will never see and
    no moment where anyone was asked. *Changes it:* the card is two numbered steps. Step 2
    appears once there is a part to apply it to, gives Material and Manufacturing process a
    two-column row at `text-sm`, and borders them amber while unset. The process select is
    DISABLED until a material is chosen, because the list it would show is meaningless
    without one. Region, annual volume and draw direction drop to a quieter "Costing &
    advanced" row — they scale figures or override a measured default; they do not decide
    which rules run.
    **The generic path stays reachable and labelled.** `Analyse` waits for both answers, but
    an underlined "Or run it generically — every rule family, speculatively" sets an explicit
    flag, and taking it raises its own warning. Blocking with no way past would have been the
    worse failure: a quick generic look is legitimate, it just should not be what happens
    when someone presses the obvious button without reading. Naming either selector afterwards
    releases the flag, so an opt-out cannot persist into an analysis the user has since told
    us how to make specific.
    Two things were only visible in a real render and neither would have shown in a unit
    test: `disabled:opacity-50` left a bright gold primary still reading as clickable, so a
    disabled Analyse now loses its fill entirely; and the whole flow was verified by driving
    a real browser against a real server — Step 2 hidden before upload, process list
    narrowing from 20 aluminium routes to 3 for ABS, the chosen process clearing when the
    material can no longer take it, and the opt-out releasing on the next selection.

74. **A picker that cannot name the alloy forces the wrong one (2026).**
    *Why:* the material list named roughly one grade per family, and for three families it
    was the wrong grade for the process that family is actually used by. **A356 is a gravity
    and sand-casting alloy**, and the tool offered it for high-pressure die casting where the
    production alloy is A380/ADC12. **AZ31 is a wrought magnesium**; die-cast magnesium is
    AZ91D. ZAMAK 5 was listed without ZAMAK 3, the commoner of the two. Body-in-white had no
    dual-phase or press-hardened grade at all, sheet aluminium had no 5052, and the composite
    family had carbon fibre but not glass — which is far more common in automotive. A user
    whose part is A380 had to pick A356, and every material-specific threshold downstream was
    then resolved for the wrong metal. *Changes it:* 23 grades to 50, all mapping to existing
    family tags so no process routing changed. Densities are physical constants; prices are
    indicative €/kg on the same static-library basis as the originals, which the commodity
    bridge overrides where a live index exists.
    Carbon coverage went from 19 of 23 to **49 of 50**. FKM is the single deliberate
    omission: published fluoroelastomer factors vary by more than an order of magnitude, and
    `computeCarbon` already returns null with a reason rather than borrowing a neighbour's
    number. Every added iron, steel and aluminium grade is also listed in `MATERIAL_FAMILY`,
    because CBAM scope follows the family and an unlisted import would quietly escape the
    levy estimate.
    **The grades move numbers, not just labels.** 42 rules now carry 131 distinct
    material-specific thresholds, up from 98. Bend radius alone now reads 5052 at 1 r/t,
    mild steel 1, DP600 2.5, 6061-T6 3, DP980 4, and 22MnB5 at 6 — the last because a
    press-hardened part is formed hot and quenched in the die at ~1500 MPa and is not cold
    formed at all, so a cold bend in the CAD is a design error rather than a tight radius. A
    test asserts that ladder rises and that each grade carries its own source rather than
    borrowing the rule's.

75. **A stale hardcoded copy of a list is worse than no copy (2026).**
    *Why:* `src/constants/costing.ts` held `FALLBACK_MATERIALS`, a hand-typed mirror of the
    engine's table, under a comment warning it would drift. It had already drifted four
    materials behind — Copper, Electrical Steel, EPDM and Glass were unreachable from any
    page that fell back to it — and this change would have taken it to twenty-seven behind.
    *Changes it:* the constant is now empty by design. A short stale list looks authoritative
    and silently hides materials the engine costs perfectly well; an empty one makes the
    missing fetch visible instead.

76. **A hole is an inner wire, not a cylinder (2026).**
    *Why:* a manufacturing head reviewed two reports and the stamped Seat Locking Bracket
    came back with **zero holes**. It has twenty-six. The hole table comes from the cylinder
    pass, which requires a full revolution — the test that correctly stopped curved walls
    being reported as bores — and every opening on that bracket is a slot, obround or shaped
    cut-out trimmed through a freeform surface, so not one of its walls is a cylinder. Five
    of nine sheet-metal rules abstained as a result: hole-to-edge, hole-to-hole, hole-to-bend
    and minimum hole size all key off the hole table, and they were silent on exactly the
    part that needed them. *Changes it:* the topology already knows. A face with an INNER
    WIRE has a hole in it — that is what an inner wire means — whatever surface the wall is
    made of. `apertures()` reads them and reports perimeter, equivalent diameter, centroid
    and total internal cut length, which also closes half of the declared press-tonnage gap.
    **Only PAIRED wires count**, and the gate is what forced that: an unpaired wire is the
    ring where a boss rises out of a face or the mouth of a blind pocket, and counting either
    turned a plate with one Ø6 hole into two apertures with 69 mm of cut length that included
    the Ø16 boss base. A through opening leaves a wire where it enters and where it exits;
    nothing else does. Apertures feed the spacing rules, so the bracket went from 3 of 8
    rules evaluated and one finding to **8 of 9 and three findings** — including a cut-out
    sitting 7.79 mm inside the bend allowance, which is a real scrap risk that was invisible.

77. **`measuredAreaPct` was understated by exactly the sampling stride (2026).**
    *Why:* `classify_draft` weights each sampled triangle by the `step` it was chosen from;
    `wall_thickness` did not. Its coverage figure therefore read 1/step of the truth — a
    part where nearly every ray succeeded reported "6.3% of the surface measured" and looked
    untrustworthy for a reason that was pure arithmetic. The percentiles themselves are
    unaffected, because a constant factor cancels in a weighted quantile; the number a reader
    JUDGES them by was wrong. *Changes it:* stride-weighted and capped at 100%. The bracket
    now reads 100%, the cross member 89%, and the part where the figure genuinely is thin
    reads 51%.

78. **The wall figure now carries an independent cross-check (2026).**
    *Why:* Part1's report printed "WALL p5/p50/p95 7.08 / 27.06 / 34.31 mm" as bare fact. The
    2V/A reference for that part is 10.35 mm — a factor of three — and nothing said so. 2V/A
    is exact for a thin uniform shell and only indicative for a chunky one, so a disagreement
    is not proof the ray cast is wrong; it IS proof the reader should be told before quoting
    the number that drives the wall, uniformity and rib rules. *Changes it:* the reference and
    the coverage are printed under the percentiles, and a disagreement of more than 2× or
    coverage below 15% raises a caution naming which. The bracket and cross member, where the
    ray cast is right, pass clean.

79. **A provenance sentence that is itself out of date (2026).**
    *Why:* every report's cover said "24 of the 26 rules rest on industry consensus" — a
    string literal, still there long after the catalogue reached 111. A claim about how much
    to trust the numbers, which was itself untrue. *Changes it:* counted server-side beside
    the catalogue that produced the findings and sent with the analysis, so it cannot drift
    again. It now reads 109 of 111. Counting in the browser would have meant bundling the
    whole catalogue for one sentence.

80. **The viewer read as white because of the lighting I added (2026).**
    *Why:* the base colour was `0xaeb6c2` — a light BLUE-grey, blue channel well above red —
    and once the studio environment and ACES tone mapping went in at exposure 1.05 it lifted
    to something closer to white than to metal. *Changes it:* a neutral `0x8f9499` at the
    value CAD viewers actually use, metalness pulled back from 0.45 to 0.25 so the
    environment reads as a soft sheen rather than a mirror, and exposure trimmed to 0.92.

81. **The chosen process leads the report; the alternatives follow it (2026).**
    *Why:* a manufacturing head read two reports and concluded the tool was ignoring the
    material and process they had selected — "it's giving all the different manufacturing
    process details". The ENGINE was never generic: `routes/dfm.mjs` runs one family when a
    process is chosen, and both reports carried exactly one findings section. The REPORT said
    otherwise. Route comparison — nine processes on a full page — was printed BEFORE the
    chosen process's findings, and no row in it was marked as the reader's own, so the page
    read as a survey of every process rather than as alternatives to one. Ordering was making
    a claim the engine never made. *Changes it:* the per-process findings now come first in
    both the PDF and the Studio page; the table is retitled "Alternative routes — your route
    is X, against the other N"; the chosen row is marked in place (never lifted to the top —
    where it sits in a cheapest-first list IS the answer); every other row carries its
    piece-price and tooling delta against it; and a closing sentence names the cheapest
    alternative with what the switch costs, or says plainly that nothing prices below the
    chosen route. The cover gains one line naming the route, the ruleset it ran and where the
    alternatives are.

82. **"process-generic" was one sentence covering two different claims (2026).**
    *Why:* the bracket report's cover read STEEL (MILD) · STAMPING / DEEP DRAWING, and the
    finding beneath it read "THRESHOLD: process-generic — no material was given". The alloy
    HAD been given and used; this rule simply carries no alloy-specific band. Telling a reader
    their input was missing when it was not is how a correct analysis loses their trust — and
    it is the sentence that most directly fed the complaint above. *Changes it:* the material
    in play travels on the finding as `thresholdMaterial` whether or not the rule had a band
    for it, so the report can distinguish "you gave no alloy" from "this rule is
    alloy-independent". Both remain amber; only one of them is the reader's fault.

83. **The casting tranche: six processes, five rule families, and a rule type the
    catalogue could not previously express (2026).**
    *Why:* the picker offered 17 shaping processes and four casting families, so low-pressure
    die casting — the route a wheel rim and most structural housings actually take — was
    reachable only by mis-selecting gravity die, which prices a different metal yield (0.65
    against 0.85) and judges a different wall (3.0 mm against 2.0). Squeeze, semi-solid, shell
    mould and centrifugal had the same problem. *Changes it:* six processes added to the cost
    model, the carbon table and the DFM registry, five of them with their own rule family.
    112 rules → 148, 15 families → 20.
    *The judgement that shaped it:* a process gets its own family only when its GEOMETRIC
    limits differ. Vacuum-assisted die casting is routed to the existing `hpdc` family and
    says so — evacuating the cavity changes the gas in it, not the shape the die can make, and
    a near-copy family would have invented six thresholds to restate the same limits.

84. **Every casting family checked core SLENDERNESS and none checked core DIAMETER (2026).**
    *Why:* `*-core-ld` asks how DEEP a core pin may go for its diameter. Nothing asked how thin
    it may be at all. They are different failure modes — slenderness fails by deflection, and
    the hole walks off position; diameter fails by existence, and the hole is not cast, it is
    drilled afterwards at a cost nobody quoted. A Ø3 hole in a permanent-mould part passes
    every slenderness check ever written and is still not a cast hole. *Changes it:*
    `minHoleDiaMm` measured from the feature table the kernel already produced, and a floor per
    family because they are not the same number: HPDC 2.5 mm, zinc 1.5, permanent mould
    (gravity and low-pressure) 6.0, investment 1.5.
    *Sand is deliberately absent.* The research found a sand CORE cross-section floor and an
    unsupported L/D band, and no sand cored-HOLE minimum from any source. Interpolating one
    from the permanent-mould 6 mm would have looked identical on the page to the four that are
    sourced, so it is declared in `UNWRITTEN_RULES` instead.

85. **Blind and through core slenderness were sharing one measurement (2026).**
    *Why:* `maxHoleDepthToDia` is the worst ratio on the part regardless of whether the hole is
    blind or through, and a through core is supported at BOTH ends where a blind one is a
    cantilever. Investment casting writes the two limits separately — blind under 2, through
    under 5 — and a single figure cannot express either. On the new analytic fixture the
    combined figure is 10.00 and the real blind hole is at 1.60: a factor of six, on one part.
    *Changes it:* `maxBlindHoleDepthToDia` and `maxThroughHoleDepthToDia`, split on the
    through/blind flag the solid classifier already produced. A part with no blind hole makes
    the blind rule ABSTAIN — a hard zero would have passed every "at most" limit silently.

86. **A feasibility gate is not a low score (2026).**
    *Why:* centrifugal casting appeared in the route table for a real casting bracket at
    EUR 7.77 with a score of 63 — below the route the engineer had chosen — while the geometry
    said the part is 29% axisymmetric and a spinning mould cannot make it at all. Every other
    rule in this catalogue says "this will cost you"; that one says "this route does not
    exist for this part", and the scoring arithmetic cannot tell the difference.
    *Changes it:* a `blocking` flag on the rule, `blockers`/`blockedReason` on the result, and
    `viable: false` on the route row. The report and the Studio print NOT VIABLE with the
    reason instead of a score, and a blocked route is excluded from the cheapest-alternative
    sentence whatever the cost engine says it would have cost. Exactly one rule carries the
    flag, and it should stay rare — an undercut buys a slide, but a part that is not round
    buys nothing.

87. **Axisymmetry had to be measured before centrifugal casting could be offered (2026).**
    *Why:* adding the family without it would have produced a page of NOT EVALUATED and a rule
    count that flattered the tool. *Changes it:* `_axisymmetry()` in the geometry engine scores,
    for each candidate axis, the area share of faces compatible with revolution about it —
    revolved faces sharing the axis, spheres centred on it, planes perpendicular to it. Flats
    and lugs count AGAINST, because they are what stops a part being spun. The new
    `bushing-tube` fixture is analytically 100% and the engine returns 100.00: the first
    fixture in the set on which this rule can be observed PASSING, and a rule never seen
    passing is not a tested rule.

    *Research note, and it limits every threshold above:* this environment's network policy
    blocks direct document fetch, so the sources behind these rules were read as search
    summaries, not as primary documents. Nothing here is graded on a first-hand reading of
    NADCA or ISO 8062. Where a design guide NAMES a standard the rule says so and says the
    standard was not read; where several independent guides agree the rule says industry
    consensus; where a value was positioned between two neighbours in this catalogue rather
    than quoted, the source string says DERIVED and names it as the first threshold a foundry
    review should correct.

88. **The sheet & bulk tranche: `sheet-metal` was three processes wearing one set of
    numbers (2026).**
    *Why:* blanking, bending and drawing shared nine thresholds. They are not the same
    process. Fine blanking pierces a hole at 0.65 t where conventional blanking needs 1.0 —
    the capability the triple-action press is bought for, and the catalogue was flagging
    perfectly sound fine-blanked parts against the conventional figure while passing
    tolerances fine blanking could never hold. Press-hardened 22MnB5 wants 6 r/t where mild
    steel wants 1. And a drawn cup fails on depth-to-diameter, which no sheet rule asked about
    at all. *Changes it:* six new families — fine blanking, hot stamping, deep drawing, metal
    spinning, cold heading, open-die forging — plus seven cost processes. Rules 148 → 174,
    families 20 → 26, cost processes 33 → 40. Mild steel now offers 18 shaping routes.
    *Measured on the real seat bracket:* the same geometry scores 51 under conventional
    stamping and 88 under fine blanking, and its 1.187 r/t bend passes in mild steel and fails
    at 6 r/t in press-hardened 22MnB5. That difference is the whole product.

89. **Hot stamping reuses the sheet family's own 22MnB5 numbers rather than restating
    them (2026).**
    *Why:* `sheet-metal` already carried `byMaterial` entries for 22MnB5 on bend radius (6
    r/t), hole diameter (2.5 d/t) and tolerance (0.3 mm). Writing independent numbers in the
    new family would have created two places that could disagree about one alloy. *Changes
    it:* those three figures are the `hot-stamping` family's BASE thresholds, and each source
    string says where it came from. Note the tolerance is TIGHTER than cold stamping's 0.4 mm,
    not looser — quenching in the closed die removes the springback that drives cold-stamped
    variation.

90. **A cross-family check, because per-family checks cannot catch a copied family (2026).**
    *Why:* every gate check to this point tested one family in isolation. A family duplicated
    from its neighbour and renamed would pass all of them — and with six new families landing
    at once that is the most likely way this tranche goes wrong. *Changes it:* the gate now
    runs ONE geometry (`folded-bracket`, r/t = 1.5 by construction) through three families and
    asserts three different verdicts, then asserts the three thresholds behind them are
    genuinely different numbers. A copied family fails both halves.

91. **Tube bending is the one shaping process priced but not judged (2026).**
    *Why:* its two real rules — bend radius against tube OD, and wall thinning round the bend —
    both need the part recognised AS a tube: a circular section swept along a centreline. The
    engine has no swept-section recogniser, and a bent tube is neither a body of revolution nor
    folded sheet. *Changes it:* the process is in the cost model and the carbon table with
    `dfmFamily: null` and a reason the picker prints. Inventing a family whose every rule
    reported NOT EVALUATED would have added six to the catalogue count and judged nothing.

92. **The blocking concept found its second user, which is when it stopped being a
    special case (2026).**
    *Why:* `cent-body-of-revolution` was the only blocking rule and could fairly have been
    called a one-off. Metal spinning asks exactly the same question for exactly the same
    reason — a rotating mandrel and a following roller generate only surfaces of revolution —
    and reuses both the measure and the 90% threshold. Two independent families now depend on
    it, and the gate checks the same rule PASSING on `bushing-tube` and BLOCKING on
    `plate-two-holes`.

93. **Six rules had source strings that said nothing (2026).**
    *Why:* a completeness test written for the new families ("every rule carries a real source,
    a rationale and a fix") failed on six PRE-EXISTING rules whose provenance read
    "Die-casting design guidance." or "Process section-uniformity guidance." — true, and
    useless to a reader deciding how much to trust the number. *Changes it:* all six rewritten
    to say where the figure came from and, where it was positioned relative to a neighbour in
    this catalogue rather than quoted, to say DERIVED. No threshold moved; only the provenance
    text. The assertion now guards the whole catalogue.

94. **Two machining rules had never produced a finding on any part (2026).**
    *Why:* `mach-internal-corner-radius` and `mach-pocket-depth-ratio` were written against
    measurements nothing computed. On the filleted-pocket fixture the ENTIRE machining family
    evaluated 0 of 7 rules and scored `null`. The recogniser had both numbers and was throwing
    them away: a fillet's radius came off the kernel in `build_aag` and was never stored, and a
    prismatic pocket published an area and a centroid but no extents — so a pocket could be
    named and located and never judged. *Changes it:* the AAG carries `radiusMm` and the real
    per-axis face box; fillets carry radius AND concavity; pockets carry extents and a depth
    axis. The same fixture now evaluates 5 of 7 and scores 75.
    *Concave only.* An external edge round is not a tool-access constraint, and a part whose
    only blend is a 0.5 mm edge break must not read as needing a 1 mm cutter.

95. **The pocket depth axis is read from the floor, not guessed (2026).**
    *Why:* the first version took the middle of three sorted box spans as the depth and the
    smallest as the width, which gets a wide shallow pocket exactly backwards. *Changes it:*
    the floor is the largest planar face in the component and the cutter comes in along its
    normal, so the depth is the span on that axis. A feature whose depth axis cannot be
    established is SKIPPED rather than measured against an axis chosen at random. Checked
    against the fixture arithmetic: `filleted-slot` cuts 12 mm deep, the recogniser sees the
    wall starting one R2 fillet above the floor, so 10 mm over a 15 mm opening = 0.67.

96. **The machining split: one family judged four processes (2026).**
    *Why:* `machining` covered a turned shaft, a wire-cut die plate, a gun-drilled manifold and
    a broached spline with seven thresholds. The internal corner alone spans two orders of
    magnitude across them — 3 mm for an end mill, 0.4 for a turning insert nose, 0.15 for a
    wire — and the hole depth limit spans twenty times: 5:1 generic against 100:1 gun-drilled.
    A fuel rail was failing the rule the deep-hole process exists to beat. *Changes it:* four
    new families — turning, wire EDM, deep-hole/gun drilling, broaching — with `machining` kept
    as the generic mill/turn route for a part that is genuinely both. Rules 174 → 191,
    families 26 → 30, cost processes 40 → 44.
    *New measures:* `blindHoleCount` (a COUNT, because wire EDM and broaching cannot make a
    blind feature AT ALL and "the worst blind hole is 0.75 L/D" cannot say "there is one"),
    `maxHoleDiaMm` (broaching runs 10-100 mm and a gun drill 1-30; a rule that can only warn
    about small features cannot route a large one) and `slendernessLtoD`.

97. **The benchmark caught a shaft that was a flat plate (2026).**
    *Why:* `slendernessLtoD` gated on 60% axisymmetric. A 60x40x10 plate scores 69.7% — its
    two large faces are perpendicular to Z and count toward the figure — so the measure took
    the 10 mm thickness over the 60 mm width and reported a 0.17 L/D shaft. Review did not
    catch it; the gate did, on the first run after the fixture was written. *Changes it:* the
    bar is the SAME 90% the catalogue's two body-of-revolution rules use. Three uses of one
    geometric judgement must share one threshold, and an invented fourth constant is how they
    drift apart.

98. **Sinker EDM is declared, not shipped (2026).**
    *Why:* it is the exact inverse of wire EDM — the process that CAN make a blind pocket with
    a sharp corner — and the research found neither of the two numbers that would distinguish
    it: the smallest corner a shaped electrode can burn, and the deepest rib an electrode can
    carry without arcing. A family that copied the wire-EDM thresholds would be worse than
    none. *Changes it:* declared in `UNWRITTEN_RULES`, and the gap is covered in practice —
    a blind sharp-cornered pocket now surfaces as a wire-EDM finding whose FIX names sinker EDM.

99. **The first DFM measure in this engine that is not about a tool (2026).**
    *Why:* every rule up to now asked "can a tool reach this / can a die release this". Powder-bed
    fusion has no draw and no ejection. Its governing constraint is gravity: a downward-facing
    surface is built onto loose powder, which conducts no heat, so below roughly 45° from the
    build plate the melt pool sinks in and the region needs a support that has to be built, cut
    off and dressed. Nothing in the engine could measure that. *Changes it:* `overhang()` in
    `dfm_geometry.py`, area-weighted over the tessellation, reporting the surface's own angle
    from the plate — a flat downward face reads 0 and a vertical wall 90.
    *Built as a CURVE, like the draft curve, on purpose.* 45° is a rule of thumb, not a
    constant: some alloys and parameter sets self-support lower, and lattice struts want better
    than 25°. Each rule names its angle in `overhangCutoffDeg`, so a family can never be
    silently judged at an angle its source never quoted.
    *And it says what it cannot see:* the build direction is +Z as modelled. Re-orienting on
    the plate is the first thing an AM engineer does, and best-orientation search is declared
    in `UNWRITTEN_RULES` rather than implied.

100. **A fixture at a KNOWN angle, or the rule could be any constant (2026).**
    *Why:* with no fixture whose overhang angle is known by construction, `lpbf-overhang-45`
    could have been hardcoded to any number and every other check in the gate would still pass.
    *Changes it:* `overhang-wedge.step` — a prism whose one sloped face stands at exactly 30.000°
    from the plate and is the ONLY down-facing surface on the part, so the percentage is
    arithmetic rather than a sample: 4800 / 14128.2 = 33.97%. The engine returns 33.97% and
    30.0°, and the curve straddles correctly — zero below the 20° and 30° cutoffs, the full
    33.97 below 40° and above.
    *The first draft of the fixture was upside down.* The material sat below the slope, making
    it an upskin, and the engine correctly reported the part as having no overhang but its flat
    base. The fixture was wrong, not the engine — which is the outcome the discipline is for.

101. **Plastics and powder: five processes, five families (2026).**
    *Why:* the catalogue had one plastics family (injection moulding) and no powder route at
    all, so a thermoformed panel, a rotomoulded tank, a sintered gear and a MIM latch were all
    unquotable and unjudgeable. *Changes it:* thermoforming, rotational moulding, powder
    metallurgy, MIM and LPBF. Rules 191 → 212, families 30 → 35, cost processes 44 → 49.
    Three of these carry a limit no other family in the catalogue has:
      * **rotational moulding** has a wall WINDOW, not a floor — 3 mm minimum because the powder
        may not bridge at all, 10 mm maximum because the inside never fuses;
      * **MIM** has a maximum wall (12.5 mm) because the binder has to travel out through the
        part;
      * **powder metallurgy** is judged on `setupCount ≤ 1` — compaction and ejection both run
        on one axis, so a cross hole is not a cost warning, it is secondary machining nobody
        quoted.
    *Thermoforming and deep drawing share `drawDepthToWidth`* — one geometric question, two
    processes, thresholds deliberately not copied from each other.

102. **Three more gaps declared rather than filled (2026).**
    *Why:* percentage-of-dimension tolerance (MIM at ±0.3%, and ISO 8062 CT grades) cannot be
    expressed by an engine that reads one tightest band in millimetres — a band that is generous
    on a 40 mm feature is impossible on a 4 mm one, and every `*-tolerance-capability` rule in
    this catalogue is a flat screening value because of it. Best build orientation needs a
    direction sweep. Blow moulding turned up no sourced blow-ratio or pinch-off numbers, and it
    competes head-on with rotational moulding — a family built from rotomoulding's figures with
    a different name would make exactly the comparison the route table exists to support
    meaningless. All three are in `UNWRITTEN_RULES`, which now runs to 15 entries.
