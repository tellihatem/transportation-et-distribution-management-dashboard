/**
 * Express.js Backend Server — Logistics Financial Dashboard
 * 
 * Serves REST API on port 3001
 * Local SQLite database with Supabase cloud replication
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from 'dotenv';
import fs from 'fs';

// Load .env from project root
config({ path: path.resolve(process.cwd(), '.env') });

import db, { runMigrations, DATABASE_FILE, QUARANTINED_FILE, getDbProvenance, listOtherDatabaseFiles } from './database';
import { APP_VERSION, BUILD_ID, BUILD_TIME, GIT_COMMIT } from './build-info';
import { errorHandler } from './middleware/error-handler';
import { processSyncQueue } from './sync/replicator';

// Route imports
import authRouter from './routes/auth';
import tripsRouter from './routes/trips';
import resalesRouter from './routes/resales';
import expensesRouter from './routes/expenses';
import syncRouter from './routes/sync';
import backupRouter from './routes/backup';
import ledgerAuditRouter from './routes/ledger-audit';
import clientPaymentsRouter from './routes/client-payments';
import driverPaymentsRouter from './routes/driver-payments';
import { supplierPaymentsRouter, supplierInvoicesRouter } from './routes/suppliers';

const app = express();
// The port to try first. The dev frontend proxies to 3001, so that stays the
// preference — but it is only a preference: see startServer().
const PREFERRED_PORT = parseInt(process.env.PORT || '3001', 10);

/** The port actually bound. 0 until the server is listening. */
let boundPort = 0;

let httpServer: import('http').Server | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let initialSyncTimeout: NodeJS.Timeout | null = null;
let startPromise: Promise<number> | null = null;

function startBackgroundSync(): void {
  if (syncInterval) return;

  const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL_MS || '300000', 10);
  syncInterval = setInterval(async () => {
    try {
      const result = await processSyncQueue();
      if (result.processed > 0 || result.failed > 0) {
        console.log(`[SCHEDULER] Sync queue processed: ${result.processed} ok, ${result.failed} failed`);
      }
    } catch (error) {
      console.error('[SCHEDULER] Sync queue processing error:', error);
    }
  }, SYNC_INTERVAL);

  initialSyncTimeout = setTimeout(async () => {
    try {
      await processSyncQueue();
    } catch (error) {
      console.error('[SCHEDULER] Initial sync queue processing error:', error);
    }
  }, 5000);
}

function stopBackgroundSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (initialSyncTimeout) {
    clearTimeout(initialSyncTimeout);
    initialSyncTimeout = null;
  }
}

function closeDatabase(): void {
  try {
    db.close();
  } catch (error) {
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

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));

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

console.log(`[SERVER] Version ${APP_VERSION} (build ${BUILD_ID})`);
runMigrations();
console.log(`[DB] Using database file: ${DATABASE_FILE}`);
{
  // Where this database came from, printed on every start. If unexpected
  // records ever appear again, this log names the file, the build that
  // created it, and any other database files sitting beside it.
  const provenance = getDbProvenance();
  console.log(`[DB] Created ${provenance.created_at} by v${provenance.created_by_version} (epoch ${provenance.epoch})`);
  if (QUARANTINED_FILE) {
    console.warn(`[DB] A pre-epoch database was moved aside this start: ${QUARANTINED_FILE}`);
  }
  const others = listOtherDatabaseFiles();
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
  const counts: Record<string, number> = {};
  for (const table of ['client_trips', 'material_resales', 'expenses']) {
    counts[table] = (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as any).c;
  }

  res.json({
    success: true,
    service: 'logistics-dashboard-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    appVersion: APP_VERSION,
    buildId: BUILD_ID,
    buildTime: BUILD_TIME,
    gitCommit: GIT_COMMIT,
    databaseFile: DATABASE_FILE,
    databaseProvenance: getDbProvenance(),
    otherDatabaseFiles: listOtherDatabaseFiles(),
    recordCounts: counts,
  });
});

// --- API Routes ---
// Auth is disabled: this app is deployed to a single trusted client machine,
// so there's no login gate in front of /api/* (routes/auth.ts and AuthGate.tsx
// are still here, unused, if a login gate is ever needed again).
app.use('/api/auth', authRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/resales', resalesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/client-payments', clientPaymentsRouter);
app.use('/api/driver-payments', driverPaymentsRouter);
app.use('/api/supplier-payments', supplierPaymentsRouter);
app.use('/api/supplier-invoices', supplierInvoicesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/backup', backupRouter);
app.use('/api/health/ledger-audit', ledgerAuditRouter);

// --- Serve React Frontend (Electron/Production mode) ---
// Resolved relative to this compiled module (dist-server/index.js), not
// process.cwd() — in the packaged Electron app, main.js chdir()s to the
// userData directory before loading this module, so cwd cannot be used to
// locate the sibling dist/ folder (same reasoning as runMigrations() in
// database.ts).
const distPath = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// --- Error Handler (must be last) ---
app.use(errorHandler);

// --- Start Server Function ---
/**
 * Bind one port, resolving with the port actually taken, or reject.
 *
 * Port 0 asks the operating system for any free port, which is what makes the
 * retry in startServer() always succeed.
 */
function listenOn(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      httpServer = server;
      boundPort = (server.address() as import('net').AddressInfo).port;
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
export function startServer(): Promise<number> {
  if (httpServer) {
    return Promise.resolve(boundPort);
  }

  if (startPromise) {
    return startPromise;
  }

  const announce = (port: number) => {
    console.log(`[SERVER] ✅ API running on http://localhost:${port}`);
    console.log(`[SERVER] 📡 Health: http://localhost:${port}/api/health`);
    console.log('[SERVER] ─────────────────────────────────────────────────');
    console.log();
    startBackgroundSync();
    startPromise = null;
    return port;
  };

  const giveUp = (error: unknown) => {
    console.error('[SERVER] Failed to start server:', error);
    httpServer = null;
    startPromise = null;
    throw error;
  };

  startPromise = listenOn(PREFERRED_PORT)
    .then(announce)
    .catch((error: NodeJS.ErrnoException) => {
      if (error?.code !== 'EADDRINUSE') return giveUp(error);
      console.warn(`[SERVER] Port ${PREFERRED_PORT} is in use; asking the system for a free one.`);
      return listenOn(0).then(announce).catch(giveUp);
    });

  return startPromise;
}

export async function stopServer(): Promise<void> {
  stopBackgroundSync();

  if (!httpServer) {
    closeDatabase();
    return;
  }

  await new Promise<void>((resolve, reject) => {
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

export default app;
