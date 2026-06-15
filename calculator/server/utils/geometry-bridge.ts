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
  estimatedWallThicknessMm?: number | null;
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
