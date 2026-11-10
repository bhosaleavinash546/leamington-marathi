/**
 * Symbol fonts whose letters are drawing symbols. Only the ASME Y14.5 lower-case letter convention is mapped — the
 * layout shared by AutoCAD "GDT" (gdt.shx) / "AMGDT", Autodesk Inventor "AIGDT", SolidWorks "SWGDT" and fonts named
 * "Y14.5…". A font is recognised by its NAME; a letter in any other font stays a letter.
 */
export const GDT_FONT_MAP: Record<string, string> = {
  a: '∠', b: '⟂', c: '⏥', d: '⌓', e: '○', f: '∥', g: '⌭', h: '↗', i: '⌯', j: '⌖', k: '⌒', l: 'Ⓛ', m: 'Ⓜ', n: 'Ø', o: '□', p: 'Ⓟ',
  q: '℄', r: '◎', s: 'Ⓢ', t: '⌰', u: '⏤', v: '⌴', w: '⌵', x: '↧', y: '⌲', z: '⌳',
};
export const GDT_FONT_NAME = /(?:^|[^A-Za-z])(?:AM|AI|SW)?GDT(?:[^A-Za-z]|$)|Y14[.\s-]?5/i;
