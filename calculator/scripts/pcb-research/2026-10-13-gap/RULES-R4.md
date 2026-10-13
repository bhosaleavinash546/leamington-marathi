# Round 4 — catalogue gap fill (13 Oct 2026). Read fully, with `../RULES.md` (pricing rules — they apply in full).

**Goal.** The PCB Image → BOM → Cost catalogue (`server/data/pcb-component-catalogue.json`) is thin on the latest
automotive ICs, on non-automotive staples, and on everyday SMT / SMD parts. Add the parts a real board carries, each with
real distributor prices. **Automotive first** (AEC-Q100 / Q101 / Q200 orderable codes); industrial / consumer second.
Accuracy is the only goal. **Never invent a part, an orderable code or a price.** An empty `observations` list with the
reason is a correct answer; a wrong number is worse than none.

## Budget — ten researchers are searching at the same time
- **At most 20 web searches in total for your whole task.** Plan before you search.
- Make each search price several parts where you can: an aggregator or distributor page that lists a series
  (Findchips / Octopart / TrustedParts / Digipart naming the franchised distributor and its break, a Digi-Key / Mouser
  family listing), or a query naming 2–3 sibling codes.
- Work your list in PRIORITY order (the task file is ordered). Stop when the budget is spent. Parts you did not reach go
  in the top-level `notResearched` list (code + one line why it matters), NOT in `parts`.

## Before adding a part
Run `python3 scripts/pcb-research/2026-10-13-gap/has.py <code or family> [...]` (from `calculator/`; several codes in one
call). If it is in the catalogue as `[distributor, obs]`, skip it. If it is there as `[estimate]` or `[distributor]`
without `obs`, research it (your observations replace / add to it). If it is not there, research it.

## Choosing the code
- Use the exact ORDERABLE code a franchised distributor lists (tape-and-reel / tray suffix, the automotive grade:
  TI `…Q1`, NXP `…/0Z` or `…VLF…`, Infineon `…XUMA1`, ST `…TR` + automotive line, Microchip `…/E…VAO`, Micron `-AAT/-AUT/-IT`).
- A task line that names a SERIES or a FUNCTION means: choose ONE representative automotive part that distributors stock
  and say why in `notes`.
- **OEM-direct parts** (sold only under contract: NVIDIA DRIVE Orin / Thor, Mobileye EyeQ, Qualcomm Snapdragon Ride /
  SA8xxx, Renesas R-Car V4H / V3H, Ambarella CV3, Horizon Journey, Tesla FSD, radar MMICs with no distributor listing):
  do NOT price them and do NOT search for them — list them under `notResearched` with "OEM-direct, no public price".
- If only a sibling code is listed (another packing / temperature grade), use it and put it in `observedMpn` with a note.

## Prices (as `../RULES.md`)
Franchised distributors only (Digi-Key, Mouser, Arrow, Avnet, Farnell / Newark / element14, RS, TME, Rutronik, Future, TTI,
LCSC, Verical, Heilind, Allied, Sager, Master); breaks ≥ 100; prefer 1,000 and the largest reel break of the SAME
distributor (that gives the part's own slope). Never: brokers, marketplaces, JLCPCB, OEMsTrade, omo-ic, datasheet sites,
`punchouttest.*`, `fat.lcsc.com`, Rochester Electronics, a manufacturer list price (that may go in `notes`). Record the
price in the currency shown; say in `notes` if a price includes VAT (prefer the ex-VAT site). Discard implausible numbers.

## Categories (use exactly one of these)
`ic_bga ic_qfn ic_soic ic_tqfp passive_0402 passive_0603 passive_0805 passive_1206 fuse_tvs crystal_osc connector_smt
through_hole relay_switch led transformer mechanical power_module`
- 0201 parts → `passive_0402`; 1210 / 1812 / 2010 / 2512 chips, SMD power inductors, SMD aluminium / polymer / tantalum
  capacitors → `passive_1206`; ferrite beads → their size class; common-mode chokes → `transformer`.
- SOT-23 / SOT-223 / DPAK / LFPAK / SOD discretes and small ICs → `ic_soic`; leadless power packages (TOLL, DFN, PQFN) →
  `ic_qfn`; TO-247 / TO-220 through-hole power devices → `through_hole`.
- Write the value, voltage, dielectric / tolerance, size and grade in `desc` for every passive (e.g. "MLCC 100nF 50V X7R
  0402 AEC-Q200") — the matrix is read from it.

## Output
Write ONE file, `scripts/pcb-research/2026-10-13-gap/<your domain>.json`, with the `../RULES.md` shape and
`"researched": "2026-10-13"`, plus a top-level `"notResearched": [ { "code", "why" } ]`. Do not modify any other file.
Reply ONLY with the one-paragraph summary `../RULES.md` asks for (parts researched, with ≥ 1 observation, with ≥ 2
distributors, with none — and how many searches you used).
