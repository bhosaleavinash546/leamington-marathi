# TRACE — Workstream C (REVIEW-360 §3, C2), steps 1–5

Reference birth: `REFERENCE_BIRTH.md`. Each step: **input → operation → output →
external check → verdict**. Session 3 covers steps 1–5 and its gate is step 5;
steps 6–23 are deliberately not run until it passes (§9).

Reproduce any engine value here with:
`POST /v1/chart` with the reference payload (or `fastapi.testclient` against
`api.main:app` — no network needed).

---

## Step 1 — Raw input capture

- **Input:** the C1 payload, verbatim.
- **Operation:** `POST /v1/chart` → `facts.input`.
- **Output:** every field echoed byte-for-byte — `date: 1947-08-02`,
  `time: 04:30:00`, `time_accuracy: exact`,
  `time_standard: clock_time_as_recorded`, place name/coords/tz as given,
  `gender: null` as given. The engine *added* `resolved_utc_offset_seconds`,
  `lmt_utc_offset_seconds` and `birth_utc`; it changed nothing.
- **External check:** field-by-field diff against the submitted JSON.
- **Verdict: PASS.** No silent defaulting: the time is the given time (CLAUDE.md
  4.6 forbids a noon default, and none appeared); `calendar_variant: amanta` is
  the declared contract default, present in the echo rather than injected
  downstream.

## Step 2 — Place → lat/lon/elevation/IANA tz

- **Input:** पुणे, 18.5204 N, 73.8567 E, 560 m, `Asia/Kolkata`.
- **Operation:** coordinates are caller-supplied on this endpoint; the offline
  geocoder (`/v1/places?q=pune`) resolves the same city to 18.5204, 73.8567,
  560 m, `Asia/Kolkata` from the bundled GeoNames extract.
- **External check:** direct fetch of geonames.org and Wikipedia was blocked by
  this environment's proxy (HTTP 403). A web search returned the GeoNames-derived
  record for id 1259229: **18.52043 N, 73.85674 E**
  (dateandtime.info/citycoordinates.php?id=1259229; latitude.to gives
  18.5196/73.8554 for a nearby city point). Delta against our input:
  ≈0.00003° ≈ **3 m**.
- **Verdict: PASS** on coordinates and tz (search-snippet evidence, not the
  gazetteer page itself — the page fetch is the cleaner re-check when done from
  an unproxied machine). **Elevation 560 m: NOT VERIFIED** — no independent
  figure was retrievable here; settle with any topographic gazetteer entry for
  Pune.

## Step 3 — Local clock time → UTC

- **Input:** 1947-08-02 04:30, `clock_time_as_recorded`, `Asia/Kolkata`.
- **Operation:** `zoneinfo` localisation with the historical date.
- **Output:** `resolved_utc_offset_seconds: 19800` (+05:30) — **printed, as the
  brief demands** — giving `birth_utc: 1947-08-01T23:00:00Z`. Alongside it:
  `lmt_utc_offset_seconds: 17726` (Pune longitude × 240 s/deg = 17725.6 → 17726)
  and the warning **`pre_1955_indian_clock_time_ambiguous`**, because the
  34.6-minute clock-vs-LMT gap means a 1947 Pune record may be LMT (D20 reports
  the ambiguity rather than resolving it silently).
- **External check — tzdb, not a constant:** probing the same code path across
  the wartime era yields offsets a hard-coded +5:30 cannot produce:
  `1941-09-01 → +5:30 · 1942-09-01 → +6:30 · 1944-06-01 → +6:30 ·
  1945-10-16 → +5:30 · 1947-08-02 → +5:30`. The +6:30 years are the tz
  database's wartime entries being honoured.
- **Verdict: PASS.**

## Step 4 — UTC → Julian Day

- **Input:** 1947-08-01T23:00:00Z.
- **Operation:** engine `core.timeutil.jd_from_utc`.
- **Output:** JD **2432399.4583333335**.
- **External check — hand calculation**, Fliegel–Van Flandern, no engine
  imports: y=1947, m=8, d=1 → JDN 2432399 (noon); 23:00 UT → JDN − 0.5 + 23/24 =
  **2432399.4583333335**. Delta: **0.0 seconds**.
- **Verdict: PASS.**

## Step 5 — Ayanamsa at the birth instant  ⛔ THE GATE

- **Input:** JD 2432399.458333, ayanamsa `lahiri` (`SE_SIDM_LAHIRI`, nutation
  included — both disclosed in `facts.ephemeris`).
- **Output:** **23.12131° = 23°07′17″**.
- **Supporting internal checks** (necessary, not sufficient):
  - The four exposed flags discriminate at this instant — Lahiri 23°07′17″,
    True Chitra 23°06′17″, Raman 21°40′30″, KP 23°01′28″ — so the constant is
    genuinely the Lahiri family, not a mislabeled flag (consistent with the
    Spica-at-180° root check in `audit/01-panchang-deltas.md`).
  - Secular sanity: Lahiri's published 1900.0 value plus ~50.3″/yr of accumulation
    lands at ≈23°07′ for 1947.6, matching to the arcminute.
- **External check:** **दाते पंचांग's printed ayanamsa for Shaka 1869 /
  1947.** `BLOCKED` — the almanac page is not sourceable from this environment,
  and standing rule 3 forbids padding the verdict. What settles it: a photograph
  of the अयनांश line from any 1947 issue (or the nearest printed year, propagated
  at 50.3″/yr); `docs/UNBLOCKING.md` describes the lookup.
- **Verdict: BLOCKED.** Per §9 session 3 — "Ayanamsa matches Date Panchang. If
  not, stop" — **the trace stops here.** Steps 6–23 are not run, because running
  them before the gate would manufacture the confident, fictional report §9
  warns about.

---

## Standing observations from steps 1–5

- The engine's honest-ambiguity behaviour (step 3) is a *feature* under this
  trace: a competitor that silently applies +5:30 to a 1947 Bombay-Presidency
  birth moves the lagna by up to ~8° — the practitioner-visible failure class.
- Every disclosed convention the trace needs later (node type, sunrise
  convention, dasha year length) is already in `facts.ephemeris` from step 1's
  single call — steps 6–23 need no new instrumentation, only the gate.
