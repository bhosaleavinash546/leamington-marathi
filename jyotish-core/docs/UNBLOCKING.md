# Unblocking F-007 and F-008: what to look up, and what each value settles

> **Status update.** The owner supplied a scanned दाते पंचांग (शक १९४०,
> 2018-19), and **both findings are now resolved** — evidence in
> `audit/live/ALMANAC.md`. Step 1 / F-008: by route (a), the printed monthly
> अयनांश, corroborated by the daily 05:30-IST ग्रहस्पष्ट table. Step 2 /
> F-007 with O1: by route (b) — the Mumbai daily rise/set columns settle
> disc-centre-refracted (D26), and the Pune year-table (book page २८, 560 m)
> shows no elevation dip, so elevation is documentedly not applied. Step 3
> (the golden cases) is unblocked and in progress.

Both findings were blocked on दाते पंचांग. They are **not** blocked on the same
page, and neither needs the full 62-case transcription. This file says exactly
what to look up first.

Run `python -m tools.settle --matrix` to reproduce every number below.

## The one thing that makes this cheap

Each printed value is sensitive to a different subset of the unknowns. Measured
for Pune, 2024-06-21:

| printed value | ayanamsa (F-008) | sunrise convention (O1) | observer height (F-007) |
|---|---|---|---|
| tithi end | **0.00 min** | 0.00 min | 0.00 min |
| karana end | **0.00 min** | 0.00 min | 0.00 min |
| **yoga end** | **−2.76 min** | 0.00 min | 0.00 min |
| **nakshatra end** | **−1.48 min** | 0.00 min | 0.00 min |
| **sunrise** | 0.00 min | **+3.83 min** | **−3.85 min** |

Three consequences, each pinned by a test in `tests/unit/test_panchang.py`:

1. **A yoga end-time settles the ayanamsa by itself.** It does not depend on
   sunrise, so it needs no assumption about O1 or F-007. Prefer it to the
   nakshatra: 2.76 minutes clears the ±1 minute printing tolerance comfortably,
   where 1.48 leaves little room.
2. **A tithi or karana end-time settles no convention** — the ayanamsa cancels in
   the elongation, exactly. That makes it the ideal *control*: it should match
   whichever ayanamsa wins, so a mismatch there points at the ephemeris or the
   solver, not at a school choice.
3. **One printed sunrise cannot separate O1 from F-007.** They move it by +3.83
   and −3.85 minutes — opposite signs, near-equal size — so they nearly cancel. A
   sunrise matching today's default is equally consistent with *upper limb,
   elevation ignored* and with *disc centre without refraction, elevation
   applied*.

## The procedure

### Step 1 — F-008, the ayanamsa. One page.

Two routes, either sufficient:

**(a) The front matter.** Most Indian panchangs print the year's अयनांश on the
opening pages. Compare it against the engine:

```
python -c "import datetime as dt; from core.ephemeris.registry import build_ephemeris; \
from core.timeutil import jd_from_utc; from core.types import EngineOptions; \
jd = jd_from_utc(dt.datetime(2024,1,1,tzinfo=dt.UTC)); \
print({a: round(build_ephemeris(EngineOptions(ayanamsa=a)).ayanamsa_deg(jd), 6) \
for a in ('lahiri','true_chitra','raman','kp')})"
```

Lahiri and True Chitra sit about **1 arcminute** apart, which is well inside what
an almanac prints to.

**(b) One yoga end-time**, if the front matter is silent or ambiguous:

```
python -m tools.settle --date 2024-06-21 --place pune --yoga-end 18:41
```

The tool prints every candidate with its delta and marks each *consistent* or
*ruled out*. Transcribe a **second date** before treating the answer as general —
one agreement is one agreement.

Take a tithi end-time from the same page as the control while you are there.

### Step 2 — F-007, observer elevation. Also one page, but a different one.

The question is whether the almanac applies the horizon dip for an observer above
sea level. Easiest route first:

**(a) The स्थानिक भेद (place-correction) table.** Almanacs print sunrise for a
reference city plus corrections for others. **If those corrections have no height
column — only latitude and longitude — elevation is not applied**, and the engine
ignoring it is correct. Record that and close F-007 as a documented convention.

**(b) Two places, very different heights**, if there is no such table. Compare the
almanac's printed sunrise for a hill station against a plains city at similar
longitude — Mahabaleshwar (1353 m) against Pune (560 m), or Kolhapur (569 m). If
the printed difference is explained by latitude and longitude alone, elevation is
not applied.

`tools/settle.py` knows all five places by name.

### Step 3 — only then, O1 and the golden cases.

With the ayanamsa fixed and the elevation policy known, a printed sunrise finally
means one thing, and `docs/SUNRISE_CONVENTION.md` can be settled. After that the
62 cases in `tests/golden/cases.yaml` are ordinary transcription rather than
inference.

## What this does not do

`tools/settle.py` reports *consistent with*, never *proves*. One value can rule
conventions out; it cannot establish agreement across 62 cases, and it says so in
its own output. The order above exists because each step removes a variable from
the next — settling O1 first, while the ayanamsa is still open, would mean
settling it twice.
