# Machine prices in Asia — research brief (2 Nov 2026)

CostVision costs parts in JP KR TW TH MY SG VN ID PH. Each country has its own rate book, but its machine CAPITAL
(purchase price) is still "at par": the same price as the UK book, labelled. We need each country's OWN price for the
machines below — what a manufacturer in that country pays for the machine.

## Machine classes (the CostVision library machine each price will stand for)
| class | library machine | what to price |
|---|---|---|
| vmc3 | mach-haas-vf2 | 3-axis vertical machining centre, ~760×400×500 mm travel (Haas VF-2, Brother, DN Solutions DNM 4500, Hyundai WIA, Victor, Feeler, Mazak VCN-430 class) |
| vmc5 | mach-haas-umc500 | 5-axis trunnion VMC ~500 mm table (Haas UMC-500, DMG DMU 50, Hermle C22, Okuma MU-4000V class) |
| lathe | mach-lathe-cnc | 2-axis CNC slant-bed lathe, 8–10" chuck (Haas ST-20, DN Lynx 2100, Mazak QT-200 class) |
| imm200 | imm-200t | injection moulding machine ~200 t clamp (Haitian MA2000, Engel, Sumitomo SE180, JSW, Toyo, Nissei, LS Mtron, Woojin) |
| imm1200 | imm-1200t | injection moulding machine ~1,000–1,300 t clamp |
| laser | laser-trumpf-3030 | flat-sheet fibre laser cutter, 3 × 1.5 m bed, 4–6 kW (TRUMPF TruLaser 3030, Amada ENSIS, Bystronic, Mazak, Han's, HSG, Bodor) |
| pressBrake | brake-trumpf-trubend3100 | CNC press brake ~100 t × 3 m (TRUMPF TruBend 3100, Amada HFE/HG, Yawei, Durma, LVD) |
| waterjet5 | waterjet-5ax-composite | 5-axis abrasive waterjet, ~380 MPa (Flow Mach 500, OMAX, KMT, Sugino) |
| rotoCarousel | rotomould-carousel-4arm | rotational moulding machine, fixed carousel, 3–4 arms (Rotoline, Persico, Ferry, Chinese / Thai makers) |
| thermoformLarge | thermoform-large | inline / rotary thermoforming machine for ≥1200×1000 mm sheet (Illig, Geiss, Kiefel, Asian makers) |
| alProfileCentre | al-cnc-profile-centre | CNC profile machining centre for aluminium profiles up to ~7 m (Elumatec, Emmegi, Haffner, Asian makers) |
| alExtPress | al-ext-press-2500t | aluminium extrusion press ~2,000–2,500 t (press alone and/or full line — say which) |
| gearGrind | gear-grind-generating | generating (threaded-wheel) gear grinder (Reishauer RZ, Kapp, Liebherr LGG, Mitsubishi ZE, Kashifuji) |
| gearHob | gear-hob-small | CNC gear hobber, small (≤ 300 mm workpiece) (Liebherr LC, Mitsubishi GE, Kashifuji, Gleason, Chinese makers) |
| rubberTransfer200 | transfer-mould-std | ~200 t rubber transfer / compression moulding press |

The common classes (vmc3, vmc5, lathe, imm200, laser, pressBrake) are the priority; any specialist class you can price
is a bonus — those have NO sourced price anywhere in the tool today.

## What counts as a price (rules from earlier rounds — they are strict)
- A price is read ON A PAGE (or a PDF) that names the model or a clearly matching spec and the number. Quote the text
  that holds the number verbatim. A category page, a "from" banner without a model, or a search result that does not
  name the machine is NOT a price. If you only saw the number in a search snippet, say `seenIn: "search-snippet"`.
- Good sources, best first: (1) government / public-body PROCUREMENT AWARDS (award notices, 落札結果, 나라장터, 政府電子採購網,
  e-GP, LPSE / e-katalog, PhilGEPS, GeBIZ, muasamcong, MyProcurement) — they name the machine and the price paid;
  (2) a maker's or dealer's published price list in that country; (3) a listed company's annual report giving revenue
  ÷ units (average selling price) for a machine class; (4) a dealer quotation published online; (5) a marketplace /
  used-machine listing — label it so (Low).
- Record SCOPE exactly as the page states it: machine only / incl. delivery, installation, training / incl. tooling or
  auxiliaries / full line. Record VAT (incl / ex / unknown). Record the date (or the year of the award).
- Price in the currency the page shows. Do not convert. Do not compute, average or adjust — we do the arithmetic.
- New machines preferred; a used-machine price is labelled "used" and its year of build given.
- 2024–2026 preferred; older is fine if labelled with its year.
- Never guess, never fill a gap. Record what you tried under `notFound`.
- Do not spoof user agents or try to get round bot checks; if a site blocks you, record it and move on.

## Output — write ONE JSON file per country group to this folder: `<group>.json`
{
  "researchedBy": "<group>", "date": "2026-11-02",
  "items": [
    { "country": "TH", "machineClass": "vmc3", "model": "Haas VF-2", "spec": "762×406×508 mm, 8,100 rpm",
      "price": 2450000, "currency": "THB", "priceType": "procurement-award | list | dealer-quote | ASP | used-listing",
      "scope": "machine only | incl. installation and training | full line …", "vat": "incl | ex | unknown",
      "date": "2025-07", "url": "https://…", "quote": "verbatim text that holds the number",
      "seenIn": "page | pdf | search-snippet", "notes": "anything that affects comparability" }
  ],
  "notFound": [ { "country": "TH", "machineClass": "gearGrind", "tried": "…" } ]
}
Aim for at least one priced item per country for each common class where one exists; two independent items for the
same class are better than one. Report back a short summary: counts per country and class, and anything doubtful.
