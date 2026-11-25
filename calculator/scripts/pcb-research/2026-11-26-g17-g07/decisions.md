# G-17 fab options and G-07 operations — decisions (26 Nov 2026)

Raw research (read 25 Nov 2026, every figure with its quote and URL): `raw/fab-adders-cn.json` (Chinese fabs),
`raw/fab-adders-xcheck.json` (independent cross-check), `raw/ops-selective-staking.json` (operations).
Rule (the audit's): cost an option only with a published adder; list the rest. No fab publishes a VOLUME price for these
options — every adder below is a sample / small-batch list price and is an upper bound at automotive volume.

| Option | Used | Source | Why |
|---|---|---|---|
| Thickness 0.8–1.6 mm | no extra | PCBasic standard range | the fab's own standard range |
| Thickness > 1.6 mm | linear to +37 % at 3.2 mm, held above | Würth CBT webinar (4-layer: 3.2 mm = 137 %) | the only fab-stated relative price; no 2.0 / 2.4 mm point anywhere |
| Thickness < 0.8 mm | linear to +7 % at 0.5 mm, held below | Würth (0.5 mm = 107 %) | as above |
| Tg150 / Tg170 | +8 % / +15 % of the board | Guanzhongxin (Shenzhen) price guide | the only Chinese fab figure; Würth Tg135→150 +23 % (European), blogs 15–60 % not used |
| Laminate on a market ASP | not added | — | the China ASP is an automotive board average; laminate is inside it |
| High CTI ≥ 600 | listed | none found | no fab publishes a price |
| Resin fill / via-in-pad | +¥500/m² below 6 layers; free on 6+ | Guanzhongxin; JLC (6–32 L), JLCPCB (6–20 L) | two fabs give it free on 6+ |
| Mask-plugged vias | free on 4+ layers; listed below | PCBasic | no figure for 1–2 layers |
| ENIG gold | +¥100/m² a µ" above 1 µ" | Guanzhongxin (1U/2U/3U +100/200/300); JLC ≤ 4 L same step (¥140 → ¥240) | JLC 6+ L step is ¥40 — the higher figure is kept (upper bound) |
| Impedance ±5 / ±7 % | listed | none found | JLCPCB "upon special request", NextPCB "from $80" for a non-standard stack-up — no tolerance price |
| Inner copper | existing per-layer copper rule (¥25/m² a layer a ½ oz) | earlier research | Guanzhongxin's whole-board "+¥100–120/m² per extra 1 oz (≤ 6 layers)" suggests that rule is high on many-layer boards — not changed here |
| Selective solder | 0.706 s a joint + 20 s pallet, station 2 × labour; pallets $600 (mid of $200–1,000) per 20,000 cycles | Vitronics Soltec, Circuits Assembly Dec 2002 | no Chinese EMS publishes a selective price; Huaqiu ¥0.10 / joint (method unstated) is a small-batch list price |
| Hand solder | 3.5 s a joint lead-free × operator | Vitronics Soltec | — |
| Staking | 3 s and 0.05 g a dot (engineering); DOWSIL 3145 $366.71/kg | Ellsworth 19 kg pail | no dispensing time or dot mass published |
| Potting | g × SYLGARD 170 £61.42/kg + 30 s station (engineering) | Silmid 40 kg kit | taken in grams: Dow's data sheet (density) could not be read |
