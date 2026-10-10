# Poland rate book research — rules (10 Oct 2026)

**Goal.** Poland's OWN rates for CostVision, effective **October 2026**. The basis is an average of the four main automotive
supplier clusters:

- **Silesia** (Gliwice / Tychy / Katowice / Bielsko-Biała, Katowice SEZ);
- **Lower Silesia** (Wrocław / Wałbrzych / Legnica);
- **Wielkopolska** (Poznań);
- **Podkarpacie** (Rzeszów / Mielec / Stalowa Wola).

**Working pattern.** Three 8-hour shifts, Monday–Friday. This is the common Polish automotive plant pattern; weekend work is
overtime.

**What exists today.** The current Poland book (`current-poland-book.json`, in PLN) is the UK book × a few factors. It is not
researched. Accuracy is the only goal.

**FX.** Use the book's own rates: £1 = 5.096 PLN, €1 = 4.374 PLN (5.096 ÷ 1.165), $1 = 3.849 PLN (5.096 ÷ 1.324). If a price is
in EUR or USD, give the original figure and its conversion at these rates.

**Never invent a number.** Every figure needs:

- a URL;
- the date it applies to, or the page's publish date;
- what kind of figure it is: list price, transaction, exchange settlement, survey, regulator notice or company annual report.

"Not found in any source" is a correct answer. If you derive a figure, show the arithmetic. Examples: a loaded hourly cost from
a monthly wage, or an average selling price = segment revenue ÷ tonnes.

**Sources, in order of preference:**

1. Government and regulator: GUS (stat.gov.pl), ZUS, Dziennik Ustaw (minimum wage, contribution rates), URE (energy tariffs),
   Eurostat (nrg_pc_205 / nrg_pc_203 non-household prices, earnings), NBP (reference rate, FX).
2. Exchanges and price agencies: TGE (Polish Power Exchange), LME, Fastmarkets / Argus / Kallanish / SteelOrbis / MEPS public
   headlines, plasticker.de, Plastics Information Europe, ICIS public snippets, scrap price boards (ceny złomu).
3. Producer price lists and company annual reports: KGHM, Alumetal (secondary aluminium alloys), ZGH Bolesław (zinc),
   Orlen / Basell Orlen Polyolefins (PP, PE), Grupa Azoty (PA6, POM Tarnoform), Synthos (PS, synthetic rubber),
   ArcelorMittal Poland, CMC Poland, Cognor, AVIA (Polish CNC maker), machine-tool distributors' PLN / EUR price lists.
4. Salary surveys and recruiters: Sedlak & Sedlak (wynagrodzenia.pl), Hays / Michael Page / Randstad / Grafton / Antal Poland
   salary guides 2026, and job boards (pracuj.pl salary ranges, as a cross-check).
5. Trade press.

**B2B listings.** Never use a marketplace listing (Allegro, OLX, Alibaba) as a PRICE. At most it is a cross-check, and you say
so. A distributor's own published price list is acceptable; say so.

**Money and dates.** Money is in PLN. State whether a price includes 23% VAT; we need it **ex-VAT**, delivered to a plant in a
cluster. Use 2026 figures where they exist. Use older ones only with a stated reason.

**Output.** Write a JSON file in `research/`, under the name given in your task. Use this shape:

```
{ "domain", "researched": "2026-10-10", "items": [ { "key", "value", "unit", "basis", "source": "<URL>", "date", "notes" } ], "notes": [] }
```

Where asked, add derived figures with their arithmetic in `basis`. Write that file and change nothing else.

**Search budget.** Five researchers share the web-search budget at once, so use **at most 35 searches**. Stop when the key
figures are found.

**Reply** with ONE short paragraph:

- what you found;
- what you could not find;
- any figure in the current book you are confident is wrong (current v evidence).
