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
