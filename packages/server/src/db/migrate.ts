import type BetterSqlite3 from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Minimal, transactional migration runner. Applies every `NNN_name.sql` file in
 * ./migrations that is not yet recorded in `_migrations`, in filename order.
 * Returns the number of migrations applied this run.
 */
export function runMigrations(db: BetterSqlite3.Database): number {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name),
  );

  const record = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
    count++;
  }
  return count;
}
