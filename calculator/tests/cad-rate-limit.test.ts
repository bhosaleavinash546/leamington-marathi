/**
 * A refused CAD request says why, in JSON the screen can print (world rate round live run, 30 Oct 2026: the
 * default plain-text "Too many requests" made the screen's res.json() throw, so a refused Get cost read as a
 * parse error). CAD_RATE_LIMIT_SCALE raises the budget for a load test only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { cadLimiter } from '../server/routes/cad.js';

/** A server with one limited route; `post()` returns status + parsed body. */
async function serverWith(max: number) {
  const app = express();
  app.post('/x', cadLimiter(max, 're-analyses'), (_req, res) => { res.json({ success: true }); });
  const srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/x`;
  return {
    post: async () => { const r = await fetch(url, { method: 'POST' }); return { status: r.status, body: await r.json() as Record<string, string> }; },
    close: () => new Promise(r => srv.close(r)),
  };
}

describe('CAD rate limits', () => {
  afterEach(() => { delete process.env.CAD_RATE_LIMIT_SCALE; });
  it('the refusal is JSON with a reason and the budget', async () => {
    const s = await serverWith(2);
    expect((await s.post()).status).toBe(200);
    expect((await s.post()).status).toBe(200);
    const r = await s.post();   // res.json() on the screen must not throw
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('CAD_RATE_LIMITED');
    expect(r.body.error).toMatch(/Too many re-analyses from this address \(2 per 10 minutes\)/);
    await s.close();
  });
  it('CAD_RATE_LIMIT_SCALE multiplies the budget', async () => {
    process.env.CAD_RATE_LIMIT_SCALE = '2';
    const s = await serverWith(1);
    expect((await s.post()).status).toBe(200);
    expect((await s.post()).status).toBe(200);
    expect((await s.post()).status).toBe(429);
    await s.close();
  });
});
