/**
 * Phase 2 · F-22 (polish, option (a) decided at Stop 1): the dashboard's five literal box-shadow colours become the
 * existing theme tokens --shadow-md / --shadow-lg, so each theme draws its own shadow. The dialog backdrop
 * (rgba(0,0,0,.45)) has no theme token and stays a literal, as decided.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/styles/kpi-dashboard.css', import.meta.url), 'utf8');
const LITERAL_COLOUR = /rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b/i;
/** Every box-shadow declaration with the selector of its rule. */
function shadows(): { sel: string; value: string }[] {
  const out: { sel: string; value: string }[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const d of m[2].matchAll(/box-shadow\s*:\s*([^;]+);?/g)) out.push({ sel: m[1].trim(), value: d[1].trim() });
  }
  return out;
}

describe('F-22: dashboard shadows use the theme tokens', () => {
  it('no box-shadow carries a literal colour', () => {
    const lit = shadows().filter(s => LITERAL_COLOUR.test(s.value));
    expect(lit).toEqual([]);
  });
  it('the five shadows use --shadow-md / --shadow-lg', () => {
    const by = (needle: string) => shadows().find(s => s.sel.split(',').some(x => x.trim() === needle))?.value;
    expect(by('.kd-menu-pop')).toBe('var(--shadow-lg)');
    expect(by('.kd-ms-pop')).toBe('var(--shadow-lg)');
    expect(by('.kd-card.is-action:hover')).toBe('var(--shadow-md)');
    expect(by('.kd-tip-pop')).toBe('var(--shadow-md)');
    expect(by('.kd-dialog')).toBe('var(--shadow-lg)');
  });
  it('the dialog backdrop literal is left as decided (no token exists for it)', () => {
    expect(css).toContain('.kd-dialog::backdrop { background: rgba(0,0,0,.45); }');
  });
  it('both themes define the tokens used', () => {
    const light = readFileSync(new URL('../src/ui/styles/calculator.css', import.meta.url), 'utf8');
    const dark = readFileSync(new URL('../src/ui/styles/dark-green.css', import.meta.url), 'utf8');
    for (const t of ['--shadow-md:', '--shadow-lg:']) { expect(light.split(t).length - 1).toBeGreaterThanOrEqual(2); expect(dark).toContain(t); }
  });
});
