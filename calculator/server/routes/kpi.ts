/**
 * /api/kpi — the Global Cost Engineering KPI Dashboard (read-only reporting layer + the
 * record registry it reads). Mounted behind requireAuth.
 *
 * Visibility (decided 11 Nov 2026): every signed-in user sees every ELIGIBLE record,
 * read-only. Excluded records (deleted / test / invalid), the audit log, the FX table
 * upload, FX recalculation and the import are admin-only. A record is edited only by its
 * owner (classification, current cost, notes, draft / completed) or an admin (also
 * reviewed / approved, validated volume, saving status, test flag).
 *
 * All aggregation is server-side (`buildFromClassified`); responses are cached per filter
 * state and dropped on every write.
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import db from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth-middleware.js';
import {
  ensureKpiTables, listRecords, getRecordRow, insertRecord, updateRecord, softDelete, findImported, fxContext,
  getFxPolicy, setFxPolicy, listFxRates, upsertFxRates, builtInFxReference, recalculateFx, audit, type RecordInput, type FxPolicy,
} from '../data/kpi-store.js';
import { readSheet, parseFxRows, parseImportRows, importTemplateCsv, IMPORT_COLUMNS, FX_TEMPLATE_COLUMNS } from '../utils/kpi-import.js';
import {
  classifyRecords, buildFromClassified, parseFilters, parseRecordQuery, selectRecords, pageOf, drillGroups, recordsCsv,
  isIsoCurrency, iso4217Codes, currencySymbol, STANDARD_PROGRAMMES, STANDARD_POWERTRAINS, RECORD_STATUSES, FX_METHOD_LABEL,
  INSIGHT_THRESHOLDS, type ClassifiedRecord, type DashboardFilters, type RecordStatus,
} from '../../src/engine/kpi-dashboard.js';
import { COMMODITY_REPORT_LABELS } from '../../src/ui/data/commodity-meta.js';

ensureKpiTables(db);

const router = Router();

// ─── Cache ────────────────────────────────────────────────────────────────────

let version = 0;
let classified: { v: number; at: number; all: ClassifiedRecord[] } | null = null;
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 5 * 60_000;      // names / the date roll over even with no write
const CACHE_MAX = 100;

export function invalidateKpiCache(): void { version++; classified = null; cache.clear(); }

function loadClassified(): ClassifiedRecord[] {
  const now = Date.now();
  if (!classified || classified.v !== version || now - classified.at > TTL_MS) {
    classified = { v: version, at: now, all: classifyRecords(listRecords(db)) };
  }
  return classified.all;
}
function cached<T>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.body as T;
  const body = make();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), body });
  return body;
}

const today = () => new Date().toISOString().slice(0, 10);
const isAdmin = (req: AuthenticatedRequest): boolean =>
  (db.prepare('SELECT role FROM users WHERE id = ?').get(req.user!.userId) as { role?: string } | undefined)?.role === 'admin';

function adminOnly(req: AuthenticatedRequest, res: Response): boolean {
  if (isAdmin(req)) return true;
  res.status(403).json({ error: 'Admin access required' });
  return false;
}

/** Filters arrive as one JSON query parameter `f` (values may contain commas). */
function filtersOf(req: AuthenticatedRequest): DashboardFilters {
  const raw = typeof req.query.f === 'string' ? req.query.f : '';
  if (!raw) return parseFilters({});
  if (raw.length > 20_000) return parseFilters({});
  try { return parseFilters(JSON.parse(raw)); } catch { return parseFilters({}); }
}

function log(err: unknown, where: string): void {
  console.error(`[kpi] ${where}:`, err instanceof Error ? err.message : err);
}

function buildOpts() {
  const policy = getFxPolicy(db);
  const approvedRates = (db.prepare('SELECT COUNT(*) AS n FROM fx_rates').get() as { n: number }).n;
  return { today: today(), nowIso: new Date().toISOString(), fxPolicy: policy, approvedRates, referenceLabel: builtInFxReference().source };
}

/** What a non-admin may see of a record list: never excluded records. */
function publicRow(r: ClassifiedRecord) {
  return {
    id: r.id, sourceTool: r.sourceTool, sourceRef: r.sourceRef, ownerId: r.ownerId, ownerName: r.ownerName,
    partNumber: r.partNumber, componentName: r.componentName, commodity: r.commodity, programme: r.programme,
    modelYear: r.modelYear, powertrain: r.powertrain, country: r.country, status: r.status, costingDate: r.costingDate,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    shouldCost: r.shouldCost, shouldCcy: r.shouldCcy, shouldTerms: r.shouldTerms,
    currentCost: r.currentCost, currentCcy: r.currentCcy, currentTerms: r.currentTerms, currentSource: r.currentSource,
    annualVolume: r.annualVolume, volumeValidated: r.volumeValidated, savingStatus: r.savingStatus, savingPerPiece: r.savingPerPiece, savingCcy: r.savingCcy,
    fx: r.fx, gbpShould: r.gbpShould, gbpCurrent: r.gbpCurrent, gbpSaving: r.gbpSaving, gapGbp: r.gapGbp, gapPct: r.gapPct,
    role: r.role, eligible: r.eligible, ineligible: r.ineligible, excluded: r.excluded, invalidReasons: r.invalidReasons,
    duplicateOf: r.duplicateOf, isTest: r.isTest, deleted: r.deleted, notes: r.notes,
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

router.get('/meta', (req: AuthenticatedRequest, res: Response) => {
  const admin = isAdmin(req);
  res.json({
    isAdmin: admin,
    userId: req.user!.userId,
    programmes: STANDARD_PROGRAMMES,
    powertrains: STANDARD_POWERTRAINS,
    statuses: RECORD_STATUSES,
    fxPolicy: getFxPolicy(db),
    fxPolicyLabels: FX_METHOD_LABEL,
    currencies: [...iso4217Codes()].sort().map(c => ({ code: c, symbol: currencySymbol(c) })),
    thresholds: INSIGHT_THRESHOLDS,
    importColumns: IMPORT_COLUMNS,
  });
});

router.get('/summary', (req: AuthenticatedRequest, res: Response) => {
  try {
    const f = filtersOf(req);
    const o = buildOpts();
    const body = cached(`s|${version}|${o.today}|${o.fxPolicy}|${JSON.stringify(f)}`, () => buildFromClassified(loadClassified(), f, o));
    res.json({ ...body, refreshedAt: new Date().toISOString(), version });
  } catch (e) { log(e, 'summary'); res.status(500).json({ error: 'The dashboard could not be built. The error is in the server log.' }); }
});

router.get('/records', (req: AuthenticatedRequest, res: Response) => {
  try {
    const f = filtersOf(req);
    const q = parseRecordQuery(req.query as Record<string, unknown>);
    if (q.scope === 'excluded' && !adminOnly(req, res)) return;
    const rows = selectRecords(loadClassified(), f, q, today());
    // all=1: every matching row in one response, for the Excel / PDF exports (capped).
    const p = req.query.all === '1' ? pageOf(rows.slice(0, 100_000), 1, Math.max(1, Math.min(rows.length, 100_000))) : pageOf(rows, q.page, q.pageSize);
    res.json({ ...p, rows: p.rows.map(publicRow), query: q });
  } catch (e) { log(e, 'records'); res.status(500).json({ error: 'Records could not be listed.' }); }
});

router.get('/records.csv', (req: AuthenticatedRequest, res: Response) => {
  try {
    const f = filtersOf(req);
    const q = parseRecordQuery(req.query as Record<string, unknown>);
    if (q.scope === 'excluded' && !adminOnly(req, res)) return;
    const rows = selectRecords(loadClassified(), f, q, today());
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="costvision-kpi-records-${today()}.csv"`);
    res.send(recordsCsv(rows));
  } catch (e) { log(e, 'csv'); res.status(500).json({ error: 'The CSV could not be built.' }); }
});

router.get('/drill', (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = parseRecordQuery(req.query as Record<string, unknown>);
    res.json(drillGroups(loadClassified(), filtersOf(req), q.drill, today()));
  } catch (e) { log(e, 'drill'); res.status(500).json({ error: 'The drill-down could not be built.' }); }
});

router.get('/records/:id', (req: AuthenticatedRequest, res: Response) => {
  const c = loadClassified().find(r => r.id === req.params.id);
  if (!c) { res.status(404).json({ error: 'Record not found' }); return; }
  const admin = isAdmin(req);
  if (c.excluded && !admin && c.ownerId !== req.user!.userId) { res.status(404).json({ error: 'Record not found' }); return; }
  const row = getRecordRow(db, c.id);
  let costing: unknown = null;
  if (c.sourceTool === 'CostVision' && c.sourceRef) {
    const s = db.prepare('SELECT data FROM scenarios WHERE id = ?').get(c.sourceRef) as { data: string } | undefined;
    if (s) { try { costing = JSON.parse(s.data); } catch { costing = null; } }
  }
  const revisions = loadClassified()
    .filter(r => r.applicationKey === c.applicationKey && r.id !== c.id && (!r.excluded || admin))
    .map(r => ({ id: r.id, costingDate: r.costingDate, status: r.status, role: r.role, ownerName: r.ownerName, gbpShould: r.gbpShould, gbpCurrent: r.gbpCurrent }));
  res.json({
    record: publicRow(c), fxHistory: admin || c.ownerId === req.user!.userId ? row?.fxHistory ?? [] : undefined,
    costing, revisions, canEdit: admin || c.ownerId === req.user!.userId, isAdmin: admin,
  });
});

router.get('/fx', (_req: AuthenticatedRequest, res: Response) => {
  const ref = builtInFxReference();
  res.json({ policy: getFxPolicy(db), labels: FX_METHOD_LABEL, rates: listFxRates(db), reference: { source: ref.source, effectiveDate: ref.effectiveDate, rates: ref.rates }, templateColumns: FX_TEMPLATE_COLUMNS });
});

// ─── Save from CostVision ────────────────────────────────────────────────────

const ccy = z.string().refine(isIsoCurrency, 'Not an ISO 4217 currency code');
const money = z.number().finite().nonnegative();
const shortText = (n: number) => z.string().trim().max(n);

const detailsSchema = z.object({
  partNumber: shortText(60).min(1, 'Part number is required'),
  componentName: shortText(160).optional(),
  programme: shortText(40).optional().nullable(),
  modelYear: z.number().int().min(2000).max(2100).optional().nullable(),
  powertrain: shortText(40).optional().nullable(),
  status: z.enum(['draft', 'completed']),
  currentCost: money.optional().nullable(),
  currentCcy: ccy.optional().nullable(),
  currentTerms: z.enum(['DAP', 'EXW']).optional().nullable(),
  currentSource: shortText(60).optional().nullable(),
  annualVolume: z.number().int().nonnegative().max(1e9).optional().nullable(),
  notes: shortText(1000).optional(),
}).refine(d => d.currentCost === null || d.currentCost === undefined || (!!d.currentCcy && !!d.currentTerms), {
  message: 'A current cost needs its currency and its delivery terms (DAP or EXW)', path: ['currentCcy'],
});

const saveSchema = z.object({
  scenario: z.object({
    id: z.string().min(1).max(80),
    name: shortText(160),
    commodity: shortText(60),
    region: shortText(8).optional().nullable(),
    input: z.record(z.string(), z.unknown()),
    result: z.object({ total: z.number().finite().positive(), partName: z.string().optional() }).passthrough(),
  }),
  details: detailsSchema,
});

router.post('/records', (req: AuthenticatedRequest, res: Response) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    res.status(400).json({ error: `${i.path.join('.')}: ${i.message}` });
    return;
  }
  const { scenario: sc, details: d } = parsed.data;
  const userId = req.user!.userId;
  const nowIso = new Date().toISOString();
  // The full costing stays in `scenarios` — the record links to it (no second copy of the costing).
  const owner = db.prepare('SELECT created_by FROM scenarios WHERE id = ?').get(sc.id) as { created_by: string } | undefined;
  if (owner && owner.created_by !== userId) { res.status(409).json({ error: 'That costing belongs to another user' }); return; }
  const data = JSON.stringify({ input: sc.input, result: sc.result, region: sc.region ?? 'UK', commodity: sc.commodity });
  db.prepare(`INSERT INTO scenarios (id, name, description, data, created_at, created_by) VALUES (?, ?, '', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data WHERE scenarios.created_by = excluded.created_by`)
    .run(sc.id, sc.name, data, nowIso, userId);

  const input = sc.input as { partName?: unknown; deliveryTerms?: unknown };
  const rec: RecordInput = {
    sourceTool: 'CostVision', sourceRef: sc.id, ownerId: userId, ownerLabel: req.user!.email,
    partNumber: d.partNumber, componentName: d.componentName || (typeof input.partName === 'string' && input.partName.trim()) || sc.name,
    commodity: COMMODITY_REPORT_LABELS[sc.commodity] ?? sc.commodity, programme: d.programme || null, modelYear: d.modelYear ?? null,
    powertrain: d.powertrain || null, country: sc.region || 'UK', status: d.status, costingDate: nowIso.slice(0, 10),
    // A CostVision should-cost is computed in GBP (country books are converted at the book's FX).
    shouldCost: sc.result.total, shouldCcy: 'GBP', shouldTerms: input.deliveryTerms === 'EXW' ? 'EXW' : 'DAP',
    currentCost: d.currentCost ?? null, currentCcy: d.currentCost != null ? d.currentCcy ?? null : null,
    currentTerms: d.currentCost != null ? d.currentTerms ?? null : null, currentSource: d.currentCost != null ? d.currentSource ?? null : null,
    annualVolume: d.annualVolume ?? null, volumeValidated: false,
    savingStatus: null, savingPerPiece: null, savingCcy: null, isTest: false, notes: d.notes ?? '',
  };
  try {
    const id = insertRecord(db, rec, fxContext(db, nowIso));
    audit(db, userId, 'record.save', id, { scenario: sc.id, partNumber: d.partNumber });
    invalidateKpiCache();
    const saved = loadClassified().find(r => r.id === id)!;
    res.status(201).json({ record: publicRow(saved) });
  } catch (e) { log(e, 'save'); res.status(500).json({ error: 'The record could not be saved.' }); }
});

// ─── Edit / delete ───────────────────────────────────────────────────────────

const patchSchema = z.object({
  partNumber: shortText(60).nullable().optional(),
  componentName: shortText(160).min(1).optional(),
  commodity: shortText(60).nullable().optional(),
  programme: shortText(40).nullable().optional(),
  modelYear: z.number().int().min(2000).max(2100).nullable().optional(),
  powertrain: shortText(40).nullable().optional(),
  country: shortText(40).nullable().optional(),
  status: z.enum(['draft', 'completed', 'reviewed', 'approved']).optional(),
  currentCost: money.nullable().optional(),
  currentCcy: ccy.nullable().optional(),
  currentTerms: z.enum(['DAP', 'EXW']).nullable().optional(),
  currentSource: shortText(60).nullable().optional(),
  annualVolume: z.number().int().nonnegative().max(1e9).nullable().optional(),
  volumeValidated: z.boolean().optional(),
  savingStatus: z.enum(['validated', 'implemented']).nullable().optional(),
  savingPerPiece: money.nullable().optional(),
  savingCcy: ccy.nullable().optional(),
  isTest: z.boolean().optional(),
  notes: shortText(1000).optional(),
}).strict();

const ADMIN_ONLY_FIELDS = ['volumeValidated', 'savingStatus', 'savingPerPiece', 'savingCcy'] as const;
const MONEY_FIELDS = ['currentCost', 'currentCcy', 'currentTerms'] as const;

router.patch('/records/:id', (req: AuthenticatedRequest, res: Response) => {
  const row = getRecordRow(db, String(req.params.id));
  if (!row || row.deleted) { res.status(404).json({ error: 'Record not found' }); return; }
  const admin = isAdmin(req);
  if (!admin && row.ownerId !== req.user!.userId) { res.status(403).json({ error: 'Only the record owner or an admin can edit it' }); return; }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { const i = parsed.error.issues[0]; res.status(400).json({ error: `${i.path.join('.') || 'body'}: ${i.message}` }); return; }
  const p = parsed.data as Partial<RecordInput> & { status?: RecordStatus };
  if (!admin) {
    const bad = ADMIN_ONLY_FIELDS.filter(k => k in p);
    if (bad.length) { res.status(403).json({ error: `Only an admin can set ${bad.join(', ')}` }); return; }
    if (p.status === 'reviewed' || p.status === 'approved') { res.status(403).json({ error: 'Only an admin can mark a costing reviewed or approved' }); return; }
    // A reviewed / approved costing whose money changes goes back for review.
    if ((row.status === 'reviewed' || row.status === 'approved') && MONEY_FIELDS.some(k => k in p) && !p.status) p.status = 'completed';
  }
  if (row.sourceTool === 'CostVision' && ('shouldCost' in (req.body ?? {}))) { res.status(400).json({ error: 'A CostVision should-cost comes from its costing and cannot be edited here' }); return; }
  const next = { ...row, ...p };
  if (next.currentCost !== null && (!next.currentCcy || !next.currentTerms)) { res.status(400).json({ error: 'A current cost needs its currency and delivery terms' }); return; }
  if (next.savingStatus && (next.savingPerPiece === null || !next.savingCcy)) { res.status(400).json({ error: 'A saving status needs the saving per piece and its currency' }); return; }
  try {
    updateRecord(db, row.id, p, fxContext(db));
    audit(db, req.user!.userId, 'record.edit', row.id, p);
    invalidateKpiCache();
    res.json({ record: publicRow(loadClassified().find(r => r.id === row.id)!) });
  } catch (e) { log(e, 'patch'); res.status(500).json({ error: 'The record could not be updated.' }); }
});

router.delete('/records/:id', (req: AuthenticatedRequest, res: Response) => {
  const row = getRecordRow(db, String(req.params.id));
  if (!row || row.deleted) { res.status(404).json({ error: 'Record not found' }); return; }
  if (!isAdmin(req) && row.ownerId !== req.user!.userId) { res.status(403).json({ error: 'Only the record owner or an admin can delete it' }); return; }
  softDelete(db, row.id, new Date().toISOString());
  audit(db, req.user!.userId, 'record.delete', row.id);
  invalidateKpiCache();
  res.json({ ok: true });
});

// ─── Admin: FX ───────────────────────────────────────────────────────────────

function fileBuffer(body: unknown): Buffer | null {
  const b = body as { fileBase64?: unknown } | undefined;
  if (!b || typeof b.fileBase64 !== 'string' || b.fileBase64.length > 8_000_000) return null;
  try { return Buffer.from(b.fileBase64, 'base64'); } catch { return null; }
}

router.put('/fx/policy', (req: AuthenticatedRequest, res: Response) => {
  if (!adminOnly(req, res)) return;
  const p = (req.body as { policy?: unknown })?.policy;
  if (p !== 'monthly' && p !== 'costing-date' && p !== 'reporting-date') { res.status(400).json({ error: 'policy must be monthly, costing-date or reporting-date' }); return; }
  setFxPolicy(db, p as FxPolicy);
  audit(db, req.user!.userId, 'fx.policy', p);
  invalidateKpiCache();
  res.json({ policy: p, note: 'Saved records keep their frozen rates. Run a recalculation to apply the new policy to them.' });
});

router.post('/fx/rates', (req: AuthenticatedRequest, res: Response) => {
  if (!adminOnly(req, res)) return;
  const buf = fileBuffer(req.body);
  if (!buf) { res.status(400).json({ error: 'Send the file as fileBase64 (CSV or XLSX, up to about 6 MB)' }); return; }
  try {
    const { rows, headers } = readSheet(buf);
    const r = parseFxRows(rows, headers, builtInFxReference(), new Date().toISOString());
    if (r.errors.length) { res.status(400).json({ error: 'The FX file was not loaded', errors: r.errors.slice(0, 100) }); return; }
    const n = upsertFxRates(db, r.rates, req.user!.userId);
    audit(db, req.user!.userId, 'fx.load', String(n), { currencies: [...new Set(r.rates.map(x => x.currency))] });
    invalidateKpiCache();
    res.json({ loaded: n, notes: [...r.notes, 'Saved records keep their frozen rates. Run a recalculation to apply the new rates to them.'] });
  } catch (e) { log(e, 'fx upload'); res.status(400).json({ error: 'The file could not be read as CSV or Excel.' }); }
});

router.post('/fx/recalculate', (req: AuthenticatedRequest, res: Response) => {
  if (!adminOnly(req, res)) return;
  const b = req.body as { ids?: unknown; apply?: unknown };
  const ids = Array.isArray(b?.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10_000) : 'all';
  const apply = b?.apply === true;
  try {
    const r = recalculateFx(db, ids, fxContext(db), apply, req.user!.userId);
    if (apply) { audit(db, req.user!.userId, 'fx.recalculate', String(r.changed), { examined: r.examined, policy: getFxPolicy(db) }); invalidateKpiCache(); }
    res.json({ ...r, applied: apply, changes: r.changes.slice(0, 500) });
  } catch (e) { log(e, 'recalc'); res.status(500).json({ error: 'The recalculation failed; nothing was changed.' }); }
});

// ─── Admin: import (CSS System, CPSC II, other tools) ────────────────────────

router.get('/import/template.csv', (_req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="costvision-kpi-import-template.csv"');
  res.send(importTemplateCsv());
});

router.post('/import', (req: AuthenticatedRequest, res: Response) => {
  if (!adminOnly(req, res)) return;
  const buf = fileBuffer(req.body);
  if (!buf) { res.status(400).json({ error: 'Send the file as fileBase64 (CSV or XLSX)' }); return; }
  try {
    const { rows, headers } = readSheet(buf);
    const r = parseImportRows(rows, headers);
    if (r.errors.length) { res.status(400).json({ error: 'Nothing was imported', errors: r.errors.slice(0, 100) }); return; }
    const ctx = fxContext(db);
    let added = 0, updated = 0;
    db.transaction(() => {
      for (const rec of r.records) {
        const existing = findImported(db, rec.sourceTool, rec.sourceRef);
        // An imported record's owner is the person named in the file, not the admin who loaded it.
        const full: RecordInput = { ...rec, ownerId: `import:${rec.sourceTool}:${rec.ownerLabel}`.slice(0, 200) };
        if (existing) { updateRecord(db, existing, full, ctx); updated++; } else { insertRecord(db, full, ctx); added++; }
      }
    })();
    audit(db, req.user!.userId, 'records.import', String(added + updated), { added, updated, tools: [...new Set(r.records.map(x => x.sourceTool))] });
    invalidateKpiCache();
    res.json({ added, updated });
  } catch (e) { log(e, 'import'); res.status(400).json({ error: 'The file could not be read as CSV or Excel; nothing was imported.' }); }
});

router.get('/audit', (req: AuthenticatedRequest, res: Response) => {
  if (!adminOnly(req, res)) return;
  const rows = db.prepare(`SELECT a.ts, a.action, a.target, a.detail, u.full_name AS user FROM kpi_audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`).all();
  res.json({ rows });
});

export default router;
