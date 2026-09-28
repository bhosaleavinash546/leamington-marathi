/**
 * Put a user row into a test server's database.
 *
 * requireAuth reads the user on every request, so a signed token for a user
 * who does not exist is refused — which is the point. Tests that boot the real
 * server with CV_DATA_DIR create the users they sign tokens for through this.
 * Call it after the server is up: the server creates the schema.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

export function seedUser(dataDir: string, userId: string, email = `${userId}@test`): void {
  const db = new Database(join(dataDir, 'should-cost.db'));
  try {
    db.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, full_name, email_verified, created_at)
       VALUES (?, ?, 'x', ?, 1, ?)`,
    ).run(userId, email, userId, new Date().toISOString());
  } finally {
    db.close();
  }
}
