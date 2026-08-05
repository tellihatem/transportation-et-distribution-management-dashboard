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
    process.env.DATABASE_PATH = path.join(app.getPath('userData'), 'logistics.db');
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
  try {
    await createWindow();
  } catch (error) {
    console.error('Failed to start local server:', error);
    if (mainWindow) {
      await mainWindow.loadFile(errorPage).catch(() => {});
      mainWindow.show();
    }
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
