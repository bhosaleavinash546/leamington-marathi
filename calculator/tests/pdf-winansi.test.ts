/**
 * PDF text safety for the built-in Helvetica font.
 *
 * jsPDF's standard fonts are WinAnsi-encoded. A character outside that set does
 * not drop quietly — jsPDF emits multi-byte garbage and the WHOLE line renders
 * letter-spaced and unreadable. A live gear report printed its route note as
 * "G e a r   r o u t e : ... !'" for exactly this reason, so every free-text
 * line entering the PDF is sanitised.
 *
 * The guard is a WHITELIST, not a Latin-1 cut-off: WinAnsi's upper range does
 * carry the em dash, curly quotes, bullet and ellipsis this codebase's prose is
 * full of, and those render correctly today. Stripping them to fix one arrow
 * would have quietly degraded every existing report.
 */
import { describe, it, expect } from 'vitest';
import { winAnsiSafe } from '../src/export/pdf.js';

describe('winAnsiSafe', () => {
  it('replaces the arrow that garbled the live gear route note', () => {
    const note = 'Gear route: Gear hobbing → Chamfer and deburr → Harden and temper';
    expect(winAnsiSafe(note))
      .toBe('Gear route: Gear hobbing -> Chamfer and deburr -> Harden and temper');
  });

  it('keeps the arithmetic characters WinAnsi actually has', () => {
    // Multiplication sign, pound, em dash, degree, plus-minus, micro, sup-3 —
    // all present in WinAnsi and all rendering correctly on live reports.
    const s = '2.088 kg × £1.60/kg — 20° ± 0.5 µm, 266 cm³';
    expect(winAnsiSafe(s)).toBe(s);
  });

  it('keeps the typographic characters WinAnsi maps into its upper range', () => {
    const s = '‘quoted’ “blank” • bullet … en–dash €5 ™';
    expect(winAnsiSafe(s)).toBe(s);
  });

  it('drops emoji and symbols that would corrupt their whole line', () => {
    expect(winAnsiSafe('⚠ check this')).toBe(' check this');
    expect(winAnsiSafe('⛔ blocked ✓ done')).toBe(' blocked OK done');
    expect(winAnsiSafe('⚙ gear 🔥')).toBe(' gear ');
  });

  it('normalises maths comparators engineers type but WinAnsi lacks', () => {
    expect(winAnsiSafe('class ≥ 6 and ≤ 8, ≈ 3 mm'))
      .toBe('class >= 6 and <= 8, ~ 3 mm');
  });

  it('leaves any surviving output free of characters jsPDF cannot encode', () => {
    const messy = 'route → grind ✓ ⚠ ≥ class 6 🚀 — done';
    // Nothing above Latin-1 except the explicitly-allowed WinAnsi specials.
    const out = winAnsiSafe(messy);
    const disallowed = out.match(
      /[^ -ÿ–—‘’‚“”„†‡•…‰‹›€™ŒœŠšŸŽžƒˆ˜]/g);
    expect(disallowed).toBeNull();
  });
});

/** The characters WinAnsiEncoding can actually represent: Latin-1 minus the
 *  C1 control band, plus the 27 typographic characters WinAnsi puts there. */
const WINANSI = new Set<string>([
  ...Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)),
  ...Array.from({ length: 0x60 }, (_, i) => String.fromCharCode(0xA0 + i)),
  ...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ\u2018\u2019\u201c\u201d•–—˜™š›œžŸ',
]);

describe('AUDIT: every string reaching jsPDF is sanitised, not just two of them', () => {
  // Found by exporting all 18 commodities and inspecting the PDFs: `winAnsiSafe`
  // existed but was applied at 2 of ~110 text-writing sites. Machine names and
  // material source notes bypassed it, jsPDF switched them to UTF-16BE, and the
  // document embeds NO font files (14 standard fonts, WinAnsiEncoding only) — so
  // they could not render. Real examples pulled from the live exports:
  const REAL_STRINGS_FROM_LIVE_EXPORTS = [
    'CNC Gear Hobber — small (≤m4, ≤Ø200)',
    'CRC €781/t → £0.67/kg mill + £0.19/kg stockhold',
    'CNC Gear Shaper — small (≤m6, ≤Ø200)',
  ];

  for (const s of REAL_STRINGS_FROM_LIVE_EXPORTS) {
    it(`sanitises: ${s.slice(0, 34)}…`, () => {
      const out = winAnsiSafe(s);
      // Nothing left that forces jsPDF out of WinAnsi. NOTE this is NOT a
      // Latin-1 test: WinAnsi's 0x80-0x9F band carries em dash, curly quotes,
      // bullet, ellipsis and euro, all of which encode fine and must survive.
      for (const ch of out) {
        expect(WINANSI.has(ch), `${ch} (U+${ch.codePointAt(0)!.toString(16)}) in "${out}"`)
          .toBe(true);
      }
      // And the meaning survives — these are not blanked out.
      expect(out.length).toBeGreaterThan(s.length * 0.7);
    });
  }

  it('the characters that actually broke the reports are all mapped', () => {
    expect(winAnsiSafe('≤')).toBe('<=');
    expect(winAnsiSafe('≥')).toBe('>=');
    expect(winAnsiSafe('→')).toBe('->');
    // Ø and € ARE valid WinAnsi and must be preserved, not stripped.
    expect(winAnsiSafe('Ø')).toBe('Ø');
    expect(winAnsiSafe('€')).toBe('€');
  });
});
