// October 2026 UX review — the fixes it shipped, held in place.
// Each test names the defect it guards; see docs/UX-REVIEW-2026-10.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []);

describe('UX review 2026-10', () => {
  it('an unknown URL renders a real 404 instead of redirecting to the landing page (B1)', () => {
    const app = read('src/App.tsx');
    assert.match(app, /<Route path="\*" element={<PageTransition><NotFoundPage \/><\/PageTransition>} \/>/);
    assert.doesNotMatch(app, /path="\*" element={<Navigate/);
  });

  it('every registry route gets its own document title (B2)', async () => {
    const tools = read('src/config/tools.ts');
    const routes = [...tools.matchAll(/route: '([^']+)'/g)].map(m => m[1]);
    assert.ok(routes.length >= 20, 'registry scan broken');
    const hook = read('src/hooks/useDocumentTitle.ts');
    assert.match(hook, /TOOLS\.find\(t => t\.route === pathname\) \?\? SETTINGS_LINKS\.find/);
    assert.match(read('src/App.tsx'), /useDocumentTitle\(\);/);
  });

  it('no AI tool blocks on a browser-only key when the account or server has one (S1 key bug)', () => {
    // Every gate of the form `!apiKey…` must also consult useAiAvailable().
    const offenders = [];
    for (const f of walk('src')) {
      const src = read(f);
      src.split('\n').forEach((line, i) => {
        if (/!apiKey(\.trim\(\))?\b(?!\s*&&\s*!aiAvailable)/.test(line) && !/aiAvailable/.test(line) && /(if \(|disabled=)/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
    assert.deepEqual(offenders, [], 'gate on useAiAvailable(), not on the localStorage key alone');
  });

  it('no message still tells users to enter the key on the Analyze page or that it lives only in the browser', () => {
    const bad = [];
    for (const f of walk('src')) {
      const src = read(f);
      if (/Add one on the Analyze page|run an analysis on the Analyze page first|On the Analyze page, paste your Anthropic API key|You enter it on the Analyze page/.test(src)) bad.push(f);
    }
    assert.deepEqual(bad, []);
  });

  it('results exports go through one menu, not five coloured buttons (U2)', () => {
    const r = read('src/pages/ResultsPage.tsx');
    assert.match(r, /<ExportMenu busy={!!exporting} items={exportItems} \/>/);
    for (const c of ['bg-green-700', 'bg-orange-700', 'bg-red-700', 'bg-violet-700', 'bg-blue-700']) assert.ok(!r.includes(c), `${c} export button is back`);
  });

  it('the sidebar folds settings into one disclosure so the tool list is not clipped (U1)', () => {
    const s = read('src/components/layout/Sidebar.tsx');
    assert.match(s, /aria-expanded={settingsOpen}/);
    assert.match(s, /aria-controls="sidebar-settings"/);
  });

  it('vehicle systems render line icons, not emoji (U4)', () => {
    const a = read('src/pages/AnalyzePage.tsx');
    assert.match(a, /systemIcon\(sys\.id\)/);
    assert.doesNotMatch(a, /\{sys\.icon\}/);
  });

  it('a non-admin never fires the admin request that is bound to 403 (B4)', () => {
    const p = read('src/pages/AdminRateLibraryPage.tsx');
    assert.ok(p.indexOf("'/api/admin/rate-library/status'") < p.indexOf("fetch('/api/admin/rate-library', { headers: auth })"));
  });
});
