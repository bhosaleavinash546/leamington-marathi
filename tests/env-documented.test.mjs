// A configuration variable nobody wrote down is a production incident waiting
// for the right afternoon.
//
// The Sept 2026 review (R-43) found 20 of 32 environment variables undocumented,
// two of them fatal in production: JWT_SECRET, whose absence makes every issued
// token forgeable with a secret published in this repository, and EMAIL_USER,
// whose absence prints one-time passcodes to the server log instead of emailing
// them. Both were discoverable only by reading server.mjs.
//
// Documentation that is not enforced drifts back to where it was, so this test
// reads the SOURCE for every `process.env.*` the codebase touches and requires
// each one to appear in the operations reference. A new variable now fails CI
// until somebody says what it does and what happens when it is missing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'OPERATIONS.md');

// Tracked source only — a variable read by a dependency inside node_modules is
// that dependency's business, not this project's configuration surface.
const sourceFiles = () =>
  execFileSync('git', ['ls-files', '*.mjs', '*.js', '*.cjs', '*.ts', '*.tsx'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(f => f && !f.startsWith('node_modules/'));

const envNames = () => {
  const found = new Set();
  for (const f of sourceFiles()) {
    let text;
    try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) found.add(m[1]);
    // import.meta.env is Vite's build-time surface, not server configuration.
  }
  return [...found].sort();
};

describe('every environment variable is documented', () => {
  const doc = readFileSync(DOC, 'utf8');
  const names = envNames();

  it('finds the configuration surface at all', () => {
    // A regex that silently stops matching would make this whole file pass
    // vacuously — the exact failure mode the review found in threshold-audit.
    assert.ok(names.length >= 20, `only ${names.length} env vars found — the scan is broken, not the code`);
    for (const required of ['JWT_SECRET', 'DATA_DIR', 'ANTHROPIC_API_KEY', 'PORT']) {
      assert.ok(names.includes(required), `${required} must be in the scan`);
    }
  });

  it('names every one of them in docs/OPERATIONS.md', () => {
    const missing = names.filter(n => !new RegExp(`\`${n}\``).test(doc));
    assert.deepEqual(missing, [],
      `undocumented environment variables — add a row to the table in docs/OPERATIONS.md ` +
      `saying what each does AND what happens when it is unset:\n  ${missing.join('\n  ')}`);
  });

  it('states the consequence of absence for the ones that are fatal or change behaviour', () => {
    // These four do not merely fall back to a default; leaving them unset
    // changes what the system IS. The row has to say so, not just name a value.
    const consequential = {
      JWT_SECRET: /refuses to start|forgeable/i,
      EMAIL_USER: /printed to the server log|instead of emailed/i,
      CREDENTIALS_SECRET: /undecryptable|falls back/i,
      FX_API_URL: /stale/i,
    };
    for (const [name, pattern] of Object.entries(consequential)) {
      const row = doc.split('\n').find(l => l.includes(`\`${name}\``) && l.startsWith('|'));
      assert.ok(row, `${name} has no table row`);
      assert.match(row, pattern, `the row for ${name} does not say what happens when it is unset`);
    }
  });
});

// ── The knowledge pack must say how old it is (review R-42) ────────────────
//
// A curated lever with no date reads as current forever. The pack carries the
// vintage of its source TypeScript, read from git rather than asserted, and the
// generation prompt states it alongside the levers so the model is told what it
// is looking at. It also reports how many levers carry their OWN date and
// source — 0% today, and saying zero out loud is the point: an undated corpus
// that admits it beats one that merely looks fresh.
describe('the knowledge pack is dated', () => {
  const pack = JSON.parse(readFileSync(join(ROOT, 'kb-pack.json'), 'utf8'));

  it('carries a curation vintage', () => {
    assert.match(String(pack.knowledgeAsOf), /^\d{4}-\d{2}-\d{2}$/,
      'kb-pack.json has no knowledgeAsOf — run npm run kb:export');
  });

  it('reports its own dating and sourcing coverage rather than hiding it', () => {
    assert.ok(pack.coverage, 'no coverage block');
    assert.ok(pack.coverage.levers > 100, `only ${pack.coverage.levers} levers — the export is broken`);
    assert.equal(typeof pack.coverage.datedPct, 'number');
    assert.equal(typeof pack.coverage.sourcedPct, 'number');
  });

  it('the generation prompt states the vintage next to the levers', () => {
    const server = readFileSync(join(ROOT, 'server.mjs'), 'utf8');
    assert.match(server, /curated as of \$\{pack\.knowledgeAsOf\}/,
      'kbDetailFor no longer stamps the vintage onto the KB block it sends to the model');
    assert.match(server, /curation date unknown/,
      'a pack with no vintage must say so in the prompt, not quietly omit the line');
  });
});
