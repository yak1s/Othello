import { expect, test, type Page } from '@playwright/test';
import { startRelay, type Relay } from './relay';

/**
 * The four-digit PIN, proved end to end.
 *
 * Two real browser contexts, the real UI, the real signalling code, and a real
 * WebRTC data channel between them. The only thing standing in for production
 * is the signalling relay itself, which is a local one so that the test does
 * not depend on a stranger's server being up — the app reaches it through the
 * same `relayUrls` option the brief allows for self-hosting, and every other
 * part of the path is the shipped one.
 *
 * What this has to establish, because a screenshot of a PIN field establishes
 * none of it: that the host's PIN is what the guest types, that typing it is
 * enough on its own, that the two boards then agree move for move, and that a
 * wrong PIN finds nobody rather than quietly joining the wrong game.
 */

let relay: Relay;

test.beforeAll(async () => { relay = await startRelay(); });
test.afterAll(async () => { await relay.close(); });

const appUrl = (): string => `/?relay=${encodeURIComponent(relay.url)}`;

async function hostAGame(page: Page): Promise<string> {
  await page.goto(appUrl());
  await page.getByRole('button', { name: 'Play a friend' }).click();
  await page.getByRole('button', { name: 'Start a game' }).click();
  const shown = page.locator('.pin');
  await expect(shown).toBeVisible();
  const pin = (await shown.textContent())!.replace(/\D/g, '');
  expect(pin, 'the PIN is four digits').toMatch(/^\d{4}$/);
  return pin;
}

async function joinWith(page: Page, pin: string): Promise<void> {
  await page.goto(appUrl());
  await page.getByRole('button', { name: 'Play a friend' }).click();
  await page.getByRole('button', { name: 'Enter a PIN' }).click();
  // Typed a digit at a time, like a person: the fourth keystroke is what
  // starts the search, and there is no button to press after it.
  await page.locator('.pin-input').pressSequentially(pin, { delay: 60 });
}

/** Whichever page is on move, or null while both are waiting. */
async function turnOf(pages: Page[]): Promise<Page | null> {
  for (const page of pages) {
    const status = await page.locator('.status').textContent();
    if (status?.includes('Your turn')) return page;
  }
  return null;
}

const scoreOf = (page: Page): Promise<string | null> => page.locator('.strip__score').textContent();

test('two devices meet on a four-digit PIN and stay in step', async ({ browser }) => {
  // Separate contexts, so the two sides share no storage and no page state:
  // as close to two devices as one machine gets.
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  const pin = await hostAGame(host);
  await joinWith(guest, pin);

  // Both boards open, which only happens once the handshake has assigned seats.
  await expect(host.locator('.game.is-current')).toBeVisible({ timeout: 45_000 });
  await expect(guest.locator('.game.is-current')).toBeVisible({ timeout: 45_000 });
  expect(relay.delivered, 'nothing went through the relay').toBeGreaterThan(0);

  // Exactly one side is on move: the seating worked, and both did not take
  // black. Black opens 2:2 on both boards.
  await expect.poll(async () => (await turnOf([host, guest])) !== null, { timeout: 30_000 }).toBe(true);
  // Exactly one, not both: two peers each believing they are black is the
  // failure this looks for, and it is the one a single-page test cannot see.
  const onMove = await Promise.all([host, guest].map(async (page) =>
    (await page.locator('.status').textContent())?.includes('Your turn') ?? false));
  expect(onMove.filter(Boolean).length, 'the seats were not shared out').toBe(1);
  expect(await scoreOf(host)).toBe('2 : 2');
  expect(await scoreOf(guest)).toBe('2 : 2');

  // Six real moves, alternating sides, each played on whichever device is
  // actually on move. After every one the two boards must still agree — and
  // the move must have reached the other side, not merely the local board.
  let previous = '2 : 2';
  for (let move = 1; move <= 6; move += 1) {
    const mover = await turnOf([host, guest]);
    expect(mover, `nobody was on move before move ${move}`).not.toBeNull();
    const watcher = mover === host ? guest : host;
    await mover!.locator('.cell[data-legal="true"]').first().click();

    // The watcher is the one that matters: it can only change if the move
    // crossed the data channel.
    await expect.poll(() => scoreOf(watcher), { timeout: 20_000 }).not.toBe(previous);
    await expect.poll(() => scoreOf(guest), { timeout: 20_000 }).toBe(await scoreOf(host));
    previous = (await scoreOf(host))!;
  }

  // And the discs themselves agree, not merely the two numerals: a matching
  // score with a different position is exactly the desync worth catching.
  const board = (page: Page): Promise<string> => page.evaluate(() => {
    const at = new Map<number, string>();
    for (const disc of document.querySelectorAll('.disc')) {
      const file = Number(getComputedStyle(disc).getPropertyValue('--file'));
      const rank = Number(getComputedStyle(disc).getPropertyValue('--rank'));
      at.set(rank * 8 + file, disc.getAttribute('data-color') ?? '?');
    }
    return Array.from({ length: 64 }, (_, i) => at.get(i) ?? '.').join('');
  });
  expect(await board(guest)).toBe(await board(host));

  await hostContext.close();
  await guestContext.close();
});

test('a PIN nobody is hosting finds nobody, and says so', async ({ browser }) => {
  // Both strategies get their full window before the app gives up — eight
  // seconds on the first, twenty-four with the second racing — because a host
  // who is slower to press the button than their friend is to type must not be
  // declared unreachable. That is around forty seconds of honest waiting, so
  // the test is given more than the file's default.
  test.setTimeout(150_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await joinWith(page, '0000');
  await expect(page.locator('.sheet__title')).toHaveText('No connection', { timeout: 120_000 });
  await expect(page.locator('.sheet')).toContainText('check you both typed the same PIN');
  await context.close();
});

test('the PIN field takes only digits, and only four of them', async ({ page }) => {
  await page.goto(appUrl());
  await page.getByRole('button', { name: 'Play a friend' }).click();
  await page.getByRole('button', { name: 'Enter a PIN' }).click();
  const input = page.locator('.pin-input');
  await input.pressSequentially('12ab34');
  expect(await input.inputValue(), 'letters reached the field').toBe('1234');
  // The fourth digit starts the search on its own; there is no button to find.
  await expect(page.locator('.waiting')).toHaveText('Looking for your friend.');
});

test('a PIN pasted the way it is shown still works', async ({ page }) => {
  await page.goto(appUrl());
  await page.getByRole('button', { name: 'Play a friend' }).click();
  await page.getByRole('button', { name: 'Enter a PIN' }).click();
  const input = page.locator('.pin-input');
  // The host's screen reads "9 8 7 6", so that is what gets copied and pasted.
  // A maxlength of four cut this to "98 7" before the spaces were stripped and
  // silently joined room 987 instead — a wrong-PIN bug with no wrong PIN in it.
  await input.fill('9 8 7 6');
  expect(await input.inputValue()).toBe('9876');
  await expect(page.locator('.waiting')).toHaveText('Looking for your friend.');
});

test('a shared link carries the PIN and starts the join on its own', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  const pin = await hostAGame(host);
  await guest.goto(`${appUrl()}#j=${pin}`);

  await expect(host.locator('.game.is-current')).toBeVisible({ timeout: 45_000 });
  await expect(guest.locator('.game.is-current')).toBeVisible({ timeout: 45_000 });
  // The PIN is stripped from the address bar, so a reload does not rejoin.
  expect(guest.url()).not.toContain('#j=');

  await hostContext.close();
  await guestContext.close();
});
