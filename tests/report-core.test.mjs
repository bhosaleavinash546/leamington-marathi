// The pure decisions behind the exported reports.
//
// These were inline in export-service.ts, which is 1,100 lines of jsPDF /
// exceljs / pptxgenjs drawing that node:test cannot execute without a build
// step — so none of them had ever been tested. Extracting them found a real
// divergence: the PDF's business-case ROI ranking used its own money parser
// that read the LOW END of a range where the server and UI take the midpoint.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, difficultyTone, roiRanked, colPositions, safeFilename, portfolioValue } from '../src/services/report-core.mjs';
import { parseAnnualValueMid } from '../idea-quality.mjs';

describe('parseMoney', () => {
  it('takes the MIDPOINT of a range — the format the model writes most often', () => {
    assert.equal(parseMoney('£350K–£650K at 80,000 units/yr'), 500_000);
    assert.equal(parseMoney('£1.2M–£2.4M'), 1_800_000);
  });

  it('handles the currency symbols the old exporter parser missed', () => {
    assert.equal(parseMoney('₹40K'), 40_000);
    assert.equal(parseMoney('¥1.5M'), 1_500_000);
    assert.equal(parseMoney('€250K'), 250_000);
  });

  it('is safe on absent or unparseable input', () => {
    for (const v of ['', undefined, null, 'TBD', 'to be confirmed']) assert.equal(parseMoney(v), 0);
  });

  // The regression guard that matters. idea-quality.mjs drives the on-screen
  // ranking; this drives the exported one. If they disagree, an exported
  // business case orders ideas differently from the screen the reader just saw,
  // with nothing to explain why.
  it('AGREES with the server ranking parser on every shape', () => {
    const cases = [
      '£350K–£650K at 80,000 units/yr', '€1.2M', '$40k', '₹40K',
      '£500K', '£1.2M–£2.4M', '', 'TBD', '12%', '£0',
    ];
    for (const c of cases) {
      assert.equal(parseMoney(c), parseAnnualValueMid(c), `diverged on ${JSON.stringify(c)}`);
    }
  });
});

describe('roiRanked', () => {
  const mk = (title, annualValue) => ({ title, costSavingPotential: { annualValue } });

  it('orders by annual value, richest first', () => {
    const out = roiRanked([mk('small', '£100K'), mk('big', '£900K'), mk('mid', '£400K')]);
    assert.deepEqual(out.map(i => i.title), ['big', 'mid', 'small']);
  });

  it('ranks a range by its midpoint, not its low end', () => {
    // The exact case the old parser got wrong: 350–650 midpoints at 500, which
    // beats a flat 400. Reading the low end would have put them the other way.
    const out = roiRanked([mk('flat', '£400K'), mk('range', '£350K–£650K')]);
    assert.deepEqual(out.map(i => i.title), ['range', 'flat']);
  });

  it('is stable on ties and puts unvalued ideas last', () => {
    const out = roiRanked([mk('a', '£100K'), mk('none', undefined), mk('b', '£100K')]);
    assert.deepEqual(out.map(i => i.title), ['a', 'b', 'none']);
  });

  it('is safe on rubbish input', () => {
    assert.deepEqual(roiRanked(null), []);
    assert.deepEqual(roiRanked([]), []);
  });
});

describe('colPositions', () => {
  it('accumulates widths from the left margin', () => {
    assert.deepEqual(colPositions([10, 20, 30], 5), [5, 15, 35]);
  });

  it('handles the empty and single-column cases', () => {
    assert.deepEqual(colPositions([], 5), []);
    assert.deepEqual(colPositions([40], 18), [18]);
  });
});

describe('difficultyTone', () => {
  it('maps the three known values', () => {
    assert.equal(difficultyTone('Low'), 'low');
    assert.equal(difficultyTone('Medium'), 'medium');
    assert.equal(difficultyTone('High'), 'high');
  });

  it('degrades an unknown value to the MOST cautious reading, not the kindest', () => {
    // A malformed difficulty rendering as green would understate the work.
    for (const v of ['', undefined, 'Trivial', 'low']) assert.equal(difficultyTone(v), 'high');
  });
});

describe('safeFilename', () => {
  it('strips what Windows and Excel reject', () => {
    assert.equal(safeFilename('BEV / MHEV'), 'BEV - MHEV');
    assert.equal(safeFilename('a:b*c?d"e<f>g|h'), 'a-b-c-d-e-f-g-h');
  });
  it('is safe on absent input', () => {
    assert.equal(safeFilename(undefined), '');
  });
});

describe('portfolioValue', () => {
  const mk = (v) => ({ costSavingPotential: { annualValue: v } });

  it('sums only what was actually stated, and says what it skipped', () => {
    const p = portfolioValue([mk('£100K'), mk('£200K'), mk(undefined)]);
    assert.equal(p.annualTotal, 300_000);
    assert.equal(p.stated, 2);
    assert.match(p.note, /1 of 3 ideas state no annual value/);
  });

  it('returns NULL rather than zero when nothing was stated', () => {
    // A portfolio with no stated values is not a portfolio worth nothing.
    const p = portfolioValue([mk(undefined), mk('TBD')]);
    assert.equal(p.annualTotal, null);
  });

  it('has no note when every idea states a value', () => {
    assert.equal(portfolioValue([mk('£100K')]).note, null);
  });
});
