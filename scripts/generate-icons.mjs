// Render the PWA / Apple icons from public/favicon.svg with sharp, so every
// icon is the same drawing as the favicon and the in-app brand mark.
//   pwa-192x192.png, pwa-512x512.png  — rounded icon (transparent corners)
//   pwa-maskable-512x512.png          — full-bleed background for Android masks
//   apple-touch-icon.png (180)        — full-bleed; iOS applies its own corners
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');

// Same drawing with square corners, for targets that mask the icon themselves.
const fullBleed = svg.replace('rx="15"', 'rx="0"');

const targets = [
  { name: 'pwa-192x192.png', size: 192, source: svg },
  { name: 'pwa-512x512.png', size: 512, source: svg },
  { name: 'pwa-maskable-512x512.png', size: 512, source: fullBleed },
  { name: 'apple-touch-icon.png', size: 180, source: fullBleed },
];

for (const { name, size, source } of targets) {
  const png = await sharp(Buffer.from(source), { density: Math.ceil((72 * size) / 64) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(publicDir, name), png);
  console.log(`generated ${name} (${size}x${size})`);
}
