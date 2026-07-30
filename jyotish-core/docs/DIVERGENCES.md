# Divergences

CLAUDE.md 12 requires that "any documented school divergences [are] listed
explicitly". Two kinds of entry appear here:

* **Open** — a convention this engine had to choose without being able to verify
  it against दाते पंचांग. Each names the numeric consequence and how to settle it.
* **Accepted** — a place where this engine knowingly differs from some other
  defensible implementation, with the reason.

Nothing here is a bug list. A bug is a disagreement with the *named authority*
(CLAUDE.md N2), and none can be confirmed until the golden files are transcribed.

---

## Open questions, highest priority first

> **How to settle these: `docs/UNBLOCKING.md`.** They are blocked on दाते पंचांग
> but not on the same page, and not on the full 62-case transcription. A yoga
> end-time settles the ayanamsa on its own; a place-correction table settles the
> elevation question; only then does a printed sunrise mean one thing.
> `python -m tools.settle --matrix` reproduces the sensitivities.

### O1 — Sunrise disc/refraction convention

**Consequence: up to 3m 50s on every sunrise, and with it the headline tithi,
nakshatra, yoga, karana, vara boundary, all three kaals, Abhijit and Ishtakaal.**

The engine uses upper-limb-with-refraction. The classical Surya-Siddhanta
definition is disc-centre-without-refraction. Which Date Panchang uses is not
established. Full analysis and the resolution procedure in
`SUNRISE_CONVENTION.md`; decision recorded as D6.

### O2 — Dasha year length

**Consequence: ~100 days (over three months) on a 19-year Saturn mahadasha; 629
days over the full 120-year cycle.**

The engine uses 365.2425 days. Whether Date Panchang's printed dasha tables use
the mean Gregorian year, the sidereal year (365.25636 d) or the 360-day savana
year is not verified. All three are implemented and selectable
(`YearLength`); the one in force is recorded in
`ChartFacts.dasha.year_length`. Decision D5.

To settle: compare one printed mahadasha start date for a known birth against all
three settings.

### O3 — Rahu Kaal / Gulika / Yamaganda weekday tables

CLAUDE.md 3.2 marks the Rahu Kaal row `[Likely]` and says "Verify against the
authority; do not trust this table blind."

The engine ships the tables in near-universal published use, flagged in code as
`NEEDS_AUTHORITY_VERIFICATION`:

| | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|---|---|
| Rahu Kaal | 8 | 2 | 7 | 5 | 6 | 4 | 3 |
| Gulika | 7 | 6 | 5 | 4 | 3 | 2 | 1 |
| Yamaganda | 5 | 4 | 3 | 2 | 1 | 7 | 6 |

A structural check passes — the three never collide on the same weekday — but
that is not authority verification. Golden cases pin
`rahu_kaal_start`/`rahu_kaal_end` and will confirm or refute the row.

### O4 — Ishtakaal ghati definition

Fixed 24-minute vs proportional (1/60 of sunrise→sunset→sunrise). Up to ~4%
divergence away from an equinox; on a Pune midsummer day the two differ by about
one pala per ghati elapsed. Engine uses fixed (D11), and labels which in output.

### O5 — The second implementation is the same library

**Consequence: unknown. This is a gap in the check, not a known error.**

CLAUDE.md 9.4 asks for "a handful of full charts [checked] against a second
independent implementation". `tests/invariants/test_cross_implementation.py` runs
three checks per chart over six charts:

1. our sidereal longitudes vs swisseph's own `SEFLG_SIDEREAL` path — a different
   code path, and the one that found D13;
2. the ascendant from a closed-form formula written here from spherical
   trigonometry, independent of the provider's house routine;
3. the MC from ARMC, likewise closed-form.

Checks 2 and 3 are genuinely independent of the provider. Check 1 is not: it is
the same C library reached a different way, so it can catch a wiring error — and
did — but not an error in the Swiss Ephemeris itself.

What is still outstanding is a chart compared against a **separate application**
(Jagannatha Hora, Maitreya, or a published printed kundali). A never-failing test
prints this shortfall on every run so it cannot become invisible. Settling it
needs one full chart from another package, transcribed like a golden case.

### O6 — Offline geocoder is 125 places, not 20,000

**Consequence: a place absent from the seed must be entered by coordinate.**

CLAUDE.md 2.2 asks that "the app must work offline for the top 20k Indian places".
`api/data/places.json` holds 125 — Maharashtra district and taluka centres, the
major Indian cities, and the UK diaspora towns. `/v1/places` reports the shortfall
in `dataset_status()` rather than presenting itself as complete, and
`TARGET_PLACE_COUNT` names the target in code.

The timezone half of the requirement *is* met offline: `timezonefinder` resolves an
arbitrary coordinate to an IANA zone with no network, so a birth in an unlisted
village still gets correct historical offsets (CLAUDE.md 4.1) once its coordinates
are entered. Settling this is a data task: a GeoNames IN extract filtered to
population > 500, run through the same schema.

One caveat found while building it: `timezonefinder` returns names like
`Etc/GMT+4` for ocean coordinates. Those are valid IANA names but fixed offsets in
disguise — no DST, no historical transitions — which silently defeats CLAUDE.md
4.1. The endpoint attaches `ocean_or_fixed_offset_zone` as a warning rather than
accepting them quietly.

### O7 — No locale term has been read by a native Marathi speaker

**Consequence: unknown, and unknowable from inside the repository.**

CLAUDE.md 7 requires terms curated by hand rather than machine-translated. They
were: every term is written from the classical Sanskrit with Marathi orthography
applied deliberately, and 35 known mr≠hi divergences are asserted distinct on
every build. But *written carefully* is not *reviewed*, and the difference is
exactly the judgment CLAUDE.md 7 is about — whether a term reads right on a
patrika, and whether the register is the formal one a panchang uses.

This is recorded as an open question rather than a finding because there is no
evidence of an error; there is an absence of verification. `docs/LOCALE_REVIEW.md`
carries the per-term checklist, ordered by how much doubt attaches to each, with
the reasoning behind every judgment call so a reviewer can disagree with the
reason rather than just the word.

To settle: one Marathi-speaking Jyotish practitioner, one pass over 327 terms.
Cheaper than any other open question in this file, and the only one that cannot
be closed by computation.

---

## Accepted divergences

### A1 — Yuddha bala is reported as zero, not computed

Planetary war (two non-luminaries within 1°) is **detected** and flagged as
`shadbala.kaala.in_planetary_war`, but the winner/loser strength adjustment is
left at 0. The schools disagree on whether the graha further north wins or the
brighter one does, and CLAUDE.md 11 forbids picking silently. A chart with two
grahas in war therefore has a Kaala bala that is *incomplete but not wrong*, and
the flag says so.

### A2 — Bhava bala includes only its Bhavadhipati component

The house-lord's own Shadbala. Bhava Digbala and Bhava Drishti bala are omitted
rather than approximated, so `bhava_bala()` is a partial figure and is documented
as such at the call site.

### A3 — Yoni koot middle band collapsed to a flat 2

The classical Yoni table grades the middle of the range (3/2/1 for friendly,
neutral, unfriendly animal pairs). Published versions of that grading disagree, so
this engine scores 4 for the same yoni, 0 for the seven enemy pairs, and a flat 2
otherwise. Same-yoni and enemy-pair scores are unaffected; a mid-band pairing may
read 1 or 2 points differently from another implementation, out of 36.

### A4 — Nodes carry no exaltation

Rahu/Ketu exaltation (commonly Vrishabha/Vrishchika) is a later and contested
addition. CLAUDE.md 3.3 does not require it, so `dignity_of` returns `neutral` for
the nodes rather than adopting one school's table. Nodes also get no Shadbala, no
combustion and no Ashtakavarga row.

### A5 — Mercury is treated as a natural benefic

Mercury's benefic/malefic status is context-dependent in the classics (it takes
the character of its companions). This engine treats it as a benefic for the sign
of a Drik bala contribution and for Paksha bala, which is the common
simplification. Affects Drik bala by at most ±15 virupas (0.25 rupa).

### A6 — Kemadruma excludes the Sun from the adjacency count

A Sun beside the Moon is a new-moon condition, not "company", so the Sun and the
nodes are excluded when checking the 1st, 2nd and 12th from the Moon. Some
implementations include the Sun and therefore report Kemadruma less often.

### A7 — "Unafflicted" is fixed to three conditions

Used by Gajakesari and others. This engine defines it as: not combust, not
debilitated, not in a dusthana (6/8/12). The term has no single classical
definition; fixing it in one place is preferable to letting each rule imply its
own. Gajakesari with the loose reading (placement alone) would fire on roughly a
third of all charts; with this reading it is meaningfully selective.

### A8 — Budha-Aditya requires a non-combust Mercury

The unconditional form fires on about a quarter of charts. A Mercury inside its
combustion orb is astamgata and most authorities hold the yoga weakened or absent,
so the condition is encoded.

### A9 — Pitra dosha has no classical definition

Not a named dosha in the classical samhitas. The condition encoded (Sun with
Saturn/Rahu/Ketu, or a node in the 9th) is the one in widest modern use, and the
rule carries `strength: weak` to reflect that its provenance is traditional rather
than textual.

### A10 — PDF text extraction reorders Devanagari matras

Not a rendering divergence — a *reading* one. `pypdf` extracts `तिथी` as `तथी` and
`सूर्योदय` as `सूयार्योदय`: the glyphs are all present in the PDF, but the text layer
returns them in visual rather than logical order, so a matra that renders before
its consonant extracts before it too.

This matters only because CLAUDE.md 2.2 asks the pipeline to prove Devanagari
survived. A naive `"तिथी" in extract_text(pdf)` assertion would fail on a perfectly
good PDF. `render/pdf.py` therefore checks with `assert_codepoints_present()`,
which is order-insensitive, and `extract_text`'s docstring records why. The visual
result is verified separately by `assert_devanagari_coverage()`, which confirms the
embedded font can draw every codepoint the locale can produce.

### A11 — Ephemeris is Moshier, not JPL

See D7. Sub-arcsecond for the Moon, which is under 0.1 s of tithi-boundary time —
three orders of magnitude below the reporting resolution. Not a divergence in any
observable sense, listed for completeness.

---

## Precision floors (not divergences, but worth knowing)

| Quantity | Floor | Why |
|---|---|---|
| Julian Day round trip | ~48 µs | float64 ulp at JD ≈ 2.46e6; see `JD_FLOAT_RESOLUTION_SECONDS` |
| Limb boundary solve | ~5e-5 s | Newton tolerance of 1e-8° at 16.4°/day |
| Dasha sub-period tiling | exact | cumulative-share accumulation, asserted to the microsecond at all four levels |
| Limb adjacency | exact | each boundary is solved once and reused as the next division's start |
