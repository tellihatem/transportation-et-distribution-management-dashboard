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

import db, { runMigrations, DATABASE_FILE } from './database';
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
import clientPaymentsRouter from './routes/client-payments';
import driverPaymentsRouter from './routes/driver-payments';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

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

// Health check (public, no auth — used for uptime monitoring).
//
// Reports which build is running and which database file it opened. Both
// questions used to be unanswerable on a machine we cannot inspect, which is
// how a stale install kept showing records that had already been removed.
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
app.use('/api/sync', syncRouter);
app.use('/api/backup', backupRouter);

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
export function startServer(): Promise<number> {
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
