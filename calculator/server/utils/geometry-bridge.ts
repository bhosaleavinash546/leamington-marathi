import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = join(__dirname, 'cad-geometry-engine.py');

/** Temp-file extensions come from user-supplied filenames — keep them boring. */
function safeExt(filename: string): string {
  const ext = (filename.toLowerCase().split('.').pop() ?? 'step');
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'step';
}

/**
 * The interpreter that has OpenCASCADE.
 *
 * Bare `python3` resolves by PATH order, which is load-bearing and invisible:
 * `calculator/Dockerfile.cad` prepends `/opt/cq/bin` precisely so this line
 * finds the venv with cadquery/OCP in it. That works, but it means the choice
 * cannot be made anywhere else — a machine with cadquery under a different
 * interpreter has no way to say so, and the symptom is a silent downgrade to
 * text-parsed geometry rather than an error. `PYTHON_BIN` is that way.
 */
const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';

// ── Python spawn semaphore ────────────────────────────────────────────────────
// Each OCP process costs hundreds of MB RSS; unbounded concurrent spawns let a
// burst of uploads exhaust the box. Excess requests queue instead of piling on.
const MAX_CONCURRENT_PYTHON = parseInt(process.env.CV_MAX_PYTHON_PROCS ?? '2', 10);
let pythonActive = 0;
const pythonQueue: Array<() => void> = [];

// Ceiling on subprocess stdout accumulated in the Node heap. `analyze` returns
// its whole geometry JSON via stdout; without a cap a runaway/crafted subprocess
// could grow the heap unbounded (audit RK7). 64 MB is far above any legitimate
// geometry JSON (the triangle-heavy sidecar goes to a file, not stdout).
const MAX_STDOUT_BYTES = parseInt(process.env.CV_MAX_STDOUT_BYTES ?? String(64 * 1024 * 1024), 10);

// Authoritative geometry-engine timeout (ms). The Node parent SIGKILLs the
// Python process at this bound; the Python engine self-aborts ~10 s earlier
// (CV_TESS_TIMEOUT_MS, read there too) so a clean error beats the kill, and the
// client fetch aborts a little later still. Default 300 s so large STEP
// assemblies have room to mesh; env-tunable for bigger jobs.
const DEFAULT_TESS_TIMEOUT_MS = parseInt(process.env.CV_TESS_TIMEOUT_MS ?? '300000', 10) || 300000;

async function acquirePython(): Promise<() => void> {
  if (pythonActive >= MAX_CONCURRENT_PYTHON) {
    await new Promise<void>((resolve) => pythonQueue.push(resolve));
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

/**
 * The measured-geometry contract.
 *
 * Declared once, in the pure engine (`src/engine/ai-analysis.ts`), and re-exported
 * here. There used to be two copies and they had already drifted — the engine's
 * was missing `topology`, which is the signal that separates a sealed hollow body
 * (fuel tank → blow moulding) from an open drape (bumper → injection moulding).
 * One declaration means that class of bug cannot recur.
 */
import type { OCCTGeometry } from '../../src/engine/ai-analysis.js';
import { applyShellWallCorrection } from '../../src/engine/geometry-sanity.js';
export type { OCCTGeometry };

/**
 * Discard per-face thickness readings that are ray overshoot, not wall.
 *
 * On an open thin shell the inward ray can miss the opposite surface and cross
 * the whole cavity — the documented bumper case, 27 mm reported against a real
 * 2.5 mm. `applyShellWallCorrection` already fixes the AGGREGATE from 2·V/S;
 * this applies the same physical reference per face. A reading more than 3x the
 * true mean wall is not a thick section, it is a ray that escaped, so it is
 * dropped rather than capped — a dropped reading makes the rule stay silent,
 * whereas a capped one would invent a plausible number.
 *
 * Returns null when there was nothing to correct.
 */
function applyShellWallCorrectionToFeatures(
  geo: OCCTGeometry, correctedWallMm: number | null,
): { dropped: number; total: number; capMm: number; floorMm: number } | null {
  const mf = geo.manufacturingFeatures;
  if (!mf?.available) return null;

  // Reference thickness: 2·V/S, the characteristic wall of ANY solid, not just a
  // thin shell. Gating this on the shell correction was not enough — on the
  // steering knuckle (a chunky casting, so the shell correction never fired) the
  // raw readings still ran from 0.2 mm to 142.8 mm on a 116x237x210 mm part.
  // Both extremes are ray artefacts: 0.2 mm is a ray grazing along a face,
  // 142.8 mm is a ray crossing the whole part. Neither is a wall, and a section
  // rule fed either of them reports a step change that does not exist.
  const V = geo.volume?.mm3 ?? 0;
  const S = geo.surfaceArea?.mm2 ?? 0;
  const characteristic = correctedWallMm ?? (S > 0 && V > 0 ? (2 * V) / S : null);
  if (!characteristic || !(characteristic > 0)) return null;

  const capMm = characteristic * 3;
  const floorMm = characteristic * 0.3;
  let dropped = 0, total = 0;

  for (const f of mf.features) {
    for (const key of ['thicknessMm', 'neighbourWallMm', 'neighbourMinThicknessMm'] as const) {
      const v = f[key];
      if (typeof v === 'number') {
        total++;
        if (v > capMm || v < floorMm) { delete f[key]; dropped++; }
      }
    }
    // A ratio derived from a discarded reading is meaningless — drop it too.
    if (f.thicknessMm === undefined || f.neighbourMinThicknessMm === undefined) {
      delete f.sectionRatio;
    }
    if (f.neighbourWallMm === undefined) delete f.bossToWallRatio;
  }
  if (mf.hotSpots) {
    const before = mf.hotSpots.length;
    mf.hotSpots = mf.hotSpots.filter(h => h.thicknessMm <= capMm && h.thicknessMm >= floorMm);
    dropped += before - mf.hotSpots.length;
    total += before;
  }
  if (dropped === 0) return null;

  mf.medianThicknessMm = Number(characteristic.toFixed(3));
  mf.note = [mf.note, `${dropped} of ${total} per-face thickness readings discarded as ray `
    + `artefacts — outside ${floorMm.toFixed(2)}–${capMm.toFixed(2)} mm, i.e. 0.3x to 3x the `
    + `characteristic 2·V/S thickness of ${characteristic.toFixed(2)} mm. Readings below the `
    + 'floor are rays grazing a face; readings above the cap are rays crossing the part. '
    + 'Wall-derived checks ran only on the survivors.']
    .filter(Boolean).join(' ');
  return { dropped, total, capMm: Number(capMm.toFixed(2)), floorMm: Number(floorMm.toFixed(2)) };
}

export async function analyzeGeometry(
  buffer: Buffer,
  filename: string,
  timeoutMs = DEFAULT_TESS_TIMEOUT_MS,
  /**
   * Extra environment for the kernel process. Used by the background DFM job to
   * set CV_EXTRACT_FEATURES=1, which turns on the expensive per-face scan.
   * Passed explicitly rather than by mutating `process.env` around the await —
   * a global mutation across an async boundary is a race waiting for the day
   * someone raises the worker concurrency.
   */
  extraEnv: Record<string, string> = {},
): Promise<OCCTGeometry> {
  const tmpPath = join(tmpdir(), `cv-cad-${randomBytes(8).toString('hex')}.${safeExt(filename)}`);

  const release = await acquirePython();
  try {
    await writeFile(tmpPath, buffer);
    const geo = await _runPython(tmpPath, timeoutMs, extraEnv);
    // The ray-cast wall overshoots badly on thin shells (a bumper reads 27 mm
    // against a real ~2.5 mm). Correct it HERE, at the measurement boundary, so
    // every consumer sees the same wall — moulding cooling goes as wall², so a
    // caller that misses this is not slightly wrong, it is 100x wrong.
    const wc = applyShellWallCorrection(geo);
    if (wc) console.log(`[geometry] thin-shell wall corrected: ${wc.fromMm} mm → ${wc.toMm} mm (2·V/S)`);
    // The SAME overshoot corrupts the per-face thicknesses, and correcting only
    // the aggregate left the geometric DFM rules reading raw values: on the
    // bumper a face reported 108.9 mm of "wall" against a real 2.5 mm, and the
    // rib-thickness rule duly fired. Correct both at the same boundary, so no
    // consumer can ever see one corrected and the other not.
    const fc = applyShellWallCorrectionToFeatures(geo, wc?.toMm ?? null);
    if (fc) console.log(`[geometry] per-face thickness: ${fc.dropped} of ${fc.total} readings `
      + `discarded as ray artefacts (outside ${fc.floorMm}-${fc.capMm} mm)`);
    return geo;
  } finally {
    release();
    unlink(tmpPath).catch(() => {});
  }
}

function _runPython(tmpPath: string, timeoutMs: number,
                    extraEnv: Record<string, string> = {}): Promise<OCCTGeometry> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (result: OCCTGeometry) => {
      if (!settled) { settled = true; resolve(result); }
    };

    const child = spawn(PYTHON_BIN, [PYTHON_SCRIPT, tmpPath], {
      env: { ...process.env, ...extraEnv },
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ status: 'error', error: `Geometry engine timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > MAX_STDOUT_BYTES) {
        child.kill('SIGKILL');
        clearTimeout(timer);
        settle({ status: 'error', error: `Geometry engine output exceeded ${(MAX_STDOUT_BYTES / 1048576).toFixed(0)} MB — aborted.` });
      }
    });
    child.stderr.on('data', (d: Buffer) => { if (stderr.length < 8192) stderr += d.toString(); });

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
        const parsed = JSON.parse(raw) as OCCTGeometry;
        settle(parsed);
      } catch {
        settle({ status: 'error', error: `JSON parse failed: ${raw.slice(0, 200)}` });
      }
    });
  });
}

/**
 * Tessellate a STEP/IGES file to a binary STL via the OCCT engine's --stl
 * mode. Feeds the client's rendered-views pipeline: the browser renders
 * canonical views from the returned STL so the vision model can see the part.
 */
export interface TessellationFace {
  id: number;
  type: string;
  /** cylinder/sphere radius; cone reference radius; torus MAJOR radius (mm) */
  radiusMm: number | null;
  /** torus MINOR radius (mm) */
  radius2Mm: number | null;
  /** cone half-angle (degrees) */
  angleDeg: number | null;
  /** cylinders: exact height/depth along the axis (mm) */
  depthMm?: number | null;
  areaCm2: number | null;
  /** solid index this face belongs to; -1 = not part of any solid */
  bodyId: number;
  /** cylinders only: true = internal wall (hole/bore), false = external (boss/shaft) */
  hole: boolean | null;
  /** single-ray wall thickness at the face centroid (mm) — viewer heatmap; null when the ray missed */
  thicknessMm?: number | null;
}

export interface TessellationMeta {
  /**
   * Per-triangle source face — the 1-based B-rep face index, the SAME id a
   * geometric-DFM finding carries in `faceIds`. Highlighting a finding's faces
   * is therefore a direct lookup, with no translation table in between.
   */
  triFace: number[];
  /**
   * Indexed BY face id, so `faces[triFace[t]]` is the face a triangle came
   * from. Index 0 and any face the mesher could not triangulate are `null`.
   */
  faces: (TessellationFace | null)[];
  /** HONEST solid count — 0 means an unstitched surface model (volume unreliable) */
  bodies: number;
  /** faces the mesher produced no triangulation for — the mesh has gaps there */
  skippedFaces: number;
}

/** Refuse to buffer pathological outputs into Node heap. */
const MAX_STL_BYTES = parseInt(process.env.CV_MAX_STL_BYTES ?? String(750 * 1024 * 1024), 10);

export async function tessellateToSTL(
  buffer: Buffer,
  filename: string,
  opts: { timeoutMs?: number; withMeta?: boolean } = {},
): Promise<{ status: 'success'; stl: Buffer; triangles: number; meta: TessellationMeta | null } | { status: 'error'; error: string }> {
  const { timeoutMs = DEFAULT_TESS_TIMEOUT_MS, withMeta = false } = opts;
  const id = randomBytes(8).toString('hex');
  const inPath = join(tmpdir(), `cv-tess-${id}.${safeExt(filename)}`);
  const outPath = join(tmpdir(), `cv-tess-${id}.stl`);

  const release = await acquirePython();
  try {
    await writeFile(inPath, buffer);
    const args = [PYTHON_SCRIPT, '--stl', inPath, outPath, ...(withMeta ? ['--with-meta'] : [])];
    const result = await new Promise<{ status: string; triangles?: number; error?: string }>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const settle = (r: { status: string; triangles?: number; error?: string }) => { if (!settled) { settled = true; resolve(r); } };
      const child = spawn(PYTHON_BIN, args, { env: { ...process.env } });
      const timer = setTimeout(() => { child.kill('SIGKILL'); settle({ status: 'error', error: `Tessellation timed out after ${timeoutMs / 1000}s` }); }, timeoutMs);
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
        if (stdout.length > MAX_STDOUT_BYTES) { child.kill('SIGKILL'); clearTimeout(timer); settle({ status: 'error', error: `Tessellation output exceeded ${(MAX_STDOUT_BYTES / 1048576).toFixed(0)} MB — aborted.` }); }
      });
      child.stderr.on('data', (d: Buffer) => { if (stderr.length < 8192) stderr += d.toString(); });
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
    let meta: TessellationMeta | null = null;
    if (withMeta) {
      try {
        meta = JSON.parse(await readFile(outPath + '.json', 'utf-8')) as TessellationMeta;
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
