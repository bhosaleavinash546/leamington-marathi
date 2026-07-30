# PASS 1 — Ground truth against दाते पंचांग: **BLOCKED**

## Prerequisite not satisfied

AUDIT.md §0: *"You need physical or scanned दाते पंचांग for the years you will
test. Without it, Passes 1–2 cannot run and every 'verified correct' finding will
be fabricated."*

No almanac is available to this session. `tests/golden/cases.yaml` holds 62
scaffolded cases and **every `expected` block is empty**; `docs/GOLDEN_FILES.md`
states 0 of 62 transcribed. Confirmed:

```
$ python -m tools.golden_verify --pending-only
authority: दाते पंचांग (Date Panchang)
cases selected: 62   transcribed: 0   pending: 62
```

**Therefore §3.2 (reference place), §3.3 (delta table) and §3.4 (the twelve
pathological cases) cannot run, and no delta table appears in this file.** There
is no minute-level evidence in this audit that any panchang value is right or
wrong against the named authority. Any statement to the contrary would be
invented.

`audit/01-reference-place.md` is likewise not produced: the almanac's stated
reference city and whether its printed times need sthanik correction can only be
read from the almanac's own front matter.

## What §3.1 *could* be checked without the almanac, and was

§3.1 exists to catch one catastrophic error: a `lahiri` flag that is really True
Chitra, or a stale epoch. That half is verifiable without the almanac, because the
Chitrapaksha definition is independent of any publisher — it places Spica (Chitra)
at exactly 180° sidereal.

Method: compute `tropical_lon(Spica) − 180` with `swe.fixstar2_ut` and compare
against the engine's `lahiri` and `true_chitra` values.

| Epoch | engine `lahiri` | Spica − 180° (= true Chitra by definition) | Δ | engine `true_chitra` | Δ vs TC |
|---|---|---|---|---|---|
| 1900 | 22.465373° | 22.449597° | +56.8″ | 22.449597° | +56.8″ |
| 1956 | 23.247366° | 23.230790° | +59.7″ | 23.230790° | +59.7″ |
| 1990 | 23.720696° | 23.703747° | +61.0″ | 23.703747° | +61.0″ |
| 2024 | 24.190855° | 24.173430° | +62.7″ | 24.173430° | +62.7″ |
| 2026 | 24.221810° | 24.204412° | +62.6″ | 24.204412° | +62.6″ |

Two results:

1. **The flag is genuinely Lahiri.** It sits 57–63″ from true Chitra and does not
   track it. The catastrophic substitution §3.1 warns about is **not present**.
2. The engine's `true_chitra` mode reproduces the Spica-at-180° definition to the
   last printed decimal, which validates the check itself rather than merely
   asserting it.

**The audit does not stop here.** §3.1's stop condition is a mismatch against the
*almanac's printed* ayanamsa, which remains unmeasured.

## The risk that assumption carries — quantified

Everything downstream rests on D2/D3: that दाते पंचांग is Lahiri-based. CLAUDE.md
§2.3 marks that `[Likely]`; `docs/DECISIONS.md` D2 asserts it; **neither verified
it from the almanac's front matter.** Measured cost of being wrong (Pune,
1990-06-15 14:32, `lahiri` → `true_chitra`):

| Quantity | Change | Against the ±1 min tolerance |
|---|---|---|
| tithi end | **0.00 s** (exact) | — elongation is ayanamsa-invariant |
| karana end | **0.00 s** (exact) | — same reason |
| sunrise / sunset | **0.00 s** | — altitude is not a sidereal quantity |
| nakshatra end | −1.39 min | **FAIL** |
| yoga end | −2.56 min | **FAIL** |
| lagna | 6° → 6°, 27.8166° → 27.8294° | within sign |
| first mahadasha balance | 0.024707 y → 0.007406 y (−70%) | — |
| every mahadasha start date | **−6.32 days** | — |

So the single unverified root assumption is worth ~1 arcminute, which breaks the
audit's own tolerance on two of the five limbs and moves every dasha date by six
days. Recorded as **F-008**, and it is the highest-blast-radius open item in the
register — ahead of the sunrise convention, because the sunrise question at least
leaves tithi and karana untouched while this one does not.

## What to do first when the almanac arrives

1. Compare the almanac's printed ayanamsa for one year against `lahiri`. Settle
   F-008 before touching anything else.
2. Read the front matter for the reference city and whether sthanik correction is
   applied to printed times; write `audit/01-reference-place.md`.
3. Then transcribe, in this order, because each isolates one free parameter:
   sunrise (settles O1 *and* F-007 together — the two are confounded and worth
   3m50s and 3m51s respectively, so a single sunrise comparison cannot separate
   them unless the almanac's own elevation policy is known); a pre-1955 Mumbai
   birth (settles F-004); one printed mahadasha start (settles O2); one Rahu Kaal
   per weekday (settles O3).
