/* ============================================================================
   Kissa — notation and transcripts (brief §6).

   A transcript is the played squares concatenated in lower case: `f5d6c3d3…`.
   Passes are not encoded, because they are never a choice — replaying the
   moves reconstructs every pass exactly, which is what makes the round trip
   lossless despite the transcript being shorter than the move list.
   ========================================================================= */

import type { Game, NotationApi, Square, Variant } from './types';
import { DEFAULT_SIZE } from './rules';
import { play, newGame } from './game';

const A = 'a'.charCodeAt(0);
const MOVE_TOKEN = /^[a-z][0-9]+$/;

export function toName(square: Square, size: number = DEFAULT_SIZE): string {
  if (!Number.isInteger(square) || square < 0 || square >= size * size) {
    throw new RangeError(`Square ${square} is off a ${size}×${size} board`);
  }
  if (size > 26) throw new RangeError(`No file letters beyond 26 files, got ${size}`);
  const file = square % size;
  const rank = (square - file) / size;
  return `${String.fromCharCode(A + file)}${rank + 1}`;
}

export function fromName(name: string, size: number = DEFAULT_SIZE): Square {
  const token = name.trim().toLowerCase();
  if (!MOVE_TOKEN.test(token)) throw new SyntaxError(`Malformed square name "${name}"`);
  const file = token.charCodeAt(0) - A;
  const rank = Number(token.slice(1)) - 1;
  if (file < 0 || file >= size || rank < 0 || rank >= size) {
    throw new RangeError(`Square "${name}" is off a ${size}×${size} board`);
  }
  return rank * size + file;
}

export function serialize(game: Game): string {
  const size = game.position.size;
  return game.history.map((ply) => toName(ply.move, size)).join('');
}

export function parse(
  transcript: string,
  variant: Variant = 'standard',
  size: number = DEFAULT_SIZE,
): Game {
  let game = newGame(variant, size);
  for (const token of tokenize(transcript)) {
    const square = fromName(token, size);
    try {
      game = play(game, square);
    } catch (cause) {
      throw new Error(`Transcript move ${game.history.length + 1} ("${token}") is illegal`, { cause });
    }
  }
  return game;
}

/**
 * Split on the file letters rather than on a fixed width: ranks run to two
 * digits once a board is wider than nine, and a transcript should not silently
 * mean something different on a bigger board.
 */
function tokenize(transcript: string): string[] {
  const text = transcript.replace(/\s+/g, '').toLowerCase();
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    i++;
    for (;;) {
      const ch = text[i];
      if (ch === undefined || ch < '0' || ch > '9') break;
      i++;
    }
    const token = text.slice(start, i);
    if (!MOVE_TOKEN.test(token)) throw new SyntaxError(`Malformed transcript near "${token}"`);
    tokens.push(token);
  }
  return tokens;
}

export const notation: NotationApi = { toName, fromName, serialize, parse };
