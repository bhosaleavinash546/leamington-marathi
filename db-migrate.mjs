// ─────────────────────────────────────────────────────────────────────────────
// Additive schema migration, without the blind catch.
//
// The repo's established idiom was `try { db.exec('ALTER TABLE …') } catch {}`.
// It works, and it hides everything: a locked database, a full disk, a typo in
// the column type and "the column is already there" all produce the same
// silence. routes/dfm.mjs documents that exact failure biting once — a swallowed
// ALTER left an upsert with no conflict target and every save returning 500.
//
// addColumn asks the schema first (PRAGMA table_info), so "already present" is
// a fact rather than an exception, and a genuine failure is thrown with the
// table and column named. Pure apart from the db handle; unit-tested against an
// in-memory database.
// ─────────────────────────────────────────────────────────────────────────────

/** Column names on a table, or [] when the table does not exist. */
export function columnsOf(db, table) {
  try {
    return db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all().map(r => r.name);
  } catch {
    return [];
  }
}

/**
 * Add `column` to `table` when it is absent.
 *
 * Returns 'added' | 'present' | 'no-table'. Throws — with the table, column and
 * cause named — when the ALTER itself fails, because that is the case the old
 * idiom could not distinguish from success.
 *
 * `decl` is the type and any constraint SQLite accepts on ALTER TABLE ADD
 * COLUMN (no UNIQUE, no non-constant DEFAULT).
 */
export function addColumn(db, table, column, decl) {
  const existing = columnsOf(db, table);
  if (existing.length === 0) return 'no-table';
  if (existing.includes(column)) return 'present';
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    return 'added';
  } catch (e) {
    throw new Error(`migration failed: ${table}.${column} (${decl}) — ${e?.message || e}`);
  }
}

/** addColumn for several columns: { name: decl }. Returns the per-column result. */
export function addColumns(db, table, columns) {
  const out = {};
  for (const [name, decl] of Object.entries(columns)) out[name] = addColumn(db, table, name, decl);
  return out;
}
