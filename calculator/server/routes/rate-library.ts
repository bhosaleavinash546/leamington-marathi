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
 *   GET  /api/rate-library/audit      who uploaded / switched / overrode / reset, fingerprints before → after (admin)
 *
 * Precedence, row by row (rates flow review R1, Nov 2026): cell override > company row > built-in. The company book is
 * merged by id over the built-in (R2: a row applies only to the country it names — Materials / Machines / Overhead /
 * Services carry a country, Labour / Energy name it in the id; every other country keeps its own published book, rebuilt
 * from the BUILT-IN UK basis); an upload stores only the rows that differ from the built-in (and new ids), and it
 * CLEARS every cell override — its reply lists the ones it removed, so an earlier override can never silently beat a
 * newly uploaded value.
 */
import type { RateLibrary } from '../../src/engine/types.js';
import { Router, type Response } from 'express';
import multer from 'multer';
import db from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth-middleware.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
import {
  resolveActiveLibrary, companyRowReport, describeActiveBook, rateValueError, NUMERIC_FIELDS, RATE_TABLES,
  type RateSource, type RateTable,
} from '../../src/engine/rate-library-merge.js';
import { fingerprintRateLibrary } from '../utils/rate-library-fingerprint.js';
import { buildRateLibraryWorkbook, parseRateLibraryWorkbook, countryBookOf } from '../utils/rate-library-xlsx.js';
import { buildSWRateWorkbook, parseSWRateWorkbook } from '../utils/sw-rate-library-xlsx.js';
import { DEFAULT_SW_RATE_LIBRARY, resolveRateLibrary as resolveSWRateLibrary } from '../../src/engine/sw-rate-library.js';
import {
  getCompanyLibrary, setCompanyLibrary, clearCompanyLibrary,
  getRateSource, setRateSource, getOverrides, setOverride, deleteOverride, clearOverrides,
  recordRateLibraryVersion, listRateLibraryVersions, getRateLibraryVersion,
  recordRateAudit, listRateAudit, getOverridesDetailed,
  getSWCompanyLibrary, setSWCompanyLibrary, clearSWCompanyLibrary, getSWRateSource, setSWRateSource,
  getPCBCountryOverrides, setPCBCountryOverrides, clearPCBCountryOverrides,
} from '../data/rate-library-store.js';
import {
  PCB_COUNTRY_RATES, applyPCBCountryRateOverrides, getActivePCBCountryOverrides,
} from '../data/pcb-country-rates.js';

// Apply persisted PCB country overrides at startup so restarts keep the
// admin's edited rates (audit fix: country DB was hardcoded constants).
{
  const persisted = getPCBCountryOverrides(db);
  if (Object.keys(persisted).length > 0) {
    const r = applyPCBCountryRateOverrides(persisted);
    console.log(`[rate-library] PCB country overrides restored: ${r.appliedPaths.length} applied, ${r.rejectedPaths.length} rejected`);
  }
}

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.xlsx$/i.test(file.originalname) &&
      /spreadsheetml\.sheet|octet-stream/i.test(file.mimetype);
    // multer requires an explicit acceptFile=true — cb(null) silently drops the file
    if (ok) cb(null, true);
    else cb(new Error('Only .xlsx workbooks are accepted'));
  },
});

/** The deployment's active rate book (company rates when loaded, else built-in), for other routes. */
export function resolveActiveRateBook(): RateLibrary {
  return resolve().library;
}

function resolve() {
  return resolveActiveLibrary({
    builtIn: DEFAULT_RATE_LIBRARY,
    company: getCompanyLibrary(db),
    overrides: getOverrides(db),
    source: getRateSource(db),
  });
}

/**
 * The resolved book's identity: the fingerprint of the book every server costing resolves (built-in + company rows +
 * cell overrides, UK basis — a country book is rebuilt from it). `/versions/:id` returns the book behind it; the screen
 * stamp, the CAD response and every cache key carry it.
 */
export function activeRateBookFingerprint(): string {
  return fingerprintRateLibrary(resolve().library);
}

/** The active book with its fingerprint, its label and what the company rows do to the built-in. */
function bookState() {
  const { library, effectiveSource } = resolve();
  const company = getCompanyLibrary(db);
  const overrideCount = getOverrides(db).length;
  const report = effectiveSource === 'company' ? companyRowReport(DEFAULT_RATE_LIBRARY, company, countryBookOf(DEFAULT_RATE_LIBRARY)) : null;
  return {
    library, effectiveSource, overrideCount, report,
    fingerprint: fingerprintRateLibrary(library),
    label: describeActiveBook({ source: effectiveSource, report, overrideCount }),
  };
}

/** One audit row around a mutation: the fingerprint before is read by the caller BEFORE it changes anything. */
function audit(by: string, action: string, detail: string, before: string, rows: Record<string, unknown> = {}): void {
  const after = bookState();
  recordRateAudit(db, {
    at: new Date().toISOString(), by, action, detail, fingerprintBefore: before, fingerprintAfter: after.fingerprint,
    rows: { ...rows, overridesInForce: after.overrideCount, source: after.effectiveSource,
      ...(after.report ? { changed: after.report.changed.length, added: after.report.added.length } : {}) },
  });
}

const reportJson = (r: ReturnType<typeof companyRowReport> | null) => r && ({
  changed: r.changed, added: r.added, sameAsBuiltIn: r.sameAsBuiltIn, leftBuiltIn: r.leftBuiltIn,
});

/**
 * Keep whatever the active book has just become.
 *
 * Called after every mutation — upload, source switch, a single cell override,
 * reset — because all of them change the numbers a costing would produce.
 * Versioning only uploads would leave an override silently unreproducible, and
 * an override is exactly the kind of quiet change that needs a record.
 *
 * Stored under 'active' rather than 'company': what has to be recoverable is
 * the RESOLVED book that was costed on, overrides included, which is what a run
 * fingerprints. Identical content collapses onto the existing row, so switching
 * back and forth does not churn the history.
 */
function snapshotActive(by: string, note: string): void {
  recordRateLibraryVersion(db, 'active', resolve().library, new Date().toISOString(), by, note);
}

/** The rate books this deployment has costed on, newest first. */
router.get('/versions', (_req, res: Response) => {
  res.json({ versions: listRateLibraryVersions(db, 'active'),
             current: fingerprintRateLibrary(resolve().library) });
});

/** One historical book by fingerprint — how a past costing is reproduced. */
router.get('/versions/:id', (req, res: Response) => {
  const library = getRateLibraryVersion(db, req.params.id);
  if (!library) { res.status(404).json({ error: 'No rate book with that fingerprint' }); return; }
  res.json({ library, id: req.params.id });
});

/**
 * Keep every SW rate book the software costing has run on (P3 #18 — SW uploads were overwritten in place). Stored
 * under 'sw-active' as the RESOLVED book (company over built-in), like the main library; identical content collapses.
 */
const SW_VERSIONS_ID = 'sw-active';
function snapshotSWActive(by: string, note: string): void {
  const company = getSWCompanyLibrary(db);
  const active = getSWRateSource(db) === 'company' && company ? company : undefined;
  recordRateLibraryVersion(db, SW_VERSIONS_ID, resolveSWRateLibrary(active) as unknown as RateLibrary, new Date().toISOString(), by, note);
}

router.get('/sw/versions', (_req, res: Response) => {
  res.json({ versions: listRateLibraryVersions(db, SW_VERSIONS_ID) });
});

router.get('/sw/versions/:id', (req, res: Response) => {
  const library = getRateLibraryVersion(db, req.params.id);
  if (!library) { res.status(404).json({ error: 'No SW rate book with that fingerprint' }); return; }
  res.json({ library, id: req.params.id });
});

// Any signed-in user (the calculators call this)
router.get('/active', (_req, res: Response) => {
  const b = bookState();
  res.json({ library: b.library, source: b.effectiveSource, fingerprint: b.fingerprint, label: b.label, overrideCount: b.overrideCount });
});

/**
 * Which book is active, by fingerprint — cheap enough for an open tab to ask on focus and re-fetch /active only when
 * it moved (a source switch, reset or override by an admin elsewhere). An admin also gets what the company rows change,
 * add and leave built-in, and the overrides in force.
 */
router.get('/status', (req: AuthenticatedRequest, res: Response) => {
  const role = (db.prepare('SELECT role FROM users WHERE id = ?').get(req.user!.userId) as { role?: string } | undefined)?.role;
  const b = bookState();
  const isAdmin = role === 'admin';
  res.json({
    source: getRateSource(db),
    hasCompany: getCompanyLibrary(db) != null,
    overrideCount: b.overrideCount,
    fingerprint: b.fingerprint,
    label: b.label,
    isAdmin,
    ...(isAdmin ? {
      companyRows: reportJson(companyRowReport(DEFAULT_RATE_LIBRARY, getCompanyLibrary(db), countryBookOf(DEFAULT_RATE_LIBRARY))),
      overrides: getOverridesDetailed(db),
    } : {}),
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
  snapshotSWActive(req.user!.email, `uploaded ${req.file.originalname ?? 'workbook'}`);
  res.json({ ok: true, counts, activated: true });
});

router.put('/sw/source', (req: AuthenticatedRequest, res: Response): void => {
  const source = req.body?.source as RateSource;
  if (source !== 'builtin' && source !== 'company') { res.status(400).json({ error: 'source must be builtin or company' }); return; }
  if (source === 'company' && getSWCompanyLibrary(db) == null) { res.status(400).json({ error: 'No company SW library uploaded yet' }); return; }
  setSWRateSource(db, source);
  snapshotSWActive(req.user!.email, `switched to ${source} SW rates`);
  res.json({ ok: true, source });
});

router.post('/sw/reset', (req: AuthenticatedRequest, res: Response): void => {
  clearSWCompanyLibrary(db);
  setSWRateSource(db, 'builtin');
  snapshotSWActive(req.user!.email, 'reset to built-in SW rates');
  res.json({ ok: true, source: 'builtin' });
});

router.get('/template', (_req, res: Response) => {
  // Base (UK) rows only, with the Instructions sheet first — country rows are not pre-filled (R1).
  const buf = buildRateLibraryWorkbook(DEFAULT_RATE_LIBRARY, { template: true });
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
  const { delta, report, errors, warnings, counts } = parseRateLibraryWorkbook(req.file.buffer, DEFAULT_RATE_LIBRARY);
  if (!delta || !report) { res.status(400).json({ error: 'Validation failed', errors, warnings, counts }); return; }
  const before = activeRateBookFingerprint();
  delta.lastModified = new Date().toISOString();
  // An upload CLEARS every cell override (decision, R1): the sheet is the company's new statement of its rates, and an
  // override set earlier silently beat the uploaded value of its cell. The reply lists what was cleared.
  const overridesCleared = getOverridesDetailed(db);
  clearOverrides(db);
  setCompanyLibrary(db, delta, delta.lastModified, req.user!.email);
  setRateSource(db, 'company');   // uploading activates the company library
  snapshotActive(req.user!.email, 'rate sheet uploaded');
  audit(req.user!.email, 'upload', `uploaded ${req.file.originalname ?? 'workbook'}`, before, {
    changed: report.changed.length, added: report.added.length, leftBuiltIn: report.leftBuiltIn,
    overridesCleared: overridesCleared.length,
  });
  const b = bookState();
  res.json({
    ok: true, counts, activated: true, version: b.fingerprint, fingerprint: b.fingerprint, label: b.label,
    ...reportJson(report),
    // A likely typo'd id, template rows left out (they stay built-in) — accepted, but said.
    warnings,
    overridesCleared,
    overridesStillApplied: getOverrides(db),
  });
});

router.put('/source', (req: AuthenticatedRequest, res: Response): void => {
  const source = (req.body?.source as RateSource);
  if (source !== 'builtin' && source !== 'company') { res.status(400).json({ error: 'source must be builtin or company' }); return; }
  if (source === 'company' && getCompanyLibrary(db) == null) { res.status(400).json({ error: 'No company library uploaded yet' }); return; }
  const before = activeRateBookFingerprint();
  setRateSource(db, source);
  snapshotActive(req.user!.email, `switched to ${source} rates`);
  audit(req.user!.email, 'source', `switched to ${source} rates`, before);
  const b = bookState();
  res.json({ ok: true, source, fingerprint: b.fingerprint, label: b.label });
});

/** The admin trail: every upload, switch, override and reset, newest first. */
router.get('/audit', (req, res: Response) => {
  const limit = Number(req.query.limit) || 500;
  res.json({ entries: listRateAudit(db, limit), current: activeRateBookFingerprint() });
});

router.post('/overrides', (req: AuthenticatedRequest, res: Response): void => {
  const { table, id, field, value } = req.body as { table?: RateTable; id?: string; field?: string; value?: number };
  if (!table || !(RATE_TABLES as readonly string[]).includes(table) || !id || !field) {
    res.status(400).json({ error: 'table, id and field are required' }); return;
  }
  if (field.split('.').some(p => p === '__proto__' || p === 'prototype' || p === 'constructor')) {
    res.status(400).json({ error: 'invalid field path' }); return;                     // block prototype pollution
  }
  if ((field.split('.').pop() ?? '') === 'computedRatePerHr') {
    res.status(400).json({ error: 'computedRatePerHr is derived from the machine build-up — override the build-up fields instead' }); return;
  }
  // The row must exist in the book the override lands on, and the field must be one of its numbers — an unknown row
  // was accepted with ok: true and never applied, a misspelt field created a dead property.
  if (!NUMERIC_FIELDS[table].includes(field)) {
    res.status(400).json({ error: `'${field}' is not a rate field of ${table} — one of: ${NUMERIC_FIELDS[table].join(', ')}` }); return;
  }
  const rows = resolve().library[table] as Array<{ id: string }>;
  if (!rows.some(r => r.id === id)) { res.status(400).json({ error: `No ${table} row '${id}' in the active book` }); return; }
  const err = rateValueError(field, Number(value));
  if (typeof value !== 'number' || err) {
    res.status(400).json({ error: `value ${value} ${err ?? 'is not a number'}` }); return;   // the parser's rule (rateValueError)
  }
  const before = activeRateBookFingerprint();
  setOverride(db, { table, id, field, value }, new Date().toISOString(), req.user!.email);
  snapshotActive(req.user!.email, `override ${table}.${id}.${field} = ${value}`);
  audit(req.user!.email, 'override-set', `${table}.${id}.${field} = ${value}`, before);
  res.json({ ok: true, fingerprint: activeRateBookFingerprint() });
});

router.delete('/overrides', (req: AuthenticatedRequest, res: Response): void => {
  const { table, id, field } = req.query as { table?: string; id?: string; field?: string };
  if (!table || !id || !field) { res.status(400).json({ error: 'table, id and field query params required' }); return; }
  const before = activeRateBookFingerprint();
  const removed = deleteOverride(db, table, id, field);
  if (removed) {
    snapshotActive(req.user!.email, `override cleared: ${table}.${id}.${field}`);
    audit(req.user!.email, 'override-clear', `${table}.${id}.${field}`, before);
  }
  res.json({ ok: removed, fingerprint: activeRateBookFingerprint() });
});

// ── PCB country rates (admin-editable; audit fix) ────────────────────────────
router.get('/pcb-countries', (_req, res: Response) => {
  res.json({ countries: PCB_COUNTRY_RATES, overrides: getActivePCBCountryOverrides() });
});

router.put('/pcb-countries/overrides', (req: AuthenticatedRequest, res: Response): void => {
  const overrides = (req.body?.overrides ?? {}) as Record<string, unknown>;
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    res.status(400).json({ error: 'overrides must be an object keyed by country id' });
    return;
  }
  const result = applyPCBCountryRateOverrides(overrides);
  if (result.appliedPaths.length === 0 && result.rejectedPaths.length > 0) {
    // nothing valid — restore whatever was persisted before and reject
    applyPCBCountryRateOverrides(getPCBCountryOverrides(db));
    res.status(400).json({ error: 'No valid numeric override paths', rejectedPaths: result.rejectedPaths });
    return;
  }
  setPCBCountryOverrides(db, overrides);
  const fp = activeRateBookFingerprint();
  recordRateAudit(db, { at: new Date().toISOString(), by: req.user!.email, action: 'pcb-overrides',
    detail: `PCB country overrides: ${result.appliedPaths.join(', ')}`, fingerprintBefore: fp, fingerprintAfter: fp,
    rows: { applied: result.appliedPaths.length, rejected: result.rejectedPaths.length } });
  res.json({ ok: true, appliedPaths: result.appliedPaths, rejectedPaths: result.rejectedPaths });
});

router.delete('/pcb-countries/overrides', (req: AuthenticatedRequest, res: Response): void => {
  clearPCBCountryOverrides(db);
  applyPCBCountryRateOverrides({});
  const fp = activeRateBookFingerprint();
  recordRateAudit(db, { at: new Date().toISOString(), by: req.user!.email, action: 'pcb-overrides-clear',
    detail: 'PCB country overrides cleared', fingerprintBefore: fp, fingerprintAfter: fp, rows: {} });
  res.json({ ok: true });
});

router.post('/reset', (req: AuthenticatedRequest, res: Response): void => {
  const before = activeRateBookFingerprint();
  const overridesCleared = getOverrides(db).length;
  const hadCompany = getCompanyLibrary(db) != null;
  clearCompanyLibrary(db);
  clearOverrides(db);
  setRateSource(db, 'builtin');
  snapshotActive(req.user?.email ?? 'system', 'reset to built-in');
  audit(req.user?.email ?? 'system', 'reset', 'reset to built-in', before, { overridesCleared, companyCleared: hadCompany });
  res.json({ ok: true, source: 'builtin', fingerprint: activeRateBookFingerprint() });
});

export default router;
