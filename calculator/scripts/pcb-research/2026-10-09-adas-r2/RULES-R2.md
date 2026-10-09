# ADAS research — round 2 (read with ../RULES.md, which still applies in full)

Today is 2026-10-09. You are the ONLY agent searching: the search budget is yours, but be economical (≤ 4 searches a part).

## A. Retrying a part round 1 could not price
Your task file gives each part with round 1's note. Try, in this order, and stop at the first that gives a valid observation:
1. Other ORDERABLE CODES of the same device: tape-and-reel vs cut tape vs tray suffixes (TI R/T/Q1; NXP ,215 /0Z /Y; Infineon XUMA1/2; Micron -IT/-AT/-AAT/-AUT/-TR), other temperature grade ONLY if automotive.
2. Other FRANCHISED distributors: Arrow, Avnet, Future, Rutronik, TTI, Verical, Newark/Farnell, RS, TME, Master, Sager, Heilind, Mouser, Digi-Key.
3. The same distributor's USD / EUR / GBP site when round 1 only found VAT-inclusive, CHF, NOK, DKK prices (digikey.com / .de / .co.uk, mouser.com / .de / .co.uk).
4. An aggregator page (Findchips, Octopart, TrustedParts, Digipart) that names the franchised distributor and its break.
A sibling code goes in `observedMpn` with a note. Never a broker, marketplace, JLCPCB, datasheet site or manufacturer list price as an observation (list prices may go in `notes`). Breaks ≥ 100 only.
Do NOT use pages on `punchouttest.*` or `fat.lcsc.com` hosts (test / staging storefronts) — find the normal page instead.

## B. New parts (gap lists)
Find the AUTOMOTIVE orderable code (AEC-Q100/101/102/200) a franchised distributor lists for each line; a line naming a series or a function means: pick ONE representative automotive part of that series / function that distributors stock, and say why in `notes`. Price it as in A.

## Output
Write ONE file (path in your task) with the RULES.md shape ("researched": "2026-10-09"), containing every part on your list — priced or not, with the reason when not. Do not modify any other file. Reply only with the one-paragraph summary RULES.md asks for (and name the parts still with none, with the reason in two or three words each).
