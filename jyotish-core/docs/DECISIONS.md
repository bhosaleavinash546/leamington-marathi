# Decisions

Every computational-school choice this engine makes, with the reasoning and the
consequence of changing it. CLAUDE.md 11 Phase 0 requires this file; CLAUDE.md 11
standing instructions require that nothing here was picked silently.

Each decision is echoed into every `ChartFacts` document, so a reader can always
see which conventions produced a number. Changing any **D-number below marked
"breaking"** moves published values and is a major engine version bump
(CLAUDE.md 4.5).

| # | Decision | Value | Breaking? |
|---|---|---|---|
| D1 | Ephemeris + licence | pyswisseph, AGPL-3.0 | yes |
| D2 | Panchang authority | दाते पंचांग (Date Panchang) | yes |
| D3 | Ayanamsa | Lahiri / Chitrapaksha, `SE_SIDM_LAHIRI` | yes |
| D4 | Lunar node | Mean node | yes |
| D5 | Dasha year length | 365.2425 days (solar) | yes |
| D6 | Rise/set convention | Upper limb, refracted (−50′) | yes |
| D7 | Ephemeris data | Moshier (no `.se1` files bundled) | no |
| D8 | Calendar | Amanta months, Shalivahana Shaka | yes |
| D9 | House systems | Whole-sign primary, Sripati Chalit secondary | yes |
| D10 | Mangal dosha ruleset | `maharashtra` (1/4/7/8/12) | no (configurable) |
| D11 | Ishtakaal ghati | Fixed 24-minute | no (configurable) |
| D12 | Ritu convention | Lunar month pairs | no (configurable) |
| D13 | Ayanamsa and nutation | Nutation **included** (true ayanamsa) | **yes — changed a published value, see below** |
| D14 | Narrative model + prompt | `claude-sonnet-4-5`, prompt `1.0.0` | no (recorded in output) |
| D15 | Stored data | Birth input only, Fernet at rest, 365-day retention | no |
| D16 | Offline geocoder | 125 curated places, complete offline tz | no (see DIVERGENCES O6) |
| D17 | Narrative time rendering | Engine projects local times before the prompt | no |
| D18 | Transit-instant resolution | Solved to 1e-7 d, **reported at whole seconds** | **yes — changed a published value, see below** |

---

## D1 — Ephemeris and licence

**pyswisseph, accepted under AGPL-3.0.**

CLAUDE.md 2.1 requires an explicit owner decision here because the licence choice
constrains the distribution model. AGPL-3.0 means a **hosted web service built on
this engine must publish its source**. That is compatible with an open-source or
community project and is a blocker for a closed commercial product unless the
Swiss Ephemeris commercial licence is purchased.

The whole binding is confined to `core/ephemeris/swisseph_adapter.py`, which is
the only module in the repository allowed to `import swisseph`.
`tests/unit/test_boundaries.py` fails the build if that is violated. Swapping in
Skyfield + JPL DE440s therefore means writing one sibling file and changing one
line of `core/ephemeris/registry.py` — nothing else in `core/` knows a provider
exists.

`LICENSE` carries AGPL-3.0 to match.

## D2 — Panchang authority

**दाते पंचांग (Date Panchang).** Recorded in full in `PANCHANG_AUTHORITY.md`.

Chosen for consumer expectation: it is the drik-ganit panchang in widest use in
Maharashtra, so its printed times are what a Marathi user will compare against.
The cost, accepted knowingly, is that its values must be transcribed from a
purchased almanac rather than read off a public specification — see
`GOLDEN_FILES.md` for the current state of that work.

Different panchangs legitimately disagree by minutes. A mismatch is only a bug
*against this authority*. Values are never averaged across panchangs and the
authority is never switched silently.

## D3 — Ayanamsa

**Lahiri / Chitrapaksha**, pinned to the Swiss Ephemeris constant
`SE_SIDM_LAHIRI`.

Pinned to the *constant*, not to the name. Swiss Ephemeris ships several
definitions that a human would call "Lahiri" — `SE_SIDM_LAHIRI_1940`,
`SE_SIDM_LAHIRI_ICRC`, and the separate `SE_SIDM_TRUE_CITRA` — and they differ by
arcminutes, which is enough to move a graha across a shashtiamsa boundary. The
constant name travels in `ChartFacts.ephemeris.ayanamsa_constant` so a
provider-side redefinition is caught as a breaking change (CLAUDE.md 4.5).

Raman, KP, True Chitra, Lahiri-1940, Lahiri-ICRC and Surya Siddhanta are
selectable via `EngineOptions.ayanamsa`.

## D4 — Lunar node

**Mean node**, per CLAUDE.md 3.3.

Ketu is *derived* as Rahu + 180°, so the "exactly 180° apart" invariant holds by
construction and cannot drift (`tests/invariants/`).

The retrograde flag is derived from the reported longitude speed, never asserted
from the fact that a body is a node. The mean node is always retrograde; the True
node oscillates about it and can be stationary or direct, and CLAUDE.md 4.8
forbids display logic that assumes otherwise. `EngineOptions.node_type` selects
`true`, and a test asserts the True node really does go direct within a year.

## D5 — Dasha year length

**365.2425 days** (the mean Gregorian year), `YearLength.SOLAR_365_2425`.

CLAUDE.md 3.4: "pick one, document it, and match the authority … It is the most
common silent divergence between two 'correct' kundali apps."

Magnitudes, pinned as a test:

* over the full 120-year cycle, this and the 360-day savana year differ by
  **629 days (~1.7 years)**;
* over a single 19-year Saturn mahadasha, by **~100 days (over three months)**.

Chosen because it is the value in the ChartFacts sketch in CLAUDE.md 5, and
because a mean-Gregorian year is what modern drik-ganit software generally uses.
`savana_360` and `sidereal_365.2563` are selectable.

> **Outstanding.** Whether दाते पंचांग's printed dasha tables use this year is
> **not yet verified**. This is the second-highest-priority open question after
> D6. See `DIVERGENCES.md`.

## D6 — Rise/set convention

**Upper limb of the disc on the true horizon, with standard atmospheric
refraction** — geometric altitude −50′ (34′ refraction + 16′ semi-diameter).
Swiss Ephemeris' default `rise_trans` behaviour.

CLAUDE.md 3.2 calls this "the single largest source of minute-level drift versus
published panchangs", and the measured spread for Pune at the 2024 summer
solstice is **3 minutes 50 seconds**:

| convention | sunrise IST |
|---|---|
| upper limb, refracted *(default)* | 05:59:10 |
| disc centre, refracted | 06:00:23 |
| disc centre, no refraction (Surya-Siddhanta / "Hindu rising") | 06:03:00 |

Chosen because it is the common almanac convention, but the classical
Surya-Siddhanta definition is disc-centre-without-refraction, and drik-ganit
panchangs do not all follow the almanac. See `SUNRISE_CONVENTION.md`.

> **Outstanding and highest priority.** Which of these three दाते पंचांग uses is
> **not established**. Because every one of the five limbs is reported *at
> sunrise*, this single choice shifts the headline tithi, nakshatra, yoga, karana,
> vara boundary, all three kaals, Abhijit and Ishtakaal together. It is the first
> thing the golden transcription will settle.

## D7 — Ephemeris data files

**Moshier analytical theory** — no `.se1` files are bundled, so Swiss Ephemeris
falls back to its built-in model. The provider string reports
`swisseph_moshier`, never plain `swisseph`, so no output can be confused with the
other configuration.

Accuracy argument: Moshier deviates from JPL by well under an arcsecond for the
Moon. The Moon's elongation advances ~12.2°/day = 43,900″/hour, so a 1″ position
error moves a tithi boundary by **under 0.1 seconds** — three orders of magnitude
below the one-minute golden tolerance. Bundling ~100 MB of binary ephemeris files
would buy nothing observable.

Set `JYOTISH_EPHE_PATH` to a directory of `.se1` files to use the JPL-derived
data instead. Not breaking: the switch changes numbers by far less than the
reporting resolution.

## D8 — Calendar and samvat

**Amanta (अमांत) lunar months and Shalivahana Shaka**, per CLAUDE.md N3. This is
Maharashtra convention, not Purnimanta/Vikram, and Purnimanta is a flag
(`EngineOptions.calendar_variant`) that is never the default.

Sub-decisions:

* **Month naming.** The amanta month containing the Sun's ingress into rashi *R*
  is `MONTH_KEYS[R - 1]`, so the month containing Mesha Sankranti is Chaitra.
  Verified against the published Gudi Padwa dates 2023-03-22, 2024-04-09 and
  2025-03-30.
* **Adhika month.** A lunar month enclosing no ingress takes the name of the
  **following** month with the adhika marker. Verified against Adhika Shravana
  2023 (18 Jul – 16 Aug), Adhika Jyeshtha 2018, Adhika Ashwina 2020 and Adhika
  Jyeshtha 2026.
* **Kshaya month.** A month enclosing two ingresses keeps the **earlier** name;
  the later name is reported in `suppressed_month_key` rather than silently
  dropped.
* **Shaka turnover.** At the new moon opening the **first** month named Chaitra.
  In a year carrying an adhika Chaitra the turnover is therefore at the adhika
  month, so the year number and the month name never disagree.
* **Purnimanta mapping.** Identical to amanta in the shukla paksha; one month
  ahead in the krishna paksha.

## D9 — House systems

**Whole-sign (Rashi = Bhava) primary; Sripati Bhava Chalit secondary. Placidus
explicitly excluded**, per CLAUDE.md 3.3.

Every yoga and dosha rule in `core/rules/data/` is evaluated against the
whole-sign chart, because that is the model the classical rules were written for.
The Sripati overlay is reported alongside (`house_chalit`) and is *not* used by any
rule.

The Sripati construction: trisect the Asc→IC and MC→Asc quadrants in ecliptic
longitude (Porphyry), then read those points as *bhava madhya* — house middles,
not cusps — and place the boundaries (*bhava sandhi*) midway between consecutive
madhyas. So a Sripati house straddles its Porphyry cusp. The provider's own house
routine is never used for cusps; only its ascendant and MC are taken.

## D10 — Mangal dosha ruleset

**`maharashtra`** (Mars in the 1st, 4th, 7th, 8th or 12th from the lagna).

Three schools ship as separate rules in `core/rules/data/doshas.yaml`, each tagged
with its `ruleset`, and the applied one is echoed into ChartFacts (CLAUDE.md 3.5).
The `north_school` set adds the **2nd house** — that single house is the most
consequential difference between the two, and a test pins it. `south_school`
additionally reckons from the Moon and Venus and so finds the dosha in the largest
fraction of charts.

## D11 — Ishtakaal ghati

**Fixed 24-minute ghati** (1 ghati = 24 min, 1 pala = 24 s, 1 vipala = 0.4 s).

Marathi panchang sheets print the fixed ghati. The alternative — dividing sunrise
to next sunrise into exactly 60 ghati — is available as
`GhatiConvention.PROPORTIONAL_DINAMANA` for cross-checking, and the convention is
labelled in output. The two differ by up to ~4% away from an equinox.

## D12 — Ritu convention

**Lunar month pairs** — Chaitra+Vaishakha = Vasanta, and so on. This is what a
panchang prints beside the month name. The solar convention (consecutive rashis of
the Sun, Vasanta from Meena) is selectable and disagrees by up to a fortnight.

---

## D13 — Ayanamsa and nutation

**The ayanamsa includes nutation** (the "true" ayanamsa), so
`sidereal = tropical(true equinox) − ayanamsa(with nutation)`.

**This changed a published value.** It was found by the Phase 6
cross-implementation check (CLAUDE.md 9.4), not by a failing unit test, which is
the whole reason that check exists.

| | Before | After | Δ |
|---|---|---|---|
| Ayanamsa, 1990-06-15 09:02 UTC | 23.72373113° | 23.72729483° | +0.00356370° |
| Every sidereal longitude | — | — | **−12.829″** |

The cause: `swe.get_ayanamsa_ut()` returns the ayanamsa measured from the *mean*
equinox, while the body longitudes we subtract it from are referred to the *true*
equinox — and so is swisseph's own `SEFLG_SIDEREAL` output. Subtracting a
mean-equinox ayanamsa from a true-equinox longitude leaves the nutation in
longitude, about 12.8 arcseconds at that epoch, in every graha. The fix is
`swe.get_ayanamsa_ex_ut(jd, flags)`, which respects the same flags the position
call used.

Why the fix and not the previous behaviour: our engine must agree with the
provider's own sidereal mode, because that is the second implementation every
other Jyotish package is also checked against. 12.8″ is far below the minute-level
panchang tolerance and cannot move a tithi or a nakshatra, but it *can* move a
graha across a D60 shashtiamsa boundary — each is 0.5° wide, so any graha sitting
within 12.8″ of one is reassigned — and it would have shown up as a permanent
unexplained offset against any other software.

`EngineOptions.ayanamsa_includes_nutation` selects the old behaviour for
comparison, and `ChartFacts.ephemeris.ayanamsa_includes_nutation` records which was
used. A cross-implementation test now asserts agreement with `SEFLG_SIDEREAL` to
1e-6°, so this cannot regress silently.

**On the version number.** By this engine's own rules (`core/version.py`, from
CLAUDE.md 4.5 and 5) a new required ChartFacts field *and* a change that moves
published longitudes are each a major bump — so `2.0.0` on both counts.
`ENGINE_VERSION` and `CHARTFACTS_SCHEMA_VERSION` are nonetheless still `1.0.0`,
deliberately and stated here rather than left to be noticed: v1 has not been
released, and both the pre-nutation and post-nutation code landed inside the same
unreleased build, so no consumer has ever held a 1.0.0 document carrying the old
longitudes. The versions are therefore describing a contract that has only ever had
one published form.

**After first release this reasoning expires.** The identical change made to a
shipped v1 is a `2.0.0` bump on both numbers, with old documents left readable at
the 1.0.0 schema.

## D14 — Narrative model and prompt version

**`claude-sonnet-4-5`**, prompt version **1.0.0**, temperature 0.2.

Both travel in every narrative response and in the cache key, so a model change
or a prompt edit invalidates cached prose rather than mixing two generations of
text (CLAUDE.md 6: "Identical charts must not produce drifting text").

The model is a presentation choice, not a computational one: CLAUDE.md N1 means no
model, at any temperature, contributes a number. Changing it is therefore **not**
an engine version bump.

Generation is off unless a key is present. With `narrative_enabled` false the
service never calls the transport at all and returns the requested locale's
refusal string — which is why the refusal must exist in all three locales, and a
test asserts it is in Devanagari for mr and hi.

## D15 — What is stored, and for how long

**Birth input plus engine version. Never a derived value.**

CLAUDE.md 2.2: "Store birth input + engine version, never store derived values as
source of truth — always recompute." A stored chart computed by engine 1.0.0 would
silently become the answer after D13 changed longitudes; recomputation makes the
change visible instead.

* **Encryption at rest**: Fernet (AES-128-CBC + HMAC) over the JSON payload, key
  from `JYOTISH_ENCRYPTION_KEY`. Absent key is a hard error, not a fallback to
  plaintext — CLAUDE.md 10 requires encryption at rest for what it correctly calls
  sensitive personal data under the DPDP Act and GDPR.
* **Retention**: 365 days by default, then `purge_expired()` deletes. Stated in
  `/v1/privacy/policy` rather than only implemented.
* **Consent**: an explicit grant per stated purpose, from a closed set. Consent
  cannot be recorded as anything but `true` (the schema uses `Literal[True]`), so
  a "consent: false" row cannot exist to be misread later.
* **Analytics**: none on birth-input screens, enforced by the CSP in
  `web/next.config.ts` blocking third-party scripts outright, not by policy alone.

`stored_column_names()` exists so a test can assert no derived column was ever
added.

## D16 — Offline geocoder seed

**125 curated places bundled; the timezone half of the lookup is complete and
fully offline.**

CLAUDE.md 2.2 asks for "the top 20k Indian places". What ships is 125 —
Maharashtra district and taluka centres, the major Indian cities, and the UK
diaspora towns this project started from. The shortfall is recorded as O6 in
`DIVERGENCES.md` and reported by `/v1/places` itself in `dataset_status()`, rather
than being left to look complete.

The half that matters most is done: `timezonefinder` resolves an arbitrary
coordinate to an IANA zone offline, so a place absent from the seed can still be
entered by coordinate and get correct historical offsets (CLAUDE.md 4.1).

## D17 — Local times in narrative prose

**The engine computes local times; the model only reads them.**

ChartFacts stores UTC (CLAUDE.md 4.7: "convert at the presentation edge only") but
prose must print `06:13`, not `00:43Z`. Three options existed and only one is
consistent with N1:

1. let the model convert — a model doing arithmetic, forbidden;
2. drop times from prose — loses what a panchang paragraph is mostly for;
3. **have the engine emit the local rendering as a sibling field.**

`narrative/projection.py` adds a `*_local` sibling for every `*_utc` in the
narrowed slice, plus the resolved zone. The projection is used for the payload,
the cache key *and* the numeric-provenance check, so a time in the prose is only
accepted if the engine put it there.

## D18 — Transit-instant resolution

**Saturn crossings are solved to 1e-7 days (8.6 ms) and reported at whole
seconds.**

**This changed a published value.** Found by the 360° audit as F-001, not by a
failing test — the previous behaviour satisfied every test the suite had.

| | Before | After |
|---|---|---|
| Sade Sati `exit_utc` | 45 distinct values over a 30-day sweep of `now`, spread **38.67 s** (2027-06-02T23:57:55.634752Z .. 23:58:34.306640Z) | **one** value, 2027-06-02T23:58:15Z |
| Sade Sati `phase_start_utc` | 45 distinct values, spread **38.67 s** (2025-03-29T16:14:21.767592Z .. 16:15:00.439440Z) | **one** value, 2025-03-29T16:14:41Z |
| Worst residual: Saturn's distance from the target at the reported instant | 0.077610″ | 0.000974″ — 80× tighter |
| Printed minute | flipped 23:57 / 23:58 and 16:14 / 16:15 with the request | stable |

**Neither published date moved** — 2027-06-02 and 2025-03-29 are unchanged. What
changed is that the *time* is now a property of Saturn rather than of the clock.

The cause was two defects compounding. `_saturn_crossing` phased its 30-day
bracketing grid on `jd_from_utc(after)`, where `after` came from the caller's
`now`; `_bisect_saturn` then stopped once the bracket was under one minute and
returned its **midpoint**. So the reported instant was the centre of whatever
bracket the request happened to produce, up to ±30 s from the root.

Two changes, and both are necessary:

1. **Converge.** Tolerance is now `_SATURN_SOLVE_TOL_DAYS = 1e-7` d, three orders
   of magnitude below the reporting resolution and comfortably above the ~48 µs
   float64 floor for a Julian Day at this epoch (`JD_FLOAT_RESOLUTION_SECONDS`),
   so the loop converges instead of grinding against the representation limit.
2. **Round to the second.** Convergence leaves float noise in the last bits that
   still differs between differently-positioned brackets, and microsecond output
   put that noise into the narrative cache key.

Rounding *alone* would not have been a fix, and was rejected for that reason: it
would have hidden the wobble mid-second and re-exposed it at a second boundary.
Converging first is what makes rounding safe. The residual failure mode — a true
crossing within ~9 ms of a half-second — is a 1-second ambiguity roughly once in
50,000 charts, against 38.67 s always.

Why this is marked breaking: `doshas[].detail.exit_utc` and `phase_start_utc` are
published fields and their values changed. No schema field was added or removed,
so `CHARTFACTS_SCHEMA_VERSION` is unaffected; the versioning reasoning recorded
under D13 applies unchanged.

**Consequence for the reader (audit F-002).** These instants sit in ChartFacts, so
they were in the narrative cache key. The `doshas` section therefore missed the
cache on every request and the model was called again: one birth, two requests two
minutes apart, two LLM calls, two different Marathi paragraphs about the reader's
Sade Sati. That is now one call and one text. The cache was never wrong — the
facts were unstable.

---

## Conventions this engine refuses to guess

CLAUDE.md 11: "Ask before inventing a convention. If the spec is silent on a
computational school, **stop and ask** — do not pick one silently." Three places
raise rather than return a plausible number:

| Item | Why refused | Where |
|---|---|---|
| Ashtottari nakshatra→lord grouping | Eight lords over 27 nakshatras in groups of *unequal* size; published tables disagree on the starting nakshatra and the boundaries | `core/dasha/optional.py`, raises `UnsourcedConventionError` |
| Yogini starting-yogini rule | The offset applied to the birth nakshatra index is quoted several ways | same |
| Yuddha bala winner/loser | Schools disagree whether the northerly or the brighter graha wins a planetary war | `core/chart/shadbala.py`, value stays 0, condition flagged separately |

The period *tables* for Ashtottari (108 y) and Yogini (36 y) are implemented and
their totals are checked; only the nakshatra mapping is withheld. Supply a sourced
27-entry table plus a note here and both systems work immediately.
