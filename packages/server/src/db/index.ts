import Database from 'better-sqlite3';
import { runMigrations } from './migrate';

export type DB = Database.Database;

/** Open the SQLite database, set pragmas, run migrations. Returns { db, migrationsApplied }. */
export function openDb(path: string): { db: DB; migrationsApplied: number } {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const migrationsApplied = runMigrations(db);
  return { db, migrationsApplied };
}
