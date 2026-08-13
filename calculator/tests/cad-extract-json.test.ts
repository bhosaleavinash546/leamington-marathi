/**
 * `extractJson` — the parser between a chat model and the cost engine.
 *
 * The naive "first { to last }" span breaks on the commonest real failure mode:
 * a model that emits a complete object, a sentence of prose, then a second
 * object. That returned `{...} prose {...}` and threw "Unexpected non-whitespace
 * character after JSON" at exactly the character where the first object closed —
 * observed live on a gear re-analysis, where the repair retry then failed too
 * because it was handed the same malformed span.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** Compiled out of the route rather than exported, so the test evaluates the
 *  real source — a copy here would be a test of the copy. */
const extractJson: (t: string) => string = (() => {
  const src = readFileSync(new URL('../server/routes/cad.ts', import.meta.url), 'utf8');
  const m = src.match(/function extractJson\(text: string\): string \{[\s\S]*?\n\}/);
  if (!m) throw new Error('extractJson not found in cad.ts');
  const js = m[0].replace(/: string/g, '').replace(/function extractJson\(text\)/, 'function extractJson(text)');
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return extractJson;`)() as (t: string) => string;
})();

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(JSON.parse(extractJson('{"a":1}'))).toEqual({ a: 1 });
  });

  it('strips code fences', () => {
    expect(JSON.parse(extractJson('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(JSON.parse(extractJson('```\n{"a":1}\n```'))).toEqual({ a: 1 });
  });

  it('discards leading and trailing prose', () => {
    expect(JSON.parse(extractJson('Here you go:\n{"a":1}\nHope that helps.'))).toEqual({ a: 1 });
  });

  it('THE LIVE FAILURE: object, prose, second object', () => {
    const raw = '{"a":1,"b":{"c":2}}\n\nNote: the gear is carburised.\n\n{"stray":true}';
    expect(() => JSON.parse(extractJson(raw))).not.toThrow();
    expect(JSON.parse(extractJson(raw))).toEqual({ a: 1, b: { c: 2 } });
  });

  it('does not end early on a brace inside a string', () => {
    const raw = '{"reason":"uses {curly} braces","n":2}';
    expect(JSON.parse(extractJson(raw))).toEqual({ reason: 'uses {curly} braces', n: 2 });
  });

  it('handles escaped quotes inside strings', () => {
    const raw = '{"reason":"he said \\"carburise\\" twice","n":1}';
    expect(JSON.parse(extractJson(raw))).toEqual({ reason: 'he said "carburise" twice', n: 1 });
  });

  it('nested objects and arrays survive', () => {
    const raw = 'text {"a":[{"b":1},{"c":{"d":2}}]} more text';
    expect(JSON.parse(extractJson(raw))).toEqual({ a: [{ b: 1 }, { c: { d: 2 } }] });
  });

  it('a genuinely truncated object still yields the widest span for the repair pass', () => {
    // No balanced close — must not throw here; the caller retries.
    expect(() => extractJson('{"a":1,"b":')).not.toThrow();
  });
});
