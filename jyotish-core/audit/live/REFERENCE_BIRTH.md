# REFERENCE BIRTH — Workstream C (REVIEW-360 §3, C1)

Chosen to stress the system, not to be convenient. Every preferred property in
C1 that can be satisfied simultaneously is satisfied:

| Field | Value |
|---|---|
| Name | संदर्भ जातक (sample identity, not a real person) |
| Date | **1947-08-02** (proleptic Gregorian) |
| Clock time | **04:30**, `time_accuracy: exact`, `time_standard: clock_time_as_recorded` |
| Place | पुणे / Pune — 18.5204 N, 73.8567 E, 560 m, `Asia/Kolkata` |
| Locale | mr, amanta, Lahiri (defaults) |

## Why this birth

- **Pre-dawn** — 04:30 against a computed sunrise of 06:11:45 IST, so the Hindu
  day must roll back to 1947-08-01 (trace step 8).
- **Adhika month** — the engine places 1947-07-18 → 1947-08-16 inside **अधिक
  श्रावण**; the birth sits on its शुक्ल पौर्णिमा. *Circularity caveat: the
  adhika classification is the engine's own; दाते पंचांग for Shaka 1869 must
  confirm it, and that confirmation is part of the step-11 check, not assumed.
  Partially derisked since: the supplied शक १९४० almanac's अधिक ज्येष्ठ 2018
  headers match `lunar_month_at` exactly (`ALMANAC.md`), so the* logic *is
  validated at epoch; the 1947* instance *still needs its own page.*
- **Pre-1955** — the Bombay Time question is live: local mean time for Pune is
  UTC+4:55:26 while the tz database applies +5:30, a 34.6-minute gap the engine
  must surface rather than resolve silently (D20).
- **दाते पंचांग availability** — 1947 is within the almanac's published run.
  Sourcing the printed page is the owner's task; `docs/UNBLOCKING.md` §values
  lists exactly what to photograph.

## What this birth cannot exercise

Wartime DST (+6:30) ended 1945-10-15, so no single birth can carry both the
adhika month and the DST offset. The tz-database evidence for the DST era is
recorded in TRACE.md step 3 via probe dates instead.
