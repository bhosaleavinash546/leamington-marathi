/**
 * CAD to COST 360 review (28 Oct 2026) — docs/review/cad-to-cost-360-2026-10-28.md.
 *
 * Senior users said Calculate does not work, the viewer does not work after an upload, and the flow is too complex.
 * Each test below pins one finding of the live run so it cannot come back:
 *  F1–F4  one gated path to the cost (cad-flow.ts) — never a form applied with a blocking question open
 *  F5     no Part Basics wizard over CAD to COST
 *  F6     the CAD kernel is checked before the upload; launchers look for OCP (not cadquery)
 *  F7     the compact viewer heads the result, not the foot of the form
 *  F8     the home page's Upload CAD card takes a drop and opens a chooser
 *  F9     one tessellation per file
 *  F10–F12 one photo input; no sample examples on a CAD-filled form; long option lists are a drop-down
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { nextCostStep, costStepMessage, type FlowDecision } from '../src/ui/cad-flow.js';
import { fetchMeshFrame, stlFromFrame, clearMeshCache, meshErrorText, MeshFetchError } from '../src/ui/cad-mesh-cache.js';

const main = readFileSync('src/ui/main.ts', 'utf8');
const index = readFileSync('index.html', 'utf8');
const css = readFileSync('src/ui/styles/saas-polish.css', 'utf8');

const route: FlowDecision = { id: 'commodity.route', severity: 'blocking', question: 'Which process makes this part?' };
const grade: FlowDecision = { id: 'material.grade', severity: 'advisory', question: 'Which grade?' };

/** The body of a top-level function in main.ts. */
function fnBody(name: string): string {
  const start = main.search(new RegExp(`\\n(async )?function ${name}\\(`));
  expect(start, `${name} not found`).toBeGreaterThan(0);
  const next = main.slice(start + 1).search(/\n(async )?function \w+\(/);
  return main.slice(start, next > 0 ? start + 1 + next : undefined);
}

describe('F1–F4: one path from the upload to the cost', () => {
  it('asks for a file, then measures, then asks, then re-runs, then applies', () => {
    expect(nextCostStep({ hasFile: false, hasAnalysis: false, decisions: [], answers: {} }).kind).toBe('upload');
    expect(nextCostStep({ hasFile: true, hasAnalysis: false, decisions: [], answers: {} }).kind).toBe('analyse');
    const ask = nextCostStep({ hasFile: true, hasAnalysis: true, decisions: [route, grade], answers: {} });
    expect(ask.kind).toBe('answer');
    expect(ask.kind === 'answer' && ask.missing.map(d => d.id)).toEqual(['commodity.route']);
    // Answered on the panel but not yet seen by the rules: re-run, never apply (the 0.000 kg forging).
    expect(nextCostStep({ hasFile: true, hasAnalysis: true, decisions: [route], answers: { 'commodity.route': 'forging' } }).kind).toBe('reanalyse');
    // An advisory question never blocks the cost.
    expect(nextCostStep({ hasFile: true, hasAnalysis: true, decisions: [grade], answers: {} }).kind).toBe('apply');
  });

  it('a blank answer is not an answer', () => {
    expect(nextCostStep({ hasFile: true, hasAnalysis: true, decisions: [route], answers: { 'commodity.route': '  ' } }).kind).toBe('answer');
  });

  it('says what stands between the engineer and the cost', () => {
    expect(costStepMessage({ kind: 'answer', missing: [route] })).toMatch(/^One question before the cost/);
    expect(costStepMessage({ kind: 'answer', missing: [route, route] })).toMatch(/^2 questions before the cost/);
  });

  it('Calculate on the CAD screen runs the CAD flow (it threw into a hidden pane)', () => {
    const compute = fnBody('compute');
    const first = compute.split('\n').slice(1, 5).join('\n');
    expect(first).toMatch(/activeCommodity === 'cad_analysis'\) \{ void cadGetCost\(true\); return; \}/);
  });

  it('every apply path is gated on open blocking questions', () => {
    expect(fnBody('applyCADToForm')).toMatch(/if \(openCADDecisions\(\)\.length\) \{ void cadGetCost\(autoCalculate\); return; \}/);
    // Analyze & Calculate goes through the same gate, never straight to applyCADToForm.
    expect(fnBody('renderCADResults')).toMatch(/if \(open\.length\) showCADQuestions\([^)]*\)[^;]*;\s*else void cadGetCost\(true\);/);
    // An answer recorded on the panel but not re-run does not open the gate.
    expect(fnBody('openCADDecisions')).toMatch(/_cadDecisions\.filter\(d => d\.severity === 'blocking'\)/);
  });

  it('a changed blocking answer re-runs the rules in place, and re-runs are serialised', () => {
    const wire = fnBody('wireCADDecisionsPanel');
    expect(wire).toMatch(/severity === 'blocking'/);
    expect(wire).toMatch(/setTimeout\(\(\) => \{ _cadAutoRerun = null; void autoRerunCAD\(\); \}, 350\)/);
    expect(fnBody('autoRerunCAD')).toMatch(/await reanalyzeCAD\(\)/);
    expect(main).toMatch(/_cadReanalyzeChain\.then\(reanalyzeCADOnce, reanalyzeCADOnce\)/);
    expect(fnBody('cadGetCost')).toMatch(/await _cadReanalyzeChain;/);
  });

  it('the questions panel has one primary action and an accessible status', () => {
    const panel = fnBody('renderCADDecisionsPanel');
    expect(panel).toMatch(/id="cad-get-cost-btn"/);
    expect(panel).toMatch(/id="cad-decisions-status" role="status"/);
    expect(main).toMatch(/<div id="cad-flow-notice" class="cad-flow-notice" role="status" hidden><\/div>/);
  });
});

describe('a question the engineer has not seen is never accepted for them (live run: the stub axle\'s safety question)', () => {
  it('Get cost compares what is open with what was on screen when it was pressed', () => {
    const body = fnBody('cadGetCost');
    const seenAt = body.indexOf('const seen = shownBlockingQuestionIds();');
    const awaitAt = body.indexOf('await _cadReanalyzeChain;');
    expect(seenAt).toBeGreaterThan(0);
    expect(seenAt).toBeLessThan(awaitAt);   // captured BEFORE anything can re-render the panel
    expect(body).toMatch(/openCADDecisions\(\)\.filter\(d => !seen\.has\(d\.id\) \|\|/);
    // The unseen check comes before the panel's ticks are read as answers.
    expect(body.indexOf('if (unseen.length)')).toBeLessThan(body.indexOf('readCADDecisionPanel();'));
  });

  it('a question an automatic re-run adds is stopped on once, even if it was drawn before the press', () => {
    expect(fnBody('wireCADDecisionsPanel')).toMatch(/void autoRerunCAD\(\)/);
    expect(fnBody('autoRerunCAD')).toMatch(/_cadNewQuestions\.add\(d\.id\)/);
    expect(fnBody('cadGetCost')).toMatch(/_cadNewQuestions\.has\(d\.id\) && !_cadTouchedDecisions\.has\(d\.id\)/);
    expect(fnBody('cadGetCost')).toMatch(/_cadNewQuestions\.clear\(\);/);
    // Touching the question counts as looking at it.
    expect(fnBody('wireCADDecisionsPanel')).toMatch(/_cadNewQuestions\.delete\(id\);/);
  });

  it('Calculate before Analyze measures, then asks — it is not swallowed by the running guard', () => {
    const body = fnBody('cadGetCost');
    expect(body).toMatch(/await analyzeCAD\(false\);/);
    expect(body).not.toMatch(/await analyzeCAD\(calculate\)/);
  });
});

describe('live-run findings (ECU cover)', () => {
  it('the Get cost action survives the last answer — a ready strip when nothing is left to ask', () => {
    const panel = fnBody('renderCADDecisionsPanel');
    const ready = panel.slice(panel.indexOf('if (!open.length && !advisory.length) {'));
    expect(ready.slice(0, 900)).toMatch(/id="cad-decisions-panel" class="cad-ready"/);
    expect(ready.slice(0, 900)).toMatch(/id="cad-get-cost-btn"/);
    expect(panel).not.toMatch(/if \(!open\.length && !advisory\.length\) return '';/);
  });

  it('the CNC feature build-up is shown only on a machined route', () => {
    expect(fnBody('buildFeatureCostCard')).toMatch(/if \(route && route !== 'machining' && route !== 'cast_and_machine'\) return '';/);
  });
});

describe('F5: no Part Basics wizard over CAD to COST', () => {
  it('maybeShowWizard returns for cad_analysis', () => {
    expect(fnBody('maybeShowWizard')).toMatch(/if \(commodity === 'cad_analysis'\) return;/);
  });
});

describe('F6: the CAD kernel', () => {
  it('the CAD screen is told before the upload whether STEP / IGES can be read', () => {
    const cad = readFileSync('server/routes/cad.ts', 'utf8');
    expect(cad).toMatch(/kernel: \{ available: k\.available \}/);
    expect(main).toMatch(/id="cad-kernel-notice"/);
    expect(fnBody('showCADKernelNotice')).toMatch(/cadLimits\.kernel\?\.available !== false/);
  });

  it('a STEP not yet read is not labelled "mesh (STL)"; the badge uses theme tokens', () => {
    const badge = fnBody('setCadQualityBadge');
    expect(badge).toMatch(/const isMesh = \/\\\.stl\$\/i\.test/);
    expect(badge).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it('the probe reports a missing interpreter instead of throwing', async () => {
    const prev = process.env.PYTHON_BIN;
    process.env.PYTHON_BIN = '/nonexistent/python-for-test';
    vi.resetModules();
    try {
      const { kernelStatus } = await import('../server/utils/geometry-bridge.js');
      const k = await kernelStatus();
      expect(k.available).toBe(false);
      expect(k.detail).toBeTruthy();
    } finally {
      if (prev === undefined) delete process.env.PYTHON_BIN; else process.env.PYTHON_BIN = prev;
      vi.resetModules();
    }
  });

  it('launchers look for OCP — the module the engine imports — not cadquery', () => {
    for (const f of ['../start.sh', '../dev-start.sh']) {
      const sh = readFileSync(f, 'utf8');
      expect(sh, f).not.toMatch(/import cadquery/);
      expect(sh, f).toMatch(/ensure-cad-kernel\.sh/);
    }
    const ensure = readFileSync('../scripts/ensure-cad-kernel.sh', 'utf8');
    expect(ensure).toMatch(/-c "import OCP"/);
    expect(ensure).toMatch(/pip install --quiet -r "\$_cv_root\/requirements\.txt"/);
    expect(ensure).toMatch(/export PYTHON_BIN=/);
    expect(readFileSync('../.gitignore', 'utf8')).toMatch(/calculator\/\.venv-cad\//);
  });
});

describe('F7: the model beside its cost', () => {
  it('the compact viewer host is in the results panel, before the result tabs', () => {
    const results = index.indexOf('<div class="results-panel">');
    const host = index.indexOf('id="cad-persist-viewer-host"');
    const tabs = index.indexOf('id="results-tabs"');
    expect(results).toBeGreaterThan(0);
    expect(host).toBeGreaterThan(results);
    expect(host).toBeLessThan(tabs);
    expect(index.indexOf('id="commodity-form-area"')).toBeLessThan(results);
  });
});

describe('F8: the home page card takes a file', () => {
  it('drop and click both reach the CAD screen with the file', () => {
    expect(main).toMatch(/hsCad\?\.addEventListener\('drop'/);
    expect(main).toMatch(/if \(f\) setCADFile\(f\);/);
    expect(main).toMatch(/\(document\.getElementById\('cad-file-input'\) as HTMLInputElement \| null\)\?\.click\(\)/);
  });
});

describe('F9: one tessellation per file', () => {
  const header = { stlBytes: 4 };
  const frame = (): ArrayBuffer => {
    const h = new TextEncoder().encode(JSON.stringify(header));
    const buf = new ArrayBuffer(4 + h.length + 4 + 8);
    new DataView(buf).setUint32(0, h.length, true);
    new Uint8Array(buf, 4, h.length).set(h);
    new Uint8Array(buf, 4 + h.length, 4).set([1, 2, 3, 4]);
    return buf;
  };
  const file = new File(['solid x'], 'part.stp', { lastModified: 1 });
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { clearMeshCache(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('the viewer, the AI views and the compact viewer share one request', async () => {
    fetchMock.mockResolvedValue(new Response(frame(), { status: 200 }));
    const [a, b] = await Promise.all([fetchMeshFrame(file, {}), fetchMeshFrame(file, {})]);
    await fetchMeshFrame(file, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect([...new Uint8Array(stlFromFrame(a))]).toEqual([1, 2, 3, 4]);
  });

  it('a failure is not cached, and a missing kernel is named as such', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "No module named 'OCP'" }), { status: 422 }));
    const err = await fetchMeshFrame(file, {}).catch(e => e);
    expect(err).toBeInstanceOf(MeshFetchError);
    expect(meshErrorText(err)).toMatch(/CAD kernel\) is not installed on this computer/);
    fetchMock.mockResolvedValueOnce(new Response(frame(), { status: 200 }));
    await fetchMeshFrame(file, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('every mesh consumer reads through the cache', () => {
    expect(readFileSync('src/ui/cad-viewer.ts', 'utf8')).toMatch(/fetchMeshFrame\(file, resolveHeaders\(\), aborter\.signal\)/);
    expect(main).toMatch(/fetchMeshFrame\(/);
    expect(main).not.toMatch(/fetch\('\/api\/cad\/tessellate/);
  });
});

describe('F10–F12 and kept settings', () => {
  it('one photo input on CAD to COST', () => {
    expect(main).toMatch(/photoRow\.style\.display = isSoftware \|\| type === 'cad_analysis' \? 'none' : ''/);
  });

  it('a CAD-filled form drops the sample examples strip', () => {
    expect(main).toMatch(/class="inline-demo-strip"/);
    expect(fnBody('applyCADToForm')).toMatch(/\.inline-demo-strip'\)\.forEach\(n => n\.remove\(\)\)/);
  });

  it('a long option list is a drop-down the panel reader understands', () => {
    expect(main).toMatch(/const CAD_DECISION_SELECT_OVER = 12;/);
    expect(fnBody('renderCADDecisionsPanel')).toMatch(/<select data-decision-select="1"/);
    expect(fnBody('readCADDecisionPanel')).toMatch(/select\[data-decision-select\]/);
  });

  it('the CAD screen keeps its volume, overrides and mode when it is redrawn', () => {
    expect(main).toMatch(/CAD_KEPT_FIELDS = \['cad-annual-volume', 'cad-commodity-override', 'cad-material-override', 'cad-analysis-mode', 'cad-deep-analysis'\]/);
    expect(fnBody('wireCADEvents')).toMatch(/keepCADFormValues\(\);/);
    expect(fnBody('restoreCADScreen')).toMatch(/renderCADResults\(cadAnalysisResult/);
  });

  it('the new notices use theme tokens, not light literals', () => {
    const block = css.slice(css.indexOf('.cad-flow-notice {'));
    expect(block).not.toMatch(/:[^;{}]*#[0-9a-f]{3,6}\b/i);   // a colour value, not a #cad- selector
  });
});

// ── Shortlists, and where the rest are (review follow-up, 28 Oct 2026) ─────────────────────────────────────────────
import { familyCandidates } from '../src/engine/cost-input-rules/derive/material.js';

describe('the questions offer shortlists — and say where the full lists are', () => {
  it('with the process still open, the material families are those of every route on offer, not the placeholder machining list', () => {
    // The knuckle's shortlist: cast, forged, cast + machined, machined.
    const open = familyCandidates({ commodity: 'machining', routeCandidates: ['casting', 'forging', 'cast_and_machine', 'machining'] });
    for (const f of ['magnesium', 'zinc', 'nickel alloy', 'cast iron', 'titanium']) expect(open).toContain(f);
    // Machining alone (the old list) had none of magnesium, zinc, nickel alloy.
    const before = familyCandidates({ commodity: 'machining' });
    expect(before).not.toContain('magnesium');
    expect(before).not.toContain('zinc');
    // Moulding routes only: plastic, nothing metal.
    expect(familyCandidates({ commodity: 'machining', routeCandidates: ['injection_moulding', 'blow_moulding'] })).toEqual(['plastic']);
    // A decided route keeps its own list (cast iron is not forged).
    expect(familyCandidates({ commodity: 'forging' })).not.toContain('cast iron');
  });

  it('the server hands the open route shortlist to the rules on /analyze and /reanalyze', () => {
    const cad = readFileSync('server/routes/cad.ts', 'utf8');
    expect(cad).toMatch(/if \(commodityDecision\) ruleCtx\.routeCandidates = commodityDecision\.options\.map/);
    expect(cad).toMatch(/if \(commodityDecisionRe\) ruleCtx\.routeCandidates = commodityDecisionRe\.options\.map/);
  });

  it('resin offers every in-scope grade, and the reader prefers that choice', () => {
    const other = fnBody('otherChoiceHtml');
    expect(other).toMatch(/d\.id === 'material\.resin'/);
    expect(other).toMatch(/MATERIAL_SCOPE_BY_COMMODITY\[commodity\]/);
    expect(other).toMatch(/data-decision-other="1"/);
    expect(fnBody('readCADDecisionPanel')).toMatch(/other\?\.value \? other :/);
    expect(fnBody('renderCADDecisionsPanel')).toMatch(/\$\{otherChoiceHtml\(d\)\}/);
  });

  it('process and material questions link to the full lists, and changing those re-measures', () => {
    const other = fnBody('otherChoiceHtml');
    expect(other).toMatch(/'cad-commodity-override'/);
    expect(other).toMatch(/'cad-material-override'/);
    expect(fnBody('wireCADDecisionsPanel')).toMatch(/\.cad-other-link/);
    expect(fnBody('reanalyseForOverride')).toMatch(/if \(_cadRestoringForm\) return;/);
    expect(fnBody('wireCADEvents')).toMatch(/matSel\.addEventListener\('change', \(\) => reanalyseForOverride\(\)\)/);
  });
});

describe('stored measurements follow the kernel that made them', () => {
  it('geometry, mesh and analysis caches are keyed on the kernel revision', async () => {
    const store = readFileSync('server/utils/geometry-store.ts', 'utf8');
    expect(store).toMatch(/return `\$\{hash\}:\$\{unitScale\}:\$\{KERNEL_REV\}`;/);
    expect(store).toMatch(/`\$\{hash\}\.\$\{unitScale\}\.\$\{KERNEL_REV\}`/);
    const cad = readFileSync('server/routes/cad.ts', 'utf8');
    expect(cad.match(/kernelRev: KERNEL_REV/g)?.length).toBe(2);
    const { KERNEL_REV } = await import('../server/utils/geometry-store.js');
    expect(KERNEL_REV).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('the notice follows an in-place re-run', () => {
  it('says what is left after an answer re-runs the rules — never a stale count', () => {
    const body = fnBody('autoRerunCAD');
    expect(body).toMatch(/Your answer opened/);
    expect(body).toMatch(/Nothing left to answer — press Get cost\./);
  });
});
