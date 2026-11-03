/**
 * Only levers re-costed through the cost stack are shown (Nov 2026, after the seven-country review): a rule-of-thumb
 * percentage ("automation can reduce this significantly", "a commonly quoted 85 % OEE") never reaches a screen, a report
 * or the AI. The engine may still compute such percentages to ORDER its own lists; nothing outside the engine reads them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(d => d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []);

describe('rule-of-thumb percentages stay inside the engine', () => {
  it('no screen, report or server code reads an insight / lever / issue percentage', () => {
    const offenders = [...files('src/ui'), ...files('src/export'), ...files('server')].filter(f =>
      /potentialSavingPct|expectedSavingPct\s*[^:]|totalPotentialSaving|issue\.savingPct|\bi\.savingPct/.test(readFileSync(f, 'utf8')
        .replace(/expectedSavingPct: number;/g, '')));
    expect(offenders).toEqual([]);
  });
  it('the AI commentary is handed only re-costed levers', () => {
    const src = readFileSync('server/routes/dfm.ts', 'utf8');
    expect(src).toMatch(/\.filter\(o => o\.savingBasis === 'recosted'/);
    expect(src).not.toMatch(/'not priced'/);
  });
  it('the PDF has no generic roadmap and no "not priced" lever row', () => {
    const src = readFileSync('src/export/pdf.ts', 'utf8');
    expect(src).not.toMatch(/dfm\.quickWins|dfm\.longTermChanges|Implementation Roadmap'/);
    expect(src).not.toMatch(/'not priced'/);
  });
});
