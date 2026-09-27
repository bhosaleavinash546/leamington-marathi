/**
 * One version number, everywhere a user can see one.
 *
 * The changelog said V4.2, the tour and the Help badge said V4.1, and
 * package.json said 1.0.0. package.json is the source; the visible strings
 * must agree with it. Bump them together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const [major, minor] = pkg.version.split('.');
const V = `V${major}.${minor}`;

describe(`the app says ${V} everywhere`, () => {
  it('package-lock agrees with package.json', () => {
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as { version: string; packages: Record<string, { version?: string }> };
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });
  it('the newest changelog entry', () => {
    expect(html.match(/CostVision (V\d+\.\d+) —/)?.[1]).toBe(V);
  });
  it('the product tour', () => {
    expect(html).toContain(`Welcome to CostVision ${V}`);
  });
  it('the Help badge and the footer build title', () => {
    expect(html).toContain(`letter-spacing:0.5px">${V}</span>`);
    expect(html).toContain(`title="Build ${V.toLowerCase()}"`);
  });
});
