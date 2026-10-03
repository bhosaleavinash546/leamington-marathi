# Automotive IVI SoC — Should-Cost Model

A parameterized, transparent bottom-up cost model for an automotive In-Vehicle
Infotainment (IVI) SoC on a **fabless** business model. It estimates:

- **Unit silicon cost** ($/good die)
- **Total product cost** ($/SoC — silicon + package + assembly + test + IP +
  amortized NRE + overhead), plus an indicative ASP.

Targeted accuracy is **90–95%** for **2025–2026** automotive-grade production
when wafer cost, defect density, package and IP terms are calibrated to the
program.

## Run it

No build step, no dependencies. Open `index.html` in a browser, or serve the
folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000/soc-cost-model/
```

## Features

- **Node presets** for mature (40/28/22 nm), mid (16/14 nm) and advanced
  (7/6/5 nm EUV) nodes, pre-loaded with 2024–2026 benchmark wafer cost,
  mask-set NRE and defect density — all editable.
- **Full cost engine:** De Vries dies-per-wafer (edge loss), negative-binomial
  defect yield, cascaded back-end yield, IP royalty + upfront, NRE amortization,
  overhead and margin.
- **Automotive adders:** AEC-Q100 test/burn-in, ASIL-B/D area overhead,
  qualification NRE, conservative defect density.
- **Scenario comparison:** snapshot inputs/results and compare side-by-side
  (persisted in the browser).
- **Sensitivity (tornado)** of total cost to the main drivers.
- **Methodology tab:** every formula, calibration table and source assumption.

## Files

| File | Purpose |
|------|---------|
| `index.html` | UI layout |
| `style.css` | Styling |
| `data.js` | Calibration benchmarks & defaults |
| `model.js` | Pure cost engine (formulae) |
| `methodology.js` | Methodology/sources content |
| `app.js` | UI controller, rendering, scenarios |

## Calibration sources

Wafer-cost, mask-set and defect-density ranges are order-of-magnitude estimates
consistent with public/analyst data (TechInsights Semiconductor Manufacturing
Economics, CSET foundry cost analyses, Morgan Stanley / IBS node-cost trackers,
IBS mask-cost curves), with an automotive premium applied. They are engineering
estimates, **not** confidential vendor pricing — override with negotiated
numbers for a real program.
