import { expect, test, type Page } from '@playwright/test';

/**
 * Two tabs, one real WebRTC data channel, and no signalling service at all: the
 * offer and answer are carried between the pages by the test, which is exactly
 * what the manual fallback asks a person to do. It exercises the real
 * transport, the real session and the real rules engine on both sides.
 *
 * The trystero path needs live relays, so it is not covered here; this covers
 * the part that is ours.
 */
test('two peers play in sync over a hand-exchanged connection', async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const guest = await context.newPage();
  await host.goto('/');
  await guest.goto('/');

  await host.getByRole('button', { name: 'Play a friend' }).click();
  await host.getByRole('button', { name: 'Start a game' }).click();
  await host.getByRole('button', { name: 'Enter codes manually' }).click();

  const hostOffer = host.locator('textarea[readonly]');
  await expect(hostOffer).not.toBeEmpty({ timeout: 30_000 });
  const offer = await hostOffer.inputValue();
  expect(offer.startsWith('K1')).toBe(true);
  // Small enough to be a QR code someone can actually scan.
  expect(offer.length).toBeLessThan(1200);

  await guest.getByRole('button', { name: 'Play a friend' }).click();
  await guest.getByRole('button', { name: 'Enter a code' }).click();
  await guest.getByRole('button', { name: 'Enter codes manually' }).click();
  await guest.locator('textarea:not([readonly])').fill(offer);
  await guest.getByRole('button', { name: 'Make my reply' }).click();

  const guestAnswer = guest.locator('textarea[readonly]');
  await expect(guestAnswer).not.toBeEmpty({ timeout: 30_000 });
  await host.locator('textarea:not([readonly])').fill(await guestAnswer.inputValue());
  await host.getByRole('button', { name: 'Connect' }).click();

  await expect(host.locator('.game.is-current')).toBeVisible({ timeout: 30_000 });
  await expect(guest.locator('.game.is-current')).toBeVisible({ timeout: 30_000 });

  // Exactly one side is on move, which is the seating working.
  const turnOf = async (): Promise<Page | null> => {
    for (const page of [host, guest]) {
      const status = await page.locator('.status').textContent();
      if (status?.includes('Your turn')) return page;
    }
    return null;
  };
  await expect.poll(async () => (await turnOf()) !== null, { timeout: 20_000 }).toBe(true);

  for (let move = 0; move < 6; move += 1) {
    const mover = await turnOf();
    if (!mover) break;
    await mover.locator('.cell[data-legal="true"]:not([disabled])').first().click({ force: true });
    await host.waitForTimeout(1300);
  }

  const hostScore = await host.locator('.strip__score').textContent();
  const guestScore = await guest.locator('.strip__score').textContent();
  expect(hostScore).toBe(guestScore);
  expect(hostScore).not.toBe('2 : 2');   // moves really were played

  await context.close();
});
