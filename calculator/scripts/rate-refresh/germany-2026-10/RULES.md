# Germany rate book research — rules (12 Oct 2026)

**Goal.** Germany's OWN rates for CostVision, effective **October 2026**. The basis is an average of the four main
automotive supplier clusters:

- **Baden-Württemberg** (Stuttgart / Heilbronn / Neckar-Alb);
- **Bavaria** (Munich / Ingolstadt / Regensburg / Nuremberg);
- **Lower Saxony** (Wolfsburg / Braunschweig / Salzgitter / Hanover);
- **North Rhine-Westphalia** (Cologne / Ruhr / Siegen / Sauerland).

**Working pattern.** Two 8-hour shifts, Monday–Friday — the common German automotive supplier pattern (a third shift and
weekends are paid with collective-agreement premiums).

**What exists today.** The current Germany book (`current-germany-book.json`, in EUR) is the UK book × a few factors
(labour from a regional table, machines × 1.05, materials × 1.03). It is NOT researched. Accuracy is the only goal.

**FX.** Use the book's own rates: £1 = €1.165, so €1 = £0.858; $1 = €0.880 (1.165 ÷ 1.324). If a price is in USD or GBP,
give the original figure and its conversion at these rates.

**Never invent a number.** Every figure needs:

- a URL;
- the date it applies to, or the page's publish date;
- what kind of figure it is: list price, transaction, exchange settlement, survey, collective agreement, statute, regulator
  notice or company annual report.

"Not found in any source" is a correct answer. If you derive a figure, show the arithmetic in `basis` — e.g. a loaded hourly
cost from a monthly collective-agreement wage, or an average selling price = segment revenue ÷ tonnes.

**Sources, in order of preference:**

1. Government, statute and regulator: Destatis (genesis.destatis.de — Verdienste, Arbeitskosten, Erzeugerpreise,
   Kostenstrukturerhebung, Strom- und Gaspreise Nicht-Haushalte), Bundesnetzagentur / SMARD, BMF AfA-Tabellen, Deutsche
   Rentenversicherung / GKV-Spitzenverband (2026 contribution rates), Deutsche Bundesbank (MFI interest rates, FX), Eurostat
   (nrg_pc_205 / nrg_pc_203 non-household prices, lc_lci_lev labour cost levels), ECB.
2. Collective agreements: IG Metall / Gesamtmetall and Südwestmetall, VBM (Bavaria), NiedersachsenMetall, METALL NRW —
   ERA pay tables (Entgelttabellen) valid in 2026, special payments (Urlaubsgeld, Weihnachtsgeld, T-ZUG), shift premiums.
3. Exchanges and price agencies: EEX, LME, Westmetall, Fastmarkets / Argus / Kallanish / SteelOrbis / MEPS / Eurometal public
   headlines, BDSV scrap prices, plasticker.de, Kunststoff Information (KI), Plastics Information Europe, ICIS public snippets.
4. Producer price lists and annual reports: Saarstahl / Swiss Steel / Deutsche Edelstahlwerke / Georgsmarienhütte alloy
   surcharges (Legierungszuschläge), Outokumpu / Aperam surcharges, Aurubis, TRIMET, Hydro, Novelis, BASF / Covestro /
   LyondellBasell, Haas EU list (German site), TRUMPF, machine-tool distributors' EUR price lists.
5. Salary surveys and recruiters (StepStone Gehaltsreport, Gehalt.de, Kienbaum, Hays / Robert Half Germany 2026) — only as a
   cross-check on the collective agreement.
6. Trade press (Handelsblatt, Stahlmarkt, KunststoffWeb, MM MaschinenMarkt, Produktion).

**B2B listings.** Never use a marketplace listing (eBay, Kleinanzeigen, Alibaba, used-machine dealers) as a PRICE. At most it
is a cross-check, and you say so. A distributor's own published price list is acceptable; say so.

**Money and dates.** Money is in EUR. State whether a price includes 19% VAT; we need it **ex-VAT**, delivered to a plant in a
cluster. Use 2026 figures where they exist. Use older ones only with a stated reason.

**Output.** Write a JSON file in `research/`, under the name given in your task. Use this shape:

```
{ "domain", "researched": "2026-10-12", "items": [ { "key", "value", "unit", "basis", "source": "<URL>", "date", "notes" } ], "notes": [] }
```

Where asked, add derived figures with their arithmetic in `basis`. A key you could not source keeps `"value": null` and says
why in `basis`. Write that file and change nothing else.

**Search budget.** Six researchers share the web-search budget at once, so use **at most 30 searches**. Stop when the key
figures are found.

**Reply** with ONE short paragraph:

- what you found;
- what you could not find;
- any figure in the current book you are confident is wrong (current v evidence).
