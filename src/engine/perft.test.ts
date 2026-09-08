import { describe, expect, it } from 'vitest';
import { apply, initial, isTerminal, legalMoves } from './rules';
import type { PositionState } from './types';

/**
 * The number of distinct games of the given length from the opening. A forced
 * pass is not a ply — `apply` already leaves the turn with the mover — so this
 * counts move sequences, which is the convention the published figures use.
 */
function gamesAtDepth(state: PositionState, depth: number): number {
  if (depth === 0) return 1;
  if (isTerminal(state)) return 0;
  let total = 0;
  for (const move of legalMoves(state)) total += gamesAtDepth(apply(state, move).state, depth - 1);
  return total;
}

describe('the shape of the game tree', () => {
  // The published node counts for Reversi at plies 1–4. Anything wrong in move
  // generation, flip resolution or turn handling moves these numbers.
  it.each([
    [1, 4],
    [2, 12],
    [3, 56],
    [4, 244],
  ])('has %i-ply games numbering %i', (depth, expected) => {
    expect(gamesAtDepth(initial(), depth)).toBe(expected);
  });

  it('offers three replies to each of Black’s four openings', () => {
    for (const move of legalMoves(initial())) {
      expect(legalMoves(apply(initial(), move).state)).toHaveLength(3);
    }
  });
});
