# Software costing — Chief Engineer review: 360, rates, studio (13 Oct 2026)

**Feedback received:**
- "very basic tool";
- "UI/UX not user friendly";
- "show which costing we are doing, in animation";
- "show the components the software runs on in an SUV skeleton";
- "the country rates are not correct — research them for software only".

**Constraint:** do not change any rate for another commodity.

## 1. What changed

| Area | Before | After |
|---|---|---|
| **Country rates** | £28,000 / PM UK base × 9 region ratios (Jan 2025, no URLs) | **23 hubs**, each from its own salaries + statutory on-cost + hours (`docs/rates/software-engineering-rates-2026-10.md`) |
| Countries without a software centre | Mapped to 9 blends ("EU", "Eastern Europe") | Nearest real hub, with the reason on screen |
| Senior share | ×1.20 / ×0.75 on a "senior-blended" base (seniority counted twice) | Blends the hub's own mid and senior rates |
| Typed rate | A "UK base" × the hub ratio (India typed in India → costed at 1/5) | The hub's own figure, never scaled |
| **Costing studio** | none | 7 steps (scope → effort → verification → rate → NRE → lifecycle → per vehicle), each with the engine's figure; Play / step / keyboard |
| **SUV skeleton** | none | Top-view SVG with 42 ECUs / sensors / actuators / networks; lights the components of each step's modules; click a part to see only its modules; colour by scope, cost or ASIL; list of components beside it |
| Schedule | "Average FTE" = effort ÷ production life | COCOMO II TDEV per module (manual's worked example reproduced: 29.7 months); average team over the development window; modules that overrun the window flagged |
| Guided v Advanced | £406.7 M v £388.7 M for the same choices | Same engine scope and de-rating; premium options keep their state |
| Mode switch | Lost edits (Advanced re-read stale fields) | Inputs synced both ways |
| Theme | Followed the OS, not the app (dark by default) | Follows the app; axe WCAG 2.1 AA clean in dark and light |
| Exports | Region × multiplier | Hub rate and its build-up; Excel adds **Vehicle map**, **Schedule** and **Hub rate** sheets; SW PDF WinAnsi-safe (₹ ₩ ₫ zł …) |
| Company rate workbook | `Base` + `Regions` sheets | `Hubs` sheet (mid / senior £/PM per hub); the retired layout is refused with a message; saved configs with old hub keys still load |

**Also fixed (code review):**
- **F1** — a bad calibration row stopped the panel. Rows are validated, bad stored rows are dropped, and the card is
  wired last.
- **F5** — wizard errors were invisible. They now show in the visible mode and are announced.
- **F7** — the team size used the wrong time base.
- **F8** — "Lifecycle" left out licences.
- **F9** — the AI prompt told the model to "always give concrete numbers". It now says never invent a figure.
- **F10** — the SW PDF printed currency symbols as mojibake.
- **F11** — presets lowered modules and changed ASIL silently. They now never lower a module, and their labels say
  what they do.
- **F22** — custom PM was truncated to whole numbers.
- **Per-vehicle split** — it ignored the recovery window.
- **India insight** — it is now "the cheapest assessed hub".

## 2. Before / after (`scripts/sw-review/baseline.ts`)

| | before | after | change |
|---|---|---|---|
| Default programme (UK hub, 80k × 10 yr) | £388.7M | £212.8M | −45 % |
| — NRE | £143.4M | £44.0M | −69 % |
| — Lifecycle (maintenance, cloud, licences) | £245.3M | £168.9M | −31 % |
| — per vehicle | £486 | £266 | −45 % |
| Development effort (PM) | 2,391 | 2,391 | unchanged |
| Range Rover L460 demo (UK) | £331.4M | £163.4M | −51 % |
| BMW X7 demo (DE) | £213.8M | £123.7M | −42 % |
| Mercedes GLS demo (DE) | £300.5M | £142.3M | −53 % |

**Why the costs fall.** Every movement comes from the rate; effort is unchanged:
- the UK hub's engineer is £6,384 / PM at the default senior share, against £27,300 before;
- licences, royalties and cloud did not move.

**What it reveals.** The seven *unverified* published programme totals in `sw-benchmarks.ts` now sit 61–78 % above the
model (they were 25–56 % above). The retired £28,000 rate — four times the cost of a UK engineer — was hiding a
module effort catalogue that is probably too low. **The next accuracy lever is effort, not rates:** log real
programme actuals in "Calibrate to your actuals". No test pins the model to those published figures, and they are
not used to tune it.

## 3. Opinion on the Chief Engineer's ideas — and what was built

- **Animation.** Built as a costing walk-through that shows the engine's real figure at each step. It is not
  decoration:
  - one 200 ms fade per step;
  - the 1.4 s dwell is reading time;
  - it stops on any click;
  - it is off under "reduce motion".
- **SUV skeleton.** Built from data:
  - `src/engine/sw-vehicle-map.ts` maps all 54 modules to the components they run on;
  - drivetrain parts follow ICE / MHEV / PHEV / BEV.

  It never splits money across components. A component lists the modules on it with their own costs, and the cost
  colour says a module on several parts counts at each.

  No published study uses a zonal / domain map to present a software cost estimate (benchmark §a). Vector PREEvision
  uses one for E/E architecture cost. So this is CostVision's own design choice — and a useful one: it answers
  "what am I paying for, and where is it in the car".
- **"Very basic".** The benchmark (`calculator/scripts/sw-research/2026-10-13/raw/G-benchmark.md`) ranks the gaps
  against SEER, SLIM and TruePlanning. Closed this round:
  - schedule and team (#1);
  - the vehicle-architecture view (#4).

  Still open:
  - supplier quote v should-cost;
  - requirements-based sizing (COSMIC);
  - calibration by domain;
  - probability on schedule;
  - defect prediction;
  - templates by application type;
  - change-driven maintenance;
  - actuals tracking;
  - sourced external benchmarks (ISBSG / DoD SRDR).

## 4. Proof

**Tests:**
- `tests/sw-country-rates.test.ts`:
  - the book is in sync with its config;
  - every £/PM reproduces from its own salary, on-cost, hours and FX;
  - there is no UK base or multiplier;
  - a typed rate is not scaled;
  - legacy keys map;
  - no other commodity reads the book.
- `tests/sw-vehicle-studio.test.ts`:
  - every module is placed;
  - drivetrain filtering;
  - component costs equal the engine's module costs;
  - the steps read the result;
  - the COCOMO example;
  - team over the development window.
- The 23 updated tests of the old model are rewritten to the new one.

**Live:** `e2e/sw-studio.ts` (real server + browser) covers:
- play, step, keyboard, component click and hover;
- the cost colour;
- hub switch to India (rate field £655 / PM, total £164.7M);
- the 23-row rate library;
- Guided ⇄ Advanced keeping the volume;
- axe [] in dark and light.

`e2e/sw-live.ts` still passes its checks (all four drivetrains, calibration, EUR, Excel rate basis).

## 5. Open (stated, not hidden)

- **Rates read from search results.** Every figure was read from a search result of its page; no page could be
  opened here.
  - Poland's basis is disputed, India's CTC reading is unverified, and China and Egypt are weak. See the rate doc
    §"Still open".
- **Overhead.** The default 1.15 is an assumption; the hub rate is salary + statutory on-cost only.
- **Supplier sell rates.** The development-source factors are not supplier sell rates. Sourcing those per hub is the
  next research round.
- **Effort.** The effort catalogue is unsourced, and with correct rates it is now the dominant uncertainty. Calibrate
  to actuals.
- **Accuracy is unmeasured.** No real programme actuals are logged.
