# Injection-moulding cost model — end-to-end review, 2 October 2026

A cost engineering director found the injection-moulding model wrong. This note
traces it from the uploaded CAD to the pound, lists what was wrong at each step,
what was changed, and what is still open. Every finding has a test in
`calculator/tests/moulding-review.test.ts`.

**Summary.** The arithmetic engine adds up correctly. What was wrong was the
geometry going into it and the cycle physics:
- the measured wall of an ordinary moulding was the size of its cavity
- the projected area of any open shell was a quarter of its real shadow
- the press dry cycle was a flat 2 s from 50 t to 3,500 t
- fill time ran backwards
- the tool was averaged with a face-counting heuristic
- a moulded cover was routed to sheet metal without a question
- the screen ran its own parallel model, and differed from headless on regrind, manning, scrap and amortisation

## 0. Test parts

The audit set (`cad-audit/parts`) held **no plastic part**. Three mouldings were
therefore modelled in OCP to production moulding design rules by
`cad-audit/parts/IM_modelled_parts.py`, measured by the real kernel, and added
to the real-parts baseline.

| Part | Geometry | Resin |
|---|---|---|
| ECU cover | 180 × 120 × 40 mm, 2.5 mm wall, 1.5° draft, R3 fillets, 4 screw bosses, rib grid, 4 snap-fit windows | PA66-GF30 |
| Cable clip | 40 × 25 × 12 mm, 2.0 mm wall, latch window | PA66-GF30 |
| Storage tray | 600 × 400 × 60 mm, 3.0 mm wall, 2° draft, R5 fillets, 2 ribs | impact PP |

**They are not customer parts.** They exist because the synthetic fixtures had hidden
every error below. Replace them with real mouldings and their quotes when available.

## 1. Findings

| # | Step | What was wrong | Effect | Fix |
|---|---|---|---|---|
| 1 | Wall | The thin-shell correction (wall = 2·V/S when the ray cast crosses a cavity) only fired below **5% fill**: right for a bumper, wrong for every ordinary moulding. | ECU cover (fill 14%): ray-cast mean 29.5 mm, "governing" wall 59 mm, cooling **6,962 s a shot**, **£30.43** for a 159 g part. Clip: 13.8 mm wall. | Guard is fill < 0.5. A solid part is still excluded twice: 2·V/S > 5 mm and fill > 0.5. No real metal part changed. |
| 2 | Projected area | Estimated as bbox face × √fill whenever fill > 5%. That is right for a solid, but for an **open shell** the shadow is the whole footprint. | Tray: 655 cm² against a 2,403 cm² shadow, a **350 t press instead of 1,200 t**. Cover: 81 against 216 cm². | The kernel now **measures** the silhouette: it tessellates the solid, projects along the draw and each axis, and rasterises the union (`projectedArea`, pure OCP). Used by moulding, casting, forging, rubber, rotomoulding and thermoforming. The estimate stays only as fallback. |
| 3 | Dry cycle | Mould open + eject + close was a flat **2 s on every press**, 50 t to 3,500 t. | Large parts under-timed | Dry cycle by press size (1.5 s at 50 t to 11 s at 3,500 t) + 1 s take-out, stated. |
| 4 | Fill | Fill time was **0.5 s per mm of wall**. That is backwards: a thicker wall fills faster, and what takes time is volume. | — | Shot volume ÷ the press's injection rate (40 to 1,400 cm³/s by size), floor 1.5 s. |
| 5 | Cavitation | The optimiser treated the shot as identical on every press. | Multi-cavity favoured | Each candidate is ranked on its own press's dry cycle and fill. |
| 6 | Tool | The toolmaker build-up was **averaged with the kernel's face-count figure** (£120/face + £8,000 per undercut face, capped at £200k). | Pulled the one quoted tool (bumper, £420k) toward the cap | Build-up alone; kernel figure printed "(not used)". See §3 on the quote. |
| 7 | Runner | Always a cold runner at 15% of part weight, even on a 4.5 kg bumper. | Kilograms of runner waste a shot on large parts | Hot runner for parts ≥ 250 g or ≥ 1M/yr, one drop per ~1,500 cm² (bumper: 6 valve gates). Cold runner ≥ 3 g a cavity. |
| 8 | Regrind | Headless 0.80, screen 0.20, no rule. | Material differed | Rule: min(0.8, 20% blend limit × shot ÷ runner); 0 on hot runner; "set 0 where the specification forbids regrind". |
| 9 | Manning | Headless 1.0 on every press, screen 0.25. | Labour **4× apart** | Rule: 0.5 to 500 t (one operator, two presses), 1.0 above. |
| 10 | Scrap | Headless 3%, **screen none** (no field). | — | Rule 2% (typical 1–3%) + a form field. |
| 11 | Screen CAD fill | A second model in the browser: area = bbox X × Y (the orientation coin-flip the rules fixed), raw ray-cast wall, kernel mould cost, and cooling / pressure maps keyed on ids that do not exist (`'mat-pp'`, `'mat-pc'`), so every resin got 3.0 s/mm² and 50 MPa (PC was mapped to 4.50). | Silent wherever a rule did not overwrite it | Form takes the analysis values only. |
| 12 | Screen | Clamp warning and fallback tool estimate used **one cavity's** area as the whole tool's. | Under-sized presses passed the warning | × cavities. |
| 13 | Headless | Fallback press from a local area-based picker at a fixed 30 MPa, a third sizing formula. | — | One sizing: area × cavities × resin pressure × 1.15. |
| 14 | Identification | The bend detector reads a moulded shell's fillets (concentric inner / outer radii) as sheet-metal bends. | ECU cover (12 "bends") and tray (8) routed to **sheet metal with no question** | With bosses, or a file that names another process, it **asks**, leaning to moulding. The real pressing still routes outright. |
| 15 | Packaging | A fixed 9p a part (5p box + 4p freight) whatever the size. | A 5 g clip paid nearly half its cost in handling | The fixed base scales below a 250 cm³ envelope. Unchanged for every current real part. |

## 2. Before and after (headless)

| Part | Before | After | What moved |
|---|---|---|---|
| ECU cover, PA66-GF30, 100k/yr | **£30.43** (59 mm wall, 7,002 s shot, 8-up 500 t) | **£1.42** | 17.6 s shot, 1-up 200 t, cold runner, £32.4k tool |
| Cable clip, PA66-GF30, 1M/yr | £0.73 (13.8 mm wall, 392 s shot) | **£0.20** | 12.5 s shot, 4-up hot runner 50 t |
| Storage tray, PP, 50k/yr | £4.86 (**350 t press**, 2 s eject) | **£7.79** | 1,200 t press, 7 s dry cycle, hot runner, 2 drops |

At the baseline's 50k/yr: cover £1.81, clip £0.35, tray £7.79.

Two metal parts moved slightly when re-measured with the new silhouette:
- **Casting Bracket:** tooling £0.29 → £0.36 (pattern plate sized on the real shadow).
- **Steering knuckle:** tooling £1.21 → £1.17.

Hand reconciliation of the ECU cover at 100k/yr. Every line uses library rates:
PA66-GF30 £3.10/kg (scrap £0.05), imm-200t £27.03/h, semi-skilled £19.94/h.

| Line | Working | £ |
|---|---|---|
| Material | net 0.1591 ÷ 0.98 = 0.1623 kg; gross ×(0.1591 + 0.0239 × 0.2) ÷ 0.1591 = 0.1672 kg × £3.10 − 0.0049 × £0.05 | 0.518 |
| Cycle | fill 1.5 + pack 2.0 + cool 2.0 × 2.3² = 10.6 + eject 3.5 = 17.6 s; ÷ 0.98 | — |
| Press | 17.6 s ÷ 3,600 ÷ 0.98 × £27.03 ÷ 0.80 OEE | 0.168 |
| Labour | same hours × £19.94 × 0.5 manning ÷ 0.92 | 0.054 |
| Tooling | £32,441 ÷ 100,000 (1 tool, production steel, 1M-shot life) | 0.324 |
| Packaging + logistics | geometry estimators | 0.12 |
| Overhead 12% of £1.064; margin 8% of subtotal | | 0.128 + 0.105 |
| **Total** | | **1.42** |

Live in a browser, the screen fills the same wall, area, cavities, press, fill /
pack / eject, runner, regrind, scrap, manning and tool, and costs **£1.40**.
Material and tooling match to the penny; process and labour differ by the
shop-default OEE (0.85 against 0.80) and labour efficiency (0.95 against 0.92).

## 3. Still open, stated rather than hidden

- **The one tool quotation.** The build-up was calibrated to the £420k bumper
  quote with a cold runner and its own footprint-derived depth. With the hot
  runner the bumper actually has (6 drops), it is **+10%** on the quote. The
  measured depth (45 cm) would make it +21%, so depth is not yet used. One quote
  cannot separate the two; two or three more would.
- **Amortisation policy.** The tool's steel class and life are sized on a 5-year
  programme's shots, but its cost is amortised over **one year's** volume, as for
  every commodity here. Many OEMs pay tooling separately. This is a policy for
  the director, not a formula fix.
- **Wall of a ribbed part.** 2·V/S reads slightly under the nominal wall when ribs
  and bosses are thinner (2.27 against a 2.5 mm design), so cooling can be up to
  ~20% short on rib-heavy parts.
- **Engineering-typical constants**, each printed on its rule and meant to be
  replaced with the moulder's data:
  - dry-cycle and injection-rate tables
  - take-out time
  - cold runner 15% / 3 g
  - hot-runner thresholds and drops per 1,500 cm²
  - 20% regrind blend
  - manning 0.5 / 1.0
  - 2% scrap
  - the curated cooling factors and cavity pressures per resin
- **Form multipliers** on the tool for tolerance (×1.2–2.0) and finish (textured
  ×1.1, high-gloss ×1.4, painted ×1.6) have no source; "painted" in particular is
  questionable.
- **Not modelled:** colour masterbatch and resin drying (the resin is taken as
  pre-coloured and dry); inserts and secondary operations stay manual entries.
- **The test parts are modelled, not real.** None of these figures has been
  compared with a price JLR paid.
