# FINDINGS

22 findings. The audit itself was read-only per AUDIT.md §0 rule 1; remediation
began only after the register was approved, and each fix is recorded against its
finding below.

Passes 1 §3.2–3.5 are **BLOCKED** — no दाते पंचांग. No finding below claims a
panchang value is wrong against the authority, because no such comparison was
possible.

| Sev | Count | Fixed |
|---|---|---|
| S1 | 3 | 2 — F-001, F-002 |
| S2 | 6 | 2 — F-005, F-006 |
| S3 | 7 | — |
| S4 | 6 | 1 — F-021, as part of F-001 |

**Fixed so far:** F-001, F-002, F-021 (one root cause, `docs/DECISIONS.md` D18)
and F-005, F-006. Before/after values are recorded there and in the commit
message, per CLAUDE.md 11. Everything else below stands unfixed.

---

## S1 — blocks release

### F-001 · determinism · `core/doshas/computed.py:194–232` · **FIXED**

**Expected** Sade Sati exit and phase-start are properties of Saturn's transit;
asking twice returns the same instant.
**Actual** 38.67 s spread across a 30-day sweep of `now`; the printed minute
flips between `23:57` and `23:58` for one unchanging chart.
**Evidence** 103 samples, `now` swept over a full grid period. A 2-minute shift
alone moved `exit_utc` by 1.35 s.
**Root cause** `_saturn_crossing` phases its 30-day bracket grid on
`jd_from_utc(after)`, and `_bisect_saturn` stops at a `1/1440`-day bracket and
returns its **midpoint** — so the answer is a function of when you asked.
**Fix** Snap the search grid to a fixed epoch, and tighten bisection to an
absolute tolerance far below display resolution. Do not merely round the output;
rounding hides the wobble at 29.5 s and re-exposes it at 30.5 s.
**Test** Sweep `now` over 30 days and assert a single distinct `exit_utc`.
**Outcome** Fixed under D18, though not by the route recommended above. Grid
snapping was dropped in favour of *converging* — tolerance 1/1440 d → 1e-7 d — so
the returned instant is the root rather than a bracket midpoint, which removes the
grid dependence at its source instead of stabilising it. Rounding to the second was
then added on top, which the recommendation warned against on its own; converging
first is what makes it safe, and the residual case (a true crossing within ~9 ms of
a half-second) is a 1-second ambiguity roughly once in 50,000 charts against
38.67 s always. Result: 45 distinct values spanning 38.67 s → **one** value; worst
residual 0.077610″ → 0.000974″. **Neither published date moved.**

### F-002 · trust · consequence of F-001 · **FIXED**

**Expected** Identical charts do not produce drifting text (CLAUDE.md §6).
**Actual** The `doshas` section cache key changes on every request, so the
Marathi Sade Sati paragraph is regenerated each time.
**Evidence** Same birth, 2 minutes apart → **2 LLM calls**, two different texts.
Five other sections held their key; only `doshas` moved.
**Root cause** The cache is correctly keyed on `hash(projected facts + section +
locale + prompt_version + validator_version)`. The *facts* are unstable (F-001).
**Fix** F-001. AUDIT §8's suggested remedy — add caching — does not apply; the
cache exists and works.
**Test** Generate the `doshas` section twice with `now` 2 minutes apart; assert
one LLM call.
**Outcome** Fixed by F-001. 2 LLM calls → 1; all six sections now hold their
cache key across a 2-minute gap, asserted.

### F-003 · rule-fidelity + internal inconsistency · `core/chart/dignity.py:157`

**Expected** Moon in Vrishabha 4°–30° is **मूलत्रिकोण**; exaltation is Vrishabha 3°.
Mercury beyond Kanya 20° is **own sign**.
**Actual** Both report `exalted`. Reproduced on a real chart: 1990-01-08, Moon at
Vrishabha 15.02° → `exalted`.
**Evidence** `positional_dignity` tests `rashi == exalt_rashi` — whole sign — before
moolatrikona. Consequence: the engine's **own** `MOOLATRIKONA` rows for the Moon
and Mercury are unreachable dead code. Verified by sampling each declared arc: 5 of
7 grahas reach `moolatrikona`, Moon and Mercury never do.
**Root cause** Exact exaltation degrees are stored and used for Uchcha bala, but
the dignity *label* ignores them.
**Blast radius** The Moon occupies Vrishabha 4–30 in roughly 7% of charts; every
one shows a wrong dignity in ChartFacts, the UI, the PDF, and any narrative
citing it. Whole-sign exaltation is defensible as practice — shipping an
unreachable moolatrikona table is not, under any school.
**Fix** Decide the school explicitly and record it in `DECISIONS.md`. If
whole-sign, delete the Moon/Mercury moolatrikona rows and say why. If degree-based,
order the tests exaltation-degree → moolatrikona → own sign.
**Test** Assert every declared moolatrikona arc yields `moolatrikona` for all
seven grahas.

---

## S2 — fix before launch

### F-004 · timezone · `core/timeutil.py:143–157`

**Expected** A 1948 Mumbai birth recorded in local clock time resolves at Bombay
Time, ≈UTC+04:51 (AUDIT §3.4 case 5).
**Actual** `Asia/Kolkata` returns **+05:30** for 1948-01-30. Bombay Time persisted
in Bombay until 1955; tzdata has no zone for it — only `Asia/Calcutta` and
`Asia/Kolkata` exist, both Calcutta-based and +05:30 after 1906.
**Evidence** Enumerated tzdata transitions: LMT/MMT +5:21:10 → 1906 IST +5:30 →
wartime +6:30 (1941-10-01→1942-05-15, 1942-09-01→1945-10-15) → +5:30. **No +4:51
anywhere.** Wartime DST is therefore correct; Bombay Time is not reachable.
**Impact** 39 minutes. Near a cusp that moves the lagna a full sign, and with it
every house placement.
**Root cause** CLAUDE.md §4.1's premise — that `zoneinfo` with `Asia/Kolkata`
"handles documented transitions" — is false for Bombay, and neither the docs nor
the API say so. `TimeStandard.LMT` *is* the correct escape hatch (Mumbai LMT
= +4:51:30, within 10 s of Bombay Time), but nothing routes a user to it.
**Fix** Warn when `date < 1955`, place is west India, and
`time_standard == clock_time_as_recorded`; name LMT as the alternative. Correct
the §4.1 claim in the docs.
**Test** Golden case: Mumbai 1948, both standards, assert the 39-minute gap and
that the warning fires.

### F-005 · language · `web/components/FindingsList.tsx:37`, `render/pdf.py:449` · **FIXED**

**Expected** All three locales first-class; no English-only screens (N5).
**Actual** **29 of 33** chart-yoga/dosha rule keys render as raw Latin
snake_case: `gajakesari`, `amala_yoga`, `vakri_bala_vriddhi`,
`kemadruma_bhanga_kendra_jupiter`, `raja_yoga_kendra_trikona_10_5`, …
**Evidence** Both surfaces resolve names against the `milan` namespace.
`locales/*/yoga.json` holds the 27 *nitya* panchang yogas; its intersection with
the rule keys is **empty**. §7's required `common` and `dosha` namespaces do not
exist. Only 4 keys resolve, and only because they sit in `milan.json`.
**Impact** The app's most visible interpretive output is in English machine keys
on screen and on the printed patrika. This is the ten-second credibility failure.
**Fix** Add a `combination` (chart-yoga) namespace and a `dosha` namespace in all
three locales, keyed to the rule keys; point both call sites at them.
**Test** Assert every key in `core/rules/data/*.yaml` has a term in every locale.
**Outcome** Fixed. Added `combination` (chart yogas), `dosha` and `common`
namespaces in all three locales — 36 keys × 3, plus the strength bands, which were
also rendering raw in English. Dosha names moved out of `milan` so each concept has
one home. Both call sites now use one resolver, `api.locale.finding_label`.
**Marathi terms are drafted, not yet reviewed by a native speaker** — see the
review table in the commit message.

### F-006 · gate gap · `tools/locale_audit.py` · **FIXED**

**Expected** The locale gate catches a missing user-visible term.
**Actual** It passed clean while F-005 was live.
**Root cause** It checks cross-locale parity and mr≠hi divergence only — never
that an engine-emitted key has a term, nor §7's required namespace list.
**Fix** Add both checks to `audit()`.
**Test** The assertion in F-005 *is* the test; wire it into the gate.
**Outcome** Fixed. `audit_rule_key_coverage()` compares against what the engine
emits (36 keys, including the three computed outside the YAML) rather than locales
against each other; `REQUIRED_NAMESPACES` checks CLAUDE.md 7's list. Verified by
replaying the pre-fix locale state: 36 problems, build would have failed.
Known-divergent pairs 23 → 35.

### F-007 · convention, undocumented · `core/ephemeris/swisseph_adapter.py:252`

**Expected** Either `elevation_m` affects rise/set, or it is documented as inert.
**Actual** Accepted, range-validated (−500..9000), echoed into ChartFacts, passed
to `swe.rise_trans` — and has **no effect**: 0 m / 560 m / 1000 m give Pune
sunrise identical to 40 ns.
**Evidence** `swe.rise_trans` ignores observer height for horizon dip;
`rise_trans_true_hor` with `horhgt` is what applies it. Measured with the correct
call: Pune's 45.55′ dip moves sunrise **231 s (3.85 min) earlier**.
**Impact** Comparable to the entire disc/refraction spread already flagged as O1,
and confounded with it — one sunrise comparison against the almanac cannot
separate the two unless the almanac's elevation policy is known.
`DECISIONS.md` D6 does not mention elevation at all.
**Fix** Decide and document. Ignoring elevation is probably right for matching a
plains almanac — but say so, and stop threading a parameter that does nothing.
**Test** Assert sunrise is invariant under elevation, with the reason.

### F-008 · root assumption unverified · `docs/DECISIONS.md` D2/D3

**Expected** The authority's ayanamsa read from its own front matter (AUDIT §3).
**Actual** Asserted, never verified. CLAUDE.md §2.3 marks it `[Likely]`.
**Evidence** The flag *is* genuinely Lahiri (57–63″ from true Chitra — the
catastrophic substitution is absent). But if the almanac is True Chitra:
nakshatra end −1.39 min, yoga end −2.56 min (**both beyond ±1 min**), every
mahadasha start **−6.32 days**, first-dasha balance −70%. Tithi, karana, sunrise
unaffected (ayanamsa cancels in the elongation).
**Impact** Highest blast radius in the register — ahead of O1, which at least
leaves tithi and karana untouched.
**Fix** Read the almanac's front matter. Nothing else should be tuned first.

### F-009 · rule-fidelity · `core/milan/ashtakoot.py:432`, `470`

**Expected** The Nadi exception is "same nakshatra but **different padas**".
**Actual** Fires on shared nakshatra alone, so it cancels Nadi dosha even when the
padas are identical — the strongest form of the dosha, not a cancelled one.
**Evidence** `compute_milan` has no pada parameter. Identical Ashwini both sides:
nadi 0/8, `nadi_exception_same_nakshatra` **fired**. The engine does compute pada
(`PointDetail.pada`); it simply is not threaded through.
**Fix** Add bride/groom pada parameters and gate the exception on inequality.
**Test** Same nakshatra, same pada → no exception; different pada → exception.

---

## S3 — Marathi credibility

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| F-010 | ग्रहस्पष्ट printed in **decimal degrees** (`मिथुन 0.28°`), which AUDIT §6 calls "a dead giveaway" | `render/pdf.py:353` | use `core/angles.py:format_dms`, already written and unused here → `मि. ०°१७′` |
| F-011 | **Zero** Devanagari numerals in the `mr`/`hi` PDF | 428 Latin digits, 0 Devanagari | port `web/lib/format.ts:toDevanagariNumerals` into `render/pdf.py` |
| F-012 | दिनमान / रात्रीमान absent from ChartFacts and the sheet | derivable from sunrise/sunset but never printed | emit both, in ghati–pala |
| F-013 | Namakaran **and** numerology computed, then discarded | `FullReading.namakaran` fully populated; absent from ChartFacts, UI, PDF | emit them; CLAUDE.md §3.6's two substantive uses of `name` are currently dead |
| F-014 | Doctrinal provenance reaches the user as **one English sentence in a collapsed `<details>`** | no locale contains शास्त्र/परंपरा/लोकमत as provenance vocabulary | add a translated provenance label per rule; surface it uncollapsed for `strength: weak` rules |
| F-015 | Disclaimer in a page-bottom `<footer>`, `--muted`, 0.85rem — the exact placement AUDIT §7 names as failing | the code comment quotes "do not bury it" immediately above the `<footer>` | move above the fold on birth-input and result screens |
| F-016 | Kaal Sarpa reported only as a **dosha**; yoga/dosha never distinguished | `detail.arc` already records `rahu_to_ketu` vs `ketu_to_rahu`, the datum needed | label both readings, or state in `DIVERGENCES.md` that the distinction is refused as school-dependent |

---

## S4 — polish

| ID | Finding | Location |
|---|---|---|
| F-017 | Docstring says precedence is "exaltation, then moolatrikona, then own sign, then debilitation"; code order is exaltation, **debilitation**, moolatrikona, own sign | `core/chart/dignity.py:148` |
| F-018 | Docstring table says `120–150 → 60 flat`; code ramps 45→60 | `core/chart/aspects.py:88` |
| F-019 | Hand-rolled shortest-separation instead of `core.angles.shortest_separation` (numerically equivalent; duplication) | `core/chart/dignity.py:207` |
| F-020 | Raw `% 360.0` rather than `norm360()`, against §4.7's "one wrapper" | `core/timeutil.py:183,188` |
| F-021 | ~~Sade Sati times published to **microseconds** though known to ±39 s~~ **FIXED** with F-001 — solved to 1e-7 d, reported at whole seconds | `core/doshas/computed.py` |
| F-022 | Graded drishti piecewise scale carries no citation | `core/chart/aspects.py:88` |

---

## UNVERIFIABLE — what evidence would settle each

| Item | Blocked on |
|---|---|
| Every panchang value vs the authority | दाते पंचांग for the tested years |
| The almanac's reference city and sthanik correction | its front matter |
| Rahu Kaal / Gulika / Yamaganda weekday rows | one printed Rahu Kaal per weekday |
| Dasha year length (O2) | one printed mahadasha start date |
| Graded drishti breakpoints (F-022) | BPHS / Sripati, chapter on drishti |
| Combustion orb citation | BPHS chapter reference for the standard table |
| Marathi number-gender-case agreement in generated prose | a native reader over live model output; this session had no API key |
| Contradiction between narrative sections | live generation across 12 charts |
| Certainty register in output | live generation |

---

## Remediation plan — severity × blast radius

Ordered by what everything else depends on, not by effort. AUDIT §11: *"Ayanamsa
and timezone fixes come first because everything depends on them."*

| # | Finding | Why here |
|---|---|---|
| 1 | **F-008** ayanamsa vs authority | Root of every longitude. Costs one afternoon with the almanac and gates the value of all 62 golden cases |
| 2 | **F-004** Bombay Time | 39 min → a full sign of lagna. Independent of F-008 and equally foundational |
| 3 | **F-007** elevation | 3.85 min, confounded with O1; must be settled *before* transcribing sunrise or the comparison is uninterpretable |
| 4 | **F-001 → F-002** Sade Sati determinism | One root cause, two S1 symptoms, contained to one function |
| 5 | **F-003** dignity labels | 7% of charts, visible in every surface; a school decision plus a reordering |
| 6 | **F-005 + F-006** Marathi terms and the gate that missed them | Highest visible-credibility return per hour in the register |
| 7 | **F-009** Nadi pada | Doctrinal, and the data is already computed |
| 8 | F-013, F-010, F-011, F-012 | Patrika authenticity; all four are wiring, not new computation |
| 9 | F-014, F-015, F-016 | Honesty and framing |
| 10 | F-017 – F-022 | Polish; F-021 alongside F-001 |

Do **not** start fixing until this register is approved. Then, per §0 rule 7 and
§11: failing test → fix the cause → passing test → golden case → report the
numeric before/after with its physical or doctrinal reason.

---

## What the app does well

The deterministic/LLM boundary is real and mechanically enforced — no LLM output
reaches a numeric field, and the numeric-provenance check makes N1 more than an
instruction. The prohibited-content validator blocked 10/10 adversarial
generations in code, in all three locales, and served the correct-locale refusal.
Three unsourced conventions raise rather than guess, and the golden harness
reports 0/62 instead of passing on its own output.
