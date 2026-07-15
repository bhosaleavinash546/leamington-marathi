// ─────────────────────────────────────────────────────────────────────────────
// CAD viewer routes: tessellate STEP/IGES → mesh for the interactive 3D viewer,
// and analyze → OCCTGeometry JSON. Same registration pattern as
// routes/should-cost.mjs. The heavy lifting is the OCCT Python engine, reached
// through cad-engine/cad-geometry-bridge.mjs (spawn + semaphore + timeout).
//
//   POST /api/cad/tessellate  ?meta=bin → single binary frame the viewer decodes:
//       [u32 LE headerLen][header JSON][raw STL bytes][triFace u32 array]
//     ?meta=1 → { stlBase64, triangles, meta } (compat); no query → raw STL.
//   POST /api/cad/analyze     → OCCTGeometry JSON (bbox, volume, wall thickness,
//     features, CNC estimate, …).
// ─────────────────────────────────────────────────────────────────────────────
import multer from 'multer';
import { tessellateToSTL, analyzeGeometry } from '../cad-engine/cad-geometry-bridge.mjs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const PROPRIETARY = ['x_t', 'x_b', 'xmt_txt', 'jt', 'prt', 'sldprt', 'catpart'];
const BREP_FORMATS = ['stp', 'step', 'igs', 'iges'];
const extOf = (name) => (name || '').toLowerCase().split('.').pop() ?? '';
const safeLogName = (name) => (name || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120);

export function registerCadRoutes(app, { requireAuth, rateLimit }) {
  // Each call forks a Python OCP process — rate-limit it (60 / 10 min).
  const limit = rateLimit(Number(process.env.CV_TESSELLATE_RATE_MAX ?? 60), 10 * 60 * 1000);

  app.post('/api/cad/tessellate', requireAuth, limit, upload.single('cadFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = extOf(req.file.originalname);

    if (PROPRIETARY.includes(ext)) {
      return res.status(422).json({
        error: `.${ext} is a proprietary format that needs a licensed kernel (Parasolid/JT/native CAD). ` +
               'Export the part as STEP (.step/.stp) — every major CAD tool supports it — and upload that instead.',
      });
    }
    if (!BREP_FORMATS.includes(ext)) {
      return res.status(400).json({ error: 'tessellate accepts STEP/IGES only (STL is already a mesh)' });
    }

    const wantMeta = req.query.meta === '1' || req.query.meta === 'bin';
    const result = await tessellateToSTL(req.file.buffer, req.file.originalname, { withMeta: wantMeta });
    if (result.status !== 'success') return res.status(422).json({ error: result.error });
    // eslint-disable-next-line no-console
    console.log(`[CAD] Tessellated ${safeLogName(req.file.originalname)}: ${result.triangles} triangles, ${(result.stl.length / 1024).toFixed(0)} KB STL`);

    // ?meta=bin → single binary frame (interactive viewer):
    //   [u32 LE headerLen][header JSON][raw STL bytes][triFace as u32 array]
    if (req.query.meta === 'bin') {
      const triFace = result.meta?.triFace ?? [];
      const header = Buffer.from(JSON.stringify({
        triangles: result.triangles,
        stlBytes: result.stl.length,
        triFaceCount: triFace.length,
        faces: result.meta?.faces ?? [],
        bodies: result.meta?.bodies ?? null,
        skippedFaces: result.meta?.skippedFaces ?? 0,
      }), 'utf-8');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32LE(header.length, 0);
      const triBuf = Buffer.from(Uint32Array.from(triFace).buffer);
      res.set('Content-Type', 'application/octet-stream');
      return res.send(Buffer.concat([lenBuf, header, result.stl, triBuf]));
    }
    // ?meta=1 → JSON with base64 mesh + metadata (compat fallback).
    if (req.query.meta === '1') {
      return res.json({ stlBase64: result.stl.toString('base64'), triangles: result.triangles, meta: result.meta });
    }
    // No query → raw binary STL.
    res.set('Content-Type', 'application/octet-stream');
    res.set('X-Triangle-Count', String(result.triangles));
    return res.send(result.stl);
  });

  app.post('/api/cad/analyze', requireAuth, limit, upload.single('cadFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = extOf(req.file.originalname);
    if (PROPRIETARY.includes(ext)) {
      return res.status(422).json({ error: `.${ext} is a proprietary format that needs a licensed kernel. Export the part as STEP (.step/.stp) and upload that instead.` });
    }
    if (!BREP_FORMATS.includes(ext)) {
      return res.status(400).json({ error: 'analyze accepts STEP/IGES only' });
    }
    const geometry = await analyzeGeometry(req.file.buffer, req.file.originalname);
    if (geometry.status !== 'success') return res.status(422).json({ error: geometry.error ?? 'geometry analysis failed' });
    return res.json(geometry);
  });
}
