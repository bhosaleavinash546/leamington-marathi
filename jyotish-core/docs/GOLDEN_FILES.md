# Golden panchang files

## Status: 4 of 64 cases transcribed — every transcribed field matches

The owner supplied a scanned **दाते पंचांग शक १९४० (2018-19)**; transcription
has begun (`audit/live/ALMANAC.md` records the method and every page used).
Four cases now carry printed values — 62 pinned fields spanning tithi,
nakshatra, yoga and karana end-times, Mumbai sunrise/sunset, keys, month
naming, an adhika month and a printed अहोरात्र vriddhi — and **all 62 match
the authority**: 59 to the exact printed minute, 3 at ±1 minute (the
authority's drik ganit sits a consistent 30–60 s from Swiss on limb ends, so
instants near a minute boundary legitimately straddle it; tolerance is the
printed minute ±1, the same standard as `tools/settle.py`).

Two harness rules were set with the first real page and are pinned by
`tests/golden/test_loader_semantics.py`: the formatter **rounds** to the
printed minute (दाते prints ०८।५९ for a computed 08:58:57 — truncation would
fake mismatches), and a 2-minute gap is still a failure.

The remaining 60 cases stay PENDING — including `kshaya-2018-12-19`, whose
scan page is too blurred to transcribe honestly (noted in the case), and every
case outside the 2018-19 volume (pre-1955, wartime DST, other years), which
needs its own year's almanac.

```
$ python -m tools.golden_verify
authority: दाते पंचांग (Date Panchang)
cases selected: 64   transcribed: 4   pending: 60
...
every transcribed field matches the authority to the minute
```

## What the suite does check today

Two of the three layers pass, and they are worth having:

1. **Coverage** — 62 cases, and every scenario CLAUDE.md 9.1 names is present.
2. **Computability and tag self-consistency** — every case computes; an
   `adhika_month` case really lands in an adhika month; a `vriddhi_tithi` case
   really shows vriddhi; a `pre_dawn_birth` case really rolls back a Hindu day; a
   `high_latitude` case either computes or raises `CircumpolarError` and never
   fabricates a sunrise. This is a real regression guard on the month-naming and
   anomaly logic that needs no almanac.
3. **Authority agreement** — pending, all 62.

## Coverage matrix

Every scenario CLAUDE.md 9.1 lists, with the cases covering it:

| Scenario | Cases | Notes |
|---|---|---|
| `adhika_month` | 5 | Adhika Jyeshtha 2018, Adhika Ashwina 2020, Adhika Shravana 2023 **plus its nija pair**, Adhika Jyeshtha 2026 |
| `vriddhi_tithi` | 4 | Incl. an Amavasya vriddhi, which also stresses the month boundary |
| `kshaya_tithi` | 4 | Incl. one adjoining Purnima, the likeliest place for an off-by-one |
| `summer_solstice` | 3 | Longest day: kaal parts at their widest |
| `winter_solstice` | 3 | Shortest day: kaal parts at their narrowest |
| `pre_dawn_birth` | 4 | Incl. the spec's own 02:30 example, and a birth *just after* sunrise that must **not** roll |
| `high_latitude` | 3 | Tromsø at midnight sun, polar night, and equinox as the control |
| `pre_1955` | 4 | 1901, 1935 (Bombay Time era), 1948, 1950 |
| `wartime_dst` | 3 | 1943, 1944, and the day after DST ended in 1945 |
| `ordinary` | 29 | Spread across months, pakshas, and ten Maharashtra places |
| `diaspora` | 2 | London, incl. the spring-forward morning and the autumn fold |

The dates for the anomaly cases were found by *searching* with the engine for real
adhika months and vriddhi/kshaya tithis — the engine picks which dates are
interesting, the almanac supplies the values. Those two roles never mix.

## How to transcribe a case

1. Open the दाते पंचांग page for the case's date.
2. Copy its printed **local** times into that case's `expected` block, as `HH:MM`
   strings in the place's own timezone. Do not convert to UTC.
3. Use the engine's identifiers for keys — `tithi_key: panchami`, from
   `core/enums.py`.
4. Record the page in `source:`.
5. Run `python -m tools.golden_verify --case <id>`.

Any field you leave out stays pending. Any field you fill in is asserted to the
minute and will fail the build if the engine disagrees — which is the point.

`tools/golden_verify --show-computed` prints the field shape for a case. It prints
**engine output**, loudly labelled: paste it in unchanged and the golden file would
merely assert that the engine agrees with itself.

## When a transcribed field mismatches

Per CLAUDE.md 11, in this order:

1. **Report the numeric delta.** `golden_verify` prints it in minutes.
2. **Find the physical reason.** Start with `DIVERGENCES.md` O1–O4: the sunrise
   convention alone accounts for up to 3m 50s, and it moves every sunrise-anchored
   value together, so a uniform offset across many fields points straight at it.
3. **Do not move a constant to close the gap** unless you can state the physical
   reason and are prepared to treat it as a major engine version bump.
4. If it is a school difference rather than an error, record it in
   `DIVERGENCES.md` with the delta.
5. Add a golden case for every bug you fix (`python -m tools.golden_add`).

## When a bug has no golden case to add

CLAUDE.md 11 says to add a golden case for every bug fixed. That instruction
assumes the bug is a disagreement with the authority, and not every bug is.

**Audit F-001** (Sade Sati transit instants moving with the caller's clock, fixed
under `DECISIONS.md` D18) had no authority component at all: the printed *date* was
never wrong, and no almanac page could have caught a value that was already
self-inconsistent. Filing it here as a 63rd case with `expected: null` would have
added nothing but a pending row, and would have diluted the "0 of 62 transcribed"
count this file exists to keep visible.

Its regression pin is instead a sweep test —
`test_sade_sati_transit_instants_do_not_depend_on_when_they_are_asked` — which
recomputes across a full 30-day grid period and asserts a single distinct value.
That is strictly stronger than a golden case: it checks 103 samples rather than one
date, and it cannot be satisfied by an engine agreeing with itself.

**What remains authority-checkable, and is not yet covered:** a Sade Sati exit is a
Saturn ingress into the 3rd rashi from the natal Moon, and दाते पंचांग publishes
Saturn's rashi ingress dates. Those are not among the `TIME_FIELDS`/`KEY_FIELDS`
this harness compares, so the engine's Saturn ingress dates are currently
**unverified against the authority**. Adding a `saturn_ingress` field and a few
cases would close that gap. Recorded here rather than left implicit.

## What the first transcribed case will settle

One page is enough to resolve the highest-priority open question. A single printed
sunrise identifies the disc/refraction convention (O1) by landing within seconds of
one of three known values — and because every limb is reported at sunrise, that one
answer either validates or invalidates the headline tithi, nakshatra, yoga, karana,
vara, all three kaals, Abhijit and Ishtakaal at once.

Start there.
