// THE IMAGE MUST CONTAIN EVERY MODULE THE APP ACTUALLY IMPORTS.
//
// Writing the first Dockerfile, the COPY set looked complete: server.mjs, the
// root engines, routes/, cad-engine/, scripts/, benchmark/. It was not. Five
// runtime modules live under src/ — src/services/cad-brep.mjs,
// src/services/cad-features.mjs, src/data/tech-foresight-register.mjs,
// src/data/vehicle-bom.mjs, src/data/commodity-classify.mjs — because src/ is
// the FRONTEND directory and nobody expects server code there.
//
// That image would have built cleanly, booted cleanly, passed a health check,
// and thrown MODULE_NOT_FOUND the first time a user opened the CAD viewer or
// the Horizon register. The kind of failure that reaches a customer.
//
// So the Dockerfile's COPY set is checked against the real transitive import
// graph, rather than against anyone's memory of where files live.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** Every local module reachable from the server or any route, transitively. */
function reachableModules() {
  const seen = new Set();
  const queue = ['server.mjs', ...readdirSync(join(ROOT, 'routes')).filter(x => x.endsWith('.mjs')).map(x => `routes/${x}`)];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f) || !existsSync(join(ROOT, f))) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/from '(\.[^']+)'/g)) {
      const resolved = normalize(join(dirname(f), m[1]));
      if (existsSync(join(ROOT, resolved))) queue.push(resolved);
    }
  }
  return [...seen];
}

/**
 * Which paths the Dockerfile's COPY lines actually place in the image. Derived
 * from the Dockerfile text, so editing the COPY set updates this test's notion
 * of coverage — the test cannot drift from the file it is checking.
 */
function copiedPatterns() {
  const df = read('Dockerfile');
  const runtime = df.slice(df.indexOf('AS runtime'));
  const pats = [];
  for (const m of runtime.matchAll(/^COPY (?!--from)(.+?)\s+\.\/?\S*$/gm)) {
    for (const src of m[1].trim().split(/\s+/)) pats.push(src);
  }
  // Artefacts brought over from the builder stage rather than the context.
  for (const m of runtime.matchAll(/^COPY --from=builder \/app\/(\S+)/gm)) pats.push(m[1]);
  return pats;
}

const matches = (file, pattern) => {
  if (pattern === file) return true;
  if (pattern === '*.mjs') return /^[^/]+\.mjs$/.test(file);
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
    return re.test(file);
  }
  return file === pattern || file.startsWith(pattern.replace(/\/$/, '') + '/');
};

describe('the container image contains everything the app imports', () => {
  const reachable = reachableModules();
  const patterns = copiedPatterns();

  it('finds a real import graph, so the test cannot pass vacuously', () => {
    assert.ok(reachable.length > 50, `only ${reachable.length} modules reachable — the scan is broken, not the code`);
    for (const required of ['server.mjs', 'costing-engine.mjs', 'part360.mjs', 'engine-idea-check.mjs']) {
      assert.ok(reachable.includes(required), `${required} must be in the graph`);
    }
  });

  it('reads COPY instructions out of the Dockerfile itself', () => {
    assert.ok(patterns.length >= 6, `only ${patterns.length} COPY sources parsed from the Dockerfile`);
  });

  it('every reachable runtime module is covered by a COPY', () => {
    const missing = reachable.filter(f => !patterns.some(p => matches(f, p))).sort();
    assert.deepEqual(missing, [], `these modules are imported at runtime but would NOT be in the image:\n  ${missing.join('\n  ')}`);
  });

  it('every data file the server names at runtime is covered too', () => {
    // Found TWICE in the staged-image rehearsal. First the marketplace was
    // EMPTY: the legacy seed is read with readFileSync, not imported, so the
    // import scan could not see it — one ENOENT in the log, health green. Then,
    // after adding that file, the marketplace held 657 ideas instead of 2,243:
    // the other nine seed packs are passed BY NAME to
    // seedMarketplaceIdeasFromFile(), and a scan for readFileSync('…') never
    // saw them either. So this scans every string literal ending in a data
    // extension, anywhere in reachable code, and keeps the ones that resolve
    // to a real file — the only test that survives the next helper function.
    const named = new Set();
    for (const f of reachable) {
      for (const m of read(f).matchAll(/'([A-Za-z0-9_./-]+\.(?:json|csv|txt|md))'/g)) {
        const lit = m[1];
        const rel = normalize(join(dirname(f), lit));
        if (existsSync(join(ROOT, rel)) && !rel.startsWith('..')) named.add(rel);
        else if (existsSync(join(ROOT, lit))) named.add(lit);
      }
    }
    // Vacuity guard: the marketplace alone is ten seed packs. A scan that finds
    // fewer is broken, and a broken scan would pass everything.
    const seeds = [...named].filter(f => /^marketplace-.*\.json$/.test(f));
    assert.ok(seeds.length >= 10, `only ${seeds.length} marketplace seed packs found — the scan is broken, not the code`);
    assert.ok(named.has('kb-pack.json'), 'the knowledge pack must be found');
    const missing = [...named].filter(f => !patterns.some(p => matches(f, p))).sort();
    assert.deepEqual(missing, [], `data files named at runtime that would NOT be in the image:\n  ${missing.join('\n  ')}`);
  });

  it('the Python engines and the knowledge pack ship too', () => {
    // cad-engine/*.py is spawned per request, and kb-pack.json is what the
    // ideation prompt actually reads — neither appears in the JS import graph,
    // so neither is caught by the check above.
    assert.ok(patterns.some(p => matches('cad-engine/dfm_geometry.py', p)), 'cad-engine/ must be copied');
    assert.ok(patterns.some(p => matches('kb-pack.json', p)), 'kb-pack.json must be copied');
    assert.ok(patterns.some(p => matches('dist/index.html', p)), 'dist/ must be copied — server.mjs serves the SPA from it');
  });
});

describe('the Dockerfile keeps the invariants the app depends on', () => {
  const df = read('Dockerfile');

  it('builder and runtime share a glibc, so the native module loads', () => {
    // better-sqlite3 is compiled in the builder and copied. Mixing Debian and
    // Alpine here produces a loader error at boot, not a build failure.
    assert.match(df, /FROM node:22-bookworm AS builder/);
    assert.match(df, /FROM node:22-bookworm-slim AS runtime/);
  });

  it('installs the OCCT wheel in the version range CI tests', () => {
    const ci = read('.github/workflows/ci.yml');
    const range = ci.match(/'(cadquery-ocp[^']+)'/)?.[1];
    assert.ok(range, 'CI no longer pins cadquery-ocp — this test has lost its reference');
    assert.ok(df.includes(range), `the image installs a different range than CI tests (${range})`);
  });

  it('carries the system libraries OCP links against', () => {
    // Read off ldd across all 69 shared objects in the wheel. A missing libGL
    // surfaces as an ImportError on `import OCP`, which reads like a Python
    // packaging problem and is not one.
    for (const lib of ['libgl1', 'libx11-6', 'libxrender1', 'libexpat1']) {
      assert.ok(df.includes(lib), `the runtime stage is missing ${lib} — import OCP will fail`);
    }
  });

  it('proves the geometry layer at BUILD time rather than hoping', () => {
    assert.match(df, /python3 -c "import OCP/, 'the build must fail if the wheel does not import');
  });

  it('declares a volume and defaults DATA_DIR outside the app directory', () => {
    assert.match(df, /VOLUME \["\/data"\]/);
    assert.match(df, /DATA_DIR=\/data/);
    assert.doesNotMatch(df, /DATA_DIR=\/app/, 'DATA_DIR inside /app means a redeploy discards the database');
  });

  it('runs unprivileged', () => {
    assert.match(df, /^USER node$/m);
  });
});
