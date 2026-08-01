/**
 * SQLite Database Connection & Initialization
 * Uses better-sqlite3 for synchronous, high-performance access.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Resolve the data directory. In a packaged Electron app process.cwd() is
 * unreliable, so we prefer the DATABASE_PATH env var (set by electron/main.js)
 * and fall back to a path relative to the user data folder.
 */
function resolveDataDir(): string {
  if (process.env.DATABASE_PATH) {
    return path.dirname(process.env.DATABASE_PATH);
  }
  // In development, use cwd-relative data/
  return path.resolve(process.cwd(), 'data');
}

const DATA_DIR = resolveDataDir();
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'logistics.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better read concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/**
 * Run all migration files in order
 */
export function runMigrations(): void {
  // In packaged Electron apps process.cwd() is unreliable.
  // When built, migrations are copied into dist-server/migrations/
  // so __dirname (dist-server) is the correct base.
  const migrationsDir = path.resolve(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error('[DB] Migrations directory not found:', migrationsDir);
    return;
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[DB] Running migration: ${file}`);
    try {
      db.exec(sql);
    } catch (err: any) {
      // Migrations re-run on every boot; CREATE TABLE/INDEX use IF NOT EXISTS,
      // but ALTER TABLE ADD COLUMN has no such guard, so tolerate a rerun.
      if (typeof err?.message === 'string' && err.message.includes('duplicate column name')) {
        console.log(`[DB] Migration ${file} already applied, skipping.`);
      } else {
        throw err;
      }
    }
  }

  console.log('[DB] All migrations complete.');
}

/**
 * No-op in production — the client's database starts empty.
 * Seed data was used during development only.
 */
export function seedIfEmpty(): void {
  // Production databases start empty — no test data inserted.
}

export default db;
