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

export interface OCCTGeometry {
  status: 'success' | 'error';
  partName?: string;
  boundingBox?: { xMm: number; yMm: number; zMm: number };
  volume?: { mm3: number; cm3: number };
  surfaceArea?: { mm2: number; cm2: number };
  fillRatio?: number;
  /** Sealed-hollow-body vs open-drape topology (distinguishes a fuel tank from a bumper). */
  topology?: {
    available: boolean;
    solidCount?: number;
    shellCount?: number;
    voidCount?: number;
    freeEdgeCount?: number;
    freeEdgeRatio?: number;
    /** True → encloses a sealed cavity (blow/rotational-moulding candidate). */
    enclosesSealedVoid?: boolean;
    /** True → thin open drape with no enclosed void (injection-moulding / thermoforming). */
    openShell?: boolean;
    note?: string;
  } | null;
  wallThickness?: {
    minMm: number; maxMm: number; meanMm: number; stdDevMm: number;
    sampleCount: number; method: 'ray_cast' | 'formula'; uniformity: string;
  } | null;
  draftAnalysis?: {
    drawDirectionXYZ: [number, number, number];
    undercutFaceCount: number;
    zeroDraftFaceCount: number;
    adequateDraftFaceCount: number;
    minPositiveDraftDeg: number | null;
    maxPositiveDraftDeg: number | null;
    analyzedFaceCount: number;
  } | null;
  setupAnalysis?: {
    estimatedSetupCount: number;
    principalDirections: Array<{ directionLabel: string; faceCount: number }>;
  } | null;
  cncCycleTimeEstimate?: {
    setupTimeMins: number;
    planarMillingTimeMins: number;
    drillBoreTimeMins: number;
    estimatedTotalMins: number;
    estimatedTotalHrs: number;
    assumedFeedRateMm2PerMin: number;
    assumedDrillBoreMinPerFeature: number;
    assumedSetupTimeMinsPerSetup: number;
  } | null;
  weights?: {
    aluminiumKg: number;
    steelKg: number;
    plasticKg: number;
    castIronKg: number;
    copperKg: number;
    titaniumKg: number;
  };
  faces?: { total: number; byType: Record<string, number> };
  edges?: {
    total: number;
    byType: Record<string, number>;
    sampleCircleRadiiMm: number[];
  };
  features?: {
    cylindricalFaceCount: number;
    cylindricalFaceRadiiMm: number[];
    estimatedHoleCount: number;
    holeRadiiMm: number[];
    bossShaftRadiiMm: number[];
    threadFeaturesDetected: boolean;
    planarFaceCount: number;
    freeFormFaceCount: number;
  };
  /** Exact per-feature rows: hole/boss × Ø × depth × through, axis-deduped counts. */
  featureTable?: Array<{
    kind: 'hole' | 'boss' | 'face' | 'pocket' | 'slot';
    diaMm: number;
    depthMm: number;
    through: boolean | null;
    count: number;
    areaMm2?: number;
  }>;
  sheetMetal?: { bendCount: number; totalBendLengthMm: number; thicknessMm: number };
  error?: string;
  toolingCostEstimates?: {
    hpdcDieCostGBP: number;
    gravityMouldCostGBP: number;
    sandPatternCostGBP: number;
    imMouldCostGBP: number;
    forgeDieCostGBP: number;
    progressiveDieCostGBP: number;
  };
  manufacturabilityScore?: number;
  processSpecificEstimates?: {
    sandCycleTimeHr: number;
    sandCycleTimeHrFerrous: number;
    forgeStrokes: number;
    investWaxCostGBP: number;
    investShellCostGBP: number;
  };
  assemblyWarning?: string | null;
  unitWarning?: string | null;
}

export async function analyzeGeometry(
  buffer: Buffer,
  filename: string,
  timeoutMs = DEFAULT_TESS_TIMEOUT_MS,
): Promise<OCCTGeometry> {
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

function _runPython(tmpPath: string, timeoutMs: number): Promise<OCCTGeometry> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (result: OCCTGeometry) => {
      if (!settled) { settled = true; resolve(result); }
    };

    const child = spawn('python3', [PYTHON_SCRIPT, tmpPath], {
      env: { ...process.env },
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
  triFace: number[];
  faces: TessellationFace[];
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
      const child = spawn('python3', args, { env: { ...process.env } });
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
