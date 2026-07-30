# Golden panchang files

## Status: 0 of 62 cases transcribed

**No page of दाते पंचांग has been consulted.** Every `expected` block in
`tests/golden/cases.yaml` is empty, every authority-agreement test reports PENDING,
and the engine's agreement with the authority is therefore **unknown rather than
established**.

This is stated rather than smoothed over because CLAUDE.md N2 makes one named
panchang the reference truth, and CLAUDE.md 11 Phase 1 says to report a mismatch
rather than tune a constant to hide one. A harness that passed on engine output
would be worse than no harness: it would report agreement it never demonstrated.

```
$ python -m tools.golden_verify --pending-only
authority: दाते पंचांग (Date Panchang)
cases selected: 62   transcribed: 0   pending: 62
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

## What the first transcribed case will settle

One page is enough to resolve the highest-priority open question. A single printed
sunrise identifies the disc/refraction convention (O1) by landing within seconds of
one of three known values — and because every limb is reported at sunrise, that one
answer either validates or invalidates the headline tithi, nakshatra, yoga, karana,
vara, all three kaals, Abhijit and Ishtakaal at once.

Start there.
