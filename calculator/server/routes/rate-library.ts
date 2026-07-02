/**
 * Rate-library admin API.
 *
 *   GET  /api/rate-library/active     effective library the calculators use (any signed-in user)
 *   GET  /api/rate-library/status     which source is active, is company data present, override count
 *   GET  /api/rate-library/template   download the blank/prefilled Excel template   (admin)
 *   GET  /api/rate-library/export     download the current active library as Excel  (admin)
 *   POST /api/rate-library/upload     upload a filled Excel workbook → company library (admin)
 *   PUT  /api/rate-library/source     switch active source: builtin | company        (admin)
 *   POST /api/rate-library/overrides  set one cell override                          (admin)
 *   DELETE /api/rate-library/overrides  remove one cell override (?table&id&field)   (admin)
 *   POST /api/rate-library/reset      remove company library + overrides (back to built-in) (admin)
 */
import { Router, type Response } from 'express';
import multer from 'multer';
import db from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth-middleware.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import { resolveActiveLibrary, type RateSource, type RateTable } from '../../src/engine/rate-library-merge.js';
import { buildRateLibraryWorkbook, parseRateLibraryWorkbook } from '../utils/rate-library-xlsx.js';
import { buildSWRateWorkbook, parseSWRateWorkbook } from '../utils/sw-rate-library-xlsx.js';
import { DEFAULT_SW_RATE_LIBRARY } from '../../src/engine/sw-rate-library.js';
import {
  getCompanyLibrary, setCompanyLibrary, clearCompanyLibrary,
  getRateSource, setRateSource, getOverrides, setOverride, deleteOverride, clearOverrides,
  getSWCompanyLibrary, setSWCompanyLibrary, clearSWCompanyLibrary, getSWRateSource, setSWRateSource,
} from '../data/rate-library-store.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname) &&
      /spreadsheetml\.sheet|octet-stream/i.test(file.mimetype);
    cb(ok ? null : new Error('Only .xlsx workbooks are accepted'));
  },
});

function resolve() {
  return resolveActiveLibrary({
    builtIn: DEFAULT_RATE_LIBRARY,
    company: getCompanyLibrary(db),
    overrides: getOverrides(db),
    source: getRateSource(db),
  });
}

// Any signed-in user (the calculators call this)
router.get('/active', (_req, res: Response) => {
  const { library, effectiveSource } = resolve();
  res.json({ library, source: effectiveSource });
});

router.get('/status', (req: AuthenticatedRequest, res: Response) => {
  const role = (db.prepare('SELECT role FROM users WHERE id = ?').get(req.user!.userId) as { role?: string } | undefined)?.role;
  res.json({
    source: getRateSource(db),
    hasCompany: getCompanyLibrary(db) != null,
    overrideCount: getOverrides(db).length,
    isAdmin: role === 'admin',
  });
});

// SW Should-Cost rates — the effective override the SW engine should apply
// (company partial library when active, else null → engine uses its defaults).
router.get('/sw/active', (_req, res: Response) => {
  const company = getSWCompanyLibrary(db);
  const active = getSWRateSource(db) === 'company' && company ? company : null;
  res.json({ rateLibrary: active, source: active ? 'company' : 'builtin' });
});

router.get('/sw/status', (req: AuthenticatedRequest, res: Response) => {
  const role = (db.prepare('SELECT role FROM users WHERE id = ?').get(req.user!.userId) as { role?: string } | undefined)?.role;
  res.json({ source: getSWRateSource(db), hasCompany: getSWCompanyLibrary(db) != null, isAdmin: role === 'admin' });
});

// ── Admin only below ──────────────────────────────────────────────────────────
router.use(requireAdmin);

router.get('/sw/template', (_req, res: Response) => {
  const buf = buildSWRateWorkbook(DEFAULT_SW_RATE_LIBRARY);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="CostVision-SW-Rate-Template.xlsx"');
  res.send(buf);
});

router.post('/sw/upload', upload.single('file'), (req: AuthenticatedRequest, res: Response): void => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { library, errors, counts } = parseSWRateWorkbook(req.file.buffer);
  if (!library) { res.status(400).json({ error: 'Validation failed', errors, counts }); return; }
  setSWCompanyLibrary(db, library, new Date().toISOString(), req.user!.email);
  setSWRateSource(db, 'company');
  res.json({ ok: true, counts, activated: true });
});

router.put('/sw/source', (req: AuthenticatedRequest, res: Response): void => {
  const source = req.body?.source as RateSource;
  if (source !== 'builtin' && source !== 'company') { res.status(400).json({ error: 'source must be builtin or company' }); return; }
  if (source === 'company' && getSWCompanyLibrary(db) == null) { res.status(400).json({ error: 'No company SW library uploaded yet' }); return; }
  setSWRateSource(db, source);
  res.json({ ok: true, source });
});

router.post('/sw/reset', (_req, res: Response): void => {
  clearSWCompanyLibrary(db);
  setSWRateSource(db, 'builtin');
  res.json({ ok: true, source: 'builtin' });
});

router.get('/template', (_req, res: Response) => {
  const buf = buildRateLibraryWorkbook(DEFAULT_RATE_LIBRARY);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="CostVision-Rate-Library-Template.xlsx"');
  res.send(buf);
});

router.get('/export', (_req, res: Response) => {
  const { library } = resolve();
  const buf = buildRateLibraryWorkbook(library);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="CostVision-Rate-Library.xlsx"');
  res.send(buf);
});

router.post('/upload', upload.single('file'), (req: AuthenticatedRequest, res: Response): void => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { library, errors, counts } = parseRateLibraryWorkbook(req.file.buffer);
  if (!library) { res.status(400).json({ error: 'Validation failed', errors, counts }); return; }
  library.lastModified = new Date().toISOString();
  setCompanyLibrary(db, library, library.lastModified, req.user!.email);
  setRateSource(db, 'company');   // uploading activates the company library
  res.json({ ok: true, counts, activated: true });
});

router.put('/source', (req: AuthenticatedRequest, res: Response): void => {
  const source = (req.body?.source as RateSource);
  if (source !== 'builtin' && source !== 'company') { res.status(400).json({ error: 'source must be builtin or company' }); return; }
  if (source === 'company' && getCompanyLibrary(db) == null) { res.status(400).json({ error: 'No company library uploaded yet' }); return; }
  setRateSource(db, source);
  res.json({ ok: true, source });
});

router.post('/overrides', (req: AuthenticatedRequest, res: Response): void => {
  const { table, id, field, value } = req.body as { table?: RateTable; id?: string; field?: string; value?: number };
  const tables: RateTable[] = ['materials', 'machines', 'labour', 'energy', 'fx', 'overheadDefaults'];
  if (!table || !tables.includes(table) || !id || !field) {
    res.status(400).json({ error: 'table, id and field are required' }); return;
  }
  if (!Number.isFinite(value) || (value as number) < 0) {
    res.status(400).json({ error: 'value must be a non-negative number' }); return;   // parity with upload validation
  }
  if (field.split('.').some(p => p === '__proto__' || p === 'prototype' || p === 'constructor')) {
    res.status(400).json({ error: 'invalid field path' }); return;                     // block prototype pollution
  }
  if ((field.split('.').pop() ?? '') === 'computedRatePerHr') {
    res.status(400).json({ error: 'computedRatePerHr is derived from the machine build-up — override the build-up fields instead' }); return;
  }
  setOverride(db, { table, id, field, value: value as number }, new Date().toISOString(), req.user!.email);
  res.json({ ok: true });
});

router.delete('/overrides', (req: AuthenticatedRequest, res: Response): void => {
  const { table, id, field } = req.query as { table?: string; id?: string; field?: string };
  if (!table || !id || !field) { res.status(400).json({ error: 'table, id and field query params required' }); return; }
  res.json({ ok: deleteOverride(db, table, id, field) });
});

router.post('/reset', (_req, res: Response): void => {
  clearCompanyLibrary(db);
  clearOverrides(db);
  setRateSource(db, 'builtin');
  res.json({ ok: true, source: 'builtin' });
});

export default router;
