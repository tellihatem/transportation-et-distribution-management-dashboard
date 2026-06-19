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
