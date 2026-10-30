# Hungary rate book research — rules (30 Oct 2026)

**Goal.** Hungary's OWN rates for CostVision, effective **October 2026**, so that a costing in Hungary uses no
"UK × a factor" figure. The basis is an average of the four main automotive supplier clusters:

- **Győr-Moson-Sopron** (Győr, Mosonmagyaróvár, Sopron — Audi Hungaria and its suppliers);
- **Central Transdanubia** (Székesfehérvár, Tatabánya, Komárom — Fejér / Komárom-Esztergom);
- **Bács-Kiskun** (Kecskemét — Mercedes-Benz and suppliers);
- **Hajdú-Bihar** (Debrecen — BMW and suppliers).

**Working pattern.** Three 8-hour shifts, Monday–Friday (the common supplier pattern; weekend work is overtime).

**What exists today.** The current Hungary book (`current-hungary-book.json`, in HUF) is the UK book × a few factors
(labour, a machine factor 0.70, a material factor 0.97, overhead 0.83, packaging 0.88, logistics 1.22). It is not
researched. Accuracy is the only goal. `machines-list.txt` lists every machine and its current Ft/h; the
`materials-*.tsv` files list every material and its current Ft/kg.

**FX.** Give every figure in the currency the source gives it in (HUF, EUR or USD) and, where it is not HUF, its
conversion at the MNB official rate you quote (the labour / energy researcher fetches the MNB EUR/HUF, GBP/HUF and
USD/HUF official rates for a recent October 2026 day; others may use: €1 = the MNB figure they find, stating it).

**Never invent a number.** Every figure needs:

- a URL;
- the date it applies to, or the page's publish date;
- what kind of figure it is: list price, transaction, exchange settlement, survey, regulator notice, statute or company
  annual report.

"Not found in any source" is a correct answer. If you derive a figure, show the arithmetic. Examples: a loaded hourly
cost from a monthly wage, an average selling price = segment revenue ÷ tonnes.

**Sources, in order of preference:**

1. Government and regulator: KSH (ksh.hu, earnings by FEOR occupation and county), NAV / Magyar Közlöny (minimum wage,
   guaranteed wage minimum, szocho employer tax, depreciation rates in Act LXXXI of 1996 Annex 2), MEKH (energy),
   Eurostat (nrg_pc_205 / nrg_pc_203 non-household prices), MNB (base rate, FX, corporate loan rates).
2. Exchanges and price agencies: HUPX (Hungarian Power Exchange), CEEGEX (gas), LME, Fastmarkets / Argus / Kallanish /
   SteelOrbis / MEPS / Eurometal public headlines, plasticker.de, myCEPPI / plasticportal.eu (CEE polymer prices),
   ICIS public snippets, Hungarian scrap boards (fémhulladék / vashulladék árak).
3. Producer and stockholder price lists, company annual reports: Ferroglobus, Interferrum, Thyssenkrupp Materials
   Hungary, MOL Petrochemicals (PP, HDPE, LDPE), Hydro / Arconic Székesfehérvár, Hungarian galvanizers' published
   HUF/kg lists, machine makers' or EU dealers' published EUR price lists.
4. Salary surveys and recruiters: Hays / Randstad / Adecco / Grafton / Trenkwalder Hungary salary guides 2026,
   fizetesek.hu, job boards (profession.hu ranges, as a cross-check only).
5. Trade press.

**B2B listings.** Never use a marketplace listing (Jófogás, Alibaba, eBay) as a PRICE. At most it is a cross-check,
and you say so. A distributor's own published price list is acceptable; say so. For machines, a NEW machine offered by
a dealer at a stated price is acceptable (say "dealer offer, new"); a used machine is not a new-machine price (it may
be given as a cross-check, labelled).

**Money and dates.** Money ex-VAT (Hungarian VAT is 27%; say whether a source includes it). Delivered to a plant in a
cluster where possible. Use 2026 figures where they exist; older ones only with a stated reason.

**Output.** Write a JSON file in `research/`, under the name given in your task. Use this shape:

```
{ "domain", "researched": "2026-10-30", "items": [ { "key", "value", "unit", "currency", "basis", "source": "<URL>", "date", "kind", "notes" } ], "notes": [] }
```

Where asked, add derived figures with their arithmetic in `basis`. Write that file and change nothing else.

**Search budget.** Seven researchers share the web-search budget at once, so use **at most 25 searches** (fetches of a
page you already found do not count against it). Stop when the key figures are found.

**Reply** with ONE short paragraph:

- what you found;
- what you could not find;
- any figure in the current book you are confident is wrong (current v evidence).
