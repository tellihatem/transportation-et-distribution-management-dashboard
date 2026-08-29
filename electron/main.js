import { app, BrowserWindow, utilityProcess } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'dist-server', 'index.js');
const errorPage = path.join(__dirname, 'error.html');

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

// One instance only. Two copies racing the same database file could
// interleave the quarantine/create/stamp sequence in database.ts, and the
// loser would sit on a locked file. A second launch just focuses the first.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// --- Resolve .env for packaged vs development ---
function loadEnvConfig() {
  const isPackaged = app.isPackaged;

  if (isPackaged) {
    // In a packaged app, extraResources are placed next to the app.asar
    // e.g. on Windows: resources/.env  (same level as app.asar)
    const resourcesDir = process.resourcesPath;
    const envPath = path.join(resourcesDir, '.env');

    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
      console.log(`[MAIN] Loaded .env from ${envPath}`);
    } else {
      console.warn(`[MAIN] .env not found at ${envPath} — running with defaults`);
    }

    // Set cwd to userData so the app has a writable working directory
    process.chdir(app.getPath('userData'));
  } else {
    // Development: load .env from project root via dotenv-compatible parsing
    const envPath = path.join(projectRoot, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    process.chdir(projectRoot);
  }
}

loadEnvConfig();

// Last-resort visibility. Under Electron's Node an unhandled rejection kills
// the process; at minimum the reason must land in the support log first.
process.on('unhandledRejection', (reason) => {
  console.error('[MAIN] Unhandled rejection:', reason);
  try { writeCrashLog(reason); } catch { /* logging must never throw */ }
});
process.on('uncaughtException', (error) => {
  console.error('[MAIN] Uncaught exception:', error);
  try { writeCrashLog(error); } catch { /* logging must never throw */ }
});

/**
 * Write a startup/runtime failure where support can find it, and return the
 * log path ('' if userData was unwritable).
 */
function writeCrashLog(error) {
  const details = [
    `time     : ${new Date().toISOString()}`,
    `version  : ${app.getVersion()} (packaged: ${app.isPackaged})`,
    `database : ${process.env.DATABASE_PATH || '(unset)'}`,
    `userData : ${app.getPath('userData')}`,
    '',
    String(error?.stack || error),
  ].join(String.fromCharCode(10));
  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log');
    fs.writeFileSync(logPath, details, 'utf-8');
    return logPath;
  } catch {
    return '';
  }
}

/** Show the error page with the failure's details on it. */
async function showErrorPage(error) {
  const logPath = writeCrashLog(error);
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({ width: 760, height: 560, show: false });
  }
  await mainWindow
    .loadFile(errorPage, {
      query: { message: String(error?.message || error), log: logPath },
    })
    .catch(() => {});
  mainWindow.show();
}

/**
 * Start the API server in its own utilityProcess.
 *
 * The server used to be imported in-process, which put every synchronous
 * SQLite statement on the Electron main thread — the thread Windows routes
 * keyboard input through. Under load the page kept painting while keystrokes
 * queued, which read as the app "freezing until Ctrl+R". In a child process,
 * no amount of SQL can delay input again. The child posts { port } when it is
 * listening (server/index.ts), and the port-fallback behaviour is unchanged.
 */
function startBackend() {
  if (!process.env.DATABASE_PATH) {
    // logistics.v2.db — deliberately NOT the historical logistics.db.
    //
    // Builds before August 2026 re-seeded demo records into any empty
    // logistics.db at startup, so as long as an old executable might launch
    // on a machine, that filename can never be trusted again. This build uses
    // a filename no old binary knows, so old code cannot write into it, and
    // server/database.ts refuses to open any file that lacks the provenance
    // stamp of the current DB_EPOCH. The old logistics.db, if present, is
    // left untouched as an archive.
    process.env.DATABASE_PATH = path.join(app.getPath('userData'), 'logistics.v2.db');
  }

  // app.getVersion() is authoritative for what was actually installed, so it
  // wins over the version baked into the bundle at build time.
  process.env.APP_VERSION = app.getVersion();

  // Logged on every start so a support question ("which build is this, and
  // which database is it reading?") is answerable from the console alone.
  console.log(`[MAIN] ${app.getName()} v${app.getVersion()} (packaged: ${app.isPackaged})`);
  console.log(`[MAIN] userData: ${app.getPath('userData')}`);
  console.log(`[MAIN] database: ${process.env.DATABASE_PATH}`);

  if (!fs.existsSync(serverEntry)) {
    return Promise.reject(new Error(`Server script not found at ${serverEntry}. Did you build the server?`));
  }

  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(serverEntry, [], {
      serviceName: 'logistics-api',
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_PATH: process.env.DATABASE_PATH,
        APP_VERSION: process.env.APP_VERSION,
      },
    });
    serverProcess = child;

    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    // A server that says nothing within this window is stuck, not slow —
    // even a cold first boot (migrations included) finishes in seconds.
    const timer = setTimeout(
      () => settle(reject, new Error('The local server did not report a port within 30s.')),
      30000
    );

    child.on('message', (msg) => {
      if (msg && msg.type === 'server-listening') {
        console.log(`[MAIN] server child pid ${child.pid} listening on port ${msg.port}`);
        settle(resolve, msg.port);
      } else if (msg && msg.type === 'server-failed') {
        settle(reject, new Error(msg.message || 'The local server failed to start.'));
      }
    });

    child.on('exit', (code) => {
      serverProcess = null;
      // Exit before the port message is a startup failure (the reject reaches
      // createWindow's caller, which shows the error page). Exit afterwards,
      // while the app is running, means the backend died under the window —
      // surface that instead of leaving every request to time out.
      const startedBeforeExit = settled;
      settle(reject, new Error(`The local server exited with code ${code} before starting.`));
      if (startedBeforeExit && !isQuitting) {
        const error = new Error(`The local server process exited unexpectedly (code ${code}).`);
        console.error('[MAIN]', error.message);
        void showErrorPage(error);
      }
    });
  });
}

async function stopBackend() {
  const child = serverProcess;
  if (!child) return;
  serverProcess = null;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

async function createWindow() {
  const port = await startBackend();

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    // Version in the title bar and taskbar hover, so the running build can be
    // identified without opening anything. app.getName() is used rather than a
    // literal because this file is outside the Vite bundle and cannot import
    // src/strings.ts, where all other user-visible text lives.
    title: `${app.getName()} v${app.getVersion()}`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Chromium throttles timers and animation frames in a window it thinks
      // nobody is looking at — minimised, fully covered by another window, or
      // on a machine that has gone to sleep. This is a dashboard someone
      // leaves open all day behind other windows, and coming back to a page
      // whose timers stopped is how it ends up feeling stuck. Keep it running.
      backgroundThrottling: false,
    },
  });

  // Without this the <title> in index.html immediately overwrites the above.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.maximize();
  await mainWindow.loadURL(`http://localhost:${port}`);
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function quitApp() {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  try {
    await stopBackend();
  } catch (error) {
    // Quitting must never be blocked by a shutdown error, but it must not
    // escape as an unhandled rejection either.
    console.error('[MAIN] stopBackend failed during quit:', error);
  } finally {
    app.quit();
  }
}

app.whenReady().then(async () => {
  if (!hasInstanceLock) return; // second instance — quitting

  try {
    await createWindow();
  } catch (error) {
    console.error('Failed to start local server:', error);
    // The backend starts BEFORE the window is created, so a failure here may
    // mean no window exists yet — showErrorPage creates one and puts the
    // reason on screen plus into startup-error.log for support.
    await showErrorPage(error);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Without the catch, a rejection here escapes the event handler and —
      // with no process-level handler — kills the whole app silently.
      await createWindow().catch((error) => showErrorPage(error));
    }
  });
});

app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    void quitApp();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void quitApp();
  }
});
