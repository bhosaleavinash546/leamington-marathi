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
