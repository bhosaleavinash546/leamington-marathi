// The /api/dfm/drawing-extract endpoint and the /analyze drawing merge, over
// real HTTP with a FAKE Anthropic client — the established DI pattern: the
// route never knows its model is a test double, and no network is touched.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { registerDfmRoutes } from '../routes/dfm.mjs';

// What the "model" reads off the fixture drawing. Raw-schema shaped: the
// route normalizes it, so the response proves the whole chain.
const FIXTURE_EXTRACTION = {
  units: 'mm', readability: 'good',
  dimensions: [
    { nominal: 50, totalBand: 0.6, type: 'linear', toleranced: true, sourceText: '50 ±0.3' },
    { nominal: 8, plus: 0.05, minus: 0.05, type: 'diameter', toleranced: true, sourceText: 'Ø8 ±0.05' },
  ],
  gdt: [{ symbol: 'flatness', tolerance: 0.4, sourceText: 'FLAT 0.4' }],
  roughness: [{ raUm: 1.6, scope: 'all machined', sourceText: 'Ra 1.6' }],
  titleBlock: { material: 'Polycarbonate (PC)', drawingNumber: 'DWG-77', generalToleranceNote: 'DIN 16742-TG6' },
  overall: { width: 120, height: 60, thickness: 20 },
};

function fakeAnthropic() {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push({ model: params.model, toolName: params.tools?.[0]?.name });
        return { content: [{ type: 'tool_use', name: params.tools[0].name, input: FIXTURE_EXTRACTION }] };
      },
    },
  };
}

let server, base, client;

before(async () => {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  client = fakeAnthropic();
  registerDfmRoutes(app, {
    requireAuth: (req, _res, next) => { req.user = { id: 1 }; next(); },
    rateLimit: () => (_req, _res, next) => next(),
    db: null,
    orgAccess: null,
    makeAnthropic: () => client,
    resolveApiKey: (req) => (req.headers['x-no-key'] ? null : 'test-key'),
    safeLlmError: () => 'AI request failed. Please try again.',
    checkUsageQuota: (_req, _res, next) => next(),
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

describe('POST /api/dfm/drawing-extract', () => {
  it('returns the normalized extraction from the vision read', async () => {
    const r = await fetch(`${base}/api/dfm/drawing-extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: 'aGVsbG8=', mimeType: 'application/pdf' }),
    });
    assert.equal(r.status, 200);
    const { drawing } = await r.json();
    assert.equal(drawing.ok, true);
    assert.equal(drawing.dimensions.length, 2);
    assert.equal(drawing.dimensions[1].bandMm, 0.1, 'plus+minus became one band');
    assert.equal(drawing.titleBlock.drawingNumber, 'DWG-77');
    assert.equal(client.calls[0].toolName, 'emit_drawing');
  });

  it('rejects an oversize payload with 413, a bad mime with 400, and no key with 400', async () => {
    const big = await fetch(`${base}/api/dfm/drawing-extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: 'A'.repeat(11_000_001), mimeType: 'application/pdf' }),
    });
    assert.equal(big.status, 413);
    const mime = await fetch(`${base}/api/dfm/drawing-extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: 'aGVsbG8=', mimeType: 'image/tiff' }),
    });
    assert.equal(mime.status, 400);
    const noKey = await fetch(`${base}/api/dfm/drawing-extract`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-no-key': '1' },
      body: JSON.stringify({ fileBase64: 'aGVsbG8=', mimeType: 'application/pdf' }),
    });
    assert.equal(noKey.status, 400);
    assert.match((await noKey.json()).error, /No API key/);
  });
});

describe('POST /api/dfm/analyze with a drawing', () => {
  // The client normally posts back what /drawing-extract returned; build
  // that normalized shape once.
  const normalizedDrawing = () => ({
    ok: true, units: 'mm', readability: 'good',
    dimensions: [
      { nominalMm: 50, bandMm: 0.6, type: 'linear', toleranced: true, sourceText: '50 ±0.3' },
      { nominalMm: 8, bandMm: 0.1, type: 'diameter', toleranced: true, sourceText: 'Ø8 ±0.05' },
    ],
    gdt: [{ symbol: 'flatness', toleranceMm: 0.4, sourceText: 'FLAT 0.4' }],
    roughness: [{ raUm: 1.6, raUin: 63, sourceText: 'Ra 1.6' }],
    titleBlock: { drawingNumber: 'DWG-77' },
    overall: { widthMm: 120, heightMm: 60, thicknessMm: 20 },
  });

  it('drawing-only: tolerance rules fire from the drawing, geometry rules abstain with the mode named', async () => {
    const fd = new FormData();
    fd.append('drawing', JSON.stringify(normalizedDrawing()));
    fd.append('material', 'Polycarbonate (PC)');
    fd.append('process', 'injection-moulding');
    const r = await fetch(`${base}/api/dfm/analyze`, { method: 'POST', body: fd });
    assert.equal(r.status, 200);
    const payload = await r.json();
    assert.equal(payload.partName, 'DWG-77', 'named from the title block, not a hex string');
    assert.ok(payload.analysisLimits.some((l) => l.kind === 'drawingOnly'));
    const result = payload.results.find((x) => x.process === 'injection-moulding');
    const tol = [...result.findings, ...result.passed].find((f) => f.id === 'im-tolerance-capability');
    assert.ok(tol, 'the DIN judge must run from the drawing rows');
    assert.match(tol.measuredBasis, /2D drawing/);
    assert.ok(result.notEvaluated.length > 0);
    assert.ok(result.notEvaluated.every((f) => /Drawing-only analysis/.test(f.reason)),
      'every abstention names the mode');
    assert.equal(payload.drawing.ok, true);
    assert.ok(payload.drawingApplied.some((a) => /toleranced dimensions/.test(a)));
  });

  it('a tampered drawing blob is re-clamped, and garbage is rejected outright', async () => {
    const tampered = normalizedDrawing();
    tampered.dimensions.push({ nominalMm: -99, bandMm: -1, type: 'linear', toleranced: true, sourceText: 'evil' });
    tampered.titleBlock.drawingNumber = '<script>alert(1)</script>DWG';
    const fd = new FormData();
    fd.append('drawing', JSON.stringify(tampered));
    fd.append('material', 'Polycarbonate (PC)');
    fd.append('process', 'injection-moulding');
    const r = await fetch(`${base}/api/dfm/analyze`, { method: 'POST', body: fd });
    assert.equal(r.status, 200);
    const payload = await r.json();
    assert.equal(payload.drawing.dimensions.length, 2, 'the negative row is dropped by re-normalization');
    assert.ok(!payload.drawing.titleBlock.drawingNumber.includes('<'));
    const garbage = new FormData();
    garbage.append('drawing', 'not json at all');
    const g = await fetch(`${base}/api/dfm/analyze`, { method: 'POST', body: garbage });
    assert.equal(g.status, 400);
  });

  it('no file and no drawing is still the original 400', async () => {
    const fd = new FormData();
    fd.append('material', 'Polycarbonate (PC)');
    const r = await fetch(`${base}/api/dfm/analyze`, { method: 'POST', body: fd });
    assert.equal(r.status, 400);
  });
});

describe('registration without LLM deps', () => {
  it('keeps the deterministic routes and answers 503 on extract', async () => {
    const app = express();
    app.use(express.json());
    registerDfmRoutes(app, {
      requireAuth: (req, _res, next) => { req.user = { id: 1 }; next(); },
      rateLimit: () => (_req, _res, next) => next(),
      db: null, orgAccess: null,
    });
    const s = app.listen(0);
    await new Promise((r) => s.once('listening', r));
    const b = `http://127.0.0.1:${s.address().port}`;
    try {
      const r = await fetch(`${b}/api/dfm/drawing-extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: 'aGVsbG8=', mimeType: 'application/pdf' }),
      });
      assert.equal(r.status, 503);
      const opts = await fetch(`${b}/api/dfm/options`);
      assert.equal(opts.status, 200, 'the deterministic routes still register');
    } finally { s.close(); }
  });
});
