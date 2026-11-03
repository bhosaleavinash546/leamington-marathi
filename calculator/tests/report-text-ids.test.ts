/**
 * No internal library id in the TEXT a reader sees (7-country review, 3 Nov 2026): the reports printed
 * "steel → mat-steel-38mnvs6", "lab-cn-skilled — the rate book's own China rate", "Capex = mach-haas-vf2 £53,204",
 * "(rate id mach-hmc-400)" and, in a China report, "no material £". The Traceability ID column keeps the ids on purpose.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reportNoteText } from '../src/export/money-text.js';
import { materialGradeName } from '../src/engine/cost-input-rules/derive/material.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

describe('library ids become names in report text', () => {
  it('a rate note names the machine it quotes and drops "(rate id …)"', () => {
    const vf2 = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-haas-vf2')!;
    const t = reportNoteText('Capex £56,004 = mach-haas-vf2 £53,204 (Haas VF-2 US list) (rate id mach-hmc-400)');
    expect(t).toContain(`= ${vf2.machineClass} £53,204`);
    expect(t).not.toMatch(/mach-|rate id/);
  });
  it('an unknown id-like word is left as written', () => {
    expect(reportNoteText('see mat-not-a-library-grade')).toBe('see mat-not-a-library-grade');
  });
  it('a rule note prints the grade, not its id', () => {
    const g = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === 'mat-steel-38mnvs6')!.grade;
    expect(materialGradeName('mat-steel-38mnvs6')).toBe(g);
    expect(materialGradeName('mat-steel-38mnvs6', buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN' as never))).toBe(g);
    for (const f of ['casting', 'machining', 'forging']) {
      const src = readFileSync(`src/engine/cost-input-rules/commodities/${f}.ts`, 'utf8');
      expect(src).not.toMatch(/→ \$\{id( \?\? [^}]+)?\} \(representative/);
    }
  });
  it('a country book\'s labour row does not open with its id', () => {
    const cn = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN' as never);
    for (const l of cn.labour.filter(x => x.id.startsWith('lab-cn-'))) expect(l.sourceNote).not.toMatch(/^lab-/);
  });
  it('no literal £ in a rule note that every country prints', () => {
    expect(readFileSync('src/engine/cost-input-rules/commodities/blow-moulding.ts', 'utf8')).not.toContain('no material £');
  });
});

describe('the routing basis names the machine', () => {
  it('no machine id in a routing detail', async () => {
    const src = (await import('node:fs')).readFileSync('src/engine/routing-optimiser.ts', 'utf8');
    expect(src).not.toMatch(/\$\{(primary|drill|lathe|second\??)\.id\} £/);
  });
});
