/**
 * Generates build/icon.ico (multi-resolution) from the company logo,
 * for use as the Electron app/installer icon.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'assets', 'canvas.png');
const outDir = path.join(root, 'build');
const outFile = path.join(outDir, 'icon.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const buffers = await Promise.all(
    sizes.map(size =>
      sharp(src)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(buffers);
  fs.writeFileSync(outFile, ico);
  console.log(`[icon] Wrote ${outFile} (${sizes.join(', ')}px)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
