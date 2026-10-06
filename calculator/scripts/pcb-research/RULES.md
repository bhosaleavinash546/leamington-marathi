# Component price research — rules (read fully; accuracy is the only goal)

Environment: WebFetch to distributor and manufacturer sites is BLOCKED (digikey, mouser, lcsc, octopart, ti.com, st.com, nxp.com). Use **WebSearch** only. Search results include a summary of the pages; use it, but treat it critically.

For EACH part on your list:
1. Search for its distributor price, e.g. `"<MPN>" price digikey`, `"<MPN>" mouser price 1000`, `"<MPN>" price reel`. Try the exact orderable automotive MPN first (the -Q1 / Q / AEC variant).
2. Record up to 3 **observations**. Each observation MUST have: distributor name, quantity break, unit price, currency, the result URL, and the date you read it (today). Accept ONLY franchised / authorised distributors: Digi-Key, Mouser, Arrow, Avnet, Farnell / Newark / element14, RS Components, TME, Rutronik, Future, TTI, LCSC, Win Source is NOT allowed (broker), Digipart / Octopart are aggregators: allowed only if the snippet names the franchised distributor and its break. NEVER use broker / marketplace prices (eBay, AliExpress, Alibaba, ICs-direct style brokers, "in stock now" spot sellers).
3. Prefer observations at **1,000 units** and at the **largest published break** (reel quantity, e.g. 2,500 / 3,000 / 5,000 / 10,000). Two different breaks of the SAME distributor are the most valuable (they give the part's own volume slope).
4. **Never invent or estimate a price.** If no distributor price is found, set `observations: []` and say why in `notes`. A wrong number is worse than none. If the summary's number looks implausible (e.g. a $0.002 MCU, a $40 resistor), discard it.
5. If the exact MPN is not found but a sibling orderable code is (different packing suffix / temperature grade), you may use it and record the code in `observedMpn`.
6. Keep notes short. Do not write prose reports.

Output: write ONE JSON file (path given in your task) with this exact shape, then reply only with a one-paragraph summary (counts: parts researched, parts with ≥1 observation, parts with ≥2 distributors, parts with none).

```json
{ "domain": "<your domain>", "researched": "2026-10-06", "parts": [
  { "mpn": "TCAN1044AVDRBRQ1",            // orderable MPN (automotive grade where it exists)
    "family": "TCAN1044A",                // short family key (no packing suffix)
    "mfr": "Texas Instruments",
    "desc": "CAN FD transceiver, 5 Mbps, VIO",
    "category": "ic_soic",                // ONE of: ic_bga ic_qfn ic_soic ic_tqfp passive_0402 passive_0603 passive_0805 passive_1206 fuse_tvs crystal_osc connector_smt through_hole relay_switch led transformer mechanical power_module
    "pkg": "SOIC-8",
    "aecq": true,
    "ecuRoles": ["BCM","gateway","BMS"],  // where it is used (free tags)
    "observedMpn": "TCAN1044AVDRBRQ1",
    "observations": [
      { "distributor": "Digi-Key", "qty": 1000, "price": 0.62, "currency": "USD", "url": "https://...", "date": "2026-10-06" },
      { "distributor": "Digi-Key", "qty": 3000, "price": 0.55, "currency": "USD", "url": "https://...", "date": "2026-10-06" }
    ],
    "notes": "" }
] }
```
