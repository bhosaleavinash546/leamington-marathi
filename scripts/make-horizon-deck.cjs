// BrainSpark Horizon — the technology-foresight director deck.
//
// Light theme, strong colour blocking. Real numbers only: the register figures
// come from deck-assets/horizon-deck-data.json, produced by the tool's own
// deterministic engines.
//
//   node scripts/make-horizon-deck.cjs
//
// ── WHY THE ICONS ARE BAKED ──────────────────────────────────────────────────
// This generator used to `require('sharp')` and `react-icons` at the top and
// rasterise each Lucide glyph on every run. Neither is a dependency of this
// project — they live in a scratch install — so the deck became un-regenerable
// the moment that install went away, which is exactly how a deck goes quietly
// stale. `scripts/make-deck-icons.mjs` had already solved this for the DFM deck
// and written down the reasoning; this now follows it.
//
// The PNGs live in deck-assets/horizon-icons.json, keyed `IconName|hexcolour`,
// and are committed. `ic()` reads that cache and only reaches for sharp when a
// key is MISSING — which is how the cache gets rebuilt when the icon set
// changes, and is the only time the scratch install is needed:
//
//   NODE_PATH=/tmp/node_modules node scripts/make-horizon-deck.cjs   (re-bake)
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

const ASSETS = path.join(__dirname, 'deck-assets');
const DATA = JSON.parse(fs.readFileSync(path.join(ASSETS, 'horizon-deck-data.json'), 'utf8'));
const ICON_CACHE_PATH = path.join(ASSETS, 'horizon-icons.json');

const INK = '0D1F33', NAVY2 = '15304F', MUT = '5B6B7F', GOLD = 'D97706', GOLDL = 'F59E0B',
  TEAL = '0D9488', VIOLET = '6D28D9', RED = 'B91C1C', LINE = 'D7E0EA', CARD = 'F2F6FB',
  GOLDT = 'FBF3E4', REDT = 'FCEFEE', TEALT = 'E9F6F4', VIOT = 'F1EDFB';
const W = 13.33, H = 7.5;

const iconCache = fs.existsSync(ICON_CACHE_PATH)
  ? JSON.parse(fs.readFileSync(ICON_CACHE_PATH, 'utf8'))
  : {};
let bakedNew = false;

async function ic(name, hex, px = 256) {
  const k = `${name}|${hex}`;
  if (iconCache[k]) return iconCache[k];
  // CACHE MISS — only reachable when the icon set changed. Rasterise once and
  // record it, so the next run (and every run on a clean checkout) is
  // dependency-free. The require is INSIDE the miss path on purpose: a normal
  // run must not need these packages to exist at all.
  let React, ReactDOMServer, sharp, Lu;
  try {
    React = require('react');
    ReactDOMServer = require('react-dom/server');
    sharp = require('sharp');
    Lu = require('react-icons/lu');
  } catch {
    throw new Error(
      `Icon "${k}" is not in ${path.relative(process.cwd(), ICON_CACHE_PATH)} and cannot be `
      + 'rasterised: react/react-dom/sharp/react-icons are not installed. Re-bake with '
      + '`NODE_PATH=/tmp/node_modules node scripts/make-horizon-deck.cjs`, then commit the JSON.',
    );
  }
  const C = Lu[name];
  if (!C) throw new Error(`missing icon ${name}`);
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(C, { color: `#${hex}`, size: px, strokeWidth: 1.9 }));
  const buf = await sharp(Buffer.from(svg)).resize(px, px).png().toBuffer();
  bakedNew = true;
  return (iconCache[k] = 'image/png;base64,' + buf.toString('base64'));
}

(async () => {
  const p = new pptxgen();
  p.layout = 'LAYOUT_WIDE';
  p.author = 'Avinash Bhosale';
  p.title = 'BrainSpark Horizon — Automotive Technology Foresight Engine';

  // ── helpers ────────────────────────────────────────────────────────────────
  function brackets(s, x, y, w, h, color = GOLDL, len = 0.15, wt = 1.5) {
    s.addShape('line', { x, y, w: len, h: 0, line: { color, width: wt } });
    s.addShape('line', { x, y, w: 0, h: len, line: { color, width: wt } });
    s.addShape('line', { x: x + w - len, y: y + h, w: len, h: 0, line: { color, width: wt } });
    s.addShape('line', { x: x + w, y: y + h - len, w: 0, h: len, line: { color, width: wt } });
  }
  function card(s, x, y, w, h, fill = 'FFFFFF', bracket = true) {
    s.addShape('roundRect', { x, y, w, h, rectRadius: 0.07, fill: { color: fill }, line: { color: LINE, width: 0.75 }, shadow: { type: 'outer', color: '9FB0C2', opacity: 0.3, blur: 7, offset: 2, angle: 90 } });
    if (bracket) brackets(s, x + 0.07, y + 0.07, w - 0.14, h - 0.14);
  }
  function horizonArt(s, yH, color = GOLDL, alpha = 55) {
    const cx = W / 2;
    for (let i = 0; i <= 12; i++) {
      const xTop = cx + (i - 6) * 0.55, xBot = cx + (i - 6) * 2.6;
      s.addShape('line', { x: Math.min(xTop, xBot), y: yH, w: Math.abs(xBot - xTop), h: H - yH, line: { color, width: 0.9, transparency: alpha }, flipH: xBot < xTop });
    }
    [0.14, 0.34, 0.62, 1.0, 1.5].forEach((d) => s.addShape('line', { x: 0, y: yH + d, w: W, h: 0, line: { color, width: 0.9, transparency: alpha + 10 } }));
    s.addShape('line', { x: 0, y: yH, w: W, h: 0, line: { color, width: 1.6, transparency: 22 } });
  }
  async function header(s, kicker, title) {
    s.addShape('roundRect', { x: 0.55, y: 0.38, w: kicker.length * 0.098 + 0.5, h: 0.36, rectRadius: 0.18, fill: { color: INK } });
    s.addText(kicker.toUpperCase(), { x: 0.55, y: 0.38, w: kicker.length * 0.098 + 0.5, h: 0.36, align: 'center', valign: 'middle', fontFace: 'Courier New', fontSize: 11, color: GOLDL, charSpacing: 2, bold: true, margin: 0 });
    s.addText(title, { x: 0.55, y: 0.82, w: 12.2, h: 0.62, fontFace: 'Arial', fontSize: 28, color: INK, bold: true, margin: 0 });
  }
  let slideNo = 0;
  const TOTAL = 17;
  function footer(s, dark = false) {
    slideNo += 1;
    const n = slideNo;
    s.addText([{ text: 'BrainSpark ', options: { color: dark ? '8FA1B5' : MUT, bold: true } }, { text: 'Horizon', options: { color: GOLDL, bold: true } }, { text: `  ·  Technology Foresight Engine  ·  ${n}/${TOTAL}`, options: { color: dark ? '64788D' : '93A3B5' } }], { x: 0.55, y: H - 0.4, w: 8, h: 0.28, fontFace: 'Courier New', fontSize: 9, margin: 0 });
  }
  async function dot(s, x, y, d, fill, iconName, iconFrac = 0.54) {
    s.addShape('ellipse', { x, y, w: d, h: d, fill: { color: fill } });
    const iw = d * iconFrac;
    s.addImage({ data: await ic(iconName, 'FFFFFF'), x: x + (d - iw) / 2, y: y + (d - iw) / 2, w: iw, h: iw });
  }

  // ═══ 1 · TITLE ═════════════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    // navy horizon band with gold grid — the app's signature, grounded
    s.addShape('rect', { x: 0, y: 5.05, w: W, h: H - 5.05, fill: { color: INK } });
    horizonArt(s, 5.55, GOLDL, 58);
    s.addText('Which technologies will reshape every commodity across ICE · MHEV · PHEV · BEV — and when.', { x: 0, y: 5.12, w: W, h: 0.35, align: 'center', fontFace: 'Arial', fontSize: 13.5, italic: true, color: 'E7EDF4' });
    s.addText('Avinash Bhosale   ·   Cost Engineering   ·   July 2026', { x: 0, y: 6.95, w: W, h: 0.3, align: 'center', fontFace: 'Courier New', fontSize: 10.5, color: '9FB2C6' });
    // orbit badge
    s.addShape('ellipse', { x: W / 2 - 0.92, y: 0.55, w: 1.84, h: 1.84, fill: { type: 'none' }, line: { color: TEAL, width: 1, dashType: 'dash', transparency: 35 } });
    s.addShape('ellipse', { x: W / 2 - 0.66, y: 0.81, w: 1.32, h: 1.32, fill: { color: INK } });
    s.addImage({ data: await ic('LuTelescope', GOLDL), x: W / 2 - 0.37, y: 1.1, w: 0.74, h: 0.74 });
    s.addShape('ellipse', { x: W / 2 + 0.8, y: 0.66, w: 0.1, h: 0.1, fill: { color: TEAL } });
    s.addText('PART OF THE BRAINSPARK AI COST-ENGINEERING PLATFORM', { x: 0, y: 2.68, w: W, h: 0.3, align: 'center', fontFace: 'Courier New', fontSize: 11.5, color: TEAL, charSpacing: 2.5, bold: true });
    s.addText([{ text: 'BrainSpark ', options: { color: INK } }, { text: 'Horizon', options: { color: GOLD } }], { x: 0, y: 3.0, w: W, h: 0.95, align: 'center', fontFace: 'Arial', fontSize: 54, bold: true });
    s.addText('Automotive Technology Foresight Engine', { x: 0, y: 3.98, w: W, h: 0.45, align: 'center', fontFace: 'Arial', fontSize: 20, color: MUT, bold: true });
    s.addNotes('Good morning everyone. Thank you for the time. Let me start with a question we all quietly carry: when we source a part today, how confident are we about what that part will look like in five years? [pause] What I want to show you today is our answer to that question — BrainSpark Horizon, a technology foresight engine we have built into our own platform. I will keep this to about ten minutes: what it is, why it is genuinely not just another AI chatbot, what is actually inside it, and then a live example on the BEV HV battery. And at the end, I would love to just show it to you running.');
  }

  // ═══ 2 · CONTEXT & AGENDA ══════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    // navy half-panel
    s.addShape('rect', { x: 0, y: 0, w: 5.7, h: H, fill: { color: INK } });
    brackets(s, 0.5, 0.5, 4.75, 6.5, GOLDL);
    s.addImage({ data: await ic('LuOrbit', GOLDL), x: 0.85, y: 0.85, w: 0.5, h: 0.5 });
    s.addText('Where Horizon sits', { x: 0.85, y: 1.5, w: 4.2, h: 0.45, fontFace: 'Arial', fontSize: 24, bold: true, color: 'FFFFFF', margin: 0 });
    const ctx = [
      ['22 AI tools, one platform', 'BrainSpark already generates cost ideas, should-costs parts, reads CAD and PCBs, measures manufacturability, and tracks savings to realisation.'],
      ['One governing rule', 'Math for numbers, AI for judgment. Every figure comes from a deterministic engine — the AI proposes and explains, it never invents a number.'],
      ['Horizon: the newest module', 'Extends the platform from "what does this part cost today?" to "what will this part BECOME — and when?"'],
    ];
    ctx.forEach(([t, b], i) => {
      const y = 2.2 + i * 1.28;
      s.addShape('ellipse', { x: 0.85, y: y + 0.02, w: 0.14, h: 0.14, fill: { color: GOLDL } });
      s.addText(t, { x: 1.15, y: y - 0.08, w: 4.0, h: 0.32, fontFace: 'Arial', fontSize: 14.5, bold: true, color: 'FFFFFF', margin: 0 });
      s.addText(b, { x: 1.15, y: y + 0.22, w: 4.0, h: 0.9, fontFace: 'Arial', fontSize: 10.5, color: 'B9C6D6', margin: 0 });
    });
    s.addText(`${DATA.registerSize} technologies · 9 commodities · 4 powertrains · audited 07/2026`, { x: 0.85, y: 6.35, w: 4.3, h: 0.5, fontFace: 'Courier New', fontSize: 10.5, color: GOLDL, bold: true, margin: 0 });
    // agenda right
    s.addText('Agenda', { x: 6.3, y: 0.62, w: 5, h: 0.5, fontFace: 'Arial', fontSize: 28, bold: true, color: INK, margin: 0 });
    const agenda = ['Why a foresight tool — the gap it closes', 'How the engine works (and why it can be trusted)', 'Not a typical AI chat — the difference', '360° coverage · three segment lenses', 'Regulatory radar & competitor benchmarks', 'Live example: BEV HV battery', 'Business value · evidence · road ahead'];
    agenda.forEach((a, i) => {
      const y = 1.45 + i * 0.82;
      s.addShape('roundRect', { x: 6.3, y, w: 0.52, h: 0.52, rectRadius: 0.1, fill: { color: i === 5 ? GOLDL : INK } });
      s.addText(String(i + 1).padStart(2, '0'), { x: 6.3, y, w: 0.52, h: 0.52, align: 'center', valign: 'middle', fontFace: 'Courier New', fontSize: 13, bold: true, color: i === 5 ? INK : 'FFFFFF', margin: 0 });
      s.addText(a, { x: 7.05, y: y + 0.09, w: 5.7, h: 0.38, fontFace: 'Arial', fontSize: 14, color: INK, bold: i === 5, margin: 0 });
    });
    footer(s);
    s.addNotes('Quick bit of context before we dive in. Horizon is not a side project — it is the newest module of BrainSpark, the platform we already use every day for cost ideas and should-costing. And it inherits the one rule that platform lives by: math for numbers, AI for judgment. Every figure you will see today came out of a calculation, not out of a language model. [gesture to agenda] Here is where we are going — seven stops, and the one I am most excited about is number six, where I will show you a live prediction on the BEV battery. Let us get into it.');
  }

  // ═══ 3 · THE GAP ═══════════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Why this tool', 'We make 7-year decisions on today’s technology assumptions');
    const rows = [
      ['LuFactory', INK, 'Sourcing outlives technology', 'A platform sourced in 2026 runs to 2033+. The cells, motors, brakes and software underneath it will shift two or three times in that window — and the cost base shifts with them.'],
      ['LuCircleX', RED, 'Today’s answers don’t fit engineering', 'Analyst subscriptions are expensive and stop at market level. Consulting studies take weeks. Chatbots answer instantly — with confident, invented numbers nobody can audit.'],
      ['LuSearchCheck', TEAL, 'What we actually need', 'Part-level, self-serve foresight: for THIS commodity — what replaces it, when does it cross 25% adoption, what does its cost curve do, which regulation forces it, who is ahead.'],
    ];
    for (let i = 0; i < rows.length; i++) {
      const [ik, col, t, b] = rows[i], y = 1.75 + i * 1.5;
      await dot(s, 0.55, y, 0.62, col, ik);
      s.addText(t, { x: 1.35, y: y - 0.02, w: 6.6, h: 0.32, fontFace: 'Arial', fontSize: 15.5, bold: true, color: INK, margin: 0 });
      s.addText(b, { x: 1.35, y: y + 0.3, w: 6.6, h: 1.05, fontFace: 'Arial', fontSize: 11.5, color: MUT, margin: 0 });
    }
    // stat tile stack
    const tiles = [[INK, '7 yr', 'sourcing & platform horizon'], [GOLDL, '2-3×', 'technology turns inside that window'], [TEAL, '~30 s', 'to a Horizon foresight answer']];
    tiles.forEach(([c, n, l], i) => {
      const y = 1.75 + i * 1.5;
      s.addShape('roundRect', { x: 8.55, y, w: 4.25, h: 1.3, rectRadius: 0.09, fill: { color: c }, shadow: { type: 'outer', color: '9FB0C2', opacity: 0.35, blur: 7, offset: 2, angle: 90 } });
      s.addText(n, { x: 8.85, y: y + 0.18, w: 1.9, h: 0.95, fontFace: 'Arial', fontSize: 36, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
      s.addText(l, { x: 10.75, y: y + 0.18, w: 1.95, h: 0.95, fontFace: 'Arial', fontSize: 11.5, color: c === GOLDL ? '4A2E05' : 'D5DEE9', margin: 0, valign: 'middle' });
    });
    s.addText('Horizon closes the gap: consulting-grade foresight, engineering-grade numbers, on demand.', { x: 0.55, y: 6.5, w: 12.2, h: 0.4, align: 'center', fontFace: 'Arial', fontSize: 14, bold: true, italic: true, color: GOLD });
    footer(s);
    s.addNotes('So why did we build this? Here is the uncomfortable truth in one line: our decisions outlive the technologies they assume. A platform we source this year runs into the mid-2030s — and the cells, the motors, even the brake discs underneath it will turn over two or three times before it retires. [point to middle row] And look at what we currently reach for when we ask "what comes next": analyst subscriptions that stop at market level. Consulting studies that take six weeks. Or — let us be honest, we have all tried it — asking a chatbot, and getting a very confident answer with numbers that were invented on the spot. [point to tiles] Seven-year decisions. Two to three technology turns inside them. And on the right — that is what Horizon changes: about thirty seconds to an answer we can actually defend.');
  }

  // ═══ 4 · HOW THE ENGINE WORKS ═════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'The engine', 'Four stages — and numbers never come from the AI');
    const stages = [
      [INK, 'LuDatabase', '1 · Curated register', [`${DATA.registerSize} technologies, every one with automotive TRL 1-9, current adoption share, named production evidence, players, cost trend`, 'Plus 14 dated regulations & 12 benchmark vehicles']],
      [TEAL, 'LuCalculator', '2 · Deterministic cores', ['S-curve phase · Bass diffusion adoption paths · Wright’s-law cost index · momentum 0-100 · horizon lanes', '25% / 50% crossing years — pure mathematics, repeatable']],
      [GOLDL, 'LuShieldCheck', '3 · Honesty layer', ['Committed / probable / speculative tiers · "modelled, not measured" labels', 'Regulations carry legal status · niche techs get adoption ceilings · crossing years get uncertainty bands']],
      [VIOLET, 'LuBrainCircuit', '4 · Grounded AI on top', ['Analyst briefing, expert panel, deep research — grounded in the cards the engine computed', 'Research findings must cite retrieved sources or they are dropped in code']],
    ];
    for (let i = 0; i < 4; i++) {
      const [col, ik, t, [b1, b2]] = stages[i], x = 0.55 + i * 3.28;
      card(s, x, 1.7, 2.95, 4.35, 'FFFFFF', false);
      s.addShape('roundRect', { x, y: 1.7, w: 2.95, h: 0.95, rectRadius: 0.07, fill: { color: col } });
      await dot(s, x + 0.16, 1.86, 0.6, col, ik, 0.6);
      s.addText(t, { x: x + 0.85, y: 1.7, w: 2.05, h: 0.95, valign: 'middle', fontFace: 'Arial', fontSize: 13.5, bold: true, color: 'FFFFFF', margin: 0 });
      s.addText(b1, { x: x + 0.2, y: 2.85, w: 2.6, h: 1.6, fontFace: 'Arial', fontSize: 10.5, color: INK, margin: 0 });
      s.addText(b2, { x: x + 0.2, y: 4.55, w: 2.6, h: 1.3, fontFace: 'Arial', fontSize: 10, color: MUT, margin: 0 });
      if (i < 3) s.addShape('rightArrow', { x: x + 2.98, y: 3.62, w: 0.3, h: 0.28, fill: { color: GOLDL } });
    }
    s.addText('"The AI narrates — it never invents a number."', { x: 0.55, y: 6.35, w: 12.2, h: 0.42, align: 'center', fontFace: 'Arial', fontSize: 16, italic: true, bold: true, color: TEAL });
    footer(s);
    s.addNotes('Let me walk you through how it actually works — four stages, left to right. Stage one is the foundation: a curated register. A hundred and thirty-nine technologies, and every single one carries a readiness level, a real adoption share, and — this is the important bit — named production evidence. Not "solid state is coming", but which vehicle, which year. Stage two: the mathematics. Diffusion curves, learning curves — deterministic, so the same question gives the same answer every time. Stage three, and this is the part I am genuinely proud of: an honesty layer. The tool labels its own confidence, checks whether a regulation is actual law, and puts uncertainty bands on every date. And only then, stage four: AI writes the narrative on top — and if it cannot cite a source, the claim is deleted automatically. [pause] If you take one sentence away from today, make it this one: the AI narrates — it never invents a number.');
  }

  // ═══ 5 · UNDER THE HOOD (models + workflow) ═══════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Under the hood', 'The models, the techniques, and the exact workflow');
    // left: models & techniques
    card(s, 0.55, 1.62, 6.1, 5.0, 'FFFFFF', false);
    s.addShape('roundRect', { x: 0.55, y: 1.62, w: 6.1, h: 0.5, rectRadius: 0.07, fill: { color: INK } });
    s.addText('MODELS & TECHNIQUES', { x: 0.8, y: 1.62, w: 5.6, h: 0.5, valign: 'middle', fontFace: 'Courier New', fontSize: 11, bold: true, color: GOLDL, charSpacing: 1.5, margin: 0 });
    const models = [
      [TEAL, 'Automotive TRL 1-9', 'APC-style readiness grading — where each tech stands in productionisation today'],
      [TEAL, 'Logistic S-curve', 'positions every tech: research → demonstration → take-off → growth → mainstream'],
      [GOLDL, 'Bass diffusion model', 'adoption forecasting (p=0.03, q=0.38) with per-tech segment ceilings; 25%/50% crossing years with q±25% uncertainty bands'],
      [GOLDL, 'Wright’s law', 'experience-curve cost index — 3-22% cost reduction per volume doubling, mapped from each tech’s cost trend'],
      [INK, 'Momentum composite 0-100', 'maturity + adoption + cost trajectory + drivers + regulation + production evidence'],
      [VIOLET, 'Retrieval & grounding', 'PatentsView patent-velocity API, live web retrieval; LLM output is schema-forced JSON and cite-or-drop'],
      [INK, 'Tetlock-style scoring', 'Prediction Ledger snapshots forecasts; re-curation computes mean absolute error'],
    ];
    models.forEach(([c, t, b], i) => {
      const y = 2.28 + i * 0.615;
      s.addShape('ellipse', { x: 0.82, y: y + 0.05, w: 0.12, h: 0.12, fill: { color: c } });
      s.addText([{ text: t + ' — ', options: { bold: true, color: INK } }, { text: b, options: { color: MUT } }], { x: 1.08, y, w: 5.4, h: 0.6, fontFace: 'Arial', fontSize: 9.8, margin: 0 });
    });
    // right: workflow
    card(s, 7.0, 1.62, 5.78, 5.0, CARD, false);
    s.addShape('roundRect', { x: 7.0, y: 1.62, w: 5.78, h: 0.5, rectRadius: 0.07, fill: { color: TEAL } });
    s.addText('THE WORKFLOW — END TO END', { x: 7.25, y: 1.62, w: 5.3, h: 0.5, valign: 'middle', fontFace: 'Courier New', fontSize: 11, bold: true, color: 'FFFFFF', charSpacing: 1.5, margin: 0 });
    const flow = [
      ['Query in', 'part name / commodity / powertrain / segment lens — "brake disc", "EDU stator", Off-Road'],
      ['Register match', `search-term + commodity-classifier resolution against the ${DATA.registerSize} curated technologies`],
      ['Cores compute', 'S-curve phase · horizon lane · Bass adoption paths · Wright cost index · momentum · crossing years'],
      ['Honesty gates', 'confidence tiers · only real law pulls a lane · ceilings cap niche techs · bands on every date'],
      ['Evidence (optional)', 'patent-velocity trend · cite-or-drop deep research · 3-persona expert panel'],
      ['Outputs', 'horizon-lane view · Foresight Report PDF · Prediction Ledger snapshot'],
      ['Learning loop', 'quarterly re-curation → ledger scores the old forecasts → register improves'],
    ];
    flow.forEach(([t, b], i) => {
      const y = 2.3 + i * 0.595;
      s.addShape('roundRect', { x: 7.25, y, w: 0.4, h: 0.4, rectRadius: 0.08, fill: { color: i === 6 ? GOLDL : INK } });
      s.addText(String(i + 1), { x: 7.25, y, w: 0.4, h: 0.4, align: 'center', valign: 'middle', fontFace: 'Courier New', fontSize: 12, bold: true, color: i === 6 ? INK : 'FFFFFF', margin: 0 });
      if (i < 6) s.addShape('line', { x: 7.45, y: y + 0.42, w: 0, h: 0.16, line: { color: '9FB0C2', width: 1.2 } });
      s.addText([{ text: t + '  ', options: { bold: true, color: INK } }, { text: b, options: { color: MUT } }], { x: 7.8, y: y - 0.01, w: 4.85, h: 0.58, fontFace: 'Arial', fontSize: 9.8, margin: 0 });
    });
    s.addText('Stack: deterministic JavaScript engines · curated evidence register · SQLite ledger · Claude LLM (schema-forced, grounded) · PatentsView + web retrieval · React UI — locked by 758 CI tests.', { x: 0.55, y: 6.78, w: 12.2, h: 0.35, align: 'center', fontFace: 'Courier New', fontSize: 9.5, color: MUT });
    footer(s);
    s.addNotes('People sometimes ask me — so what is actually inside this thing? Fair question, and I want to be completely open about it. On the left, the models. These are not exotic: TRL grading, S-curves, the Bass diffusion model, Wright’s law — these are the same techniques the forecasting textbooks and the big analyst houses use. What is different is that we have implemented them as software, wired them to a curated evidence register, and put honesty gates around them. On the right, the workflow, step by step: you type a part name… the register matches it… the maths computes the projections… the honesty gates apply… then, only if you want it, the AI layers add evidence and critique… and everything lands in the lanes view, the PDF, and the ledger. And step seven is my favourite — the loop closes: every quarter we re-curate, and the tool scores its own old forecasts. Nothing here is a black box.');
  }

  // ═══ 6 · NOT A TYPICAL AI CHATBOT ═════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'The difference', 'This is not "ask an AI and hope"');
    card(s, 0.55, 1.6, 5.9, 4.6, REDT, false);
    s.addShape('roundRect', { x: 0.85, y: 1.85, w: 2.9, h: 0.42, rectRadius: 0.21, fill: { color: RED } });
    s.addText('TYPICAL AI CHAT / SEARCH', { x: 0.85, y: 1.85, w: 2.9, h: 0.42, align: 'center', valign: 'middle', fontFace: 'Courier New', fontSize: 10, bold: true, color: 'FFFFFF', charSpacing: 1, margin: 0 });
    const bad = [['Plausible prose, invented numbers', 'Adoption figures and dates hallucinated on the spot'], ['No evidence trail', 'You cannot audit where any claim came from'], ['Different answer every run', 'Nothing to track, score, or hold accountable'], ['Generic', 'No automotive TRL, no regulation dates, no segment context']];
    for (let i = 0; i < bad.length; i++) {
      const y = 2.5 + i * 0.9;
      s.addImage({ data: await ic('LuCircleX', RED), x: 0.9, y: y + 0.02, w: 0.3, h: 0.3 });
      s.addText(bad[i][0], { x: 1.35, y: y - 0.04, w: 4.9, h: 0.3, fontFace: 'Arial', fontSize: 13, bold: true, color: INK, margin: 0 });
      s.addText(bad[i][1], { x: 1.35, y: y + 0.24, w: 4.9, h: 0.35, fontFace: 'Arial', fontSize: 10.5, color: MUT, margin: 0 });
    }
    card(s, 6.85, 1.6, 5.9, 4.6, GOLDT, false);
    s.addShape('roundRect', { x: 7.15, y: 1.85, w: 3.3, h: 0.42, rectRadius: 0.21, fill: { color: GOLD } });
    s.addText('HORIZON FORESIGHT ENGINE', { x: 7.15, y: 1.85, w: 3.3, h: 0.42, align: 'center', valign: 'middle', fontFace: 'Courier New', fontSize: 10, bold: true, color: 'FFFFFF', charSpacing: 1, margin: 0 });
    const good = [['Curated register, not model recall', `${DATA.registerSize} technologies with TRL, adoption, production evidence`], ['Numbers from math, not language', 'Bass, Wright, S-curve — deterministic, same answer every time'], ['Honesty built in', 'Confidence tiers · legal status on regulations · "modelled" labels · uncertainty bands'], ['AI grounded, enforced in code', 'Briefings & research must cite retrieved sources — or are dropped'], ['It keeps score on itself', 'The Prediction Ledger revisits and scores past forecasts']];
    for (let i = 0; i < good.length; i++) {
      const y = 2.45 + i * 0.73;
      s.addImage({ data: await ic('LuCircleCheck', TEAL), x: 7.2, y: y + 0.02, w: 0.3, h: 0.3 });
      s.addText(good[i][0], { x: 7.65, y: y - 0.04, w: 4.95, h: 0.3, fontFace: 'Arial', fontSize: 13, bold: true, color: INK, margin: 0 });
      s.addText(good[i][1], { x: 7.65, y: y + 0.24, w: 4.95, h: 0.35, fontFace: 'Arial', fontSize: 10.5, color: MUT, margin: 0 });
    }
    s.addText('Same question, every quarter → comparable, scoreable answers. That is an instrument, not a chatbot.', { x: 0.55, y: 6.45, w: 12.2, h: 0.4, align: 'center', fontFace: 'Arial', fontSize: 14, italic: true, bold: true, color: INK });
    footer(s);
    s.addNotes('Now — I know what some of you may be thinking: "is this not just ChatGPT with our logo on it?" [smile] Fair challenge. This slide is my answer. On the left, what you get from a generic AI: beautifully written prose… with numbers it made up, no way to audit where anything came from, and a different answer every time you ask. On the right, Horizon: the numbers come from a curated register and deterministic math; every claim is labelled with how confident we should be; the AI is forced — in code, not in a prompt — to cite its sources or lose the claim; and the tool keeps score on its own past predictions. [pause, point to bottom line] But here is the practical difference for us: ask Horizon the same question every quarter and you get comparable, scoreable answers. That is what makes it an instrument, not a chatbot.');
  }

  // ═══ 6 · 360° COVERAGE ════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, '360° view', 'The whole vehicle, the whole future');
    const stats = [
      [String(DATA.registerSize), 'curated technologies', INK], ['9', 'commodities — battery to BIW', TEAL],
      ['4', 'powertrains ICE·MHEV·PHEV·BEV', GOLDL], ['3', 'lenses Off-Road · Luxury · SDV', VIOLET],
      [String(DATA.anchorCount), 'dated regulatory anchors', TEAL], [String(DATA.benchmarkCount), 'benchmark vehicles', INK],
    ];
    stats.forEach(([n, l, c], i) => {
      const x = 0.55 + (i % 2) * 2.66, y = 1.7 + Math.floor(i / 2) * 1.58;
      s.addShape('roundRect', { x, y, w: 2.48, h: 1.4, rectRadius: 0.09, fill: { color: c }, shadow: { type: 'outer', color: '9FB0C2', opacity: 0.32, blur: 6, offset: 2, angle: 90 } });
      s.addText(n, { x: x + 0.18, y: y + 0.1, w: 2.1, h: 0.66, fontFace: 'Arial', fontSize: 33, bold: true, color: 'FFFFFF', margin: 0 });
      s.addText(l, { x: x + 0.18, y: y + 0.78, w: 2.16, h: 0.55, fontFace: 'Arial', fontSize: 10.5, color: c === GOLDL ? '4A2E05' : 'D5DEE9', margin: 0 });
    });
    s.addText('Technologies per commodity — generated from the live register', { x: 6.35, y: 1.66, w: 6.4, h: 0.3, fontFace: 'Arial', fontSize: 13, bold: true, color: INK, margin: 0 });
    const cats = Object.keys(DATA.byCommodity);
    s.addChart('bar', [{ name: 'Technologies', labels: cats, values: cats.map((k) => DATA.byCommodity[k]) }], {
      x: 6.3, y: 2.0, w: 6.45, h: 4.4, barDir: 'bar', chartColors: [GOLDL], showLegend: false, showTitle: false,
      showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: INK, dataLabelFontSize: 10, dataLabelFontFace: 'Courier New',
      catAxisLabelColor: INK, catAxisLabelFontSize: 10.5, catAxisLabelFontFace: 'Arial',
      valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, valAxisMaxVal: 32, barGapWidthPct: 50,
    });
    s.addText('Hardware to software: cells, motors, brakes and BIW — through zonal E/E, ADAS stacks, vehicle OS and feature subscriptions.', { x: 0.55, y: 6.55, w: 12.2, h: 0.4, fontFace: 'Arial', fontSize: 11.5, italic: true, color: MUT });
    footer(s);
    s.addNotes('You asked me once whether this covers everything — so let me show you the numbers. [point to tiles] A hundred and thirty-nine technologies. All nine commodities — from battery cells to body-in-white. All four powertrains. Three dedicated lenses, fourteen dated regulations, twelve benchmark vehicles. [point to chart] And a small detail I like: this bar chart was not drawn by anyone — the deck generated it from the live register the moment it was built. If the register changes, the chart changes. One more thing worth saying out loud: the coverage is not just hardware. The software half of the vehicle — the E/E architecture, ADAS, the vehicle OS — is covered just as deeply. That is where half the future cost sits.');
  }

  // ═══ 7 · THREE LENSES ═════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Segment lenses', 'One click focuses the register on OUR battleground');
    const L = [
      [TEAL, TEALT, 'LuMountain', 'Off-Road Features & Tech', DATA.lenses.offroad.count, DATA.lenses.offroad.examples, 'Plus the 12-vehicle benchmark strip — Defender OCTA to Yangwang U8'],
      [VIOLET, VIOT, 'LuGem', 'Luxury / Premium SUV', DATA.lenses.luxury.count, DATA.lenses.luxury.examples, 'The comfort & craft arms race, tracked with evidence'],
      [INK, CARD, 'LuCpu', 'SDV / ADAS & Software', DATA.lenses.software.count, DATA.lenses.software.examples, 'The software-defined half of the vehicle, end to end'],
    ];
    for (let i = 0; i < 3; i++) {
      const [col, tint, ik, t, n, ex, note] = L[i], x = 0.55 + i * 4.28;
      card(s, x, 1.65, 3.98, 4.7, tint, false);
      s.addShape('roundRect', { x, y: 1.65, w: 3.98, h: 0.88, rectRadius: 0.07, fill: { color: col } });
      await dot(s, x + 0.18, 1.79, 0.6, col, ik, 0.62);
      s.addText(t, { x: x + 0.88, y: 1.65, w: 3.0, h: 0.88, valign: 'middle', fontFace: 'Arial', fontSize: 14.5, bold: true, color: 'FFFFFF', margin: 0 });
      s.addText([{ text: String(n), options: { fontSize: 26, bold: true, color: col } }, { text: '  technologies in the lens', options: { fontSize: 11, color: MUT } }], { x: x + 0.25, y: 2.68, w: 3.5, h: 0.45, fontFace: 'Arial', margin: 0 });
      ex.slice(0, 5).forEach((e, j) => {
        s.addShape('ellipse', { x: x + 0.28, y: 3.3 + j * 0.5 + 0.08, w: 0.1, h: 0.1, fill: { color: col } });
        s.addText(e, { x: x + 0.5, y: 3.3 + j * 0.5, w: 3.35, h: 0.42, fontFace: 'Arial', fontSize: 10.5, color: INK, margin: 0 });
      });
      s.addText(note, { x: x + 0.25, y: 5.82, w: 3.5, h: 0.5, fontFace: 'Arial', fontSize: 9.5, italic: true, color: MUT, margin: 0 });
    }
    footer(s);
    s.addNotes('Now, this is the part built specifically for us. Three lenses — one click each. [point left] The Off-Road lens is our home turf: hydraulic interlinked suspension — the Defender OCTA technology — electronic lockers, deep wading, the quad-motor tank-turn party tricks the Chinese brands are shipping. And when this lens is on, the tool automatically shows the twelve benchmark vehicles alongside. [point middle] The Luxury lens tracks the comfort arms race — predictive suspension, executive seating, cabin purification. [point right] And the SDV lens — twenty-four technologies covering the software-defined vehicle, because our competitors are increasingly software companies. One register, three ways to look at OUR battleground.');
  }

  // ═══ 8 · REGULATORY RADAR ═════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Regulatory radar', 'Dated obligations — with their LEGAL status, not just their headline');
    const SC = { 'in-force': TEAL, adopted: GOLDL, proposed: '94A3B8', 'under-revision': RED };
    const SL = { 'in-force': 'IN FORCE', adopted: 'ADOPTED', proposed: 'PROPOSED', 'under-revision': 'UNDER REVISION' };
    const picks = DATA.anchors.filter((a) => ['EU General Safety Regulation 2', 'EU CBAM definitive regime', 'China GB 38031-2025 battery safety', 'Euro 7 (M1)', 'EU Battery Regulation — digital passport', 'US EPA MY2027-2032 standards', 'EU PFAS restriction (REACH)', 'EU CO2 fleet targets −55%', 'EU Battery Regulation — recycled content', 'EU ELV Regulation recast', 'EU 100% zero-emission new cars'].includes(a.name));
    // timeline spine
    s.addShape('line', { x: 0.8, y: 4.0, w: 11.7, h: 0, line: { color: INK, width: 2 } });
    const y0 = 2024, y1 = 2035;
    picks.forEach((a, i) => {
      const x = 0.8 + ((a.year - y0) / (y1 - y0)) * 11.7;
      const up = i % 2 === 0;
      s.addShape('ellipse', { x: x - 0.09, y: 3.91, w: 0.18, h: 0.18, fill: { color: SC[a.status] } });
      s.addShape('line', { x, y: up ? 2.98 : 4.09, w: 0, h: 0.93, line: { color: 'C3CEDA', width: 1 } });
      const by = up ? 2.06 : 4.6;
      const cl = (cx2, w2) => Math.min(Math.max(cx2 - w2 / 2, 0.3), W - 0.3 - w2);
      s.addText(String(a.year), { x: cl(x, 1.7), y: by, w: 1.7, h: 0.28, align: 'center', fontFace: 'Courier New', fontSize: 12, bold: true, color: INK, margin: 0 });
      s.addText(a.name.replace('EU Battery Regulation — ', 'Battery Reg: ').replace('EU ', '').replace('China ', ''), { x: cl(x, 2.1), y: by + 0.26, w: 2.1, h: 0.5, align: 'center', fontFace: 'Arial', fontSize: 9, color: MUT, margin: 0 });
      s.addShape('roundRect', { x: cl(x, 1.24), y: by + 0.72, w: 1.24, h: 0.24, rectRadius: 0.12, fill: { color: SC[a.status] } });
      s.addText(SL[a.status], { x: cl(x, 1.24), y: by + 0.72, w: 1.24, h: 0.24, align: 'center', valign: 'middle', fontFace: 'Courier New', fontSize: 7.5, bold: true, color: a.status === 'adopted' ? '4A2E05' : 'FFFFFF', margin: 0 });
    });
    s.addText([
      { text: 'Why status matters:  ', options: { bold: true, color: INK } },
      { text: 'only in-force or adopted law can pull a technology’s horizon forward. Proposals are context — the audit caught the ELV recast being treated as committed with the wrong date (25% recycled plastic is ≈2036, not 2031), and US EPA standards are treated as a WEAKENING anchor. The tool now makes that class of mistake impossible.', options: { color: MUT } },
    ], { x: 0.55, y: 6.0, w: 12.2, h: 0.95, fontFace: 'Arial', fontSize: 11.5, margin: 0 });
    footer(s);
    s.addNotes('Regulation is where foresight tools usually embarrass themselves — so let me show you how we handle it. Every anchor on this timeline is dated AND carries its legal status. Teal means in force today. Gold means adopted law with a future date. Grey means still a proposal — and here is the rule: a proposal is context, it is never allowed to move a prediction. Red means under revision — the US EPA standards are actively being rolled back, so the tool treats them as a weakening signal, not a driver. [pause] And I will share something honestly, because I think it builds more trust than hiding it: when we audited this tool, we caught it treating the ELV recast as committed law with the wrong date. We fixed it, we locked the fix into the test suite — and that mistake is now structurally impossible. That is the level of rigour behind this timeline.');
  }

  // ═══ 9 · BENCHMARKS ═══════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Benchmarks', 'Who sets the bar in premium off-road — and what to watch');
    const rows = [[
      { text: 'Vehicle', options: { bold: true, color: 'FFFFFF', fontFace: 'Arial', fontSize: 11.5, fill: { color: INK } } },
      { text: 'Signature technology (in production)', options: { bold: true, color: 'FFFFFF', fontFace: 'Arial', fontSize: 11.5, fill: { color: INK } } },
      { text: 'What to watch next', options: { bold: true, color: 'FFFFFF', fontFace: 'Arial', fontSize: 11.5, fill: { color: INK } } },
    ]];
    const chosen = ['Range Rover', 'Defender OCTA', 'G 580 with EQ Technology', 'Yangwang U8', 'R1S Gen2 Quad', 'Escalade IQ'];
    DATA.benchmarks.filter((b) => chosen.includes(b.v)).forEach((b, i) => {
      const tint = i % 2 ? 'FFFFFF' : CARD;
      rows.push([
        { text: `${b.v}\n${b.brand} · ${b.year}`, options: { color: INK, bold: true, fontFace: 'Arial', fontSize: 10.5, fill: { color: tint } } },
        { text: b.sig, options: { color: INK, fontFace: 'Arial', fontSize: 10.5, fill: { color: tint } } },
        { text: b.watch, options: { color: MUT, fontFace: 'Arial', fontSize: 10, italic: true, fill: { color: tint } } },
      ]);
    });
    s.addTable(rows, { x: 0.55, y: 1.7, w: 12.23, colW: [3.0, 4.9, 4.33], border: { type: 'solid', color: LINE, pt: 0.5 }, rowH: 0.62, valign: 'middle', margin: 0.08 });
    s.addText('+6 more in the register: Hummer EV · Lexus GX Overtrail · Cullinan II · Bentayga · AITO M9 · Land Cruiser 250 — shown automatically whenever the Off-Road or Luxury lens is active.', { x: 0.55, y: 6.45, w: 12.2, h: 0.5, fontFace: 'Arial', fontSize: 11, italic: true, color: MUT });
    footer(s);
    s.addNotes('Here is who is setting the bar in our segment — as curated evidence, not opinion. Our own flagships at the top, and rightly so. Then look at the electric G-Wagen: four motors, a real two-speed low range on each one, and virtual diff locks — Mercedes is betting software can replace the mechanical locker. And then — [pause] — the one I show everyone: the Yangwang U8. Hydraulic body control, a tank turn, and an emergency float mode. It floats. For thirty minutes. [let that land] Whether we admire it or not, that is the pressure coming into our segment, and each row here carries a "what to watch next" — the announced move, not speculation. In the tool, this table appears automatically the moment our segment lens is switched on.');
  }

  // ═══ 10 · CAPABILITIES ════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Capabilities', 'What a single query returns');
    const rows = [
      ['LuCompass', TEAL, 'Three horizon lanes', 'Adopt/quote now (–2028) · plan the transition (2029-32) · track, don’t commit (2033+). Law can pull a lane forward — proposals cannot.'],
      ['LuTrendingUp', GOLDL, 'Adoption & cost trajectories', 'Bass-diffusion adoption and Wright’s-law cost index at +3/+5/+8 years — labelled "modelled, not measured".'],
      ['LuGauge', INK, 'Crossing years, with honesty', 'When a tech crosses 25%/50% of its segment — with an uncertainty band: ≈2032 (2031–2034). Niche techs honestly "never cross".'],
      ['LuRadar', VIOLET, 'Momentum & confidence', '0-100 momentum from maturity, adoption, cost trend, drivers, regulation and evidence; committed / probable / speculative on every card.'],
      ['LuDatabase', TEAL, 'Evidence on demand', 'US patent-filing velocity per technology (accelerating / steady / declining — computed, not opined) plus cite-or-drop AI deep research.'],
      ['LuFileText', GOLDL, 'Boardroom outputs', 'Expert-panel critique, Prediction Ledger snapshots, and a branded multi-page Foresight Report PDF — one click each.'],
    ];
    for (let i = 0; i < rows.length; i++) {
      const [ik, col, t, b] = rows[i], x = 0.55 + (i % 2) * 6.25, y = 1.7 + Math.floor(i / 2) * 1.58;
      card(s, x, y, 5.95, 1.4, i % 2 ? 'FFFFFF' : CARD, false);
      await dot(s, x + 0.2, y + 0.24, 0.58, col, ik);
      s.addText(t, { x: x + 0.95, y: y + 0.12, w: 4.85, h: 0.3, fontFace: 'Arial', fontSize: 13.5, bold: true, color: INK, margin: 0 });
      s.addText(b, { x: x + 0.95, y: y + 0.42, w: 4.85, h: 0.92, fontFace: 'Arial', fontSize: 10.5, color: MUT, margin: 0 });
    }
    footer(s);
    s.addNotes('So what do you actually get back from one query? Six things. The horizon lanes tell you WHEN to care — act now, plan for it, or just watch. The trajectories put actual numbers on adoption and cost, three, five and eight years out. The crossing years tell you when a technology hits a quarter or half its market — and notice, always with a band around the date, because anyone who gives you a single year for the future is selling false precision. Momentum ranks what deserves attention; confidence tiers tell you how firm each call is. And then the two at the bottom are things no chatbot will ever give you: computed patent evidence and cited research… and one-click outputs — a critique panel, a self-scoring ledger, and a PDF report you could hand straight to a board.');
  }

  // ═══ 11 · BEV EXAMPLE ═════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Live example', 'One query: "BEV HV battery"');
    s.addShape('roundRect', { x: 10.1, y: 0.45, w: 2.68, h: 0.85, rectRadius: 0.09, fill: { color: INK } });
    s.addText([{ text: `${DATA.bev.count} `, options: { fontSize: 26, bold: true, color: GOLDL } }, { text: 'technologies\nmapped instantly', options: { fontSize: 10, color: 'D5DEE9' } }], { x: 10.3, y: 0.45, w: 2.4, h: 0.85, valign: 'middle', fontFace: 'Arial', margin: 0 });
    s.addText('Modelled adoption paths — % of applicable segment (computed by the engine)', { x: 0.55, y: 1.52, w: 8, h: 0.3, fontFace: 'Arial', fontSize: 12.5, bold: true, color: INK, margin: 0 });
    const palette = [GOLDL, TEAL, VIOLET, '2563EB', '9CA3AF'];
    s.addChart('line', Object.keys(DATA.bev.adoption).map((n) => ({ name: n, labels: DATA.bev.years.map(String), values: DATA.bev.adoption[n] })), {
      x: 0.5, y: 1.85, w: 7.9, h: 4.45, chartColors: palette, lineSize: 2.5, lineSmooth: true, lineDataSymbol: 'none',
      showLegend: true, legendPos: 'b', legendColor: INK, legendFontSize: 10, legendFontFace: 'Arial', showTitle: false,
      catAxisLabelColor: MUT, catAxisLabelFontSize: 10, catAxisLabelFontFace: 'Courier New',
      valAxisLabelColor: MUT, valAxisLabelFontSize: 10, valAxisLabelFontFace: 'Courier New',
      valGridLine: { color: 'E4EAF1', size: 0.75 }, catGridLine: { style: 'none' }, valAxisMaxVal: 100, valAxisMinVal: 0,
    });
    card(s, 8.75, 1.52, 4.05, 4.8, 'FFFFFF');
    s.addText('Headline calls', { x: 9.0, y: 1.74, w: 3.6, h: 0.3, fontFace: 'Arial', fontSize: 14, bold: true, color: INK, margin: 0 });
    DATA.bev.top.slice(0, 3).forEach((t, i) => {
      const y = 2.14 + i * 1.14;
      s.addText(t.name.length > 40 ? t.name.slice(0, 38) + '…' : t.name, { x: 9.0, y, w: 3.65, h: 0.3, fontFace: 'Arial', fontSize: 11.5, bold: true, color: INK, margin: 0 });
      s.addText([
        { text: `momentum ${t.momentum}/100 · ${t.confidence.toUpperCase()}`, options: { color: GOLD, breakLine: true } },
        { text: t.cross50 === 'passed' ? 'majority adoption: already passed' : t.cross50 ? `crosses 50% ≈${t.cross50} (${t.band50 ? `${t.band50[0] ?? '…'}–${t.band50[1] ?? '…'}` : ''})` : 'stays niche in plan window', options: { color: MUT } },
      ], { x: 9.0, y: y + 0.27, w: 3.65, h: 0.6, fontFace: 'Courier New', fontSize: 9.5, margin: 0 });
    });
    s.addText(`Lanes H1/H2/H3: ${DATA.bev.lanes.H1}/${DATA.bev.lanes.H2}/${DATA.bev.lanes.H3}. Solid-state stays H3 — pilot-scale, $400-800/kWh; treat OEM dates skeptically.`, { x: 9.0, y: 5.55, w: 3.6, h: 0.7, fontFace: 'Arial', fontSize: 9.5, italic: true, color: MUT, margin: 0 });
    s.addText('Every number on this slide came out of the deterministic engine at deck-build time — none were typed in by hand.', { x: 0.55, y: 6.55, w: 12.2, h: 0.4, align: 'center', fontFace: 'Arial', fontSize: 12.5, italic: true, bold: true, color: TEAL });
    footer(s);
    s.addNotes(`Now the part I promised — a live example. I typed one thing into the tool: "BEV HV battery". ${DATA.bev.count} technologies came back, mapped instantly. Let me read the chart with you. The gold line — LFP — already dominant and heading for saturation; that battle is over. The teal line, cell-to-pack integration, crosses the majority of the market this decade — that changes pack architecture and who adds the value. The purple riser is the one to watch: ultra-fast-charge LFP — charging speed is replacing range as the spec war. And down at the bottom — solid-state. Flat. [pause] Not because we are pessimists, but because it is still pilot-scale at four to eight hundred dollars a kilowatt-hour — the honest position is "track it, don't bet the platform on it". On the right, the headline calls, each with an uncertainty band. And the line at the bottom of the slide is the one I want you to remember: I did not type a single one of these numbers. The engine computed all of them the moment this deck was built.`);
  }

  // ═══ 11b · THE REGISTER THAT LEARNS ═══════════════════════════════════════
  //
  // Genuinely new since the deck was last built (25 Jul): the register audits
  // its own coverage, researches what it is missing, and the frontier check was
  // made region-neutral after it was caught privileging one country.
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'It curates itself', 'A register nobody maintains is a register that rots');
    s.addText('A curated list is only an advantage while somebody curates it. So the tool audits its own coverage — and tells us where it is thin, rather than answering confidently from a gap.',
      { x: 0.55, y: 1.55, w: 12.2, h: 0.5, fontFace: 'Arial', fontSize: 13.5, color: MUT, margin: 0 });

    const items = [
      ['LuSearchCheck', TEAL, 'It finds its own blind spots',
        'A KIND ontology classifies every technology — material, process, architecture, control. Whole categories the register was blind to were found by checking itself against live research, not by waiting for someone to notice.'],
      ['LuCompass', VIOLET, 'The frontier check is region-neutral',
        'An earlier version privileged one country when deciding what counted as "frontier". That is a bias, not a judgement, and it was removed — the check now reads the same wherever the evidence comes from.'],
      ['LuBookMarked', GOLDL, 'Every technology gets a dossier',
        'Not a one-line claim: what it is, who is shipping it, what it costs, and the case AGAINST it. A foresight entry with no counter-argument is marketing.'],
      ['LuGauge', GOLD, 'Curation is a measured backlog',
        '`npm run horizon:audit` grades the register on evidence, freshness and precision, and prints what to fix next. Curation debt is visible instead of accumulating quietly.'],
    ];
    let y = 2.25;
    for (const [icon, colour, title, body] of items) {
      s.addImage({ data: await ic(icon, colour), x: 0.62, y: y + 0.04, w: 0.36, h: 0.36 });
      s.addText(title, { x: 1.2, y, w: 11.4, h: 0.32, fontFace: 'Arial', fontSize: 15, bold: true, color: INK, margin: 0 });
      s.addText(body, { x: 1.2, y: y + 0.34, w: 11.4, h: 0.62, fontFace: 'Arial', fontSize: 11.5, color: MUT, margin: 0 });
      y += 1.12;
    }
    s.addText(`139 technologies at the last telling, ${DATA.registerSize} today — every addition found by the tool, not by us.`,
      { x: 0.55, y: 6.42, w: 12.2, h: 0.46, align: 'center', fontFace: 'Arial', fontSize: 14, italic: true, bold: true, color: INK });
    footer(s);
    s.addNotes('One question I got last time, and it was the right one: "a curated register is only good while somebody curates it — what happens when you get busy?" So this slide is what we did about it. First: the tool finds its own blind spots. Every technology is now classified by KIND — is it a material, a process, an architecture, a control strategy — and when we checked that classification against live research it found whole categories we were blind to. We did not notice those; the tool did. Second, and this one is a correction I want to own: an earlier version of the frontier check privileged one country when deciding what counted as leading-edge. That is a bias, not a judgement, and we took it out. Third, every technology now carries a proper dossier — what it is, who is actually shipping it, what it costs, and the case AGAINST it. If an entry has no counter-argument it is marketing, not foresight. And fourth, curation is now a measured backlog: one command grades the whole register on evidence, freshness and precision and prints what to fix next. The bottom line is the proof: the register went from a hundred and thirty-nine technologies to a hundred and eighty since I last stood here, and every addition came from the tool telling us what it was missing.');
  }

  // ═══ 12 · EVIDENCE & ACCOUNTABILITY ═══════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Evidence layer', 'Prediction backed by retrieval — and graded afterwards');
    const q = [
      ['LuChartLine', TEAL, 'Patent-filing velocity', 'US filings per year for each technology, with a computed accelerating / steady / declining label. A rising curve is an observable early signal — not an opinion.'],
      ['LuSearchCheck', GOLDL, 'Deep research, cite-or-drop', 'Live web + patent retrieval, then AI synthesis where every finding must cite a retrieved source. Uncited claims are dropped in code — and it reports whether evidence supports or challenges the register.'],
      ['LuUsers', VIOLET, 'Expert panel critique', 'Three AI sceptics — over-hype historian, supply-chain realist, regulatory analyst — stamp agree / caution / challenge on each card. They critique timing; they cannot change a number.'],
      ['LuBookMarked', INK, 'Prediction Ledger', 'Every forecast can be snapshotted. On re-curation the tool scores its own past projections — mean error, shown to us. "A foresight tool that never checks its past predictions is astrology."'],
    ];
    for (let i = 0; i < 4; i++) {
      const [ik, col, t, b] = q[i], x = 0.55 + (i % 2) * 6.25, y = 1.7 + Math.floor(i / 2) * 2.28;
      card(s, x, y, 5.95, 2.08, 'FFFFFF', false);
      s.addShape('roundRect', { x, y, w: 5.95, h: 0.62, rectRadius: 0.07, fill: { color: col } });
      await dot(s, x + 0.14, y + 0.08, 0.46, col, ik, 0.6);
      s.addText(t, { x: x + 0.75, y, w: 5.0, h: 0.62, valign: 'middle', fontFace: 'Arial', fontSize: 14, bold: true, color: 'FFFFFF', margin: 0 });
      s.addText(b, { x: x + 0.25, y: y + 0.75, w: 5.45, h: 1.25, fontFace: 'Arial', fontSize: 10.5, color: MUT, margin: 0 });
    }
    footer(s);
    s.addNotes('A prediction on its own is just an opinion with confidence — so underneath every prediction sits an evidence layer. Top left: patent filing velocity. If filings on a technology are accelerating year over year, that is an observable early signal — and the label is computed from the counts, not from anyone\'s opinion. Top right: deep research. The tool goes out, retrieves live sources and patents, and then — this is the part I love — if the AI writes a finding it cannot tie to a retrieved source, the code deletes it before we ever see it. It can even come back and say the evidence CHALLENGES our own register. Bottom left: three AI sceptics — an over-hype historian, a supply-chain realist, a regulatory analyst — who stamp agree, caution or challenge on every card. They can question timing; they are not allowed to touch a number. And bottom right, the ledger — we grade our own homework. Prediction plus accountability.');
  }

  // ═══ 13 · BUSINESS VALUE ══════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Business value', 'What this changes for us');
    const cards4 = [
      ['LuTarget', INK, 'Sharper sourcing decisions', 'Check the technology future of a part before the 7-year contract: what replaces it, when, at what cost trajectory — with confidence tiers on every call.'],
      ['LuTrendingUp', GOLDL, 'Negotiation leverage', 'Wright’s-law trajectories say what a part SHOULD cost in 2029-31 — a defensible fact base for LTAs, productivity clauses and make-vs-buy.'],
      ['LuLandmark', TEAL, 'Regulatory de-risking', 'Euro 7, ELV recast, GB 38031 — dated, legally statused, mapped to the exact components they force. Proposals can never masquerade as law.'],
      ['LuMountain', VIOLET, 'Segment & competitor radar', 'Our off-road/luxury battleground benchmarked continuously — Defender OCTA to Yangwang U8 — each with the announced next move to watch.'],
    ];
    for (let i = 0; i < 4; i++) {
      const [ik, col, t, b] = cards4[i], x = 0.55 + (i % 2) * 6.25, y = 1.7 + Math.floor(i / 2) * 2.12;
      card(s, x, y, 5.95, 1.92, 'FFFFFF');
      await dot(s, x + 0.24, y + 0.24, 0.62, col, ik);
      s.addText(t, { x: x + 1.05, y: y + 0.2, w: 4.72, h: 0.32, fontFace: 'Arial', fontSize: 14.5, bold: true, color: INK, margin: 0 });
      s.addText(b, { x: x + 1.05, y: y + 0.54, w: 4.72, h: 1.25, fontFace: 'Arial', fontSize: 11, color: MUT, margin: 0 });
    }
    s.addShape('roundRect', { x: 2.3, y: 6.18, w: 8.73, h: 0.62, rectRadius: 0.31, fill: { color: INK } });
    s.addText([{ text: 'Minutes, not weeks ', options: { bold: true, color: GOLDL } }, { text: ' ·  self-serve, part-level, in our commodity language — for every engineer', options: { color: 'D5DEE9' } }], { x: 2.3, y: 6.18, w: 8.73, h: 0.62, align: 'center', valign: 'middle', fontFace: 'Arial', fontSize: 13, margin: 0 });
    footer(s);
    s.addNotes('So what does this actually change for the business? Four things, very concretely. One — sourcing: before we sign a seven-year contract, we check the technology future of that part. Will hydraulic brakes still be the right answer in year five, or are we signing up for legacy? Two — negotiation: if the cost curve says this part should be fifteen percent cheaper by 2029, that belongs in the LTA conversation, and now we have the maths behind it. Three — regulation: every obligation dated, statused, and mapped to the exact components it forces. No more surprises, and no more panicking over proposals that are not law. Four — the radar: our competitive segment, benchmarked continuously, including the disruptors. [point to pill] And the operating model matters as much as the features: minutes not weeks, self-serve, every engineer — not a gated analyst subscription.');
  }

  // ═══ 14 · TRUST ═══════════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: 'FFFFFF' };
    await header(s, 'Trust', 'Engineered and audited like a product, not a demo');
    const checks = [
      ['758 automated tests', 'Register integrity, model rules and coverage are CI-enforced — an adoption claim without evidence fails the build.'],
      ['Independently fact-checked', 'A two-chair audit verified the riskiest claims against primary sources; every finding is fixed and test-locked.'],
      ['Honesty architecture', 'Confidence tiers · "modelled" labels · regulation legal status · adoption ceilings · uncertainty bands. It says "I don’t know" rather than guessing.'],
      ['Grounded AI, enforced in code', 'Briefing, panel and research are grounded in engine output; uncited findings are dropped server-side.'],
      ['Self-scoring', 'The Prediction Ledger snapshots forecasts and scores them on re-curation — Tetlock discipline, built in.'],
    ];
    for (let i = 0; i < checks.length; i++) {
      const y = 1.7 + i * 0.94;
      s.addImage({ data: await ic('LuCircleCheck', TEAL), x: 0.6, y: y + 0.02, w: 0.36, h: 0.36 });
      s.addText(checks[i][0], { x: 1.12, y: y - 0.04, w: 5.6, h: 0.32, fontFace: 'Arial', fontSize: 14.5, bold: true, color: INK, margin: 0 });
      s.addText(checks[i][1], { x: 1.12, y: y + 0.27, w: 6.2, h: 0.6, fontFace: 'Arial', fontSize: 10.5, color: MUT, margin: 0 });
    }
    s.addShape('roundRect', { x: 7.85, y: 1.7, w: 4.93, h: 4.6, rectRadius: 0.09, fill: { color: INK }, shadow: { type: 'outer', color: '9FB0C2', opacity: 0.35, blur: 8, offset: 2, angle: 90 } });
    brackets(s, 7.98, 1.83, 4.67, 4.34, GOLDL);
    s.addImage({ data: await ic('LuBookMarked', GOLDL), x: 8.2, y: 2.0, w: 0.46, h: 0.46 });
    s.addText('The test we set ourselves', { x: 8.8, y: 2.06, w: 3.8, h: 0.38, fontFace: 'Arial', fontSize: 14, bold: true, color: 'FFFFFF', margin: 0 });
    s.addText('"A foresight tool that never checks its own past predictions is astrology."', { x: 8.2, y: 2.68, w: 4.25, h: 0.95, fontFace: 'Arial', fontSize: 15, italic: true, color: GOLDL, margin: 0 });
    s.addText('Every prediction can be snapshotted. When the register is re-curated, the tool computes exactly how far its old projections were off — and shows us the error. No other tool in this space grades its own homework.', { x: 8.2, y: 3.75, w: 4.25, h: 1.5, fontFace: 'Arial', fontSize: 11.5, color: 'C7D2DE', margin: 0 });
    s.addText('audited · test-locked · self-scoring', { x: 8.2, y: 5.65, w: 4.25, h: 0.3, fontFace: 'Courier New', fontSize: 10.5, bold: true, color: TEAL, margin: 0 });
    footer(s);
    s.addNotes('Last question before the close: why should you trust it enough to put its output in front of a board? Because we engineered it like a product, not a demo. Seven hundred and fifty-eight automated tests run on every change — and they enforce the honesty rules themselves: if someone adds a technology claiming high adoption without evidence, the build literally fails. It has been through an independent fact-check against primary sources, and every finding from that audit is fixed and locked into the tests. [point to navy card] And the quote on the right is the standard we hold it to: a foresight tool that never checks its own past predictions is astrology. This one checks. It scores its own old forecasts and shows us the error. I know very few humans with that discipline — now we have a tool with it.');
  }

  // ═══ 15 · CLOSE ═══════════════════════════════════════════════════════════
  {
    const s = p.addSlide();
    s.background = { color: INK };
    horizonArt(s, 5.4, GOLDL, 66);
    s.addShape('ellipse', { x: W / 2 - 0.8, y: 0.7, w: 1.6, h: 1.6, fill: { type: 'none' }, line: { color: TEAL, width: 1, dashType: 'dash', transparency: 30 } });
    s.addImage({ data: await ic('LuTelescope', 'FFFFFF'), x: W / 2 - 0.34, y: 1.16, w: 0.68, h: 0.68 });
    s.addText('SEE IT LIVE', { x: 0, y: 2.55, w: W, h: 0.3, align: 'center', fontFace: 'Courier New', fontSize: 12, color: GOLDL, charSpacing: 3, bold: true });
    s.addText('The future of every part we buy — on demand', { x: 0, y: 2.9, w: W, h: 0.6, align: 'center', fontFace: 'Arial', fontSize: 28, bold: true, color: 'FFFFFF' });
    const steps = [['1', 'Open Horizon\nOff-Road & Luxury lens'], ['2', 'Predict\nlanes · crossings · benchmarks'], ['3', 'Export\nthe Foresight Report PDF']];
    steps.forEach(([n, t], i) => {
      const x = 2.5 + i * 3.0;
      s.addShape('roundRect', { x, y: 3.7, w: 2.7, h: 0.95, rectRadius: 0.09, fill: { color: NAVY2 }, line: { color: '2A4463', width: 0.75 } });
      s.addText(n, { x: x + 0.16, y: 3.7, w: 0.5, h: 0.95, valign: 'middle', fontFace: 'Courier New', fontSize: 22, bold: true, color: GOLDL, margin: 0 });
      s.addText(t, { x: x + 0.66, y: 3.7, w: 2.0, h: 0.95, valign: 'middle', fontFace: 'Arial', fontSize: 10.5, color: 'D5DEE9', margin: 0 });
    });
    s.addText('Next: pilot with two commodity teams · patent-evidence API key · quarterly re-curation so the ledger starts scoring us', { x: 0, y: 4.85, w: W, h: 0.3, align: 'center', fontFace: 'Arial', fontSize: 12.5, italic: true, color: '9FB2C6' });
    s.addText('Avinash Bhosale · BrainSpark Horizon', { x: 0, y: 6.95, w: W, h: 0.3, align: 'center', fontFace: 'Courier New', fontSize: 10.5, color: '7C8DA3' });
    s.addNotes('That is the story — but honestly, this tool is better experienced than described, and a live run takes under a minute. If you will allow me: I will open Horizon, click our Off-Road and Luxury lens, run a prediction, and export the report — right now, on this screen. [do the demo] Before I hand back, three small asks to take this from impressive to embedded. First: let me pilot it with two commodity teams for one quarter. Second: a free patent-database key — it costs nothing and lights up the evidence layer. Third: a quarterly re-curation slot in the calendar, so the prediction ledger starts scoring us and the tool gets sharper every cycle. [pause] Thank you — and I am happy to take questions, or better, take requests: name any part you own, and let us see its future together.');
  }

  const out = path.join(__dirname, '..', 'BrainSpark_Horizon_Director.pptx');
  await p.writeFile({ fileName: out });
  // Persist any icon rasterised this run, so the next one needs no scratch
  // install. Written only when something was actually baked — an unchanged
  // cache file must not churn in the diff on every regeneration.
  if (bakedNew) {
    fs.writeFileSync(ICON_CACHE_PATH, `${JSON.stringify(iconCache, null, 0)}\n`);
    console.log(`icons re-baked -> ${path.relative(process.cwd(), ICON_CACHE_PATH)} `
      + `(${Object.keys(iconCache).length} entries)`);
  }
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
})().catch((e) => { console.error(e); process.exit(1); });
