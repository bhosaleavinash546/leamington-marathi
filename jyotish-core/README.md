# jyotish-core

A deterministic Jyotish (Vedic astrology) computation engine for Marathi
panchang and kundali, built to the specification in [`CLAUDE.md`](CLAUDE.md).

**No LLM ever computes a number here.** Every degree, tithi, timestamp, dasha
date, koot score and bala value comes from this engine; the narrative layer above
it receives computed facts as JSON and may only phrase them.

## Build status

| Phase | Scope | State |
|---|---|---|
| 0 | Skeleton, decisions, CI gates | **done** |
| 1 | Ephemeris adapter, panchang, Ishtakaal | **done** — golden files scaffolded, **not transcribed** |
| 2 | Chart engine, vargas, Ashtakavarga, Shadbala, ChartFacts | **done** |
| 3 | Vimshottari dasha, yoga/dosha rules, Ashtakoot milan | **done** |
| 4 | FastAPI + narrative layer + validator | not started |
| 5 | Next.js frontend, SVG charts, PDF | not started (locale files exist) |
| 6 | Hardening, DPDP/GDPR endpoints, offline geocoder | not started |

### The one thing to know before trusting a number

**Agreement with दाते पंचांग is unverified.** All 62 golden cases are scaffolded
with full scenario coverage, and every `expected` block is empty because no page of
the almanac has been consulted. The harness reports each case as PENDING rather
than passing — it can never claim agreement it has not demonstrated.

```
$ python -m tools.golden_verify --pending-only
authority: दाते पंचांग (Date Panchang)
cases selected: 62   transcribed: 0   pending: 62
```

The engine *is* checked against 400-plus invariant and unit tests, and against
independently known calendar facts (Gudi Padwa 2023/24/25 → Shaka 1945/46/47;
Adhika Shravana 2023; Adhika Jyeshtha 2018 and 2026; Adhika Ashwina 2020). What is
outstanding is minute-level agreement with the named authority. See
[`docs/GOLDEN_FILES.md`](docs/GOLDEN_FILES.md).

The highest-priority open question is the **sunrise disc/refraction convention**,
worth up to 3m 50s and moving every sunrise-anchored value together —
[`docs/SUNRISE_CONVENTION.md`](docs/SUNRISE_CONVENTION.md).

## Quick start

```bash
uv venv --python 3.12
uv pip install -e ".[dev]"

# A full ChartFacts document, schema-validated
python -m tools.facts_dump --name Avinash --date 1990-06-15 --time 14:32 \
    --lat 18.5204 --lon 73.8567 --tz Asia/Kolkata

# The same birth with an unknown time: fields are suppressed, never defaulted
python -m tools.facts_dump --name Avinash --date 1990-06-15 \
    --lat 18.5204 --lon 73.8567 --tz Asia/Kolkata

pytest                              # ~430 tests
pytest -m "not slow"                # skip the Hypothesis sweeps
python -m tools.locale_audit        # mr/hi/en completeness + divergence check
python -m tools.golden_verify       # per-field delta table vs the authority
```

## Layout

```
core/                 the deterministic engine — no FastAPI, no LLM, no locale
  ephemeris/          the ONE seam onto Swiss Ephemeris (adapter + provider)
  panchang/           five limbs, sunrise, kaals, Ishtakaal, amanta months, Shaka
  chart/              lagna, grahas, houses, 16 vargas, aspects, Ashtakavarga, Shadbala
  dasha/              Vimshottari to 4 levels; Ashtottari/Yogini tables
  rules/              yoga + dosha rules as YAML, with evidence traces
  doshas/             Kaal Sarpa, Sade Sati, Nadi — the computed ones
  milan/              Ashtakoot Guna Milan, per-koot reasons and exceptions
  name/               Namakaran syllables; numerology (flagged not-Jyotish)
  facts/              the ChartFacts contract + its JSON Schema
docs/                 DECISIONS, PANCHANG_AUTHORITY, SUNRISE_CONVENTION, DIVERGENCES, GOLDEN_FILES
locales/{mr,hi,en}/   15 namespaces, 280 hand-curated keys per locale
tests/{unit,invariants,golden}/
tools/                facts_dump, golden_verify, golden_add, locale_audit
```

## Design commitments

These are the properties the tests defend, not aspirations.

**One ephemeris seam.** `core/ephemeris/swisseph_adapter.py` is the only module
allowed to `import swisseph`, and `tests/unit/test_boundaries.py` walks the AST of
every module in `core/` to enforce it. Swapping to Skyfield means writing one
sibling file. The same test forbids `core/` from importing FastAPI, Pydantic, an
LLM client, an ORM or a locale file.

**Sunrise, not midnight.** The Hindu day runs sunrise to sunrise. A 02:30 birth
on 5 Shravan is computed against the 4th's sunrise, vara and headline tithi — and
its tithi *at birth* is reported separately, because the two differ.

**Nothing is defaulted to hide missing input.** An unknown birth time suppresses
the lagna, houses, dasha and Ishtakaal outright and lists what it suppressed; it
never silently becomes 12:00. An approximate time is answered by *recomputing the
chart across the window* at 4-minute steps and reporting which fields actually
moved — endpoint-only sampling aliases, because the ascendant cycles a pada every
13 minutes.

**Undefined means undefined.** Above 66.5° the Sun may not cross the horizon, so
`sunrise_on` raises `CircumpolarError` rather than inventing a time.

**Every finding carries its evidence.** A yoga or dosha returns machine keys
naming the placements that triggered it (`jupiter_in_house_4_from_moon`), which is
what the UI's "why" affordance exposes and what the narrative layer must cite.

**Conventions travel with the data.** Provider, pinned ayanamsa *constant*, node
type, rise/set convention, dasha year length, calendar variant, the applied
historical UTC offset and the dosha ruleset are all in every ChartFacts document.
A number without its convention cannot be checked.

**Unsourced conventions raise.** Ashtottari's nakshatra grouping, Yogini's
starting-yogini rule and the Yuddha bala winner/loser rule are *refused*, with a
message naming what needs sourcing, rather than guessed. See
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## CI gates

Per §9.7 of the spec, all currently green:

| Gate | State |
|---|---|
| `ruff check` + `ruff format --check` | clean |
| `mypy` strict (`core/` + `tools/`) | clean, 47 files |
| Coverage on `core/` ≥ 90% | **95%** |
| ChartFacts JSON Schema validation | valid, and rejects malformed documents |
| Locale completeness (mr/hi/en) | clean, 23 known-divergent terms asserted distinct |
| Golden panchang agreement | **0/62 transcribed — reported, not passed** |

`.github/workflows/ci.yml` is inert while this tree sits inside another
repository — Actions only reads workflows from a repository root. Moving
`jyotish-core/` out to its own repository activates it unchanged.

## Extracting this into its own repository

This directory is self-contained. To lift it out with its history:

```bash
git subtree split -P jyotish-core -b jyotish-core-only
# then push that branch to a new empty repository
```

Or simply copy the directory into a fresh `git init`. Nothing outside
`jyotish-core/` is referenced.

## Product framing

Per §10 of the spec: this is a **traditional Jyotish interpretation** tool. It is
not a forecast of the future, and it is not a substitute for medical, legal,
financial or psychological advice. Birth date, time, place and name together are
sensitive personal data under India's DPDP Act and under GDPR.

The narrative layer's hard content prohibitions (§6.6) and the post-generation
validator that enforces them are **Phase 4** and are not built. Nothing in this
repository generates prose yet.
