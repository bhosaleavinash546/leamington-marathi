/**
 * UI/UX review, second pass (Oct 2026) — docs/ui/ui-ux-review-2026-10.md §6.
 *  - Inline validation reads the field's own limits and a few cost rules.
 *  - Help and the demo gallery are built on first open; their shells stay live.
 *  - Result panels use theme colours, so dark mode does not show white boxes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fieldMessage } from '../src/ui/field-validation.js';

const field = (o: Partial<{ id: string; value: string; min: string; max: string; required: boolean; badInput: boolean }>) => ({
  type: 'number', disabled: false, readOnly: false, id: o.id ?? 'x', value: o.value ?? '', min: o.min ?? '', max: o.max ?? '',
  required: o.required ?? false, validity: { badInput: o.badInput ?? false },
}) as unknown as HTMLInputElement;

describe('inline validation', () => {
  it('uses the field min / max', () => {
    expect(fieldMessage(field({ value: '-1', min: '0' }))).toBe('Must be at least 0.');
    expect(fieldMessage(field({ value: '120', min: '0', max: '100' }))).toBe('Must be between 0 and 100.');
    expect(fieldMessage(field({ value: '50', min: '0', max: '100' }))).toBeNull();
  });
  it('empty is fine unless required; junk is not a number', () => {
    expect(fieldMessage(field({ value: '' }))).toBeNull();
    expect(fieldMessage(field({ value: '', required: true }))).toBe('Required.');
    expect(fieldMessage(field({ badInput: true }))).toBe('Enter a number.');
  });
  it('cost rules: a zero cycle time, part weight or volume is flagged', () => {
    expect(fieldMessage(field({ id: 'mach-op1-ct', value: '0', min: '0' }))).toMatch(/time of 0/);
    expect(fieldMessage(field({ id: 'mach-net-wt', value: '0', min: '0' }))).toMatch(/weight of 0/);
    expect(fieldMessage(field({ id: 'annual-volume', value: '0', min: '0' }))).toMatch(/volume of 0/);
    expect(fieldMessage(field({ id: 'mach-op1-ct', value: '0.05', min: '0' }))).toBeNull();
  });
});

describe('help and demo gallery are built on first open', () => {
  const index = readFileSync('index.html', 'utf8');
  it('every help section but the first holds its content in a lazy template', () => {
    const secs = Array.from(index.matchAll(/<div class="help-section[^"]*" id="([^"]+)">(<template data-cv-lazy>)?/g));
    expect(secs.length).toBeGreaterThan(10);
    for (const [, id, lazy] of secs) {
      if (id === 'help-getting-started') expect(lazy, id).toBeUndefined();
      else expect(lazy, id).toBeDefined();
    }
  });
  it('the demo gallery body is lazy; the modal shell and close button are not', () => {
    expect(index).toMatch(/id="demo-gallery-body"[^>]*><template data-cv-lazy>/);
    const shell = index.slice(index.indexOf('id="demo-modal"'), index.indexOf('id="demo-gallery-body"'));
    expect(shell).toContain('id="close-demo-modal"');
    expect(shell).not.toContain('data-cv-lazy');
  });
  it('demo cards are bound once, by delegation', () => {
    expect(index).not.toMatch(/querySelectorAll\('\.demo-card'\)/);
    expect(readFileSync('src/ui/main.ts', 'utf8')).not.toMatch(/querySelectorAll<HTMLElement>\('#demo-gallery-body \.demo-card'\)/);
  });
});

describe('result panels follow the theme', () => {
  it('no hard-coded light panel backgrounds in the result / form panels', () => {
    for (const f of ['src/ui/main.ts', 'src/ui/pcb/panels.ts', 'src/ui/panels/sw-should-cost-ui.ts']) {
      const s = readFileSync(f, 'utf8');
      for (const lit of ['background:#fff8f3', 'background:#f3f8ff', 'background:#f9f9f9', 'background:#fef2f2', 'background:#fff7ed', 'background:#e6f4ea']) {
        expect(s.includes(lit), `${f}: ${lit}`).toBe(false);
      }
    }
  });
});
