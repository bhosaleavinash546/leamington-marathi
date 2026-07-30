# Sunrise convention

CLAUDE.md 3.2 requires this to be specified and documented, because it is "the
single largest source of minute-level drift versus published panchangs".

## The engine default

**Upper limb of the solar disc on the true horizon, with standard atmospheric
refraction.** Geometric altitude of the disc centre at the event: **−50′**
(34′ mean refraction + 16′ solar semi-diameter). Atmosphere taken as ICAO sea
level: 1013.25 hPa, 15 °C.

Recorded in every ChartFacts document as
`ephemeris.rise_set_convention: "upper_limb_refracted"`.

## Why it matters this much

Every one of the five limbs is reported *at sunrise* (CLAUDE.md N4), so this one
choice moves, together:

* the day's headline tithi, nakshatra, yoga and karana — and whether a limb has
  already changed by sunrise, which can shift the printed value by a whole
  division;
* the vara boundary, and therefore whether a pre-dawn birth rolls back a day;
* Rahu Kaal, Gulika Kaal, Yamaganda and Abhijit, all of which are proportional
  divisions of sunrise→sunset;
* Ishtakaal, measured from sunrise;
* the kshaya/vriddhi tithi classification, which compares the tithi at two
  consecutive sunrises.

## Measured spread

Pune (18.5204 °N, 73.8567 °E, 560 m), 2024-06-21, from
`tests/unit/test_panchang.py::test_disc_convention_moves_sunrise_by_minutes`:

| convention | sunrise IST | delta vs default |
|---|---|---|
| upper limb, refracted *(default)* | 05:59:10 | — |
| disc centre, refracted | 06:00:23 | +1m 13s |
| disc centre, no refraction | 06:03:00 | +3m 50s |

The ordering is physical and is asserted: both refraction and taking the upper
limb bring sunrise earlier, so the disc-centre-no-refraction reading is always the
latest of the three.

## The two traditions

**Almanac / civil.** Upper limb, refraction applied — the moment the Sun becomes
visible. This is what nautical almanacs, meteorological services and most
published sunrise tables mean by sunrise.

**Classical Jyotish.** Surya-Siddhanta defines sunrise geometrically, at the disc
centre on the horizon, without refraction. Swiss Ephemeris exposes this as
`SE_BIT_HINDU_RISING` (disc centre + no refraction + geocentric without ecliptic
latitude).

A drik-ganit panchang recomputes positions observationally but does not
necessarily adopt the civil *definition* of sunrise. So neither tradition can be
assumed from the fact that Date Panchang is drik-ganit.

## Status: unresolved

**Which convention दाते पंचांग uses is not established.** The engine default is
the almanac convention because that is the more common published choice, and it is
recorded in output so that a golden mismatch is immediately diagnosable rather
than mysterious.

Resolving it needs one transcribed case. Take any Date Panchang page, read its
printed sunrise, and run:

```
python -m tools.golden_verify --case <case-id>
```

The delta will land within a few seconds of one of the three rows above, and that
identifies the convention. If it does, change `EngineOptions.rise_set_altitude_deg`
(and this file, and `DECISIONS.md` D6), and treat it as a **major engine version
bump** — it moves published numbers.

If the delta matches none of the three, do **not** tune the altitude to close the
gap. Record it in `DIVERGENCES.md` with the numeric delta and investigate the
physical cause: candidates are an elevation correction (Date Panchang may compute
for a reference altitude rather than the place's own), a different refraction
constant, or a topocentric/geocentric difference.

## Elevation

Place elevation is passed to the provider, and for the Pune case it changes
nothing at the second level — at 560 m the horizon-dip correction is inside the
rounding. It is retained because it matters at genuine altitude (a Himalayan
place) and because dropping an input to save nothing is a false economy.
