# Material scope per commodity — review, October 2026

**Request.** Each commodity's material drop-down should show, and the cost should consider, only that commodity's grades. Casting shows casting alloys, forging shows forging stock, injection moulding shows moulding resins, sheet metal shows sheet. Every commodity was to be checked for missing grades.

**Result.** There is now **one scope table**, `src/engine/material-scope.ts`, that both the screen and the engine read. Every material drop-down is scoped to it, and so is every list on the CAD panel. The rules refuse a grade outside it.

17 missing grades were added. `tests/material-scope-review.test.ts` pins it all, one test per finding.

## 1. What was wrong

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | The scopes lived only in the UI | They were loose substrings, and the engine had no scope at all. | `MATERIAL_SCOPE_BY_COMMODITY` matches exact categories, in the engine. The UI's `MATERIAL_SCOPE_BY_SELECT` is built from it. |
| 2 | Sheet metal | `/Sheet/` listed the **18 plastic thermoforming sheets**. It missed **22MnB5, Usibor 1500 / 2000 and MS1200–1500**, the hot-stamped BIW grades. | Exact sheet categories, including Press-Hardening Steel and Ultra-High Strength Steel. |
| 3 | Sheet-metal fabrication form | A hand-written list replaced the scope and dropped IF, coated, bake-hardening and hot-stamping grades. | Removed; the scope applies. |
| 4 | Machining and forging | `/Billet/` listed the **30 aluminium extrusion logs**. | Excluded. |
| 5 | Injection moulding | Listed machining **stock shapes** (POM-C rod, PEEK stock, PTFE) and **masterbatches** as base resins. | Resins, TPEs and high-performance resins only. Masterbatches have their own `additive` scope for the let-down pickers. |
| 6 | Casting | Listed two machining bars (CZ121 brass, PB1 bronze), because they shared "Copper Alloy". | Those two are now "Copper Alloy Bar", in machining and gear. |
| 7 | Gear | **No scope at all** — the whole catalogue of about 430 grades. | Steel bar and billet, ductile and grey iron, bronze bar and plastic stock. That covers every grade the gear classes default to. |
| 8 | Blow moulding | The form and the resin question offered **injection pellets** (`mat-hdpe`, `mat-pp-homo`, `mat-pet-bg`) and defaulted to one. The library's 16 blow grades were not the default. | Blow grades only, in the form and in the question. |
| 9 | Rotomoulding | The form added an injection LLDPE pellet. | Roto powders only. |
| 10 | Rubber | The form dropped the TPEs that its own scope includes. | The scope applies. |
| 11 | Extrusion and thermoforming forms | Each re-filtered its drop-down with its own allow-list. The extrusion one let in blow-moulding, injection and rubber grades. | Removed; the scope applies. |
| 12 | `src/ui/populate.ts` | Dead code that filled every material drop-down with the full catalogue. | Deleted. |
| 13 | **The engine accepted any grade** | Any library id was accepted as a resin, a rubber compound or an AI-supplied materialId. A sheet grade on a casting was priced as given. | The resin and compound questions **re-ask** on an out-of-scope answer. A carried materialId outside the commodity's scope is **replaced by the commodity's own grade for that family, and the substitution is stated** (`toCostParams` → `assumed`). |

## 2. Grades added — 17

These are priced as the library does: from a library sibling where one exists, else a sourced 2026 price, else a labelled estimate. The arithmetic is in each note. Combined with the two earlier reviews, extrusion and casting / forging have also been completed.

### Injection moulding (7)

| Grade | £/kg | Basis |
|---|---|---|
| PBT unfilled | 2.70 | ESTIMATE, below PBT GF30 |
| TPE-S (SEBS) 60A, overmould | 2.60 | ESTIMATE, between the library's TPU and TPV |
| PSU | 8.50 | ESTIMATE, below PEI |
| PPSU | 16.00 | ESTIMATE, above PEI |
| PLA | 2.24 | €2.61/kg, Europe, September 2026 |
| ABS FR (UL94 V0) | 2.01 | ABS + 15 % FR masterbatch |
| PC GF20 | 2.37 | PC + 20 % glass (glass price an estimate) |

### Sheet metal (5)

| Grade | £/kg | Basis |
|---|---|---|
| S355MC | 0.80 | HRPO + structural extra (estimate) |
| S420MC | 0.82 | HRPO + structural extra (estimate) |
| 409L ferritic stainless (exhaust) | 2.85 | 430 − 6 % Cr |
| 441 ferritic stainless (hot exhaust) | 3.16 | 430 + Cr + Nb (Nb an estimate) |
| AA1050A-H14 | 3.01 | AA3003 with its Mn replaced by Al |

### Machining bar (5)

| Grade | £/kg | Basis |
|---|---|---|
| EN3B / 1020 bright mild steel | 0.94 | EN8 − medium-carbon extra (estimate) |
| 11SMnPb30 / 12L14 free-cutting | 1.17 | EN3B + the library's free-cutting extra |
| 7075-T6 bar | 4.85 | 6082 bar + the 7075 − 6082 stock difference |
| 416 free-machining stainless | 3.93 | 410 + the 303 − 304 free-machining extra |
| C101 copper bar | 11.05 | LME Cu + bar premium |

## 3. Coverage now (grades a commodity's drop-down offers)

| Commodity | Grades | Commodity | Grades |
|---|---|---|---|
| Machining | 86 | Injection moulding | 56 |
| Casting / cast + machine | 59 | Blow moulding | 19 |
| Forging | 45 | Rotomoulding | 9 |
| Gear | 58 | Thermoforming | 18 |
| Sheet metal / fabrication | 82 | Polymer extrusion | 29 |
| Aluminium extrusion | 30 | Rubber | 26 |
| Composites | 14 | Painting | 9 |
| Additive pickers | 8 | | |

The only grades that no commodity offers are the virtual pass-through and the two hairpin winding wires. The test pins that list.

## 4. Effect on recorded costs

Only the two blow-moulded parts moved. Blow moulding now buys the blow grade the library holds for it, not the injection pellet:

| Part | Before | After |
|---|---|---|
| Washer reservoir | `mat-hdpe` £1.05/kg | `mat-hdpe-bm` £1.14/kg |
| Air duct | `mat-pp-homo` £0.99/kg | `mat-pp-bm` £1.11/kg |

On the baseline, the air duct goes from £1.20 to **£1.24** and the washer reservoir from £1.59 to **£1.62**. The real fuel tank is £29.12 → **£28.91**. It was already on the barrier grade; the blow grade's 950 kg/m³ against the pellet's 960 makes it 1 % lighter. No other recorded cost moved.

## 5. Still open

- **Estimates.** PBT, TPE-S, PSU, PPSU, glass fibre, the structural-steel extras and Nb are labelled estimates. The next rate refresh should source them.
- **Shared TPE category.** TPE grades sit in one category shared by injection, blow and rubber. That is deliberate, since all three process them, but a TPE grade appears in all three drop-downs.
