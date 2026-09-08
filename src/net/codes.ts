/* ============================================================================
   Room codes and deep links (brief §8).

   Six characters from an alphabet with the seven look-alikes removed, because
   these get read aloud across a room and typed in by hand.
   ========================================================================= */

import { CODE_ALPHABET, CODE_LENGTH } from './protocol';

/** 22 letters: the 26 minus O, I, L and S, which are misread as 0, 1, 1 and 5. */
export const ALPHABET = CODE_ALPHABET;

export function makeCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

/** `ABCDEF` → `ABC-DEF`. The hyphen is for reading, never for the wire. */
export const formatCode = (code: string): string =>
  code.length === CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;

/**
 * Accept what a person actually types. Case is ignored, hyphens and spaces are
 * dropped, and the four excluded look-alikes are folded to the character they
 * are mistaken for — someone reading `NPQ-0RT` aloud from a screen showing
 * `NPQ-QRT` should still get in. Anything else is rejected rather than guessed.
 */
export function parseCode(input: string): string | null {
  const folded = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, 'Q')   // the alphabet has Q but not O
    .replace(/0/g, 'Q')
    .replace(/[IL1]/g, 'J')
    .replace(/[S5]/g, 'Z');
  if (folded.length !== CODE_LENGTH) return null;
  for (const ch of folded) if (!ALPHABET.includes(ch)) return null;
  return folded;
}

export const isValidCode = (input: string): boolean => parseCode(input) !== null;

/* ── Deep links ──────────────────────────────────────────────────────────── */

/** `https://host/path#j=ABC-DEF`, built from wherever the app happens to live. */
export function joinLink(code: string, base: string): string {
  const url = new URL(base);
  url.hash = `j=${formatCode(code)}`;
  return url.toString();
}

export function codeFromLink(href: string): string | null {
  const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
  const match = /(?:^|&)j=([^&]+)/.exec(hash);
  return match ? parseCode(decodeURIComponent(match[1]!)) : null;
}
