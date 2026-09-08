// The two screenshots the manifest advertises. Taken from the running app, so
// an install prompt shows what the app actually looks like.
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
  .find((p) => existsSync(p));
mkdirSync(new URL('../public/screenshots/', import.meta.url), { recursive: true });

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
for (const [name, width, height] of [['phone', 390, 844], ['wide', 1280, 800]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Pass & play' }).click();
  for (const square of ['d3', 'c5', 'b6', 'c3', 'd2', 'e2']) {
    const cell = page.locator(`.cell[aria-label^="${square},"]`);
    if (await cell.count()) { await cell.click({ force: true }); await page.waitForTimeout(650); }
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `public/screenshots/${name}.png` });
  await page.close();
  console.log(`${name}.png ${width}x${height}`);
}
await browser.close();
