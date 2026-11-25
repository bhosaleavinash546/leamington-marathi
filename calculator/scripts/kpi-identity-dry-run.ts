/**
 * KPI dashboard — A-11 identity dry run (Phase 2, READ-ONLY).
 *
 * Lists, for any CostVision database, which costing records the folded identity key
 * (`foldIdentityCode`: upper case, no spaces / hyphens / underscores / full stops / slashes, on the
 * part number AND the programme code) WOULD group together, and which record would then be current.
 * It changes nothing: the database is opened read-only, and the folded key is not used anywhere in the
 * application — switching it on needs the user's approval.
 *
 *   npx tsx scripts/kpi-identity-dry-run.ts <path/to/should-cost.db> [out.json]
 *
 * Application key today:   normalisePartNumber(part) | programme | model year | powertrain
 * Application key folded:  foldIdentityCode(part)    | foldIdentityCode(programme) | model year | powertrain
 */
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { listRecords } from '../server/data/kpi-store.js';
import { classifyRecords, financialKpis, foldIdentityCode, type KpiRecord, type RecordRole } from '../src/engine/kpi-dashboard.js';

export interface DryRunRecord {
  id: string; sourceTool: string; sourceRef: string; ownerName: string; partNumber: string | null; programme: string | null;
  modelYear: number | null; powertrain: string | null; status: string; costingDate: string;
  keyNow: string; roleNow: RecordRole | null; roleFolded: RecordRole | null;
}
export interface FinancialBrief { eligible: number; opportunityGbp: number; unfavourableGbp: number; annualisedGbp: number }
export interface DryRunGroup { foldedKey: string; keysNow: string[]; records: DryRunRecord[] }
export interface DryRunResult {
  summary: {
    records: number; includedRecords: number; applicationsNow: number; applicationsFolded: number;
    mergingGroups: number; recordsInMergingGroups: number; currentRecordsNow: number; currentRecordsFolded: number;
    /** All-time financial KPIs (GBP, every included record, no filter) today and with the folded key. */
    financialNow: FinancialBrief; financialFolded: FinancialBrief;
  };
  groups: DryRunGroup[];
  /** Deleted / test / invalid records whose folded key matches a group — never grouped, listed for review. */
  excludedRecordsWithFoldedMatch: (DryRunRecord & { excluded: string })[];
}

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
export const foldedApplicationKey = (r: Pick<KpiRecord, 'id' | 'partNumber' | 'programme' | 'modelYear' | 'powertrain'>): string => {
  const pk = foldIdentityCode(r.partNumber);
  return pk ? [pk, foldIdentityCode(r.programme) ?? '—', dash(r.modelYear), dash(r.powertrain)].join('|') : `record:${r.id}`;
};

const brief = (rs: ReturnType<typeof classifyRecords>): FinancialBrief => {
  const f = financialKpis(rs.filter(r => !r.excluded));
  return { eligible: f.eligible, opportunityGbp: f.opportunity.gbp, unfavourableGbp: f.unfavourable.gbp, annualisedGbp: f.annualised.gbp };
};

/** Pure: what the folded key would group (records as the dashboard reads them). */
export function identityDryRun(records: KpiRecord[]): DryRunResult {
  const now = classifyRecords(records);
  // What would be current if the folded codes were the identity (a copy; nothing is stored).
  const folded = classifyRecords(records.map(r => ({ ...r, partNumber: foldIdentityCode(r.partNumber), programme: foldIdentityCode(r.programme) })));
  const roleFolded = new Map(folded.map(r => [r.id, r.role]));
  const view = (c: (typeof now)[number]): DryRunRecord => ({
    id: c.id, sourceTool: c.sourceTool, sourceRef: c.sourceRef, ownerName: c.ownerName, partNumber: c.partNumber, programme: c.programme,
    modelYear: c.modelYear, powertrain: c.powertrain, status: c.status, costingDate: c.costingDate,
    keyNow: c.applicationKey, roleNow: c.role, roleFolded: roleFolded.get(c.id) ?? null,
  });
  const included = now.filter(c => !c.excluded);
  const byFolded = new Map<string, typeof included>();
  for (const c of included) { const k = foldedApplicationKey(c); byFolded.set(k, [...(byFolded.get(k) ?? []), c]); }
  const groups: DryRunGroup[] = [];
  for (const [foldedKey, list] of byFolded) {
    const keysNow = [...new Set(list.map(c => c.applicationKey))].sort();
    if (keysNow.length < 2) continue;
    groups.push({ foldedKey, keysNow, records: list.sort((a, b) => a.costingDate.localeCompare(b.costingDate) || a.id.localeCompare(b.id)).map(view) });
  }
  groups.sort((a, b) => b.records.length - a.records.length || a.foldedKey.localeCompare(b.foldedKey));
  const excludedRecordsWithFoldedMatch = now.filter(c => c.excluded && byFolded.has(foldedApplicationKey(c))).map(c => ({ ...view(c), excluded: c.excluded! }));
  return {
    summary: {
      records: records.length, includedRecords: included.length,
      applicationsNow: new Set(included.map(c => c.applicationKey)).size, applicationsFolded: byFolded.size,
      mergingGroups: groups.length, recordsInMergingGroups: groups.reduce((n, g) => n + g.records.length, 0),
      currentRecordsNow: included.filter(c => c.role === 'current').length,
      currentRecordsFolded: folded.filter(c => !c.excluded && c.role === 'current').length,
      financialNow: brief(now), financialFolded: brief(folded),
    },
    groups, excludedRecordsWithFoldedMatch,
  };
}

/** Open `dbPath` READ-ONLY (it must exist) and run the dry run. */
export async function runDryRun(dbPath: string): Promise<DryRunResult> {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const has = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'costing_records'`).get();
    if (!has) throw new Error(`${dbPath} has no costing_records table (no KPI records)`);
    return identityDryRun(listRecords(db));
  } finally { db.close(); }
}

function printResult(r: DryRunResult): void {
  const s = r.summary;
  console.log(`Records ${s.records} (${s.includedRecords} included). Applications now ${s.applicationsNow} → folded ${s.applicationsFolded}. ` +
    `Current records now ${s.currentRecordsNow} → folded ${s.currentRecordsFolded}. ${s.mergingGroups} group(s) would merge ${s.recordsInMergingGroups} record(s).`);
  const fin = (b: FinancialBrief) => `eligible ${b.eligible}, opportunity £${b.opportunityGbp.toFixed(2)}, unfavourable £${b.unfavourableGbp.toFixed(2)}, annualised £${b.annualisedGbp.toFixed(2)}`;
  console.log(`All-time KPIs now:    ${fin(s.financialNow)}\nAll-time KPIs folded: ${fin(s.financialFolded)}`);
  for (const g of r.groups) {
    console.log(`\n${g.foldedKey}  ← ${g.keysNow.join('  +  ')}`);
    for (const x of g.records) console.log(`  ${x.id}  ${x.sourceTool}  ${dash(x.partNumber)} · ${dash(x.programme)} · ${dash(x.modelYear)} · ${dash(x.powertrain)}  ${x.status}  ${x.costingDate}  ${dash(x.roleNow)} → ${dash(x.roleFolded)}`);
  }
  if (r.excludedRecordsWithFoldedMatch.length) {
    console.log(`\nExcluded records (deleted / test / invalid) whose folded key matches a group — not grouped:`);
    for (const x of r.excludedRecordsWithFoldedMatch) console.log(`  ${x.id}  ${dash(x.partNumber)} · ${dash(x.programme)}  (${x.excluded})`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dbPath, out] = process.argv.slice(2);
  if (!dbPath) { console.error('usage: npx tsx scripts/kpi-identity-dry-run.ts <should-cost.db> [out.json]'); process.exit(2); }
  runDryRun(dbPath).then(r => {
    printResult(r);
    if (out) writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), database: dbPath, readOnly: true, ...r }, null, 1));
  }).catch(e => { console.error((e as Error).message); process.exit(1); });
}
