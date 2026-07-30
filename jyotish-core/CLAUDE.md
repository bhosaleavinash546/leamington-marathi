# CLAUDE.md — Marathi Panchang Kundali Engine ("Jyotish-Core")

> This is a **specification**, not a wish list. Where a value is given, it is a requirement, not a suggestion.
>
> **Build status.** All six phases are implemented: the deterministic core
> (`core/`), the FastAPI orchestration layer (`api/`), the narrative layer with
> its post-generation validator (`narrative/`), the SVG and PDF renderer
> (`render/`), the Next.js frontend (`web/`), and the Phase 6 hardening. Read
> `README.md` for what exists and `docs/DECISIONS.md` for every convention
> chosen.
>
> Three things in §12's definition of done are **not** met, each recorded rather
> than hidden:
>
> 1. **The 60 golden panchang cases in §9.1 are scaffolded but not transcribed**
>    - see `docs/GOLDEN_FILES.md`. Agreement with दाते पंचांग is unverified, and
>    the harness reports each case as PENDING rather than passing.
> 2. The §9.4 cross-check compares against the same ephemeris library reached a
>    different way, not against a separate application - `docs/DIVERGENCES.md` O5.
>    It nonetheless found a real 12.8-arcsecond error; see D13.
> 3. The offline geocoder holds 125 places, not §2.2's 20,000 - O6. The timezone
>    half of that requirement is complete and offline.

---

## 0. Mission and non-negotiables

Build a Jyotish (Vedic astrology) computation and interpretation platform whose **astronomical output matches a named published Marathi panchang to the minute**, and whose interpretive text is clearly separated from computed fact.

**Non-negotiables — violate any of these and the build is rejected:**

| # | Rule |
|---|---|
| N1 | **No LLM ever computes a number.** Every degree, tithi, timestamp, dasha date, koot score and bala value comes from the deterministic Python engine. The LLM receives computed facts as JSON and may only phrase them. |
| N2 | The reference truth is **one named panchang** (see §2.3). Every panchang value is regression-tested against published almanac data with golden files. |
| N3 | **Amanta (अमांत) lunar month** and **Shalivahana Shaka** samvat are the defaults — Maharashtra convention, not Purnimanta/Vikram. Purnimanta is an option flag, never the default. |
| N4 | The Hindu day boundary is **sunrise, not midnight**. Vara, tithi-at-birth and nakshatra-at-birth are resolved against local sunrise. |
| N5 | All three locales (mr, hi, en) are first-class. No English-only screens, no machine-translated astrological terms. |
| N6 | Product language is **"traditional interpretation"**, never "prediction of the future". See §10. |

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router) + TypeScript + Tailwind              │
│  next-intl  ·  Devanagari-safe layout  ·  SVG chart renderer   │
└───────────────────────────┬──────────────────────────────────┘
                            │ typed REST (OpenAPI generated client)
┌───────────────────────────▼──────────────────────────────────┐
│  FastAPI (Python 3.12)  —  ORCHESTRATION ONLY                 │
│  validates input → calls engine → assembles ChartFacts JSON    │
└───────────┬───────────────────────────────────┬──────────────┘
            │                                   │
┌───────────▼─────────────────┐   ┌─────────────▼──────────────┐
│  DETERMINISTIC CORE          │   │  NARRATIVE LAYER (LLM)      │
│  pure functions, no I/O      │   │  Claude via Messages API    │
│  ephemeris · panchang ·      │   │  INPUT: ChartFacts JSON     │
│  vargas · dasha · bala ·     │   │  OUTPUT: prose only         │
│  doshas · milan              │   │  FORBIDDEN: arithmetic,     │
│  100% unit-tested            │   │  new numbers, new dates     │
└──────────────────────────────┘   └─────────────────────────────┘
```

`core/` must have **zero** dependency on FastAPI, the LLM client, or any locale file. It returns numbers and enum keys. Translation and phrasing happen strictly above it.

---

## 2. Stack decisions (resolve these before writing code)

### 2.1 Ephemeris — licensing is a real constraint

| Option | Licence | Consequence |
|---|---|---|
| `pyswisseph` (Swiss Ephemeris) | AGPL-3.0 **or** paid commercial licence | AGPL means a hosted web service must publish its source. Fine for open-source; a blocker for a closed commercial product unless you buy the commercial licence. |
| `skyfield` + JPL DE440s | MIT / permissive | No licence trap, but you implement ayanamsa, sidereal conversion, house cusps, tithi/nakshatra logic yourself. |

**Decision required from the owner before Phase 1.** Default assumption for this spec: `pyswisseph` under AGPL for v1, with the ephemeris access confined behind `core/ephemeris/adapter.py` so it can be swapped for Skyfield without touching any other module. **Write that adapter first.** Never call `swe.*` outside it.

### 2.2 Other choices

- Backend: FastAPI + Pydantic v2, `uv` for dependency management.
- Timezones: stdlib `zoneinfo` (IANA tzdata), pinned `tzdata` package. **Never** hand-code offsets.
- Geocoding: offline-first. Bundle a GeoNames extract of India (population > 500) + tz polygon lookup via `timezonefinder`. Online geocoder is a fallback only — the app must work offline for the top 20k Indian places.
- Frontend: Next.js 15, `next-intl`, SVG charts hand-rendered (no chart library — Vedic diamond layout has no library support).
- Fonts: Noto Sans Devanagari (mr/hi), Inter (en). Subset and self-host.
- Storage: Postgres + SQLAlchemy. Store **birth input + engine version**, never store derived values as source of truth — always recompute.
- PDF export: WeasyPrint with Devanagari-capable font embedding (test ligature and matra rendering explicitly — this breaks silently).

### 2.3 Panchang reference authority

Pick **one** and record it in `docs/PANCHANG_AUTHORITY.md`:

- **Date Panchang (दाते पंचांग)** — Drik-ganit based, widely used in Maharashtra.
- **Nirnaysagar Panchang**.
- **Kalnirnay** — highest household penetration; good consumer-expectation match.
- **Rashtriya Panchang** — Government of India; Chitrapaksha (Lahiri) ayanamsa, most defensible technically.

Different panchangs legitimately disagree by minutes on tithi end-times because of differing computational schools. **A "mismatch" is only a bug against the chosen authority.** Do not average them. Do not silently switch.

**Default ayanamsa: Lahiri / Chitrapaksha.** Expose Raman, KP and True Chitra as options; log which was used in every output.

---

## 3. Domain specification

### 3.1 Input contract

```python
class BirthInput(BaseModel):
    name: str                      # display + Namakaran check + optional numerology
    date: datetime.date            # proleptic Gregorian; Julian calendar for < 1752 if ever needed
    time: datetime.time | None     # None → degrade gracefully, see §4.6
    time_accuracy: Literal["exact", "approx_15min", "approx_1hr", "unknown"]
    place: PlaceRef                # lat, lon, elevation_m, iana_tz
    gender: Literal["m", "f", "other"] | None   # required only for Milan
    calendar_variant: Literal["amanta", "purnimanta"] = "amanta"
    ayanamsa: str = "lahiri"
    locale: Literal["mr", "hi", "en"] = "mr"
```

Reject silently-wrong input loudly: latitude beyond ±66.5° must warn that sunrise/sunset and hence tithi-at-birth may be undefined for some dates.

### 3.2 Panchang module (`core/panchang/`)

Compute for a given date + place:

1. **Tithi** — 30 per lunar month, from (Moon longitude − Sun longitude) / 12°. Return index, paksha (शुक्ल/कृष्ण), start and end timestamps, and whether the day carries a **kshaya** (skipped) or **vriddhi** (repeated) tithi.
2. **Vara** — weekday, boundary at **sunrise**.
3. **Nakshatra** — Moon longitude / 13°20′, plus **pada** (1–4, each 3°20′), start/end times.
4. **Yoga** — (Sun + Moon longitudes) / 13°20′, 27 yogas.
5. **Karana** — 60 half-tithis mapped to 11 karana names.

Also required:
- Sunrise, sunset, moonrise, moonset. **Specify and document the refraction and disc-centre convention** — this is the single largest source of minute-level drift versus published panchangs. Match the authority's convention.
- **Rahu Kaal, Gulika Kaal, Yamaganda** — day (sunrise→sunset) split into 8 equal parts; part index by weekday. [Likely] Sun→8, Mon→2, Tue→7, Wed→5, Thu→6, Fri→4, Sat→3. Verify against the authority; do not trust this table blind.
- **Abhijit Muhurta** — the 8th of 15 equal daytime divisions.
- **Marathi lunar month name** (चैत्र … फाल्गुन), **Shalivahana Shaka year**, adhika (अधिक) and kshaya (क्षय) month detection.
- Ritu (ऋतू), Ayana (उत्तरायण/दक्षिणायन), Sun's rashi ingress (संक्रांती).
- **Ishtakaal (इष्टकाल)** in ghati–pala from sunrise — traditional Marathi kundali sheets print this; omitting it will read as amateur to a Marathi user.

### 3.3 Chart module (`core/chart/`)

- Nirayana longitudes: `sidereal = tropical − ayanamsa`, normalised to [0, 360).
- **Lagna (ascendant)**: sidereal ascendant from local sidereal time and geographic latitude.
- Grahas: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, **Rahu and Ketu**. Rahu/Ketu default to **Mean node**; expose True node as an option and label which is used. Retrogression flag (वक्री) per graha. Combustion (अस्त) flag.
- **Houses: whole-sign (Rashi = Bhava) is the primary model.** Additionally compute a **Bhava Chalit** chart using Sripati cusps. Do **not** use Placidus.
- **Vargas (divisional charts)**: D1 Rashi, D2 Hora, D3 Drekkana, D4 Chaturthamsa, D7 Saptamsa, **D9 Navamsa** (mandatory — a Marathi kundali sheet always shows Rashi + Navamsa side by side), D10 Dasamsa, D12 Dwadasamsa, D16, D20, D24, D27, D30 Trimsamsa, D40, D45, D60 Shashtiamsa.
- **Chandra Kundali** (Moon as lagna) and **Surya Kundali**.
- **Ashtakavarga**: Bhinnashtakavarga per graha and Sarvashtakavarga totals. Row sums are invariants — assert them.
- **Shadbala**: Sthana, Dig, Kaala, Cheshta, Naisargika, Drik bala; return components, not just the total.
- Graha aspects (**दृष्टी**) by Vedic rules — full/partial by house distance, plus the special aspects of Mars (4,7,8), Jupiter (5,7,9), Saturn (3,7,10).
- Yogas/combinations as a **rule table in YAML**, not code: Gajakesari, Budha-Aditya, Kemadruma, Chandra-Mangal, Raja yogas, Panchamahapurusha. Each rule = machine-checkable predicate + evidence trace listing which grahas/houses triggered it.

### 3.4 Dasha module (`core/dasha/`)

**Vimshottari** is primary. Keyed to the Moon's nakshatra and the elapsed fraction within it.

Lord order and years — hard-code as a test vector, total must equal 120:

| Ketu | Venus | Sun | Moon | Mars | Rahu | Jupiter | Saturn | Mercury |
|---|---|---|---|---|---|---|---|---|
| 7 | 20 | 6 | 10 | 7 | 18 | 16 | 19 | 17 |

Nakshatra→lord cycle begins Ashwini = Ketu and repeats every 9 nakshatras.

- Compute Mahadasha → Antardasha → Pratyantardasha → Sookshma (4 levels).
- Use a **360-day savana year or the 365.2425-day solar year — pick one, document it, and match the authority.** This choice shifts dasha dates by months. It is the most common silent divergence between two "correct" kundali apps.
- Optional systems behind flags: Ashtottari (108y), Yogini (36y), Char dasha.

### 3.5 Doshas and Milan

- **Mangal / Kuja dosha** — support the differing house-set schools (1/4/7/8/12 vs regional variants) as configurable rule sets; state which was applied.
- **Kaal Sarpa**, **Pitra dosha**, **Shani Sade Sati** (Saturn transiting 12th/1st/2nd from Moon rashi, with current phase and exit date), **Nadi dosha**.
- **Guna Milan (Ashtakoot), 36 points**: Varna 1, Vashya 2, Tara 3, Yoni 4, Graha Maitri 5, Gana 6, Bhakoot 7, Nadi 8. Output per-koot score with the reason, plus Bhakoot and Nadi exception rules — never a bare total.

### 3.6 Name handling

Be explicit that `name` has three narrow, honest uses. Do not inflate it:

1. Display and PDF titling.
2. **Namakaran syllable check** — the traditional first-syllable set for the birth nakshatra-pada; report match/mismatch as information, not as a defect.
3. Optional numerology (Chaldean and Pythagorean), clearly labelled as a **separate non-Jyotish system** in a collapsed panel.

---

## 4. Correctness traps — read before implementing

These are where this class of app actually fails. Each needs an explicit test.

### 4.1 Historical Indian time offsets
IST (UTC+05:30) was not always in force. Bombay Time (≈UTC+04:51) and Calcutta Time persisted into the mid-20th century, and India ran wartime DST in the 1940s. A birth certificate from 1948 Pune may record local mean time. `zoneinfo` with `Asia/Kolkata` handles documented transitions **if you localise the naive datetime with the historical date** — never apply a fixed +5:30. Add an explicit `time_standard` input: `["clock_time_as_recorded", "lmt", "ist"]`.

### 4.2 Sunrise-based day roll
A birth at 02:30 on 5 Shravan belongs to the **vara and tithi of the 4th**. Compute sunrise for the birth place, and if birth time < sunrise, roll the Hindu date back one day. Golden-test with a pre-dawn birth.

### 4.3 Tithi at birth ≠ tithi of the day
The day's headline tithi is the one running at sunrise. The tithi **at the moment of birth** may differ. Both must be reported, separately labelled.

### 4.4 Kshaya and adhika months
An adhika (intercalary) month occurs when no solar ingress falls within a lunar month; kshaya months are rare but real. Month naming logic must handle both, and Amanta/Purnimanta differ in which month gets the name. Test against a known adhika-Ashadha year.

### 4.5 Ayanamsa version drift
Swiss Ephemeris has had multiple "Lahiri" definitions and offers True Chitra. Pin the ayanamsa flag constant, record it in output metadata, and treat any change as a breaking engine-version bump.

### 4.6 Unknown or fuzzy birth time
Do not silently default to 12:00. If `time is None`:
- Suppress Lagna, houses, Bhava-dependent yogas, dasha dates, and Ishtakaal.
- Show only what is time-robust that day: rashi placements with an explicit uncertainty note, Moon rashi with a caveat if it changes that day.
- If `time_accuracy != "exact"`, run the chart at the bounds of the stated window and **flag every field that changes**. Show the flags in the UI.

### 4.7 Floating point and normalisation
Wrap all longitudes through one `norm360()`. Compare angles with a tolerance, never `==`. Store timestamps as UTC-aware; convert at the presentation edge only.

### 4.8 Retrograde and stationary nodes
Mean nodes are always retrograde; True nodes can appear stationary or direct. Your retrogression display logic must not assert "all nodes retrograde".

---

## 5. `ChartFacts` — the contract between engine and narrative

One versioned JSON document. The LLM sees **only this**. Sketch:

```json
{
  "engine_version": "1.0.0",
  "ephemeris": {"provider": "swisseph", "version": "2.10.03", "ayanamsa": "lahiri", "ayanamsa_value_deg": 24.1832},
  "authority": "date_panchang",
  "input": { "...": "echoed, with resolved tz and offset actually applied" },
  "confidence": {"birth_time": "exact", "affected_fields": []},
  "panchang": {
    "hindu_date": {"shaka_year": 1948, "month_key": "shravana", "paksha": "shukla", "tithi_index": 5},
    "tithi_at_sunrise": {"key": "panchami", "start_utc": "...", "end_utc": "..."},
    "tithi_at_birth":   {"key": "panchami"},
    "nakshatra_at_birth": {"key": "mula", "pada": 2, "lord": "ketu", "end_utc": "..."},
    "yoga": {"key": "..."}, "karana": {"key": "..."},
    "sunrise_utc": "...", "sunset_utc": "...",
    "rahu_kaal": {"start_utc": "...", "end_utc": "..."},
    "ishtakaal": {"ghati": 21, "pala": 34}
  },
  "chart": {
    "lagna": {"rashi": 7, "deg_in_rashi": 12.44, "nakshatra": "...", "pada": 3},
    "grahas": [
      {"key": "mars", "sid_lon": 245.318, "rashi": 9, "deg_in_rashi": 5.318,
       "nakshatra": "...", "pada": 1, "house_whole_sign": 3, "house_chalit": 3,
       "retrograde": false, "combust": false, "dignity": "own_sign", "shadbala": {"...": 0}}
    ],
    "vargas": {"D9": { "...": "..." }},
    "ashtakavarga": {"sarva": [28, 31, "..."]}
  },
  "yogas_present": [
    {"key": "gajakesari", "strength": "strong",
     "evidence": ["jupiter_in_house_4_from_moon", "both_unafflicted"]}
  ],
  "doshas": [{"key": "mangal_dosha", "present": true, "ruleset": "north_school", "evidence": ["mars_in_house_7"]}],
  "dasha": {
    "system": "vimshottari", "year_length": "solar_365.2425",
    "current": {"maha": "saturn", "antar": "mercury", "pratyantar": "venus",
                "maha_start_utc": "...", "maha_end_utc": "..."},
    "timeline": [{"level": 1, "lord": "saturn", "start_utc": "...", "end_utc": "..."}]
  }
}
```

**Every `key` is a stable machine identifier.** No Devanagari, no English prose inside `ChartFacts`. Locale files map keys → mr/hi/en strings.

Validate `ChartFacts` with a JSON Schema in CI. A schema change is a major version bump.

---

## 6. Narrative layer contract

The LLM call is a pure function: `ChartFacts + section + locale → prose`.

System prompt requirements for that call:

1. You will receive a computed Jyotish chart as JSON. **Treat every number and date as authoritative and immutable.** Do not recompute, adjust, round, or infer any figure not present.
2. You may only reference placements, yogas and doshas that appear in the JSON. If asked about something absent, say the chart does not support a statement on it.
3. Cite the `evidence` array when you make an interpretive claim, so the user can see which placement drove it.
4. Write in the requested locale using the supplied glossary terms verbatim. Do not translate technical terms yourself.
5. Frame output as **traditional Jyotish interpretation**, using conditional language. State that this is a classical interpretive framework, not an empirically validated forecast.
6. **Never** produce statements about: date or manner of death, lifespan, terminal or specific medical diagnoses, pregnancy or fertility outcomes, mental-health diagnoses, the outcome of litigation or criminal matters, or advice to stop medical treatment. On these, return the refusal string from the locale file.
7. Never assert marital incompatibility as a verdict. Present koot scores and traditional remedies as information.

Enforce 6 and 7 with a **post-generation validator in code**, keyed to a blocklist per locale. Do not rely on the prompt alone.

Cache narrative by `hash(ChartFacts_subset + section + locale + prompt_version)`. Identical charts must not produce drifting text.

---

## 7. Internationalisation

Three locales: `mr` (default), `hi`, `en`. Separate namespaces: `common`, `panchang`, `rashi`, `nakshatra`, `graha`, `yoga`, `dosha`, `dasha`, `ui`, `legal`.

**Curate all terms by hand.** Marathi and Hindi diverge on real terms — machine translation will produce Hindi-flavoured Marathi that a Maharashtrian user notices immediately.

| Concept | मराठी (mr) | हिन्दी (hi) | English |
|---|---|---|---|
| Birth chart | जन्मकुंडली / जन्मपत्रिका | जन्मकुंडली | Natal chart |
| Sign | रास | राशि | Rashi / sign |
| Libra | तूळ | तुला | Libra |
| Planet | ग्रह | ग्रह | Graha |
| Mars | मंगळ | मंगल | Mars |
| Saturn | शनी | शनि | Saturn |
| Lunar day | तिथी | तिथि | Tithi |
| Nakshatra #19 | मूळ | मूल | Mula |
| Nakshatra #24 | शततारका | शतभिषा | Shatabhisha |
| Inauspicious period | राहूकाळ | राहुकाल | Rahu Kaal |
| Ascendant | लग्न | लग्न | Lagna |
| Retrograde | वक्री | वक्री | Retrograde |
| Compatibility | गुणमेलन / पत्रिका जुळवणी | गुण मिलान | Guna Milan |

Enumerate **all** of: 12 rashis, 27 nakshatras (+ 4 padas each), 12 Amanta month names, 30 tithis, 27 yogas, 11 karanas, 9 grahas, 12 bhavas — in all three locales. Marathi month names: चैत्र, वैशाख, ज्येष्ठ, आषाढ, श्रावण, भाद्रपद, आश्विन, कार्तिक, मार्गशीर्ष, पौष, माघ, फाल्गुन.

Also required:
- Numeral toggle: Devanagari (०–९) vs Latin (0–9).
- A locale sanity CI check: fail the build if any key is missing in any locale, or if an `mr` value is byte-identical to its `hi` value for keys in the known-divergent list above.
- Verify Devanagari conjunct rendering in the PDF pipeline — matras and ligatures break silently in some font/renderer combinations.

---

## 8. UI specification

- **Chart style: North Indian diamond (fixed houses, rotating signs)** as the default — this is the Maharashtra convention. Offer South Indian square as a toggle. Render as hand-built SVG; both layouts must be printable at A4 without reflow.
- Rashi and Navamsa charts side by side on the main kundali view.
- **Panchang card** for the birth date: five limbs with start/end times, Shaka year and Amanta month, Rahu Kaal, Ishtakaal.
- **Dasha timeline**: collapsible 4-level tree, with "today" marker.
- Every interpretive paragraph carries a small **"why" affordance** exposing the `evidence` array from `ChartFacts`. This is what separates a credible tool from a fortune-cookie app.
- Confidence banner whenever `birth_time` is not exact, listing the affected fields.
- PDF export of a traditional kundali sheet, locale-aware.
- Accessibility: the diamond chart needs a semantic table alternative for screen readers.

---

## 9. Test strategy

Tests are the deliverable, not an afterthought.

1. **Golden panchang files** — at least 60 date/place pairs transcribed from the chosen published authority, spanning: an adhika month, a kshaya tithi, a vriddhi tithi, both solstices, a pre-dawn birth, a high-latitude place, a pre-1955 date, and a wartime-DST date. Assert to the minute.
2. **Ephemeris invariants** — Rahu and Ketu exactly 180° apart; varga assignments partition each rashi correctly; Ashtakavarga row sums; Vimshottari total = 120 years; all dasha spans contiguous with no gaps or overlaps.
3. **Property tests** (Hypothesis) — random dates over ±200 years: no crash, all longitudes in [0,360), tithi index in 1–30, monotonic dasha timeline.
4. **Cross-check** a handful of full charts against a second independent implementation, documenting each divergence as either a school difference or a bug.
5. **Narrative validator tests** — the blocklist rejects prohibited content in all three locales.
6. **Snapshot tests** on rendered SVG charts.
7. CI gates: schema validation, locale completeness, ruff + mypy strict on `core/`, coverage ≥ 90% on `core/`.

---

## 10. Legal, ethical and product framing

Lead with this in the product, do not bury it.

- Describe the app as a **traditional Jyotish interpretation tool**. Avoid "predicts your future", "guaranteed", "accurate forecast". This is both honest and lowers regulatory and app-store risk.
- Persistent disclaimer in all three locales: entertainment and cultural/traditional interpretation; not a substitute for medical, legal, financial or psychological advice.
- Hard content prohibitions per §6.6, enforced in code.
- **Data protection**: birth date, time, place and name together are sensitive personal data under India's DPDP Act and under GDPR if you serve EU users. Requirements: explicit consent, stated purpose, encryption at rest, export and delete endpoints, retention policy, and no third-party analytics on the birth-input screens.
- No dark patterns around paid "remedy" upsells — this category is notorious for exploiting anxiety. If monetising, sell the report or a subscription, never an escalating fear ladder.

---

## 11. Phased build plan for Claude Code

Run these as separate sessions. Do not let a single session attempt more than one phase.

**Phase 0 — Skeleton and decisions.**
Scaffold the monorepo (`core/`, `api/`, `web/`, `tests/`, `docs/`). Write `docs/DECISIONS.md` capturing: ephemeris licence choice, panchang authority, ayanamsa, dasha year length, node type, sunrise convention. Set up CI with the gates from §9.7. **Write no domain logic in this phase.**

**Phase 1 — Ephemeris adapter + panchang.**
Implement `core/ephemeris/adapter.py` with a narrow interface (`sid_lon(body, jd)`, `sunrise(date, place)`, …). Then the five panchang limbs, sunrise/sunset, Rahu Kaal, Amanta month naming, Shaka year, Ishtakaal. Deliver with the 60 golden files from §9.1 **passing**. Stop and report any golden-file mismatch with the numeric delta before proceeding — do not tune constants to force a pass without explaining the physical reason.

**Phase 2 — Chart engine.**
Lagna, nine grahas, whole-sign and Chalit houses, D1 + D9 first, then remaining vargas, aspects, dignities, Ashtakavarga, Shadbala. Emit a schema-valid `ChartFacts`.

**Phase 3 — Dasha, yogas, doshas, milan.**
Vimshottari to 4 levels. Yoga and dosha rules as YAML with evidence traces. Ashtakoot milan with per-koot reasoning.

**Phase 4 — API + narrative layer.**
FastAPI endpoints, OpenAPI spec, the LLM narrative function with the §6 system prompt, the post-generation validator, and response caching.

**Phase 5 — Frontend.**
Locale files first (all three, complete), then the SVG diamond chart, panchang card, dasha tree, evidence affordances, confidence banners, PDF export.

**Phase 6 — Hardening.**
Property tests, cross-implementation comparison, DPDP/GDPR endpoints, performance (full chart < 200 ms server-side), offline geocoder bundling.

### Suggested slash commands

| Command | Purpose |
|---|---|
| `/golden-add <date> <place>` | Scaffold a new golden panchang case from transcribed almanac values. |
| `/golden-verify` | Run panchang goldens and print a per-field delta table in minutes. |
| `/facts-dump <birth>` | Print the full `ChartFacts` JSON for a birth input. |
| `/locale-audit` | List missing keys and suspicious mr==hi duplicates. |
| `/rule-add <yoga>` | Add a yoga/dosha rule to YAML with its predicate and classical citation. |
| `/narrative-test` | Run the prohibited-content validator across all locales. |

### Standing instructions for every session

- Ask before inventing a convention. If the spec is silent on a computational school, **stop and ask** — do not pick one silently.
- Every commit that changes a computed value must state the numeric before/after and the reason.
- Never move a threshold or constant to make a test pass. Explain the discrepancy instead.
- Add a golden case for every bug you fix.

---

## 12. Definition of done for v1

- 60/60 golden panchang cases match the named authority to the minute, with any documented school divergences listed explicitly in `docs/DIVERGENCES.md`.
- A full chart for an exact birth time renders Rashi + Navamsa + panchang + 4-level Vimshottari in all three locales, and exports to a print-clean PDF with correct Devanagari rendering.
- Every interpretive sentence in the UI can be traced to a placement via the evidence affordance.
- Prohibited-content validator blocks all §6.6 categories in mr, hi and en.
- `core/` has ≥ 90% coverage, passes mypy strict, and imports nothing from `api/` or the LLM client.
- Ephemeris licence position is documented and consistent with the intended distribution model.
