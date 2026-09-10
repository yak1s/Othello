// Drives the real app and screenshots named states, so a design review looks at
// what ships rather than at a mock. Usage: node scripts/shoot-app.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
  .find((p) => existsSync(p));
const OUT = '.design/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const shot = async (name) => {
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${name}`);
};

await shot('home');

await page.getByRole('button', { name: 'Pass & play' }).click();
await page.waitForTimeout(300);
await shot('game-open');

// Play a handful of moves so the board is not just the opening four.
for (const square of ['d3', 'c5', 'b6', 'c3', 'd2']) {
  const cell = page.locator(`.cell[aria-label^="${square},"]`);
  if (await cell.count()) { await cell.click({ force: true }); await page.waitForTimeout(700); }
}
await shot('game-played');

// Coordinates on, so the frame labels get reviewed too.
await page.evaluate(() => document.querySelector('.board')?.setAttribute('data-coords', 'true'));
await shot('game-coords');

await page.locator('[data-thumb="more"]').click();
await shot('sheet-more');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('[data-thumb="moves"]').click();
await shot('sheet-moves');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('.topbar__back').click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Settings' }).click();
await shot('sheet-settings');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.getByRole('button', { name: 'How to play' }).click();
await shot('sheet-help');

await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// The multiplayer sheet, with the code and the QR we encode ourselves.
await page.getByRole('button', { name: 'Play a friend' }).click();
await page.getByRole('button', { name: 'Start a game' }).click();
await page.waitForTimeout(500);
await shot('sheet-friend');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// The other two felts, on a played-out board.
for (const felt of ['slate', 'sand']) {
  await page.evaluate((f) => { document.documentElement.dataset.felt = f; }, felt);
  await page.getByRole('button', { name: 'Pass & play' }).click();
  await page.waitForTimeout(300);
  for (const square of ['d3', 'c5', 'b6', 'c3', 'd2']) {
    const cell = page.locator(`.cell[aria-label^="${square},"]:not([disabled])`);
    if (await cell.count()) { await cell.click({ force: true }); await page.waitForTimeout(700); }
  }
  await shot(`felt-${felt}`);
  await page.locator('.topbar__back').click();
  await page.waitForTimeout(400);
}

console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join('\n')}` : '\nno console errors');
await browser.close();
