import { describe, it, expect } from 'vitest';
import { exportFilename, fileSlug } from '../src/export/filename.js';

// L6: the Excel and PDF of one costing were named by different rules
// (should-cost-Unnamed-Part.xlsx vs should-cost-unnamed-part-2026-09-27.pdf).
describe('one naming rule for every export', () => {
  const d = new Date('2026-09-28T10:00:00Z');

  it('the workbook and the PDF of one costing share a name, differing only in extension', () => {
    const x = exportFilename('should-cost', 'Unnamed Part', 'xlsx', d);
    const p = exportFilename('should-cost', 'Unnamed Part', 'pdf', d);
    expect(x).toBe('should-cost-unnamed-part-2026-09-28.xlsx');
    expect(p.replace(/\.pdf$/, '')).toBe(x.replace(/\.xlsx$/, ''));
  });

  it('lower-cases, hyphenates and trims whatever a part is called', () => {
    expect(fileSlug('  Rear Bracket (RH) v2 / Rev-B ')).toBe('rear-bracket-rh-v2-rev-b');
    expect(fileSlug('Côté gauche')).toBe('cote-gauche');
  });

  it('leaves the part out when a report covers none, rather than inventing one', () => {
    expect(exportFilename('sw-should-cost', null, 'pdf', d)).toBe('sw-should-cost-2026-09-28.pdf');
    expect(exportFilename('should-cost', '***', 'pdf', d)).toBe('should-cost-2026-09-28.pdf');
  });
});
