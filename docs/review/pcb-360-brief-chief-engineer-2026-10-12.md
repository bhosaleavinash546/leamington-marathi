# PCB photo → BOM → cost: brief for the Chief Engineer, Electronics (13 Oct 2026)

**Board:** 360° camera module, 20 × 20 mm, 8 layers, 80 components. Built in China, 250,000 a year.
**Tool says:** £16.13 a board delivered to the UK (likely range £12.95–£20.86). **Paid:** £17.00 (one board, −5 %;
one point, not an accuracy figure).

## How it works — and the one rule

1. **Photos (up to 8) and, optionally, the BOM and fab files.** Every photo goes to every reading stage. This is proven
   by recording each request: all 8 images were sent to each of the 5 vision stages.
2. **The AI reads, it never prices.** It classifies the board, reads chip markings, transcribes a BOM picture and
   lists the parts. The output schemas have no price field. A part number counts only with evidence: a chip marking
   that agrees with it, the engineer's BOM, or the engineer's edit. Anything else is "suggested", shown but not priced.
3. **Every £ is arithmetic,** in this order:
   - **Catalogue:** 1,217 parts, 880 priced from distributor listings, each with a source and a date.
   - **Live distributor:** only if a Nexar / RS key is set. Not set here, and nothing searches the internet.
   - **Otherwise the tool's class range:** a passive by size, an IC by package, an imager at the automotive volume
     price.

   Then:
   - volume pricing follows the parts bought (qty × boards);
   - a 5 % EMS material burden;
   - fab, assembly and test from the country's rates;
   - automotive premiums (IATF 16949, IPC class 3);
   - freight and UK duty.

## This board, checked against your BOM and data sheet

- **BOM:** all 11 lines and 80 parts match your table. The 4 TI ICs are catalogue-priced. **DS90UB935-Q1** is a
  family price (as …TRHBRQ1) and is flagged to verify; so is the **unnamed image sensor** (£4.78, imager rule).
  Those two are the "£6.91 to verify".
- **Board:** 20 × 20 mm, 8 layers and OSP all match. Copper is costed at 1 oz until it is typed in. Your 70 µm outer
  layers add £0.01.
- **Your data sheet says "components on both sides: No",** but the photos show parts on both sides. The tool flags
  the second reflow side as **not costed**.
- **ASIL:** the classifier claimed ASIL-C with a radar rationale on a camera board. The tool rejected the rationale
  and costed **ASIL-B**, because no safety PMIC / SBC is on the BOM.

## Fixed in this review (34 defects; the logic fixes each have a test)

The ones that changed or could change a number:

- an engineer's price correction was **lost** on the next re-price;
- copper typed from the data sheet was **dropped**;
- a cut-off OCR answer lost **every** chip marking;
- a failed run was **cached** for 30 days;
- one unreadable photo **failed the whole analysis**;
- the model's word "automotive" raised a general board's prices;
- live pricing reached only 5 parts;
- the "sourcing factor" labels were wrong (it is the 5 % EMS burden);
- the reports called a catalogue family match a "range price", printed derived volume prices as distributor prices, and
  printed the estimated via count, ICT time and copper as facts.

Full list: `docs/review/pcb-360-review-2026-10-12.md`.

## Say plainly in the review

- **Photo-reading accuracy is not measured.** There is no labelled reference board. This run replays the AI's 6 Oct
  reading of your photos (no API key in the review environment); everything after the AI ran live.
- **Your top photo is 341 × 334 px, too small to read any chip.** The part numbers came from the BOM picture. For a
  photo-only BOM, use close-ups of each IC at ≥ 2,000 px.
- **No photo shows the via count (115), the layer stack or the ICT time (60 s).** These are estimates and are listed
  as such. Gerbers and drill files replace them with measured values.
- **The catalogue prices at 250k are DERIVED** along the volume curve from 1k–10k distributor breaks. They are
  should-cost figures, not quotes.
- **One real price is not accuracy.** Each actual added to `scripts/actuals/pcb-actuals.csv` makes the next claim
  stronger.
