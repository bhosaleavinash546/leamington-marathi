// DR-6: the deep research engine must be REACHABLE from the product.
//
// Before this, `foresight-deep.mjs` was wired into no route, no page and no
// export — the machine that produces the detailed report existed, and no user
// could get a report out of it. These are source-level pins, because the
// wiring is exactly the kind of thing that silently rots: an engine can keep
// passing all its own tests while nothing calls it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const route = read('routes/foresight.mjs');
const page = read('src/pages/ForesightPage.tsx');
const report = read('src/services/foresight-report.ts');
const server = read('server.mjs');

describe('deep research is reachable from the product', () => {
  it('the route imports and calls the engine', () => {
    assert.match(route, /from '\.\.\/foresight-deep\.mjs'/);
    assert.match(route, /await deepResearch\(/);
  });

  it('it runs as a job with progress, not inside a request', () => {
    // A multi-minute run cannot answer synchronously, and a run with no visible
    // progress is indistinguishable from a hang.
    assert.match(route, /app\.post\('\/api\/foresight\/deep'/);
    assert.match(route, /app\.get\('\/api\/foresight\/deep\/:jobId'/);
    assert.match(route, /onProgress: push/);
    assert.ok(/jobsApi\.create\(req\.user\.id, 'foresight-deep'\)/.test(route));
  });

  it('server.mjs injects jobsApi, or the endpoint can never start a run', () => {
    assert.match(server, /registerForesightRoutes\(app, \{[^}]*jobsApi[^}]*\}\)/);
  });

  it('it refuses to run without a key rather than guessing', () => {
    assert.match(route, /Deep research needs an Anthropic API key/);
  });

  it('depth is bounded to the known presets — an arbitrary depth is a cost hole', () => {
    assert.match(route, /\['quick', 'standard', 'deep'\]\.includes/);
  });

  it('findings are offered to the register as CANDIDATES, never auto-promoted', () => {
    assert.match(route, /deepFindingsToCandidates\(out/);
    assert.ok(!/promoteCandidate\([^)]*out\b/.test(route), 'deep findings are being auto-promoted');
  });
});

describe('the page surfaces the report and its honesty', () => {
  it('offers one run control with an explicit depth choice', () => {
    assert.match(page, /runDeepResearch/);
    assert.match(page, /Run deep research/);
    assert.match(page, /aria-label="Research depth"/);
  });

  it('shows the live progress trace while it runs', () => {
    assert.match(page, /deepTrace\.map/);
    assert.match(page, /aria-live="polite"/);
  });

  it('shows disagreements with BOTH figures and neither chosen', () => {
    assert.match(page, /Sources disagree/);
    assert.match(page, /k\.low\.value/);
    assert.match(page, /k\.high\.value/);
  });

  it('shows what the research could not establish', () => {
    assert.match(page, /could not establish/i);
    assert.match(page, /couldNotEstablish/);
  });

  it('shows the ledger and the limitations rather than only the conclusions', () => {
    assert.match(page, /Source ledger/);
    assert.match(page, /skippedBecause/);
    assert.match(page, /Limitations of this search/);
  });

  it('tells the user the run costs money before they start it', () => {
    assert.match(page, /Costs API credits/);
  });
});

describe('the exported PDF carries the deep report', () => {
  it('the export is handed the deep result', () => {
    // Two call sites (light and dark themes) — both must pass it, or one theme
    // silently drops the report the user just paid for.
    const calls = page.match(/exportForesightPdf\(\{ \.\.\.result, deep \}/g) ?? [];
    assert.equal(calls.length, 2, `expected both theme exports to include deep research, found ${calls.length}`);
  });

  it('the renderer has a deep-research section', () => {
    assert.match(report, /DEEP RESEARCH/);
    assert.match(report, /const dp = result\.deep;/);
  });

  it('the PDF leads with disagreements, then states what was not established', () => {
    assert.match(report, /WHERE SOURCES DISAGREE — BOTH FIGURES SHOWN, NEITHER CHOSEN/);
    assert.match(report, /WHAT THIS RESEARCH COULD NOT ESTABLISH/);
    assert.ok(report.indexOf('WHERE SOURCES DISAGREE') < report.indexOf('WHAT THIS RESEARCH COULD NOT ESTABLISH'));
  });

  it('the PDF prints the source ledger including what was skipped', () => {
    assert.match(report, /sectionTitle\('Source ledger'/);
    assert.match(report, /r\.skippedBecause/);
    assert.match(report, /LIMITATIONS OF THIS SEARCH/);
  });
});
