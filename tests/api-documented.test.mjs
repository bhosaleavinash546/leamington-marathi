// An endpoint nobody wrote down is an endpoint nobody reviews.
//
// The Sept 2026 review (R-43) found docs/api.md describing 30 of 139 registered
// paths. The missing 109 included every organisation route, the whole Horizon
// research surface and the rate-library admin — the places where authorisation
// mistakes cost the most and where a reader is most likely to assume, wrongly,
// that a route requires a token.
//
// So the doc is now enforced against the source. A new route fails CI until it
// has a row saying what it does and whether it needs authentication.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'api.md');

function registeredRoutes() {
  const files = execFileSync('git', ['ls-files', 'routes/*.mjs', 'server.mjs'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const routes = new Map();   // path → { methods:Set, auth:boolean }
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\(\s*'([^']+)'([^\n]*)/g)) {
      const [, method, path, rest] = m;
      // app.get('trust proxy') and friends are Express config reads, not routes.
      if (!path.startsWith('/')) continue;
      const e = routes.get(path) || { methods: new Set(), auth: false };
      e.methods.add(method.toUpperCase());
      if (/requireAuth|requireAdmin/.test(rest)) e.auth = true;
      routes.set(path, e);
    }
  }
  return routes;
}

describe('every API route is documented', () => {
  const doc = readFileSync(DOC, 'utf8');
  const routes = registeredRoutes();

  it('finds the route surface at all', () => {
    // Guard against the failure mode this repo has already had once: a scan that
    // silently stops matching turns the whole gate green.
    assert.ok(routes.size >= 100, `only ${routes.size} routes found — the scan is broken, not the code`);
    for (const p of ['/api/health', '/api/analyze', '/api/should-cost', '/api/orgs']) {
      assert.ok(routes.has(p), `${p} must be in the scan`);
    }
  });

  it('names every registered path in docs/api.md', () => {
    const missing = [...routes.keys()].filter(p => !doc.includes(`\`${p}\``)).sort();
    assert.deepEqual(missing, [],
      `undocumented API paths — add a row to the route index in docs/api.md:\n  ${missing.join('\n  ')}`);
  });

  it('documents each authenticated route in a row that states its auth', () => {
    // The index rows carry an explicit yes/no auth column. A path documented
    // only in prose elsewhere satisfies the previous test but tells a reader
    // nothing about whether it is public — which is the fact that matters.
    const rows = doc.split('\n').filter(l => l.startsWith('|') && /\| (yes|no) \|/.test(l));
    assert.ok(rows.length >= 100, `the route index has only ${rows.length} rows with an auth column`);
    const indexed = new Set();
    for (const r of rows) {
      const m = r.match(/`(\/api\/[^`]*)`/);
      if (m) indexed.add(m[1]);
    }
    const notIndexed = [...routes.keys()].filter(p => !indexed.has(p)).sort();
    assert.deepEqual(notIndexed, [],
      `paths missing from the route index (they need an auth column, not just a mention):\n  ${notIndexed.join('\n  ')}`);
  });

  it('the index does not claim routes that do not exist', () => {
    const rows = doc.split('\n').filter(l => l.startsWith('|') && /\| (yes|no) \|/.test(l));
    const phantom = [];
    for (const r of rows) {
      const m = r.match(/`(\/api\/[^`]*)`/);
      if (m && !routes.has(m[1])) phantom.push(m[1]);
    }
    assert.deepEqual(phantom, [], `documented but not registered — a removed route left behind:\n  ${phantom.join('\n  ')}`);
  });
});
