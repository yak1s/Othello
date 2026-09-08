// Generates the app icons. The source is one SVG; the PNGs the manifest needs
// are rasterised through the Chromium that is already here for screenshots,
// which keeps the project's zero-dependency rule intact.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
  .find((p) => existsSync(p));
const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const INK = '#16171A';
const BONE = '#F2EDE1';
const BAIZE = '#2F5D50';
const LACQUER = '#3B2A22';

/**
 * One disc, split on the diagonal: the mark of the game itself, and the only
 * thing that still reads at 16px. `inset` is the fraction of the canvas kept
 * clear for a maskable icon's safe zone.
 */
function icon({ size, inset = 0, frame = true }) {
  const pad = size * inset;
  const inner = size - pad * 2;
  const r = inner * 0.31;
  const cx = size / 2;
  const cy = size / 2;
  const border = frame ? Math.max(1, inner * 0.045) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BAIZE}"/>
  ${frame ? `<rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" fill="none" stroke="${LACQUER}" stroke-width="${border}"/>` : ''}
  <clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  <g clip-path="url(#disc)">
    <rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${BONE}"/>
    <path d="M ${cx - r} ${cy + r} L ${cx + r} ${cy - r} L ${cx + r} ${cy + r} Z" fill="${INK}"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${LACQUER}" stroke-width="${Math.max(1, r * 0.05)}"/>
</svg>`;
}

writeFileSync(new URL('icon.svg', OUT), icon({ size: 512 }));
writeFileSync(new URL('maskable.svg', OUT), icon({ size: 512, inset: 0.1, frame: false }));

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
for (const [name, size, svg] of [
  ['icon-192.png', 192, icon({ size: 192 })],
  ['icon-512.png', 512, icon({ size: 512 })],
  ['maskable-512.png', 512, icon({ size: 512, inset: 0.1, frame: false })],
  ['apple-touch-icon.png', 180, icon({ size: 180 })],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  const shot = await page.screenshot({ omitBackground: false });
  writeFileSync(new URL(name, OUT), shot);
  await page.close();
  console.log(`${name} ${size}x${size} ${(shot.length / 1024).toFixed(1)} KB`);
}
await browser.close();
