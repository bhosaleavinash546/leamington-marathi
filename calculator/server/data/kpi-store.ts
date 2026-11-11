/**
 * KPI dashboard — the reporting registry (data access only; no Express).
 *
 * `costing_records` holds ONE row per saved costing revision: the classification the
 * dashboard filters on, the original values with their currencies, and the FROZEN FX
 * snapshot + GBP values. It is not a second costing database: the full CostVision costing
 * stays in `scenarios` (linked by `source_ref`); an imported record (CSS System, CPSC II)
 * carries its tool's record id there. Original values are never overwritten by a
 * conversion; an admin recalculation keeps the previous snapshot in `fx_history`.
 *
 * `fx_rates` is the admin-loaded approved rate table (GBP per one unit). `kpi_audit` logs
 * every write (save, edit, import, FX load, recalculation) with who and when.
 */
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  type KpiRecord, type FxSnapshot, type FxRateRow, type FxReference, type FxMethod, type FxApplied,
  type RecordStatus, type DeliveryTerms, type SavingStatus, resolveFx, toGbp,
} from '../../src/engine/kpi-dashboard.js';
import { REGIONAL_DATA } from '../../src/engine/regional-rates.js';

export function ensureKpiTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS costing_records (
      id               TEXT PRIMARY KEY,
      source_tool      TEXT NOT NULL DEFAULT 'CostVision',
      source_ref       TEXT NOT NULL DEFAULT '',
      owner_id         TEXT NOT NULL,
      owner_label      TEXT NOT NULL DEFAULT '',
      part_number      TEXT,
      component_name   TEXT NOT NULL,
      commodity        TEXT,
      programme        TEXT,
      model_year       INTEGER,
      powertrain       TEXT,
      country          TEXT,
      status           TEXT NOT NULL DEFAULT 'draft',
      costing_date     TEXT NOT NULL,
      should_cost      REAL,
      should_ccy       TEXT,
      should_terms     TEXT,
      current_cost     REAL,
      current_ccy      TEXT,
      current_terms    TEXT,
      current_source   TEXT,
      cost_unit        TEXT NOT NULL DEFAULT 'piece',
      annual_volume    INTEGER,
      volume_validated INTEGER NOT NULL DEFAULT 0,
      saving_status    TEXT,
      saving_per_piece REAL,
      saving_ccy       TEXT,
      fx               TEXT NOT NULL DEFAULT '{}',
      fx_history       TEXT NOT NULL DEFAULT '[]',
      gbp_should       REAL,
      gbp_current      REAL,
      gbp_saving       REAL,
      is_test          INTEGER NOT NULL DEFAULT 0,
      deleted_at       TEXT,
      notes            TEXT NOT NULL DEFAULT '',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cr_costing_date ON costing_records(costing_date);
    CREATE INDEX IF NOT EXISTS idx_cr_part ON costing_records(part_number, programme, model_year, powertrain);
    CREATE INDEX IF NOT EXISTS idx_cr_owner ON costing_records(owner_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_import_ref ON costing_records(source_tool, source_ref) WHERE source_tool <> 'CostVision';

    CREATE TABLE IF NOT EXISTS fx_rates (
      currency     TEXT NOT NULL,
      period       TEXT NOT NULL,
      gbp_per_unit REAL NOT NULL,
      source       TEXT NOT NULL,
      loaded_at    TEXT NOT NULL,
      loaded_by    TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (currency, period)
    );

    CREATE TABLE IF NOT EXISTS kpi_audit (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action  TEXT NOT NULL,
      target  TEXT NOT NULL DEFAULT '',
      detail  TEXT NOT NULL DEFAULT ''
    );
  `);
}

// ─── FX reference + policy ────────────────────────────────────────────────────

/** The rate book's FX (GBP per unit) — the stated fallback until an approved table is loaded. */
export function builtInFxReference(): FxReference {
  const rates: Record<string, number> = {};
  for (const r of Object.values(REGIONAL_DATA)) {
    if (r.currency && r.fxToGBP > 0 && r.currency !== 'GBP') rates[r.currency] = 1 / r.fxToGBP;
  }
  return {
    rates,
    source: 'CostVision rate-book FX, Oct 2026 round (ECB reference rates; national central-bank rates where the ECB publishes none) — reference only, not an approved JLR rate',
    effectiveDate: '2026-10-30',
  };
}

export type FxPolicy = Exclude<FxMethod, 'identity'>;
const POLICY_KEY = 'kpi.fxPolicy';
export const DEFAULT_FX_POLICY: FxPolicy = 'monthly';   // approved by the user, 11 Nov 2026

export function getFxPolicy(db: Database): FxPolicy {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(POLICY_KEY) as { value: string } | undefined;
  return row?.value === 'costing-date' || row?.value === 'reporting-date' || row?.value === 'monthly' ? row.value : DEFAULT_FX_POLICY;
}
export function setFxPolicy(db: Database, p: FxPolicy): void {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(POLICY_KEY, p);
}

export function listFxRates(db: Database): FxRateRow[] {
  return (db.prepare('SELECT currency, period, gbp_per_unit, source, loaded_at FROM fx_rates ORDER BY currency, period').all() as
    { currency: string; period: string; gbp_per_unit: number; source: string; loaded_at: string }[])
    .map(r => ({ currency: r.currency, period: r.period, gbpPerUnit: r.gbp_per_unit, source: r.source, loadedAt: r.loaded_at }));
}

export function upsertFxRates(db: Database, rows: FxRateRow[], userId: string): number {
  const st = db.prepare(`INSERT INTO fx_rates (currency, period, gbp_per_unit, source, loaded_at, loaded_by) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(currency, period) DO UPDATE SET gbp_per_unit = excluded.gbp_per_unit, source = excluded.source, loaded_at = excluded.loaded_at, loaded_by = excluded.loaded_by`);
  const tx = db.transaction((list: FxRateRow[]) => { for (const r of list) st.run(r.currency, r.period, r.gbpPerUnit, r.source, r.loadedAt, userId); });
  tx(rows);
  return rows.length;
}

// ─── Records ──────────────────────────────────────────────────────────────────

interface Row {
  id: string; source_tool: string; source_ref: string; owner_id: string; owner_label: string; owner_name: string | null;
  part_number: string | null; component_name: string; commodity: string | null; programme: string | null; model_year: number | null;
  powertrain: string | null; country: string | null; status: string; costing_date: string;
  should_cost: number | null; should_ccy: string | null; should_terms: string | null;
  current_cost: number | null; current_ccy: string | null; current_terms: string | null; current_source: string | null;
  cost_unit: string; annual_volume: number | null; volume_validated: number;
  saving_status: string | null; saving_per_piece: number | null; saving_ccy: string | null;
  fx: string; fx_history: string; gbp_should: number | null; gbp_current: number | null; gbp_saving: number | null;
  is_test: number; deleted_at: string | null; notes: string; created_at: string; updated_at: string;
}

const terms = (v: string | null): DeliveryTerms | null => (v === 'DAP' || v === 'EXW' ? v : null);

export function rowToRecord(r: Row): KpiRecord {
  let fx: FxSnapshot = {};
  try { fx = JSON.parse(r.fx) as FxSnapshot; } catch { /* keep empty → missing FX */ }
  return {
    id: r.id, sourceTool: r.source_tool, sourceRef: r.source_ref, ownerId: r.owner_id,
    ownerName: r.owner_name || r.owner_label || 'Unknown user',
    partNumber: r.part_number, componentName: r.component_name, commodity: r.commodity, programme: r.programme,
    modelYear: r.model_year, powertrain: r.powertrain, country: r.country, status: r.status as RecordStatus,
    costingDate: r.costing_date, createdAt: r.created_at, updatedAt: r.updated_at,
    shouldCost: r.should_cost, shouldCcy: r.should_ccy, shouldTerms: terms(r.should_terms),
    currentCost: r.current_cost, currentCcy: r.current_ccy, currentTerms: terms(r.current_terms), currentSource: r.current_source,
    costUnit: r.cost_unit, annualVolume: r.annual_volume, volumeValidated: r.volume_validated === 1,
    savingStatus: r.saving_status === 'validated' || r.saving_status === 'implemented' ? r.saving_status : null,
    savingPerPiece: r.saving_per_piece, savingCcy: r.saving_ccy,
    fx, gbpShould: r.gbp_should, gbpCurrent: r.gbp_current, gbpSaving: r.gbp_saving,
    isTest: r.is_test === 1, deleted: !!r.deleted_at, notes: r.notes,
  };
}

const SELECT = `SELECT c.*, u.full_name AS owner_name FROM costing_records c LEFT JOIN users u ON u.id = c.owner_id`;

export function listRecords(db: Database): KpiRecord[] {
  return (db.prepare(SELECT).all() as Row[]).map(rowToRecord);
}
export function getRecordRow(db: Database, id: string): (KpiRecord & { fxHistory: unknown[] }) | null {
  const r = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
  if (!r) return null;
  let fxHistory: unknown[] = [];
  try { fxHistory = JSON.parse(r.fx_history) as unknown[]; } catch { /* empty */ }
  return { ...rowToRecord(r), fxHistory };
}

/** The values a record is written from (save, edit or import). Money in its ORIGINAL currency. */
export interface RecordInput {
  sourceTool: string;
  sourceRef: string;
  ownerId: string;
  ownerLabel: string;
  partNumber: string | null;
  componentName: string;
  commodity: string | null;
  programme: string | null;
  modelYear: number | null;
  powertrain: string | null;
  country: string | null;
  status: RecordStatus;
  costingDate: string;
  shouldCost: number | null; shouldCcy: string | null; shouldTerms: DeliveryTerms | null;
  currentCost: number | null; currentCcy: string | null; currentTerms: DeliveryTerms | null; currentSource: string | null;
  annualVolume: number | null; volumeValidated: boolean;
  savingStatus: SavingStatus | null; savingPerPiece: number | null; savingCcy: string | null;
  isTest: boolean;
  notes: string;
}

export interface FxContext { policy: FxPolicy; table: FxRateRow[]; reference: FxReference; nowIso: string }
export function fxContext(db: Database, nowIso = new Date().toISOString()): FxContext {
  return { policy: getFxPolicy(db), table: listFxRates(db), reference: builtInFxReference(), nowIso };
}

/** Freeze one value's FX. Returns null (→ "missing FX") rather than ever converting 1:1. */
function freeze(amount: number | null, ccy: string | null, date: string, ctx: FxContext): FxApplied | null {
  if (amount === null || !ccy) return null;
  const r = resolveFx(ccy, date, ctx.policy, ctx.table, ctx.reference, ctx.nowIso);
  return r.ok ? r.fx : null;
}

export function snapshotFor(input: Pick<RecordInput, 'shouldCost' | 'shouldCcy' | 'currentCost' | 'currentCcy' | 'savingPerPiece' | 'savingCcy' | 'costingDate'>, ctx: FxContext): { fx: FxSnapshot; gbpShould: number | null; gbpCurrent: number | null; gbpSaving: number | null } {
  const fx: FxSnapshot = {
    should: freeze(input.shouldCost, input.shouldCcy, input.costingDate, ctx),
    current: freeze(input.currentCost, input.currentCcy, input.costingDate, ctx),
    saving: freeze(input.savingPerPiece, input.savingCcy, input.costingDate, ctx),
  };
  return { fx, gbpShould: toGbp(input.shouldCost, fx.should), gbpCurrent: toGbp(input.currentCost, fx.current), gbpSaving: toGbp(input.savingPerPiece, fx.saving) };
}

export function insertRecord(db: Database, input: RecordInput, ctx: FxContext, id: string = `rec-${randomUUID()}`): string {
  const s = snapshotFor(input, ctx);
  db.prepare(`INSERT INTO costing_records (id, source_tool, source_ref, owner_id, owner_label, part_number, component_name, commodity, programme,
      model_year, powertrain, country, status, costing_date, should_cost, should_ccy, should_terms, current_cost, current_ccy, current_terms,
      current_source, annual_volume, volume_validated, saving_status, saving_per_piece, saving_ccy, fx, gbp_should, gbp_current, gbp_saving,
      is_test, notes, created_at, updated_at)
    VALUES (@id, @sourceTool, @sourceRef, @ownerId, @ownerLabel, @partNumber, @componentName, @commodity, @programme, @modelYear, @powertrain,
      @country, @status, @costingDate, @shouldCost, @shouldCcy, @shouldTerms, @currentCost, @currentCcy, @currentTerms, @currentSource,
      @annualVolume, @volumeValidated, @savingStatus, @savingPerPiece, @savingCcy, @fx, @gbpShould, @gbpCurrent, @gbpSaving, @isTest, @notes,
      @now, @now)`).run({
    ...input, id, volumeValidated: input.volumeValidated ? 1 : 0, isTest: input.isTest ? 1 : 0,
    fx: JSON.stringify(s.fx), gbpShould: s.gbpShould, gbpCurrent: s.gbpCurrent, gbpSaving: s.gbpSaving, now: ctx.nowIso,
  });
  return id;
}

/**
 * Update a record's editable fields. FX is re-frozen ONLY for a money value that changed
 * (value, currency or costing date) — every other value keeps its snapshot.
 */
export function updateRecord(db: Database, id: string, patch: Partial<RecordInput>, ctx: FxContext): void {
  const cur = getRecordRow(db, id);
  if (!cur) throw new Error('not found');
  const next = { ...cur, ...patch } as KpiRecord & Partial<RecordInput>;
  const fx: FxSnapshot = { ...cur.fx };
  const dateChanged = patch.costingDate !== undefined && patch.costingDate !== cur.costingDate;
  const refreeze = (key: 'should' | 'current' | 'saving', amt: number | null, ccy: string | null, changed: boolean) => {
    if (changed || dateChanged) fx[key] = freeze(amt, ccy, next.costingDate, ctx);
  };
  refreeze('should', next.shouldCost, next.shouldCcy, ('shouldCost' in patch && patch.shouldCost !== cur.shouldCost) || ('shouldCcy' in patch && patch.shouldCcy !== cur.shouldCcy));
  refreeze('current', next.currentCost, next.currentCcy, ('currentCost' in patch && patch.currentCost !== cur.currentCost) || ('currentCcy' in patch && patch.currentCcy !== cur.currentCcy));
  refreeze('saving', next.savingPerPiece, next.savingCcy, ('savingPerPiece' in patch && patch.savingPerPiece !== cur.savingPerPiece) || ('savingCcy' in patch && patch.savingCcy !== cur.savingCcy));
  db.prepare(`UPDATE costing_records SET part_number=@partNumber, component_name=@componentName, commodity=@commodity, programme=@programme,
      model_year=@modelYear, powertrain=@powertrain, country=@country, status=@status, costing_date=@costingDate,
      should_cost=@shouldCost, should_ccy=@shouldCcy, should_terms=@shouldTerms, current_cost=@currentCost, current_ccy=@currentCcy,
      current_terms=@currentTerms, current_source=@currentSource, annual_volume=@annualVolume, volume_validated=@volumeValidated,
      saving_status=@savingStatus, saving_per_piece=@savingPerPiece, saving_ccy=@savingCcy, fx=@fx, gbp_should=@gbpShould,
      gbp_current=@gbpCurrent, gbp_saving=@gbpSaving, is_test=@isTest, notes=@notes, updated_at=@now WHERE id=@id`).run({
    id, partNumber: next.partNumber, componentName: next.componentName, commodity: next.commodity, programme: next.programme,
    modelYear: next.modelYear, powertrain: next.powertrain, country: next.country, status: next.status, costingDate: next.costingDate,
    shouldCost: next.shouldCost, shouldCcy: next.shouldCcy, shouldTerms: next.shouldTerms, currentCost: next.currentCost,
    currentCcy: next.currentCcy, currentTerms: next.currentTerms, currentSource: next.currentSource, annualVolume: next.annualVolume,
    volumeValidated: next.volumeValidated ? 1 : 0, savingStatus: next.savingStatus, savingPerPiece: next.savingPerPiece, savingCcy: next.savingCcy,
    fx: JSON.stringify(fx), gbpShould: toGbp(next.shouldCost, fx.should), gbpCurrent: toGbp(next.currentCost, fx.current),
    gbpSaving: toGbp(next.savingPerPiece, fx.saving), isTest: next.isTest ? 1 : 0, notes: next.notes ?? '', now: ctx.nowIso,
  });
}

export function softDelete(db: Database, id: string, nowIso: string): void {
  db.prepare('UPDATE costing_records SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso, nowIso, id);
}

export function findImported(db: Database, tool: string, ref: string): string | null {
  const r = db.prepare('SELECT id FROM costing_records WHERE source_tool = ? AND source_ref = ?').get(tool, ref) as { id: string } | undefined;
  return r?.id ?? null;
}

// ─── Controlled FX recalculation (admin) ─────────────────────────────────────

export interface RecalcChange { id: string; field: 'should' | 'current' | 'saving'; from: number | null; to: number | null; fromRate: number | null; toRate: number | null; fromSource: string | null; toSource: string | null }

/** Re-resolve every value's FX under the CURRENT policy + table. `apply` writes it, keeping history. */
export function recalculateFx(db: Database, ids: string[] | 'all', ctx: FxContext, apply: boolean, userId: string): { examined: number; changed: number; changes: RecalcChange[] } {
  const rows = (ids === 'all'
    ? db.prepare(`${SELECT} WHERE c.deleted_at IS NULL`).all()
    : ids.map(i => db.prepare(`${SELECT} WHERE c.id = ?`).get(i)).filter(Boolean)) as Row[];
  const changes: RecalcChange[] = [];
  const write = db.prepare('UPDATE costing_records SET fx = ?, fx_history = ?, gbp_should = ?, gbp_current = ?, gbp_saving = ? WHERE id = ?');
  let changedRecords = 0;
  const run = db.transaction(() => {
    for (const row of rows) {
      const r = rowToRecord(row);
      const s = snapshotFor(r, ctx);
      const pairs: [RecalcChange['field'], number | null, number | null, FxApplied | null | undefined, FxApplied | null | undefined][] = [
        ['should', r.gbpShould, s.gbpShould, r.fx.should, s.fx.should],
        ['current', r.gbpCurrent, s.gbpCurrent, r.fx.current, s.fx.current],
        ['saving', r.gbpSaving, s.gbpSaving, r.fx.saving, s.fx.saving],
      ];
      let any = false;
      for (const [field, from, to, fa, fb] of pairs) {
        const same = (from === null && to === null) || (from !== null && to !== null && Math.abs(from - to) < 1e-9 && (fa?.source ?? null) === (fb?.source ?? null));
        if (same) continue;
        any = true;
        changes.push({ id: r.id, field, from, to, fromRate: fa?.gbpPerUnit ?? null, toRate: fb?.gbpPerUnit ?? null, fromSource: fa?.source ?? null, toSource: fb?.source ?? null });
      }
      if (any) {
        changedRecords++;
        if (apply) {
          let hist: unknown[] = [];
          try { hist = JSON.parse(row.fx_history) as unknown[]; } catch { /* reset */ }
          hist.push({ replacedAt: ctx.nowIso, by: userId, policy: ctx.policy, fx: r.fx, gbpShould: r.gbpShould, gbpCurrent: r.gbpCurrent, gbpSaving: r.gbpSaving });
          write.run(JSON.stringify(s.fx), JSON.stringify(hist), s.gbpShould, s.gbpCurrent, s.gbpSaving, r.id);
        }
      }
    }
  });
  run();
  return { examined: rows.length, changed: changedRecords, changes };
}

export function audit(db: Database, userId: string, action: string, target = '', detail: unknown = ''): void {
  db.prepare('INSERT INTO kpi_audit (ts, user_id, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), userId, action, target, typeof detail === 'string' ? detail : JSON.stringify(detail));
}
