/**
 * One identity across the app and its documents (I5).
 *
 * The decks and the rate-card workbook used navy #1F2A44 / #16325C with their
 * own accents; the app's light theme used a different blue. Colours now live in
 * src/brand/brand.json, read by the app's light theme (generated brand.css), the
 * PDF export, the rate-card workbook builder and the deck generators.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import brand from '../src/brand/brand.json';

const ROOT = join(__dirname, '..');
const lum = (h: string) => {
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('brand tokens', () => {
  it('every on-light text colour passes AA on white and on the page tint', () => {
    const text = ['navy', 'blue', 'violet', 'teal', 'green', 'amber', 'red', 'slate', 'muted'] as const;
    const fails = text.filter(k => Math.min(contrast(brand.onLight[k], 'FFFFFF'), contrast(brand.onLight[k], brand.onLight.page)) < 4.5);
    expect(fails).toEqual([]);
  });

  it('the app stylesheet is generated from them and up to date', () => {
    expect(() => execFileSync('node', [join(ROOT, 'scripts/brand-css.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
    const css = readFileSync(join(ROOT, 'src/ui/styles/brand.css'), 'utf8');
    expect(css).toContain(`--accent: #${brand.onLight.blue};`);
    expect(readFileSync(join(ROOT, 'src/ui/main.ts'), 'utf8')).toMatch(/import '\.\/styles\/brand\.css';/);
  });

  it('the PDF export and the rate-card workbook read them, not their own literals', () => {
    expect(readFileSync(join(ROOT, 'src/export/pdf.ts'), 'utf8')).toMatch(/const NAVY: *RGB = brandRgb\('navy'\)/);
    expect(readFileSync(join(ROOT, 'scripts/build-rate-converter-xlsx.ts'), 'utf8')).toMatch(/const INK = brandArgb\('navy'\)/);
  });

  it('every deck generator reads them', () => {
    const gens = ['build_pptx.py', 'build_agentic_pptx.py', 'build_blueprint_pptx.py', 'build_capee_business_case_pptx.py',
      'build_capee_options_pptx.py', 'build_option3_business_case_pptx.py', 'build_rate_card_slide_pptx.py',
      'build_bumper_shouldcost_xlsx.py', 'build_workflow_deck.mjs', 'build_workflow_part_illustrations.mjs', 'build_cad_viewer_study_js.js'];
    const missing = gens.filter(g => !/brand/.test(readFileSync(join(ROOT, '..', g), 'utf8')));
    expect(missing).toEqual([]);
  });
});
