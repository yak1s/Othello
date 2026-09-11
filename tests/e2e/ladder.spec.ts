import { expect, test } from '@playwright/test';

/**
 * The levels are earned, not chosen. The unit tests in src/data/ladder.test.ts
 * cover the rule; this covers the thing the rule exists for — that a locked
 * level cannot be started, that it says why, and that beating the level you are
 * on genuinely opens the next one and remembers it across a reload.
 */

/** A real game, one move from a 50–14 win for Black, who is the player here. */
const ALMOST_WON =
  'f5d6c4f4e6d3c7g6g3g4g5e7e3c5g7f2d2b4a4a3f7e2a2c6f6d1g1h5f8e8c1b5d7a6b6d8c2h2g2'
  + 'b8e1c3b3b2f1h8c8a5h4f3g8h6a1a7b1h3h7b7h1';
const WINNING_MOVE = 'a8';

async function seed(page: import('@playwright/test').Page, unlockedLevel: number, saved = false): Promise<void> {
  // Seeded once, not on every navigation: a reload has to read back what the
  // app itself wrote, which is the whole point of the last assertion below.
  await page.addInitScript(([level, withGame, transcript]) => {
    if (localStorage.getItem('kissa:settings:v1')) return;
    localStorage.setItem('kissa:settings:v1', JSON.stringify({
      version: 1, unlockedLevel: level, lastLevel: level, sound: false, motion: 'reduced',
    }));
    if (withGame) {
      localStorage.setItem('kissa:in-progress:v1', JSON.stringify({
        transcript, variant: 'standard', mode: 'computer', opponent: level,
        playerColor: 0, startedAt: Date.now(), savedAt: Date.now(),
      }));
    }
  }, [unlockedLevel, saved, ALMOST_WON] as const);
}

test('only the first level is open on a fresh install', async ({ page }) => {
  await seed(page, 1);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play the computer' }).click();

  await expect(page.getByText('Beat a level to open the next one. 1 of 6 so far.')).toBeVisible();
  await expect(page.locator('.sheet .row[data-unavailable="true"]')).toHaveCount(5);
  await expect(page.locator('.sheet .row:not([data-unavailable])')).toHaveCount(1);

  // The row is a real button, so a screen reader is told what a sighted person
  // is told: it explains itself rather than going quiet.
  const casual = page.locator('.sheet .row[data-unavailable="true"]').first();
  await expect(casual).toHaveAccessibleName('2. Casual. Beat Beginner to open this.');
  await expect(casual).toBeEnabled();

  await casual.click();
  await expect(page.locator('.toast')).toHaveText('Beat Beginner to open this.');
  // And it did not start a game.
  await expect(page.locator('.sheet__title')).toHaveText('Play the computer');
});

test('progress opens the levels below it and no more', async ({ page }) => {
  await seed(page, 4);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play the computer' }).click();

  await expect(page.getByText('Beat a level to open the next one. 4 of 6 so far.')).toBeVisible();
  await expect(page.locator('.sheet .row:not([data-unavailable])')).toHaveCount(4);
  await expect(page.locator('.sheet .row[data-unavailable="true"]')).toHaveCount(2);
});

test('beating the level you are on opens the next one, and it survives a reload', async ({ page }) => {
  await seed(page, 1, true);
  await page.goto('/');

  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.locator('.board')).toBeVisible();

  await page.getByRole('gridcell', { name: `${WINNING_MOVE}, empty, legal move` }).click();

  // The game-over sheet carries the result and the unlock, in that order.
  await expect(page.locator('.sheet__title')).toHaveText('You win, 50–14.', { timeout: 20_000 });
  await expect(page.locator('.sheet')).toContainText('Level 2, Casual, is now open.');

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('kissa:settings:v1') ?? '{}').unlockedLevel);
  expect(stored).toBe(2);

  await page.reload();
  await page.getByRole('button', { name: 'Play the computer' }).click();
  await expect(page.locator('.sheet .row:not([data-unavailable])')).toHaveCount(2);
  await expect(page.locator('.sheet .row[data-unavailable="true"]').first())
    .toHaveAccessibleName('3. Club. Beat Casual to open this.');
});
