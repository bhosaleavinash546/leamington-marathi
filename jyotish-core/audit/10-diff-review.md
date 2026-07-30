# Diff review — the remediation itself

The audit reviewed the code as it stood at `f09cb3b`. Remediation has since
changed 51 files, moved published values three times and added five ChartFacts
fields, and none of that had been reviewed by anything except the tests written
alongside it. **The fixed code was the least recently audited code.**

That is not a theoretical worry: remediation surfaced four findings of its own
(F-023, F-024, F-025, F-026), roughly one per fix. This pass re-runs the audit's
own checks against the changed engine and adds adversarial probes aimed at what
the fixes could plausibly have broken.

Scope: `1c0f8f0..b524285`, 51 files, +2159/−148.

## 1. The audit's Pass 2 invariants, re-run

| Assertion | Result |
|---|---|
| Rahu–Ketu exactly 180° | PASS |
| All sidereal longitudes in [0, 360) | PASS |
| Varga partition, 16 × 12 × 1800 = 345,600 samples | PASS |
| SAV = 337; BAV rows classical | PASS |
| Shadbala components sum to the total | PASS |
| True node not forced retrograde | PASS |
| ChartFacts schema-valid, free of Devanagari | PASS |
| Determinism: 3 runs, one digest | PASS |

Nothing the audit established has regressed.

## 2. Was each value change scoped as claimed?

### D19 — dignity precedence

Claimed: only the Moon in Vrishabha 4–30 and Mercury in Kanya 16–20. Verified by
sweeping **all seven grahas at one-arcminute resolution over the full circle**
(151,200 samples) and diffing the new label against a replica of the old:

```
mercury  exalted -> moolatrikona   Kanya  16.00-19.98°   240 samples
moon     exalted -> moolatrikona   Vrishabha 4.00-29.98° 1560 samples
total distinct transitions: 2
```

Exactly the two arcs claimed, and no third. The Sun at Mesha 25° is still
`exalted`, which is the regression the rejected degree-based route would have
caused.

### D18 — Saturn solver

The tolerance moved from 1/1440 d to 1e-7 d, about twenty extra halvings per
solve. Cost measured: **1.8 ms per `sade_sati` call**, 36 ms for twenty. Not
material.

### D21 — Nadi pada

`compute_milan` is the only entry point and every caller was updated; `/v1/milan`
verified end to end (200, total 28.0, exception present for a differing-pada
pair).

## 3. Adversarial probes on the changed surfaces

| Probe | Result |
|---|---|
| Unknown birth time still suppresses chart and dasha | PASS |
| Unknown time still emits `day_night_length` (a property of the date, not the clock) | PASS |
| Unknown time emits **no** namakaran — it needs the Moon's pada | PASS |
| Unknown-time sheet still renders | PASS |
| Circumpolar place raises rather than inventing a day length | PASS (`CircumpolarError`) |
| Equatorial place: day + night = 1439.7 min | PASS |
| Pre-1955 Mumbai: warns, and the sheet prints the warning | PASS |
| No `mr` finding label is pure ASCII | PASS |
| Prohibited content: 21/21 still rejected | PASS |
| Locale audit clean at 36 divergences | PASS |
| Full chart still under budget | PASS — **63 ms** of 200 |

### Two that were worth checking specifically

**Did the numeral converter leak into machine keys?** `to_devanagari` applied to
`mars_in_house_7` yields `mars_in_house_७` — so a blanket pass over the finished
HTML would corrupt every evidence key on the page. It is applied per display
value for exactly this reason, and the test asserts the only Latin digits left in
visible text are the engine version and the evidence keys.

**Did the SVG numerals bypass the web's own toggle?** No. `/v1/chart/svg` serves
**0** Devanagari digits; the `numerals` parameter defaults to `str` and only the
PDF passes one. `web/lib/format.ts` still owns the browser's answer to
CLAUDE.md 7, which is what the injection was designed to preserve.

**Did the five new ChartFacts fields re-destabilise the narrative cache?** No —
this was the F-002 failure mode and worth re-testing rather than assuming.
`lmt_utc_offset_seconds`, `day_night_length`, `in_exaltation_sign` and the
numerology `applicable` flag are all functions of the birth input alone. All six
sections hold their cache key across a two-minute gap.

## 4. Findings from this review

**None.** No new defect was found in the remediation diff.

That is a weaker statement than it looks, and worth saying plainly: this pass
re-ran mechanical checks and probed the edges the fixes touched. It did not
re-do the classical rule-fidelity work of Pass 3 or the presentation judgement of
Pass 4 against the changed sheet — a Marathi practitioner looking at the new
patrika could still find something none of these assertions can see. That remains
`DIVERGENCES.md` O7.

## 5. What the review did confirm about method

Three of the four remediation findings came from *doing the fix*, not from
inspecting the code: F-025 surfaced because rendering the name block would have
printed a `0`; F-024 because adding a warning meant looking at how warnings
render; F-023 because fixing a dignity label meant reading the bala table that
consumes it. The audit could not have found them by reading — they were only
visible once the adjacent code was in hand.

The one that did come from inspection, F-026, is also the one still open.
