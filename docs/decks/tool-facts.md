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
- **AI is ready but not yet switched on** (updated 29 Sep 2026: the air gap was
  removed). Until an API key is added, the screens that need AI (PCB photo → BOM,
  "Describe a part", the AI assistant, the AI agent) are hidden and every costing
  path works without them. Adding a key switches them on — no rebuild.
  `AIR_GAPPED=1` can still switch AI off deliberately.
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
- **Process and material suggestions** (2 Oct 2026). Where the geometry does not
  settle the process, the question now comes with a suggested answer and the reason:
  what the part is called (the file name, the product name and the folder inside the
  STEP file — "Casting Bracket", "CASTING-01", "…_PATTERN"), and how its surface is
  built (blended, free-form faces read as cast or forged; plain planes and cylinders
  as machined from solid). The engineer confirms with one click. A material declared
  in the CAD file, or named in it, is used; otherwise the tool asks — a CAD model
  carries shape, not substance. With an API key, one model call reads the photo, the
  drawing and the CAD views together, says where each answer came from, and never
  takes a material from a grey CAD render. On the six real parts the suggestion
  matches the recorded route on 4; the other 2 are parts whose own files contradict
  the recorded answer.
- **Thick-walled sparse parts** (walls over ~6 mm) are offered casting, forging,
  cast + machine or machining — never sheet metal or moulding.
- **Sheet metal blanks:** a DXF flat pattern (e.g. from FastBlank) can be uploaded
  with the STEP, and the measured blank is used instead of the bounding box. Without
  one (1 Oct 2026), the gauge is measured between the bend faces, the metal the part
  needs (volume ÷ gauge, plus holes) and the cut length are worked out from the
  solid, the press is sized on that cut length, and the tool unfolds the part itself
  into its flat blank: outline, holes, the smallest rectangle it nests in, and a DXF
  to download. Exact on a bent part (checked against a hand-calculated bracket); where
  the metal was stretch-formed or drawn the tool says so and lowers its confidence,
  and the FastBlank DXF is still the answer for the formed process. The blank is then
  nested on the coil: the orientation and pitch that use the least strip, with a
  two-up interlock reported as a tooling trade-off rather than applied, and the metal
  bought is the strip the press feeds. A drawn or stretch-formed part gets a forming
  solve on top of the unfold (the one-step method a forming package's quick estimator
  uses): the blank grows to put the stretched metal back, a thinning map is reported,
  and the grade is checked against its forming limit — typical published forming
  values until JLR's coil data replaces them. It is an estimator's answer, not a forming
  simulation: no binder force, friction or springback. The process follows from the
  blank: a drawn panel is blanked first and drawn on a transfer press or a tandem line
  (one press per operation), carrying the binder and addendum the trim die cuts off; a
  bent part runs from coil through one die. The line rates and the addendum rule are
  stated defaults until JLR's press-line facts replace them.
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
- **PCB photo → parts list → board cost** (needs an API key; 1 Oct 2026 build). The
  model classifies the board, reads the markings printed on the chips and writes
  the parts list — it is not asked for a cost. A BOM file, if attached, is the parts
  list; drill and Gerber files, if attached, give the measured size, layer count and
  via count. Every line is priced from the tool's own data: a 458-part catalogue
  (77 parts read from distributor pages on 1 Oct 2026, the rest labelled estimates,
  a source and date on every entry), the price range for a part the tool can name,
  or the class table — the model's figure only picks a point inside the range. The
  bare board and assembly are costed from the 14-country rate table; on an
  automotive board the IATF / class 3 / burn-in premiums are in the headline. Lines
  worth £1+ with no quote behind them are listed "to verify". Screen, PDF, master
  report and Parts Library show the same number. Checked in a browser against a
  fixed model reply (`npm run test:e2e:pcb`). Radar board, China, 250k/yr, photos
  only: £59.63 automotive grade. Not yet compared with a price JLR paid.
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
