# 360° PCB Should-Cost Model — 2026 Edition (Neon)

A world-class, parameterized **should-cost model for every PCB type** — rigid
(1–12+ layer), HDI, any-layer/SLP, flex, rigid-flex, high-speed/RF and
power/heavy-copper — built the way a Tier-1 automotive PCB supplier cost
engineer would. **Number of layers and stack-up are the primary cost drivers**,
including explicit sequential-lamination logic for buried/blind vias and HDI
build-ups.

It estimates **fab cost/board** and **quoted price/board**, with a full cost
breakdown, process routing, yield/quality model, an independent 2026 benchmark
band, sensitivity, engineering-grade **Design-for-Cost (DfC)** recommendations,
and an **AI advisor** (built-in + optional Claude-powered).

Styled **neon on black** for high contrast.

## Run it

No build step, no dependencies. Open `index.html` (or the single-file
`pcb-cost-model.html`) in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # http://localhost:8000/pcb-cost-model/
```

## 2026 edition — what's new

- **Expanded materials (13):** FR-4 std/mid-Tg/High-Tg/halogen-free, low-loss
  (Megtron 6 / I-Tera), ultra-low-loss (Megtron 7/8), Rogers RO4350B/RO4003C/
  RO3003 (77 GHz), PTFE/Taconic, polyimide, LCP, IMS.
- **Latest processes/technologies:** mSAP & SAP fine-line, any-layer HDI / SLP,
  back-drilling (per-via), via-fill / via-in-pad, copper-foil profile
  (HTE/RTF/VLP/HVLP), VCP plating, laser depanel, plasma desmear, 3D AXI,
  IST/CAF reliability coupons, extreme copper.
- **2026 market data:** gold-price finish sensitivity (ENIG ~70% gold-variable;
  +10% gold ≈ +6.8% ENIG), CCL/copper inflation surcharge, and updated
  labour/region indices (China / Vietnam / India / Taiwan / Korea / NA / EU).
- **AI advisor:** built-in offline insight/idea engine **plus** optional live
  Claude generation (bring-your-own Anthropic API key, direct browser call,
  Opus 4.8 / Sonnet 5 / Haiku 4.5 selectable).
- **Neon + black** high-contrast redesign.

## Files

| File | Purpose |
|------|---------|
| `index.html` | UI layout |
| `style.css` | Neon-on-black theme |
| `data.js` | Materials, foils, processes, vias, finishes, quality/region tables, **2026 cost coefficients**, examples |
| `model.js` | Pure cost engine (formulae, routing, yield, benchmark, DfC, sensitivity) |
| `ai.js` | AI advisor — built-in insight engine + Claude API integration |
| `methodology.js` | Full documentation + 2026 sources + live worked examples |
| `app.js` | UI controller, rendering, scenarios, AI wiring |
| `pcb-cost-model.html` | Single self-contained build (everything inlined) |

## AI advisor

- **Built-in advisor** — deterministic, offline. Ranks quantified cost-reduction
  ideas (layer reduction, HDI vs through, finish downgrade, panel utilisation,
  hybrid RF stack-up, trace relaxation, volume consolidation, region trade-offs)
  from the computed result. No key, no network.
- **Claude generation** — sends the design + computed cost stack directly from
  your browser to `api.anthropic.com` using your own API key (via
  `anthropic-dangerous-direct-browser-access`) and returns a generative
  should-cost review. The key is used only for that call and, if you opt in,
  stored only in your browser's localStorage.

## Calibration & standards (2026)

Coefficients are industry-aligned engineering ranges (not supplier quotes),
calibrated to 2026 $/dm² fab-price ladders + CCL inflation + gold-price finish
sensitivity, consistent with IPC build classes (IPC-2221, IPC-6012, IPC-6013,
IPC-2226, IPC-A-600, IPC-4552B/4556, IPC-7351). Sources include DigiTimes,
AtlasPCB, TrendForce, NCAB, Prismark, Rogers/RayPCB, Isola/PCBSync, Hil/King
Sun/TOPFAST/JLCPCB, Sierra/AllPCB/Epec, and BLS/Destatis wage data. Flagship
examples land inside the independent market band; the model runs slightly
conservative on the very simplest boards.

## Implementing in a costing engine

`model.js` is pure and side-effect-free: `computePcb(input) → result`. All
tunable economics live in `COEFF` and the lookup tables in `data.js` — override
them with negotiated numbers. The benchmark band is independent of the engine.
