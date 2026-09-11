/* ============================================================================
   Room PINs (brief §8, revised).

   Four digits, because that is what someone can read across a table, remember
   long enough to type, and say down a phone without spelling anything. The PIN
   is both the room name and the key the traffic is encrypted with, so a game is
   only joinable by someone who has been told the number.

   Four digits is ten thousand rooms. That is plenty for two people meeting on
   purpose and not enough to be private on its own — which is why the PIN
   doubles as the encryption password and why a third device is refused outright
   rather than being allowed to watch.
   ========================================================================= */

export const PIN_LENGTH = 4;

export function makePin(random: () => number): string {
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i += 1) pin += Math.floor(random() * 10);
  return pin;
}

/** Accept what a person actually types: spaces, dashes, a stray full stop. */
export function parsePin(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length === PIN_LENGTH ? digits : null;
}

export const isValidPin = (input: string): boolean => parsePin(input) !== null;

/** Spaced for reading aloud; the wire and the room name use the bare digits. */
export const formatPin = (pin: string): string =>
  pin.length === PIN_LENGTH ? [...pin].join(' ') : pin;

/* ── Deep links ──────────────────────────────────────────────────────────── */

export function joinLink(pin: string, base: string): string {
  const url = new URL(base);
  url.hash = `j=${pin}`;
  return url.toString();
}

export function pinFromLink(href: string): string | null {
  const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
  const match = /(?:^|&)j=([^&]+)/.exec(hash);
  return match ? parsePin(decodeURIComponent(match[1]!)) : null;
}
