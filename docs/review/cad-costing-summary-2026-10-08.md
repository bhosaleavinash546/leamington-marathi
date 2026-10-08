# CAD parts should-costing — consolidated summary (8 Oct 2026)

What was run, what was wrong, what was fixed, how the tool behaves now, whether it is pure arithmetic, and what is
still open. The detailed trace is in `uploaded-parts-costing-review-2026-10-08.md`; this page is the summary.

## 1. How the parts were costed

**In the real product, through CAD-to-Cost into each part's own commodity form — not typed in by hand.**

For every file, in a real browser against a real server (`e2e/cad-parts-live.ts`):

1. Upload the file in **CAD-to-Cost** — the OCCT kernel measures the STEP (volume, faces, holes, sections, draft …).
2. Answer the tool's questions **from its own drop-downs** — route (e.g. cast + machine), process (HPDC / sand),
   material grade, services (heat treat, NDT).
3. **Apply** — fills the commodity's own form: cast + machine, injection moulding, blow moulding, sheet metal, gear,
   machining.
4. **Calculate** in that form → the 8-bucket cost.
5. **Export Excel** and **PDF Report**.

Typed by hand: only annual volume, country and programme life where the test called for them. As a second check, every
STEP part was also costed **headless** (the tool's own back-end chain, no browser), and it had to match the screen to
the penny.

The runs were **rules-only** (no API key): every number came from geometry + rules + the rate library.

## 2. Every part — before and after

UK, 100,000 / yr. "Before" = what the tool did with that file before this review's fixes. "After" = the final live run.
± band = the P10–P90 Monte-Carlo band on screen. Data confidence = the grade from each costing's traced data points (see §4).

| Part | Before: route / process / material → cost | What was wrong | After: route / process / material | After cost | ± band | Data confidence | Screen = PDF = Excel | Independent recompute |
|---|---|---|---|---|---|---|---|---|
| Fuel tank | Injection moulding leaning; blow moulding **not offered** → **timed out** on screen (31 MB) | wrong route; 150 s limit; blank unfold ran 296 s on a tank | Blow moulding, HDPE fuel-grade coex | £28.03 | ±20 % | Low | ✔ | ✔ |
| Bumper | Offered only blow / roto / sheet, **leaning rotomoulding** | read as a sealed tank on fill ratio alone | Injection moulding, PP-B | £12.99 | ±8 % | Medium | ✔ | ✔ |
| CLOSE_VOLUME | Same as bumper (blow-moulding leaning, £3.20) | same | Injection moulding, PP-B | £2.75 | ±7.2 % | Medium | ✔ | ✔ |
| Gearbox housing | Asked for a **tooth count** (filename "_gearbox_"); then only moulding / sheet; HPDC refused → gravity (£64.98) | gear test on a substring; section rule blind | Cast + machine, **HPDC**, ADC12 | £62.32 | ±6.7 % | Medium | ✔ | ✔ |
| Brembo caliper | **Megacasting on a 6,100 t giga-press**, ADC12 (£624.67); after the process moved, ADC12 stayed pinned | no section limit on megacasting; Apply pinned an advisory grade | Cast + machine, **sand**, LM25 / A356 | £628.22 * | ±9.6 % | Medium | ✔ | ✔ |
| Input shaft (Eingangswelle) | Gear route costed a **15.6 mm disc** — £11.27 (Ø9 × 271 bore free) | gear-on-shaft costed as the gear face only | Gear, 20MnCr5 case-hardened, shaft blank | £41.25 | ±8.7 % | Medium | ✔ | ✔ |
| Input_Shaft_machined (no extension) | **Refused** — "unsupported format" | format read from the extension only | read as STEP from its header; = input shaft | £41.25 | ±8.7 % | Medium | ✔ | ✔ |
| Hollow driveshaft | Gear route: disc, **£17.82**; machining route: £185.25 | same disc defect | Gear, 42CrMo4 through-hardened, shaft blank | £116.26 | ±10.6 % | Medium | ✔ | ✔ |
| Servo horn | Screen £5.34 but **headless £3.14** | headless capped a measured op by a removal ceiling | Machining, 6082-T6 | £5.34 (both) | ±8.1 % | Medium | ✔ | ✔ |
| Chain sprocket (STL) | Only cast / machine offered → turned from Ø275 bar, £82.96; entered holes costed nowhere | plate route missing; 5 mm steel defaulted to cold-rolled | Sheet metal (blanked plate), HRPO | £2.96 | ±14.8 % | Medium | ✔ | ✔ |
| Chain sprocket (STL) as machined | £82.96 | — (kept as the comparison) | Machining, EN8 | £82.96 | ±11.4 % | Medium | ✔ | ✔ |
| PRCR002 / Stub axle | £84.58, but **PDF printed ±16.6 %** beside ±6.3 % on screen | report band ≠ screen band | Cast + machine, sand, EN-GJS-500-7 | £84.58 | ±6.3 % | Medium | ✔ | ✔ |
| Steering knuckle | (no defect) | — | Cast + machine, sand, EN-GJS-500-7 | £45.94 | ±5.9 % | Medium | ✔ | ✔ |
| Part1 | (no defect) | — | Cast + machine, gravity, LM25 | £36.76 | ±6.4 % | Medium | ✔ | ✔ |
| Model Mania 2017 | (no defect) | — | Machining, 6082-T6 | £8.18 | ±7.5 % | Medium | ✔ | ✔ |
| Hood bracket | (no defect) | — | Sheet metal (stamping), DC04 | £2.33 | ±9 % | Medium | ✔ | ✔ |
| Seat bracket | (no defect) | — | Sheet metal (stamping), DC04 | £2.18 | ±8.9 % | Medium | ✔ | ✔ |

\* The caliper file models an 80 kg, 777 mm part (~3× a real caliper). £628 is the arithmetic on that file, not a
caliper price.

**Every part, on top of the table** — the PDF and Excel used to say things the costing did not (30+ statements, §4 of
the detailed review): tooling "not in this unit cost" (it is bucket 4), heat treat "NOT in this cost" beside its £,
ductile iron's carbon labelled "Steel", a machined-feature £ total the costing never used, rule-of-thumb "saves ~£x",
"industry benchmark", every Excel £ stored as text. All removed or corrected; Excel money is now numeric, and sheet 7
re-checks the arithmetic and lists every question asked.

### China / 200,000 / 6 years (live, CNY)

| Input | Used? | Evidence |
|---|---|---|
| China | Yes — every rate is China's (labour, machines, energy, overhead 9 %, services, tool building) | PDF "Region: CN", Excel "China (CN) — rates rebuilt", skilled labour ¥71.76/h |
| 200,000 / yr | Yes — cavities, press, die type, batch, route choice | rule bases quote "200,000/yr" |
| 6 years | Yes, after two fixes — tooling over 1,200,000 parts; tools that wear out re-bought; moulding steel chosen over 6 years | Excel "Programme Life 6 years (1,200,000 lifetime)" |

| Part (China) | Before the fixes | After |
|---|---|---|
| PRCR002 | ¥374.99 (programme life dropped) | ¥374.61 |
| Bumper | ¥59.92 → ¥53.71 (fix 1) | ¥52.30 (fix 2: one high-volume mould, not two production moulds) |
| Model Mania | ¥36.40 | ¥36.34 |

## 3. Is it pure arithmetic? — evidence

| Check | Result |
|---|---|
| Screen = PDF = Excel total | 18 / 18 runs, to the penny |
| Screen = headless back-end | every STEP part, to the penny |
| Independent recomputation (not the tool's code: rate × cycle ÷ parts ÷ OEE, overhead × base, margin × subtotal) | 18 / 18 runs: every operation and every total |
| Hand calculations | gearbox housing material £11.550; Model Mania £8.1787 = screen |
| Unit tests | 3,435 passing |
| Every £ figure traceable to a rate with a source and date | yes — Excel sheet 6 (e.g. "UK AMT wage survey Jun 2026") |

**Code audit — can an AI number reach a price?**

- **Rules-only mode (how the demo runs): no.** No AI client is created, the cache never serves an AI result to a
  rules-only request, and a test makes any AI call throw.
- **With an API key and AI mode on: mostly guarded, five gaps remain (not fixed — see §6).** The selected commodity's
  inputs are overwritten by rules or blocked until answered; but:
  1. **Commodities with no rule pack** (wiring harness, BIW assembly, painting, assembly) take the AI's numbers — e.g.
     harness assembly time = the AI's cycle time, unbounded.
  2. **"Alternative processes" Apply** fills a *different* commodity's form from the AI's raw sub-object (die / mould
     cost, cavities, cycle times) — rules run only for the selected commodity.
  3. **Drawing-read coating thickness and masked-feature count** reach the coating cost with no upper bound.
  4. **AI agent `calculate_cost` tool**: the model chooses every parameter; only range-validated.
  5. **RFQ screen**: should-cost = AI-extracted weight × price × conversion, outside the 8-bucket engine.
- **PCB**: the model's component price only picks a point inside the tool's own catalogue / class range — confirmed.

## 4. Confidence — what changed today

- **Confidence grade fixed.** The grade counted only the share of High data points, so a costing with **no** Low data
  (bumper: 5 Medium, 1 High) printed "Model Confidence: **Low**" — 15 of 18 parts. It now scores the whole mix (High 1,
  Medium ½, Low 0; ≥ 40 % Low is always Low). Same data, honest grade: 17 Medium, 1 Low (fuel tank — resin, capacity
  and barrier are leanings, not read off a drawing). `tests/uncertainty.test.ts`.
- **Bands**: the CAD bands come from each driver's own source (unchanged by the grade fix).

## 5. Accuracy — what can and cannot be claimed

- **Arithmetic accuracy: proven** (§3).
- **Accuracy against a real price: unmeasured.** There are no purchase prices or supplier quotes for any of these parts
  (0 actuals). Until a few real POs are logged ("Log Actual £"), no one can say the tool is within X % of the market.
  Say this in the demo.
- What drives the bands: rates are dated, sourced 2026 benchmarks; some material prices are "held — not sourced this
  period" (e.g. pig iron / scrap for ductile iron), and that shows as Low on those lines.

## 6. Is the tool mature? — verdict and what is open

**For the demo path (CAD → rules → commodity form → PDF / Excel): yes, it is consistent, traceable and repeatable.**
Every uploaded file routes to its real process, every figure reconciles, and the reports state only what the costing
holds. **As a product it is not finished.** Open items, in priority order:

| # | Open item | Impact | Effort |
|---|---|---|---|
| 1 | AI-mode gaps 1–5 above (bound or rule-override every AI number; rule packs for harness / BIW / painting; RFQ through the engine) | only when an API key is used | medium |
| 2 | No actuals — accuracy unmeasured | credibility of absolute £ | needs real POs / quotes |
| 3 | STL parts: no hole / feature / tooth measurement (sprocket) | STL costs are blank + press only | medium (pure-TS mesh features) |
| 4 | Gear route has no tube / forged-blank stock (driveshaft removes 84 % of its bar) | over-states hollow shafts | small–medium |
| 5 | Helical gears costed spur-equivalent until the helix angle is typed | small | small |
| 6 | Leak test borrows the tube leak-test rig as a proxy machine | small | small |
| 7 | Gear workbook notes print literal £ in other currencies | cosmetic | small |
| 8 | 4340 priced under 4130 in the library | small | next rate refresh |
| 9 | CAD analysis progress (below) | user confidence on 20–200 s waits | small–medium |

## 7. UI / UX, motion and animation — honest assessment

**Measured today:** 65 screen states (13 screens × desktop / tablet / phone × light / dark): **0 WCAG 2.1 AA
violations** (one regression found and fixed — a button nested inside the 3D viewer's drop-zone button), 0 horizontal
overflow, 0 console errors; first paint 0.3 s.

**Strong — at or near best-in-class:**
- The 3D viewer: eased camera moves (280–480 ms), orbit about the cursor, zoom-to-cursor, section / wall-thickness
  measurement, cost painted on faces; all honour "reduce motion".
- Two-pane costing workspace, searchable commodity switcher, ⌘K search, command menus with full keyboard support.
- Skeleton loaders and a real staged progress tracker on the PCB flow; consistent dark (black + green) and light themes.

**Not yet best-in-class (vs Linear / Stripe / Figma):**
1. **CAD analysis progress sits at "20 % Running OCCT…" for the whole 20–200 s** — no elapsed time, no stages, no
   cancel (the PCB flow already does this properly).
2. **Four animation systems** (CSS, GSAP, Motion, hand-written) act on the same elements: buttons scale, tilt and
   spring and get two click ripples; bouncy / elastic easing reads consumer, not engineering tool.
3. Menus, command palette, trace drawer and result tabs appear / disappear with no transition.
4. Toasts: two copies, hard-coded colours, no screen-reader announcement, no dismiss.
5. Design-system debt: `main.ts` 20,700 lines, ~2,200 inline styles, 279 `!important`, ~25 distinct durations.

**Fixed today:** the hover / spring / parallax / cursor-glow layer now switches off under the OS "reduce motion"
setting (it ignored it), looping spinners stop under it instead of cycling every millisecond, the drop-zone
accessibility error, the CAD panel no longer shows the API-key box / Opus checkbox / AI-mode picker on an installation
without AI and says "Auto-detect (from the geometry)" instead of "AI selects", and the machining form's example cards
(named after OEM parts) now say "illustrative inputs, not OEM data".

**Verdict:** professional and credible for a director demo — clean, consistent, accessible, fast. Not yet
best-in-class in motion design: it needs one restrained motion system, a real progress experience on the long CAD
analysis, and enter / exit transitions on overlays.
