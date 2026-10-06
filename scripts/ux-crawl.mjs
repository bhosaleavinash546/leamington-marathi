#!/usr/bin/env node
// UX crawl: every route × both themes × desktop (1440) and mobile (390), on a
// real production server with a signed-in user and a seeded results page.
// Writes a JSON of measures and screenshots for the UX review.
//
//   node scripts/ux-crawl.mjs <outDir> [tag]
//
// Measures per capture: load time, console/page errors (with source
// location), 4xx/5xx responses, axe serious/critical, horizontal overflow,
// clipped text, h1s, document title, distinct font sizes, primary-button
// count, small targets (<32 px), page height. Desktop screenshots are capped
// at 5,000 px tall (a 700k px virtualised list crashes a full-page capture).
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTD = resolve(process.argv[2] || join(tmpdir(), 'ux-crawl'));
const TAG = process.argv[3] || 'run';
const ONLY = process.env.UX_ROUTES ? process.env.UX_ROUTES.split(',') : null;
const PORT = 19611, BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const axe = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const ROUTES = ['/', '/dashboard', '/analyze', '/results', '/innovate', '/triz', '/idea-studio', '/cad-diff', '/prism', '/should-cost', '/cad-to-cost', '/pcb-bom-cost', '/bom-analysis', '/dfm-studio', '/harness-cost', '/pipeline', '/vave-tracker', '/marketplace', '/horizon', '/trends', '/help', '/settings/api-key', '/team', '/integrations', '/admin/rate-library', '/legal/privacy', '/this-does-not-exist'];
mkdirSync(join(OUTD, 'shots'), { recursive: true });

const run = JSON.parse(readFileSync(join(ROOT, 'benchmark/prism-runs/edu.json'), 'utf8'));
const RESULT = JSON.stringify({ id: 'sample-edu', onServer: false, config: { systemId: 'part360', subassemblyId: 'part360', vehicleType: 'Premium SUV', annualVolume: run.annualVolume, plantRegion: 'germany', currency: 'EUR', apiKey: '' }, ideas: run.ideas, sources: [], validation: run.validation, summary: { totalIdeas: run.ideas.length, quickWins: 3, strategicItems: 5, searchesPerformed: 0 }, generatedAt: '2026-10-05 09:00' });

const dataDir = mkdtempSync(join(tmpdir(), 'ux-'));
const srv = spawn('node', ['server.mjs'], { cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir, JWT_SECRET: 'ux', CREDENTIALS_SECRET: 'uxcreds1234567890', PORT: String(PORT), BRAINSPARK_BACKUPS: '0', NODE_ENV: 'production' }, stdio: 'ignore' });
for (let i = 0; i < 150; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch {} await sleep(1000); }
const su = await (await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ux${Date.now()}@brainspark.io`, password: 'Passw0rd!long', name: 'Priya Sharma' }) })).json();
const STORE = JSON.stringify({ token: su.token, user: su.user });
// UX_SEED=history: give the user a saved analysis and two business cases
// (one at G3) through the real API, so Home renders its KPI strip and
// "continue where you left off" instead of the first-run state.
if (process.env.UX_SEED === 'history') {
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${su.token}` };
  const r = JSON.parse(RESULT);
  await fetch(BASE + '/api/projects', { method: 'POST', headers: auth, body: JSON.stringify({ ...r, systemName: 'Electric Drive Unit', subassemblyName: 'EDU housing', generatedAt: new Date().toISOString() }) });
  const cases = [
    ['Consolidate 3-part housing into one HPDC water-jacket', 'G3', 4.2, 'Electric Drive', [{ model: 'Premium SUV', volume: 120000, applicablePct: 100 }]],
    ['Grain-boundary-diffused NdFeB magnets', 'G1', 6.5, 'Electric Drive', [{ model: 'Premium SUV', volume: 120000, applicablePct: 100 }, { model: 'Compact SUV', volume: 80000, applicablePct: 100 }]],
  ];
  for (const [ideaTitle, gate, savingPerPart, commodityName, vehicleData] of cases) {
    await fetch(BASE + '/api/business-cases', { method: 'POST', headers: auth, body: JSON.stringify({ ideaTitle, gate, savingPerPart, commodityName, vehicleData }) });
  }
}
const launch = () => chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let b = await launch();
const rows = [];
try {
  for (const theme of ['dark', 'light']) for (const vp of [{ n: 'desk', w: 1440, h: 900 }, { n: 'mob', w: 390, h: 844 }]) {
    let ctx;
    const mkCtx = async () => {
      ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, colorScheme: theme, bypassCSP: true, isMobile: vp.n === 'mob', hasTouch: vp.n === 'mob' });
      // Storage is seeded by a page evaluate, NOT addInitScript: an injected
      // init script is reported as an inline-script CSP violation on every
      // page, which is the harness, not the app.
    };
    await mkCtx();
    for (const route of (ONLY || ROUTES)) {
      try {
        if (!b.isConnected()) { b = await launch(); await mkCtx(); }
        const p = await ctx.newPage();
        const errs = [], bad = [];
        p.on('console', m => { if (m.type() === 'error') errs.push(`${m.text().slice(0, 160)} @${m.location()?.url?.replace(BASE, '') ?? ''}:${m.location()?.lineNumber ?? ''}`); });
        p.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 160)));
        p.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) bad.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
        await p.goto(BASE + '/legal/privacy', { waitUntil: 'domcontentloaded' });
        await p.evaluate(([s, t, r]) => { localStorage.setItem('brainspark_auth', s); localStorage.setItem('brainspark_theme', t); sessionStorage.setItem('analysisResult', r); sessionStorage.setItem('analysisSystemName', 'Prism'); sessionStorage.setItem('analysisSubName', 'EDU housing'); }, [STORE, theme, RESULT]);
        errs.length = 0; bad.length = 0;
        const t0 = Date.now();
        try { await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 }); } catch (e) { errs.push('GOTO ' + e.message.slice(0, 80)); }
        await sleep(900);
        const ms = Date.now() - t0;
        const m = await p.evaluate(() => {
          const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const h1 = [...document.querySelectorAll('h1')].filter(vis).map(h => h.textContent.trim().slice(0, 60));
          const clipped = [...document.querySelectorAll('body *')].filter(el => { if (!vis(el) || el.children.length) return false; const s = getComputedStyle(el); if (el.closest('.sr-only') || el.getBoundingClientRect().width <= 1) return false; return el.scrollWidth > el.clientWidth + 2 && (s.overflow === 'hidden' || s.overflowX === 'hidden') && s.textOverflow !== 'ellipsis' && el.textContent.trim().length > 3; }).map(el => el.textContent.trim().slice(0, 40));
          const targets = [...document.querySelectorAll('button, a[href], input, select, [role=button]')].filter(vis);
          const small = targets.filter(el => { const r = el.getBoundingClientRect(); return r.height < 32 || r.width < 32; }).length;
          const sizes = new Set([...document.querySelectorAll('body *')].filter(el => vis(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(el => getComputedStyle(el).fontSize));
          const primary = [...document.querySelectorAll('button, a')].filter(el => vis(el) && /dfm-cta|bg-gold-5|btn-primary|from-gold/.test(el.className?.baseVal ?? el.className ?? ''));
          return { hOverflow: document.documentElement.scrollWidth > innerWidth + 1, height: document.documentElement.scrollHeight, h1, clipped, targets: targets.length, small, fontSizes: sizes.size, primary: primary.length, primaryLabels: primary.slice(0, 20).map(e => e.textContent.trim().slice(0, 30)), title: document.title };
        });
        // axe is injected as an inline script, so the context bypasses CSP;
        // without that the injection is blocked and axe silently never runs.
        let axeV = ['axe-did-not-run'];
        try { await p.addScriptTag({ content: axe }); axeV = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}(${v.nodes.length})`)); } catch {}
        const shot = join(OUTD, 'shots', `${TAG}-${theme}-${vp.n}-${route.replace(/\W+/g, '_') || 'root'}.png`);
        await p.screenshot({ path: shot, ...(vp.n === 'desk' ? { clip: { x: 0, y: 0, width: vp.w, height: Math.min(m.height, 5000) }, fullPage: true } : {}) });
        rows.push({ theme, vp: vp.n, route, ms, errs, bad: [...new Set(bad)].slice(0, 6), axe: axeV, ...m });
        console.log(`${theme}/${vp.n} ${route} ${ms}ms h1=${JSON.stringify(m.h1)} errs=${errs.length} 4xx=${bad.length} axe=${axeV.join(',') || 0} hOv=${m.hOverflow} clip=${m.clipped.length} small=${m.small}/${m.targets} primary=${m.primary} title="${m.title}"`);
        await p.close();
      } catch (e) {
        console.log(`${theme}/${vp.n} ${route} CRASH ${e.message.slice(0, 100)}`);
        rows.push({ theme, vp: vp.n, route, crash: e.message.slice(0, 200) });
        try { await b.close(); } catch {}
        b = await launch(); await mkCtx();
      }
    }
    await ctx.close();
  }
} finally { await b.close(); srv.kill(); }
writeFileSync(join(OUTD, `crawl-${TAG}.json`), JSON.stringify(rows, null, 1));
console.log(`wrote ${rows.length} captures → ${OUTD}`);
