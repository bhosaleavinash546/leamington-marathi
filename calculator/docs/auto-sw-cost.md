# Auto SW Cost — how the should-cost engine works

A bottom-up parametric model that decomposes a premium vehicle's software into
**49 costed modules across 7 domains**, prices each from engineering first
principles, then reports its own error against real programmes.

> **Visual explainer:** open [`auto-sw-cost-explainer.html`](./auto-sw-cost-explainer.html)
> in a browser for the diagrammed version (pipeline, worked calculation,
> full-programme roll-up and Monte-Carlo band). This page is the prose companion.

**Code:** `src/engine/sw-should-cost.ts` (engine) · `src/engine/sw-rate-library.ts`
(sourced rates) · `src/engine/sw-validation.ts` (back-test) ·
`src/ui/panels/sw-should-cost-ui.ts` (panel). Validation detail lives in
[`sw-cost-validation.md`](./sw-cost-validation.md).

---

## The pipeline

Every estimate flows through the same five stages — nothing is a single guessed
number:

1. **Decompose** — programme → 49 modules across 7 domains, each with its own cost DNA.
2. **Cost each** — per-module formula: effort × sourced rate, split into dev / test / lifecycle.
3. **Roll up** — sum to programme total, NRE and £/vehicle, grouped by domain.
4. **Simulate** — 1,000-run Monte-Carlo, ρ=0.55 correlated → P10 / P50 / P90 band.
5. **Validate** — back-test vs 7 published programmes; report the model's own variance.

## The 49-module catalogue

Coverage is "360°" because it isn't one formula — it's 49 individually
parameterised estimators. The **six premium-trim modules** (marked ★) default to
*off*, so a base programme and the validated baseline stay unchanged.

| Cat | Domain | Modules |
| --- | --- | --- |
| A | EV Powertrain & Battery | BMS core, cell balancing, SOC/SOH/SOE, thermal, fast-charge, EDU, inverter, motor, regen |
| B | ADAS L2 / L2+ | camera, radar, ultrasonic, sensor fusion, path planning, ACC/LKA/AEB, driver monitor, highway assist, ★ automated parking |
| C | Infotainment & UX | IVI OS, navigation, voice, TCU, connectivity, HMI, ★ premium audio, ★ digital key, ★ AR-HUD |
| D | Domain Controllers | body, chassis, gateway, zonal, VMM, ★ active body control, ★ climate |
| E | Middleware & Platform | AUTOSAR Classic/Adaptive, RTOS, diagnostics, comm stacks, time-sync |
| F | Cybersecurity (ISO 21434) | secure boot, encryption, IDS, secure OTA, key management |
| G | OTA & Cloud Backend | OTA manager, cloud backend, data pipeline, fleet analytics |

Each module carries its own cost DNA: `basePersonMonths`, `defaultAsil`,
`defaultComplexity`, `testingFractionBase`, `integrationFractionBase`,
`maintenancePctPerYear`, annual tool/IP/cloud licence £, `calibrationFractionBase`
and flags (`hasMLContent`, `hasCybersecRequirement`, `hasCloudDependency`).

## The per-module formula

```
rate      = ukBase × region × devSource × seniority × overhead × schedule
effortPM  = basePersonMonths × reuse       →   devPM = effortPM × asil_dev

dev       = reqs 12% + arch 14% + algo 22%·cx + impl 37%·cx' + safety 15%·floor
test      = dev × testFrac × (asil_test ÷ ref)     # SIL·MIL·HIL·regression·pentest
        + integration · cybersecurity · calibration            # NRE
        + (maintenance + cloud + IP licence) × NPV factor      # lifecycle
```

Engineering realism baked in:

- **Testing tracks ASIL** — an ASIL-D module runs HIL, fault-injection and MC/DC, so test can exceed dev.
- **Reuse can't erase safety** — the safety-compliance slice is floored by ASIL; reused ASIL-C/D code still needs re-verification (`SAFETY_REUSE_FLOOR`).
- **Correlated uncertainty** — overruns move together, so the Monte-Carlo blends a shared draw at ρ=0.55 and the tail isn't understated.
- **Optional, default-neutral levers** — schedule compression (Brooks/COCOMO SCED), NPV discounting, short cost-recovery windows, ML-dataset cost and programme homologation (R155/R156/ISO 26262).

## Worked example — BMS Core (ASIL-D)

A single battery-management module, costed alone at the default UK / OEM-internal
programme (80,000 vehicles/yr over 10 years). Every figure is live engine output.

| Step | Value |
| --- | ---: |
| base 90 PM × reuse 0.60 | 54.0 PM |
| × ASIL-D dev multiplier 3.2 | 172.8 PM |
| blended rate (£28k × 1.0 UK × 1.0 OEM × 0.975 senior × 1.6 overhead) | £43,680 / PM |
| **Development** | **£11,290,910** |
| **Testing** (frac 0.40 × 1.8/0.38 → 1.9× dev) | £21,393,302 |
| Integration (18%) | £2,032,364 |
| Cybersecurity (14%, ASIL-D) | £1,580,727 |
| Calibration (8%) | £903,273 |
| Dev toolchain (£52k/yr × 10) | £520,000 |
| Maintenance (12%/yr × 10) | £13,549,092 |
| Embedded IP licence (£18k/yr × 10) | £180,000 |
| **Non-recurring engineering (NRE)** | **£37,720,576** |
| **Grand total** | **£51,449,667** |
| Per vehicle (over 800,000 units) | £64.31 |

## Full-programme roll-up — Range Rover L460

All 49 modules for a real flagship (PHEV, UK / Tier-1-heavy, 75,000 vehicles/yr
over 8 years, premium modules enabled):

- **Point estimate: £539.6M** (NRE £345M + lifecycle £195M) · **£899 / vehicle**
- By domain: ADAS **£191.7M (35.5%)**, Powertrain **£128.3M (23.8%)**, Domain
  controllers £74.1M, Infotainment £64.8M, Cloud/OTA £33.5M, Middleware £29.6M,
  Cybersecurity £17.7M.
- Verification (£160M) and 8-year maintenance (£134M) each rival raw development
  (£130M) — which is why should-cost must model the full lifecycle.

**Monte-Carlo (1,000 correlated runs):** P10 **£503M** · P50 **£554M** · P90
**£616M**. Budget to P50–P90, not the point estimate.

## The honesty mechanism

The engine back-tests itself against seven published premium programmes and
reports its own variance rather than presenting one number as truth:

| Programme | Variance | Band (±35%) |
| --- | ---: | --- |
| Tesla Model S HW4 | −0.3% | ✅ in |
| BMW iX | −3.8% | ✅ in |
| Audi Q8 e-tron | +14.7% | ✅ in |
| Mercedes EQS | −16.0% | ✅ in |
| Porsche Taycan | +18.6% | ✅ in |
| Range Rover L460 | +36.6% | ❌ out |
| Lucid Air | +84.2% | ❌ out |

**MAPE 24.9% · 5 of 7 inside ±35%.** Outliers are ultra-low-volume (Lucid) and
Tier-1-heavy (L460) programmes.

## How accurate is it?

An **envelope, not audited-to-the-pound**. This is a ±25–35% parametric
should-cost model; the validation targets are themselves third-party analyst
estimates, not internal books. Its value is that it **reports its own confidence
band** rather than feigning a precision the data doesn't support.

- **Costs by domain, not by brand** — it captures the cost of Burmester audio,
  E-Active Body Control or Digital Key, but won't enumerate every marketing-named
  ECU (that would be false precision).
- **Only as good as its inputs** — give it the right region, dev-source, volume,
  reuse and ASIL and it lands in-band. It's built to be *driven* by a cost
  engineer, and every rate is overrideable with your own company data.

Strong enough to challenge a supplier quote or set a target cost; honest enough to
show its error bars while doing it.

---

*Figures on this page are emitted by the live engine. Regenerate the worked
example and roll-up with the module set in `src/engine/sw-should-cost.ts`.*
