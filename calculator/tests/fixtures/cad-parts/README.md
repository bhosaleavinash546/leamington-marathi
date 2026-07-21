# CAD golden parts — feature-detection eval fixtures

Turns "does the geometry engine detect the right features?" into a measured,
regression-guarded number (see `tests/cad-golden-parts.test.ts`).

## Layout — one triple per part
- `<part>.truth.json`       — hand-verified **design intent** (copy `truth.template.json`)
- `<part>.prediction.json`  — the geometry engine's **recorded output** for that part
- `<part>.step`             — the source model

Predictions are recordings, so CI scores them **without needing cadquery**.

## Add / refresh parts
1. Add a builder to `scripts/gen-cad-golden.py` (or drop a real `.step` in here).
2. `npm run gen:cad-golden` — (re)writes every `*.prediction.json` from the engine.
   Needs cadquery (a glibc env; not CI). It never overwrites `*.truth.json`.
3. Write/adjust `<part>.truth.json` to the true design intent and commit all three.

## Scoring
Per-kind and overall feature **precision / recall / F1** (counts as multisets —
over-counting lowers precision, misses lower recall), plus volume error %.
`CAD_GOLDEN_MIN_F1` (set in CI) enforces an aggregate F1 floor.

## Known nuance
`flange-6holes-boss` scores boss precision 0.875: the engine counts the disc OD
as a turned shaft feature (2) on top of the 1 design boss. Design-intent truth is
kept at 1, so the fixture *measures* this rather than hiding it.
