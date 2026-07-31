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
| 4 | FastAPI + narrative layer + validator + caching | **done** |
| 5 | Next.js frontend, SVG charts, panchang card, dasha tree, PDF | **done** |
| 6 | Property tests, cross-implementation check, DPDP/GDPR, performance, geocoder | **done** — geocoder seeded at 125 of 20,000 places (O6) |

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

The engine *is* checked against 770 invariant and unit tests, and against
independently known calendar facts (Gudi Padwa 2023/24/25 → Shaka 1945/46/47;
Adhika Shravana 2023; Adhika Jyeshtha 2018 and 2026; Adhika Ashwina 2020). What is
outstanding is minute-level agreement with the named authority. See
[`docs/GOLDEN_FILES.md`](docs/GOLDEN_FILES.md).

The highest-priority open question is the **sunrise disc/refraction convention**,
worth up to 3m 50s and moving every sunrise-anchored value together —
[`docs/SUNRISE_CONVENTION.md`](docs/SUNRISE_CONVENTION.md). It is not the first
one to settle, though: [`docs/UNBLOCKING.md`](docs/UNBLOCKING.md) shows which
single printed value resolves each open question, and in what order.

## Quick start

```bash
uv venv --python 3.12
uv pip install -e ".[dev,api,narrative,pdf]"

# A full ChartFacts document, schema-validated
python -m tools.facts_dump --name Avinash --date 1990-06-15 --time 14:32 \
    --lat 18.5204 --lon 73.8567 --tz Asia/Kolkata

# The same birth with an unknown time: fields are suppressed, never defaulted
python -m tools.facts_dump --name Avinash --date 1990-06-15 \
    --lat 18.5204 --lon 73.8567 --tz Asia/Kolkata

pytest                              # 770 tests, 62 golden cases pending
pytest -m "not slow"                # skip the Hypothesis sweeps
python -m tools.locale_audit        # mr/hi/en completeness + divergence check
python -m tools.narrative_test      # prohibited content, 7 categories x 3 locales
python -m tools.golden_verify       # per-field delta table vs the authority
python -m tools.settle --matrix     # which printed value settles which question
```

The engine needs none of the extras. `uv pip install -e ".[dev]"` runs `core/` and
its tests on their own; `[api]` adds FastAPI and the store, `[pdf]` WeasyPrint,
`[narrative]` the Anthropic SDK. Every narrative test uses a scripted transport, so
no API key is needed to run the suite — or to run the API, which returns the
locale's refusal string when generation is off.

### Running it

```bash
# The API. No key set → /v1/narrative refuses in the requested locale.
export JYOTISH_ENCRYPTION_KEY=$(python -c \
    "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
uvicorn api.main:app --reload            # OpenAPI at /docs

cd web && npm install && npm run dev     # http://localhost:3000/mr
```

`JYOTISH_ENCRYPTION_KEY` is only needed for the `/v1/privacy` store; its absence is
a hard error at the point of storing rather than a silent fall back to plaintext.

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
api/                  orchestration only: validate → call engine → assemble ChartFacts
  routers/            privacy (DPDP/GDPR) and the offline geocoder
  storage.py          birth input encrypted at rest; never a derived value
narrative/            ChartFacts → prose. prompt · projection · client · validator · cache
render/               one SVG geometry, shared by web, PDF and snapshot tests
  fonts/              Noto Sans Devanagari, self-hosted
web/                  Next.js 15 App Router, next-intl, reads locales/ directly
docs/                 DECISIONS, PANCHANG_AUTHORITY, SUNRISE_CONVENTION, DIVERGENCES,
                      GOLDEN_FILES, LOCALE_REVIEW, UNBLOCKING
locales/{mr,hi,en}/   21 namespaces, 333 hand-curated keys per locale
tests/{unit,invariants,golden}/
tools/                facts_dump, golden_verify, golden_add, locale_audit,
                      narrative_test, settle
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

**The prose layer cannot invent a number.** Every generated section is validated in
code, not by trusting the prompt: prohibited subjects (§6.6/6.7) are matched
against a per-locale blocklist, and *every numeric token in the prose must appear
in the facts the model was shown*. A fabricated degree, time or dasha date fails
the section rather than reaching a reader. Local times are computed by the engine
and handed to the model as data — a timezone conversion is arithmetic, so the model
does not do it.

**One chart geometry.** `render/chart_svg.py` draws the North Indian diamond once.
The browser, the PDF and the snapshot tests all consume that output, so the printed
sheet and the screen cannot drift apart. The diamond ships with a semantic table
alternative that is always in the DOM, not a toggle.

## CI gates

Per §9.7 of the spec, plus the Phase 4–6 additions. All currently green:

| Gate | State |
|---|---|
| `ruff check` + `ruff format --check` | clean, 92 files |
| `mypy` strict (`core` `api` `narrative` `render` `tools`) | clean, 67 files |
| Architectural boundaries (`core/` imports nothing above it) | clean |
| Coverage on `core/` ≥ 90% | **95.4%** (94% across all four packages) |
| ChartFacts JSON Schema validation | valid, and rejects malformed documents |
| Locale completeness (mr/hi/en) | clean, 36 known-divergent terms asserted distinct, every rule key covered |
| Prohibited-content validator | 21/21 samples rejected, benign prose passes |
| Full chart server-side < 200 ms | **84 ms** median of 7 (engine + ChartFacts + schema validation) |
| `web`: `tsc --noEmit` + `next build` | clean, 11 static pages across 3 locales |
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

The hard content prohibitions of §6.6/6.7 are enforced by
`narrative/validator.py` in code, in all three locales, and gated in CI —
`python -m tools.narrative_test` prints the category × locale matrix with the
pattern that caught each sample. Prose is refused, never quietly edited: a
scrubbed paragraph would hide a prompt regression.

Storage follows §10: birth input only, Fernet-encrypted at rest, explicit consent
per stated purpose, a 365-day retention policy, and export/delete endpoints under
`/v1/privacy`. No third-party analytics reach the birth-input screens — the CSP in
`web/next.config.ts` blocks third-party scripts outright rather than relying on a
policy statement. Derived values are never stored as source of truth; a chart is
always recomputed, which is what made the D13 longitude change visible instead of
frozen into old rows.
