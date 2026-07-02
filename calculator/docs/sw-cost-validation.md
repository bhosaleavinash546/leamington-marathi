# Automotive SW Should-Cost — Model Validation

This document records how the cost model is validated, against what, and where it
is known to be wrong. It exists because "benchmarks-as-truth" was the model's
weakest link: previously the engine produced a single number with no statement of
its own error. The validation harness (`src/engine/sw-validation.ts`,
`npm test` → `tests/sw-validation.test.ts`) now back-tests the engine and
**publishes the variance**.

## Method

For each reference programme we configure the engine with that programme's known
macro cost drivers — development **region**, **dev source** (OEM / Tier-1 /
startup), **annual production volume**, and **programme life** — over the full
43-module premium-EV stack, then compute:

```
variance% = (modelled − published) / published × 100
```

We report per-case variance plus the **MAPE** (mean absolute percentage error)
across the set, and how many programmes fall inside a **±35%** band (a standard
should-cost tolerance for a parametric, pre-quote estimate).

## Honesty caveats

- The published figures are **third-party estimates** (analyst reports, teardown
  studies), **not audited internal actuals**. They themselves carry ~±20% error.
- The per-programme configs are **public approximations**, not the programmes'
  real configurations.
- Therefore this is **envelope validation**, not a proof of point accuracy.

The harness is structured to ingest a **real actual** the moment one is available:
replace a case's `publishedTotalGBP` with the measured value and set
`confidence: 'High'`. One real number meaningfully tightens the calibration.

## Current results (v1.0 rate library)

| Metric | Result |
|---|---|
| Reference programmes | 7 (BMW iX, Taycan, EQS, Range Rover L460, Tesla Model S HW4, Audi Q8 e-tron, Lucid Air) |
| **Total SW investment MAPE** | **~21.5%** |
| Within ±35% band | **6 / 7** |
| Worst case (total) | Lucid Air +68% (very-low-volume startup — hardest to model) |

**Verdict:** on the metric the model is calibrated to — total SW investment —
it tracks the published envelope within should-cost norms. The single outlier is
a low-volume startup programme, where parametric models are expected to be weak.

## Known gap — per-vehicle amortisation (NOT yet closed)

The per-vehicle figure validates **poorly** (MAPE ~76%): the model's £/vehicle is
roughly **5× lower** than published figures.

**Root cause:** the engine amortises NRE over the **full lifetime** volume
(`annualProductionVolume × programLifeYears` ≈ 600k+ units). The published
£/vehicle figures imply a much smaller recovery base — back-solving
`publishedTotal ÷ publishedPerVehicle` gives **~50k–270k units (≈ 2 years of
volume)**, consistent with the industry convention of recovering SW NRE over a
defined early-life **cost-recovery window**, not the whole programme.

**Implication:** the *total* programme cost is sound; the *per-vehicle* headline
is structurally understated against industry convention.

**Proposed fix (future):** introduce an explicit `nreRecoveryYears` parameter
(default ~2–3) and amortise NRE over `annualProductionVolume × nreRecoveryYears`,
while lifecycle (maintenance/cloud) continues to spread over full life. This is a
headline-number methodology change and is tracked separately rather than silently
tuning the model to fit this test.

## Running it

```
npm test            # includes the validation back-test
```

The in-app **"🔬 Model Validation"** panel renders the same variance table so the
figure is visible to users, not buried in the test suite.
