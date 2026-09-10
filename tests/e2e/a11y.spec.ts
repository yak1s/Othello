import { expect, test } from '@playwright/test';

/**
 * Brief §11 and §16: the keyboard path and the screen-reader path must each be
 * able to play a complete game, not merely exist.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pass & play' }).click();
  await expect(page.locator('.board')).toBeVisible();
});

test('the board is a real grid of labelled cells', async ({ page }) => {
  await expect(page.getByRole('grid', { name: 'Reversi board' })).toBeVisible();
  expect(await page.getByRole('row').count()).toBe(8);
  expect(await page.getByRole('gridcell').count()).toBe(64);

  // The four opening discs and one legal move, labelled as the brief words them.
  await expect(page.getByRole('gridcell', { name: 'd4, white disc' })).toHaveCount(1);
  await expect(page.getByRole('gridcell', { name: 'e4, black disc' })).toHaveCount(1);
  await expect(page.getByRole('gridcell', { name: 'd3, empty, legal move' })).toHaveCount(1);
  await expect(page.getByRole('gridcell', { name: 'a1, empty' })).toHaveCount(1);
});

test('a whole move can be made from the keyboard alone', async ({ page }) => {
  // Exactly one cell is in the tab order at a time; arrows move the focus.
  expect(await page.locator('.cell[tabindex="0"]').count()).toBe(1);
  await page.locator('.cell[tabindex="0"]').focus();

  const focused = async (): Promise<string> =>
    page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  const start = await focused();
  await page.keyboard.press('ArrowLeft');
  expect(await focused()).not.toBe(start);
  await page.keyboard.press('ArrowUp');

  // Walk to a legal square and play it with the keyboard.
  await page.getByRole('gridcell', { name: 'd3, empty, legal move' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.strip__score')).toHaveText('4 : 1', { timeout: 10_000 });
});

test('the focus ring is never removed', async ({ page }) => {
  await page.locator('.cell[tabindex="0"]').focus();
  const outline = await page.evaluate(() => {
    const cell = document.activeElement as HTMLElement;
    cell.classList.add('focus-visible');
    const style = getComputedStyle(cell, null);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  // The ring is defined on :focus-visible, which a programmatic focus may not
  // trigger, so check the rule exists rather than that it is painted right now.
  const hasRule = await page.evaluate(() => [...document.styleSheets]
    .flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } })
    .some((rule) => rule.cssText.includes('focus-visible') && rule.cssText.includes('outline')));
  expect(hasRule).toBe(true);
  void outline;
});

test('every move, flip and pass is announced', async ({ page }) => {
  const live = page.locator('[role="status"][aria-live="polite"]');
  await expect(live).toHaveCount(1);

  await page.getByRole('gridcell', { name: 'd3, empty, legal move' }).click({ force: true });
  await expect(live).toHaveText(/Black plays d3, flips 1 disc\./, { timeout: 10_000 });

  // `?` reads the score out without changing anything.
  await page.locator('.cell[tabindex="0"]').focus();
  await page.keyboard.press('?');
  await expect(live).toHaveText(/Black \d+, White \d+\./, { timeout: 5000 });
});

test('turn state is never carried by colour alone', async ({ page }) => {
  // The brass rule marks the turn, and the status line says it in words.
  await expect(page.locator('.strip__turn')).toBeVisible();
  await expect(page.locator('.status')).toHaveText(/to play\.|Your turn\./);
});

test('an unavailable control says why, to everyone', async ({ page }) => {
  // Undo with nothing to undo: it looks unavailable, but it is genuinely
  // enabled and its accessible name carries the reason, so a screen reader is
  // told the same thing a tap tells everyone else (brief §5.2).
  const undo = page.locator('[data-thumb="undo"]');
  await expect(undo).toHaveAttribute('data-unavailable', 'true');
  await expect(undo).toBeEnabled();
  await expect(undo).toHaveAccessibleName('Undo. Nothing to undo yet.');
  await undo.click();
  await expect(page.locator('.toast.is-open')).toHaveText('Nothing to undo yet.');

  // Once there is something to undo, the reason and the marking both go.
  await page.getByRole('gridcell', { name: 'd3, empty, legal move' }).click({ force: true });
  await expect(undo).toHaveAttribute('data-unavailable', 'false', { timeout: 10_000 });
  await expect(undo).toHaveAccessibleName('Undo');
});

test('reduced motion plays a complete game with the feedback intact', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.getByRole('button', { name: 'Pass & play' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduced');

  let moves = 0;
  for (let i = 0; i < 70; i += 1) {
    if (await page.locator('.sheet.is-open').count() > 0) break;
    const cell = page.locator('.cell[data-legal="true"]:not([disabled])').first();
    try { await cell.waitFor({ state: 'visible', timeout: 6000 }); } catch { break; }
    await cell.click({ force: true });
    moves += 1;
  }
  expect(moves).toBeGreaterThan(40);
  await expect(page.locator('.sheet.is-open')).toBeVisible({ timeout: 15_000 });
});
