// Generator for CostVision-Phase1-Readiness.pptx (Phase 1 deployment readiness, Nov 2026).
// Needs pptxgenjs@3.12.0 react-icons@5.4.0 react@18.3.1 react-dom@18.3.1 sharp@0.33.5 installed beside it.
// CostVision — Phase 1 readiness deck (plain language). Run: node build.js <out.pptx>
const pptxgen = require('pptxgenjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, 'CostVision-Phase1-Readiness.pptx');
const C = { navy: '16325C', blue: '1D6FB8', teal: '0D7D71', green: '2A7F50', amber: '99651A', red: 'B03A2E',
  slate: '3A4356', muted: '686F7D', page: 'F4F7FB', white: 'FFFFFF', line: 'DCE3EE',
  blueTint: 'E8F1FA', tealTint: 'E6F4F1', greenTint: 'EAF6EF', amberTint: 'FCF3E3', redTint: 'FBECEA', ice: 'CADCFC' };
const TITLE = 'Cambria', BODY = 'Calibri';
const ICON_PNG = '/home/user/leamington-marathi/assets/CostVision-icon.png';

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + png.toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
  pres.author = 'CostVision';
  pres.title = 'Taking CostVision live inside JLR — Phase 1 readiness';

  const I = {};
  const need = { server: fa.FaServer, shield: fa.FaShieldAlt, lock: fa.FaLock, user: fa.FaUserCheck, net: fa.FaNetworkWired,
    db: fa.FaDatabase, cloud: fa.FaCloud, win: fa.FaWindows, box: fa.FaBoxOpen, check: fa.FaCheckCircle, tools: fa.FaTools,
    key: fa.FaKey, mail: fa.FaEnvelope, clip: fa.FaClipboardCheck, rocket: fa.FaRocket, draft: fa.FaDraftingCompass,
    cogs: fa.FaCogs, report: fa.FaFileAlt, globe: fa.FaGlobeEurope, ban: fa.FaBan, robot: fa.FaRobot, users: fa.FaUsers,
    hdd: fa.FaHdd, memory: fa.FaMemory, chip: fa.FaMicrochip, q: fa.FaQuestionCircle, warn: fa.FaExclamationTriangle,
    route: fa.FaRoute, browser: fa.FaDesktop, eye: fa.FaEye, sync: fa.FaSyncAlt, layers: fa.FaLayerGroup, clock: fa.FaClock,
    flag: fa.FaFlagCheckered, hands: fa.FaHandshake, gauge: fa.FaTachometerAlt, pcb: fa.FaMicrochip, coins: fa.FaCoins };
  for (const [k, comp] of Object.entries(need)) {
    I[k] = { navy: await icon(comp, C.navy), white: await icon(comp, C.white), blue: await icon(comp, C.blue),
      teal: await icon(comp, C.teal), green: await icon(comp, C.green), amber: await icon(comp, C.amber), red: await icon(comp, C.red) };
  }

  const W = 13.333;
  const shadow = () => ({ type: 'outer', color: '000000', blur: 6, offset: 2, angle: 90, opacity: 0.10 });
  const footer = (s, n) => {
    s.addText(`CostVision · Phase 1 readiness`, { x: 0.6, y: 7.05, w: 6, h: 0.3, fontFace: BODY, fontSize: 10, color: C.muted, margin: 0, isTextBox: true });
    s.addText(String(n), { x: W - 1.1, y: 7.05, w: 0.5, h: 0.3, fontFace: BODY, fontSize: 10, color: C.muted, align: 'right', margin: 0, isTextBox: true });
  };
  const title = (s, t, sub) => {
    s.addText(t, { x: 0.6, y: 0.45, w: W - 1.2, h: 0.75, fontFace: TITLE, fontSize: 32, bold: true, color: C.navy, margin: 0, isTextBox: true });
    if (sub) s.addText(sub, { x: 0.6, y: 1.2, w: W - 1.2, h: 0.45, fontFace: BODY, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
  };
  const circleIcon = (s, ic, x, y, d, fill) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
    const p = d * 0.26;
    s.addImage({ data: ic, x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p });
  };
  const card = (s, x, y, w, h, fill = C.white, line = C.line) => s.addShape(pres.shapes.ROUNDED_RECTANGLE,
    { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: line, width: 0.75 }, shadow: shadow() });
  const chip = (s, text, x, y, w, color, tint) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.32, rectRadius: 0.16, fill: { color: tint }, line: { color: tint } });
    s.addText(text, { x, y, w, h: 0.32, fontFace: BODY, fontSize: 11, bold: true, color, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  };

  // ── 1. Title ──
  {
    const s = pres.addSlide(); s.background = { color: C.navy };
    s.addImage({ path: ICON_PNG, x: 0.8, y: 0.8, w: 1.0, h: 1.0 });
    s.addText('Taking CostVision live inside JLR', { x: 0.8, y: 2.35, w: 11.5, h: 1.1, fontFace: TITLE, fontSize: 44, bold: true, color: C.white, margin: 0, isTextBox: true });
    s.addText('Phase 1 readiness: the easiest, safest way to run it on our own servers, with no AI', { x: 0.8, y: 3.5, w: 11.5, h: 0.6, fontFace: BODY, fontSize: 20, color: C.ice, margin: 0, isTextBox: true });
    s.addText([
      { text: 'Includes the new 2D drawing reader, the new machining-time model and the cost bridge', options: { breakLine: true } },
      { text: 'November 2026', options: {} },
    ], { x: 0.8, y: 5.6, w: 11, h: 0.8, fontFace: BODY, fontSize: 14, color: C.ice, margin: 0, isTextBox: true, paraSpaceAfter: 4 });
    s.addNotes('Purpose: agree how we deploy Phase 1 of CostVision inside JLR, and what has to happen before go-live. Phase 1 means everything that works without AI — that is the full costing engine, CAD to COST, the drawing reader and the reports.');
  }

  // ── 2. The short answer ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'The short answer');
    card(s, 0.6, 1.5, W - 1.2, 1.45, C.navy, C.navy);
    s.addText('Run CostVision as one Docker container on a JLR Linux server, behind JLR\'s secure gateway and single sign-on, with AI switched off and no internet access.',
      { x: 0.95, y: 1.6, w: W - 1.9, h: 1.25, fontFace: TITLE, fontSize: 22, color: C.white, valign: 'middle', margin: 0, isTextBox: true });
    const cols = [
      { ic: I.check.green, tint: C.greenTint, h: 'Easy', t: 'One package, one settings file, one data folder. It is the kind of set-up JLR IT already runs every day.' },
      { ic: I.shield.blue, tint: C.blueTint, h: 'Safe', t: 'Only JLR staff can reach it, nothing leaves the server, and drawings never go to any AI.' },
      { ic: I.tools.amber, tint: C.amberTint, h: 'Nearly ready', t: 'Four small fixes and one proper test run inside the real package, then it is ready for a pilot.' },
    ];
    cols.forEach((c, i) => {
      const x = 0.6 + i * 4.1, y = 3.35, w = 3.85, h = 3.25;
      card(s, x, y, w, h);
      circleIcon(s, c.ic, x + 0.35, y + 0.35, 0.95, c.tint);
      s.addText(c.h, { x: x + 0.35, y: y + 1.45, w: w - 0.7, h: 0.5, fontFace: TITLE, fontSize: 22, bold: true, color: C.navy, margin: 0, isTextBox: true });
      s.addText(c.t, { x: x + 0.35, y: y + 2.0, w: w - 0.7, h: 1.1, fontFace: BODY, fontSize: 15, color: C.slate, margin: 0, isTextBox: true, valign: 'top' });
    });
    footer(s, 2);
    s.addNotes('If people remember one slide, it is this one. The recommendation is deliberately boring: a normal server, a normal container, JLR\'s normal gateway. Boring is what makes it safe and quick to approve.');
  }

  // ── 3. What Phase 1 includes ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'What our engineers get in Phase 1', 'Everything that works with arithmetic alone. No AI, so no API key and nothing sent outside.');
    const inc = [
      [I.cogs, 'CAD to COST', 'Upload a STEP model and get a should-cost for 15 processes: casting, forging, machining, sheet metal, moulding, extrusion and more'],
      [I.draft, '2D drawing reader (new)', 'Reads material, tolerances, finish and notes off the drawing, offline. You confirm each value before it is used'],
      [I.clock, 'Machining time (new)', 'Time built operation by operation from machine makers\' published speeds, not fixed guesses'],
      [I.coins, 'Cost bridge (new)', 'A line-by-line walk from metal bought to the final price, plus where the material goes'],
      [I.route, 'Compare routes', 'Casting v forging v machining for the same part, at every volume'],
      [I.report, 'Reports', 'PDF and Excel reports, 39 country rate books, company rate-book upload for admins'],
    ];
    const colW = 7.3;
    inc.forEach(([ic, h, t], i) => {
      const y = 1.95 + i * 0.83;
      circleIcon(s, ic.white, 0.6, y, 0.6, C.blue);
      s.addText(h, { x: 1.4, y: y - 0.04, w: colW - 1, h: 0.33, fontFace: BODY, fontSize: 15, bold: true, color: C.navy, margin: 0, isTextBox: true });
      s.addText(t, { x: 1.4, y: y + 0.28, w: colW - 1, h: 0.45, fontFace: BODY, fontSize: 12, color: C.slate, margin: 0, isTextBox: true, valign: 'top' });
    });
    const x = 8.55, y = 1.95, w = 4.2, h = 4.85;
    card(s, x, y, w, h, C.white);
    circleIcon(s, I.robot.amber, x + 0.3, y + 0.3, 0.7, C.amberTint);
    s.addText('Waits for Phase 2 (AI)', { x: x + 1.15, y: y + 0.38, w: w - 1.3, h: 0.5, fontFace: TITLE, fontSize: 17, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText([
      { text: 'PCB photo to bill of materials', options: { bullet: true, breakLine: true } },
      { text: 'AI-led CAD analysis', options: { bullet: true, breakLine: true } },
      { text: 'Expert DFM commentary', options: { bullet: true, breakLine: true } },
      { text: 'RFQ reading and the chat assistant', options: { bullet: true } },
    ], { x: x + 0.3, y: y + 1.25, w: w - 0.6, h: 2.0, fontFace: BODY, fontSize: 14, color: C.slate, margin: 0, isTextBox: true, paraSpaceAfter: 8 });
    s.addText('These buttons are simply hidden when AI is switched off. Every costing still works.', { x: x + 0.3, y: y + 3.55, w: w - 0.6, h: 1.0, fontFace: BODY, fontSize: 13, italic: true, color: C.muted, margin: 0, isTextBox: true });
    footer(s, 3);
    s.addNotes('Phase 1 is not a cut-down tool. The AI features are a layer on top; the costing engine itself never uses AI to set a price. With AI off, those few buttons are hidden and nothing else changes.');
  }

  // ── 4. Four ways ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'Four ways we could run it', 'We compared them on how easy they are, how safe they are, and whether they suit a team pilot.');
    const opts = [
      { ic: I.server, n: 'A', h: 'Linux server + Docker', sub: 'behind JLR gateway and sign-on', e: 'Easy', sec: 'Strong', fit: 'Recommended', col: C.green, tint: C.greenTint, best: true },
      { ic: I.layers, n: 'B', h: 'JLR container platform', sub: 'Kubernetes / OpenShift / private Azure', e: 'Medium', sec: 'Strong', fit: 'Good later', col: C.blue, tint: C.blueTint },
      { ic: I.win, n: 'C', h: 'Windows package', sub: 'copied onto a Windows machine', e: 'Easy', sec: 'Weaker', fit: 'One person only', col: C.amber, tint: C.amberTint },
      { ic: I.cloud, n: 'D', h: 'Public cloud', sub: 'Fly.io, Railway and similar', e: 'Easiest', sec: 'Not acceptable', fit: 'No', col: C.red, tint: C.redTint },
    ];
    opts.forEach((o, i) => {
      const x = 0.6 + i * 3.08, y = 1.95, w = 2.9, h = 4.85;
      card(s, x, y, w, h, C.white, o.best ? C.green : C.line);
      if (o.best) s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { type: 'none' }, line: { color: C.green, width: 2.25 } });
      circleIcon(s, o.ic[o.best ? 'white' : 'navy'], x + 0.3, y + 0.3, 0.85, o.best ? C.green : C.blueTint);
      s.addText(`Option ${o.n}`, { x: x + 1.3, y: y + 0.42, w: w - 1.4, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: C.muted, margin: 0, isTextBox: true });
      s.addText(o.h, { x: x + 0.3, y: y + 1.35, w: w - 0.6, h: 0.7, fontFace: TITLE, fontSize: 18, bold: true, color: C.navy, margin: 0, isTextBox: true, valign: 'top' });
      s.addText(o.sub, { x: x + 0.3, y: y + 2.05, w: w - 0.6, h: 0.6, fontFace: BODY, fontSize: 12, color: C.muted, margin: 0, isTextBox: true, valign: 'top' });
      const rows = [['Ease', o.e], ['Security', o.sec], ['Pilot fit', o.fit]];
      rows.forEach(([k, v], j) => {
        const ry = y + 2.8 + j * 0.62;
        s.addText(k, { x: x + 0.3, y: ry, w: 1.0, h: 0.32, fontFace: BODY, fontSize: 12, color: C.muted, margin: 0, valign: 'middle', isTextBox: true });
        const bad = v === 'Not acceptable' || v === 'No' || v === 'Weaker';
        chip(s, v, x + 1.2, ry, w - 1.5, j === 2 ? o.col : bad ? C.red : C.slate, j === 2 ? o.tint : bad ? C.redTint : C.page);
      });
    });
    footer(s, 4);
    s.addNotes('A wins because it matches what JLR IT already runs. B is fine later, but our database allows only one running copy, so a big platform adds work without benefit yet. C is built for one laptop. D would put confidential drawings and CAD outside JLR, so it is ruled out.');
  }

  // ── 5. How it works ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'How the recommended set-up works', 'Four simple pieces. Each one is something JLR already knows how to run.');
    const boxes = [
      { ic: I.browser, h: 'Engineer\'s browser', t: 'Opens a normal JLR web address', fill: C.white },
      { ic: I.lock, h: 'JLR secure gateway', t: 'HTTPS with a JLR certificate. JLR sign-on decides who gets in', fill: C.white },
      { ic: I.box, h: 'CostVision container', t: 'On a Linux server inside JLR. AI off. Internet blocked', fill: C.white },
      { ic: I.db, h: 'Data folder', t: 'Database and uploads on an encrypted disk, backed up nightly', fill: C.white },
    ];
    const bw = 2.7, gap = 0.48, y = 2.25, bh = 3.0;
    boxes.forEach((b, i) => {
      const x = 0.6 + i * (bw + gap);
      card(s, x, y, bw, bh, b.fill);
      circleIcon(s, b.ic.white, x + (bw - 1.0) / 2, y + 0.3, 1.0, i === 2 ? C.green : C.navy);
      s.addText(b.h, { x: x + 0.2, y: y + 1.45, w: bw - 0.4, h: 0.5, fontFace: TITLE, fontSize: 17, bold: true, color: C.navy, align: 'center', margin: 0, isTextBox: true });
      s.addText(b.t, { x: x + 0.2, y: y + 1.95, w: bw - 0.4, h: 0.95, fontFace: BODY, fontSize: 13, color: C.slate, align: 'center', margin: 0, isTextBox: true, valign: 'top' });
      if (i < 3) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + bw + 0.07, y: y + 1.3, w: gap - 0.14, h: 0.4, fill: { color: C.blue }, line: { color: C.blue } });
    });
    card(s, 0.6, 5.6, W - 1.2, 1.15, C.tealTint, C.tealTint);
    circleIcon(s, I.ban.white, 0.85, 5.8, 0.75, C.teal);
    s.addText('Nothing goes the other way. The container cannot reach the internet, and AI is switched off in its settings (AIR_GAPPED=1). We tested this with every outbound connection blocked.',
      { x: 1.8, y: 5.65, w: W - 2.6, h: 1.05, fontFace: BODY, fontSize: 15, color: C.navy, valign: 'middle', margin: 0, isTextBox: true });
    footer(s, 5);
    s.addNotes('Walk left to right. The engineer never talks to the container directly; the JLR gateway is the front door. The container sits on a JLR server with no route to the internet. The only thing that needs looking after is the data folder.');
  }

  // ── 6. Security layers ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'How we keep it safe', 'Several layers, so no single mistake exposes anything.');
    const layers = [
      [I.net, 'Network', 'Inside JLR only. Outbound internet blocked', 'Ready', C.green, C.greenTint],
      [I.lock, 'Encryption', 'HTTPS with a JLR certificate at the gateway', 'IT standard', C.blue, C.blueTint],
      [I.user, 'Who can get in', 'JLR single sign-on at the gateway', 'IT standard', C.blue, C.blueTint],
      [I.mail, 'App accounts', 'Sign-up limited to JLR email addresses', 'Small fix', C.amber, C.amberTint],
      [I.key, 'Admins and secrets', 'Named admins only; strong secret key kept private', 'Ready', C.green, C.greenTint],
      [I.shield, 'Web protections', 'Strict browser rules, sign-in on every page, upload limits', 'Ready', C.green, C.greenTint],
      [I.box, 'Container', 'Runs as a normal user, not the system administrator', 'Small fix', C.amber, C.amberTint],
      [I.hdd, 'Data', 'Encrypted disk, nightly backup, files cleared after a day', 'IT standard', C.blue, C.blueTint],
    ];
    layers.forEach(([ic, h, t, st, col, tint], i) => {
      const c = i % 2, r = Math.floor(i / 2);
      const x = 0.6 + c * 6.15, y = 1.95 + r * 1.2, w = 5.95, h2 = 1.05;
      card(s, x, y, w, h2);
      circleIcon(s, ic.navy, x + 0.2, y + 0.18, 0.7, C.blueTint);
      s.addText(h, { x: x + 1.1, y: y + 0.13, w: 3.2, h: 0.35, fontFace: BODY, fontSize: 15, bold: true, color: C.navy, margin: 0, isTextBox: true });
      s.addText(t, { x: x + 1.1, y: y + 0.47, w: 3.35, h: 0.5, fontFace: BODY, fontSize: 12, color: C.slate, margin: 0, isTextBox: true, valign: 'top' });
      chip(s, st, x + w - 1.45, y + 0.36, 1.25, col, tint);
    });
    footer(s, 6);
    s.addNotes('Green means the tool already does it. Blue means JLR IT\'s normal standard covers it. Amber means a small change we make in the readiness build. There is nothing red on this slide.');
  }

  // ── 7. Ready v fix ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'What is ready today, and what we fix first');
    const x1 = 0.6, x2 = 6.85, y = 1.5, w = 5.9, h = 5.3;
    card(s, x1, y, w, h);
    circleIcon(s, I.check.white, x1 + 0.3, y + 0.3, 0.7, C.green);
    s.addText('Already in place', { x: x1 + 1.15, y: y + 0.38, w: w - 1.4, h: 0.5, fontFace: TITLE, fontSize: 20, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText([
      { text: 'One package holds the app, the CAD kernel and the drawing reader', options: { bullet: true, breakLine: true } },
      { text: 'AI off switch tested: nothing leaves the server', options: { bullet: true, breakLine: true } },
      { text: 'Sign-in on every page, named admins, upload limits', options: { bullet: true, breakLine: true } },
      { text: 'Uploaded drawings and CAD cleared after a day', options: { bullet: true, breakLine: true } },
      { text: '5,940 automated tests passing; real parts checked against a recorded baseline', options: { bullet: true } },
    ], { x: x1 + 0.3, y: y + 1.25, w: w - 0.6, h: 3.8, fontFace: BODY, fontSize: 15, color: C.slate, margin: 0, isTextBox: true, paraSpaceAfter: 10, valign: 'top' });
    card(s, x2, y, w, h);
    circleIcon(s, I.tools.white, x2 + 0.3, y + 0.3, 0.7, C.amber);
    s.addText('Four fixes before go-live', { x: x2 + 1.15, y: y + 0.38, w: w - 1.4, h: 0.5, fontFace: TITLE, fontSize: 20, bold: true, color: C.navy, margin: 0, isTextBox: true });
    const fixes = [
      ['Only JLR email addresses can sign up', 'Today anyone who reaches the page could register'],
      ['Run the container as a normal user', 'Plus a health check and a safe folder for drawing files'],
      ['Stop the 40-second freeze', 'Working out a sheet-metal blank briefly holds up every other user'],
      ['Backup and restore scripts', 'Tested, so a bad day is a restore, not a rebuild'],
    ];
    fixes.forEach(([h2, t], i) => {
      const fy = y + 1.25 + i * 0.98;
      s.addShape(pres.shapes.OVAL, { x: x2 + 0.3, y: fy, w: 0.5, h: 0.5, fill: { color: C.amberTint }, line: { color: C.amberTint } });
      s.addText(String(i + 1), { x: x2 + 0.3, y: fy, w: 0.5, h: 0.5, fontFace: BODY, fontSize: 16, bold: true, color: C.amber, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
      s.addText(h2, { x: x2 + 1.0, y: fy - 0.04, w: w - 1.3, h: 0.35, fontFace: BODY, fontSize: 15, bold: true, color: C.navy, margin: 0, isTextBox: true });
      s.addText(t, { x: x2 + 1.0, y: fy + 0.31, w: w - 1.3, h: 0.5, fontFace: BODY, fontSize: 12, color: C.slate, margin: 0, isTextBox: true, valign: 'top' });
    });
    footer(s, 7);
    s.addNotes('The left side is evidence, not promises: these were tested in the validation work. The right side is small, contained work. Fix 3 matters most for a shared server: one engineer developing a sheet-metal blank should not make everyone else wait.');
  }

  // ── 8. Steps ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'The readiness build, step by step', 'Steps 1 to 4 do not wait for IT answers. Step 5 is where IT\'s settings slot in.');
    const steps = [
      [I.tools, 'Make the four fixes', 'Sign-up limit, safer container, no freeze, backups'],
      [I.box, 'Build the real package', 'The exact Docker image JLR will run'],
      [I.ban, 'Test it cut off', 'AI off, no key, internet blocked. Run the live CAD and drawing tests inside it'],
      [I.clip, 'Write the IT guide', 'Step-by-step install guide plus the test evidence'],
      [I.flag, 'Install and pilot', 'IT installs; 5 to 10 cost engineers start using it'],
    ];
    const sw = 2.35, y = 2.1;
    steps.forEach(([ic, h, t], i) => {
      const x = 0.6 + i * (sw + 0.13);
      card(s, x, y, sw, 3.05);
      s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: y + 0.25, w: 0.55, h: 0.55, fill: { color: C.navy }, line: { color: C.navy } });
      s.addText(String(i + 1), { x: x + 0.25, y: y + 0.25, w: 0.55, h: 0.55, fontFace: BODY, fontSize: 18, bold: true, color: C.white, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
      circleIcon(s, ic.navy, x + sw - 0.95, y + 0.2, 0.7, C.blueTint);
      s.addText(h, { x: x + 0.25, y: y + 1.15, w: sw - 0.5, h: 0.85, fontFace: TITLE, fontSize: 17, bold: true, color: C.navy, margin: 0, isTextBox: true, valign: 'top' });
      s.addText(t, { x: x + 0.25, y: y + 2.0, w: sw - 0.5, h: 0.95, fontFace: BODY, fontSize: 13, color: C.slate, margin: 0, isTextBox: true, valign: 'top' });
    });
    card(s, 0.6, 5.5, W - 1.2, 1.25, C.tealTint, C.tealTint);
    circleIcon(s, I.ban.white, 0.85, 5.75, 0.75, C.teal);
    s.addText('Why step 3 matters: everything so far was tested in a development environment. Before go-live we prove the exact package JLR will run, with AI off and the internet switched off, using the same live CAD and drawing tests.',
      { x: 1.8, y: 5.55, w: W - 2.6, h: 1.15, fontFace: BODY, fontSize: 15, color: C.navy, valign: 'middle', margin: 0, isTextBox: true });
    footer(s, 8);
    s.addNotes('Step 3 is the important one: everything so far was tested in a development environment. Before go-live we prove it inside the real package, exactly as JLR will run it, with the internet switched off.');
  }

  // ── 9. Questions for IT ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'What we need from JLR IT', 'Five questions. The answers set the final settings; none of them blocks the readiness build.');
    const qs = [
      [I.server, 'A server', 'Can we have a Linux server with Docker? Will IT build the package from their own software mirror, or import one we build?'],
      [I.lock, 'The front door', 'Which secure gateway and single sign-on do internal web apps use?'],
      [I.mail, 'Email', 'Is there an internal mail relay the app can use to send sign-in codes?'],
      [I.hdd, 'Backups and disks', 'What is the standard for backups and disk encryption on application servers?'],
      [I.shield, 'Security review', 'Is a security review or penetration test needed before go-live?'],
    ];
    qs.forEach(([ic, h, t], i) => {
      const y = 1.95 + i * 0.98;
      card(s, 0.6, y, W - 1.2, 0.85);
      circleIcon(s, ic.navy, 0.8, y + 0.1, 0.65, C.blueTint);
      s.addText(h, { x: 1.7, y, w: 2.6, h: 0.85, fontFace: BODY, fontSize: 16, bold: true, color: C.navy, valign: 'middle', margin: 0, isTextBox: true });
      s.addText(t, { x: 4.3, y, w: W - 5.1, h: 0.85, fontFace: BODY, fontSize: 14, color: C.slate, valign: 'middle', margin: 0, isTextBox: true });
    });
    footer(s, 9);
    s.addNotes('Building the package needs internet once, to download software. Running it never does. Many companies prefer to build from their own internal mirror; either way works.');
  }

  // ── 10. Sizing ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'The server it needs, and how we look after it');
    const stats = [['4', 'processor cores', I.chip], ['8 GB', 'memory', I.memory], ['50 GB', 'disk, encrypted', I.hdd], ['0', 'internet connections', I.ban]];
    stats.forEach(([n, l, ic], i) => {
      const x = 0.6 + i * 3.08, y = 1.6, w = 2.9, h = 2.35;
      card(s, x, y, w, h);
      circleIcon(s, ic.navy, x + 0.25, y + 0.25, 0.6, C.blueTint);
      s.addText(n, { x: x + 0.25, y: y + 0.9, w: w - 0.5, h: 0.85, fontFace: TITLE, fontSize: 44, bold: true, color: C.navy, margin: 0, isTextBox: true });
      s.addText(l, { x: x + 0.25, y: y + 1.75, w: w - 0.5, h: 0.4, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0, isTextBox: true });
    });
    s.addText('Why this size: reading a scanned drawing uses up to about 1 GB of memory, and each CAD measuring worker a few hundred MB. 4 GB is the minimum for a few users; 8 GB gives comfortable headroom.',
      { x: 0.6, y: 4.1, w: W - 1.2, h: 0.65, fontFace: BODY, fontSize: 13, italic: true, color: C.muted, margin: 0, isTextBox: true });
    const ops = [
      [I.sync, 'Nightly backup', 'Of the one data folder, with a tested restore'],
      [I.clock, 'Monthly refresh', 'Rebuild the package with the latest security updates'],
      [I.eye, 'Logs', 'Sent to JLR\'s normal security monitoring'],
    ];
    ops.forEach(([ic, h, t], i) => {
      const x = 0.6 + i * 4.1, y = 5.0, w = 3.85;
      card(s, x, y, w, 1.75);
      circleIcon(s, ic.white, x + 0.25, y + 0.3, 0.65, C.teal);
      s.addText(h, { x: x + 1.1, y: y + 0.3, w: w - 1.3, h: 0.4, fontFace: BODY, fontSize: 15, bold: true, color: C.navy, margin: 0, isTextBox: true });
      s.addText(t, { x: x + 1.1, y: y + 0.7, w: w - 1.3, h: 0.9, fontFace: BODY, fontSize: 13, color: C.slate, margin: 0, isTextBox: true, valign: 'top' });
    });
    footer(s, 10);
    s.addNotes('A modest virtual machine is enough for a pilot of 5 to 10 engineers. Running costs are mainly IT time for backups and monthly updates.');
  }

  // ── 11. Honest limits ──
  {
    const s = pres.addSlide(); s.background = { color: C.page };
    title(s, 'Being honest about where we are', 'Ready to run safely is not the same as proven accurate. A pilot is how we close that gap.');
    const lim = [
      [I.coins, 'Cost accuracy is not yet measured', 'No real purchase prices have been entered for any part yet. Every figure is a careful estimate until we compare it with what JLR actually pays.', C.amber, C.amberTint],
      [I.draft, 'The drawing reader reads a part of each drawing', 'About 6 in 10 values on CAD-exported PDFs; far less on scans. Material reads well (32 of 37). Engineers confirm every value, so a missed one is simply asked.', C.amber, C.amberTint],
      [I.cogs, 'Some machining inputs are still rules of thumb', 'Which faces get machined and the stock per face. Fixing that needs JLR\'s licensed ISO tables (a later package).', C.blue, C.blueTint],
    ];
    lim.forEach(([ic, h, t, col, tint], i) => {
      const y = 1.95 + i * 1.32;
      card(s, 0.6, y, 8.1, 1.17);
      circleIcon(s, ic.white, 0.8, y + 0.22, 0.72, col);
      s.addText(h, { x: 1.75, y: y + 0.1, w: 6.8, h: 0.38, fontFace: BODY, fontSize: 15, bold: true, color: C.navy, margin: 0, isTextBox: true });
      s.addText(t, { x: 1.75, y: y + 0.47, w: 6.8, h: 0.65, fontFace: BODY, fontSize: 12, color: C.slate, margin: 0, isTextBox: true, valign: 'top' });
    });
    const x = 9.0, y = 1.95, w = 3.75, h = 3.81;
    card(s, x, y, w, h, C.navy, C.navy);
    circleIcon(s, I.users.navy, x + 0.3, y + 0.3, 0.75, C.white);
    s.addText('The pilot plan', { x: x + 0.3, y: y + 1.2, w: w - 0.6, h: 0.45, fontFace: TITLE, fontSize: 20, bold: true, color: C.white, margin: 0, isTextBox: true });
    s.addText([
      { text: '5 to 10 cost engineers', options: { bullet: true, breakLine: true } },
      { text: 'CAD-exported drawings first', options: { bullet: true, breakLine: true } },
      { text: 'Enter prices paid for 10 to 20 parts', options: { bullet: true, breakLine: true } },
      { text: 'Check the reader on our own drawings, inside JLR', options: { bullet: true } },
    ], { x: x + 0.3, y: y + 1.75, w: w - 0.6, h: 1.95, fontFace: BODY, fontSize: 13, color: C.ice, margin: 0, isTextBox: true, paraSpaceAfter: 6, valign: 'top' });
    footer(s, 11);
    s.addNotes('Say this plainly to the Director: the tool is safe and transparent, but its accuracy is not yet proven against real prices. The pilot produces exactly the evidence we need: real prices and real JLR drawings, all measured inside JLR.');
  }

  // ── 12. Decisions ──
  {
    const s = pres.addSlide(); s.background = { color: C.navy };
    s.addText('What we are asking for', { x: 0.8, y: 0.7, w: 11.5, h: 0.8, fontFace: TITLE, fontSize: 36, bold: true, color: C.white, margin: 0, isTextBox: true });
    const asks = [
      [I.check, 'Agree Option A', 'One Linux server with Docker, behind the JLR gateway and sign-on, AI off, no internet'],
      [I.hands, 'An IT contact', 'Someone who can answer the five questions and own the server'],
      [I.users, 'A pilot group', '5 to 10 cost engineers, and 10 to 20 parts with known prices'],
      [I.rocket, 'Go-ahead for the readiness build', 'The four fixes and the cut-off test, then the IT install guide'],
    ];
    asks.forEach(([ic, h, t], i) => {
      const y = 1.9 + i * 1.18;
      circleIcon(s, ic.navy, 0.8, y, 0.8, C.white);
      s.addText(h, { x: 1.85, y: y - 0.02, w: 10.5, h: 0.42, fontFace: BODY, fontSize: 20, bold: true, color: C.white, margin: 0, isTextBox: true });
      s.addText(t, { x: 1.85, y: y + 0.42, w: 10.5, h: 0.42, fontFace: BODY, fontSize: 15, color: C.ice, margin: 0, isTextBox: true });
    });
    s.addText('Easy to run, safe by design, honest about what is still to prove.', { x: 0.8, y: 6.65, w: 11.5, h: 0.45, fontFace: TITLE, fontSize: 16, italic: true, color: C.ice, margin: 0, isTextBox: true });
    s.addNotes('Close on the four asks. The readiness build can start as soon as Option A is agreed; the IT answers are needed only for the final settings.');
  }

  await pres.writeFile({ fileName: OUT });
  console.log('written', OUT);
})().catch(e => { console.error(e); process.exit(1); });
