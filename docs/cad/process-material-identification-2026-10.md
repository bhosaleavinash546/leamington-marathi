# Identifying the process and the material — review, research and changes, 2 October 2026

The tool was not identifying the right manufacturing process or material for an
uploaded part. This note records why, what the options are, which models to
use, what was changed, how it was measured, and what it still cannot do.

## 1. How identification worked before this change

| Path | Process | Material |
|---|---|---|
| **No API key** (the JLR default) | `inferCommodity` decides only on three decisive signals — bends at a sheet gauge, a large thin open shell, a large thin shell enclosing a void — and gears. Everything else is a question listing two to four routes from the fill ratio, **with no suggestion**. | Decided only if the *upload file name* names an alloy; otherwise a question. |
| **With a key** | Stage 1: **Claude Haiku 4.5 reading a paragraph of numbers** (box, fill, face count). It saw **no image**: the render views, the photo and the drawing went only to the later specialist call, after the process was already chosen. Then the specialist on **Claude Sonnet 5 / Opus 4.8** (a generation behind the PCB path). | The specialist's `materialId`, often the default grade for the commodity, held as a blocking confirmation. |

## 2. What was wrong — the gaps

1. **The evidence in the file was not read.** A STEP file carries the product
   name, the path it was saved under (folders included), the authoring system,
   and — in AP214/AP242 exports with material properties on — the material.
   The pre-processor read some of this for the prompt; the rules read none of
   it. On the audit set: `Casting_Braket.stp` has the product name "Casting
   Bracket"; `Part1.stp` was saved in a folder called `CASTING-01`; the knuckle's
   model is `STEERING_KNUCKLE_PATTERN` — a pattern is what a foundry moulds from.
2. **The surface was not read.** The kernel counts faces by type, and that
   separates net-shape from cut-from-solid better than the fill ratio does: the
   synthetic machined fixtures have **0%** free-form or toroidal faces; the real
   cast and forged parts have **21–42%** (knuckle 21, PRCR002 30, Casting_Braket
   34, Part1 42).
3. **The process question offered no suggestion**, so an engineer with no
   casting background got four equal options.
4. **Stage 1 was blind.** The one AI step that chose the process saw no image.
5. **Old models** on the CAD path (Sonnet 5, Opus 4.8, Haiku 4.5 by a dated ID),
   and the specialist's `max_tokens` of 8,192 would truncate a 5.5-generation
   reply, where thinking counts toward the limit.
6. **The material matcher missed common cast alloys** (A356, A357, AlSi…,
   EN AC-4xxxx, 5083, 5754).
7. **Material from a CAD render is not possible.** Renders are untextured grey.
   Nothing in the old prompt said so, and the model was free to guess.

## 3. Research — which model, and is there something better than a general model?

**General vision-language models (Claude).** The task is reading mixed evidence
— a photo, a drawing PDF, renders, numbers, names — and reasoning about it like
a process engineer. That is what a frontier multimodal model does well, and
recent work applies vision-language models to manufacturing feature recognition
on CAD images with little supervision ([ASME JCISE 2025](https://asmedigitalcollection.asme.org/computingengineering/article/25/10/104501/1219857/Leveraging-Vision-Language-Models-for); [arXiv 2411.02810](https://arxiv.org/pdf/2411.02810)).

| Model | Price per M tokens (in / out) | Use here |
|---|---|---|
| Claude Haiku 4.5 | $1 / $5 | Kept only as the fallback if identification fails. Weakest on images. |
| **Claude Sonnet 5.5** | $2 / $10 | **Default for identification and the specialist.** Strong vision at a third of Opus's input price. |
| **Claude Opus 5.5** | $4 / $20 | **"Deep analysis"**: hard or ambiguous parts, effort `high`. |
| Claude Fable 5.1 | $10 / $50 | Not justified per part. A candidate for an offline audit of disputed parts. |

Estimated cost of one identification on Sonnet 5.5 with four renders, a photo
and a one-page drawing: roughly 10–12k input tokens and 1–2k output, about
**$0.04 a part**; about twice that on Opus 5.5. These are estimates from the
request shape, not measured — no key was used.

**Specialised CAD learning.** Networks that read the B-rep directly — UV-Net
([CVPR 2021](https://openaccess.thecvf.com/content/CVPR2021/papers/Jayaraman_UV-Net_Learning_From_Boundary_Representations_CVPR_2021_paper.pdf)),
BRepNet, Hierarchical CADNet ([2022](https://www.researchgate.net/publication/358435959_Hierarchical_CADNet_Learning_from_B-Reps_for_Machining_Feature_Recognition)),
transformer variants ([2025](https://arxiv.org/pdf/2504.07134)), FoV-Net
([2026](https://arxiv.org/pdf/2602.24084)); survey in [arXiv 2402.17695](https://arxiv.org/pdf/2402.17695)
— classify parts and recognise machining features with high accuracy *when
trained on labelled data*. The public datasets label part *types*, not
processes (FabWave: 4,572 models in 45 categories such as brackets and gears),
so there is no off-the-shelf process classifier. **Recommendation: not now.**
When JLR can export a few thousand parts from PLM with their sourced process
and material (the BOM already holds both), a B-rep classifier trained on them
becomes a strong second opinion. Until then it would be trained on nothing.

**The bigger lever is not the model.** Material is not in the geometry at all.
The reliable sources, in order: the CAD file's declared material (AP242 carries
material as a part property — [AP242 and PMI](https://dac.digital/step-ap242-and-pmi-explained-the-file-format-behind-model-based-manufacturing/)),
the drawing, the PLM/BOM record, and a photo of a real part. A model reading a
grey render can only guess.

## 4. What was changed

1. **`server/utils/cad-metadata.ts`** reads the STEP header path, product names,
   description, authoring system and declared material (`MATERIAL_DESIGNATION`,
   material properties), and IGES header fields. Attached to the geometry at the
   measurement boundary, so the route, re-analysis, bulk runs and the baseline
   all see it.
2. **`derive/part-evidence.ts`**: process words in every name ("casting",
   "pattern" but not "bolt pattern", "HPDC", "forged", "pressing", "moulding",
   "machined"), the net-shape signal from the face mix, and material from a
   declared property or a name.
3. **The process question now suggests an answer and says why.** The leaning
   comes from the names, then the surface; a cast part with measured holes leans
   to "cast then machined"; a route a name points to is added if the fill ratio
   had not listed it. It is **pre-selected** on screen, and the engineer confirms
   with Apply — the Calculate gate still waits for that.
4. **Material from the file**: a declared material decides the family; a product
   name or header path naming an alloy decides it as the upload name always did.
   The alloy matcher now knows A356/A357, AlSi…, EN AC-4xxxx, 5083, 5754, LM6.
5. **Stage 1 is a vision identification** (`server/utils/cad-identify.ts`):
   one call to Sonnet 5.5 (Opus 5.5 under Deep analysis) with the photo, the
   drawing, the four CAD renders, the measured geometry and the file's names,
   returning process, alternatives, material family and grade, the source of the
   material, and evidence lines — as structured output, with a words-only
   fallback if a proxy refuses the schema, and the old numbers-only selector if
   the call fails. The prompt tells it what each input can show: **renders are
   shape only and never evidence of material**; a material with no source is
   forced to "unknown". Its result goes to the specialist as context.
6. **The geometry still overrules it.** `enforceGeometryCommodity` runs after
   Stage 1 as before, and a material the model read is still held as a blocking
   confirmation with its pick pre-selected — it never goes into the money
   unconfirmed.
7. **Specialist on Sonnet 5.5 / Opus 5.5**, `max_tokens` 16,000, explicit effort
   (`medium`, `high` for Deep analysis), and every text block read.
8. **Bug fixed: the engineer's process answer was being thrown away.** On
   re-analysis the screen sent the override drop-down every time, pre-filled with
   the first pass's recommendation — "machining" whenever the process was still
   an open question — and the server let it beat the answer. Answering "cast then
   machined" for the Casting Bracket costed it as machined from billet, **£101.40**;
   with the fix it costs as a sand casting plus finish machining, **£50.92**. This
   was also the unexplained "£107, routed to machining" run in the sheet-metal
   live test of the same day. The drop-down is now sent only when changed, and an
   answered process question wins over an unflagged drop-down on the server
   (`effectiveForcedCommodity`), on both the rules and the AI path.

## 5. Measured

`npx tsx scripts/process-material-eval.ts` on the six labelled real parts:

| | Before | After |
|---|---|---|
| Process suggested matches the label (no key) | 2 / 6 (only the sheet part and the gear were settled; the rest asked with no suggestion) | **4 / 6** |
| Material settled from the file (no key) | 0 / 6 | 0 / 6 — none of these files declares or names a material, so asking is correct |
| AI arm | not measured | **not measured — no API key in this environment** |

**Both misses are labels the file contradicts.** Our recorded answer for
`Part1.stp` is "machined from billet", but it was saved in `CASTING-01` and 42%
of its surface is blended. Our answer for the knuckle is "forged", but its model
is named `STEERING_KNUCKLE_PATTERN` (a pattern is a foundry tool) and steering
knuckles are commonly cast in SG iron. These answers were engineering
judgements recorded in `scripts/real-parts-baseline.ts`; they should be checked
with the part owners, not silently changed. If they are wrong, the rules score
6 / 6.

Live, in a browser, the Casting Bracket now arrives with "Cast then machined"
pre-selected and the evidence written out — the file name, the STEP product name,
the folder in the header path, 34% blended faces, measured holes — and costs as a
casting with finish machining once confirmed.

## 6. What it still cannot do

- **Material from CAD alone.** Without a declared material, a drawing, a photo
  or a name, the material is a question. That is correct, not a gap to close
  with a guess.
- **Cast versus forged from shape alone** is a sourcing decision as often as a
  geometric one; the suggestion is a leaning.
- **The AI arm is unmeasured.** Run the eval with a key (`--ai`, and `--deep` for
  Opus), and add photos as `cad-audit/parts/<name>.jpg` — the photo is where the
  material accuracy will come from.
- **Server-side refusal fallbacks are not enabled** on these calls: the CAD path
  can be routed through `ANTHROPIC_BASE_URL` to a private endpoint that may not
  accept the beta parameter, and the PCB path does not use them either. A
  refusal there degrades to the numbers-only selector.
- Other AI routes (RFQ reading, the DFM note, the agent, chat) still use the
  older model IDs; they do not identify process or material and were left alone.
- Screen and headless material are now the same; see §8.

## 8. Screen against headless — the material gap, closed

Same part, same answers, two paths: the browser form and the headless chain
(`costMeasuredPart` — bulk runs, the real-parts baseline, the no-key CAD branch).
On the Casting Bracket the material was **£11.70 on screen against £3.48
headless**. Four causes, all fixed:

1. **The form could not show the grade the rules chose.** A steel casting got
   the wrought bar `mat-steel1045`; the cast-and-machine drop-down does not
   list bar stock, kept its first entry (aluminium ADC12), and priced 2.5 kg of
   steel at an aluminium rate. Steel castings now get cast steel GS-C25,
   forgings a forging billet, and `tests/material-scope-parity.test.ts` checks
   every representative grade is one its form offers. The scope table moved to
   `src/ui/material-scope.ts` so the test can read it. If a select still lacks
   a grade, the screen adds it rather than silently keeping the first option.
2. **Forging decided a family, not a grade**: `forging.materialId` now emits
   the representative billet.
3. **The sand core.** The screen's core field defaulted to £1.50 and headless
   costed every sand casting coreless. `casting.coreCostPerPart` is now a rule,
   from the undercut faces the draft analysis counts (none → £0, 1–5 → £0.75,
   6–19 → £1.50, 20+ → £3, a sealed void → £6; no draft analysis → £1.50 at low
   confidence).
4. **Rule values that never reached headless.** The screen takes a rule's value
   by its field id; headless only through `RULE_PATH_MAP` (`apply.ts`). 39 rule
   paths were in neither, including the core cost and the sheet-metal cut
   length, press and BIW line, so headless sized the press off 2(L+W) and
   costed every stamping as a coil-fed die. These are now mapped. Every other path
   is listed in `RULE_PATHS_NOT_COSTED_HEADLESS` with its reason, and
   `tests/rule-path-coverage.test.ts` fails on any new rule that is neither.
   The sheet-metal rules also now decide the coil grade: before, the form kept
   DC01 (£0.91/kg, small-lot) while headless used DC04 (£0.77/kg, coil).

Measured live in a browser against the headless baseline, same answers:

| Part | Material on screen | Material headless |
|---|---|---|
| Casting Bracket, before | £11.70 | £3.48 |
| Casting Bracket, after | **£9.48** | **£9.48** |
| Seat bracket, before | £0.72 (DC01) | £0.62 (DC04) |
| Seat bracket, after | **£0.60** (DC04) | **£0.62** (DC04) |

**Still different, and why:**
- The seat bracket's last 2p is the reject allowance: headless shop defaults
  use 3% scrap, while the screen form defaults to 0%.
- The Casting Bracket's labour is £11.03 on screen and £9.09 headless; process
  agrees within 1%. Shop defaults (OEE, manning) differ between the form and
  `SHOP_DEFAULTS`. Totals also differ by the volume: the screen amortises
  tooling over 100,000 parts and the baseline over 50,000.
- Lines marked PARITY GAP in `RULE_PATHS_NOT_COSTED_HEADLESS`: blow-moulding
  machine and cool factor, and thermoforming, rotational-moulding and rubber
  inputs. There the screen runs a fuller module input than `toCostParams`
  builds. Each needs its own change to `toCostParams`; they are listed, not
  hidden.

## 7. What is needed from JLR

1. Ten or more parts with their **true** process and material, and a **photo** of
   each — the evaluation set for the AI arm.
2. Confirmation of the knuckle and Part1 labels.
3. Whether CATIA/NX exports at JLR can switch on material properties in STEP
   (AP214/AP242). If they can, material identification from CAD becomes a read,
   not a question, for every part.
4. Later: a PLM export of parts with process and material, to train a B-rep
   classifier as a second opinion.
