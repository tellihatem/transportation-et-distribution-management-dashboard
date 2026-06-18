import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(projectRoot, 'dist-server', 'index.js');
const errorPage = path.join(__dirname, 'error.html');

process.chdir(projectRoot);

let mainWindow = null;
let serverModule = null;
let isQuitting = false;

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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
