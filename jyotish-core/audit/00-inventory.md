# PASS 0 — Inventory and convention extraction

No judgment in this file. Everything below is read out of source, not documentation.
Where the docs and the code disagree the code is recorded and the disagreement is
carried to `FINDINGS.md`.

## Module map

| Layer | Path | Computes |
|---|---|---|
| Ephemeris seam | `core/ephemeris/swisseph_adapter.py` | the only module that may `import swisseph` |
| Panchang | `core/panchang/{limbs,solar,month,day,kaal,ishtakaal,ritu,solver}.py` | five limbs, rise/set, kaals, Amanta month, Shaka, Ishtakaal |
| Chart | `core/chart/{assemble,dignity,houses,vargas,aspects,ashtakavarga,shadbala}.py` | lagna, 9 grahas, houses, 16 vargas, drishti, BAV/SAV, 6 balas |
| Dasha | `core/dasha/vimshottari.py` | 4-level Vimshottari |
| Rules | `core/rules/engine.py` + `core/rules/data/*.yaml` | 33 yoga/dosha rules with evidence |
| Doshas | `core/doshas/computed.py` | Kaal Sarpa, Sade Sati, Nadi |
| Milan | `core/milan/ashtakoot.py` | 8 koots + exceptions |
| Contract | `core/facts/{builder,validate}.py` + `schema/chartfacts-1.0.0.schema.json` | ChartFacts |
| Orchestration | `api/` | validate → call engine → assemble; no computation |
| Narrative | `narrative/{prompt,projection,client,service,validator}.py` | prose only |
| Render | `render/{chart_svg,adapter,pdf}.py` | one SVG geometry, shared by web + PDF |
| Frontend | `web/` | Next.js 15, next-intl, reads `locales/` directly |

### Where the deterministic/LLM boundary actually sits

`narrative/` is the only package that talks to a model. Verified mechanically, not
by inspection:

* `tests/unit/test_boundaries.py` walks the AST of every module in `core/` and
  fails on any import of `api`, `narrative`, `render`, `fastapi`, `pydantic`,
  `anthropic`, `sqlalchemy`, `weasyprint`. Re-run during this audit: **clean**.
* The model's output is never written back into a numeric field. The single
  numeric coupling runs the *other* way: `narrative/validator.py` extracts every
  numeric token from generated prose and rejects the section unless the number
  appears in the facts the model was shown.

**No place found where an LLM output feeds a numeric field.** This is the one
architectural claim in the project that the audit could fully confirm.

## Declared vs actual conventions

| Convention | Docs claim | Code actually does | File:line |
|---|---|---|---|
| Ayanamsa | Lahiri/Chitrapaksha, `SE_SIDM_LAHIRI` (D3) | `swe.SIDM_LAHIRI`; **verified genuinely Lahiri, not True Chitra** (57–63″ apart) | `core/ephemeris/swisseph_adapter.py:47` |
| Ayanamsa + nutation | true equinox (D13) | `get_ayanamsa_ex_ut(jd, flags)`, nutation included | `swisseph_adapter.py:143–155` |
| Ephemeris | pyswisseph 2.10.03, Moshier (D1/D7) | `FLG_MOSEPH` unless `JYOTISH_EPHE_PATH` set | `swisseph_adapter.py:115` |
| Lunar month | Amanta default (N3) | `CalendarVariant.AMANTA` default | `core/types.py`, `core/panchang/month.py` |
| Samvat | Shalivahana Shaka (N3) | `shaka_year_for()` | `core/panchang/month.py` |
| Sunrise convention | upper limb, refracted (D6) | `DiscConvention.UPPER_LIMB_REFRACTED` → no extra swisseph bits; std atmosphere 1013.25 mbar / 15 °C | `swisseph_adapter.py:73–84` |
| **Elevation in rise/set** | **not mentioned anywhere** | **passed to `swe.rise_trans` and has zero effect — measured** | `swisseph_adapter.py:252` → **F-007** |
| Day boundary | sunrise (N4) | `resolve_hindu_date()` rolls back if birth < sunrise | `core/panchang/solar.py` |
| Node type | Mean (D4) | `NodeType.MEAN`; Ketu derived as Rahu+180° | `swisseph_adapter.py:110`, `_opposite()` |
| House system | whole-sign primary, Sripati Chalit secondary (D9) | both; **no rule reads `chalit`** — verified | `core/chart/houses.py`; grep clean |
| Vimshottari year | 365.2425 d (D5) | `YEAR_DAYS[SOLAR_365_2425] = 365.2425`, one constant used at all four levels | `core/dasha/vimshottari.py:52–55` |
| Dasha balance method | keyed to unelapsed nakshatra fraction | **longitude-based**, `within/13°20′` — matches AUDIT §3.5 exactly, not time-based | `core/angles.py:79`, `vimshottari.py:189` |
| Timezone, pre-1955 | "zoneinfo handles documented transitions" (CLAUDE.md 4.1) | `Asia/Kolkata` only. Wartime DST correct; **Bombay Time unreachable** | `core/timeutil.py:143–157` → **F-004** |
| Mangal ruleset | `maharashtra` 1/4/7/8/12 (D10) | as claimed; 3 rulesets, applied one echoed | `core/rules/data/doshas.yaml:17–48` |
| Ashtakoot exceptions | Bhakoot + Nadi, reported not folded in | present, reported beside the total; **Nadi cannot test pada** | `core/milan/ashtakoot.py:391–462` → **F-009** |

## Domain constants and their provenance

| Constant | Value | Provenance in code |
|---|---|---|
| `VIMSHOTTARI_YEARS` | 7/20/6/10/7/18/16/19/17 = 120 | cited, asserted = 120 |
| `EXALTATION` | Sun 1/10°, Moon 2/3°, Mars 10/28°, Mer 6/15°, Jup 4/5°, Ven 12/27°, Sat 7/20° | matches standard Parashari |
| `MOOLATRIKONA` | Sun 5/0–20, Moon 2/4–30, Mars 1/0–12, Mer 6/16–20, Jup 9/0–10, Ven 7/0–15, Sat 11/0–20 | matches standard — but Moon and Mercury rows are **unreachable** (F-003) |
| `COMBUSTION_ORB` | Moon 12, Mars 17, Mer 14/12ᴿ, Jup 11, Ven 10/8ᴿ, Sat 15 | matches the standard table; **no chapter cited** |
| `SPECIAL_FULL_ASPECTS` | Mars 4/7/8, Jup 5/7/9, Sat 3/7/10 | correct; sign-based, no Western orbs |
| `NAISARGIKA_RANK` | 60/51.43/42.86/34.29/25.71/17.14/8.57 | = 60/7 × rank, correct |
| `_TRIMSAMSA_ODD/EVEN` | 5/5/8/7/5 and reversed | correct asymmetry, the case AUDIT §4 calls "commonly wrong" |
| `EXPECTED_SAV_TOTAL` | 337 | asserted, holds |
| `graded_drishti_virupa` piecewise scale | 5 segments over 30–180° | **UNCITED** (F-022) |
| Rahu/Gulika/Yamaganda weekday rows | 8,2,7,5,6,4,3 etc. | flagged `NEEDS_AUTHORITY_VERIFICATION` in code; unverified (O3) |
| `_ATMOS_PRESSURE_MBAR` / `_ATMOS_TEMP_C` | 1013.25 / 15.0 | ICAO sea-level, stated |
| `JD_FLOAT_RESOLUTION_SECONDS` | 5e-5 | derived and documented |

## Conventions with zero tests

| Convention | Test coverage |
|---|---|
| Elevation's effect on rise/set | **none** — and it has no effect (F-007) |
| Bombay Time / pre-1955 Mumbai | **none** — the golden `pre_1955` case is PENDING, so nothing exercises it |
| Rahu Kaal weekday table vs authority | structural only (no two collide); no authority test |
| Dignity label at an exaltation *degree* boundary | **none** — F-003 went undetected |
| Rule-key → locale term coverage | **none** — F-005 went undetected |
| Sade Sati determinism | **none** — F-001 went undetected |
| Graded drishti scale | shape tested; values uncited |
| Ayanamsa vs authority | **BLOCKED** (no almanac) |
