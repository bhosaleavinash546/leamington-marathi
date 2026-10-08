/**
 * One restrained motion system (motion review, Oct 2026). Four animation systems — CSS, GSAP, the `motion` package
 * and rAF — fought over the same elements: hover springs and 3-D tilt, two click ripples, bouncy entrances, a doubled
 * count-up, a toast with hard-coded colours and no announcement. These pins keep it from coming back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const UI = new URL('../src/ui/', import.meta.url).pathname;
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const uiFiles = walk(UI).filter(f => /\.(ts|css)$/.test(f));
const read = (f: string) => readFileSync(f, 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = (n: string) => read(join(UI, 'styles', n));

describe('one motion system', () => {
  it('the second animation library is gone (no `motion` dependency, no motion-fx)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies?.motion).toBeUndefined();
    expect(existsSync(join(UI, 'motion-fx.ts'))).toBe(false);
    expect(uiFiles.filter(f => /from ['"]motion['"]/.test(read(f)))).toEqual([]);
  });
  it('no bouncy or elastic easing, no hover tilt / magnetic pull in JS', () => {
    const anim = read(join(UI, 'animations.ts'));
    expect(anim).not.toMatch(/['"](back|elastic)\./);
    expect(anim).not.toMatch(/addEventListener\(['"]mouse(move|enter|leave)/);
    expect(anim).not.toMatch(/scale:/);
  });
  it('no `transition: all` anywhere in the UI', () => {
    const hits = [...uiFiles, 'index.html'].filter(f => /transition:\s*all\b/.test(f === 'index.html' ? html : read(f)));
    expect(hits).toEqual([]);
  });
  it('the reduced-motion blanket stops loops instead of spinning them every millisecond', () => {
    expect(css('calculator.css')).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });
  it('a keyframe is defined once (cv-spin was defined twice)', () => {
    const all = walk(join(UI, 'styles')).map(read).join('\n');
    expect(all.match(/@keyframes cv-spin\b/g)?.length).toBe(1);
  });
  it('the tab underline grows by transform, not by animating left / right', () => {
    expect(css('calculator.css')).not.toMatch(/transition:\s*left var\(--dur-hover\)[^;]*right/);
  });
  it('overlays have an exit (display transitions as a discrete property)', () => {
    const polish = css('saas-polish.css');
    for (const sel of ['.cv-more-menu', '#cv-cmdk', '#cv-trace-drawer']) expect(polish).toContain(sel);
    expect(polish).toMatch(/display var\(--dur-micro, 150ms\) allow-discrete/);
  });
});

describe('one toast', () => {
  it('main.ts delegates to toast.ts — no second toast with hard-coded colours', () => {
    const main = read(join(UI, 'main.ts'));
    expect(main).not.toMatch(/toast\.style\.cssText|c\.id = 'toast-container'/);
    expect(main).toMatch(/sharedShowToast\(message, type\)/);
  });
  it('the toast is announced, dismissible, limited and themed', () => {
    const t = read(join(UI, 'toast.ts'));
    expect(t).toMatch(/'alert' : 'status'/);
    expect(t).toMatch(/aria-label="Dismiss notification"/);
    expect(t).toMatch(/TOAST_MAX = 3/);
    expect(t).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
