# Should-cost report standard — five-role review and decisions (3 Nov 2026)

**Why:** the stub axle PDF was 22 pages / ~11,000 words; nobody reads it. Five independent reviewers — Cost Engineering
Director, senior cost engineer, DFM / DFA expert, manufacturing engineer, quality engineer — read the stub axle report line
by line and the other 14 commodity reports (15 real parts, UK and China, 200,000 a year, 5 years, ex-works, live exports of
3 Nov 2026). Their registers are in this folder (`director.md`, `cost-engineer.md`, `dfm.md`, `manufacturing.md`,
`quality.md`; ~350 findings, brief in `brief.md`).

**Decided with the user (3 Nov 2026):** a **core should-cost report of 6–8 pages** for decision-makers and a **separate
audit pack** (the full detail); the Excel workbook keeps everything; carbon moves to the audit pack; quality items the
costing does not price are listed as **"Not included" until the engineer answers** — never invented as a cost.

## 1. Where all five agree

| # | Finding | Who | Effect |
|---|---|---|---|
| 1 | The arithmetic holds — every bucket re-adds; China = UK ÷ FX | all | keep |
| 2 | Length and duplication: cover, executive page, §1, §2, §7 repeat the same facts; three pages of rule bases; four of rate build-up / traceability | Director, cost eng. | restructure |
| 3 | **False multi-cavity lever** on the casting bracket: £5.93 (34 %) — it halves machining and fettling too; real ≤ £0.5 | all five | WRONG |
| 4 | **Rule-of-thumb levers presented as re-costed**: "cycle time −20 %", lights-out "manning ×0.6, no capex", "consumables ×0.8", "packaging ×0.5", £0.00 levers | Director, cost eng., DFM, mfg | WRONG |
| 5 | **DFM draft / fillet / section checks run on machined faces** of finished castings and forgings (stub axle 26, knuckle 44 + 42 fillets) — the costing itself machines those faces | DFM, mfg, quality, Director | WRONG |
| 6 | DFM £ are feature costs, not design savings (deep hole £1.29 at 4.2 × D — standard drill reach; 14 "sizes" are stepped-bore lands and a centre hole); severity inflated (7 of 9 MAJOR) | DFM, mfg, Director | WRONG |
| 7 | Process-wrong text and sources: NADCA (die casting) on sand castings, die wear / slides on sand, pinch-off on roto, runners on thermoforming; Boothroyd DFA block with no assembly and no £ | DFM, quality, Director | WRONG / REMOVE |
| 8 | "Material" mixes metal, cores, NDT, blast, tool wear and energy (stub axle: £11.98, of which £2.71 iron) — an index clause on it passes 4.4× the metal movement | Director, cost eng. | MISSING split |
| 9 | Tooling reported as one figure (first set + every replacement + perishables): stub axle £731k (first investment ~£26k), gear £607k of hob / wheel wear, composites £25.3M | Director, cost eng., mfg | MISSING split |
| 10 | Page 1 hides cheaper feasible routes the report itself found (roto → blow −84 %, thermoform → injection −49 %) and uncosted scope (knuckle: 9 machinable features "NOT costed", up to ~£33) | Director, mfg | MISSING |
| 11 | "Not included" names only freight and duty: PPAP / initial samples, gauges / check fixtures, part marking, wash, rust protection, leak tests, nodularity / hardness checks are silently absent | quality, mfg, Director | MISSING |
| 12 | Internal / supplier-useful text: "(not used)" rejected tooling estimates (£32.5k, £98k, £126k), research-log notes, the lathe priced from a mill's list price, a machinist wage from an electricians' page | Director, cost eng. | REMOVE / FIX source |
| 13 | Checkbox fields print "on (edited)" whatever the costing applied (vent-pipe leak test, rotary former) | quality, mfg | bug |
| 14 | Hub flange: the file names C45, costed as 38MnVS6 with no heat treatment (~+£1.22) | quality, mfg, cost eng. | WRONG |
| 15 | Route comparison: safety-critical ductile part compared in grey iron; knuckle precision-forging £34.52 consumables unexplained | mfg, quality | WRONG |
| 16 | No capacity statement: the stub axle implies ~17 HMCs and a moulding line at 123 % load; roto 92 moulds; composites ~10 autoclaves | Director, mfg | MISSING |

## 2. Cost-model findings that move headlines (need SOURCED data — not reviewers' judgement)

| Finding | Reviewer estimate | Why it is not fixed by editing a number |
|---|---|---|
| Machining time base — planar faces at 40 cm²/min, fixed per-hole allowances, the cast-iron factor on fixed allowances | stub axle −£8–12, manifold −£5–8, knuckle / bracket / flange −£2–5 | needs published cutting data (vc, fz, ae / ap by material), chip-to-chip times and ideally two supplier cycle sheets |
| Foundry practice by volume — semi-automatic line at 30 moulds/h, 6 min manual fettling, wood-pattern life on an aluminium plate | stub axle −£2–3; tooling £731k → ~£30–100k | needs automatic-line rates, crew, fettling and pattern-life norms from a source |
| Composites tool life 500 parts | hat stiffener −£25–27 (≈ 39 %) | needs tool life by tool material (steel / Invar / CFRP) |
| HMC depreciation life at 3 shifts; one shift pattern per routing; lathe capex | ± £1 | rate-book research round |

These are scheduled as their own round: research with sources → rule change → shadow models + real-parts baseline → live
re-cost. Until then the core report labels the machining minutes "engineering-typical, conservative — confirm with a
supplier cycle sheet" and lists the unsourced figures with their £.

**Outcome of that round (3 Nov 2026, commits 926bf527, 56a18442; research and the independent re-check in
`scripts/research/2026-11-report-standard/`):**

| Finding | Done | Effect at 200k / 5 yr, UK, ex-works |
|---|---|---|
| Machining time base | cutting time from makers' published data (`cutting-catalogue.ts`); allowances no longer scaled by the metal; through holes not reamed; 2.2 s tool change, 7.1 s pallet change | manifold £21.17 → £15.07, knuckle £19.60 → £14.78, hub flange £16.69 → £11.29, yoke £19.94 → £12.63 |
| Foundry practice by volume | automatic line + robotic fettling cell (sourced capex, book hours convention stated), line by moulds a year, crew by line, 100k aluminium pattern life; core build-up NOT done (binder quote needed) | with machining: stub axle £41.24 → £24.18, casting bracket £19.42 → £9.18 |
| Composites tool life | tool material by cycles a tool, published hand-layup rate and M21 cure, PCM comparison row | hat £69.30 → £62.05 (PCM £47.49); roof £437.49 → £624.81 (PCM £435.90) — hand layup at 200k is not credible and the report says so |
| HMC depreciation / shift / lathe capex | not done | next rate-book round |

The stub axle now sits BELOW the cost engineer's £30–35 judgement. Both changes are sourced and the shadow models close,
but the automatic line's hours (book convention) and the unsourced core cost carry the moulding figure — confirm against
a supplier quote before it is used in a negotiation. Accuracy remains unmeasured (0 actuals).

## 3. The report standard

**Core report (target 7 pages):**
1. *Decision* — headline, annual spend, piece price excluding tooling / initial tooling / replacement tooling a part, band +
   "accuracy not measured", confidence by distinct inputs and the £ resting on unsourced figures, cheaper feasible route and
   uncosted scope alerts, commodity "Not included" list.
2. *Cost build-up* — 8 buckets with material split (metal / consumables & services / energy), £/kg for castings and
   forgings, tooling table (first set, replacements, perishables), commercial basis labelled.
3. *Process* — specification costed to, routing, one operations table with burdened £/h, capacity implied, key process
   parameters.
4. *What moves the price* — unsourced assumptions with £, top sensitivity, volume line.
5. *Supplier negotiation* — questions with our value, quote-breakdown request, physically-defined levers only.
6. *Alternatives* — feasible routes (cheaper or within ±50 %), country table.
7. *Design to cost* — ≤ 5 DFM findings that apply to the costed process and faces, one "not checked" line, stamp,
   sign-off block.

**Audit pack:** rule bases, rate build-ups, traceability, the full DFM with faces and sources, re-adds, infeasible routes,
uncertainty method, sensitivity table, carbon. **Excel:** everything, plus a DFM sheet.

## 4. Commodity matrix

See `director.md` §B (merged with the other four matrices). Per commodity it fixes: the page-1/2 drivers, what goes to
the audit pack, the DFM / quality checks that apply and must NOT apply, and the "Not included until answered" list. It is
implemented as data in `src/export/report-standard.ts`.
