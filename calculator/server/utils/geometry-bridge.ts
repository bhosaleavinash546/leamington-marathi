import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = join(__dirname, 'cad-geometry-engine.py');

export interface OCCTGeometry {
  status: 'success' | 'error';
  partName?: string;
  boundingBox?: { xMm: number; yMm: number; zMm: number };
  volume?: { mm3: number; cm3: number };
  surfaceArea?: { mm2: number; cm2: number };
  fillRatio?: number;
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
  timeoutMs = 120_000,
): Promise<OCCTGeometry> {
  const ext = (filename.toLowerCase().split('.').pop() ?? 'step');
  const tmpPath = join(tmpdir(), `cv-cad-${randomBytes(8).toString('hex')}.${ext}`);

  try {
    await writeFile(tmpPath, buffer);
    return await _runPython(tmpPath, timeoutMs);
  } finally {
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

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

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
export interface TessellationMeta {
  triFace: number[];
  faces: Array<{ id: number; type: string; radiusMm: number | null; areaCm2: number | null }>;
  bodies: number;
}

export async function tessellateToSTL(
  buffer: Buffer,
  filename: string,
  timeoutMs = 120_000,
): Promise<{ status: 'success'; stl: Buffer; triangles: number; meta: TessellationMeta | null } | { status: 'error'; error: string }> {
  const ext = (filename.toLowerCase().split('.').pop() ?? 'step');
  const id = randomBytes(8).toString('hex');
  const inPath = join(tmpdir(), `cv-tess-${id}.${ext}`);
  const outPath = join(tmpdir(), `cv-tess-${id}.stl`);

  try {
    await writeFile(inPath, buffer);
    const result = await new Promise<{ status: string; triangles?: number; error?: string }>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const settle = (r: { status: string; triangles?: number; error?: string }) => { if (!settled) { settled = true; resolve(r); } };
      const child = spawn('python3', [PYTHON_SCRIPT, '--stl', inPath, outPath], { env: { ...process.env } });
      const timer = setTimeout(() => { child.kill('SIGKILL'); settle({ status: 'error', error: `Tessellation timed out after ${timeoutMs / 1000}s` }); }, timeoutMs);
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', (err) => { clearTimeout(timer); settle({ status: 'error', error: `Python process error: ${err.message}` }); });
      child.on('close', () => {
        clearTimeout(timer);
        if (settled) return;
        try { settle(JSON.parse(stdout.trim())); }
        catch { settle({ status: 'error', error: `Tessellation output unparseable. stderr: ${stderr.slice(0, 300)}` }); }
      });
    });

    if (result.status !== 'success') return { status: 'error', error: result.error ?? 'tessellation failed' };
    const { readFile } = await import('fs/promises');
    const stl = await readFile(outPath);
    // face-metadata sidecar (per-triangle face ids + exact B-rep face data) — optional
    let meta: TessellationMeta | null = null;
    try {
      meta = JSON.parse(await readFile(outPath + '.json', 'utf-8')) as TessellationMeta;
    } catch { /* older engine or sidecar write failed — viewer degrades to mesh-only */ }
    return { status: 'success', stl, triangles: result.triangles ?? 0, meta };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
    unlink(outPath + '.json').catch(() => {});
  }
}
