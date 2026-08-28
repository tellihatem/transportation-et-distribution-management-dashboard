import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'dist-server', 'index.js');
const errorPage = path.join(__dirname, 'error.html');

let mainWindow = null;
let serverModule = null;
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

function getServerApi(mod) {
  return mod?.startServer ? mod : mod?.default ?? {};
}

async function loadServerModule() {
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Server script not found at ${serverEntry}. Did you build the server?`);
  }

  if (!serverModule) {
    serverModule = await import(pathToFileURL(serverEntry).href);
  }

  return getServerApi(serverModule);
}

async function startBackend() {
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

  const { startServer } = await loadServerModule();
  if (typeof startServer !== 'function') {
    throw new Error('Compiled server module does not export startServer().');
  }

  return startServer();
}

async function stopBackend() {
  if (!serverModule) {
    return;
  }

  const api = getServerApi(serverModule);
  if (typeof api.stopServer === 'function') {
    await api.stopServer();
  }
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

    // The 1.13.0 field failure ("تعذر تشغيل الخادم المحلي" on the client's
    // machine) took a debugging session to diagnose because this screen said
    // nothing about the cause — the real error (EADDRINUSE on port 3001) was
    // only in a console nobody sees. The failure now travels with its details:
    // written to a log file support can ask for by name, and handed to the
    // error page so the reason is on the screen itself.
    const details = [
      `time     : ${new Date().toISOString()}`,
      `version  : ${app.getVersion()} (packaged: ${app.isPackaged})`,
      `database : ${process.env.DATABASE_PATH || '(unset)'}`,
      `userData : ${app.getPath('userData')}`,
      ``,
      String(error?.stack || error),
    ].join(String.fromCharCode(10));

    let logPath = '';
    try {
      logPath = path.join(app.getPath('userData'), 'startup-error.log');
      fs.writeFileSync(logPath, details, 'utf-8');
    } catch {
      logPath = ''; // userData unwritable: the on-screen copy still shows everything
    }

    // The backend starts BEFORE the window is created, so a database error
    // means no window exists yet — without this the app would keep running
    // invisibly with nothing on screen and no way to see what went wrong.
    if (!mainWindow) {
      mainWindow = new BrowserWindow({ width: 760, height: 560, show: false });
    }
    await mainWindow
      .loadFile(errorPage, {
        query: { message: String(error?.message || error), log: logPath },
      })
      .catch(() => {});
    mainWindow.show();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
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
