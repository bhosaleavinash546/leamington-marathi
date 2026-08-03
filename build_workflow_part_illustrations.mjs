/**
 * Part illustrations for the workflow explainer deck.
 *
 *   node build_workflow_part_illustrations.mjs      # needs `sharp` on NODE_PATH
 *
 * Writes assets/workflow-deck/part-{housing,bumper}.{svg,png}. Those PNGs are
 * committed, so build_workflow_deck.mjs does NOT need sharp — only re-run this
 * if a dimension on the slides changes and the drawing has to follow it.
 *
 * Deliberately schematic rather than photo-real: both are drawn to the exact
 * dimensions the engine measured, and the slides label them as illustrations.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const fs = require('fs');
const OUT = 'assets/workflow-deck';

const NAVY='#16325C', SLATE='#3A4356', MUTED='#6B7280', LINE='#C7D2E2';
const AL1='#C9D4E2', AL2='#9FB0C6', AL3='#7C8FA8', MACH='#E8F1FA', BLUE='#1D6FB8';
const PP1='#5B6675', PP2='#3F4854', PP3='#2C333C', TEAL='#0E8074';

/** Isometric helper: 3D point → 2D. */
const iso = (x, y, z) => [ (x - z) * 0.866, y + (x + z) * 0.5 ];
const pts = a => a.map(p => p.join(',')).join(' ');

// ── 1 · die-cast aluminium housing ────────────────────────────────────────────
function housing() {
  const W = 300, D = 200, H = 90, ox = 250, oy = 120, s = 1.0;
  const P = (x, y, z) => { const [a, b] = iso(x * s, y * s, z * s); return [ox + a, oy + b]; };
  const top = [P(0,0,0), P(W,0,0), P(W,0,D), P(0,0,D)];
  const front = [P(0,0,D), P(W,0,D), P(W,H,D), P(0,H,D)];
  const right = [P(W,0,0), P(W,0,D), P(W,H,D), P(W,H,0)];

  let bolts = '';
  for (let i = 0; i < 8; i++) {
    const t = i / 7, x = 22 + t * (W - 44);
    for (const z of [16, D - 16]) {
      const [cx, cy] = P(x, 0, z);
      bolts += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="7" ry="4" fill="${AL3}" stroke="${SLATE}" stroke-width="1"/>`;
    }
  }
  let bores = '';
  for (const bx of [95, 205]) {
    const [cx, cy] = P(bx, 0, D / 2);
    bores += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="30" ry="17" fill="#ffffff" stroke="${BLUE}" stroke-width="2.5"/>
              <ellipse cx="${cx.toFixed(1)}" cy="${(cy+5).toFixed(1)}" rx="30" ry="17" fill="none" stroke="${AL3}" stroke-width="1.5"/>`;
  }
  const lead = (x1,y1,x2,y2,tx,ty,t1,t2,col) => `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.6"/>
    <circle cx="${x1}" cy="${y1}" r="3.5" fill="${col}"/>
    <text x="${tx}" y="${ty}" font-family="Calibri,Arial" font-size="19" font-weight="700" fill="${NAVY}">${t1}</text>
    <text x="${tx}" y="${ty+21}" font-family="Calibri,Arial" font-size="16" fill="${MUTED}">${t2}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560">
  <rect width="1000" height="560" fill="#F4F7FB"/>
  <polygon points="${pts(front)}" fill="${AL2}" stroke="${SLATE}" stroke-width="2"/>
  <polygon points="${pts(right)}" fill="${AL3}" stroke="${SLATE}" stroke-width="2"/>
  <polygon points="${pts(top)}" fill="${MACH}" stroke="${BLUE}" stroke-width="2.5"/>
  ${bolts}${bores}
  ${lead(P(60,0,60)[0], P(60,0,60)[1], 262, 208, 42, 196, '2 faces machined flat', '180 × 120 mm each', BLUE)}
  ${lead(P(0,H/2,D)[0]-2, P(0,H/2,D)[1]+10, 150, 452, 42, 470, 'Walls ≈ 3 mm', 'hollow casting, not solid', BLUE)}
  ${lead(P(205,0,D/2)[0]+28, P(205,0,D/2)[1], 690, 152, 700, 146, '2 precision bores', 'Ø40 × 45 mm, reamed', BLUE)}
  ${lead(P(300,0,D-16)[0], P(300,0,D-16)[1]+4, 690, 318, 700, 312, '16 holes, drilled + tapped', 'Ø8 × 20 mm, blind', BLUE)}
  <text x="700" y="470" font-family="Calibri,Arial" font-size="16" fill="${MUTED}">2.8 kg finished · 4.83 kg poured</text>
  <text x="700" y="492" font-family="Calibri,Arial" font-size="16" fill="${MUTED}">1,650 cm² projected shadow</text>
  <text x="40" y="44" font-family="Cambria,Georgia,serif" font-size="25" font-weight="700" fill="${NAVY}">Die-cast aluminium housing</text>
  <text x="40" y="70" font-family="Calibri,Arial" font-size="17" fill="${MUTED}">ADC12 · high-pressure die cast, then machine-finished</text>
</svg>`;
}

// ── 2 · injection-moulded front bumper fascia ────────────────────────────────
function bumper() {
  const lead = (x1,y1,x2,y2,tx,ty,t1,t2,col) => `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.6"/>
    <circle cx="${x1}" cy="${y1}" r="3.5" fill="${col}"/>
    <text x="${tx}" y="${ty}" font-family="Calibri,Arial" font-size="19" font-weight="700" fill="${NAVY}">${t1}</text>
    <text x="${tx}" y="${ty+21}" font-family="Calibri,Arial" font-size="16" fill="${MUTED}">${t2}</text>`;
  const body = `M 150 250 C 150 190, 210 168, 320 162 L 680 162 C 790 168, 850 190, 850 250
                L 850 330 C 850 372, 800 392, 730 396 L 270 396 C 200 392, 150 372, 150 330 Z`;
  let sensors = '';
  for (let i = 0; i < 4; i++) sensors += `<circle cx="${335 + i * 110}" cy="${372}" r="11" fill="#ffffff" stroke="${TEAL}" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560">
  <defs><linearGradient id="pp" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${PP1}"/><stop offset="60%" stop-color="${PP2}"/><stop offset="100%" stop-color="${PP3}"/>
  </linearGradient></defs>
  <rect width="1000" height="560" fill="#F4F7FB"/>
  <path d="${body}" fill="url(#pp)" stroke="${PP3}" stroke-width="2.5"/>
  <path d="M 300 208 L 700 208 C 716 208, 716 262, 700 262 L 300 262 C 284 262, 284 208, 300 208 Z" fill="#1B2027" stroke="${TEAL}" stroke-width="2.5"/>
  <ellipse cx="238" cy="300" rx="46" ry="30" fill="#1B2027" stroke="${TEAL}" stroke-width="2.5"/>
  <ellipse cx="762" cy="300" rx="46" ry="30" fill="#1B2027" stroke="${TEAL}" stroke-width="2.5"/>
  ${sensors}
  <line x1="150" y1="440" x2="850" y2="440" stroke="${SLATE}" stroke-width="1.2"/>
  <line x1="150" y1="432" x2="150" y2="448" stroke="${SLATE}" stroke-width="1.2"/>
  <line x1="850" y1="432" x2="850" y2="448" stroke="${SLATE}" stroke-width="1.2"/>
  <text x="430" y="462" font-family="Calibri,Arial" font-size="17" fill="${SLATE}">1,800 mm</text>
  ${lead(500, 208, 500, 118, 396, 108, 'Grille aperture', '2 slides in the tool', TEAL)}
  ${lead(238, 276, 150, 150, 60, 138, '2 fog-lamp apertures', '2 more slides', TEAL)}
  ${lead(560, 372, 700, 500, 660, 512, '4 parking-sensor holes', '2 further slides — 6 in total', TEAL)}
  ${lead(160, 320, 96, 452, 40, 468, '3.0 mm wall', 'sets the 28.4 s cool time', TEAL)}
  <text x="40" y="44" font-family="Cambria,Georgia,serif" font-size="25" font-weight="700" fill="${NAVY}">Front bumper fascia</text>
  <text x="40" y="70" font-family="Calibri,Arial" font-size="17" fill="${MUTED}">PP-T20 · injection moulded in one shot, then Class-A painted</text>
  <text x="40" y="530" font-family="Calibri,Arial" font-size="16" fill="${MUTED}">4.2 kg · 9,900 cm² projected shadow · 1.6 m² painted area</text>
</svg>`;
}

for (const [name, svg] of [['part-housing', housing()], ['part-bumper', bumper()]]) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/${name}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/${name}.png`);
  console.log('wrote', `${OUT}/${name}.png`);
}
