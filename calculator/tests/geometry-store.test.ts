/**
 * The server owns the measurement. /analyze stores the OCCT result under the
 * upload's SHA-256 and /reanalyze looks it up — it no longer accepts geometry
 * from the request body, which used to be treated as measured truth.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import db from '../server/db.js';

const dir = mkdtempSync(join(tmpdir(), 'cv-geo-test-'));
process.env.CV_GEOMETRY_FILE_DIR = dir;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let store: typeof import('../server/utils/geometry-store.js');

beforeAll(async () => { store = await import('../server/utils/geometry-store.js'); });
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  db.exec('DELETE FROM cad_geometry_by_hash');
});

describe('geometry store', () => {
  it('hashes the bytes, not the name', () => {
    const a = store.hashUpload(Buffer.from('ISO-10303-21; part A'));
    const b = store.hashUpload(Buffer.from('ISO-10303-21; part A'));
    const c = store.hashUpload(Buffer.from('ISO-10303-21; part B'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps the 1x and 25.4x measurements of the same file apart', () => {
    const h = store.hashUpload(Buffer.from('inch model'));
    store.putGeometry(h, { status: 'success', volume: { mm3: 4, cm3: 0.004 } }, 1);
    store.putGeometry(h, { status: 'success', volume: { mm3: 63938, cm3: 63.938 } }, 25.4);
    expect(store.getGeometry(h, 1)?.volume?.cm3).toBe(0.004);
    expect(store.getGeometry(h, 25.4)?.volume?.cm3).toBe(63.938);
    expect(store.getGeometry(h, 2)).toBeNull();
  });

  it('refuses a malformed hash rather than querying with it', () => {
    expect(store.getGeometry('../../etc/passwd')).toBeNull();
    expect(store.getUploadFile('not-a-hash')).toBeNull();
  });

  it('round-trips the upload bytes under the hash with a safe extension', () => {
    const bytes = Buffer.from('ISO-10303-21;\nHEADER;');
    const h = store.hashUpload(bytes);
    store.putUploadFile(h, bytes, 'Bracket (rev B).STEP');
    const back = store.getUploadFile(h);
    expect(back?.ext).toBe('step');
    expect(back?.buffer.equals(bytes)).toBe(true);
    expect(readdirSync(dir)).toContain(`${h}.step`);
  });

  it('sweeps files older than the TTL', () => {
    const bytes = Buffer.from('old upload');
    const h = store.hashUpload(bytes);
    store.putUploadFile(h, bytes, 'old.stp');
    const p = join(dir, `${h}.stp`);
    const old = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    utimesSync(p, old, old);
    expect(store.sweepUploadFiles()).toBeGreaterThanOrEqual(1);
    expect(store.getUploadFile(h)).toBeNull();
    writeFileSync(p, bytes); // recreate → fresh mtime → readable again
    expect(store.getUploadFile(h)?.buffer.equals(bytes)).toBe(true);
  });
});

describe('mesh cache', () => {
  it('stores a tessellation under the hash + scale and serves it back, sidecar included', async () => {
    const bytes = Buffer.from('ISO-10303-21; mesh me');
    const h = store.hashUpload(bytes);
    const stl = Buffer.alloc(84 + 50, 7);
    store.putMesh(h, 1, { stl, triangles: 1, meta: { triFace: [3], faces: [null], bodies: 1, skippedFaces: 0 } });
    const hit = store.getMesh(h, 1, true);
    expect(hit?.triangles).toBe(1);
    expect(hit?.stl.equals(stl)).toBe(true);
    expect((hit?.meta as { bodies: number }).bodies).toBe(1);
    expect(store.getMesh(h, 25.4, true)).toBeNull();          // a different scale is a different mesh
  });

  it('a mesh cached without a sidecar is not a hit for a caller that needs one', () => {
    const bytes = Buffer.from('no sidecar');
    const h = store.hashUpload(bytes);
    store.putMesh(h, 1, { stl: Buffer.alloc(134), triangles: 1, meta: null });
    expect(store.getMesh(h, 1, false)?.triangles).toBe(1);
    expect(store.getMesh(h, 1, true)).toBeNull();
  });
});
