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
const error_handler_1 = require("./middleware/error-handler");
const auth_1 = require("./middleware/auth");
const replicator_1 = require("./sync/replicator");
// Route imports
const auth_2 = __importDefault(require("./routes/auth"));
const trips_1 = __importDefault(require("./routes/trips"));
const resales_1 = __importDefault(require("./routes/resales"));
const expenses_1 = __importDefault(require("./routes/expenses"));
const sync_1 = __importDefault(require("./routes/sync"));
const backup_1 = __importDefault(require("./routes/backup"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3001', 10);
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
(0, database_1.runMigrations)();
(0, database_1.seedIfEmpty)();
// Health check (public, no auth — used for uptime monitoring)
app.get('/api/health', (_req, res) => {
    res.json({
        success: true,
        service: 'logistics-dashboard-api',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// --- API Routes ---
app.use('/api/auth', auth_2.default);
app.use('/api', auth_1.requireAuth);
app.use('/api/trips', trips_1.default);
app.use('/api/resales', resales_1.default);
app.use('/api/expenses', expenses_1.default);
app.use('/api/sync', sync_1.default);
app.use('/api/backup', backup_1.default);
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
function startServer() {
    if (httpServer) {
        return Promise.resolve(PORT);
    }
    if (startPromise) {
        return startPromise;
    }
    startPromise = new Promise((resolve, reject) => {
        httpServer = app.listen(PORT, '0.0.0.0', () => {
            console.log(`[SERVER] ✅ API running on http://localhost:${PORT}`);
            console.log(`[SERVER] 📡 Health: http://localhost:${PORT}/api/health`);
            console.log('[SERVER] ─────────────────────────────────────────────────\n');
            startBackgroundSync();
            resolve(PORT);
            startPromise = null;
        });
        httpServer.on('error', (error) => {
            console.error('[SERVER] Failed to start server:', error);
            httpServer = null;
            startPromise = null;
            reject(error);
        });
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
