// GEOMETRY QA FOR A DECK, WHEN THERE IS NO RENDERER.
//
// The pptx workflow says to convert the deck to images and look at every slide.
// LibreOffice is not functional in this container — it refuses every input,
// including a plain text file — so there is nothing to look at. Shipping a deck
// unchecked because the checker is broken is not an option, so the checks that
// matter are done on the slide XML instead:
//
//   * every shape inside the canvas, and inside the page margin
//   * text boxes that overlap each other (images may sit under text by design)
//   * text that cannot fit its box at its own font size
//
// This is weaker than looking at a render — it cannot see ugly — but it catches
// the three faults that are actually user-visible, and it catches them on every
// slide rather than on the ones somebody remembered to open.
//
//   node scripts/pptx-qa.mjs deck.pptx
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/pptx-qa.mjs deck.pptx'); process.exit(2); }

const EMU = 914400;
const dir = mkdtempSync(join(tmpdir(), 'pptxqa-'));
execFileSync('python3', ['-c',
  'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', file, dir]);

const pres = readFileSync(join(dir, 'ppt/presentation.xml'), 'utf-8');
const size = pres.match(/sldSz[^/]*cx="(\d+)"\s+cy="(\d+)"/);
const CW = Number(size[1]) / EMU;
const CH = Number(size[2]) / EMU;
const MARGIN = 0.5;

// Rough advance width per character as a fraction of the font size. Calibri and
// Cambria at mixed case sit near 0.50; using a slightly generous figure means a
// borderline box is FLAGGED rather than waved through, which is the direction an
// automated check should err in.
const CHAR_W = 0.52;
const LINE_H = 1.22;

const slideFiles = readdirSync(join(dir, 'ppt/slides'))
  .filter((f) => f.endsWith('.xml'))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const issues = [];
const note = (slide, kind, msg) => issues.push({ slide, kind, msg });

for (const f of slideFiles) {
  const n = Number(f.match(/\d+/)[0]);
  const xml = readFileSync(join(dir, 'ppt/slides', f), 'utf-8');

  // One entry per top-level shape: its frame, whether it holds text, and the text.
  const shapes = [];
  const re = /<p:(sp|pic|graphicFrame)\b[\s\S]*?<\/p:\1>/g;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[0];
    const off = body.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
    const ext = body.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    if (!off || !ext) continue;
    const texts = [...body.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => t[1]);
    const sizes = [...body.matchAll(/sz="(\d+)"/g)].map((s) => Number(s[1]) / 100);
    shapes.push({
      kind: m[1],
      x: Number(off[1]) / EMU, y: Number(off[2]) / EMU,
      w: Number(ext[1]) / EMU, h: Number(ext[2]) / EMU,
      text: texts.join(' ').replace(/\s+/g, ' ').trim(),
      fontPt: sizes.length ? Math.max(...sizes) : null,
      isTable: m[1] === 'graphicFrame',
    });
  }

  for (const s of shapes) {
    const r = s.x + s.w; const b = s.y + s.h;
    if (s.x < -0.01 || s.y < -0.01 || r > CW + 0.01 || b > CH + 0.01) {
      note(n, 'OFF-CANVAS', `${s.kind} at ${s.x.toFixed(2)},${s.y.toFixed(2)} ${s.w.toFixed(2)}x${s.h.toFixed(2)} extends to ${r.toFixed(2)},${b.toFixed(2)} (canvas ${CW}x${CH})`);
    } else if (s.x < MARGIN - 0.01 || s.y < MARGIN - 0.01 || r > CW - MARGIN + 0.01 || b > CH - MARGIN + 0.01) {
      // The footer sits low by design; everything else should respect the margin.
      if (!/\d+\/\d+$/.test(s.text)) {
        note(n, 'margin', `${s.kind}${s.text ? ` "${s.text.slice(0, 34)}"` : ''} within ${MARGIN}" of an edge`);
      }
    }

    // Text fit. Tables manage their own row heights, so they are skipped.
    if (s.text && s.fontPt && !s.isTable) {
      const charsPerLine = Math.max(1, Math.floor((s.w * 72) / (s.fontPt * CHAR_W)));
      const lines = s.text.split(/\s+/).reduce((acc, word) => {
        const last = acc[acc.length - 1];
        if (last && (last + ' ' + word).length <= charsPerLine) acc[acc.length - 1] = `${last} ${word}`;
        else acc.push(word);
        return acc;
      }, []).length;
      const needed = (lines * s.fontPt * LINE_H) / 72;
      if (needed > s.h + 0.02) {
        note(n, 'OVERFLOW', `"${s.text.slice(0, 44)}${s.text.length > 44 ? '...' : ''}" needs ~${needed.toFixed(2)}" in a ${s.h.toFixed(2)}" box (${lines} lines at ${s.fontPt}pt)`);
      }
    }
  }

  // Text-on-text overlap. Images deliberately sit under text, so only text
  // boxes are compared with each other.
  const texts = shapes.filter((s) => s.text && s.kind === 'sp');
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]; const b = texts[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0.06 && oy > 0.06) {
        note(n, 'overlap', `"${a.text.slice(0, 26)}" and "${b.text.slice(0, 26)}" overlap by ${ox.toFixed(2)}x${oy.toFixed(2)}"`);
      }
    }
  }
}

rmSync(dir, { recursive: true, force: true });

const hard = issues.filter((i) => i.kind === i.kind.toUpperCase());
console.log(`\n  ${file} · ${slideFiles.length} slides · canvas ${CW}x${CH}"\n`);
if (!issues.length) console.log('  no geometry issues\n');
for (const i of issues) console.log(`  ${i.kind === i.kind.toUpperCase() ? '!!' : '  '} slide ${String(i.slide).padStart(2)}  ${i.kind.padEnd(10)} ${i.msg}`);
console.log(`\n  ${hard.length} hard (off-canvas / overflow) · ${issues.length - hard.length} soft\n`);
process.exit(hard.length ? 1 : 0);
