"use strict";
/**
 * SQLite Database Connection & Initialization
 * Uses better-sqlite3 for synchronous, high-performance access.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
exports.seedIfEmpty = seedIfEmpty;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * Resolve the data directory. In a packaged Electron app process.cwd() is
 * unreliable, so we prefer the DATABASE_PATH env var (set by electron/main.js)
 * and fall back to a path relative to the user data folder.
 */
function resolveDataDir() {
    if (process.env.DATABASE_PATH) {
        return path_1.default.dirname(process.env.DATABASE_PATH);
    }
    // In development, use cwd-relative data/
    return path_1.default.resolve(process.cwd(), 'data');
}
const DATA_DIR = resolveDataDir();
const DB_PATH = process.env.DATABASE_PATH || path_1.default.join(DATA_DIR, 'logistics.db');
// Ensure data directory exists
if (!fs_1.default.existsSync(path_1.default.dirname(DB_PATH))) {
    fs_1.default.mkdirSync(path_1.default.dirname(DB_PATH), { recursive: true });
}
const db = new better_sqlite3_1.default(DB_PATH);
// Enable WAL mode for better read concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
/**
 * Run all migration files in order
 */
function runMigrations() {
    // In packaged Electron apps process.cwd() is unreliable.
    // When built, migrations are copied into dist-server/migrations/
    // so __dirname (dist-server) is the correct base.
    const migrationsDir = path_1.default.resolve(__dirname, 'migrations');
    if (!fs_1.default.existsSync(migrationsDir)) {
        console.error('[DB] Migrations directory not found:', migrationsDir);
        return;
    }
    const migrationFiles = fs_1.default.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
    for (const file of migrationFiles) {
        const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), 'utf-8');
        console.log(`[DB] Running migration: ${file}`);
        try {
            db.exec(sql);
        }
        catch (err) {
            // Migrations re-run on every boot; CREATE TABLE/INDEX use IF NOT EXISTS,
            // but ALTER TABLE ADD COLUMN has no such guard, so tolerate a rerun.
            if (typeof err?.message === 'string' && err.message.includes('duplicate column name')) {
                console.log(`[DB] Migration ${file} already applied, skipping.`);
            }
            else {
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
function seedIfEmpty() {
    // Production databases start empty — no test data inserted.
}
exports.default = db;
