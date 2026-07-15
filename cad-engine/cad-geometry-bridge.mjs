// Node ↔ Python bridge for the OCCT geometry engine. Ported from the CostVision
// reference geometry-bridge.ts and converted to plain ESM (.mjs) so the Node
// server (server.mjs) imports it directly. Runtime logic is unchanged: a
// concurrency semaphore, SIGKILL timeout, and output size caps around a spawned
// `python3 cad-geometry-engine.py` process.
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = join(__dirname, 'cad-geometry-engine.py');

/** Temp-file extensions come from user-supplied filenames — keep them boring. */
function safeExt(filename) {
  const ext = (filename.toLowerCase().split('.').pop() ?? 'step');
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'step';
}

// ── Python spawn semaphore ────────────────────────────────────────────────────
// Each OCP process costs hundreds of MB RSS; unbounded concurrent spawns let a
// burst of uploads exhaust the box. Excess requests queue instead of piling on.
const MAX_CONCURRENT_PYTHON = parseInt(process.env.CV_MAX_PYTHON_PROCS ?? '2', 10);
let pythonActive = 0;
const pythonQueue = [];

async function acquirePython() {
  if (pythonActive >= MAX_CONCURRENT_PYTHON) {
    await new Promise((resolve) => pythonQueue.push(resolve));
  }
  pythonActive++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pythonActive--;
    pythonQueue.shift()?.();
  };
}

export async function analyzeGeometry(buffer, filename, timeoutMs = 120_000) {
  const tmpPath = join(tmpdir(), `cv-cad-${randomBytes(8).toString('hex')}.${safeExt(filename)}`);

  const release = await acquirePython();
  try {
    await writeFile(tmpPath, buffer);
    return await _runPython(tmpPath, timeoutMs);
  } finally {
    release();
    unlink(tmpPath).catch(() => {});
  }
}

function _runPython(tmpPath, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (result) => {
      if (!settled) { settled = true; resolve(result); }
    };

    const child = spawn('python3', [PYTHON_SCRIPT, tmpPath], {
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ status: 'error', error: `Geometry engine timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      settle({ status: 'error', error: `Python process error: ${err.message}` });
    });

    child.on('close', () => {
      clearTimeout(timer);
      if (settled) return;
      const raw = stdout.trim();
      if (!raw) {
        settle({ status: 'error', error: `No output from geometry engine. stderr: ${stderr.slice(0, 400)}` });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        settle(parsed);
      } catch {
        settle({ status: 'error', error: `JSON parse failed: ${raw.slice(0, 200)}` });
      }
    });
  });
}

/** Refuse to buffer pathological outputs into Node heap. */
const MAX_STL_BYTES = parseInt(process.env.CV_MAX_STL_BYTES ?? String(300 * 1024 * 1024), 10);

/**
 * Tessellate a STEP/IGES file to a binary STL via the OCCT engine's --stl mode.
 * Returns { status:'success', stl:Buffer, triangles, meta } or { status:'error', error }.
 * `meta` (when withMeta) = { triFace:number[], faces:[…], bodies, skippedFaces }.
 */
export async function tessellateToSTL(buffer, filename, opts = {}) {
  const { timeoutMs = 120_000, withMeta = false } = opts;
  const id = randomBytes(8).toString('hex');
  const inPath = join(tmpdir(), `cv-tess-${id}.${safeExt(filename)}`);
  const outPath = join(tmpdir(), `cv-tess-${id}.stl`);

  const release = await acquirePython();
  try {
    await writeFile(inPath, buffer);
    const args = [PYTHON_SCRIPT, '--stl', inPath, outPath, ...(withMeta ? ['--with-meta'] : [])];
    const result = await new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const settle = (r) => { if (!settled) { settled = true; resolve(r); } };
      const child = spawn('python3', args, { env: { ...process.env } });
      const timer = setTimeout(() => { child.kill('SIGKILL'); settle({ status: 'error', error: `Tessellation timed out after ${timeoutMs / 1000}s` }); }, timeoutMs);
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => { clearTimeout(timer); settle({ status: 'error', error: `Python process error: ${err.message}` }); });
      child.on('close', () => {
        clearTimeout(timer);
        if (settled) return;
        try { settle(JSON.parse(stdout.trim())); }
        catch { settle({ status: 'error', error: `Tessellation output unparseable. stderr: ${stderr.slice(0, 300)}` }); }
      });
    });

    if (result.status !== 'success') return { status: 'error', error: result.error ?? 'tessellation failed' };
    const { readFile, stat } = await import('fs/promises');
    const outStat = await stat(outPath);
    if (outStat.size > MAX_STL_BYTES) {
      return { status: 'error', error: `Tessellated mesh is ${(outStat.size / 1048576).toFixed(0)} MB — over the ${(MAX_STL_BYTES / 1048576).toFixed(0)} MB limit.` };
    }
    const stl = await readFile(outPath);
    // face-metadata sidecar (per-triangle face ids + exact B-rep face data)
    let meta = null;
    if (withMeta) {
      try {
        meta = JSON.parse(await readFile(outPath + '.json', 'utf-8'));
      } catch { /* sidecar unreadable — viewer degrades to mesh-only */ }
    }
    return { status: 'success', stl, triangles: result.triangles ?? 0, meta };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  } finally {
    release();
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
    unlink(outPath + '.json').catch(() => {});
  }
}
