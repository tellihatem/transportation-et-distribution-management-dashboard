"use strict";
/**
 * Express.js Backend Server — Logistics Financial Dashboard
 *
 * Serves REST API on port 3001
 * Local SQLite database with Supabase cloud replication
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
exports.stopServer = stopServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
const fs_1 = __importDefault(require("fs"));
// Load .env from project root
(0, dotenv_1.config)({ path: path_1.default.resolve(process.cwd(), '.env') });
const database_1 = __importStar(require("./database"));
const build_info_1 = require("./build-info");
const error_handler_1 = require("./middleware/error-handler");
const replicator_1 = require("./sync/replicator");
// Route imports
const auth_1 = __importDefault(require("./routes/auth"));
const trips_1 = __importDefault(require("./routes/trips"));
const resales_1 = __importDefault(require("./routes/resales"));
const expenses_1 = __importDefault(require("./routes/expenses"));
const sync_1 = __importDefault(require("./routes/sync"));
const backup_1 = __importDefault(require("./routes/backup"));
const ledger_audit_1 = __importDefault(require("./routes/ledger-audit"));
const client_payments_1 = __importDefault(require("./routes/client-payments"));
const driver_payments_1 = __importDefault(require("./routes/driver-payments"));
const suppliers_1 = require("./routes/suppliers");
const app = (0, express_1.default)();
// The port to try first. The dev frontend proxies to 3001, so that stays the
// preference — but it is only a preference: see startServer().
const PREFERRED_PORT = parseInt(process.env.PORT || '3001', 10);
/** The port actually bound. 0 until the server is listening. */
let boundPort = 0;
let httpServer = null;
let syncInterval = null;
let initialSyncTimeout = null;
let startPromise = null;
function startBackgroundSync() {
    if (syncInterval)
        return;
    const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10);
    syncInterval = setInterval(async () => {
        try {
            const result = await (0, replicator_1.processSyncQueue)();
            if (result.processed > 0 || result.failed > 0) {
                console.log(`[SCHEDULER] Sync queue processed: ${result.processed} ok, ${result.failed} failed`);
            }
        }
        catch (error) {
            console.error('[SCHEDULER] Sync queue processing error:', error);
        }
    }, SYNC_INTERVAL);
    initialSyncTimeout = setTimeout(async () => {
        try {
            await (0, replicator_1.processSyncQueue)();
        }
        catch (error) {
            console.error('[SCHEDULER] Initial sync queue processing error:', error);
        }
    }, 5000);
}
function stopBackgroundSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    if (initialSyncTimeout) {
        clearTimeout(initialSyncTimeout);
        initialSyncTimeout = null;
    }
}
function closeDatabase() {
    try {
        database_1.default.close();
    }
    catch (error) {
        console.error('[DB] Error while closing database:', error);
    }
}
// --- Middleware ---
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
const DEV_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173', 'http://0.0.0.0:3000'];
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : DEV_CORS_ORIGINS;
app.use((0, cors_1.default)({
    origin: corsOrigins,
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, cookie_parser_1.default)(process.env.SESSION_SECRET));
// Request logging
app.use((req, _res, next) => {
    if (req.path.startsWith('/api')) {
        console.log(`[API] ${req.method} ${req.path}`);
    }
    next();
});
// --- Initialize Database ---
console.log('\n[SERVER] 🚛 Logistics Financial Dashboard — Backend Server');
console.log('[SERVER] ─────────────────────────────────────────────────');
console.log(`[SERVER] Version ${build_info_1.APP_VERSION} (build ${build_info_1.BUILD_ID})`);
(0, database_1.runMigrations)();
console.log(`[DB] Using database file: ${database_1.DATABASE_FILE}`);
{
    // Where this database came from, printed on every start. If unexpected
    // records ever appear again, this log names the file, the build that
    // created it, and any other database files sitting beside it.
    const provenance = (0, database_1.getDbProvenance)();
    console.log(`[DB] Created ${provenance.created_at} by v${provenance.created_by_version} (epoch ${provenance.epoch})`);
    if (database_1.QUARANTINED_FILE) {
        console.warn(`[DB] A pre-epoch database was moved aside this start: ${database_1.QUARANTINED_FILE}`);
    }
    const others = (0, database_1.listOtherDatabaseFiles)();
    if (others.length) {
        console.warn(`[DB] Other database files present (NOT read by this app): ${others.join(', ')}`);
    }
}
// Health check (public, no auth — used for uptime monitoring).
//
// Reports which build is running, which database file it opened, which build
// CREATED that file, and any other database files on the machine. All of this
// used to be unanswerable remotely, which is how a stale install kept showing
// records that had already been removed from the code.
app.get('/api/health', (_req, res) => {
    const counts = {};
    for (const table of ['client_trips', 'material_resales', 'expenses']) {
        counts[table] = database_1.default.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
    }
    res.json({
        success: true,
        service: 'logistics-dashboard-api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        appVersion: build_info_1.APP_VERSION,
        buildId: build_info_1.BUILD_ID,
        buildTime: build_info_1.BUILD_TIME,
        gitCommit: build_info_1.GIT_COMMIT,
        databaseFile: database_1.DATABASE_FILE,
        databaseProvenance: (0, database_1.getDbProvenance)(),
        otherDatabaseFiles: (0, database_1.listOtherDatabaseFiles)(),
        recordCounts: counts,
    });
});
// --- API Routes ---
// Auth is disabled: this app is deployed to a single trusted client machine,
// so there's no login gate in front of /api/* (routes/auth.ts and AuthGate.tsx
// are still here, unused, if a login gate is ever needed again).
app.use('/api/auth', auth_1.default);
app.use('/api/trips', trips_1.default);
app.use('/api/resales', resales_1.default);
app.use('/api/expenses', expenses_1.default);
app.use('/api/client-payments', client_payments_1.default);
app.use('/api/driver-payments', driver_payments_1.default);
app.use('/api/supplier-payments', suppliers_1.supplierPaymentsRouter);
app.use('/api/supplier-invoices', suppliers_1.supplierInvoicesRouter);
app.use('/api/sync', sync_1.default);
app.use('/api/backup', backup_1.default);
app.use('/api/health/ledger-audit', ledger_audit_1.default);
// --- Serve React Frontend (Electron/Production mode) ---
// Resolved relative to this compiled module (dist-server/index.js), not
// process.cwd() — in the packaged Electron app, main.js chdir()s to the
// userData directory before loading this module, so cwd cannot be used to
// locate the sibling dist/ folder (same reasoning as runMigrations() in
// database.ts).
const distPath = path_1.default.resolve(__dirname, '..', 'dist');
if (fs_1.default.existsSync(distPath)) {
    app.use(express_1.default.static(distPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api'))
            return next();
        res.sendFile(path_1.default.join(distPath, 'index.html'));
    });
}
// --- Error Handler (must be last) ---
app.use(error_handler_1.errorHandler);
// --- Start Server Function ---
/**
 * Bind one port, resolving with the port actually taken, or reject.
 *
 * Port 0 asks the operating system for any free port, which is what makes the
 * retry in startServer() always succeed.
 */
function listenOn(port) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, '0.0.0.0', () => {
            httpServer = server;
            boundPort = server.address().port;
            resolve(boundPort);
        });
        server.on('error', reject);
    });
}
/**
 * Start the API, and do not refuse to run because something else holds the
 * usual port.
 *
 * This used to bind a fixed 3001 and give up if it was taken — by another
 * program, or by a copy of this app that had not fully exited. All the desktop
 * app could say was that the local server would not start, and the only cure
 * was hunting down whatever held the port. Nothing needs the number to be
 * 3001: Electron loads whatever port this returns.
 */
function startServer() {
    if (httpServer) {
        return Promise.resolve(boundPort);
    }
    if (startPromise) {
        return startPromise;
    }
    const announce = (port) => {
        console.log(`[SERVER] ✅ API running on http://localhost:${port}`);
        console.log(`[SERVER] 📡 Health: http://localhost:${port}/api/health`);
        console.log('[SERVER] ─────────────────────────────────────────────────');
        console.log();
        startBackgroundSync();
        startPromise = null;
        return port;
    };
    const giveUp = (error) => {
        console.error('[SERVER] Failed to start server:', error);
        httpServer = null;
        startPromise = null;
        throw error;
    };
    startPromise = listenOn(PREFERRED_PORT)
        .then(announce)
        .catch((error) => {
        if (error?.code !== 'EADDRINUSE')
            return giveUp(error);
        console.warn(`[SERVER] Port ${PREFERRED_PORT} is in use; asking the system for a free one.`);
        return listenOn(0).then(announce).catch(giveUp);
    });
    return startPromise;
}
async function stopServer() {
    stopBackgroundSync();
    if (!httpServer) {
        closeDatabase();
        return;
    }
    await new Promise((resolve, reject) => {
        httpServer?.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
    httpServer = null;
    closeDatabase();
}
// Auto-start if run directly
if (typeof require !== 'undefined' && require.main === module) {
    startServer().catch((error) => {
        console.error('[SERVER] Unhandled startup error:', error);
        process.exitCode = 1;
    });
}
exports.default = app;
