"use strict";
/**
 * SQLite Database Connection & Initialization
 * Uses better-sqlite3 for synchronous, high-performance access.
 *
 * ─── Database provenance ────────────────────────────────────────────────────
 * Every database this build opens must have been CREATED by a build that is
 * at least DB_EPOCH. Anything older is quarantined (renamed aside, never
 * deleted) and a brand-new file is created and stamped.
 *
 * Why this exists: builds before August 2026 contained a seeding function
 * that re-inserted demo records into any empty database at startup. Purging
 * the rows was not enough — a leftover old executable on the same machine
 * could simply write them back. The packaged app therefore now uses a NEW
 * filename (logistics.v2.db, set by electron/main.js) that old binaries have
 * never heard of, and this module refuses to trust any file that lacks the
 * provenance stamp. Old data cannot reach this file by any path: old builds
 * don't know its name, and un-stamped files are moved aside before opening.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUARANTINED_FILE = exports.DATABASE_FILE = exports.DB_EPOCH = void 0;
exports.getDbProvenance = getDbProvenance;
exports.listOtherDatabaseFiles = listOtherDatabaseFiles;
exports.runMigrations = runMigrations;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const build_info_1 = require("./build-info");
/**
 * The database generation this build requires. Epoch 1 is the legacy
 * logistics.db era (implicit — those files carry no stamp at all). Bump this
 * number if a forced fresh start is ever needed again: every existing file
 * will be quarantined and a clean one created on next launch.
 */
exports.DB_EPOCH = 2;
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
/**
 * The database file actually in use. Exported so the running app can report
 * it (see /api/health) — when records show up unexpectedly, the first thing
 * worth knowing is which file is being read.
 */
exports.DATABASE_FILE = DB_PATH;
// Ensure data directory exists
if (!fs_1.default.existsSync(path_1.default.dirname(DB_PATH))) {
    fs_1.default.mkdirSync(path_1.default.dirname(DB_PATH), { recursive: true });
}
/**
 * True when the file begins with SQLite's 16-byte magic header. A file that
 * does not is junk (or empty) — definitely not a database holding anyone's
 * records.
 */
function hasSqliteHeader(file) {
    try {
        const fd = fs_1.default.openSync(file, 'r');
        try {
            const buf = Buffer.alloc(16);
            const n = fs_1.default.readSync(fd, buf, 0, 16, 0);
            return n === 16 && buf.toString('latin1', 0, 15) === 'SQLite format 3' && buf[15] === 0;
        }
        finally {
            fs_1.default.closeSync(fd);
        }
    }
    catch {
        return false;
    }
}
/**
 * Read the epoch stamped into a database file, without keeping it open.
 *  - a number  : the stamp (0 = no stamp; legacy or foreign file)
 *  - 'locked'  : a real SQLite file that could not be read right now
 *                (AV scan, another process) — NOT safe to quarantine
 *  - 'garbage' : not a SQLite file at all — safe to move aside
 */
function readFileEpoch(file) {
    if (!hasSqliteHeader(file))
        return 'garbage';
    try {
        const probe = new better_sqlite3_1.default(file, { readonly: true, fileMustExist: true });
        try {
            const row = probe.prepare("SELECT value FROM db_meta WHERE key = 'epoch'").get();
            return row ? Number(row.value) || 0 : 0;
        }
        catch {
            return 0; // no db_meta table — created before provenance existed
        }
        finally {
            probe.close();
        }
    }
    catch {
        return 'locked';
    }
}
/**
 * If the target file was created by an older epoch (or is not a database at
 * all), move it — and its WAL/SHM companions — aside. Nothing is deleted:
 * the file keeps existing under a .legacy-<timestamp> name so its contents
 * can always be inspected or recovered.
 *
 * A real database that is merely unreadable right now (file lock) is NOT
 * quarantined — losing sight of genuine data to a transient lock would be
 * worse than failing to start. The throw below surfaces as the app's error
 * page rather than a silent hang.
 *
 * Returns the quarantine path, or null if the file was current or absent.
 */
function quarantineIfLegacy(file) {
    if (!fs_1.default.existsSync(file))
        return null;
    const epoch = readFileEpoch(file);
    if (typeof epoch === 'number' && epoch >= exports.DB_EPOCH)
        return null;
    if (epoch === 'locked') {
        throw new Error(`The database at ${file} exists but cannot be read — another program ` +
            `(antivirus, or a second copy of this app) is holding it. Close other ` +
            `programs and start the app again.`);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = `${file}.legacy-${stamp}`;
    try {
        fs_1.default.renameSync(file, target);
        for (const suffix of ['-wal', '-shm']) {
            if (fs_1.default.existsSync(file + suffix)) {
                fs_1.default.renameSync(file + suffix, target + suffix);
            }
        }
    }
    catch (err) {
        throw new Error(`A pre-epoch database at ${file} must be moved aside before this app ` +
            `can start, but the rename failed (${err?.code || err?.message}). ` +
            `Close other programs using the file and start the app again.`);
    }
    console.warn(`[DB] Quarantined pre-epoch database (epoch ${epoch === 'garbage' ? 'n/a' : epoch} < ${exports.DB_EPOCH}):`);
    console.warn(`[DB]   ${file}  →  ${target}`);
    return target;
}
exports.QUARANTINED_FILE = quarantineIfLegacy(DB_PATH);
const IS_FRESH_DATABASE = !fs_1.default.existsSync(DB_PATH);
const db = new better_sqlite3_1.default(DB_PATH);
// Enable WAL mode for better read concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
// ─── Provenance stamp ────────────────────────────────────────────────────────
// Written once, at creation, and never updated: it records which build made
// this file. db_meta is deliberately NOT in the backup/reset table lists, so
// neither a restore nor a data wipe can erase the file's identity.
db.exec(`CREATE TABLE IF NOT EXISTS db_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
const stampIfAbsent = db.prepare('INSERT INTO db_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING');
stampIfAbsent.run('epoch', String(exports.DB_EPOCH));
stampIfAbsent.run('created_at', new Date().toISOString());
stampIfAbsent.run('created_by_version', build_info_1.APP_VERSION);
stampIfAbsent.run('created_by_build', build_info_1.BUILD_ID);
// Push the stamp into the main file NOW. In WAL mode it would otherwise sit
// in the -wal journal until a checkpoint; a session killed before that (power
// loss, installer stopping the app) could leave a main file with no visible
// stamp, and the next boot would wrongly quarantine a genuine database.
db.pragma('wal_checkpoint(TRUNCATE)');
/** The stamp of the active database, for /api/health and the startup log. */
function getDbProvenance() {
    const rows = db.prepare('SELECT key, value FROM db_meta').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
/**
 * Other database files sitting beside the active one — the legacy
 * logistics.db an old build may still be writing to, and any quarantined
 * copies. Reported by /api/health so "is there stale data on this machine?"
 * is answerable remotely, from the app itself.
 */
function listOtherDatabaseFiles() {
    try {
        const dir = path_1.default.dirname(DB_PATH);
        const active = path_1.default.basename(DB_PATH);
        return fs_1.default
            .readdirSync(dir)
            .filter(f => /^logistics.*\.db(\.legacy-.*)?$/.test(f) && f !== active)
            .sort();
    }
    catch {
        return [];
    }
}
if (IS_FRESH_DATABASE) {
    console.log(`[DB] Fresh database created by v${build_info_1.APP_VERSION} (${build_info_1.BUILD_ID}) — no prior contents existed.`);
}
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
// NOTE: there is deliberately no seeding function here. Databases start empty
// and are only ever filled by the operator, by a backup import, or by a cloud
// restore. Records must never appear on their own.
exports.default = db;
