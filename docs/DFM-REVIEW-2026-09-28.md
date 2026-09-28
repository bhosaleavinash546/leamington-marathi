# DFM / DFA Studio — end-to-end review, 28 September 2026

Scope: every rule family, the geometry layer behind them, the HTTP route and the
studio page. Method: **measure, then read, then change**, with no model in the
loop — every verdict below comes from the OpenCascade geometry pass and the rule
catalogue, and every truth figure comes from how the test part was constructed.

## 1. What the tool is, measured

| Item | Count |
|---|---|
| Rule families (process routes) | 35 |
| Rules in the catalogue | 248 — 207 industry consensus, 38 citing a named standard (NADCA, SFSA, DIN 16742, ISO 8062-4, DuPont, Covestro), 3 engine-derived |
| Distinct measurements the rules read | 60, every one produced by the engine |
| Rules the catalogue lists as not yet writable | 18, each with what it needs |
| Geometry gate before / after this review | 200 / 200 → **217 / 217** analytic checks |
| DFM-related unit tests before / after | 287 → **372**, all passing; full suite 1,329 |

Rules per family (standard-named in brackets): Zinc HPDC 18 (8), Al/Mg HPDC 17
(8), sand 15 (5), gravity die 13 (2), injection moulding 12 (6), sheet metal
12 (3), LPDC 11 (2), investment 11 (1), machining 7, MIM 7, and 3–6 for each of
the remaining 25 families. The depth is where the published sources are; the
thin families say so in their rules.

## 2. How it was tested

1. **The existing gate**, after installing OpenCascade in the container (it had
   been skipping here): 200 / 200.
2. **A coverage matrix**: every non-degenerate fixture through every family —
   22 parts × 35 families, then 34 parts (fixtures + held-out) × 35 = 8,432 rule
   runs — recording why each rule did or did not produce a verdict.
3. **Eight held-out parts**, built for this review and never seen by the engine,
   one per commodity, each with its truth written from its construction:

| Part | Process | Built to test |
|---|---|---|
| Machined block | Machining, Al 6061 | 8 × 40 × 36 deep sharp-cornered pocket; d5 × 30 blind hole; d4 × 60 through hole |
| Turned shaft | Turning, steel | d20 × 300, L/D 15 |
| Stamped L-bracket | Sheet metal, steel | t 2, inside R 1 (R/t 0.5), d3 hole 18 mm from the bend axis |
| Die-cast housing | HPDC, A380 | 2.5 wall, zero draft, boss OD 8 / hole 4, sharp internal corners |
| Moulded cover | Injection, PP | 2.0 wall, one 1.6 × 10 rib running wall to wall |
| Thin sand casting | Sand, grey iron | 3 mm wall |
| Undrafted forging | Hot forging, steel | all faces 0° |
| LPBF tee | LPBF, Ti-6Al-4V | 40 × 40 cap on a 10 × 10 post |

## 3. Accuracy on the held-out parts

Measurements that matched construction exactly on the first run: bend R/t 0.5,
hole d/t 1.5, sheet thickness 2.0, flange 11 t, hole-to-edge 5.25 t, boss OD /
hole 2.0, core L/D 4.38, cored-hole draft 0°, wall 2.5 / 2.0 / 3.0 mm, rib
thickness / wall 0.8, slenderness 15, draft 100% below the cutoff on every
undrafted part, through-hole L/D 15, thinnest web 10 mm, setups 2.

**Six measurements were wrong. All six are fixed and now held by the gate:**

| # | Defect | Truth | Before | After | Root cause |
|---|---|---|---|---|---|
| D1 | Deep pocket depth / width | 4.5, **fail** | 0.22, **pass** | 4.5, fail | The floor was taken as the largest planar face. On a deep narrow pocket the walls are bigger than the floor, so depth was read sideways. The floor is now the one face with no opposing partner. |
| D2 | Sharp internal corners | 0 mm, fail | "no measurement available" | 0, fail, located | The corner pass saw faces; a sharp corner has none. Straight concave plane–plane edges are now counted and read as "modelled sharp". Machining counts only corners along the cutter axis. |
| D3 | Rib height / wall, rib spanning wall to wall | 5.0 | 28 | 5.0 | The rib cut the floor into two faces, so only the end walls were shared and height was read along the rib's length. Coplanar faces now form one base, chosen opposite the rib's free top. |
| D4 | Hole-to-bend clearance | 8.5 mm | 10.03 | 8.5 | Measured from the hole centre and out of the sheet plane. Now from the rim, in plane — the convention the same file uses for hole-to-hole. Optimistic by half a diameter before. |
| D5 | LPBF overhang below 45° | 28.85% | 30.77% | 28.85% | The face standing on the build plate counted as an overhang. It is now excluded (VDI 3405-3-3). |
| D6 | DIN 16742 tolerance, rotational moulding | judged at TG9 | not evaluated without an injection-moulding resin | judged | TG9 is assigned to the process, but the code waited on an injection-moulding resin lookup. |

D1 and D2 are the two most serious: the deep-pocket rule could never fail on the
pockets it exists for, and the most-checked defect in machining, die casting and
moulding was silent.

**The fixture that encoded D5.** `plate-two-holes` asserted that a plate lying
flat is "the worst possible overhang case". It is not an overhang at all. Its
truth was corrected with that rationale (on-plate share 32.66%, analytic), and
a new `overhang-tee` fixture pins a genuine 0° overhang instead. Four held-out
parts became fixtures — `deep-sharp-pocket`, `wall-to-wall-rib`,
`bend-hole-bracket`, `overhang-tee` — adding 17 checks. Only the four new files
were written; regenerating here changes 18 existing files byte-for-byte (a
different OpenCascade build), so the existing ones were left untouched.

## 4. Honesty of the report

Every rule that produced no verdict used to say "no measurement available for
X on this geometry". Across 8,432 rule runs that one sentence covered four
different situations:

| Why no verdict | Share of abstentions, no inputs declared | What the report now says |
|---|---|---|
| Waiting on an input — alloy, tolerance, flatness, finish, machining stock | 1,560 (36%) | Names the input, with the source's own reason where it wrote one, and offers it as an action |
| The feature is not on the part — no bosses, no ribs, one bend | 1,813 (42%) | "Not applicable", counted out of coverage, listed separately |
| Outside the published source — e.g. SFSA rules on grey iron | included below | The source's scope statement, verbatim |
| Genuinely not measured | 922 (21%) | Names the measurement, and for sheet rules on a non-sheet part, why no sheet was found |

Coverage is now reported over the rules that apply. On the same 8,432 runs:

| | Coverage over all rules | Over applicable rules |
|---|---|---|
| No inputs declared | 49.1% | 62.5% |
| Material, tolerance, flatness, finish and stock declared | 67.3% | **85.8%** |

Only 4 of 248 rules never produced a verdict with inputs declared: three sheet
hole-to-hole rules and sheet bend-to-bend, because the parts tested contain no
sheet part with two holes or two bends. That is a gap in the test set, not the
engine.

Two statements on the page were also untrue and are fixed: the summary tile said
"of N that apply" while N counted every rule, and the "Not evaluated" tile said
"measurement unavailable" for rules that were waiting on an input. The engine
recorded the true reason for missing alloys in `_nadcaBasis`, `_sfsaBasis`,
`_dupontBasis` and `_bookBasis`, and nothing displayed it.

## 5. Studio page

- **Two missing inputs added.** The server accepted a surface-finish requirement
  and a machining stock, and the NADCA and SFSA rules need them, but the page had
  no field for either — those rules could never run from the studio.
- **"Declare these to check more rules".** Each input that would unlock rules is
  a button with its count; it reopens the collapsed setup form and focuses the
  field.
- **Grouped abstentions**: waiting on an input, outside the source, not
  measurable, and a separate "do not apply to this part" list.
- **Sharp corners are located** on the model for every corner and fillet rule.
- **LPBF findings name the best axis orientation**, e.g. "Built −Z instead, 0%
  lies below 45° against 28.85%". The engine sweeps all six axes.
- A light-theme contrast failure on the 3D viewer's dimension readout, found by
  axe during verification, is fixed.

Verified in the production bundle, dark and light: coverage text "71.4% (10/14
that apply)", four unlock chips on the die-cast housing, the tolerance chip
focuses its field, axe clean, no console errors.

## 6. What remains, and what would make it best-in-class

In order of value, all of them deterministic and code-based:

1. **Sheet parts with several holes and bends in the gate.** Four rules have no
   evaluating fixture. An analytic multi-hole, multi-bend bracket closes it.
2. **Machining depth.** Seven rules. The most asked-for additions have sourced
   limits and measurable inputs: thread depth against diameter, blind-hole
   bottom (drill point vs flat), tool reach for a pocket corner radius (reach /
   radius), and minimum wall between a pocket and an outer face.
3. **Casting hot spots.** Thick-to-thin transitions are only captured as a wall
   spread ratio. Locating the isolated heavy section (inscribed-sphere
   maxima) is the check die designers ask for next.
4. **Build orientation beyond the axes**, with build height and support
   volume — recorded in the catalogue's unwritten list with what is and is not
   built.
5. **Sink and warp** for moulding need a flow simulation; the catalogue says so
   and uses wall uniformity and rib proportions as the proxy.
6. **Tolerance stack-up and datum frames** need AP242 datum links that the
   round-trip fixtures do not yet carry.
7. **Thin families** (3–6 rules): spinning, centrifugal, broaching, wire EDM,
   deep-hole drilling, thermoforming, LPBF. Each needs a first-hand source
   before a rule is written; the discipline of not inventing thresholds is the
   reason they are thin.
