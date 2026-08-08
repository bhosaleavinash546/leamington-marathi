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
const ASSEMBLY_SCRIPT = join(__dirname, 'assembly_decompose.py');

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

export async function analyzeGeometry(buffer, filename, timeoutMs = 120_000, onStage = null,
                                      drawDirection = null) {
  const tmpPath = join(tmpdir(), `cv-cad-${randomBytes(8).toString('hex')}.${safeExt(filename)}`);

  const release = await acquirePython();
  try {
    await writeFile(tmpPath, buffer);
    // `onStage` is optional and every existing caller omits it, so the
    // non-streaming path — the benchmark included — is byte-for-byte unchanged.
    return await _runPython(tmpPath, timeoutMs, PYTHON_SCRIPT, onStage, drawDirection);
  } finally {
    release();
    unlink(tmpPath).catch(() => {});
  }
}

/**
 * Decompose an assembly into solids with measured symmetry, shape signatures and
 * contacts — the input to the DFA engine. Same semaphore and timeout discipline
 * as analyzeGeometry: symmetry testing runs boolean intersections, so this is the
 * more expensive of the two and must not escape the concurrency cap.
 */
export async function decomposeAssembly(buffer, filename, timeoutMs = 120_000) {
  const tmpPath = join(tmpdir(), `cv-asm-${randomBytes(8).toString('hex')}.${safeExt(filename)}`);
  const release = await acquirePython();
  try {
    await writeFile(tmpPath, buffer);
    return await _runPython(tmpPath, timeoutMs, ASSEMBLY_SCRIPT);
  } finally {
    release();
    unlink(tmpPath).catch(() => {});
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

/**
 * Find our JSON in the engine's stdout.
 *
 * OCCT writes its own diagnostics — ANSI-coloured — to STDOUT, ahead of
 * whatever we print. A plain `JSON.parse(stdout)` therefore fails on every
 * malformed CAD file and the user was shown
 * `JSON parse failed: ****ERR StepFile: Undefined Parsing…` instead of a
 * sentence. Scan lines from the end and take the first that parses.
 */
export function extractJson(raw) {
  const lines = String(raw).replace(ANSI, '').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch { /* keep scanning upwards */ }
  }
  return null;
}

/** Turn kernel noise into something a cost engineer can act on. */
export function describeUnparseable(raw, stderr = '') {
  const text = `${raw}\n${stderr}`.replace(ANSI, '');
  if (/Undefined Parsing|Incorrect syntax|expecting STEP|Bad file format/i.test(text)) {
    return 'This file could not be read as STEP or IGES. It may be truncated, '
      + 'saved in another format, or exported with an option this reader does not support. '
      + 'Re-export it as AP214 or AP242 STEP and try again.';
  }
  if (/MemoryError|std::bad_alloc|Killed/i.test(text)) {
    return 'The model was too large for the geometry engine to load. Try simplifying '
      + 'the part or exporting a single body rather than a full assembly.';
  }
  return 'The geometry engine returned no readable result for this file. '
    + 'Check that it is a valid STEP or IGES export.';
}

function _runPython(tmpPath, timeoutMs, script = PYTHON_SCRIPT, onStage = null, drawDirection = null) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    // Partial line carried between chunks: a stdout chunk boundary can land
    // mid-JSON, and forwarding half an event would surface a parse error to the
    // user in the middle of an otherwise fine analysis.
    let pending = '';

    const settle = (result) => {
      if (!settled) { settled = true; resolve(result); }
    };

    // A draw direction the USER pinned, rather than the one the sweep would
    // pick. Validated here rather than trusted: a malformed vector must not
    // reach the engine and silently become a zero-length axis, which would
    // classify every face as zero-draft.
    const pinned = Array.isArray(drawDirection) && drawDirection.length === 3
      && drawDirection.every(v => Number.isFinite(Number(v)))
      && drawDirection.some(v => Math.abs(Number(v)) > 1e-9)
      ? ['--draw', drawDirection.map(Number).join(',')]
      : [];
    const child = spawn('python3', [script, tmpPath, ...pinned], {
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ status: 'error', error: `Geometry engine timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      // Forward completed `@stage` lines AS THEY ARRIVE. The engine announces
      // each phase the moment it genuinely finishes, so the browser can show the
      // analysis working rather than a spinner that says nothing for 30 s. These
      // lines are not valid JSON, so extractJson() below already ignores them.
      if (!onStage) return;
      pending += text;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('@stage ')) continue;
        try { onStage(JSON.parse(t.slice(7))); } catch { /* ignore a malformed event */ }
      }
    });
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
      const parsed = extractJson(raw);
      if (parsed) { settle(parsed); return; }
      // Nothing parseable. OCCT prints its own diagnostics here, so surface a
      // sentence a user can act on rather than a fragment of kernel internals.
      settle({ status: 'error', error: describeUnparseable(raw, stderr) });
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
      // Tessellation is one shot with no phases worth reporting, so this spawn
      // just accumulates. Progress events belong to the analysis path only.
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
