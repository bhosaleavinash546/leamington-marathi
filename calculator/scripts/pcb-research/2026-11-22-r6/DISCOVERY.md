# Round 6 discovery (22 Nov 2026) — find the LATEST automotive ICs and SMT components. No prices.

**Goal.** The Director says the PCB component database is thin. Before any price research, find the parts a 2025–2027
automotive board carries that the catalogue (`calculator/server/data/pcb-component-catalogue.json`, 1,443 parts) does not
hold — above all parts LAUNCHED OR RAMPED 2024–2026 (new MCU / SoC generations, zonal and 48 V / 800 V power parts, CAN XL /
10BASE-T1S / multi-gig Ethernet / new SerDes, new sensors, new automotive passive series).

**This pass records PARTS, not prices.** Do not record any price. Prices are researched later under the pricing rules.

## Rules
1. **Never invent a part or an orderable code.** `orderableCode` is filled ONLY with a code you saw on a page (maker's
   product page / press release / datasheet title, or a distributor listing). Otherwise `null` and give the family.
2. Every candidate carries a `sourceUrl` (where you saw that it exists and is automotive-qualified) and `launched`
   (year or "YYYY-MM" as the page states; "unknown" if not stated). No URL → do not list it.
3. Automotive first: AEC-Q100 / Q101 / Q102 / Q200 qualified. Set `aecq` true only if the page says so.
4. Check the catalogue before listing: from `calculator/`, run
   `python3 scripts/pcb-research/2026-11-22-r6/has.py <code or family> [...]` (several per call). List a candidate only if
   it prints `NOT IN CATALOGUE` or `[estimate]`. Put the has.py result in `inCatalogue` ("no" / "estimate: <key>").
5. `distribution`: "distributor" if you saw a franchised distributor (Digi-Key, Mouser, Arrow, Avnet, Farnell / Newark, RS,
   TME, Rutronik, Future, TTI, LCSC) list it; "oem-direct" if it is sold only under contract (NVIDIA DRIVE, Mobileye EyeQ,
   Qualcomm Snapdragon Ride / SA8xxx, Renesas R-Car Gen 4/5, Ambarella CV3, Horizon, most radar / UWB chipsets with no
   listing); "unknown" otherwise. OEM-direct parts are still worth listing — they are marked as quote items.
6. `priority`: 1 = on most new vehicle boards / high volume, 2 = common in one ECU type, 3 = niche.
7. WebFetch to maker and distributor sites is usually blocked — use **WebSearch**; treat summaries critically. At most
   **15 web searches**. Plan first: maker "new automotive products 2025 / 2026" pages, press releases, electronica 2024 /
   CES 2025–2026 / embedded world 2025–2026 / PCIM 2025–2026 automotive announcements, distributor "new products" pages,
   reference-design BOMs.
8. Start from your own knowledge of 2023–2026 automotive parts as a SEED list (it costs no searches), run has.py on the
   seeds, then use searches to (a) confirm the seeds that are missing exist as stated and (b) find what you did not know.
   A seed you could not confirm on a page is NOT listed.

## Output — ONE file, change nothing else, no git
`scripts/pcb-research/2026-11-22-r6/discovery/<task name>.json`:
```json
{ "domain": "<task name>", "researched": "2026-11-22", "searchesUsed": 0,
  "candidates": [
    { "mfr": "NXP", "family": "S32K5", "orderableCode": null, "desc": "16 nm MCU with embedded MRAM for zonal controllers",
      "category": "ic_bga", "pkg": "BGA", "aecq": true, "launched": "2025-03", "usedIn": ["zonal controller"],
      "distribution": "unknown", "inCatalogue": "no", "priority": 1, "sourceUrl": "https://...", "note": "" } ],
  "seedsNotConfirmed": [ "family — why" ] }
```
`category` is one of: ic_bga ic_qfn ic_soic ic_tqfp passive_0402 passive_0603 passive_0805 passive_1206 fuse_tvs crystal_osc
connector_smt through_hole relay_switch led transformer mechanical power_module.
Aim for 40–80 confirmed candidates. Reply with ONE paragraph: candidates listed (priority 1 / 2 / 3), how many have an
orderable code, how many are distributor-listed, searches used, and the three most important finds.

## Second pass (same day) — by MAKER, for the makers the first pass could not read
The first pass (files `k1`–`k8`, consolidated in `discovery/consolidated.json`, 739 candidates) is heavy on TI, Infineon and
NXP because those sites could be read; st.com, analog.com, microchip.com and several others refused page reads. Your task
names the makers to cover. Everything above applies, with these changes:
- Check with **`seen.py`** instead of has.py: `python3 scripts/pcb-research/2026-11-22-r6/seen.py CODE [CODE ...]` (exact code /
  family; it also knows what the first pass found). List a candidate only if it prints `NEW` — or `CATALOGUE … [estimate]`
  (then `inCatalogue: "estimate: <key>"`). `family seen: …` means a sibling is known: list yours only if it is a
  different orderable part, and say so in `note`.
- Where a maker's own site refuses, use: the franchised distributors' NEW-PRODUCT and product pages for that maker (Mouser
  "newest products", Digi-Key, Farnell, TME, Rutronik, Future), the maker's press releases as carried by trade press
  (passive-components.eu, eenewseurope.com, electronicspecifier.com, eejournal.com, all-about-circuits, powerelectronicsnews),
  and datasheet PDFs. One page read at a time; if a site refuses, stop using that site — never retry through another host.
- At most **15 web searches**; page reads are allowed beyond that but keep them to about 40.
- Automotive parts of ANY age that are missing count here (not only 2023–2026 launches), but put the 2024–2026 launches at
  priority 1–2 and say the launch date where the page states it.
