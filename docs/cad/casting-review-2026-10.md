# Casting cost model — end-to-end review, 2 October 2026

A cost engineering director found the casting model wrong. This note traces the
model from the uploaded 3D CAD to the pound, lists what was wrong at each step,
what was changed, and what is still open. Every finding has a test in
`calculator/tests/casting-review.test.ts`.

**Summary.** The arithmetic engine (`core.ts`) adds up correctly. What was wrong
was the inputs and the structure: a moulding time with no physical basis, a melt
shop that sold its own runners as scrap and never paid for electricity, a
fettling and heat-treat route that was printed on screen but never costed,
process choice and shot time read off ray-cast artefacts, and tooling priced by
counting B-rep faces. The screen and the headless path also disagreed on
tooling and labour.

## 1. The chain, as it now runs

```
STEP ──► kernel (cad-geometry-engine.py)
           volume V, surface S, bounding box, draw direction, undercut faces,
           holes, wall samples
     ──► rules (cost-input-rules/commodities/casting.ts)
           material family ─► grade           (process-aware for aluminium)
           alloy, mass, section 2V/S, volume, service answers ─► process (advisor)
           process + alloy ─► yield
           footprint across the draw ─► impressions per flask ─► sand line time
           section 2V/S ─► HPDC shot time
           projected area ─► HPDC press (clamp force) and tooling (toolmaker build-up)
           undercuts ─► cores, slides
           process + alloy + mass + service ─► fettling, heat treat, blast,
                                               impregnation, NDT
     ──► toCostParams (headless) / form fields (screen) — the same values
     ──► casting module (modules/casting.ts)
           pour = part ÷ (1 − reject) ÷ yield
           metal bought = part + dross lost remelting the gating
           melt energy = pour × kWh/kg × library tariff
           moulding / die-casting op, fettling bench op, post-cast £
     ──► core.ts: 8 buckets
```

## 2. Findings

| # | Step | What was wrong | Effect on real parts | Fix |
|---|---|---|---|---|
| 1 | Material | Runners, risers, biscuits and overflows were credited back at the **scrap** price (£0.28/kg for cast steel bought at £2.10; £0.54 for ADC12 bought at £2.75), as if the foundry sold its own returns. Foundries remelt them; only the dross / oxidation loss is metal lost. | +£2.47 of metal on the Casting Bracket | `casting-melt.ts`: loss per remelt by alloy (Al/Mg 4%, ferrous / copper 3%, zinc 2%); utilisation buys part + lost metal |
| 2 | Material | **Melting was not charged anywhere.** Not in an ingot price, not in a moulding-line or die-casting machine rate (their energy lines are tens of kW). | £0 for melting a 4.9 kg steel pour | Pour × kWh/kg × the library tariff (Al 0.65, iron 0.60–0.62, steel 0.70, stainless 0.75 kWh/kg) |
| 3 | Moulding | Sand line time was the kernel's **0.15 + 0.04 h per kg**, which has no source. It charged pour, solidify and knockout as line time, as if the line stood still while castings cooled, and always used **aluminium density**, so steel was under-weighted. One part per mould. | 11 min, **£13.38** of moulding on a 2.5 kg steel bracket | Mould time ÷ impressions: footprint across the draw + 50 mm gating packed into a 500 × 400 flask at 30 moulds/h (stated, low end of semi-automatic lines). Bracket: 4 a mould, **£0.53** |
| 4 | Route | The advisor printed "Fettle, Heat treat, Shot blast, X-ray" on screen, but `estimateCastingSecondaryAdders` **had no caller**. Nothing in the route after pouring was costed. | £0 for fettling and normalising a steel casting | New rules: fettling minutes as foundry **labour**, a bench operation (light 2 / medium 6 / heavy 15 min); heat treat £/kg (steel normalised, Al gravity/sand T6, HPDC none); shot blast; impregnation when pressure-tight; X-ray / CT when safety-critical |
| 5 | Process | The HPDC "thin wall ≤ 4 mm" test used the ray-cast **minimum** wall, which on real CAD is a fillet edge. | PRCR002 (15 mm sections) sent to HPDC off a 0.45 mm reading | The casting section 2V/S (the modulus freezing time scales with). PRCR002 → gravity |
| 6 | Shot time | HPDC cycle = 45 + 3 × ray-cast **mean** wall, which on a sparse part measures across cavities. | 147 s a shot on PRCR002 (mean "wall" 34 mm) | 45 + 3 × 2V/S |
| 7 | Tooling | The kernel's die estimate was **B-rep face count × £150 + £10,000 per undercut face**. Fillets multiply faces, and 20 undercut faces are a few slides, not twenty. The rules preferred it to the toolmaker build-up in `casting-tooling.ts`. | **£300,000** HPDC die (the kernel's cap) on a 2.8 kg housing; the shop model says ~£40k | Toolmaker build-up first (hours × toolroom rate + steel + bought-outs), with complexity from slides (undercuts ÷ 6) and core boxes. The kernel figure is printed in the basis as "(not used)" |
| 8 | Tooling | A sand pattern was priced for **one** impression and its life counted in castings. | Pattern sets over-counted when a plate carries several parts | The plate carries every impression; life = 8,000 moulds × impressions |
| 9 | Yield | One yield per process (sand 0.55–0.75) whatever the alloy. Steel shrinks ~6% and needs big risers; grey iron barely needs feeding. | Steel bracket at 0.65, which under-buys metal | Sand / gravity yield by alloy: steel 0.45–0.60, ductile 0.55–0.70, grey 0.65–0.80, Al / Mg / Cu 0.50–0.70 |
| 10 | Grade | Aluminium was always ADC12, a die-casting alloy that **cannot be solution treated**. | A gravity housing "T6 treated" in an alloy that cannot take T6 | Gravity / sand aluminium → A356 / LM25 (`mat-lm25`) |
| 11 | Press | HPDC machine picked from `mass × 220` read as **tonnes** (a mass passed where a force was expected), and on headless only. | — | Rule: projected area × cavities × 1.25 × 0.8 t/cm² (≈800 bar), × 1.2 safety |
| 12 | Screen ≠ headless | The form filled tooling and sand cycle from the **kernel's raw estimates**, bypassing the rules. | Screen: £80,000 gravity mould, £14,500 pattern; headless: £10,917, £7,205 | Form takes the rule-decided values headless costs |
| 13 | Screen ≠ headless | Labour drop-down defaulted to a skilled machinist (£26.19/h); headless used foundry (£18.63/h). | Casting labour 41% higher on screen | `casting.labourId` rule → `lab-uk-foundry` on both |
| 14 | Consumables | Cores, wax and shell were not uplifted for rejects, but every scrapped casting consumed them too. | Small | Reject uplift applied |
| 15 | Investment | Wax and shell were costed at **£0** headless, although the kernel computed them on every upload. | Investment castings under-costed | Rules carry the kernel's area-based wax / shell |
| 16 | Test fixture | The synthetic "3 mm wall" housing used in three test files had 1,037 cm³ over 1,220 cm²: a **17 mm** section. The old rules read a hand-written ray-cast wall and never noticed. | Tests passed on an impossible part | Surface corrected to 6,913 cm² (2V/S = 3.0 mm) |

## 3. Before and after, real parts (headless baseline, 50,000/yr)

| Part | Before | After | What moved |
|---|---|---|---|
| Casting Bracket (steel, sand + machine) | £45.79 | **£32.30** | Moulding £13.38 → £0.53; fettling +£2.09 (labour); normalise +£0.88; melt +£0.92; returns −£2.47; yield 0.65 → 0.53; pattern £14,500 → £7,205 four-up |
| PRCR002 (aluminium housing) | £53.38 (HPDC, £300k die, 147 s shot) | **£49.85** (gravity, £10.9k mould, A356, T6) | Process re-routed by section; tooling £6.00 → £0.22; T6 +£3.08; returns and melt |

Hand reconciliation of the Casting Bracket, every line against the library
(`calculator/tests/casting-review.test.ts` pins the pieces):

| Line | Working | £ |
|---|---|---|
| Metal | (2.590 kg part incl. 3% reject + 0.069 kg dross) × £2.10 − 0.069 × £0.28 | 5.56 |
| Melt energy | 4.886 kg poured (yield 0.53) × 0.70 kWh/kg × £0.268/kWh | 0.92 |
| Core | £1.50 × 1.031 | 1.55 |
| Normalise | £0.35/kg × 2.512 kg | 0.88 |
| Shot blast | flat | 0.35 |
| **Material** | | **9.26** |
| Moulding | 0.0083 h × 1.031 × £33.46/h ÷ 0.80 OEE | 0.36 |
| Machining | mill 0.093 h × £46.24 ÷ 0.8 + drill 0.0905 h × £31.13 ÷ 0.8 + setup | 8.92 |
| **Process** | | **9.28** |
| Moulding labour | 0.0086 h × £18.63 ÷ 0.92 | 0.17 |
| Fettling | 6 min × 1.031 × £18.63/h ÷ 0.92 | 2.09 |
| Machining labour | 0.184 h × £26.19 ÷ 0.92 + setup | 5.24 |
| **Labour** | | **7.50** |
| Tooling | £7,205 four-up pattern × 2 sets ÷ 50,000 | 0.29 |
| Packaging + logistics | geometry estimators | 0.42 |
| Overhead 12% of £26.33 base, margin 8% of subtotal | | 3.16 + 2.39 |
| **Total** | | **32.30** |

Live in a browser after the fix, the screen fills the same grade, yield, line
time, fettling, heat treat, blast, labour and tooling as headless. Material
matches to the penny on both parts.

## 4. Still open, stated rather than hidden

- **Ferrous material price basis.** The library's casting pricing note says its
  £/kg includes a "melt / cast / finish margin". The aluminium grades are plainly
  ingot prices (ADC12 £2.75 against LME ~£2.67), so they need the melt line added
  here. Grey iron (£0.64) and cast steel GS-C25 (£2.10) are well above their
  charge cost, so they may already carry some melting. If they do, the melt line
  double-counts about £0.17–0.19/kg poured. Rates move only through
  `scripts/rate-refresh.ts`, so this is for the next refresh to settle, with a
  foundry quote.
- **Engineering-typical constants**, each printed on the basis and meant to be
  replaced with plant data:
  - 30 moulds/h and a 500 × 400 mm flask
  - melt kWh/kg and loss
  - fettling minutes
  - the advisor's £/kg heat treat, £0.35 blast, £0.90 impregnation, £5 X-ray
  - yield bands
  - tool lives

  None has been compared with a price JLR paid.
- **Shot blast is flat** at £0.35 a part. A 50 kg casting blasts for more. The
  mass-based blast machine route exists in Surface Finishing; switching it on by
  default is a separate change.
- **Machining allowance.** Cast-and-machine still takes the as-cast weight as the
  finished weight, which the parameter builder states. The STEP is the finished
  part, so the stock removed is not measured.
- **Machining half, screen vs headless.** The screen's batch size defaults to 50
  and headless to annual ÷ 20; the screen's amortisation volume defaults to
  100,000. These are shop defaults, not casting, and move the total by about 3%.
- **The snapshot prompt fixture** in `scripts/snapshot-commodity-rules.ts` is the
  same 17 mm-section housing and is documented as deliberately not plausible.
  Its casting block now reads gravity, which is correct for that section.
- **The knuckle** is still costed as a forging, because the label says so; the
  file calls it a casting pattern (see `process-material-identification-2026-10.md`).
