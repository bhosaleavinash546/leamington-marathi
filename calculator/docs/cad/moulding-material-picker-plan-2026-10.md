# Injection-moulding material picker: plan (Oct 2026)

**Status: implemented as planned.** The code is in `src/engine/moulding-material-taxonomy.ts` and `src/ui/material-picker.ts` (`imm-mat`), with tests in `tests/moulding-material-taxonomy.test.ts`. It was driven in a real browser:
- family → polymer → grade;
- a grade set by code;
- Calculate on PA6 GF30 and on TPV;
- no page errors.

## What the form shows today

The injection-moulding form's Material drop-down holds **56 resins** in library order.
- PP Copolymer sits next to ABS, PEEK GF30 and PCR PP.
- The library sorts them into only 3 categories: Thermoplastic (43), Thermoplastic Elastomer (3) and High-Performance Thermoplastic (10).

That puts PPA GF35 apart from PA66 GF30 and bio-PA610 apart from PA6, even though an engineer looks for all of them under "nylon".

## Why casting/forging's Family → Standard → Grade does not carry over

| | Metals (casting, forging) | Thermoplastics |
|---|---|---|
| What defines the grade | A **material standard**: EN 1563 → EN-GJS-500-7, EN 10083-3 → 42CrMo4 | The **base polymer** plus a **filler / modifier** |
| Naming system | Each standard lists its grades | ISO 1043-1 gives the polymer code (PP, PA66, PC+ABS). ISO 1043-2 gives the filler code (GF30 = 30% glass fibre, T20 = 20% talc) |
| What is on the drawing / part | The grade | The ISO 11469 marking, e.g. `>PA66-GF30<` and `>PC+ABS<` |
| How it is bought | To the standard | By trade grade from a supplier datasheet (Ultramid A3WG6, Lexan 141R…) |

ISO designation standards exist per polymer (for example ISO 19069 for PP, ISO 16396 for PA, ISO 7391 for PC). But they are coding systems, not lists of grades, and no cost engineer picks a resin by them. A "Standard" step would be one meaningless entry per polymer.

**So the moulding picker is Family → Polymer → Grade**:
- **Family:** the chemistry group engineers think in.
- **Polymer:** the base resin, with its ISO 1043 code.
- **Grade:** the fill or modification, priced per kg.

## Proposed structure (all 56 library resins)

| Family | Polymer (ISO 1043) | Grades in the library |
|---|---|---|
| Polyolefins | PP — polypropylene | copolymer, homopolymer, impact copolymer, T20, T30, GF30, LGF30, PCR recycled |
| | PE — polyethylene | HDPE, LDPE, LLDPE |
| | TPO — PP/EPDM olefin blend | TPO |
| Polyamides (nylon) | PA6 | unfilled, GF30 |
| | PA66 | unfilled, GF30, GF35, GF50, mineral, GF25 FR |
| | PA12 · PA610 (bio) · PPA (high-temp PA) | one each |
| Styrenics | ABS · ASA · SAN · PS (GPPS, HIPS) | ABS, ABS FR, … |
| Polycarbonate & blends | PC | unfilled, GF20, FR, glazing |
| | PC+ABS · PC+PBT | one each |
| Polyesters | PBT | unfilled, GF30 |
| | PET | bottle grade, GF30 |
| Acetal | POM | one |
| High-performance | PPS · PEEK · PEI · LCP · PSU · PPSU | GF and unfilled where stocked |
| Thermoplastic elastomers | TPU · TPV · TPS (SEBS) | one each |
| Other thermoplastics | PMMA · PPE (mPPE) · PVC (rigid, flexible) · PLA | |

Notes on the grouping:
- **PPA** goes with the polyamides, not "high-performance". The library's category stays as it is (it still sets the material scope), but the picker groups by chemistry.
- **TPO** goes with the polyolefins. It is a PP/EPDM blend, used as the bumper fascia material.

## The information line (polymers need different facts from metals)

Each resin's line shows what changes the moulding decision:
- **Morphology:** semi-crystalline or amorphous. This drives shrinkage, warpage and the cooling share of the cycle.
- **Drying:** "dry before moulding" for hygroscopic resins (PA, PC, PBT, PET, ABS, TPU, PEEK…). Undried PA or PBT degrades in the barrel, and the dryer is a real cost and time.
- **Density.**
- **ISO 11469 part marking**, e.g. `>PA66-GF30<`. It is written out per grade only where it is unambiguous, and left out otherwise; it is never guessed.

Example: `Polyamides · PA66 · semi-crystalline · dry before moulding · 1,300 kg/m³ · marking >PA66-GF30<`

These are qualitative textbook facts, not numbers that feed the cost. The cost engine's cooling factor and cavity pressure stay exactly where they are (`autoCoolFactorForMaterial`, `cavityPressureMPaFor`).

## Defaults when a family is picked

These are the commonest automotive grades, so the engineer refines rather than starts from an odd grade:

| Family | Default grade |
|---|---|
| Polyolefins | PP Copolymer |
| Polyamides | PA66 GF30 |
| Styrenics | ABS |
| PC & blends | PC/ABS |
| Polyesters | PBT GF30 |
| Acetal | POM |
| High-performance | PPS GF40 |
| TPE | TPV |
| Other | PMMA |

## Engineering (what changes in code)

1. **Generalise the taxonomy** (`material-taxonomy.ts`) with:
   - `levelLabel`: "Standard" for metals, "Polymer" for resins;
   - an optional `describe(id, density)` for the info line (metals keep "usual routes").
2. **New `moulding-material-taxonomy.ts`.** It holds:
   - the families;
   - the polymers per family;
   - each grade's family, polymer and ISO marking;
   - per-polymer morphology and drying need;
   - the family defaults.

   It is data only, with no prices.
3. **Wire the form:** add `imm-mat` to `MATERIAL_PICKERS`. The form's select stays the one value holder, as on casting and forging, so the CAD rules (`material.resin` question → `imm-mat`), drafts and demos are unchanged.
4. **CAD panel:** group the injection-moulding material pin the same way.
5. **Leave alone:**
   - the rules' short resin question (six choices, `RESIN_MENUS`), which is a deliberate shortlist for the CAD question, not a picker;
   - blow moulding, thermoforming, roto and extrusion, which buy different forms (blow grades, sheet, powder, pipe compounds) and are out of scope for this pass.
6. **Tests:**
   - every library moulding resin is filed (none under "Other / company grades");
   - every polymer has its morphology and drying need;
   - every family default is in its family;
   - every ISO marking matches its polymer;
   - the option HTML is grouped and priced.
7. **Live check:** drive the form in a browser (family → polymer → grade, a grade set by code, Calculate), then run the full suite and the smoke test.

## Not changing

- No price, density or cost rule.
- The library's categories, so the material scope is unchanged.

## Extended to blow moulding, thermoforming and extrusion (Oct 2026)

All four plastics forms now use one list of polymers and families, with one grade table per form. Each form buys a different form of the polymer, so its grades differ:

| Form | What it buys | Number of grades | Family default grades |
|---|---|---|---|
| Blow moulding (`bm-mat`) | blow grades, plus the TPE pellets the form also offers | 19 | HDPE blow, PA6 blow (charge-air ducts), PC, PET stretch-blow, PVC, TPV |
| Thermoforming (`tf-mat`) | extruded sheet | 18 | HDPE, ABS, PC, PETG, rigid PVC, PEI, PMMA |
| Extrusion (`ext-mat`) | pipe, profile, tube, sheet and cable compounds | 29 | PE100 pipe, PA12 tube, ABS sheet, PC sheet, PVC-U window profile, POM rod, PVDF, TPV weatherseal, PMMA |

Changes to the shared lists:
- **New family "PVC (vinyls)".** PVC is most of extrusion. Injection moulding's uPVC and fPVC moved into it from "Other".
- **New polymers:** PE-X, EVA (ISO code EVAC), PA11, PETG, Tritan-type copolyester, co-extruded ABS sheet, PVDF, and a TPE whose type is given only in its datasheet.

How the info line changes:
- **Drying wording** follows the process: "dry before moulding", "dry before extrusion", or, for sheet, "hygroscopic — sheet may need pre-drying".
- **Morphology:** APET is shown as amorphous sheet, unlike its polymer, PET.
- **No marking** is written for:
  - multilayer stock (the coex fuel-tank grade, PETG/EVOH, co-extruded ABS sheet);
  - foams;
  - PE80, which may be MDPE or HDPE;
  - PETG and the copolyester, where I'm not certain of the ISO code.

Rotational moulding is not included: its five powders are all polyethylene except PP and PA12, so a picker adds nothing.
