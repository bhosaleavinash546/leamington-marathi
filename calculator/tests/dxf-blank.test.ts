/**
 * Reading a flat blank out of a DXF.
 *
 * Every fixture here is a shape whose area and perimeter can be worked out on
 * paper, and the paper answer is what is asserted — not a number captured from
 * a previous run, which would only prove the reader still does whatever it did
 * last time.
 *
 * Arcs are tessellated at 2°, so an arc's measured area lands a hundredth of a
 * percent under the true one. The assertions are therefore relative, with the
 * tolerance stated: exact where the maths is exact, 0.1% where a curve has been
 * approximated. A costing tolerance is percent, not parts per million, so this
 * is comfortable — but it is stated rather than hidden behind a rounded
 * `toBeCloseTo`.
 */
import { describe, it, expect } from 'vitest';
import { measureBlankDxf } from '../server/utils/dxf-blank.js';
import { blankHashOf, putBlank, getBlank } from '../server/utils/geometry-store.js';

/** A minimal DXF carrying just these entities. */
const dxf = (entities: string, header = '') =>
  `0\nSECTION\n2\nHEADER\n${header}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;

const lwpoly = (pts: Array<[number, number, number?]>, closed = true) =>
  `0\nLWPOLYLINE\n90\n${pts.length}\n70\n${closed ? 1 : 0}\n`
  + pts.map(([x, y, b]) => `10\n${x}\n20\n${y}\n` + (b ? `42\n${b}\n` : '')).join('');

const line = (x1: number, y1: number, x2: number, y2: number) =>
  `0\nLINE\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}\n`;

const circle = (cx: number, cy: number, r: number) =>
  `0\nCIRCLE\n10\n${cx}\n20\n${cy}\n40\n${r}\n`;

/** DXF angles are degrees, counter-clockwise. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) =>
  `0\nARC\n10\n${cx}\n20\n${cy}\n40\n${r}\n50\n${a0}\n51\n${a1}\n`;

/** Within `pct` percent of the expected value. */
const near = (got: number, want: number, pct: number) =>
  expect(Math.abs(got - want) / want).toBeLessThan(pct / 100);

const RECT = lwpoly([[0, 0], [100, 0], [100, 50], [0, 50]]);

describe('a plain rectangular blank', () => {
  const m = measureBlankDxf(dxf(RECT));

  it('measures the area a rectangle has', () => {
    expect(m.grossAreaMm2).toBeCloseTo(100 * 50, 9);
    expect(m.netAreaMm2).toBeCloseTo(5000, 9);
  });

  it('measures the cut length', () => {
    expect(m.outerPerimeterMm).toBeCloseTo(2 * (100 + 50), 9);
    expect(m.holePerimeterMm).toBe(0);
  });

  it('reports the strip rectangle long side first', () => {
    expect(m.boundingRectMm).toEqual({ lengthMm: 100, widthMm: 50 });
    expect(m.rectangleFill).toBeCloseTo(1, 9);
  });
});

describe('holes are metal you have already bought', () => {
  // Ø20 hole: area π·10² = 314.159, edge 2π·10 = 62.832.
  const m = measureBlankDxf(dxf(RECT + circle(50, 25, 10)));

  it('leaves the gross area alone — the slug is scrap you paid for', () => {
    // The distinction the whole module turns on. Netting the hole off here
    // would quietly hand back the cost of every pierced hole on the part.
    expect(m.grossAreaMm2).toBeCloseTo(5000, 9);
  });

  it('takes the hole out of the net area', () => {
    expect(m.netAreaMm2).toBeCloseTo(5000 - Math.PI * 100, 6);
    expect(m.holeCount).toBe(1);
  });

  it('measures the hole edge separately, because piercing is its own operation', () => {
    expect(m.holePerimeterMm).toBeCloseTo(2 * Math.PI * 10, 6);
    expect(m.outerPerimeterMm).toBeCloseTo(300, 9);
  });
});

describe('a profile drawn as loose lines and arcs', () => {
  /**
   * An obround 100 long × 50 wide: two 50 mm straights and two Ø50 semicircular
   * ends. Area = 50×50 + π·25² = 2500 + 1963.495 = 4463.495.
   * Perimeter = 2×50 + 2π·25 = 100 + 157.080 = 257.080.
   *
   * The entities are deliberately out of order and one runs backwards, because
   * that is how a DXF arrives — FASTBLANK smooths a profile into tangent lines
   * and arcs, and nothing promises they are written in a walkable sequence.
   */
  const m = measureBlankDxf(dxf(
    arc(75, 25, 25, -90, 90)                 // right end
    + line(25, 0, 75, 0)                     // bottom, left to right
    + arc(25, 25, 25, 90, 270)               // left end
    + line(25, 50, 75, 50),                  // top, written left to right — reversed on joining
  ));

  it('joins them into one closed loop', () => {
    near(m.grossAreaMm2, 2500 + Math.PI * 625, 0.1);
    expect(m.warnings.filter(w => w.includes('did not join'))).toEqual([]);
  });

  it('measures the cut length round the whole profile', () => {
    near(m.outerPerimeterMm, 100 + 2 * Math.PI * 25, 0.1);
  });

  it('reports how much of its rectangle the blank actually fills', () => {
    // 4463.5 / (100 × 50) = 0.893. This is the number that says a bounding-box
    // blank would have bought 12% more metal than the part needs.
    expect(m.boundingRectMm).toEqual({ lengthMm: 100, widthMm: 50 });
    near(m.rectangleFill, (2500 + Math.PI * 625) / 5000, 0.2);
  });
});

describe('bulges — the arcs a polyline carries inline', () => {
  it('reads two semicircles as the circle they make', () => {
    // bulge = tan(θ/4); bulge 1 → θ = π, a semicircle. Two of them, Ø50.
    const m = measureBlankDxf(dxf(lwpoly([[-25, 0, 1], [25, 0, 1]])));
    near(m.grossAreaMm2, Math.PI * 625, 0.1);
    near(m.outerPerimeterMm, 2 * Math.PI * 25, 0.1);
  });

  it('takes the sweep the sign asks for, not the short way round', () => {
    // Negative bulge is clockwise. Mirrored, the circle is the same size — if
    // the sign were dropped the two arcs would double back and the area would
    // collapse.
    const m = measureBlankDxf(dxf(lwpoly([[-25, 0, -1], [25, 0, -1]])));
    near(m.grossAreaMm2, Math.PI * 625, 0.1);
  });
});

describe('units are read, not assumed quietly', () => {
  it('scales an inch file to millimetres', () => {
    // 1 inch square = 25.4² = 645.16 mm². Getting this wrong is a 645× error.
    const m = measureBlankDxf(dxf(lwpoly([[0, 0], [1, 0], [1, 1], [0, 1]]),
                                  '9\n$INSUNITS\n70\n1\n'));
    expect(m.units).toBe('inch');
    expect(m.unitsAssumed).toBe(false);
    expect(m.grossAreaMm2).toBeCloseTo(25.4 * 25.4, 6);
    expect(m.outerPerimeterMm).toBeCloseTo(4 * 25.4, 6);
  });

  it('says so when the file did not declare them', () => {
    const m = measureBlankDxf(dxf(RECT));
    expect(m.units).toBe('mm');
    expect(m.unitsAssumed).toBe(true);
  });

  it('honours a declared millimetre file without assuming', () => {
    const m = measureBlankDxf(dxf(RECT, '9\n$INSUNITS\n70\n4\n'));
    expect(m.unitsAssumed).toBe(false);
    expect(m.grossAreaMm2).toBeCloseTo(5000, 9);
  });
});

describe('it says what it could not do, rather than measuring short', () => {
  it('refuses a file with no closed profile', () => {
    expect(() => measureBlankDxf(dxf(line(0, 0, 100, 0))))
      .toThrow(/No closed profile/);
  });

  it('flags an outline with a gap in it', () => {
    // Three sides of a rectangle. A silent 0 here would read downstream as a
    // free part; a partial area would read as a cheap one.
    const m = measureBlankDxf(dxf(
      RECT + line(200, 0, 300, 0) + line(300, 0, 300, 50) + line(300, 50, 200, 50)));
    expect(m.warnings.some(w => /did not join/.test(w))).toBe(true);
    expect(m.grossAreaMm2).toBeCloseTo(5000, 9);
  });

  it('flags a second blank sitting on the same sheet', () => {
    const m = measureBlankDxf(dxf(RECT + lwpoly([[200, 0], [260, 0], [260, 40], [200, 40]])));
    expect(m.warnings.some(w => /more than one blank/.test(w))).toBe(true);
    expect(m.grossAreaMm2).toBeCloseTo(5000, 9);   // the larger one, not the sum
  });

  it('flags a spline as approximate rather than passing it off', () => {
    const m = measureBlankDxf(dxf(
      `0\nSPLINE\n70\n1\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n50\n10\n0\n20\n50\n`));
    expect(m.warnings.some(w => /SPLINE/.test(w))).toBe(true);
  });

  it('names an entity type it does not measure', () => {
    const m = measureBlankDxf(dxf(RECT + `0\nELLIPSE\n10\n0\n20\n0\n`));
    expect(m.warnings.some(w => /ELLIPSE/.test(w))).toBe(true);
    expect(m.entities.ELLIPSE).toBe(1);
  });

  it('ignores geometry in BLOCKS, which is not on the sheet', () => {
    // A title block lives in BLOCKS and would otherwise be measured as the
    // largest closed shape in the file — and become the blank.
    const withBlock = `0\nSECTION\n2\nBLOCKS\n`
      + lwpoly([[0, 0], [5000, 0], [5000, 5000], [0, 5000]])
      + `0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${RECT}0\nENDSEC\n0\nEOF\n`;
    expect(measureBlankDxf(withBlock).grossAreaMm2).toBeCloseTo(5000, 9);
  });
});

describe('the old POLYLINE/VERTEX form', () => {
  it('reads it the same as the modern one', () => {
    const verts = [[0, 0], [100, 0], [100, 50], [0, 50]]
      .map(([x, y]) => `0\nVERTEX\n10\n${x}\n20\n${y}\n`).join('');
    const m = measureBlankDxf(dxf(`0\nPOLYLINE\n70\n1\n${verts}0\nSEQEND\n`));
    expect(m.grossAreaMm2).toBeCloseTo(5000, 9);
    expect(m.outerPerimeterMm).toBeCloseTo(300, 9);
  });
});

/**
 * Where a measured blank is kept.
 *
 * Addressed by the SHA-256 of the DXF, deliberately NOT by the CAD file's hash.
 * The blank is a second file the engineer chose, not a property of the part:
 * two people costing the same STEP can bring different blanks, and keying it by
 * the part would hand one of them the other's profile silently.
 */
describe('the blank is addressed by its own contents', () => {
  it('gives two different DXFs two different addresses', () => {
    const a = Buffer.from(dxf(RECT));
    const b = Buffer.from(dxf(lwpoly([[0, 0], [200, 0], [200, 50], [0, 50]])));
    expect(blankHashOf(a)).not.toBe(blankHashOf(b));
    expect(blankHashOf(a)).toBe(blankHashOf(Buffer.from(dxf(RECT))));   // same bytes, same address
  });

  it('gives back what was stored, so a reanalyse keeps the developed blank', () => {
    // Without this a second pass over the same part drops back to the
    // bounding-box estimate and the material cost moves with nobody asking.
    const h = blankHashOf(Buffer.from(dxf(RECT)));
    putBlank(h, { grossAreaMm2: 5000, source: 'FASTBLANK DXF' });
    expect(getBlank<{ grossAreaMm2: number }>(h)?.grossAreaMm2).toBe(5000);
  });

  it('refuses anything that is not a hash', () => {
    // The address comes back from the client on a reanalyse. It can only name a
    // blank the server measured — it cannot be a path, and it cannot be numbers.
    expect(getBlank('../../etc/passwd')).toBeNull();
    expect(getBlank('')).toBeNull();
    expect(getBlank('deadbeef')).toBeNull();
  });
});
