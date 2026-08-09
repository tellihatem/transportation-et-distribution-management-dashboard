const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'dist-server');

fs.mkdirSync(outDir, { recursive: true });

// 1. Write dist-server/package.json so Node treats .js files as CommonJS
const packageJsonPath = path.join(outDir, 'package.json');
fs.writeFileSync(packageJsonPath, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log(`[build] Wrote ${packageJsonPath}`);

// 2. Copy server/migrations/ into dist-server/migrations/ so they are packaged with the app
const srcMigrations = path.join(root, 'server', 'migrations');
const destMigrations = path.join(outDir, 'migrations');

if (fs.existsSync(srcMigrations)) {
  fs.rmSync(destMigrations, { recursive: true, force: true });
  fs.cpSync(srcMigrations, destMigrations, { recursive: true });
  console.log(`[build] Copied ${srcMigrations} → ${destMigrations}`);
} else {
  console.warn(`[build] WARNING: ${srcMigrations} does not exist — migrations will be missing`);
}

// 3. Stamp the build so a running app can say exactly which build it is.
//
// Two installers built minutes apart used to be indistinguishable — same
// version, same filename, nothing on screen — which is how a stale copy
// reached a client unnoticed. The stamp below travels with the app.
//
// This lives here rather than in an electron-builder `--extraMetadata` flag
// because build:server runs on BOTH passes of the AV-lock fallback in
// release-win.ps1; a CLI flag would have to be added to each one, and
// forgetting the second is the same class of mistake being fixed.
const { execSync } = require('child_process');

function git(args, fallback) {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return fallback;
  }
}

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const gitCommit = git('rev-parse --short HEAD', 'nogit');
const dirty = git('status --porcelain', '') !== '';
const buildTime = process.env.BUILD_TIME || new Date().toISOString();

// e.g. 20260805-2143-ff55a50 (+"-dirty" when built from an uncommitted tree)
const stamp = buildTime.replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const buildId = process.env.BUILD_ID || `${stamp}-${gitCommit}${dirty ? '-dirty' : ''}`;

const buildInfoPath = path.join(outDir, 'build-info.json');
fs.writeFileSync(
  buildInfoPath,
  JSON.stringify({ version, buildId, buildTime, gitCommit, dirty }, null, 2) + '\n'
);
console.log(`[build] Wrote ${buildInfoPath} — v${version} (${buildId})`);
