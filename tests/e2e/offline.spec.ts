import { expect, test, type Page } from '@playwright/test';

/** Click legal squares until the game ends, waiting for the board to be ready
    between moves rather than guessing at the animation length. */
async function playToTheEnd(page: Page, limit = 70): Promise<number> {
  let moves = 0;
  for (let i = 0; i < limit; i += 1) {
    if (await page.locator('.sheet.is-open').count() > 0) break;
    const cell = page.locator('.cell[data-legal="true"]:not([disabled])').first();
    try {
      await cell.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      break;
    }
    await cell.click({ force: true });
    moves += 1;
  }
  return moves;
}

/**
 * The brief's headline promise: a full game with the network disabled. This
 * plays one out with the browser genuinely offline, served by the worker.
 */
test('plays a full game with the network switched off', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Let the worker finish precaching before the network goes away.
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Kissa' })).toBeVisible();
  await page.getByRole('button', { name: 'Pass & play' }).click();
  await expect(page.locator('.board')).toBeVisible();

  const moves = await playToTheEnd(page);
  expect(moves).toBeGreaterThan(40);

  // The game-over sheet is the proof it played to a finish.
  await expect(page.locator('.sheet.is-open')).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('.sheet__title').textContent())
    .toMatch(/wins, \d+–\d+\.|Draw, \d+–\d+\./);

  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
});

test('serves every asset from the cache, not the network', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await context.setOffline(true);

  const failed: string[] = [];
  page.on('requestfailed', (request) => failed.push(request.url()));
  await page.reload();
  await expect(page.locator('.row').first()).toBeVisible();
  // A single miss here means the app is broken offline on any host that sets
  // Vary on static assets, which is how this was caught the first time.
  expect(failed).toEqual([]);
});

test('computes the board before first paint, so nothing shifts', async ({ page }) => {
  await page.goto('/');
  const shift = await page.evaluate(() => new Promise<number>((resolve) => {
    let total = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) total += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve(total), 2000);
  }));
  expect(shift).toBeLessThan(0.01);
});
