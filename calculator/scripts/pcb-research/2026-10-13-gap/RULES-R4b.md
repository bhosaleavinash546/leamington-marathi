# Round 4, wave 2 (13 Oct 2026) — read with `../RULES.md` and `RULES-R4.md` (both apply in full).

Wave 1 left gaps: parts it did not reach (`notResearched`) and parts it could not price (`observations: []`). Wave 2
retries the most valuable of them. Your task file names the wave-1 file(s) to read (`raw/<domain>.json`) and extra lines.

**What the independent review of wave 1 found — do not repeat these:**
1. A ROUNDED figure from a search summary ("about $0.61", "~R155") is NOT a price. Record only a number you saw stated.
2. Record the currency the SITE shows. Regional sites price in their own currency: canada.newark.com = CAD (not USD),
   au.* = AUD, nz.* = NZD, hk / hkcn = HKD. Only these currencies can be used (others are dropped by the merge):
   GBP EUR USD CNY INR MXN THB VND BRL KRW PLN CZK TRY SEK RON HUF CAD JPY TWD MYR IDR PHP SGD ZAR EGP MAD TND RSD.
   So prefer the UK / EU / US / Singapore / Malaysia sites; AUD, NZD, HKD, NOK, DKK, CHF prices cannot be used.
3. VAT-inclusive storefronts are NOT allowed: Digi-Key China (digikey.cn), element14 China (element14.cn). Use the ex-VAT
   price everywhere else, and say so in notes.
4. Not allowed as a price source: Source ESB (sourceesb.com), ciiva.com, electronicsdatasheets.com, OEMsTrade, JLCPCB,
   punchouttest.*, fat.lcsc.com, Richardson RFPD, brokers, eval boards. azcus.digikey.com is a Digi-Key server host:
   allowed only with a second source.
5. MLCC / resistor reel prices differ 4–14× between distributors: record TWO distributors per passive where you can.
6. A Findchips result must name the exact orderable code (not a generic search like "1h104k").
7. Out-of-stock catalogue prices that are dearer at a larger break are stale: do not record them.

Budget: **at most 20 web searches.** Output: `scripts/pcb-research/2026-10-13-gap/<your domain>.json` (the domain name in
your task file), same shape as RULES-R4.md with `"researched": "2026-10-13"` and `notResearched`. Before researching a code,
run `has.py` — wave 1's merged work is NOT yet in the catalogue, so also check the wave-1 file you were given, and do not
re-research a part wave 1 already priced. Change no other file. Reply only with the one-paragraph summary.
