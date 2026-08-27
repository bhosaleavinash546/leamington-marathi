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

103. **Innovation Studio motion language: divergence → convergence (2026).**
    *Why:* the page was a flat grid of eleven identical cards, a three-field form and a list.
    Nothing on it said what the tool DOES, and every method looked like every other method.
    *Changes it:* `innovation.css`, an `iv-`-prefixed language on the same model as
    `foresight.css`, themed on the shape every structured method actually has — one problem
    opens into many lenses, then collapses to the few that survive engine checking. So the
    ambience drifts OUTWARD from the input (rising motes, three aurora glows), the method
    preview literally DRAWS that fan in SVG, and the results settle INWARD with a
    crystallising wipe. Every animation carries that meaning; none is there to fill space.
    *And every one of them sits behind `prefers-reduced-motion: no-preference`.* Verified in a
    real browser at `reducedMotion: 'reduce'`: the page is complete and static, not degraded —
    the gradient title, the tier spines, the aperture ring and the divergence diagram are all
    present, they simply do not move.

104. **The picker collapses after you choose (2026).**
    *Why:* grouping eleven methods into three tier bands was right for the first choice and
    wrong for every run after it — the browser shot showed the part-name field two screens
    below the fold. *Changes it:* the grid collapses to a one-line chosen-method bar on
    select, with an "All 11 methods" expander. The first screen now carries the choice, what
    the method needs, what it returns, and the input. Caught by looking at a real screenshot,
    not by reading the JSX.

105. **A number in the product's own shop window that nobody updated (2026).**
    *Why:* the hero read "Eight structured methods" while `METHODS` held eleven. Methods were
    added and the sentence describing them was not. *Changes it:* `METHODS.length`. The same
    class of bug as the "24 of the 26 rules" provenance line in the DFM report (DECISIONS 79),
    and the same fix — count it, never type it.

106. **What a method needs, before you spend a call finding out (2026).**
    *Why:* choosing a method told you its one-line blurb and nothing else. Whether Spec
    Challenge wanted a characteristic register, or what Teardown Delta would give back, was
    discoverable only by running it. *Changes it:* every method carries `needs`, `returns` and
    its `lenses`, rendered as a preview panel that changes with the selection. The lens list is
    also what the divergence diagram fans into, so a 7-verb checklist and a 4-function matrix
    visibly differ in the size of their search.

107. **An indeterminate rail, not a fake percentage (2026).**
    *Why:* `/api/innovate/resolve` emits no progress events. A bar creeping to 90% and stopping
    is a lie with a progress indicator drawn on it. *Changes it:* the generating state names
    the four stages the request actually passes through and animates a photon along an
    indeterminate rail, with the line "no progress figure — the endpoint reports none" printed
    beside it. If the endpoint ever streams stages, the same component renders them.

108. **The value bars were a chart the first time and a mess at full width (2026).**
    *Why:* letting the cost/worth bars fill the panel put a 46% bar 400px long with its own
    label sitting on top of it, and the two stacked bars read as one broken line. *Changes it:*
    a fixed 160px track in its own grid column with a legend row, so the bars are a chart
    beside the text rather than a decoration behind it. Found by rendering the page in
    Chromium and looking at it — the layout typechecked perfectly either way.

109. **Innovation Studio, second pass: a workspace rather than a decorated page (2026).**
    *Why:* the first pass gave the page a motion language and left its STRUCTURE untouched —
    a marketing hero over a stack of identical rounded rectangles. Motion on a template is
    still a template. The specific failures, each visible in a browser screenshot:
      * a 64px mark over a 5xl centred title over a three-line paragraph took a third of the
        first screen before an engineer could do anything;
      * three different card recipes were in use for what is one surface;
      * results were a flat list you could only read top to bottom — no sort, no filter, no
        density, and nothing to point at in a meeting;
      * the convergence figures, which ARE the answer to a run, were a run-on line of 11px
        grey text under a heading;
      * scrolling twenty ideas lost the method, the part and the exports entirely;
      * commentary was prose with a bold prefix ("Cost angle:", "Risk:") rather than fields.
    *Changes it:* a compact tool header with the catalogue counted on the right; one panel
    treatment (`iv-panel`) and one label style (`iv-label`) used everywhere; a sticky context
    bar carrying method / part / exports; a five-figure KPI strip in tabular numerals; a
    results toolbar with verdict filter, sort and a density toggle, all acting on the real
    result; and idea ROWS with a stable index, the verdict in its own aligned column, and
    labelled Cost angle / Risk cells.

110. **The idea index is captured before sorting (2026).**
    *Why:* the whole point of numbering ideas is so a reviewer can say "look at idea 3" in a
    meeting. A number that renumbers when the reader sorts by saving is worse than no number
    at all — two people looking at the same result would mean different ideas by "3".
    *Changes it:* the index is assigned from the returned order and travels with the idea
    through every filter and sort.

111. **"Best confirmed" excludes contradicted ideas by construction (2026).**
    *Why:* a contradicted idea's saving figure is the ENGINE DISAGREEING with the AI's claim.
    Feeding it into a "best saving" tile would have the page quoting, as its headline number,
    the one figure it has already told the reader not to believe. *Changes it:* the tile
    reduces over confirmed ideas only, and shows an em dash when none is confirmed rather
    than falling back to the largest number available.

112. **A COVERAGE corpus, because the accuracy gate could not see the biggest hole (2026).**
    *Why:* `benchmark/dfm-run.mjs` proves the kernel returns the right NUMBER on parts whose
    truth is arithmetic, and it was at 100% while the tool was blind on the commonest
    automotive commodity. Those are different questions. A rule that is correct and abstains
    on every real part is worth nothing, and no fixture in the accuracy set can reveal that.
    *Changes it:* `benchmark/commodity-corpus/` — ten automotive commodities at ten variants
    each, parameters swept from the thin end to the thick end of every rule — and
    `benchmark/commodity-sweep.mjs`, which runs the FULL production path over them and reports
    coverage, abstentions by rule, process-inference agreement and per-part runtime.
    It is a MEASUREMENT, not a gate: "how much of the catalogue applies to a gear blank" has
    no pass mark, it has an answer, and the answer is what says where to build next.
    *One process per part.* The kernel SEGFAULTED filleting a fused lever and took sixty
    parts of the corpus with it. A crash inside OCCT cannot be caught by a try block, so the
    only way to make it data rather than a dead run is a process boundary. 96 of 100 built;
    the four that crash are recorded as such.

113. **The first sweep: 0% coverage on stamped brackets (2026).**
    *Why:* the sheet-metal family was gated on BEND recognition — `isSheetMetal` — but only
    four of its nine rules need a bend. Measured over ten brackets: the engine read the wall
    at 1.60 mm and the holes at Ø8, everything the other five need, then abstained on all
    nine and scored `null`. A concept model drawn with sharp corners, or a STEP export that
    dropped the radii, produced a completely blank sheet-metal report — on the single most
    common part a plant makes. *Changes it:* the recogniser returns the thickness-derived
    subset when there is no bend, with the thickness's provenance stated. `isSheetMetal` is
    untouched and still means "a bend was measured".
    *And the gate immediately caught the over-reach.* The first version fired on anything
    with a wall, so a 60x40x10 MACHINED PLATE started being judged by sheet rules. The
    fallback now needs evidence a sheet part has and a plate does not: a wall inside the
    sheet range (≤ 6 mm), UNIFORM, on a part at least ten thicknesses across. Both numbers
    are the ordinary definition of sheet metal, not values tuned to the corpus.

114. **Every tolerance rule in the catalogue had never fired (2026).**
    *Why:* `tightestToleranceMm` is read from AP242 semantic PMI, and almost no STEP carries
    any. Over 93 parts it abstained 93 times — fourteen rules, one per family, that had never
    once spoken. Fourteen rules that cannot ever speak are not a conservative tool, they are a
    hole in it. *Changes it:* the engineer may DECLARE the tightest band; they know the
    number, it is on the drawing in front of them. Real PMI always wins when the file has it,
    and the basis travels with the value onto the finding — a figure read from the model and a
    figure typed by a person are not the same kind of evidence and the report must never
    conflate them.
    *Measured effect across the corpus:* mean coverage 64.1% → 85.1%, with extrusion, deep
    drawing and powder metallurgy reaching 100%.

115. **The internal-corner measure only looked at blends (2026).**
    *Why:* `minInternalCornerRadiusMm` was computed from faces the blend recogniser had
    accepted, and `find_blends` accepts a face only when it is SMALL relative to what it joins
    — a fair test for an edge break and the wrong one for the corner of a deep pocket. Over
    the 93-part sweep it abstained 20 times: the rule a machinist asks first, silent on a
    fifth of the corpus. *Changes it:* every CONCAVE cylindrical face that is not a full
    revolution is an internal corner, blend-classified or not. The AAG now carries each
    cylinder's angular span, and that arc test is what keeps bores out — a drilled hole is a
    concave cylinder too, and without it a Ø8 hole would be reported as a 4 mm corner radius
    no cutter has to reach into. Verified: `plate-two-holes` returns NONE despite two bores.

116. **Extrusion and powder metallurgy could not bite (2026).**
    *Why:* both scored ~100 with almost no findings across twenty parts, because both carried
    only the generic four — wall, uniformity, undercut, tolerance — and none of the questions
    their own engineers ask. A ruleset that never fires on its own archetype is not validating
    anything. *Changes it:* four rules, each with a sourced number and a new measure where one
    was needed.
      * `extr-circumscribing-circle` — the smallest circle the SECTION fits inside decides
        which press can run the job at all; past ~203 mm the profile leaves the general-purpose
        press population and the quote changes shape rather than degrading.
      * `extr-tongue-ratio` — a channel in the profile is a cantilevered TONGUE in the die
        with metal flowing round it at hundreds of bar, and 3:1 is where it starts to deflect.
      * `pm-press-depth-ratio` — powder does not flow; density falls away from the punch, so
        a column deeper than about eight wall thicknesses comes out dense at the top and soft
        at the bottom.
      * `pm-min-hole` — below 1.5 mm the core rod does not survive the stroke.
    *The press-depth measure takes the press axis from the part's own feature access
    direction, not the largest box extent.* Using the box would false-alarm on every flat
    pressed part there is: a 200 x 5 mm plate is pressed through 5 mm of powder, not 200.

117. **Process inference: two bugs, one of them mine and one of them the fixtures' (2026).**
    *Why:* the inference scored 0 of 10 on nine of ten commodities. Two separate causes.
      * A body of revolution was never inferred at all, though the axisymmetry pass had
        already scored it. Adding that — at the same 90% bar the centrifugal and spinning
        rules use — took turned shafts from 0 of 10 to **10 of 10**.
      * The "tooled" branch required a wall thicker than 6 mm, so a 2.5 mm die casting —
        which is what most die castings are — could never be inferred. The wall was doing a
        job the sheet-metal branch above already does. It now only chooses WHICH tooled
        family, which is the question it can answer: draft says the part leaves a tool, and
        the material says which tool.
    *And the fixtures were wrong too, which is worth stating rather than tuning around.* The
    corpus's castings were built as square-walled boxes with 0% draft, so the inference
    correctly read them as machined — a uniform wall with prismatic features and no taper is
    exactly what a machined part looks like. They were rebuilt with real draft on every wall
    and the releasing area rose to 31%, but their ribs and bosses are still undrafted and
    push the UNDERCUT share to 28%, above the tooled test's limit. The material-narrowing
    path is implemented and unit-tested; it remains **unproven on this corpus**, and the fix
    is properly drafted rib and boss fixtures, not a looser threshold.

118. **The report told you HOW before it told you WHAT (2026).**
    *Why:* a reader said plainly "I am not understanding the report", and the ordering was the
    answer. Page one carried a coloured tile row, three paragraphs of methodology, a
    provenance essay, a conflict banner, an analysis-limits box and a ten-row geometry table —
    and not one finding. Method belongs behind the answer in an engineering report; a reader
    who wants to audit the numbers will turn to the back, and a reader who wants the answer
    should never have to scroll past the method to reach it. *Changes it:*
      * **Page 1 — Executive summary.** The route in one line, a four-figure verdict strip,
        and a PRIORITISED FINDINGS TABLE — severity chip, finding, measured, guideline,
        priced impact — sorted worst first, with the coverage figure under it.
      * **Page 2 — Analysis basis.** A four-stage workflow drawn with the REAL counts under
        each (read → measure → judge → price), then the measured geometry.
      * **Findings, routes, DFA** as before.
      * **Last page — Appendix.** Everything methodological, condensed from two pages of
        bullets plus three cover paragraphs into seven labelled entries. The two used to say
        the same things twice.

119. **Deleted: the coloured tile row, and tool reach on parts with no cutter (2026).**
    *Why:* the tile row stated the same four figures the new verdict strip states, so a reader
    met them TWICE on one page in two different visual languages — which is how a report
    starts to look like a dashboard someone decorated rather than a result someone computed.
    And the tool-reach section printed on every report, so a sand casting carried half a page
    about what a Ø10 end mill can reach. Noise in a report is not free: it is the reason a
    reader stops trusting the pages that do matter. Tool reach now renders only for the
    families that involve a cutter.
    *Deleting the tile row broke the DFA page*, which had been borrowing its `tw` width — a
    coupling nothing declared, caught by the typechecker.

120. **Three layout faults found by rendering the page, not by reading the code (2026).**
    *Why:* all three typechecked perfectly. The summary table's five columns summed to 166 mm
    of a 182 mm measure and truncated four of them on the very first render — "41.2 % of
    wal...", a figure nobody can use. Dropping the unit entirely to fix it then produced "30"
    and "41.2", which is worse. The header band was 74 mm of navy for five lines of text, a
    quarter of page one. *Changes it:* columns computed from `CW` so they cannot under-fill,
    an abbreviated-unit helper (`% of wall area` → `%`, `core L/D` → `L/D`), and a 56 mm band.
    Every one of these was invisible until the PDF was rasterised and looked at.

121. **The workbook had the same fault as page one, plus a missing sheet (2026).**
    *Why:* the PDF was reordered to answer first, but the Excel export still opened with a
    bounding box and closed with a rule count — a geometry dump with the verdict buried in
    the middle. Worse, the ROUTE COMPARISON existed only in the PDF, where you cannot sort
    it. A table of processes with a price, a tooling cost and a delta against your chosen
    route is exactly the thing a spreadsheet is for, and it was the one sheet a cost
    engineer would reach for first. *Changes it:*
      * **Summary** now opens `— VERDICT —` (route, material, score, coverage, findings,
        high-severity count, priced impact per year) and only then `— MEASURED GEOMETRY —`.
      * **Routes** — a new sheet, autofiltered, status-coloured `YOUR ROUTE` /
        `NOT VIABLE` / `alternative`, carrying price, tooling, buy-to-fly, CO₂e and the
        deltas against the chosen route, with the caveat or non-viability reason in the
        last column so a cheaper row can never be read without its catch.
      * **Routes not applicable** — the processes that were excluded, and why.
      * **Findings** sorted worst-first, and carrying the provenance the PDF gained this
        session: `Threshold basis`, `Measured basis`, `Offending features`.

122. **`scripts/pdf-qa/xlsx-inspect.mjs` — the workbook equivalent of `scan.py` (2026).**
    *Why:* every layout fault in entry 120 was found by rasterising the PDF and looking at
    it; the workbook had no such check, and a sheet can fail silently in a way that
    typechecks and throws nothing — a header row with no body under it, which reads to a
    user as "the tool found nothing" rather than "the exporter was handed the wrong shape".
    That exact fault was live: the QA harness passed `DFM_RESULT` (no route data) so the new
    Routes sheet rendered empty. The inspector prints every sheet with its row count and
    **fails on a header with no body**; the harness now renders `DFM_RESULT_FULL`.

123. **The markers came from the geometry block, not from the rule results (2026).**
    *Why:* the callout list was built by walking `dfm.draft` and `dfm.features` — every
    undercut region, six zero-draft regions, four thinnest walls, EVERY rib and EVERY
    pocket, the last two tagged `info` and labelled "Rib 1". Nothing in it ever read a
    finding. So a casting arrived with dozens of numbered rings, most on features that
    broke no rule, while a rule that actually FAILED often had none, because nothing joined
    a finding to the faces that broke it. The picture annotated what the engine MEASURED
    instead of what it CONCLUDED — the same fault page one had before it was reordered.
    *Changes it:* `src/services/dfm-annotations.mjs`, a pure and unit-tested join.
      * **Failed rules only.** Passes, abstentions and bare observations never mark.
      * **Worst first, then capped.** The CAP declutters, not a severity floor — a floor
        would let the picture silently omit a row the findings table shows.
      * **One ring per finding, on its worst instance**, preferring the finding's own
        `instances[].atXYZ` over the region list: the right kind of feature in the wrong
        place is worse than no marker, because it looks authoritative.
      * **What cannot be marked is NAMED with its reason** — "measured across the whole
        part, so there is no single face to mark". A view with six rings looks complete;
        four more findings with nowhere to point used to leave no trace at all.

124. **A reference view of the part, on page one, at a size you can read (2026).**
    *Why:* a DFM report that never shows the part asks a reader to hold a shape in their
    head while being told what is wrong with it. Every commercial tool in this space puts
    the model on the summary page. The only renders here were three pages of marked-up
    views near the back, reached after a reader has already formed an opinion.
    *Changes it:* a 92 mm ISO render under the verdict strip with the envelope beside it,
    deliberately UNMARKED — what the part IS, before judgement is drawn over it. Sized by
    eye on a rasterised page: at 76 mm it read as a thumbnail beside the numbers rather
    than as the subject of the page. The marked copy follows under 'Located evidence',
    reusing the same raster because the rings are vector.
    Two further deletions: a second view is now captured ONLY when it is measured to
    reveal a finding the ISO could not show (`chooseSecondView`), where the export used to
    print iso/front/top unconditionally — two pages that usually restated the first; and a
    view with nothing marked on it gets no page at all.
    Rings that collide are relaxed apart with a LEADER LINE back to the true point. Two
    findings on one wall — an undercut and a zero-draft face — project to the same pixel
    and read as one ring; nudging without the leader would quietly relocate the finding.

125. **`scripts/pdf-qa/live-figures.mjs` — the figure path had never run in a browser (2026).**
    *Why:* every QA render fed the exporter a hand-written data URI. What was verified was
    that jsPDF can embed a PNG — not that the viewer produces one, not that anchors project
    onto the part, not that a report exported from the real page carries a picture at all.
    I had also asserted twice that this container has no WebGL. **It does**: headless
    Chromium runs it on SwiftShader, so the claim was wrong and the gap was avoidable.
    *Changes it:* real server on a temp DB, real signup, real STEP upload, and the page's
    own viewer handle asked for the same snapshot the exporter asks for. It asserts the
    capture is a picture of a solid — distinct-colour count, not just byte length, because
    a blank frame passes a size check. `CadViewer3D` hangs its handle on the host element
    for this: reading the canvas directly returns a cleared buffer, so without it a feature
    that ships pictures to customers cannot be proven to produce one.
    Two faults it found immediately: seeding only the token left the page redirecting to
    sign-in (the provider restores a session only when token AND user are present), and the
    capture included the viewer's **ground grid** — orientation help for someone orbiting a
    part, and a receding lattice behind the subject in print. `snapshot({ clean: true })`
    hides it for the capture and restores it in the `finally`.

126. **Ten measures were filed as "whole part" because the kernel threw the face away (2026).**
    *Why:* the marker layer could place 53% of the catalogue. Auditing why, most of the gap
    was not physics: `_min_internal_corner_radius` took a minimum over every concave face and
    discarded which one; `_aperture_gaps` found the worst hole pair and kept only the
    distance; the flange measure walked every bend and remembered none of them; the tool-reach
    sweep knew exactly which triangles it failed on and returned a bare percentage. Each
    measure was then classified "whole part, no single face to mark" — a claim that was true
    *by construction*, because the code had deleted the answer one line earlier.
    *Changes it:* the kernel keeps the face. `internalCorners`, `minHoleToHoleAtXYZ`,
    `minHoleToEdgeAtXYZ`, `minBendRadiusAtXYZ`, `minBendToBendAtXYZ`, `minFlangeAtXYZ`,
    `holeToBendAtXYZ` and `unreachableRegions` are published, and the ten measures move.
    **Markable: 53% → 66% of 216 rules** (142 of them). The remaining 74 are genuinely
    whole-part — a setup count, a tolerance band, a slenderness ratio — and stay named as
    such. My estimate before doing the work was 85%; the real number is 66%, and the
    difference is that most of what is left really is a property of the part.

127. **A DFM report that cannot answer "did last month's changes work?" (2026).**
    *Why:* every report was a snapshot. The second question a programme asks is comparative,
    and a reviewer had to diff two PDFs by eye — which is how a closed finding gets missed and
    a regression ships. *Changes it:* `dfm-diff.mjs`, pure and unit-tested, plus a
    `dfm_snapshots` table, four endpoints and a baseline picker in the Studio.
    The value of the module is entirely in the distinctions it refuses to blur:
      * **CLOSED vs NO LONGER MEASURABLE.** A rule that stopped failing because rev B lost
        its wall measurement has NOT been fixed. It is the most dangerous false positive the
        feature could have, so it is a separate `how` on every row, the money it "freed" is
        zero, and the page-one tile counts only genuine fixes. An early render had a tile
        reading "2 CLOSED" beside a headline reading "0 findings closed" — the report arguing
        with itself, with the flattering number in the bigger typeface.
      * **NEW vs NOWLY VISIBLE.** A rule that could not be evaluated on rev A and fails on
        rev B has not regressed; it became measurable. Calling that a new defect sends
        somebody to undo a change that did nothing wrong.
      * **Comparability is WARNED, not assumed.** Two different rule families, or two
        different alloys, produce a table that means nothing. The mismatch is named and the
        reader decides.
    The baseline is never auto-selected. Diffing against whatever happened to be in the store
    last is how a report ends up comparing two different parts.

128. **Findings, and then nothing: the report had no next step (2026).**
    *Why:* it said what was wrong and what it cost, and stopped. Nobody leaves a design review
    with "41.2% of the wall area is under-drafted"; they leave with an owner and a decision.
    *Changes it:* `dfm-actions.mjs` — a page and two sheets. Two disciplines make it a module
    rather than prose in the exporter: **the action is the rule's OWN fix text** (nothing is
    authored, only cut to the instruction), and **the owner is a ROLE, never a name** —
    derived from what has to change, because a slide is a toolmaker's problem and a wall
    thickness is a designer's. The due column is deliberately BLANK; a date this tool invented
    would be the least credible column in the document.
    Two layout faults found only by rasterising: the first version dropped the FINDING to fit
    five columns, so two rules sharing a fix sentence produced two identical, unaddressable
    rows; and `splitTextToSize` was called before the font was set, so 8.4 pt text was wrapped
    against 6.2 pt metrics and ran straight through the column beside it.

129. **A ring on the skin above a thin wall proves nothing (2026).**
    *Why:* the one finding type where an external view is worthless is the one hidden under
    the surface. *Changes it:* `snapshot` gained a `sectionThrough(anchor)` that cuts the part
    at the point the engine measured — not wherever a slider was left — choosing the axis the
    anchor sits furthest along. Only findings whose evidence is internal earn a cut
    (`sectionCandidate`: the thin-wall and deep-bore measures), because a section costs a page.

130. **`npm run thresholds:audit` — 109 unaudited thresholds were a sentence, not a work list (2026).**
    *Why:* the report appendix said "N of 216 rest on industry consensus" and no process could
    act on it: you could not list them, rank them, or tell which had been looked at. A grade is
    a claim ABOUT a citation, not a record that anyone opened it. *Changes it:* a register
    (`docs/threshold-audit.json`) with four honest statuses — `primary-read`,
    `search-corroborated`, `contested`, `unaudited` — and a report that ranks by exposure and
    names what is unverified. A threshold absent from the register is `unaudited`; defaulting
    to anything else is the same fault as scoring an unevaluated rule as a pass.
    **This environment blocks outbound access to every standards body** (nadca.com, iso.org and
    the rest return EGRESS_BLOCKED), so `primary document read` is **0%** and not one entry is
    `primary-read`. That is recorded in the register rather than glossed. The first pass still
    found two CONTESTED thresholds by corroboration alone: `hpdc-draft-minimum` applies one
    figure where the published NADCA constants split inside/outside/cored-hole draft, and
    `hpdc-wall-thickness-range` cites a standard that, by every summary, sets no absolute
    minimum wall at all.

131. **"0 of 216 rest on industry consensus" — three confident zeros (2026).**
    *Why:* the appendix read each provenance grade as `?? 0`, so an analysis that arrived
    without the server's catalogue counts printed zeros that look measured, in the one
    paragraph whose whole subject is how far a reader should trust these numbers. The same
    `Number(null) === 0` trap this codebase has a rule against, and it survived because no QA
    fixture carried a catalogue block either — so the ABSENT branch was the only one anyone
    had ever seen rendered. *Changes it:* absent counts say so in words; `DFM_RESULT_FULL`
    now carries the block, so both branches render in QA.

132. **The DFM store belonged to a person, not a plant (2026).**
    *Why:* `dfm_rule_overrides` and `dfm_snapshots` were keyed on `user_id`, which made "our
    company standard" mean "my standard" — a colleague could not see a threshold the plant
    had agreed, and the revision history of a part belonged to whoever happened to upload it.
    `routes/orgs.mjs` had existed for a while saying of itself *"no org-scoped data migration
    yet — this is the substrate."* *Changes it:* both tables key on the ORG, with the
    personal workspace as the default so a lone user notices nothing. `orgAccess(db)` lifts
    the org helpers out of the route module so a second feature can ask "which org, and what
    may they do in it" without duplicating the query, and it CREATES the org schema itself —
    `registerDfmRoutes` runs before `registerOrgRoutes`, so a backfill that resolved users to
    orgs would have hit a table that did not exist yet and, being best-effort, migrated
    nothing on the one boot where it mattered.
    Two decisions worth stating: **viewer reads, member writes** — a quality engineer needs
    to see the threshold their plant runs to without being able to move it; and **a user who
    names an org they do not belong to gets the same 403 as one naming a fictional org**, so
    membership cannot be probed by comparing error codes. Existing rows are backfilled to
    each user's personal org rather than dropped: deleting a plant's retuned thresholds
    during a migration is not an acceptable way to add a column.

133. **A cored hole is not a wall, and its draft is not a mesh statistic (2026).**
    *Why:* the audit flagged `hpdc-draft-minimum` as CONTESTED — every published draft table
    separates outside walls, inside walls and cored holes (~0.5-1 / 1-2 / 2 deg per side) and
    the rule applied one figure to all of it, conservative on the skin and lenient exactly
    where the tooling risk is. *Changes it:* four cored-hole draft rules across the die-cast
    and permanent-mould families, judged on the bore walls the analytic cylinder pass
    identifies.
    **Two bugs the analytic fixture caught, both of which would have shipped:**
      * The bore detector only accepted CYLINDERS. A drafted cored hole is a CONE, so the
        rule could only ever fire on undrafted bores and would abstain on every properly
        drafted one — a rule that produces bad news and never good news is worse than no
        rule. `_bore_wall_faces` now accepts both, with blends and chamfers skipped because a
        chamfer is a cone too.
      * Draft was derived from the TESSELLATION, as wall draft is. On a flat wall that is
        exact; on a cone the facets chord the surface and their normals spread either side of
        the true angle — a clean 3.000 deg bore reported **12% of its area "below 2 deg"**, a
        false finding manufactured by the measurement. A cone knows its own half-angle:
        `SemiAngle()` is exact, mesh-independent, and it is the number the sources actually
        quote. The measure is now the ANGLE and the tessellation is not involved.
    A third: the first `_bore_wall_faces` borrowed its OCP imports from the caller's scope and
    raised `NameError` inside a bare `except Exception: continue`, which returned an empty
    set and read, all the way up to the report, as "this part has no cored holes". A coding
    error must not be able to impersonate a measurement.
    **INSIDE-vs-OUTSIDE WALL is deliberately not implemented.** From a bore wall the outward
    normal escapes through the bore opening, so the obvious ray test calls a through-hole an
    outer surface, and every cheap variant fails similarly. The wall rules keep the
    conservative outside figure, the register keeps the threshold marked contested, and the
    catalogue says why in the rule itself.

134. **A book we actually read, and the two claims of mine it disproved (2026).**
    *Why:* 321 pages of Boljanovic, "Sheet Metal Forming Processes and Die Design", were
    supplied for review. The register recorded **0% `primary-read`** across 220 rules — every
    guideline the tool judges a part against had come from a secondary summary. This is the
    first primary source in the product.
    *What it corrected in ME first.* I reported that `sm-bend-radius` and `sm-hole-diameter`
    were "a single flat 1.0". They are not: both carry per-alloy override tables — DP600 at
    2.5 r/t, DP980 at 4 r/t, 6061-T6 at 3 r/t. I overstated the gap, and a scripted edit
    acting on that overstatement flattened all twelve values to 1 before the git diff caught
    it. Two lessons, both recorded because both will recur: **read the data before reporting
    a gap in it**, and a bulk edit whose block boundary is `"  },"` will match a nested
    closing brace and silently rewrite the wrong object.
    *What the book actually settles:*
      * **CORROBORATION, not correction.** Checked row by row against Table 5.2 (`R_min =
        c*T`), every steel and stainless value we hold sits INSIDE the book's soft-to-hard
        band. The catalogue's figures stand; the book is the check on them. Recorded as
        `primary-read` with `corroboratesButDoesNotSupply`.
      * **One genuine conflict.** Sec. 9.3.3(a) with Eq. 4.3 gives `d_min/T = 2.8*UTS/sigma_pd`
        — 2.80 d/t for DP980 against our 1.50, 1.77 for 304 against our 1.20. The book is
        first-principles and stricter; ours is unattributed prose. Marked **contested**, both
        numbers published, and NOT switched: a plant that pierces DP980 at 1.5 d/t
        successfully is the measurement that settles it.
      * **Silence reported as silence.** Table 5.2 has no 6000-series row, so mapping 6061 to
        the pure-aluminium row produced a 0-1.2 r/t band against our well-founded 3.0 — the
        book appearing to contradict a good value when it simply does not cover the alloy.
        `bendGroup: null`, the rule abstains, our figure stands.

135. **What the book adds that we did not have at all (2026).**
    `sheet-metal-forming.mjs`, pure and unit-tested, every constant carrying its table or
    equation number:
      * **Maximum bend radius** (Eq. 5.15, `R_max <= T*E/(2*YS)`) — a bend too GENTLE never
        yields and the part springs back flat. No DFM tool I know of tests for it and neither
        did we.
      * **Springback** (Eq. 5.22 from the material's own YS/E, plus Table 5.4) with the
        practical 2-8% overbend band from Sec. 5.7. The biggest quality issue in sheet metal,
        previously absent entirely.
      * **The neutral-axis shift as a CURVE** (Table 5.3: 0.23 at R/T 0.1 to 0.50 at 10),
        not the folklore 0.33 — which is what makes a developed length correct.
      * **Strip layout and utilisation** (Sec. 4.4, Eq. 4.7, Table 4.3) against the book's own
        70-80% target. Its material-economy chapter opens "the major portion of the cost of
        producing a stamped component is the material", and our report quoted a piece price
        while never showing utilisation at all.
      * **Press force and press class** (Eq. 4.3 with the 30% margin of Eq. 4.4, Eq. 5.7).
      * **Draw OPERATIONS counted** (Table 6.2) rather than a pass/fail depth ratio — the
        difference between "drawable" and "three dies".
    Two limits stated rather than hidden: utilisation is a LOWER bound (rectangular envelope,
    single-pass layout — real nesting does better), and the draw blank comes from area
    equivalence because the book's own analytic method (Sec. 6.4.2, Guldinus) needs a meridian
    profile the recogniser does not extract.

136. **`runDfmRules` never gave the material to the measurement (2026).**
    *Why:* the alloy was only ever used to pick a threshold, so `extractMeasures` was called
    with `{ declaredToleranceMm }` and nothing else. The forming rules invert that — the
    REQUIREMENT is a function of the material (`R_min = c*T`, `d_min/T = 2.8*UTS/sigma_pd`) —
    so every one of them abstained with "no measurement available" while the measure map held
    the right answer three lines away. Found by writing the test first and watching four
    correct rules report nothing.

## Vacuum-assisted die casting keeps the HPDC ruleset, with one NADCA amendment

`Vacuum-Assisted Die Casting` routes to the plain `hpdc` family. The original
reason stands: vacuum buys porosity low enough to heat-treat and weld, which is
a metallurgical property this tool does not measure, and a near-copy family
would have invented six thresholds to restate the same geometric limits.

NADCA *Product Design for Die Casting* 7th ed. §5.1 pp.125-128, read first-hand,
does give two things that ARE specific, and they are recorded here rather than
turned into a family:

  * VHPDC is characterised as producing "large, thin-walled (0.08-0.16
    inches/2-4 mm) structural castings" — a narrower band than the 1.5-4 mm the
    conventional rule carries, at the thin end especially.
  * The alloy set is named and is low-iron (<= 0.45% Fe): Aural-2/3/5,
    Castasil-37, Mercalloy 367/368, Magsimal-59, Silafont-36. Silafont and
    Castasil are in the picker and currently route to conventional HPDC.

And one figure worth carrying into COST rather than DFM: VHPDC uses 20-50 gates
against the 3-5 of conventional die casting — an Audi B-pillar is cited at 46.
The tooling model does not distinguish them.

Not acted on, deliberately: a 2-4 mm band applied to a part the user has told
us is vacuum cast would tighten the thin end from 1.5 to 2 mm, which is a real
change but rests on one descriptive sentence rather than a specification table.
Recorded so the next person does not have to re-read Chapter 5 to find it.

## NADCA #402 (2021, 11th ed.) is the tolerance authority; 2015 draft constants survive it

The user supplied *NADCA Product Specification Standards for Die Castings*,
2021 (publication #402) — the document every casting `*-tolerance-capability`
register entry named as its blocker. It is now code in `nadca-402.mjs`, with
three decisions worth recording:

  * **The 2021 draft tables agree with the 2015 design book.** S/P-4A-7 carries
    the same A = 57.28/(C·√L) structure and the same worked example (1.0 in
    depth → 2° inside / 1° outside for aluminium), so `DRAFT_CONSTANT` in
    `nadca-die-casting.mjs` stands unchanged and its sources now also cite the
    2021 standard. No constant was retuned.
  * **Every formula is tested against the standard's own printed worked
    examples** (Al 127 mm → ±0.35 Std / ±0.15 Prec; 75 in² parting-line adder
    → +0.30 mm; flatness 254 mm → 0.76 mm), because that is the only test that
    catches a misread table. It caught one real bug before wiring: a bare
    `Math.ceil` on `177.8/25.4 = 7.000000000000001` charged an eighth
    additional inch and computed flatness 0.84 vs the printed 0.76.
  * **Tolerance capability is now dimension-dependent** where PMI dimension
    rows exist (worst row governs and is named in the finding); a declared
    single band falls back to the first-25.4 mm base — the tightest the
    standard ever promises — and the finding says so. Parting-line adders are
    PLUS-ONLY and banded by projected area; beyond the table (Cu past
    322.6 cm², anything past 1935.5 cm²) the module refuses with "consult your
    die caster" rather than extrapolating. Precision moving-die values were
    not legible in the supplied copy and say so instead of guessing.

Scope honesty: #402 tabulates die casting only. LPDC / gravity / sand /
investment tolerance rules stay blocked, now naming ISO 8062-3 as the
remaining document.

## SFSA Supplement 1 speaks for steel castings; printed numbers gate, digitized curves report

The user supplied the *SFSA Steel Castings Handbook, Supplement 1 — Design
Rules and Data* (25 pages, scanned). It is now code in
`sfsa-steel-casting.mjs`, with three decisions worth recording:

  * **Printed numbers and digitized curves get different jobs.** The 6 mm
    minimum section, the Fig. 8 rib-neutrality triple (1/4 wall → 4 walls of
    height, 1/2 → 1.5, 3/4 → 0.5), the 13–25 mm junction-fillet clamp and the
    2.0 T boss cap are printed and rule-grade. The Fig. 1 length curve
    (±1.5 mm) sharpens the minimum-section threshold only; the Fig. 30 core
    curves (±8 mm at this scan quality) REPORT a recommendation and gate
    nothing. A scan does not get to invent precision.
  * **Steel only, and iron is refused by name.** `castSteelGroupFor` rejects
    cast iron with the reason (graphite expansion gives iron a castability
    this document never describes), so the 6 mm steel floor cannot leak onto
    a grey-iron bracket that legitimately casts at 4 mm. A test pins that.
  * **The rib height ceiling is now COUPLED to rib thickness for steel.**
    The old flat pair (thickness ≤ 1 wall, height ≤ 4 walls) passed exactly
    the ribs Fig. 8 says are worst — full-thickness and tall. The new
    `sand-rib-thermal-neutrality` rule interpolates the printed triple at
    each rib's own ratio and names the worst rib. Rib spacing (≥ 7 T1) is
    recorded but not enforced: spacing between recognised ribs is not yet a
    measure.

Scope honesty: Supplement 1 prints no tolerance tables — those are
Supplement 3, a separate booklet. `sand-tolerance-capability` stays blocked
and the register now names Supplement 3 or ISO 8062-3 as the documents that
lift it. Also recorded, not enforced: the taper equation (needs riser
positions), external-corner radius 0.1–0.2 T (external corner radii are not
yet a measure), and Table 1 boss heights.

## SFSA Supplement 3 makes steel casting tolerance capability computed, and exposes an old lie

The user supplied *SFSA Supplement 3 — Dimensional Capabilities of Steel
Castings*, the document the register named as the tolerance blocker after
NADCA #402. Now code in `sfsa-supplement-3.mjs`. Decisions worth recording:

  * **The document verifies itself.** Every table is printed in both mm and
    inches, and the tests pin the mm values against the inch values (green
    sand model constant 5.200 mm = 0.2050 in × 25.4, and so on) — the same
    role the printed worked examples played for #402. One printed anomaly is
    kept table-faithful rather than corrected: this copy's CT table reads
    CT9 = CT10 = 2 mm at ≤10 mm where canonical ISO 8062 prints 1.5 for CT9;
    verified against the page image, held as printed, noted in the module.
  * **The old flat screen was passing bands no foundry could hold.** The
    1.2 mm sand screen (1.6 ferrous) was ~4× TIGHTER than what SFSA 2000
    says steel sand casting promises — CT13 never tabulates below 6 mm.
    A 2 mm declared band used to pass; the industry's own statistics
    (140,000+ production features) say a first-article steel sand casting
    cannot promise it. The rule now computes capability at each feature's
    own dimension; the fix wording sends the engineer to machining or to a
    negotiated CT grade, which is what the document itself recommends.
  * **The alloy dependence moved into the measure, not out of the rule.**
    Steel is judged against the CT tables; cast iron and non-ferrous alloys
    keep their screening bands with a basis saying the supplement tabulates
    steel only — so aluminium sand castings kept today's behaviour instead
    of going silent, and the finding's source grade (standard-named vs
    industry-consensus) rides the material family.
  * **Production series is a declared input** (`productionSeries`, default
    short): short = first article, judged at CT13; long = tooling iterated,
    CT12. Each is the LOOSEST of the printed typical band — what a first
    quotation can rely on without asking the foundry for anything special.
  * **The capability regressions report; the CT tables gate.** Table 3.8's
    6σ models (green sand / no-bake / shell, at the part's own length and
    weight) carry r² of only 0.4–0.7, so they appear as report figures with
    that caveat, refuse outside their fitted weight domains, and never fail
    a part.

Also new: flatness capability from the ISO 8062-2 CTG tables (sand CTG7,
investment CTG6, at the bounding diagonal) and a machining-stock rule
against Table 2.2's required machining allowance at grade F. Register:
22 rules primary-read. Residual blockers, named: non-ferrous casting grade
selection (ISO 8062 proper), and the geometric tables beyond flatness
(straightness, circularity, coaxiality) are encoded but await measures.

## DuPont Module I is the first polymer primary source, and it confirmed two thresholds

The user supplied *DuPont General Design Principles for DuPont Engineering
Polymers, Module I* (2000 ed.) — the first primary document for the
injection-moulding family. Now code in `dupont-polymers.mjs`. Decisions:

  * **Fig 4.07 CONFIRMED the rib band.** The printed rib proportions
    (0.4 W for appearance, 0.6 W for structure) match the tool's existing
    0.4/0.6 thresholds exactly — the audit's first case of a primary source
    validating a consensus number rather than correcting it. Grades
    upgraded, thresholds untouched. The stricter resin-specific bands (0.5
    for high-shrink semi-crystallines) are moulder experience, are TIGHTER
    than the printed figure, and keep their own grade so the standard's
    name is never borrowed for a number it did not print.
  * **Table 3.01 REPLACES the draft angle for named resins — both ways.**
    Zytel needs just 1/8 deg on a shallow smooth draw where the generic rule
    asked 1 deg; reinforced nylons need up to 1 deg where a generic tool
    might have accepted less. Replacement (not sharpen-only) is safe here
    because the table is depth-banded the conservative way round — deeper
    draws ask MORE, and the part's extent along the draw is an upper bound
    on any feature's depth — and each printed range is judged at its top.
    Resins the table does not name (ABS, PC, PP, PBT...) keep the generic
    angle, and a computed cutoff never lets the generic-angle fallback run
    under its label (the two-numbers-one-caption bug, pre-empted).
  * **The boss/hole pairing geometry now exists once.** The NADCA §3.2 rule
    and the DuPont p.8 rule read the same worst coaxial pair through a
    shared helper; a regression test pins the NADCA measure unchanged.

Recorded but not gated, with the missing measure named: undercut stripping
percentages (Delrin 5%, Zytel 6-10%, GF 1-2% by mould temperature — no
undercut-depth measure yet), thread termination and pitch limits, insert
seat/protrusion/preheat, blind-hole bottom >= 1/6 dia, reinforced weld-line
strength ~60%. Chunks read in full; pp.87-136 (assembly, welding,
machining) print no DFM thresholds. Module I also prints NO tolerance
tables - DIN 16742 remains the moulding tolerance blocker. Register: 28
rules primary-read.

## The Covestro guide covers the PC families, and two books now share one measure honestly

The user supplied the Covestro (Bayer) *Part and Mold Design* guide. Its
digit font does not survive text extraction — every number was read from
the rendered page images (Table 2-1, Fig 2-10, pp.28/31/32/34), the same
way the NADCA tables were. Now code in `covestro-polymers.mjs`. Decisions:

  * **Two resin gates, disjoint by construction.** DuPont Module I names
    nylon/acetal/PET; Covestro names PC, PC/ABS and TPU. Each material is
    judged by the book that names it, a test pins that no material is
    claimed by both, and the shared measure keys were renamed from
    `dupont*` to neutral `resin*` so a Covestro number never travels under
    another maker's name.
  * **The maker tightened its own resin's rib ceiling.** Table 2-1 prints
    Makrolon PC at 50% of wall for minimal sink (40% high gloss) — the
    consensus 0.6 entry was too loose, and it moved to the printed 0.5.
  * **A genuine two-claim conflict, resolved sharpen-only with both claims
    named.** Covestro prints tall-boss trouble at 5× OD (a FILLING limit);
    the existing PC screen of 3× rests on notch-sensitivity (crazing under
    load) — different failure modes. The stricter 3× stands for PC with the
    printed 5× named in the source; PC/ABS and TPU, which carry no notch
    screen, are judged at the printed 5×.
  * **Two books, two different fillet claims, no averaging.** DuPont's 0.5
    knee is where stress concentration flattens; Covestro's 0.15 is a
    performance/appearance compromise for its own resins. Each governs only
    the resins its author names.

Recorded but not gated: rib base radius 0.125T and the ≤1.0 mm walls →
rib-equals-wall note; boss base blend 0.38 mm; undercut stripping (stiff
2%, TPU 5-10%, 30-45 deg lead) enriches the undercut rule's fix text —
undercut depth % is still not a measure. Chapters 3-8 (structural,
assembly, machining, painting, mold design) were read and print process
and mold-side guidance, not part-geometry DFM thresholds. Register: 29
rules primary-read.

## ISO 8062-4 speaks for every non-ferrous casting tolerance, and NADCA loses the moulds it never owned

**Date**: 2026-08-11
**Context**: the register named ISO 8062 as the blocker on every non-ferrous
casting tolerance rule: gravity die and LPDC were unaudited screens, and
sand/investment fell back to flat screening bands for everything but steel.
The user supplied ISO 8062-4:2017 (32 pages). Its text layer extracts per
character, so every table was reconstructed by word position (pymupdf
`get_text('words')` grouped by rounded y) and spot-checked against the
rendered pages.
**Decision**: `iso-8062-4.mjs` pins Table 2 (dimensional S1-S15, stops at
300 mm), Table 1 (profile P1-P15, to 10 m), Table 3 (RMA A-K), Tables 4-8
(draft per process by feature height) and Annexes B.1/B.2/C.1 (grade
selection per metal group × process, long vs short series). The
permanent-mould families (gravity die, LPDC) get a computed
`iso8062PmToleranceMargin` with the same dual evidence paths as every other
capability rule (worst PMI row at its own dimension / declared band vs the
grade's tightest promise); sand and investment route every metal group
Annex B tabulates through the same judge that already served steel, so one
material picker column decides which document speaks.
**Consequences**:
  * **The loosest-of-band convention carries over**: light metal sand short
    series S13, long S12; permanent mould S8; investment S9 for every
    group. First quotations rely on what the table promises unasked.
  * **'-' cells refuse**: steel, nickel and cobalt print no permanent-mould
    or pressure-die column, so gdc/lpdc tolerance rules ABSTAIN on steel
    rather than borrowing the light-metal column. Zinc has no short-series
    sand band and refuses there while its long-series band works.
  * **Two printed oddities held table-faithful**: Table 6 permanent-mould
    fine-external prints 8.5° at ≤4 mm then 3.3° at 4-6.3 mm
    (non-monotonic as printed, like the CT-table anomaly), and the RMA
    6300-10000 mm row was not fully legible in the supplied copy — the
    module refuses beyond 6300 mm and says why.
  * **Draft judged at Grade A (fine) EXTERNAL** — the least demanding
    printed column, because the engine cannot yet split internal from
    external surfaces. Same under-reporting caveat as the NADCA draft, and
    the basis says so. Tables 4-8 sharpen the casting families' draft
    cutoffs at the part's own draw extent, sharpen-only, exactly like
    NADCA on die casting.
  * **NADCA's draft formula is now GATED to the die-casting families**
    (hpdc, hpdc-zinc, squeeze, semi-solid). Until this pass it quietly
    sharpened sand and investment draft rules too — a die-casting citation
    on a rammed mould. ISO's arrival exposed the leak: two documents
    competed for the same cutoff, and each now sharpens only the families
    it speaks for.
  * **Deliberately deferred**: Annex C RMA wiring for non-steel machining
    stock (SFSA's grade-F selection still governs the sand rule), the
    Table 1 P-profile path for parts beyond Table 2's 300 mm, and the
    Table 7 pressure-die cross-check against NADCA #402 (kept — NADCA is
    the more specific authority for HPDC). Register: 31 rules
    primary-read; the last casting blocker standing is DIN 16742 for
    injection moulding.

## DIN 16742 closes the tolerance story: every moulding and casting family now judges tolerance from a pinned standard

**Date**: 2026-08-11
**Context**: the roadmap's last catalogue purchase. The injection-moulding
tolerance rule was a flat per-resin millimetre screen citing the withdrawn
DIN 16901 from memory, and rotational moulding had no tolerance rule at
all. The user supplied DIN 16742:2013-10 (36 pages, bilingual German/
English, the DIN 16901 replacement), which extracts cleanly.
**Decision**: `din-16742.mjs` pins Table 2 (tolerance groups TG1-TG9 ×
16 nominal size bands, tool-specific W and non-tool-specific NW columns),
Table 10 (profile-form general tolerances by DP dimension), Annex C
(compound → tolerance-series column A-F) and Table C.1 (column × series →
TG). `im-tolerance-capability` becomes a computed `din16742ToleranceMargin`
(standard-named): Annex C assigns the picker resin its column, Table C.1
picks the TG at the declared series, Table 2 prices the band at each PMI
dimension's own size, and a declared band is judged against the group's
tightest promise. A new `rm-tolerance-capability` rule (catalogue 247→248)
judges rotational moulding at TG9 — §7.1.1 classifies the whole process
there in one printed sentence.
**Consequences**:
  * **Verified against the standard's own Annex G worked example** — TG4
    at DP 84,13 mm → ±0,32 mm, reproduced exactly — and against Table 2's
    printed structure: the NW column IS the W column shifted one size
    band, checked across all eight groups. A misread cell breaks the test.
  * **Judged at the NW column, doubly justified**: the engine cannot tell
    whether a dimension crosses tool parts (the looser column is the
    honest one), and Table 2 NOTE 5 prints NW as the column for general
    tolerances.
  * **The Annex C letters are the standard's; the shrinkage figures that
    pick a semi-crystalline resin's class are consensus** — the same
    figures the old flat rule cited (PBT ~1.8%, POM ~2%, HDPE 1.5-3%) —
    and every basis names both parts. Loosest printed branch wherever the
    deciding knowledge (shrinkage held to ±10%, anisotropy considered in
    the tool contour) is not an input. The old byMaterial ordering
    survives as TG spread: PC/ABS/PC-ABS TG5, PA/PBT/PEEK and the filled
    compounds TG6, PP/POM/TPU TG7, HDPE TG8 (its modulus sits below the
    1200 N/mm² boundary, so the standard's low-stiffness branch applies).
  * **The series input maps to the printed series**: 'standard' → series 1
    (normal production — §5.2 allows only series 1 for general
    tolerances), 'precision' → series 2 (accurate production, one TG
    tighter per Table C.1). Series 3 and 4 are "always subject to
    mandatory agreement" (Table 8) and the module refuses them — a first
    quotation cannot assume a negotiation.
  * **Refusals kept**: dimensions under 1 mm and over 1000 mm are
    "subject to mandatory agreement" (NOTE 4); '-' cells refuse; a
    material Annex C cannot assign abstains rather than borrowing a group.
  * **Deliberately deferred**: Table 9 (position tolerances, cylindrical
    zones) — the engine has no position-tolerance measure to read it
    against; Tables 3-8's five-point evaluation as a user-facing input
    (the Annex C orientation path covers the first-quotation case, and
    the point system needs shrinkage knowledge only the moulder holds);
    thermoset and GMT assignments (C.6/C.7) until those compounds join
    the picker. Register: 33 rules primary-read from nine documents; the
    named casting and moulding tolerance blockers are now all closed.

## 2D drawings enter the rule engine as a synthesized pmi block, and the AI only ever reads

**Date**: 2026-08-11
**Context**: almost no STEP file carries semantic PMI (0 of 93 in the
commodity sweep), so the tolerance-capability rules built from NADCA #402,
SFSA, ISO 8062-4 and DIN 16742 mostly ran on one typed band — while the 2D
drawing, where the dimensions and GD&T actually live, was not an input at
all. DFM Studio now takes a drawing PDF or image, alone or alongside the
3D file.
**Decision**: one vision endpoint (`POST /api/dfm/drawing-extract`, the
only LLM call in routes/dfm.mjs) reads the drawing into a schema-shaped
extraction via forced tool-use — native `document` blocks, no rasterizer —
and everything after it is pure math in `drawing-analysis.mjs`:
normalization (units, bands, clamps), mapping onto the engine's inputs,
deterministic reconciliation against the model, and the geo synthesis.
Drawing values reach the rules as `geo.dfm.pmi = { source: 'drawing',
sourceNote, dimensions: [{value, span}] }` — six provenance sites
(`pmiSource()`) read that one label, so every capability judge fires
unchanged with `from: 'drawing'` and a basis naming the evidence.
**Consequences**:
  * **The AI extracts; the engines judge.** The extraction prompt orders
    the model to copy what is printed and omit what it cannot read; the
    schema requires no number the model might have to invent; every row
    carries its verbatim `sourceText`; the engineer reviews and can
    exclude rows BEFORE anything is judged; and `/analyze` re-normalizes
    the client's blob — a tampered row gets the same clamps as a fresh
    extraction, with units pinned to mm so a second inch conversion can
    never fire.
  * **Three evidence states, never confused**: model AP242 PMI, drawing-
    read (AI vision), typed by the engineer. `_toleranceBasis` gained the
    third state; the DECLARED and AP242 strings are byte-identical to
    before, pinned by tests.
  * **Conflicts are limits + a drawingCheck table, never catalogue
    rules** — a fake rule row would corrupt the coverage and score
    denominators and claim a manufacturability verdict the catalogue
    never published. Each drawing dimension is matched within a 15%
    proximity window and judged inside its own band plus measurement
    slack; "not found" is the NORMAL state (the kernel does not name most
    drawing dimensions) and is not a conflict. When both documents carry
    a tightest band, the drawing governs the tolerance judges (it is the
    document that carries tolerances), and the model's own PMI is kept on
    the payload with a visible warning — nothing silently wins.
  * **Drawing-only analysis works** (the quote-stage case): the geometry
    skeleton carries a bounding box ONLY when the drawing explicitly
    prints overall dimensions — deriving one from the largest callouts
    would be invention — and every geometry rule abstains with the mode
    named in its reason. Three `hasPart` gates (sfsa/iso/din limits) were
    widened with the pmi-presence clause nadcaLimits already carried, and
    an accidental `draft ?` guard on the NADCA pmi rows (which silently
    emptied them on a part with no draft pass) was removed.
  * **Deliberately deferred**: position/profile GD&T frames are extracted
    and recorded but feed no rule yet (the engine has no position-
    tolerance measure; DIN 16742 Table 9 is the obvious consumer);
    general-tolerance notes (ISO 2768-mK, DIN 16742-TG6) are recognized
    and reported but do not synthesize per-dimension bands — that would
    be a second implementation of tables the engine already holds.

## The DFM Studio is a precision instrument, and its motion has a job description

**Date**: 2026-08-12
**Context**: the studio had grown into the most capable page in the product
and the plainest — a centred landing hero, three competing card recipes, a
score printed as twelve-pixel text between two other figures, and four
one-shot fade-ups doing duty as "animation". Two structural faults were
hiding in the sprawl: the portfolio-scan table had been pasted inside the
3D viewer's header flex row AND inside the `file` STEP guard (so a batch
scan was unreachable without first loading a single CAD part), and the SSE
stage list sat inside that same guard (so a drawing-only run showed a dead
button for the whole analysis).
**Decision**: a `dfm.css` with the `dfm-` prefix following the convention
foresight.css and innovation.css set — every layout, colour and border
declared statically, every animation inside
`@media (prefers-reduced-motion: no-preference)` — plus a small set of
primitives under `src/components/dfm/` (motion vocabulary, ScoreRing,
TickNumber, Panel, StepRail, SectionNav). The identity is METROLOGY, not
the Horizon page's sci-fi: graph-paper ground, drawing-frame corner ticks
on the panels that carry a verdict, GD&T-style datum markers on the step
rail, and a 270° gauge that sweeps to the measured score.
**Consequences**:
  * **Motion states things that are true.** The gauge arc is driven by CSS
    variables computed from the real score, so it cannot land anywhere but
    on it; the count-up terminates on the exact value and renders the
    fallback rather than counting to zero when a figure is absent; the
    in-flight bar is an indeterminate travelling photon, never a filling
    bar, because the duration of an OCCT pass over an unseen part is not a
    number this tool has measured.
  * **The guided flow is derived, not decorative.** Each of Part → Process
    → Analyse → Results is `done` only from state that genuinely exists,
    and the travelling indicator is one shared-layout element so the
    progression reads as travel. The report gains a sticky table of
    contents with live counts and scroll-spy.
  * **One score scale.** The page graded scores at 80/50 in the finding
    headers and 70/40 in the routes and portfolio tables, so the same 62
    was amber in one place and green two inches below. `scoreTone()` is
    now the only grader, and the band it lands in is named beside the
    number.
  * **Both structural faults fixed**: the portfolio table is its own
    section outside the viewer and its guard, and the stage list is its
    own panel above the viewer so a drawing-only run shows its progress.
  * **Verified on a real render, not by reading the diff**: the app was
    driven in Chromium through empty → file chosen → process chosen →
    analysing → results → each section, plus a `reducedMotion: 'reduce'`
    pass confirming the page is complete and static rather than degraded.
    The repo's axe gate reports 0 serious/critical on /dfm-studio.

## The studio becomes a workspace: the form steps aside, the model stays in view, the findings collapse

**Date**: 2026-08-12
**Context**: two visual passes had made the studio look better without making
it work better. A design review of the real renders found four failures that
no amount of surface polish would fix: after an analysis the reader still
scrolled past ~900 px of settings form to reach the answer; the 3D viewer sat
ABOVE the findings, so "Show on model" scrolled the reader away from the very
sentence that sent them there; every finding dumped six paragraphs
(measurement, evidence, rationale, fix, cost, source) so eight of them was a
wall nobody finished; and the motion fired all at once, with no order of
importance.
**Decision**:
  * **The setup collapses to a context bar.** Once a report exists the form
    becomes one line — part, drawing, material, process, volume — with
    "Change inputs" and "Re-run" beside it. The chips carry `layoutId`s so
    they TRAVEL from form to bar rather than one set vanishing as another
    appears. Choosing a new file or drawing re-opens the form automatically.
  * **Two columns.** On xl the findings stream reads on the left while the
    part stays visible in a sticky right rail, so painting a finding onto the
    model no longer costs the reader their place. Below xl it stacks in the
    same order and loses only the adjacency.
  * **Progressive disclosure on findings.** Collapsed, a finding is its
    title, its measurement against the guideline, and what it costs — the
    scannable line. Expanded, the full argument. High-severity findings open
    themselves, because the expensive ones are why the report exists.
  * **Choreography, not simultaneity.** `beat(n)` gives the reveal an order —
    dial, then numbers, then bars, then the list — and spring transitions
    (stiffness 380 / damping 30, no perceptible overshoot) replace tweens on
    everything the hand touches.
**Consequences**:
  * Two defects in the shared CAD viewer surfaced once it was docked in a
    460 px rail and were fixed there: the toolbar wrapped into three stacked
    rows that ate half the viewport (it now scrolls in one row), and finding
    callouts ran off the right edge so the label naming the problem was the
    part you could not read (now bounded to two lines, with the full text in
    the card it came from).
  * Exports now confirm themselves with a toast; a file appearing silently in
    a downloads folder left the reader unsure the click had registered.
  * Verified on real renders again, including a reduced-motion pass; axe
    reports 0 serious/critical on /dfm-studio and 748 tests pass.

## 42. Every finding points at its own geometry, and says so when it cannot

**Context**: The viewer could answer two questions — "where are the undercuts",
"where are the zero-draft walls" — through global toggles, and a handful of
findings had a `Show on model` button. Everything else stated a number and left
the engineer to hunt. Asked "which of these nine ribs is 1.4x the wall?", the
tool had no answer, despite the recogniser having carried that rib's face ids
since the AAG pass landed.

**Decision**: A finding highlights the geometry that produced it, in its own
severity colour, or states in grey why it cannot.

Face identity needed no work: one convention (1-based `TopTools_IndexedMapOfShape`
over `TopAbs_FACE`) is already shared by the viewer tessellation, the DFM pass,
the recogniser and the bore pass, and is declared on the wire. What was missing
was plumbing — four places computed a face id and discarded it:

  * `_extract_feature_table` bound each cluster member's face index to `_fid`
    and dropped it; kept and unioned per row, so a hole or boss finding paints
    the bores it is about.
  * `overhang()` reported percentages only. It now emits the faces behind each
    entry of the curve **keyed by cutoff**, because the answer genuinely differs
    per angle: the analytic wedge is 34% of the surface below 40 degrees and
    nothing at all below 20, so one shared set would have painted no faces for a
    rule that had just failed the part.
  * `toolAccess` knew which triangles the cutter missed and published a bare
    percentage.
  * `locate()`'s instance branch returned `faceIds: []` unconditionally. One
    line, and the reason every rib, hole and boss finding arrived with a
    coordinate and nothing paintable.

**Three states, not two.** `locateFinding()` returns faces, or an anchor with no
faces, or a reason — and the reasons are distinguished: whole-part by nature
("three setups" is true of no face), an unmapped measure (a gap in the tool),
and the engine returning no coordinates. Collapsing them would hide the only one
that is a defect rather than a fact about the measurement.

**Not the figure's cap.** `selectFindingAnnotations`' `ANNOTATION_CAP = 8` is a
printed page's ink budget. `locateFinding()` deliberately does not inherit it:
"the figure only had room for eight" is not an answer to someone clicking the
ninth finding.

**Two-way.** Clicking a painted face opens the finding that painted it. Where
two findings claim one face the more severe wins the click and the banner counts
the rest — resolving a tie silently would hide a finding.

**Consequences**:
  * Three viewer defects surfaced only under live QA on the analytic fixtures
    and were fixed there: painted overlays did not follow `setExplode` (now
    split per body, with the offset ROTATED out of the part frame — the pins'
    highlight landed beside its pin until it was); the camera kept its orbit on
    focus, so a highlighted wall lying edge-on rendered as a coloured line; and
    the first fix for that averaged the facet normals, which on a rib prism
    cancel to the rib's LENGTH — it now takes the dominant flat direction, or
    abstains when none dominates (a bore has no single outside view).
  * The benchmark's `featureTableCylinders` check had an escape hatch that
    skipped when the id list was empty, so wrong ids and absent ids both read as
    a pass. Removed; the gate is 200/200 and the check is live.
  * 756 tests pass, axe reports 0 serious/critical, and the rib case is proven
    on `ribbed-plate.step`: the max-thickness rule paints the 5.0 mm rib and the
    min-thickness rule the 2.4 mm one.

## 43. What seven production parts changed about face highlighting

**Context**: Decision 42 was proven on analytic fixtures — a 120 mm ribbed plate,
a 40 mm boss plate. Running the same feature over seven real uploads (a die-cast
bracket, a steering knuckle, two seat pressings, two machined parts, a moulded
volume; 384 kB to 5.4 MB, 209 to 426 faces) changed four decisions that the
fixtures could not have surfaced.

**1. Framing follows the part, not the feature.** The obvious move is to zoom to
the highlighted face. Tried at two strengths and judged on the renders: at
0.28x part radius a ~3 mm undercut on the 256 mm Seat_Locking_Bracket filled the
screen with featureless grey; at 0.75x the bracket lost the landmarks that say
where you are. In neither case did the offending face become more visible — it
is a thin wall seen nearly edge-on, and magnification does not change that. A
cost engineer's next question after "which face" is "where on the part", and an
image with no part in it cannot answer it. So the part-framing distance is a
FLOOR and feature size only ever pulls the camera BACK, which handles the case
that did need it: a full-length draft wall otherwise fills the screen edge to
edge and reads as "the whole part is wrong".

**2. A face click must not toggle.** The button toggles — pressing it again is
how a reader puts the model back. Clicking a painted face went through the same
path, so clicking the face you were just shown CLEARED it. "What is wrong with
this face" has the same answer however many times it is asked.

**3. Truncated highlights say so.** PRCR012 has 67 faces the cutter cannot
reach; the kernel caps id lists at 40, and the banner read "40 faces tinted" —
telling the reader it had shown them everything. It now reads "40 of 67 faces
tinted", and `locateFinding` carries `faceTotal` only when something was
genuinely dropped, so a caller cannot print a misleading "40 of 40" either.

**4. An occluded anchor is usually correct.** `projectAnchors` reported the
anchor invisible on four of seven parts right after the camera flew to face the
highlight, which looked like a bug and is not: a corner centroid sits inside a
concave corner and a thinnest-section point is inside the material. The callout
still renders and its leader marks the spot.

**Consequences**:
  * Across the seven parts: 20 failing findings, 16 offered the model and
    painted faces, 4 stated why not, and **zero were silent** — the property the
    whole design rests on.
  * The reverse link (click a painted face, land on its finding) was confirmed
    on four of the parts plus the analytic fixture. Where the scripted click did
    not resolve, the viewer's face chip was EMPTY or named a face outside the
    capped set — the synthetic click missing the solid, not the link failing.
  * A QA lesson worth keeping: the harness's own defects (aiming at the
    top-left-most tinted pixel, which is an anti-aliased silhouette; signing up
    per run into a 5-per-15-minute rate limit) produced three separate false
    "product is broken" readings. Verify the harness before believing it.

## 44. The highlight travels into the PDF and the workbook

**Context**: Decisions 42-43 made every finding show its own geometry on screen.
The exported artefacts did not follow. The PDF painted every finding's faces
into ONE shared view — which answers "where are the problems" and cannot answer
"which faces is THIS one about" — and the workbook carried the numbers with no
picture at all, sending a reader back to the PDF to find out what a row meant.

**Decision**: one evidence render per finding, captured once and used by both.

  * `captureFigures` emits a `role: 'finding'` figure per LOCATABLE finding:
    only that finding's faces, its own severity colour, camera square to them.
    Built from `placedFindings`, deliberately NOT from `annotations` — the
    latter is capped for page one's marker budget, and a finding printed in the
    table with no picture beside it is the gap this closes.
  * The PDF draws it inside the finding's card, captioned with the face count.
  * The workbook gains an **Evidence** sheet embedding the same renders, and the
    Findings sheet gains `Faces highlighted` and `Shown on model` columns. This
    needed image support in `xlsx-write` (`SheetSpec.images`, `rowHeights`) —
    a picture is anchored to a cell and does not push anything aside, so a sheet
    carrying images has to make room for them.

**Honesty, in both artefacts**: a finding with no picture prints WHY, from a
complete uncapped map keyed by rule id — whole-part by nature, no coordinates
from the engine, or located at a point rather than on a face (a callout, not a
highlight). A face count reads "40 of 67" whenever the kernel capped its own id
list. The per-finding figures have their own cap (12, worst first) because each
is a full render, and the remainder is stated rather than dropped silently.

**Consequences**:
  * `flyTo` gained `immediate`: a capture cannot wait on a tween, and a
    snapshot taken mid-flight is a picture of the camera moving.
  * A defect the exports made visible and the screen never would: `flyTo` only
    overrides the approach direction when the painted layer HAS a dominant
    normal, and a curved wall deliberately has none — so those figures inherited
    the pose the PREVIOUS figure left behind. On the steering knuckle that
    produced an arbitrary close-up with the part unrecognisable. Each figure now
    resets to isometric first, so an abstaining normal falls back to a standard
    view rather than to an accident.
  * Verified by exporting both artefacts from a real analysis of
    `steering_knuckle_RH.stp`: 526 kB PDF with the under-drafted wall red inside
    its own card and "measured across the whole part" printed under the finding
    that has no face; 185 kB workbook with 4 images anchored on the Evidence
    sheet at the right rows.

## 45. All four deck generators live in the repo

**Context**: Four director decks are tracked deliverables. Only one generator —
`scripts/make-dfm-deck.mjs` — was in the repo. The other three lived in a
scratch directory, and it shows in the dates: the platform deck went 132 commits
without a refresh, the brief 129, Horizon 110. A generator you cannot find is a
deck that goes stale silently, and every figure on those slides was retyped
rather than counted.

**Decision**: `build_deck.py`, `brief_deck.py` and `horizon_deck.cjs` move in as
`scripts/make-platform-deck.py`, `make-brief-deck.py` and `make-horizon-deck.cjs`,
with their assets committed under `scripts/deck-assets/`.

**No build-time dependency on `sharp` or `react-icons`.** `make-deck-icons.mjs`
had already ruled on this and written down why: *"a deck that cannot be
regenerated six months from now because an optional npm package moved is a deck
that quietly goes stale."* The Horizon generator rasterised 26 Lucide glyphs on
every run through `sharp`. Those PNGs are now baked into
`deck-assets/horizon-icons.json`, keyed `IconName|hexcolour`, and `ic()` reads
the cache. It reaches for `sharp` **only on a cache miss** — which is how the
cache rebuilds when the icon set changes, and the one time a scratch install is
needed. A miss with no scratch install throws a message naming the fix rather
than failing obscurely.

**Consequences**:
  * All three rebuild byte-identically in structure from a clean checkout —
    21, 2 and 16 slides, all passing `validate.py`.
  * `CLAUDE.md` changed: the line saying the platform generator is "kept outside
    the repo" is now wrong. Its useful half survives — regenerate a deck only
    when the deck IS the task, never as a side effect — and now covers all four,
    plus the `.zip` twins.
  * The scratch install had `react`/`react-dom`/`sharp` but not `pptxgenjs`, and
    the repo had the reverse. Baking had to run from `/tmp` with `pptxgenjs`
    symlinked in, because Node resolves `node_modules` by walking up from the
    FILE, so a repo-resident script always found the app's React 18 first and
    died on a version clash. Recorded because it will be the same dance next
    time the icon set changes.

## 46. Deck figures are counted, and slide numbers count themselves

**Context**: Refreshing all four decks exposed why they had drifted 132, 129 and
110 commits without anyone noticing. Two mechanical reasons, both fixable.

**Figures were retyped.** `make-dfm-deck.mjs` already imported its counts from
the catalogue and stayed accurate; the other three hard-coded theirs and every
one was wrong — 285 tests against 758, 139 register entries against 180, "13 AI
tools" against 22. Horizon's register size was *technically* read from a data
file, which is worse: it looked derived while the file itself was typed by hand
in July. `scripts/make-horizon-deck-data.mjs` now recounts it from the live
register.

It deliberately does **not** regenerate the `bev` block or the lens example
names. Those are one live query's recorded output. Recomputing them from the
register would silently convert evidence of a run into an assertion — the same
class of error as a report inventing a measurement.

**Slide numbers were retyped too**, which sounds trivial and is not: the
platform deck numbered every `header()` call and Horizon numbered every
`footer()` call plus the "/16" total. Inserting one slide meant editing a dozen
call sites, so the cost of adding a slide when the product gained a capability
was high enough that nobody paid it. Both now count themselves.

**Consequences**:
  * Adding the DFM/DFA and Horizon slides to the platform deck collided with its
    capability numbering — it would have shipped two "Capability 4"s. Renumbered
    downstream. Worth noting because auto-numbering the SLIDES does not fix the
    hand-written KICKERS, which are still prose.
  * `pptx-qa.mjs` measures a mixed-size text run at its largest font, so a 26pt
    number beside an 11pt label reports as an overflow it is not. Horizon's 21
    "hard" faults are almost all this plus deliberate off-canvas decorative art.
    The check is still worth running — it found four real faults in this refresh
    — but its output needs reading, not obeying.
  * LibreOffice cannot open ANY exceljs workbook or pptxgenjs deck in this
    container, so there is still no visual render. Verified it refuses a plain
    two-cell workbook, which rules out the Excel image support added this week
    as the cause.

## 47. TRIZ Studio gets the two tools that do not need the 39 parameters

**Context**: TRIZ Studio implemented one instrument — technical contradiction →
40 principles — and everything it produced hung off one step: an LLM mapping
free text onto Altshuller's 39 generic engineering parameters. Published work
puts the share of real problems that fit those parameters at roughly 10–15%, and
the reliability literature is blunt that the mapping repeats poorly: two
practitioners given the same problem pick different parameters. The Studio did
that mapping once, invisibly, with no alternates and no override.

**Decision**: rather than deepen the matrix first, add the two classical tools
that **do not use that mapping at all**.

**Trimming** (`triz-trimming.mjs`) is the subtraction tool and the one with the
strongest published cost record — a documented application reports 83% component
count and 95% component cost removed. The three classical rules are encoded:
**A** the object goes too, **B** the object does it itself, **C** something
already present does it. The core decides which rules are *available* and what
money each releases; the LLM answers only the narrow question the fired rule
poses. Rule C is withheld when there is genuinely no third component — offering
"let something else do it" on a two-part system is noise dressed as method.

It is fed by `functionCostMatrix()`, which already produced components ×
functions with a validated cost allocation. That is why trimming was cheap:
the input already existed. The adaptor marks every converted row
`objectInferred`, because FAST records what a function *serves*, not what it
*acts upon*, and inventing the object would be inventing the analysis.

**Physical contradictions** (`separationStrategies` in `triz.mjs`) resolve one
property that must take two opposite values, via separation in space, time,
condition, or between parts and whole. The four strategies are settled; the
principle list attached to each is not, and published lists differ — so each
carries a `sourceStatus` using the DFM catalogue's vocabulary and the UI prints
the grade beside the recommendation. Asserting one author's list as *the*
mapping would be a stronger claim than the literature supports.

**Consequences**:
  * No cost is ever invented. A model with no costs yields candidates with
    `costReleased: null` and is ordered alphabetically, with the UI saying the
    order is not a priority. An uncosted component sorts LAST, not as zero —
    absent is not cheap.
  * `trimmingUpside` sums only over candidates the caller marks confirmed. Every
    candidate is an open engineering question until answered, and totalling them
    would be the fabrication this codebase refuses everywhere else.
  * A real bug the tests caught: the strategy question was built by replacing
    the phrase "the property", and the one strategy whose wording lacked that
    phrase silently produced a question naming nothing. Now an explicit
    `{property}` placeholder, with a test asserting every strategy carries one.
  * The Studio footer claimed a "deterministic contradiction matrix". The core
    holds 20 curated pairs of a possible 1,482 and says so in its own header.
    Corrected — adding two tools to a page that overstated would compound it.
  * Deferred and recorded: the full 39×39 matrix with empty cells preserved,
    top-3 candidate mappings the user can switch between, ideality scoring,
    feeding TRIZ real DFM/FAST part data, and an adversarial "does this actually
    break the contradiction" pass.

790 tests (32 new), tsc clean, axe 0 serious/critical, DFM gate 200/200.

## 48. BrainSpark should own its repository; a startup hook cannot substitute

**Context**: BrainSpark has no repository, image or devcontainer of its own. It
is a 331-commit branch inside `bhosaleavinash546/leamington-marathi`, a repo
whose `main` is the Leamington Marathi community website — GitHub Pages, live on
`leamingtonmarathi.com`. A third product, a Marathi panchang engine, occupies a
further branch. Three unrelated products, one repo, separated only by branch.

Ephemeral containers clone at the *default* branch, which is the website. On
2026-08-12 a container did exactly that and then created the working branch at
the website's tip rather than checking out the remote branch holding the work.
The reflog records it: `checkout: moving from efa16de… to
claude/auto-cost-reduction-tool-mzol0x`, both at `efa16de`. BrainSpark looked
like it had reverted to a Marathi community site. Nothing was lost — the remote
was intact throughout — but a session that had not noticed would have built on
the wrong base.

**Decision**: BrainSpark gets its own repository, whose default branch *is* the
product. A fresh clone is then correct by construction.

**Why not the cheaper fixes** — anything living *inside* the repo fails for the
same structural reason:

  * **A tracked `SessionStart` hook** that fetches and fast-forwards the branch.
    The hook would live on the BrainSpark branch, and on a mis-clone the
    BrainSpark branch is precisely what is *not* in the checkout, so the hook is
    not there to fire. The docs confirm the mechanism — a repo's
    `.claude/settings.json` hooks reach a cloud session only as "part of the
    clone". The only branch it could fire from is `main` — the live website's —
    which means putting BrainSpark rescue logic into the website repo and
    running it for every website session. (`.claude/` is gitignored here too, so
    it would also need an exception.)
  * **Documenting the recipe in `CLAUDE.md`** fails identically: on a mis-clone
    `CLAUDE.md` is not in the checkout either.
  * **Changing the repo's default branch** to the BrainSpark branch would fix
    the clone and break the website's Pages publishing source, re-basing every
    website PR. Rejected.

**A partial mitigation that does live outside the repo.** The first draft of
this entry said the cheaper fixes "cannot work", which was too strong — it only
surveyed things inside the repo. A cloud environment's **setup script** is
configured at `claude.ai/code`, not in the repository, runs as root after the
clone and before Claude Code launches, and therefore survives a mis-clone. A
script guarded on the remote URL can correct the checkout:

```bash
#!/bin/bash
BR=claude/auto-cost-reduction-tool-mzol0x
cd /home/user/leamington-marathi 2>/dev/null || exit 0
git remote get-url origin 2>/dev/null | grep -q leamington-marathi || exit 0
git fetch --quiet origin "$BR" || exit 0
[ -z "$(git status --porcelain)" ] && git checkout -qB "$BR" "origin/$BR" || true
exit 0                      # a non-zero exit fails the whole session
```

It is a mitigation, not the fix, for three documented reasons. The setup script
is **skipped whenever a cached environment exists** — and the cache is exactly
what a freshly provisioned VM starts from, so it will not fire on most of the
sessions that need it. Environments are **not repo-scoped**, so the guard on the
remote URL is load-bearing: without it the script runs for website sessions too.
And it encodes one branch name in a place no one reviewing this repo will ever
see. Worth setting today; not worth mistaking for the repository split.

**Status: blocked, not done.** This session's GitHub access is bound to
`leamington-marathi` alone — `create_repository` returns 403 "Resource not
accessible by integration", and git cannot authenticate to any other repository
path. The probe was run first precisely so a partial migration was never
started; nothing was changed. The migration is three commands for anyone whose
access is not so bound:

```bash
# 1. create an EMPTY github.com/<owner>/brainspark (no README — an auto-init
#    commit collides with pushing a branch as main)
git remote add brainspark https://github.com/<owner>/brainspark.git
git push -u brainspark claude/auto-cost-reduction-tool-mzol0x:main
```

Pushing the branch *as* `main` carries all 331 commits, squashing and rewriting
nothing, and makes BrainSpark the default branch of its own repo.

**Consequences**:
  * The branch in `leamington-marathi` is **not** deleted by the migration and
    `main` is not touched. The website is unaffected and the branch remains a
    complete backup. Removing it later is a separate, explicit decision.
  * After migrating, re-point `origin` at the new repo so a bare `git push`
    cannot reach the website repo by accident.
  * PR #35 (`costvision/cad-agentic-review`), an older BrainSpark-lineage branch
    still open against this repo, does not come along. It needs its own call.
  * Until the migration happens, OPERATIONS.md carries the check-and-restore
    recipe for a fresh container. That is a workaround for a structural fault,
    and should be deleted the day the fault is fixed — not kept as procedure.
  * Unrelated to where the code lives: all runtime data (`./data` — users, saved
    analyses, uploaded STEP parts, marketplace approvals, feedback signals — and
    `data/backups`) is gitignored and exists only inside the container. It does
    not survive a reclaim, and moving repositories does not change that. Real
    persistence is a separate piece of work.

## 49. Provenance is decided once, and an unverified claim is bounded

**Context**: the August 2026 audit (`docs/AUDIT-2026-08.md`) found the house
rule holding almost everywhere in the engines and failing at the two places
where it is worth the most: the artefacts that leave the building, and the
ranking that decides which ideas a user reads first.

The Excel workbook, the PowerPoint deck and the **RFQ pack sent to suppliers**
carried no engine cross-check, no confidence level and no evidence caveat.
Only the on-screen PDF did. So an idea the engine had CONTRADICTED reached a
supplier reading exactly as authoritative as one it had confirmed — and the
first live eval measured **30.8% of engine-checked ideas as contradicted**, so
this was not a hypothetical.

**Decision**: `src/services/idea-provenance.mjs` — a pure, testable module that
decides the verdict once. Every exporter consumes it; renderers choose colours
only. Four exporters had re-implemented (and variously broken) the same
judgement.

**Consequences**:
  * **`evidenceUnverified` has a non-obvious default and it is now honoured.**
    The type says `false` = retrieved live, `true` *or* `undefined` =
    model-asserted. Truthiness therefore reports the common unset case as
    *verified* — the wrong way round. `evidenceIsVerified()` compares against
    `false` explicitly. Absence of a stamp is not a stamp.
  * **The ranking base is winsorised.** The score was `annualValue × factors`,
    where `annualValue` is free text the MODEL wrote, unbounded, and engine
    confirmation was a trailing ×1.2 — so an idea that overstated itself
    outranked one the engine had checked. Claims are now capped at 3× the batch
    median, with the cap printed in `rank.basis`.
    - The **median**, not the mean: inflated outliers are exactly what is being
      guarded against, and they would drag a mean up with them.
    - Not-engine-checked costs ×0.85, deliberately light. Only about half of
      generated ideas are expressible as a substitution the engine can re-cost,
      so a heavy penalty would bury most of the output for being
      *unrepresentable* rather than *wrong*.
  * **`notableFlags()` filters the validator, it does not dump it.** Measured
    flag rate is 60.7%, mostly structural normalisation (`defaulted-difficulty`
    and friends) that says the model returned a bad enum. Only flags bearing on
    trust — implausible saving or payback, confidence asserted without evidence,
    unverified OEM attribution — earn a badge. The rest stay in the payload.
  * **An absent engine check now renders as a badge**, not as nothing. Silence
    read as a pass, and silence covered roughly half the output.
  * **The homepage accuracy claim is pinned to the benchmark JSON by a test.**
    "2× more accurate" was the stamping figure (1.92×) standing in for machining
    (1.27×) as well. The repo's rule is "no asserted improvements"; a comment
    does not fail CI, so `tests/accuracy-claim.test.mjs` does.
  * A source-level test asserts all four exporters reference the module. Building
    them needs jsPDF/exceljs/pptxgenjs and a browser, but the regression that
    shipped was structural — an exporter never mentioning provenance at all —
    and that is visible in the source.

**Still open, recorded in the audit**: the held-out cost set runs 78.6% hit /
20.9% MAPE against the CI-gated 100% / 8.3%, and nothing watches the gap; the
Monte-Carlo P10–P90 band has 35.7% measured coverage against the 80% its label
implies (the export now carries a caveat, the band itself is uncalibrated); and
27 DFM rules cite named standards nobody has read first-hand.

## 50. The cost engine has no machinability term, and it cannot be added yet

**Context**: the August 2026 audit's held-out benchmark exposed three systematic
misses — **Ti-6Al-4V machined −46%**, **CFRP/RTM −38%**, **CNC aluminium at high
volume +46%** — against a −7.3% overall bias. The titanium miss has an obvious
cause: `MATERIAL_PROCESS` carries `cycleBase` and `cyclePerKg` per PROCESS and
nothing per material, so a titanium fitting is costed with an aluminium cycle.
Ti-6Al-4V removes at roughly a quarter of 6061's rate — low thermal conductivity
puts the heat in the tool, it work-hardens, and it needs rigid low-speed cuts.

**What was tried**: a `MACHINABILITY` table keyed on material family, applied to
`cyclePerKg` only — `cycleBase` is non-cut time (tool changes, rapids, probing)
and does not care about the material. Two magnitudes were tested:

| ratios | titanium | steel bracket | brass | calibrated MAPE | held-out MAPE |
|---|---|---|---|---|---|
| baseline (no term) | −46% ✗ | −2% ✓ | +29% ✓ | 8.3% | 20.9% |
| pure-cutting (Fe 2.0, Ti 4.0) | — | **+95% ✗** | — | 13.8% | 19.4% |
| whole-cycle (Fe 1.4, Ti 3.0) | **−22% ✓** | +42% ✗ | +39% ✗ | 10.5% | 19.9% |

**Decision**: not shipped. Reverted.

The term is real physics and its absence is a genuine modelling gap, but the
evidence does not support any particular magnitude:

  * It fixes titanium (−46% → −22%, inside tolerance) and **breaks steel and
    brass**, which both over-cost by ~40%. One scalar per family cannot be
    simultaneously too low for titanium and too high for steel — which says the
    base `cyclePerKg` is itself absorbing an average machinability, and the
    honest fix is to re-derive the base constants alongside the term, not to
    bolt a multiplier onto constants fitted without one.
  * On the honest test it is a wash: held-out hit-rate is unchanged at 11/14
    (titanium came in, brass went out) for a 1pp MAPE gain on n=14. That is
    inside the noise.
  * The 16 calibrated reference prices are self-described as "ILLUSTRATIVE
    anchors derived from public teardown/industry norms — NOT proprietary
    supplier quotes". With anchors that soft, "my ratios are wrong" and "the
    anchor is wrong" are indistinguishable, and picking whichever reading makes
    the fixtures pass is precisely the over-fitting this audit was called to
    find.

**What it would take**: real quoted piece prices for the same geometry across
aluminium, steel, brass and titanium — perhaps twenty parts — then re-derive
`cycleBase` and `cyclePerKg` *with* the machinability term rather than bolting
one on afterwards. The `calibration.mjs` quote-learning path already exists to
absorb exactly this kind of data.

**Consequences**:
  * The two remaining held-out misses are separate problems, not machinability:
    **CFRP/RTM −38%** is a process-model gap (RTM is cycle-dominated with resin,
    consumables and tooling terms the metal model has no representation for),
    and **high-volume CNC +46%** is a volume-scaling gap in setup/batch
    amortisation, not a material one.
  * `benchmark/cost-divergence.mjs` now watches the held-out/calibrated ratio
    (2.51x today) so whoever does this work can see whether it is helping.

## 51. Citation quality and register coverage are separate axes

**Context**: `scripts/threshold-audit.mjs` reports how many rules appear in
`docs/threshold-audit.json` — the curation register — and calls the remainder
`unaudited`. The August 2026 audit read that output and reported it as the
SOURCING position of the rule catalogue: "212 of 248 unaudited, 6% primary
document read, 27 rules cite a named standard nobody has read first-hand."

That was wrong. Reading the catalogue's own citations:

| what the citation says | rules |
|---|---|
| primary document read first-hand | 38 |
| names a standard, reading unclear | 5 |
| names a standard and admits it was NOT read | **2** |
| stated as industry consensus / guidance | 203 |
| no source text at all | 0 |
| **claims a stronger provenance than the citation supports** | **0** |

Two rules under-claim — graded `industry-consensus` on text that records
first-hand reading. The catalogue errs conservatively, which is the correct
direction for a tool whose selling point is not overstating.

**Decision**: the two axes are reported separately and can never again be
printed as one number.

  * **Citation quality** — what the rule's own source text supports. The
    engineering position.
  * **Register coverage** — whether a curator has independently re-reviewed it.
    An audit-trail property.

The script prints them under separate headings, and the register block states
in terms that not-reviewed is a gap in the trail, not a claim the threshold is
unsourced. It also surfaces the drift nothing was watching: 12 rules whose
citation records first-hand reading that the register never recorded.

**Consequences**:
  * **A customer-facing label was wrong in the opposite direction.**
    `SOURCE_GRADE` printed "NAMED STANDARD, not read first-hand" for every
    standard-named rule, in both the DFM report and the Studio screen. False for
    36 of 38. The tool was telling customers it had not opened standards its
    authors had read and encoded table by table. Understating your own rigour is
    still misreporting, and it is the corroboration that made the wrong finding
    look right.
  * **The single `--max-unaudited` ratchet is replaced by three named gates.**
    It conflated the axes, and once the citation axis was added it silently
    began reading a different field and gating on 3 instead of 212 — loose
    enough to catch nothing. `--max-unread-standards`, `--max-register-drift`
    and `--max-unreviewed`, each verified to fail when tightened.
  * `tests/threshold-audit-axes.test.mjs` pins the invariant that actually
    matters — no rule may claim a stronger provenance than its citation supports
    — and asserts `dfm-rules.mjs` still imports all six standards modules, so
    the catalogue cannot cite a standard the engine no longer consults.
  * The remaining real debt is **2 rules**, both permanent-mould minimum
    cored-hole rules taking a NADCA figure second-hand from a design guide, and
    both saying so in their own text.
  * Recorded as **F-32** in the audit register, and every other finding was
    re-swept for the same signature — see `docs/AUDIT-SWEEP.md`. 30 of 31 hold.

## 52. Part 360 fans out through lenses but lands in the one pipeline

**Date**: 2026-08-18
**Status**: Accepted

**Context**: Part 360 takes the four artefacts a cost engineer actually holds —
3D model, 2D drawing, supplier quote with breakdown, stated process — and asks
for a genuinely 360° review: is this the right process, region, specification,
weight, and price? The temptation was a fifth ideation endpoint with its own
idea schema (the repo already carries four endpoints across three schemas, a
fragmentation the audit called out).

**Decision**: Three commitments.

1. **All numbers are computed server-side, twice-guarded.** The dossier
   endpoint re-runs every engine (`should-cost`, `compareRoutes`,
   `specRelaxationDeltas`, region sweep, `volumeSensitivity`, forensics,
   waterfall) from raw inputs; engine figures never round-trip through the
   client. The only client-transported engine artefacts are the DFM/geometry
   subsets, under the same sanitize-and-cap discipline as
   `cadGeometry.dfmaFindings`, and they feed maths, not claims.
2. **The entitlement waterfall is a chain, not a list.** Each step's `fromEur`
   is the previous step's `toEur`, deltas sum exactly from quote to
   entitlement, and a step the engine cannot compute stays visible as
   `skipped` with its reason — a silently dropped step reads as a smaller gap.
   The artefact is labelled a DIRECTION INDICATOR with the held-out error band,
   because an entitlement number without its uncertainty is a negotiation
   grenade.
3. **Generation fans out, but converges.** N parallel lens passes (each a
   forced `emit_ideas` call over its dossier slice) merge into the single
   existing `finishAnalysis` pipeline — validate → dedupe → engine-check →
   prior-art → deep → rank. No new idea schema; `evidenceRefs` and `lensId`
   ride as optional fields the validator normalises. An idea that cites no
   [E#]/[W#] line when a dossier was supplied gets a visible trust flag
   (`uncited-in-evidence-mode`), not a silent pass.

**Consequences**:
  * ResultsPage, exports, Pipeline promotion and business cases work on
    Part 360 output unchanged, provenance stamps intact.
  * The wiring contract is pinned at source level
    (`tests/part360-wiring.test.mjs`) because the seams live in the server
    monolith where they cannot be imported.
  * Whether dossier grounding actually beats ungrounded generation is a
    MEASURABLE claim (corpusNoveltyRate + citation rate vs the eval noise
    floor) and deliberately not asserted here.

### 52a. Rename: Part 360 → Prism (2026-08-19)

The feature shipped for one day as "Part 360"; the user asked for a name with
a story. **Prism** is that name because it is literal: the entitlement
waterfall splits one quote into named premiums exactly the way a prism splits
one beam into bands. UI surfaces, exports and docs say Prism; `/part-360`
redirects to `/prism`. The BACKEND names stay (`part360.mjs`,
`/api/part360/*`, the `part-360` tool id): API stability outranks cosmetic
consistency, and the tests that pin those seams keep their meaning.

## 53. Prism memory is the org's own outcomes, labelled as such

**Date**: 2026-08-25
**Status**: Accepted

**Context**: The market research (aiSource, A2MAC1+BCG's Cost Measure
Ideator, CoLab's knowledge graph) says the durable moats in this space are
evidence bases and institutional memory. Prism's Tier-1 answer is three
features that compound the customer's OWN data instead of borrowing
authority.

**Decision**:
1. **Fleet memory** (`prism-memory.mjs` + `prism_runs`): every dossier run
   leaves a compact geometry signature; similar prior runs surface as
   evidence lines carrying an EXPLAINED similarity ("shape 0.94 · size
   0.81 …", floor 0.75) plus the linked project's engine-confirmed ideas and
   VAVE-tracker stages. The section header says these are the organisation's
   own outcomes, never external benchmarks. Absent components of a signature
   are excluded from the score, not treated as matches.
2. **Teardown observations** (`teardown_observations`): user-recorded
   competitor teardowns become citable evidence lines prefixed
   "YOUR TEARDOWN (user-recorded, externally unverified)" — the A2MAC1
   credibility mechanism on private data, with provenance instead of
   borrowed authority. Relevance is deterministic (resolved material/process
   key > family > name tokens).
3. **Zero-touch batch triage** (`POST /api/part360/batch`): up to 12 STEP
   files measured unattended, massed from their own geometry (volume ×
   catalogue density, stated as CAD-derived), run through the entitlement
   waterfall and ranked by annual gap. Deterministic engines only; failed
   files carry their reason. Heavy integration test opt-in via CV_HEAVY_IT=1
   so `npm test` stays fast.

**Consequences**: generation's project autosave back-links to the run
(`prismRunId`) so tracker outcomes accrue to the fleet; memory writes are
best-effort and can never block a dossier; all sections keep the
stated-absent discipline ("fleet memory starts with this run").

## 54. Tier 2: guardrails flag, counters anchor at the band's edge

**Date**: 2026-08-25
**Status**: Accepted

Four capability-gap moves from the market research, each with its stated
honesty rule:
1. **Input pre-flight** (`inputAnomalies`): quote-line arithmetic, process
   volume sanity bands (labelled heuristic questions, not verdicts),
   physically impossible densities, stated-vs-CAD mass. Cautions are FLAGGED
   and ride into the evidence dossier as "INPUT CAUTION" lines on the part
   section — never silently fixed (the Tset lesson).
2. **Counter-offer builder** (`counterOffer`): above-model lines target
   engine + the full measured dispersion band — the DEFENSIBLE edge, not the
   model centre; in-band lines are held ("spend capital elsewhere"); unmapped
   lines become clarification asks, never invented targets. UI table with a
   copy-as-supplier-sheet action; sixth slide in the negotiation pack.
   Execution stays with the buyer by design.
3. **What-if cockpit**: live volume/region/spec re-runs through the EXISTING
   /api/should-cost endpoint (no new surface), sequence-guarded so the number
   shown always matches the controls shown; labelled as-specified only — the
   full waterfall recomputes on rebuild.
4. **Assemblies in batch triage**: a STEP with an assembly warning decomposes
   into child solids, each costed on bulk volume × density with the process
   step honestly skipped ("no wall/DFM measurement at child level").

## 55. Prism assembles: a measured product tree, a CONFIRMED BOM, three levels

**Date**: 2026-08-25
**Status**: Accepted

**Context**: Prism was single-part. An 800V EDU uploaded to the wizard was
costed as one 40 kg body — confidently wrong, which is the failure mode this
tool exists to refuse. The decomposition engine and the generation pipeline
both existed; nothing joined them.

**Decision**:
1. **Suggestions stay suggestions.** `EDU_PART_HINTS` maps CAD product-tree
   names to a subassembly, material and process — as DATA, each hint carrying
   the token it matched and why. No cost is computed until the engineer
   confirms every row. Geometry cannot tell you a solid is a rotor shaft;
   naming conventions can suggest it and a human decides.
2. **Bought parts are named, not mis-costed.** Bearings, resolvers, power
   modules and fasteners are recognised and routed to a user-entered price;
   the engine never should-costs them from geometry.
3. **A roll-up discloses what it left out.** `rollUpBom` reports `costedPct`
   and every uncosted row BY NAME, and its caveat says the total is a FLOOR.
   A roll-up that silently omits a third of the BOM is a lie with a total on
   it. Evidence at part level states which rows have no engine figure so an
   idea touching them must call its saving unpriced.
4. **Three levels, three lenses.** Assembly (architecture, part-count),
   Subassembly (cost blocks), Part (line-by-line) each generate from their own
   evidence slice, in cost-share order, and stamp the matching `systemLevel`.
5. **The EDU catalogue is real or it is absent.** NdFeB and ferrite magnets,
   enamelled winding wire, NO20 thin-gauge core steel and impregnation resin
   joined MATERIALS; hairpin winding, coil winding, magnet production and VPI
   joined PROCESSES — each with a carbon factor and each declared
   geometrically unjudged in `NO_DFM_REASON` rather than borrowing a
   neighbour's rules. Magnets join glass as an honest DFM dead end.

**Consequences**: a 200k/yr 800V EDU BOM rolls up to ~€487 ex-inverter with
the rotor block at 62% and magnets alone 44% of the motor — the cost-share
ordering that tells a director where to spend engineering time.

## 56. The deep library: 411 ideas that fill measured gaps, seeded unverified

**Date**: 2026-08-26
**Status**: Accepted

**Context**: A request to add 400 deeply technical marketplace ideas without
duplicating the existing 1,632. An audit of the corpus first, because
"generate 400 more" without measuring what is already there produces
restatement:
  * levels: 708 part, 267 system, **0 assembly, 0 subassembly**
  * only 497 of 975 rich entries named a specific material grade
  * Powertrain ICE/hybrid held 3 ideas; thermal 57, NVH 23, electrical 77
    against Body 276 / Chassis 280 / EDU 349

**Decision**:
1. **Slots come from the gaps.** 30 (commodity × level) slots weighted to the
   holes, two passes each, so the pack is 140 assembly / 173 subassembly /
   98 part across 27 commodities — the levels the library never had.
2. **De-duplication is mechanical, not promised.** Each slot receives up to 45
   nearest existing titles plus everything generated earlier in the run as an
   explicit do-not-duplicate list; every candidate is then checked by
   normalised title and Jaccard token overlap (>= 0.6) against all 1,632
   corpus titles and the run's own output. `tests/marketplace-deep-library.test.mjs`
   re-runs that check over every pack in CI.
3. **An enrichment pass raises what falls short.** 332 entries lacking a named
   grade or a benchmark were rewritten to name exact grades, specs and process
   parameters. Result: materialGrade filled on 77%, median technical
   description 786 characters against the corpus's 644.
4. **Benchmarks stayed honest, and that shows in the numbers.** Instructed
   never to invent a programme, the generator produced mostly technology-level
   references ("established practice in X, no specific programme") and named
   an OEM only where confident. That reads as *worse* coverage than the
   existing corpus's 786/975 OEM-named entries — but those were themselves
   AI-asserted and never verified. Fewer confident claims is the improvement,
   not the regression.
5. **Seeded verified: 0, stars: 0, confidenceLevel estimated, evidenceSources
   empty.** These are AI-generated and engine-uncheckable at library level;
   the UI's provenance badges must label them as such. A test pins it.

## 57. The 800V battery library: 200 ideas where the benchmark anchor is the contract

**Date**: 2026-08-26

**Context**: A commissioned deep-research request: 200 cost-reduction ideas for
800V BEV battery systems at exactly 60 assembly / 80 subassembly / 60 part,
each idea explicitly anchored to a real benchmark platform (BYD Blade/CTB,
CATL Qilin, Tesla 4680, BMW Gen6, Zeekr Golden Battery, GM Ultium, Lucid,
XPeng SEPA 2.0, Rivian, NIO, Taycan, Audi PPE, Mercedes EVA2), alongside a
benchmarking report. The fast-moving platform facts were web-verified at
generation time (Zeekr 001's move to ~900V/12C, NIO's discontinued 150 kWh
semi-solid pack, GM's LFP→LMR pivot, BNEF Dec-2025 regional $/kWh) and baked
into the generation prompts as a fact block with an explicit "never cite a
figure not in this block unless you genuinely know it" rule.

**Decision**:
1. **The anchor is mandatory, structured, and pinned.** Every idea carries
   `benchmarkAnchor {platform, borrowedFeature, difference}` — which platform
   inspired it, what feature is borrowed, how the idea differs. The harness
   rejects unanchored candidates mechanically, and
   `tests/marketplace-battery-800v.test.mjs` pins 100% coverage plus the
   rendered "Inspired by / benchmarked against:" stamp in `benchmarkReference`.
   An idea with no benchmark lineage has no place in this pack.
2. **Exact counts are pinned, not approximate.** 200 total, 60/80/60 by level —
   `assert.equal`, not `>=` — because the commission specified them exactly.
3. **Corpus-wide dedup found real duplicates and they were REPLACED, not
   reworded.** The CI sweep (normalised title + Jaccard >= 0.6 against all
   ~2,040 existing titles) caught two ideas that restated existing library
   levers (cure-in-place TIM, aerogel-mica zoning). Both were replaced with
   genuinely different ideas (spacer-bead bond-line control; closed-loop
   regrind quota) rather than retitled — a rewording of an existing idea is a
   failure, per the generation contract.
4. **Provenance is honest about a mixed generation path.** 147 ideas came from
   the API harness; the account's credit balance ran out mid-run and the
   remaining 53 were authored directly to the same schema and bar, then passed
   through the same mechanical dedup and depth audits. All 200 are seeded
   `verified: 0, stars: 0, confidenceLevel: estimated, evidenceSources: []` —
   AI-generated and engine-uncheckable at library level, whatever produced
   them — and the test pins that honesty.
5. **Systems map onto existing commodity labels** (Battery Pack, Battery
   Cells, Battery Modules, Pack Thermal Management, HV Distribution, Battery
   Management System, Pack Safety & Protection, Battery Pack Assembly,
   Battery Pack Structure) so the new entries join existing filters instead of
   forking new ones; the finer `focusArea` provenance lives in `ideaData`.

## 58. Marketplace PDF export: the judgements live in a tested core

**Date**: 2026-08-26

**Context**: The marketplace held 2,243 ideas viewable only in the UI; users
asked for PDF export. Two scopes shipped: a single-idea detail sheet, and the
current filtered selection as a catalogue.

**Decision**:
1. **Renderer draws, core decides.** `src/services/marketplace-report.mjs`
   (with `.d.mts`) owns everything that can be WRONG — provenance wording,
   which sections an entry gets, the benchmark line, the filter description —
   and `tests/marketplace-report.test.mjs` pins it. `export-service.ts` only
   draws. Same pattern as report-core.mjs, for the same audit-born reason.
2. **Provenance prints before content.** An idea with `verified=0` exports
   under "UNVERIFIED — AI-generated…; savings estimated, not engine-checked";
   even a verified idea's label says its savings remain estimates (review
   approval is not engineering validation). A test pins that an unverified
   idea can never carry a verified-sounding label.
3. **Sections render only when the field exists** — legacy entries without
   `ideaData` fall back to the flat description under a single honest heading;
   no headings over empty space, no substituted defaults.
4. **The catalogue cover names its own filter**: every active filter, the
   count, and the verified/unverified split. An export that hides what
   produced it is a lie with a page count on it.

## 59. Horizon Phase 1: currency is a property, not an assumption

**Date**: 2026-08-27

**Context**: The Phase 0 review drove ten subjects through the live predict
endpoint. The deterministic engine made no errors across 290 cards — but all
NINE commodity lenses answered entirely from the curated file without ever
consulting the world, because `shouldResearch()` asked "are there enough
cards?" and never "are they still true?". Meanwhile the file's median cited
evidence ran to 2020 in BIW, 2019 in Exterior and Powertrain. The tool was
treating COVERAGE as if it were CURRENCY, and nothing on screen said otherwise.

**Decision**:
1. **Currency is computed for every entry, in one place.** `evidenceYear`,
   `currencyTier`, `currencyOf` and `landscapeCurrency` live in `foresight.mjs`
   and `foresight-audit.mjs` now imports them instead of keeping its own copy —
   a test asserts the two agree on the count, because a second private
   definition of "stale" is how a product starts contradicting itself.
2. **Three states, never two.** `fresh` / `stale` / `undated`. An entry that
   cites no year is NOT fresh; absent evidence cannot borrow confidence from
   silence. The UI, the PDF and the trigger all keep the distinction.
3. **A future year is not evidence.** Self-check during the build caught an
   unproduced LMR entry scoring `evidenceYear 2028` off its own note and
   reading as fresher than a shipping technology. Years are only evidence once
   they have happened; `lastVerified` is the one field trusted as written.
4. **Research fires on staleness, not only thinness.**
   `RESEARCH_TRIGGER.maxNotFreshShare = 0.5` with a new reason,
   `stale-register-coverage`. The threshold is a stated majority argued from
   the principle — a landscape whose evidence is more than half unconfirmed
   should not be served as settled fact — not a number tuned to a pleasing
   result. Measured effect: 7 of 9 commodity lenses now reach for live
   research; Battery and EDU (median evidence 2025) correctly do not, so the
   fix does not spend money where curation is already good. Currency is judged
   on EXACT cards only: landscape padding answers a broader question than the
   user asked and must not vote on whether their answer is current.
5. **`lastVerified` / `evidenceUrl` are only ever set on a REAL re-check.**
   Four entries were stamped from web research actually run this session
   (semi-solid, LMR, 46xx, ultra-fast LFP) — and that verification improved the
   content, which is the point: it surfaced that NIO's 150 kWh semi-solid pack
   was series-built and then discontinued, a materially important fact the
   entry had missed. The other 176 entries are deliberately left unstamped
   rather than backfilled with today's date. A fabricated verification date
   would be the exact dishonesty this feature exists to remove.
6. **The ratchet is set at measured reality, not at an aspiration.**
   `tests/foresight-currency.test.mjs` caps the register's not-fresh share at
   72% — because the measured value is **71.1%** (52 fresh / 69 stale / 59
   undated of 180). That number is uncomfortable and it is the debt this
   feature exists to pay down; Phase 4 re-curation moves it. The gate may only
   ever be lowered.
7. **The debt gate moved from 119 to 120 flagged entries, and that is an
   improvement.** One entry stopped borrowing freshness from a future year.
   A gate must move when the measurement gets more honest — never because
   someone wanted a green build.

## 60. Horizon Phase 2: the research layer finally opens the page

**Date**: 2026-08-27

**Context**: Phase 0 found the forward-research layer had a ceiling no prompt
could lift — it reasoned over SEARCH SNIPPETS, roughly 200 characters of blurb
chosen by a search engine. You cannot get "0.15 mm at 960 MPa" or a €/unit out
of a snippet, so the output was structurally condemned to be generic. The tool
had never once opened a source.

**Decision**:
1. **`foresight-fetch.mjs` opens the page.** Dependency-injected `fetchImpl`
   (the component-pricing / patent-search pattern) so the whole path tests
   offline. Safety is part of the contract because these URLs come from
   strangers: http(s) only, no private/loopback/link-local hosts, a byte cap
   enforced WHILE STREAMING so a hostile response cannot exhaust memory before
   the check runs, a per-request timeout, and content-type filtering. Every
   failure returns `{ ok: false, error }` — a page that could not be read must
   never reach the model looking like a page that said nothing.
2. **Quote-or-drop.** Citing a URL only proves the model saw a link. Each
   candidate must now supply a VERBATIM quote, and where we actually opened the
   page, `quoteSupported()` checks the sentence is really printed there —
   normalised for punctuation drift, requiring a substantial contiguous run.
   Unsupported candidates die in code, not in the reader's judgement. The check
   applies ONLY to pages we read: demanding a verbatim quote from a page nobody
   opened would punish the model for our retrieval failure.
3. **Recency dominates source ranking, and undated is not recent.** An undated
   page scores below anything dated within the horizon. Assuming freshness is
   precisely how 2016 content got presented as the frontier.
4. **Honest failure when no provider is configured.** Without a search key the
   helper falls back to an instant-answer API returning encyclopedia summaries;
   the output now says so in `evidenceGaps` and in the UI instead of degrading
   silently. The UI also states how many sources were opened versus seen as
   snippets, per candidate and in aggregate.
5. **Two bugs the first live run found, which no unit test would have.**
   (a) Sources were never de-duplicated by URL, so one supplier page filled all
   six read slots and a genuinely relevant 2025 paper was never opened.
   (b) `positionCandidates()` rebuilt candidates into a fixed shape and silently
   dropped `sourceQuote`, `sourceRead` and `quantitativeSpec` — the UI would
   have shown every candidate as snippet-only with no quote. Both fixed and
   pinned by tests. Live runs keep earning their place.
6. **Proven with a real model; the internet half is proven by script.** This
   container's network policy blocks outbound page fetches, so Phase 2 was
   verified here with a live Anthropic model reading realistic pages injected at
   the fetch boundary — which produced candidates carrying verified quotes and
   hard figures ("0.15 mm at 960 MPa", "30% lower saturation flux density").
   `npm run horizon:live "<subject>"` runs the same path against the real web
   for anyone with outbound access and a search key, printing which pages were
   opened and which quotes were checked.

## 61. Horizon Phase 3: the answer and the landscape are different things

**Date**: 2026-08-27

**Context**: Phase 0 measured "stator lamination" returning 16 cards of which
3 were about laminations, and "HV busbar" returning 29 of which 4 were about
busbars — roughly 85% of each answer was other people's parts, presented with
the same confidence as the answer. The exported PDF's prediction board for a
lamination query opened with SiC power stages and multi-speed transmissions,
and its cover said "16 TECHNOLOGIES".

**Decision**:
1. **CORRECTED SAME DAY — breadth was never the problem, and capping it was a
   mistake.** The first cut of this phase bounded widening (stator lamination
   16 → 6 cards, HV busbar 29 → 5) and the user rejected it immediately and
   correctly: "I want all the technologies available." Two problems had been
   conflated — that widened entries were MISLABELLED as answers, and how MANY
   of them there were. Only the first was a defect, and points 3–5 below fix it
   completely. Capping merely deleted technologies a cost engineer browsing a
   commodity legitimately wants to see. Every applicable entry is offered
   again; `tests/foresight-scope.test.mjs` now asserts the WHOLE applicable
   commodity appears, so a future cap fails the build.
   The lesson worth keeping: when a labelling defect and a volume complaint
   arrive together, fix the labelling and leave the volume alone.
2. **What survived the correction is ORDER, not truncation.** The landscape
   arrives momentum-ranked, so the most consequential context reads first
   instead of whatever the register happened to list first. (The intermediate
   capped version also taught something worth recording: capping on card count
   alone starved the future lane, and the coverage gate caught 15 of 291 BOM
   leaves losing it — evidence that the floor's real condition is "a landscape
   with a future in it", not a card count.)
3. **The shape of the answer is stated, not implied.** `exactCount`,
   `relatedCount` and `answerShape` ('empty' / 'exact' / 'landscape-only' /
   'exact-plus-landscape') travel with every result. The page says "3
   technologies match 'stator lamination' directly; the other 3 are the
   surrounding commodity landscape", and a landscape-only answer says outright
   that nothing matched the part.
4. **Separation is structural, not a chip.** Lanes count "3 matching · 2
   landscape" rather than "5 technologies", and a labelled divider —
   "commodity landscape — not your part" — precedes the first widened card in
   each lane. Exact-before-related ordering within a lane is pinned by a test,
   because the divider depends on it holding.
5. **The PDF cover counts the ANSWER** (while still showing every card). The headline metric is MATCHING, with
   a SCOPE line naming the landscape separately; prediction-board rows for
   widened entries are dimmed, marked with a leading ·, and explained in the
   legend. (The first render truncated the scope line mid-word — "marked
   LANDS…" — and was shortened; terse beats truncated.)

## 62. Deep Research: the loop, and what five live runs cost to get right

**Date**: 2026-08-27

**Context**: The ask was PhD-level research — search widely, verify, then
report. Horizon's Phase 2 path did one search plan, one read, one synthesis: a
good briefing, not a literature review. With no access to paid engineering
databases, patents had to carry the weight peer review normally would.

**Decision**:
1. **The loop is what makes it research.** scope → sweep → read → gap-detect →
   repeat, bounded, stopping early when every question is answered.
2. **Patents are a first-class evidence class** (`foresight-patents.mjs`):
   claim-section isolation, deterministic parameter extraction, filing
   profiles. Its own smoke test found that `%\b` can never match, so every
   percentage in every document had been silently dropped.
3. **Contradictions are surfaced, never resolved.** Detected in code, because a
   model asked to synthesise will quietly pick one figure and the disagreement
   disappears.
4. **Corroboration counts distinct ORIGINS**, so twenty rewrites of one press
   release are one source.
5. **Nothing reaches the register without earning it**: a figure plus either two
   independent origins or a patent claim, carrying `lastVerified`/`evidenceUrl`.

**What the five live runs found that fixtures never would.** Every one of these
passed a green test suite before the live run and was wrong anyway:

- **Claim matching was defeated by paraphrase.** Comparison keyed on the
  model's own `metric`/`subject` STRINGS. Three sources reporting one
  measurement wrote "lamination thickness"/"Xiaomi V8s EVO",
  "thickness"/"Xiaomi V8s EVO motor", "gauge"/"Xiaomi V8s EVO stack" — so
  contradiction detection found nothing and every claim read as single-origin.
  Both honesty mechanisms were doing nothing on real output. Matching now keys
  on the UNIT in the value (which does not vary with phrasing) plus subject
  token overlap.
- **A generic unit is not a metric.** That fix then produced a FALSE
  contradiction by comparing "5-8%" (loss reduction) with "99.2%" (peak
  efficiency) because both were percentages of the same subject. Dimensionless
  units now additionally require metric agreement.
- **Relative spread is wrong for efficiency.** 99.2% vs 98.4% is 0.8%
  relatively and slips under any tolerance, yet describes DOUBLE the losses.
  Percentages above 90 are compared on their complement — with a 0.2pp floor,
  or one decimal place of reporting precision becomes a "disagreement".
- **A forced tool call can arrive EMPTY.** The scope step truncated on three of
  five subjects at 2000 tokens, and an empty tool input reads downstream as
  "the model had nothing to say" — the most misleading failure there is.
  Budgets raised, one retry added, and the error message now names the cause.
- **A schema is a request, not a guarantee.** Both `questions` and
  `unanswered` came back as non-arrays on live runs, one of which killed a run
  mid-loop. Both are normalised defensively now.

The lesson is the one this codebase keeps relearning: a green suite proves the
code does what its author imagined, and only a live run proves it does what the
job needs.
