// Generates icons/icon.svg and the PNG icons. Run: node scripts/make-icons.mjs
// Uses the Playwright Chromium that's available in the dev environment.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

function mark(scale = 1) {
  // 2×2 tiles with printed offset shadows: blank, black square, blank, solved (green).
  const t = 150 * scale, gap = 22 * scale, sh = 16 * scale, bw = 14 * scale, r = 10 * scale;
  const size = 2 * t + gap;
  const x0 = (512 - size - sh) / 2, y0 = x0;
  const tiles = [
    [0, 0, '#ffffff'], [1, 0, '#111111'], [0, 1, '#ffffff'], [1, 1, '#2F9E5B'],
  ];
  return tiles.map(([cx, cy, fill]) => {
    const x = x0 + cx * (t + gap), y = y0 + cy * (t + gap);
    return `<rect x="${x + sh}" y="${y + sh}" width="${t}" height="${t}" rx="${r}" fill="#111111"/>` +
      `<rect x="${x + bw / 2}" y="${y + bw / 2}" width="${t - bw}" height="${t - bw}" rx="${r}" fill="${fill}" stroke="#111111" stroke-width="${bw}"/>`;
  }).join('');
}
const svg = (scale, rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
  `<rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="#ffffff"/>${mark(scale)}</svg>`;

writeFileSync('icons/icon.svg', svg(1, true) + '\n');
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(markup, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${markup.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.locator('svg').screenshot({ path: file, omitBackground: false });
}
await png(svg(1, false), 192, 'icons/icon-192.png');
await png(svg(1, false), 512, 'icons/icon-512.png');
await png(svg(0.78, false), 512, 'icons/icon-maskable-512.png'); // safe zone for maskable
await png(svg(0.9, false), 180, 'icons/apple-touch-icon.png');
await browser.close();
console.log('Icons written to icons/');
