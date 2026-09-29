# CostVision — what the tool does today (reference for every deck)

Checked against the code on 28 September 2026 (rates refreshed 29 September 2026) (branch `claude/new-session-ts4byp`,
app version V4.2). Every deck states only what is on this page. If a deck needs a
fact that is not here, check it in the code first, or leave it out.

## The one-line version
CostVision works out what a part **should** cost — material, process, labour,
tooling, packaging, logistics, overhead and margin — from a CAD file or from the
inputs an engineer types, using real 2026 rates. Every number is plain arithmetic
you can trace to a rate. It runs on a laptop with no internet and no AI.

## How it works (as shipped to JLR)
- **AI is switched off in the JLR build** (`AIR_GAPPED=1`). JLR has no AI approval
  yet. The AI code is still in the product, turned off, so it can be switched on
  later by a setting — no rebuild. With AI off, the screens that need it (PCB photo
  → BOM, "Describe a part", the AI assistant, the AI agent) are hidden, and the
  tool says "AI is switched off in this installation" rather than asking for a key.
- **AI never sets a price, even when it is on.** At most it reads or classifies
  (material, process route, a drawing). All money is deterministic arithmetic.
  With AI on, every AI route is rate-limited per user.
- **CAD to Cost, on rules alone.** Upload STEP, IGES or STL. The geometry engine
  (OpenCASCADE) measures volume, weight, size, walls, holes and features. Rules
  turn that into cost inputs. Where the geometry cannot decide something — the
  process route, the material family, a hole count on an STL — the tool **asks the
  engineer** instead of guessing. 13 commodities can be costed from CAD this way:
  casting, cast + machine, sheet metal (pressed), sheet-metal fabrication,
  injection moulding, blow moulding, machining, forging, thermoforming,
  rotational moulding, rubber, composites, gear cutting. Extrusion has no CAD rules
  yet (its form still costs it).
- **Thick-walled sparse parts** (walls over ~6 mm) are offered casting, forging,
  cast + machine or machining — never sheet metal or moulding.
- **Sheet metal blanks:** a DXF flat pattern (e.g. from FastBlank) can be uploaded
  with the STEP, and the measured blank is used instead of the bounding box.
- **STL files have no feature table**, so a machined STL arrives with no cycle
  time; the tool blocks the costing until the engineer types one.

## What it covers
- **19 manufacturing processes**, plus an assembly roll-up and a 49-module
  automotive-software cost model: machining, casting, cast + machine, forging,
  gear cutting, sheet metal (pressed), sheet-metal fabrication, injection moulding,
  blow moulding, extrusion, thermoforming, rotational moulding, rubber, composites,
  PCB fabrication, PCBA, wiring harness, painting, BIW assembly.
- **20 manufacturing regions**: UK, Germany, France, Italy, Spain, Poland, Czech
  Republic, Romania, Hungary, Sweden, Netherlands, Turkey, China, India, Mexico,
  United States, Thailand, Vietnam, Brazil, South Korea.
- **Rate library** 2.2.0, rates as of 29 September 2026: 328 materials, 178 machines,
  42 labour grades, 20 countries. Refreshed from published market indices (metals,
  polymers, FX, wages, energy) — see docs/rates/2026-09-rate-refresh.md. Editable, versioned. The JLR Rate Converter workbook turns JLR's own rate
  card into the tool's format with no macros.
- **8 cost buckets**: material, process, labour, tooling, packaging, logistics,
  overhead, margin. Overhead is a % of material + process + labour + tooling (shown
  on screen, in the PDF and the workbook); margin is a % of the subtotal.
- **PCB fabrication is a bought-in price** from fabricators' price tables, so no
  overhead or margin is added on top (a default board: £100.44 before, £83.08 now).
- **Tooling** is spread over annual volume × programme life (blank life = one year).
- **Uncertainty band** on every result (Monte Carlo P10–P90), covering every cost
  driver including flat material prices.
- **Self-audit** on every result: flags a wrong machine size, tooling spread over the
  wrong volume, a material-only costing, implausible cycle times, and more.
- **Exports**: Excel (6 sheets, including a traceability sheet), PDF report,
  negotiation pack; both carry the on-screen total to the penny. Files are named
  `<type>-<part>-<date>`.
- **Negotiation**: compares a supplier quote with the should-cost, bucket by bucket.
- **Learning from actuals**: log a real quote or PO price ("Log Actual £"). After 3
  actuals for a commodity, the band is corrected by real data.

## What is proven — and what is not
- The engine's arithmetic matches a **hand calculation to under 0.01%** on the
  reference machined bracket (£24.79 on the September 2026 rates).
- **6 real production parts** are pinned in a regression baseline (steering knuckle,
  two castings, a pressed seat bracket, a machined part, a gear). A change that moves
  any of them fails the build.
- **2,438 automated tests**, plus browser tests that cost every commodity, export
  Excel and PDF, upload an STL, and check accessibility on every run.
- **No estimate has yet been compared with a price JLR actually paid.** Accuracy
  against real prices is measured as actuals are logged — not claimed up front.
  Do not quote an accuracy percentage, a speed multiple or a savings % as a fact of
  this tool. Industry benchmarks may be quoted only as industry benchmarks, labelled.

## Safety and deployment
- **Windows package**: a folder copied to a locked-down laptop; double-click to
  start. No installer, no admin rights, no internet. Portable Node, embedded Python
  with the geometry kernel.
- Listens on the laptop only (127.0.0.1) unless deliberately shared.
- Sign-in required on everything that holds data; users see only their own saved
  scenarios. A password reset or "sign out everywhere" ends every old session;
  a deleted account stops working at once.
- Server-side: Docker image with the CAD kernel (for a shared server / cloud).
- Accessibility: every page passes WCAG 2.1 AA (automated check).
- Live commodity prices on the dashboard are **indicative** (a simulated feed), not a
  market feed; they do not change any costing. News needs internet.

## Words to use / avoid
- Say "the tool measures / calculates / asks you". Not "AI extracts / infers / picks"
  (unless describing the optional AI mode, clearly labelled as off at JLR).
- Say "19 manufacturing processes". Not "19+", "20" or "21 commodities".
- No model names (Claude, Opus, Sonnet, Haiku) in slides or notes.
- No emoji. Plain, short sentences. One idea per slide.
