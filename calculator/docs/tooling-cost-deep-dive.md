# Tooling cost deep-dive — from lump parametrics to a toolmaking shop model

## Why (the review finding)

Compared against a dedicated tooling should-cost tool, our estimators lack detailing: they are
single-formula parametrics (`base + area×rate × factors`), where a dedicated tool builds the
tool the way a toolmaker quotes it — **hours × toolroom rate, tool steel by mass, bought-out
components each, design and tryout as lines**. The audit confirms the accuracy cost:

| Estimator | Structure today | Anchor check |
|---|---|---|
| IM mould (`estimateMouldCost`) | base £6k + (2.5k + area×55)·n^0.9·steel + slides + HR | **£690k vs the £420k real bumper quote (+64%)**; kernel B-rep says £412k |
| HPDC/gravity/sand | kernel parametric only; no advisor model; no fallback when kernel absent | manual/STL paths must ask |
| Investment tooling | no model at all (asks) | — |
| Forging die | block/machining/HT/polish lines (closest to right shape) but £-lumps, not hours | axle die £51.3k, life 34.8k — no external anchor |
| Stamping die | (base + stations)×size×hardness — size multiplies EVERY station | seat die £174.7k — industry-typical for this class is £90–130k |
| Blow mould | base + (process + litres×900)·n^0.9·material | tank £68.2k — plausible |
| Thermoform/roto/rubber | small parametrics | lower stakes; unchanged this pass (stated) |

## The model (dedicated-tool structure)

New `src/engine/toolmaking.ts` — one shop, all commodities:
- **Toolroom rates (UK 2026)**: design £58 · CNC £52 · EDM £58 · fitting/spotting £48 ·
  polishing £45 · tryout press £85 /hr.
- **Tool materials £/kg**: P20 6.8 · P20-hard/H13-class 8.2 · H13 9.5 · 1.2714 hammer 5.8 ·
  premium/PM 14 · 7075 aluminium 7.5 · cast iron 2.8 · plate steel 1.9.
- **Bought-outs**: hot-runner £3,800/drop + £5,500 controller · core-pull cylinder £1,450 ·
  guide/ejection sets · texturing £3,500.
- Every estimator returns **lines** `{item, kind, hours?, rate?, cost, basis}` that sum to the
  total — the same shape a toolmaker's quotation has, arguable line by line.
- Toolmaker **overhead + profit 22%** applied once, stated as its own line.

Per commodity: cavity/core CNC hours `H = 12 + 3.4·area^0.72` (per cavity, depth-corrected),
EDM/polish/fitting as complexity- and finish-driven fractions of H, design `30 + 0.2·H`,
steel mass from area × (depth + allowance) × 2 halves × 1.25, n^0.9 across identical cavities,
tryout trials. Forging: die-block mass × steel £/kg + sinking hours per impression + HT + 
tryout strokes. Stamping: die set by area + per-station punch/die steel mass + wire-EDM hours
from cut perimeter + strip-design NRE (size no longer multiplies every station). Blow:
aluminium cavity mass + machining + cooling drilling.

## Calibration anchors (before → target)

- IM bumper-class (9,000 cm², production, 3 slides): £690k → **≈£410k** (quote £420k, kernel £412k)
- IM small 2-cav (46 cm²/cav): £20.8k → stay £18–25k
- Forging axle die (200 cm², 2 imp): £51.3k → stay £45–55k, now decomposed into hours
- Stamping seat die (6-stn progressive, 1,500 cm²): £174.7k → **£90–130k** (justified fix)
- Blow tank (60 L EBM Al): £68.2k → stay £60–75k
- `npm run examples` immune (quoted tooling); benchmark deltas measured and disclosed —
  including any compensating error the tooling fix exposes.


## Result (implemented)

| Anchor | Before | After | Witness |
|---|---|---|---|
| IM bumper mould | £690,225 | **£423,985** | real quote £420k · kernel £412k — ON the quote |
| Stamping fixture die | £105,285 | **£90,947** | kernel £92.3k — two independents now within 1.5% |
| Forging fixture die | £104,556 | £74,926 | kernel £63.8k — gap 64% → 17% |
| Small IM tool (2-cav) | £20,772 | £20,601 | small end level held |
| Blow tank mould | £68,170 | £73,383 | industry £60–75k band |
| Investment tooling | asked | wax-tool shop model (quote overrides) | gap closed |

Every estimator now returns a `detail` quotation — design/CNC/EDM/polish/fitting/tryout hours ×
toolroom rates, steel by the kilogram, bought-outs each, 22% shop overhead as its own line
(bumper: 11 lines, 4,797 toolroom hours). Casting rules gained the shop-model fallback for
STL/manual paths.

**Benchmark, honestly:** seat £1.26 (−10%, in band), axle +29% (from +30%), knuckle/horn/tank
unchanged. The bumper moved −3% → **−10%**: with tooling now at the quote-anchored £424k
instead of £533k, a compensating error surfaced — the non-tooling buckets sit below the manual.
That is the deep-dive doing its job: the tooling number is now defensible against a real
quotation, and the residual is visible where it actually lives. Fleet MAPE 13.1% → 15.2% for
that reason alone, disclosed rather than re-hidden. Thermoform/roto/rubber parametrics
unchanged this pass (stated; no benchmark parts).