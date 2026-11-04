/**
 * The report standard as DATA — the commodity matrix of the five-role review (docs/review/report-standard-2026-11/,
 * director.md §B merged with the cost-engineer, quality, manufacturing and DFM matrices), read by the core should-cost
 * report (executive-summary.ts, then core-report-pdf.ts, and the workbook's first sheet).
 *
 * Per commodity it fixes:
 *  - keyDrivers     the figures a buyer negotiates and a process engineer checks first — each matched against the values
 *                   the costing's rules set (by their form label or field id) and printed with its value, its basis and the
 *                   question to put to the supplier. A driver the costing did not set is simply not printed.
 *  - notIncluded    what is NOT in the price until the engineer answers it ("Not included until answered") — never costed
 *                   here, never invented as a cost.
 *  - quoteBreakdown the items to ask the supplier to break out in the quotation.
 *  - dfm            which geometric DFM rule families apply to the costed process, and which must NOT be shown (they
 *                   describe a process or a machine the costing does not use). Rule ids are matched by prefix.
 *
 * Nothing here is a number: every £ the core report prints comes from the costing.
 */
import type { CommodityType } from '../engine/types.js';

export interface KeyDriver {
  /** What the reader calls it. */
  name: string;
  /** Matched against "<rule label> <field id>" of each value the rules set. */
  match: RegExp;
  /** The question for the supplier. */
  question: string;
  /** 'basis': print the head of the rule's basis (what was chosen and why), not the bare value — a tool life of 500 says
   *  nothing until it names the tool material it was chosen on. */
  display?: 'value' | 'basis';
}

/**
 * `costedIf`: dropped when an operation, consumable / service line or tooling item of the costing matches it.
 * `unlessAnswered`: dropped when the engineer answered the question that settles it that way — a leak test is never
 * listed after "Does this part have to hold pressure? No" (fresh review N17).
 */
export interface NotIncludedItem {
  text: string; costedIf?: RegExp; unlessAnswered?: { id: string; answer: RegExp };
  /** Listed only when the costed material's library category matches (EN 1563 test bars are a DUCTILE iron's). */
  materialIf?: RegExp;
  /** When this answer is given, the item is REQUIRED, not optional: `requiredText` replaces `text` — still not costed. */
  requiredIf?: { id: string; answer: RegExp }; requiredText?: string;
}

export interface CommodityReportStandard {
  keyDrivers: KeyDriver[];
  /** `costedIf`: the item is dropped when an operation or a consumable / service line of the costing matches it. */
  notIncluded: NotIncludedItem[];
  /** Costs the model does not carry that a supplier WILL charge — a gap in the cost model, not a scope item to exclude. */
  notModelled?: string[];
  quoteBreakdown: string[];
  dfm: { apply: string[]; notApply: string[] };
}

/** Quality and launch items no commodity prices until asked (quality.md §B: "Not included until answered"). */
// Gauges and check fixtures are capital the costing never prices: a bench "deburr and gauge check" is an operator's minutes,
// not the gauges — the stub axle (the safety part) was the only one of 15 without the line (fresh review N17).
const LAUNCH: NotIncludedItem[] = [{ text: 'PPAP / initial samples and first-article inspection' }, { text: 'Gauges and check fixtures / CMM programme', costedIf: /check fixture|gauges and fixtures|inspection fixture/i }];
const ni = (text: string, costedIf?: RegExp, unlessAnswered?: NotIncludedItem['unlessAnswered']): NotIncludedItem =>
  ({ text, ...(costedIf ? { costedIf } : {}), ...(unlessAnswered ? { unlessAnswered } : {}) });
/** Settled by a "No" to the leak-tight question. */
const NOT_PRESSURE_TIGHT = { id: 'service.pressureTight', answer: /^no$/ };
/** A safety-critical part: answered Yes. */
const SAFETY_YES = { id: 'service.safetyCritical', answer: /^(yes|true)$/i };
/**
 * EN 1563 test bars on a DUCTILE casting: every melt is tested for nodularity and hardness by every ductile foundry, and a
 * safety-critical part cannot ship without the certificate — so on a part answered safety-critical it is REQUIRED, never
 * "optional" (fresh review, 4 Nov 2026: the stub axle listed it as an item to answer). It is still not in the price.
 */
const DUCTILE_TEST_BARS: NotIncludedItem = {
  text: 'Nodularity / hardness / test-bar certification (EN 1563)', materialIf: /ductile|compacted graphite/i,
  requiredIf: SAFETY_YES,
  requiredText: 'REQUIRED on this safety-critical ductile casting, not optional — nodularity / hardness / test-bar certification (EN 1563) '
    + 'on every melt: not in this price; ask the foundry to quote it',
};
/** Settled by "None — bare part" to the finish question. */
const BARE = { id: 'service.finish', answer: /^none$/ };
/** Heat treatment the costing prices as an operation or a consumable line. */
const HEAT_TREAT_COSTED = /heat treat|normalis|anneal|stress relie|temper|quench|carburi|nitrid|solution/i;

const CASTING_DRIVERS: KeyDriver[] = [
  { name: 'Casting yield (poured kg a good casting)', match: /cast[\s-]?yield|casting yield/i, question: 'What is your method yield — poured kg per good casting?' },
  { name: 'Moulding line rate', match: /sand[\s-]?ct\b|cycle time/i, question: 'Which moulding line, how many moulds an hour and how many impressions a mould?' },
  { name: 'Moulding line crew', match: /cast[\s-]?manning|casting manning/i, question: 'What crew runs the moulding line?' },
  { name: 'Cores', match: /\bcore\b|sand[\s-]?core/i, question: 'How many cores, which process (cold box / shell) and what do they cost a casting?' },
  { name: 'Pattern / tool price', match: /die[\s-]?cost/i, question: 'Pattern and core-box price, material, and who owns them?' },
  { name: 'Pattern life', match: /die[\s-]?life/i, question: 'Pattern life in moulds, and how many sets over the programme?' },
  { name: 'Fettling', match: /fettl/i, question: 'Fettling method and minutes a casting?' },
  { name: 'Heat treatment', match: /ht[\s-]?cost|heat treat/i, question: 'Heat-treatment route and its price a kg?' },
  { name: 'Shot blast', match: /blast/i, question: 'Blast process and its cost a casting?' },
  { name: 'NDT', match: /\bndt\b/i, question: 'NDT regime (MPI, X-ray sampling) and its cost a casting?' },
  { name: 'Machining cell', match: /setup[\s-]?mach|setup machine/i, question: 'Which machine and how many clampings for the machining?' },
  { name: 'Cutting-tool wear', match: /tool[\s-]?wear/i, question: 'Cutting-tool cost a part?' },
  { name: 'Machining fixtures', match: /mach[\s-]?tooling|machining fixtures/i, question: 'How many fixtures, and their price?' },
];

/**
 * Foundry costs the research could not price (review round, 4 Nov 2026 — casting-melt.ts FOUNDRY_NOT_COSTED): a gap in
 * the cost model a foundry WILL charge, never invented. The new sand, ladle preheat, dust extraction and plant electricity
 * ARE costed (named rules).
 */
const FOUNDRY_NOT_MODELLED = 'Foundry costs no published price was found for — furnace and ladle refractory, the metallurgical '
  + 'lab a melt, the pouring and sand-plant crew, bentonite and coal dust on green sand; on steel castings riser cut-off, weld repair and steel '
  + 'refractory wear: not in this price — a foundry will charge them (a gap in the cost model, not an item you can exclude; ask '
  + 'for them on the quotation).';

const STANDARDS: Record<string, CommodityReportStandard> = {
  cast_and_machine: {
    keyDrivers: CASTING_DRIVERS,
    notIncluded: [...LAUNCH, ni('Part marking / traceability (DMC) — mandatory on a safety-critical part', /mark/i), ni('Final wash / cleanliness', /wash/i), ni('Rust preventive or coating after machining', /rust|coat|paint/i), DUCTILE_TEST_BARS, ni('Stress relief, if the drawing calls for it', HEAT_TREAT_COSTED), ni('Leak test and impregnation, if pressure-tight', /leak|impregnat/i, NOT_PRESSURE_TIGHT)],
    notModelled: [FOUNDRY_NOT_MODELLED],
    quoteBreakdown: ['Casting price a part and £/kg as cast, ex-foundry', 'Metal charge £/kg and the index it follows',
      'Poured kg and yield', 'Cores: count and cost a casting', 'Pattern equipment: price, life and sets', 'Fettling, blast and NDT cost a casting',
      'Machining cycle by operation and machine class', 'Machine and labour £/h', 'Tooling investment separate from the piece price', 'Overhead and margin %'],
    dfm: { apply: ['casting.', 'machining.hole.depth', 'machining.hole.intersecting'],
      notApply: ['moulding.', 'blow.', 'sheetmetal.', 'forging.', 'machining.setup.', 'machining.hole.compound-angle', 'machining.hole.many-sizes', 'machining.hole.non-preferred-diameter'] },
  },
  casting: {
    keyDrivers: CASTING_DRIVERS,
    notIncluded: [...LAUNCH, ni('Machining of features left as-cast'), DUCTILE_TEST_BARS, ni('Heat treatment certificate'), ni('Heat treatment, if the specification calls for it', HEAT_TREAT_COSTED), ni('X-ray / UT, if specified', /x-?ray|ultrason|\bUT\b/i), ni('Coating', /coat|paint|plat/i, BARE), ni('Rust preventive', /rust|oil|coat|paint/i), ni('Part marking / traceability', /mark/i), ni('Leak test and impregnation, if pressure-tight', /leak|impregnat/i, NOT_PRESSURE_TIGHT)],
    notModelled: [FOUNDRY_NOT_MODELLED],
    quoteBreakdown: ['Casting price a part and £/kg as cast', 'Metal charge £/kg and the index it follows', 'Poured kg and yield',
      'Cores: count and cost a casting', 'Pattern equipment: price, life and sets', 'Fettling, heat treatment, blast and NDT cost a casting',
      'Moulding line, moulds an hour, impressions and crew', 'Overhead and margin %'],
    dfm: { apply: ['casting.'], notApply: ['moulding.', 'blow.', 'sheetmetal.', 'forging.', 'machining.'] },
  },
  forging: {
    keyDrivers: [
      { name: 'Stock yield (billet kg a forging)', match: /forge[\s-]?yield|yield/i, question: 'Billet kg per forging and your yield?' },
      { name: 'Flash', match: /flash/i, question: 'Flash weight a forging?' },
      { name: 'Forging press', match: /forge[\s-]?mach\b|forging press|^press\b/i, question: 'Which press (tonnage) runs the part?' },
      { name: 'Hits', match: /strokes|hits/i, question: 'How many hits (blocker / finisher)?' },
      { name: 'Takt', match: /forge[\s-]?ct\b|cycle time/i, question: 'Line takt a forging?' },
      { name: 'Forge line crew', match: /forge[\s-]?manning|^manning|crew/i, question: 'What crew runs the forge line?' },
      { name: 'Die set price', match: /die[\s-]?cost/i, question: 'Die set price, steel and impressions — lump sum or in the piece price?' },
      { name: 'Die life', match: /die[\s-]?life/i, question: 'Die life in forgings a set, and sets over the programme?' },
      { name: 'Billet heating', match: /heat[\s-]?energy|furnace/i, question: 'Billet heating method and kWh/kg?' },
      { name: 'Heat treatment / controlled cooling', match: /ht[\s-]?cost|heat treat/i, question: 'Heat treatment (or controlled cooling) for the grade, and its price a kg?' },
      { name: 'Descale', match: /descale/i, question: 'Descale method and its cost a forging?' },
      { name: 'NDT (MPI)', match: /\bndt\b/i, question: 'Crack-detection regime and its cost a forging?' },
      { name: 'Trim press', match: /trim[\s-]?mach/i, question: 'Trim (and pierce) press, in line or separate?' },
    ],
    notIncluded: [...LAUNCH, ni('Grain-flow / macro-etch or ultrasonic testing, if specified'), ni('Shot peening', /peen/i), ni('Part marking / traceability', /mark/i), ni('Rust protection or coating', /rust|coat|oil/i, BARE), ni('Machining of features left as-forged')],
    notModelled: ['Billet shear / saw and the induction heater: their machine time and capital are not in the rate book, so not in this price — a supplier will charge them (a gap in the cost model, not an item you can exclude; ask for them on the quotation).'],
    quoteBreakdown: ['Forging price a part and £/kg as forged', 'Bar / billet £/kg and the index it follows', 'Billet kg, forging kg, flash and yield',
      'Press tonnage, hits and takt', 'Die set price, die life and sets over the programme', 'Heat treatment, descale and MPI cost a forging',
      'Machining cycle (if machined) by operation', 'Overhead and margin %'],
    dfm: { apply: ['forging.'], notApply: ['moulding.', 'blow.', 'sheetmetal.', 'casting.', 'machining.setup.', 'machining.hole.compound-angle', 'machining.hole.many-sizes', 'machining.hole.non-preferred-diameter'] },
  },
  machining: {
    keyDrivers: [
      { name: 'Stock (form and size)', match: /stock[\s-]?w(eigh)?t|mat[\s-]?util|utili[sz]ation/i, question: 'Bar or plate size you buy, and the buy-to-fly?' },
      { name: 'Machine and routing', match: /setup[\s-]?mach|setup machine/i, question: 'Which machine class and how many clampings?' },
      { name: 'Set-up', match: /setup[\s-]?time/i, question: 'Set-up time a batch, and batch size?' },
      { name: 'Cutting-tool wear', match: /tool[\s-]?wear/i, question: 'Cutting-tool cost a part?' },
      { name: 'Fixtures', match: /mach[\s-]?tooling|fixture/i, question: 'How many fixtures, and their price?' },
      { name: 'CAM programming', match: /prog/i, question: 'Programming and prove-out cost?' },
      { name: 'Scrap', match: /reject|scrap/i, question: 'Machining scrap rate?' },
    ],
    notIncluded: [...LAUNCH, ni('Pressure / leak test (hydraulic parts — ask)', /leak|pressure test/i, NOT_PRESSURE_TIGHT), ni('Cross-hole deburr (thermal / ECM / brush)', /deburr/i), ni('Cleanliness wash (ISO 16232)', /wash/i), ni('Anodise / coating', /anodis|coat/i, BARE), ni('Part marking', /mark/i)],
    quoteBreakdown: ['Stock form, size and £/kg', 'Cycle time by set-up (roughing, finishing, holes)', 'Machine class and £/h', 'Labour £/h and manning',
      'Cutting-tool cost a part', 'Fixtures and programming (one-off)', 'Scrap rate', 'Overhead and margin %'],
    dfm: { apply: ['machining.'], notApply: ['moulding.', 'blow.', 'sheetmetal.', 'casting.', 'forging.'] },
  },
  injection_moulding: {
    keyDrivers: [
      { name: 'Cavities', match: /imm[\s-]?cav\b|cavities/i, question: 'How many cavities, and why that number?' },
      { name: 'Press', match: /imm[\s-]?mach\b|^press|machine/i, question: 'Press tonnage?' },
      { name: 'Cooling factor (× wall²)', match: /cool/i, question: 'Cycle split: fill / pack / cool / eject?' },
      { name: 'Fill', match: /\bfill\b/i, question: 'Fill time?' },
      { name: 'Pack / hold', match: /\bpack\b|hold/i, question: 'Pack / hold time?' },
      { name: 'Open, eject, close', match: /eject/i, question: 'Dry cycle of the press?' },
      { name: 'Runner', match: /runner[\s-]?w|runner weight/i, question: 'Runner (cold / hot) and its weight; regrind allowed?' },
      { name: 'Mould price', match: /mould[\s-]?cost/i, question: 'Mould price, steel and who owns it?' },
      { name: 'Mould life', match: /mould[\s-]?life/i, question: 'Mould life in shots?' },
      { name: 'Slides / lifters', match: /side[\s-]?action|slide/i, question: 'How many slides / lifters are in the mould price?' },
      { name: 'Crew', match: /manning/i, question: 'Operators a press?' },
    ],
    notIncluded: [...LAUNCH, ni('Inserts / heat-staking', /insert|stak/i), ni('EMC coating or plating', /coat|plat/i), ni('Laser marking', /mark/i), ni('Colour-match approval'), ni('Cosmetic grade-A inspection')],
    quoteBreakdown: ['Resin grade and £/kg (and the index)', 'Part and runner weight, regrind %', 'Cavities and press tonnage', 'Cycle split (fill / pack / cool / eject)',
      'Machine £/h and crew', 'Mould price, steel, life and maintenance', 'Scrap rate', 'Packaging basis', 'Overhead and margin %'],
    dfm: { apply: ['moulding.'], notApply: ['machining.', 'casting.', 'forging.', 'sheetmetal.', 'blow.'] },
  },
  sheet_metal: {
    keyDrivers: [
      { name: 'Gauge', match: /thick|gauge/i, question: 'Coil gauge and grade?' },
      { name: 'Blank', match: /blank[\s-]?[lw]\b|blank (length|width)/i, question: 'Developed blank size?' },
      { name: 'Strip pitch', match: /pitch/i, question: 'Strip pitch and width (utilisation)?' },
      { name: 'Press', match: /sm[\s-]?press$|^press\b|press line/i, question: 'Press line type and tonnage?' },
      { name: 'Strokes a minute', match: /\bspm\b|strokes/i, question: 'Strokes a minute?' },
      { name: 'Stations / operations', match: /num[\s-]?ops|stations|operations/i, question: 'How many stations / dies?' },
      { name: 'Die price', match: /die[\s-]?cost/i, question: 'Die price and type (progressive / transfer / tandem)?' },
      { name: 'Die life', match: /die[\s-]?life/i, question: 'Die life, and maintenance a year?' },
      { name: 'Crew', match: /manning/i, question: 'Crew on the line?' },
    ],
    notIncluded: [...LAUNCH, ni('E-coat / zinc plating (ask: "Is the part coated?")', /coat|zinc|plat/i, BARE), ni('Weld nuts / fasteners', /weld|nut|fasten/i), ni('Burr-height control'), ni('Part marking, if safety-relevant', /mark/i)],
    quoteBreakdown: ['Coil grade, gauge and £/kg (and the index)', 'Blank, strip pitch and width, utilisation', 'Scrap credit £/kg', 'Press, tonnage, SPM and crew',
      'Die price, type, stations and life', 'Die maintenance', 'Overhead and margin %'],
    dfm: { apply: ['sheetmetal.'], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'machining.'] },
  },
  aluminium_extrusion: {
    keyDrivers: [
      { name: 'Alloy', match: /alloy/i, question: 'Alloy and temper you will run?' },
      { name: 'Route', match: /alx[\s-]?route|route/i, question: 'Press route (direct / indirect / Conform / impact)?' },
      { name: 'Circumscribing circle', match: /ccd|circle/i, question: 'Which press and container size?' },
      { name: 'Minimum wall', match: /wall/i, question: 'Exit speed at this wall?' },
      { name: 'Hollows', match: /voids|hollow/i, question: 'Die type (solid / porthole)?' },
      { name: 'Temper', match: /temper/i, question: 'Ageing route and cost?' },
      { name: 'Finish', match: /(^|\s)alx-finish$|^finish(?!ed)\b/i, question: 'Finish (mill / anodise / powder) and its price a square metre?' },
    ],
    notIncluded: [...LAUNCH, ni('Machining and drilling beyond the measured holes'), ni('Anodise / powder (open question)', /anodis|powder/i, BARE), ni('Stretch-bending (open question)', /stretch|bend/i), ni('CMM / straightness checks'), ni('Mechanical test and EN 10204 3.1 certificate per ageing load')],
    quoteBreakdown: ['Billet: LME + premium + alloy adder (the index basis)', 'Conversion £/kg', 'kg/m and recovery %', 'Press, die type and exit speed',
      'Die price a set (up-front) and die life in tonnes', 'Ageing, cut-to-length and fabrication', 'Overhead and margin % on conversion'],
    dfm: { apply: [], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'sheetmetal.', 'machining.'] },
  },
  extrusion: {
    keyDrivers: [
      { name: 'Line rate', match: /ext[\s-]?rate|line rate/i, question: 'Line speed and what limits it (screw or cooling)?' },
      { name: 'kg a metre', match: /kg[\s-]?per[\s-]?m/i, question: 'kg a metre?' },
      { name: 'Line', match: /ext[\s-]?mach\b|line\b/i, question: 'Which line and screw size?' },
      { name: 'Start-up scrap', match: /ext[\s-]?scrap|start-?up/i, question: 'Start-up and steady scrap?' },
      { name: 'Die and calibrator', match: /die[\s-]?cost/i, question: 'Die and calibrator price?' },
      { name: 'Crew', match: /manning/i, question: 'Operators a line?' },
    ],
    notIncluded: [...LAUNCH, ni('Secondary forming (bends, flaring)', /bend|flar/i), ni('End fittings', /fitting/i), ni('Printing / marking', /print|mark/i), ni('Pressure test, if specified', /pressure|leak/i, NOT_PRESSURE_TIGHT)],
    quoteBreakdown: ['Resin grade and £/kg', 'kg/m and cut length', 'Line rate (m/min, kg/h)', 'Start-up and steady scrap', 'Die and calibrator', 'Overhead and margin %'],
    dfm: { apply: [], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'sheetmetal.', 'machining.'] },
  },
  blow_moulding: {
    keyDrivers: [
      { name: 'Wall', match: /bm[\s-]?wall|wall/i, question: 'Nominal wall and parison programme?' },
      { name: 'Flash', match: /flash[\s-]?w|flash weight/i, question: 'Flash weight and regrind?' },
      { name: 'Cavities', match: /bm[\s-]?cav\b|cavit/i, question: 'Cavities a mould?' },
      { name: 'Machine', match: /bm[\s-]?mach\b|machine/i, question: 'Machine and heads?' },
      { name: 'Cooling', match: /cool/i, question: 'Cycle split (blow / cool / open-close)?' },
      { name: 'Mould price', match: /mould[\s-]?cost/i, question: 'Mould price and material?' },
      { name: 'Mould life', match: /mould[\s-]?life/i, question: 'Mould life?' },
      { name: 'Crew', match: /manning/i, question: 'Operators a machine?' },
    ],
    notIncluded: [...LAUNCH, ni('Assembly of clips / foam'), ni('Leak test, if the part must seal', /leak/i, NOT_PRESSURE_TIGHT), ni('Wall-thickness sampling'), ni('Labelling')],
    quoteBreakdown: ['Resin and £/kg', 'Part and flash weight, regrind', 'Machine, heads and cycle', 'Cavities', 'Mould price and life', 'In-line trim', 'Overhead and margin %'],
    dfm: { apply: ['blow.'], notApply: ['moulding.', 'casting.', 'forging.', 'sheetmetal.', 'machining.'] },
  },
  rotational_moulding: {
    keyDrivers: [
      { name: 'Oven time', match: /rm[\s-]?heat|heat/i, question: 'Oven time a cycle?' },
      { name: 'Cooling', match: /cool/i, question: 'Cooling time and method?' },
      { name: 'Arms', match: /arms/i, question: 'Carousel and arms?' },
      { name: 'Parts an arm', match: /parts[\s-]?per[\s-]?arm/i, question: 'Parts an arm?' },
      { name: 'Moulds in service', match: /rm[\s-]?moulds|moulds in service/i, question: 'How many moulds in service?' },
      { name: 'Mould price', match: /mould[\s-]?cost/i, question: 'Mould price?' },
      { name: 'Mould life', match: /mould[\s-]?life/i, question: 'Mould life in cycles?' },
      { name: 'Powder grinding', match: /powder/i, question: 'Powder £/kg including grinding?' },
      { name: 'Crew', match: /manning/i, question: 'Operators at the carousel?' },
    ],
    notIncluded: [...LAUNCH, ni('Inserts / fittings', /insert|stak/i), ni('Leak / pressure-decay test (ask: pressure-tight?)', /leak|pressure/i, NOT_PRESSURE_TIGHT), ni('Burst test'), ni('Labelling')],
    quoteBreakdown: ['Powder £/kg incl. grinding', 'Charge kg', 'Oven, cool and load times — which paces the carousel', 'Parts an arm and moulds in service',
      'Mould price and life', 'Crew and OEE', 'Overhead and margin %'],
    dfm: { apply: [], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'sheetmetal.', 'machining.'] },
  },
  thermoforming: {
    keyDrivers: [
      { name: 'Sheet gauge', match: /tf[\s-]?thk|gauge|thick/i, question: 'Sheet gauge and grade?' },
      { name: 'Sheet weight', match: /sheet[\s-]?w/i, question: 'Sheet weight a part and utilisation?' },
      { name: 'Parts a sheet', match: /pps|parts per sheet/i, question: 'Parts a sheet?' },
      { name: 'Heating', match: /tf[\s-]?heat|heat/i, question: 'Heat time?' },
      { name: 'Cooling', match: /cool/i, question: 'Cool time?' },
      { name: 'Trim', match: /tf[\s-]?trim$|trim time|^trim/i, question: 'Trim method and time?' },
      { name: 'Tool price', match: /tool[\s-]?cost/i, question: 'Tool price and material?' },
      { name: 'Crew', match: /manning/i, question: 'Operators a former?' },
    ],
    notIncluded: [...LAUNCH, ni('Grain / texture'), ni('Adhesive / backing'), ni('Assembly of clips'), ni('Colour approval')],
    quoteBreakdown: ['Sheet £/kg, gauge and size', 'Parts a sheet and web / trim %', 'Former type and cycle (heat / form / cool / index)', 'Trim method and time',
      'Tool price', 'Overhead and margin %'],
    dfm: { apply: [], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'sheetmetal.', 'machining.'] },
  },
  composites: {
    keyDrivers: [
      { name: 'Process', match: /(^|\s)comp-process$/i, question: 'Layup (autoclave / oven), RTM or compression moulding — and why at this volume?', display: 'basis' },
      { name: 'Cure system', match: /(^|\s)comp-cure-mach$|cure[\s-]?mach/i, question: 'Which cure cell (autoclave / oven / press), its bed and parts a load?' },
      { name: 'Tool material and life', match: /tool[\s-]?life/i, question: 'Tool material (steel / Invar / CFRP / nickel shell) and its life in cycles?', display: 'basis' },
      { name: 'Tools in service', match: /comp[\s-]?tools$|tools in service/i, question: 'How many tools in service at this volume?' },
      { name: 'Tool price', match: /tool[\s-]?cost/i, question: 'Tool price?' },
      { name: 'Plies', match: /plies/i, question: 'Ply count and layup method?' },
      { name: 'Layup time', match: /layup[\s-]?time/i, question: 'Layup minutes a part?' },
      { name: 'Cure', match: /cure[\s-]?time/i, question: 'Cure cycle and parts a load?' },
      { name: 'Fibre price', match: /fibre[\s-]?price/i, question: 'Fibre / prepreg £/kg?' },
      { name: 'Resin price', match: /resin[\s-]?price/i, question: 'Resin £/kg?' },
      { name: 'Waste', match: /waste/i, question: 'Material waste %?' },
      { name: 'NDI', match: /\bndi\b/i, question: 'NDI scope?' },
    ],
    notIncluded: [...LAUNCH, ni('Paint / sealing', /paint|seal/i), ni('Bonded inserts', /insert/i), ni('NDI acceptance standard'), ni('Coupon / witness-panel testing per cure load')],
    quoteBreakdown: ['Prepreg / fibre and resin £/kg, kg bought', 'Layup method and minutes', 'Cure system and parts a load', 'Tool price, tool life and tools in service',
      'Trim and NDI', 'Overhead and margin %'],
    dfm: { apply: [], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'sheetmetal.', 'machining.'] },
  },
  rubber: {
    keyDrivers: [
      { name: 'Process', match: /rub[\s-]?process|process/i, question: 'Compression, transfer or injection — and why?' },
      { name: 'Cavities', match: /cavit/i, question: 'Cavities a mould?' },
      { name: 'Cure cycle', match: /cycle/i, question: 'Cure time at the thickest section?' },
      { name: 'Cure section', match: /thickness|cure section/i, question: 'Thickest section?' },
      { name: 'Deflash', match: /deflash/i, question: 'Deflash method (cryogenic at volume?)' },
      { name: 'Mould price', match: /mould[\s-]?cost/i, question: 'Mould price?' },
      { name: 'Mould life', match: /mould[\s-]?life/i, question: 'Mould life?' },
      { name: 'Crew', match: /manning/i, question: 'Operators a press?' },
    ],
    notIncluded: [...LAUNCH, ni('Post-cure, if specified', /post-?cure/i), ni('Surface treatment / talc'), ni('100 % visual inspection beyond deflash')],
    quoteBreakdown: ['Compound £/kg', 'Shot and flash weight', 'Cavities and cure time', 'Press and crew', 'Deflash method', 'Mould price and life', 'Overhead and margin %'],
    dfm: { apply: [], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'sheetmetal.', 'machining.'] },
  },
  gear: {
    keyDrivers: [
      { name: 'Blank', match: /blank[\s-]?cost/i, question: 'Blank source (bar or forged) and its price?' },
      { name: 'Soft turning', match: /prep[\s-]?ct/i, question: 'Soft-turning time?' },
      { name: 'Quality class', match: /quality/i, question: 'ISO 1328 class and the finishing route?' },
      { name: 'Case depth', match: /ecd|case depth/i, question: 'Case depth and heat-treat £/kg?' },
      { name: 'Set-up', match: /setup/i, question: 'Set-up a batch on each machine?' },
      { name: 'Scrap', match: /reject/i, question: 'Scrap rate after heat treatment?' },
    ],
    notIncluded: [...LAUNCH, ni('Hard turning / grinding of the bore and faces', /hard turn|bore grind|grind(ing)? (of )?the bore/i), ni('Shot peening', /peen/i), ni('Straightening', /straighten/i), ni('100 % gear roll / noise test'), ni('Part marking', /mark/i), ni('Final wash', /wash/i), ni('Rust preventive', /rust|preserv|oil/i)],
    quoteBreakdown: ['Blank route and price', 'Cycle by operation (turn, hob, chamfer, grind, check)', 'Heat treatment £/kg and case depth',
      'Hob and wheel cost a part (perishable)', 'Fixtures, masters and programming (one-off)', 'Overhead and margin %'],
    dfm: { apply: ['machining.feature.toothed-form'], notApply: ['moulding.', 'casting.', 'forging.', 'blow.', 'sheetmetal.'] },
  },
};
STANDARDS.sheet_metal_fab = { ...STANDARDS.sheet_metal };

/** Commodities without a matrix row (painting, assemblies, electronics …): the launch items and the generic quote lines. */
const DEFAULT_STANDARD: CommodityReportStandard = {
  keyDrivers: [],
  notIncluded: [...LAUNCH, ni('Part marking / traceability', /mark/i), ni('Coating or surface treatment, unless costed', /coat|paint|plat/i)],
  quoteBreakdown: ['Material £/kg and the index it follows', 'Cycle by operation and machine class', 'Machine and labour £/h', 'Tooling investment separate from the piece price',
    'Scrap rate', 'Overhead and margin %'],
  dfm: { apply: [], notApply: [] },
};

export function reportStandardFor(commodity: CommodityType | string | null | undefined): CommodityReportStandard {
  return STANDARDS[String(commodity ?? '')] ?? DEFAULT_STANDARD;
}

/** Does a geometric DFM rule apply to this commodity's costed process? A must-NOT family is never shown in the core. */
export function dfmRuleApplies(commodity: CommodityType | string | null | undefined, ruleId: string): boolean {
  const s = reportStandardFor(commodity);
  return !s.dfm.notApply.some(p => ruleId.startsWith(p));
}

/** Every commodity with a matrix row (for tests). */
export const REPORT_STANDARD_COMMODITIES = Object.keys(STANDARDS);
