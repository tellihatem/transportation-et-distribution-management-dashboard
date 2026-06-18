const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'dist-server');
const packageJsonPath = path.join(outDir, 'package.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(packageJsonPath, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
