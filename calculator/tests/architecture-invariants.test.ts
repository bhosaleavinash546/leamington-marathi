/**
 * Architecture invariants — the golden rule, machine-checked.
 *
 * CostVision's defensibility rests on one rule: **AI never sets a price.** The
 * deterministic cost engine (`src/engine/**`) must stay pure — no LLM SDK, no
 * shared AI client, no network calls — so every number is reproducible and
 * auditable. And per CLAUDE.md, every LLM call must go through
 * `server/utils/ai-client.ts::createAnthropic()` so the air-gap / private-routing
 * controls cannot be bypassed.
 *
 * These are structural guards: if someone imports the AI client into the money
 * path, or news up an Anthropic client anywhere else, CI fails — not a reviewer's
 * memory. Cheap to run, impossible to regress silently.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..'); // calculator/
const ENGINE = join(ROOT, 'src', 'engine');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkTs(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Strip block and line comments so we only scan real code. The `[^:]` guard
 *  before `//` leaves `https://…` URLs in string literals untouched. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');

describe('architecture invariants — AI never sets a price', () => {
  const engineFiles = walkTs(ENGINE);

  it('actually found the engine source to scan', () => {
    expect(engineFiles.length).toBeGreaterThan(20);
  });

  it('src/engine/** never imports an LLM SDK, the AI client, or the network', () => {
    const banned: { re: RegExp; why: string }[] = [
      { re: /from\s+['"][^'"]*\bai-client\b/, why: 'imports the AI client' },
      { re: /@anthropic-ai\//, why: 'imports the Anthropic SDK' },
      { re: /\bnew\s+Anthropic\b/, why: 'constructs an Anthropic client' },
      { re: /\bcreateAnthropic\b/, why: 'calls createAnthropic()' },
      { re: /\bfetch\s*\(/, why: 'makes a fetch() network call' },
      { re: /from\s+['"]axios['"]/, why: 'imports axios' },
    ];
    const offenders: string[] = [];
    for (const f of engineFiles) {
      const code = stripComments(readFileSync(f, 'utf-8'));
      for (const b of banned) {
        if (b.re.test(code)) offenders.push(`${rel(f)} — ${b.why}`);
      }
    }
    expect(offenders, `Engine purity violated (the money path must stay AI-free):\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('the only `new Anthropic(...)` lives in server/utils/ai-client.ts', () => {
    const files = [...walkTs(join(ROOT, 'src')), ...walkTs(join(ROOT, 'server'))];
    const offenders: string[] = [];
    for (const f of files) {
      if (rel(f) === 'server/utils/ai-client.ts') continue;
      const code = stripComments(readFileSync(f, 'utf-8'));
      if (/\bnew\s+Anthropic\s*\(/.test(code)) offenders.push(rel(f));
    }
    expect(offenders, `LLM calls must go through createAnthropic(). Offending files:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
