# 360° PCB Should-Cost Model — All PCB Types

A world-class, parameterized **should-cost model for every PCB type** — rigid
(1–12+ layer), HDI, flex, rigid-flex, high-speed/RF and power/heavy-copper —
built the way a Tier-1 automotive PCB supplier cost engineer would. **Number of
layers and stack-up are the primary cost drivers**, including explicit
sequential-lamination logic for buried/blind vias and HDI build-ups.

It estimates **fab cost/board** and **quoted price/board**, with a full cost
breakdown, process routing, yield/quality model, benchmark sanity-check, AI
cost-driver insights, and engineering-grade **Design-for-Cost (DfC)**
recommendations.

## Run it

No build step, no dependencies. Open `index.html` (or the single-file
`pcb-cost-model.html`) in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # http://localhost:8000/pcb-cost-model/
```

## What it covers

- **All PCB types** with type-specific process routing & complexity.
- **Stack-up first:** layer count, material (FR-4/High-Tg/RF/polyimide/IMS),
  copper weight, via technology (through/buried/blind/HDI 1+N+1…any-layer),
  board thickness/aspect ratio → **lamination-cycle model**.
- **Design rules & finish:** trace/space classes (imaging tech + yield),
  controlled impedance (TDR), 8 surface finishes, mask colour, silkscreen.
- **Panelisation:** boards-per-panel & utilisation → $/board.
- **Quality/region:** IPC Class 2/3, IATF/automotive, aerospace; China/India/NA/EU.
- **Cost breakdown:** 9 reconciling categories → fab cost → price.
- **Benchmark band, sensitivity tornado, DfC recommendations, scenario compare.**
- **3 worked examples** (luxury SUV): 4-layer automotive control, 8-layer
  high-speed domain controller, 10-layer HDI rigid-flex infotainment.

## Files

| File | Purpose |
|------|---------|
| `index.html` | UI layout |
| `style.css` | Styling |
| `data.js` | Materials, vias, finishes, quality/region tables, **cost coefficients**, examples |
| `model.js` | Pure cost engine (formulae, routing, yield, DfC, sensitivity) |
| `methodology.js` | Full documentation + live worked examples |
| `app.js` | UI controller, rendering, scenarios |
| `pcb-cost-model.html` | Single self-contained build (everything inlined) |

## Implementing in CostVision

`model.js` is pure and side-effect-free: `computePcb(input) → result`. All
tunable economics live in `COEFF` and the lookup tables in `data.js` — override
them with negotiated wafer/material/labour numbers. The benchmark band in
`benchmarkBand()` is independent of the engine and used only as a sanity check.

## Calibration & standards

Coefficients are industry-aligned engineering ranges (not supplier quotes),
consistent with typical PCB fab process economics and IPC build classes:
IPC-2221 (design), IPC-6012 (rigid/Class 1-3), IPC-6013 (flex/rigid-flex),
IPC-2226 (HDI), IPC-A-600 (acceptability), IPC-7351 (land patterns). Worked
examples land inside the independent market price band; the model is
intentionally slightly conservative on the very simplest boards.
