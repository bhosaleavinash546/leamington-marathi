/**
 * Phase 2 · A-29 (P3): the KPI cards' "i" buttons get a 24 × 24 px hit area (WCAG 2.2 2.5.8 target size) without
 * changing how they look: the 18 px circle stays; an invisible, centred 24 × 24 ::after extends where a tap lands.
 * The live check (corners of a 24 px square on each button hit the button; screenshots unchanged) is in
 * phase2-evidence/block3.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/styles/kpi-dashboard.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].split(',').some(s => s.trim() === sel)).map(m => m[2]).join(';');
const decl = (body: string, prop: string) => body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`))?.[1].trim();

describe('A-29: 24 × 24 px hit area on the "i" buttons, same look', () => {
  it('the visible button is unchanged (18 px circle)', () => {
    const b = rule('.kd-tip');
    expect(decl(b, 'width')).toBe('18px');
    expect(decl(b, 'height')).toBe('18px');
    expect(decl(b, 'border-radius')).toBe('50%');
  });
  it('an invisible 24 × 24 ::after, centred on the button, extends the hit area', () => {
    expect(decl(rule('.kd-tip'), 'position')).toBe('relative');
    const a = rule('.kd-tip::after');
    expect(decl(a, 'content')).toBe("''");
    expect(decl(a, 'position')).toBe('absolute');
    expect(decl(a, 'width')).toBe('24px');
    expect(decl(a, 'height')).toBe('24px');
    expect(decl(a, 'left')).toBe('50%');
    expect(decl(a, 'top')).toBe('50%');
    expect(decl(a, 'transform')).toBe('translate(-50%, -50%)');
    for (const p of ['background', 'border', 'box-shadow', 'outline']) expect(decl(a, p), p).toBeUndefined();
  });
});
