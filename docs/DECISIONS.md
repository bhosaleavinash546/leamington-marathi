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
