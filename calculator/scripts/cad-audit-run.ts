/**
 * Arm B of the CAD-to-Cost audit: drive POST /api/cad/analyze for real and
 * capture everything the server says, untouched, one JSON per run.
 *
 *   npx tsx scripts/cad-audit-run.ts <part.step> <outdir> [--commodity casting]
 *        [--volume 200000] [--mode both] [--deep] [--label name]
 *
 * The response is saved verbatim — the verifier introspects it later; this
 * script must not interpret, summarise or "fix" anything on the way through.
 * The API key comes from calculator/.env (never echoed, never logged).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith('--'));
const [file, outdir] = positional;
const flag = (name: string): string | undefined => {
  const i = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};
const has = (name: string): boolean => argv.includes(`--${name}`);

if (!file || !existsSync(file) || !outdir) {
  console.error('usage: tsx scripts/cad-audit-run.ts <part.step> <outdir> [--commodity X] [--volume N] [--mode both] [--deep] [--label name]');
  process.exit(2);
}

const BASE = process.env.CV_AUDIT_BASE ?? 'http://127.0.0.1:3002';

function apiKey(): string {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!m) throw new Error('no ANTHROPIC_API_KEY in calculator/.env');
  return m[1].trim();
}

async function main(): Promise<void> {
  const name = basename(file);
  const commodity = flag('commodity');
  const mode = flag('mode') ?? 'both';
  const volume = flag('volume') ?? '200000';
  const label = flag('label') ?? `${name.replace(/\.[^.]+$/, '')}${commodity ? '-' + commodity : '-auto'}${has('deep') ? '-deep' : ''}`;

  const form = new FormData();
  form.set('cadFile', new Blob([readFileSync(file)]), name);
  form.set('annualVolume', volume);
  form.set('mode', mode);
  form.set('noCache', 'true');
  if (commodity) form.set('commodity', commodity);
  if (has('deep')) form.set('deepAnalysis', 'true');
  // Engineer answers, as the route's decisionAnswers map — so a costed API run
  // can supply the material the geometry cannot settle (the same thing the
  // browser's decision panel does). --answer key=value, repeatable.
  const decisionAnswers: Record<string, string> = {};
  argv.forEach((a, i) => {
    if (!a.startsWith('--answer')) return;
    const kv = a.includes('=') && !a.startsWith('--answer=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1];
    const eq = kv?.indexOf('=') ?? -1;
    if (kv && eq > 0) decisionAnswers[kv.slice(0, eq)] = kv.slice(eq + 1);
  });
  if (Object.keys(decisionAnswers).length) form.set('decisionAnswers', JSON.stringify(decisionAnswers));

  const t0 = Date.now();
  process.stderr.write(`[${label}] POST /api/cad/analyze mode=${mode} commodity=${commodity ?? 'auto'} vol=${volume}\n`);
  const res = await fetch(`${BASE}/api/cad/analyze`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey() },
    body: form,
    // Fuel tank is 31 MB; OCCT measure alone can take minutes.
    signal: AbortSignal.timeout(20 * 60 * 1000),
  });
  const text = await res.text();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  mkdirSync(outdir, { recursive: true });
  const out = join(outdir, `${label}.json`);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { httpStatus: res.status, rawBody: text.slice(0, 20000) };
  }
  writeFileSync(out, JSON.stringify({
    _audit: { part: name, commodity: commodity ?? null, mode, volume: Number(volume),
              deep: has('deep'), httpStatus: res.status, seconds: Number(secs),
              capturedAt: new Date().toISOString() },
    response: payload,
  }, null, 2));
  process.stderr.write(`[${label}] HTTP ${res.status} in ${secs}s → ${out}\n`);
  if (!res.ok) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
