/* ============================================================================
   Kissa — the history stack.

   A `Game` is a position plus the plies behind it and the plies ahead of it.
   Every operation returns a new `Game`; nothing here mutates, because the UI
   keeps old positions around for the move-list preview and the P2P layer keeps
   them around to reconcile a desync.
   ========================================================================= */

import type { Game, GameApi, Move, Ply, PositionState, Variant } from './types';
import { DEFAULT_SIZE, apply, initial } from './rules';

export function newGame(variant: Variant = 'standard', size: number = DEFAULT_SIZE): Game {
  return { position: initial(size), history: [], future: [], variant };
}

export function play(game: Game, move: Move): Game {
  const before = game.position;
  const result = apply(before, move);
  const ply: Ply = {
    move,
    by: before.turn,
    flipped: result.flipped,
    before,
    ...(result.passedBy === undefined ? {} : { passedBy: result.passedBy }),
  };
  // Playing from a rewound position abandons the branch that was ahead of it.
  return { position: result.state, history: [...game.history, ply], future: [], variant: game.variant };
}

export function canUndo(game: Game): boolean {
  return game.history.length > 0;
}

export function canRedo(game: Game): boolean {
  return game.future.length > 0;
}

/**
 * Steps back one ply to the exact position stored on it — recomputing it from
 * the transcript would be equivalent but slower and one bug away from wrong.
 * A no-op when there is nothing to undo, so callers may drive it from a button
 * without guarding twice.
 */
export function undo(game: Game): Game {
  const last = game.history[game.history.length - 1];
  if (last === undefined) return game;
  return {
    position: last.before,
    history: game.history.slice(0, -1),
    future: [last, ...game.future],
    variant: game.variant,
  };
}

export function redo(game: Game): Game {
  const [next, ...rest] = game.future;
  if (next === undefined) return game;
  return {
    position: apply(next.before, next.move).state,
    history: [...game.history, next],
    future: rest,
    variant: game.variant,
  };
}

/** The position after `ply` moves. `positionAt(g, 0)` is the opening position. */
export function positionAt(game: Game, ply: number): PositionState {
  if (!Number.isInteger(ply) || ply < 0 || ply > game.history.length) {
    throw new RangeError(`Ply ${ply} is outside a game of ${game.history.length} plies`);
  }
  const at = game.history[ply];
  return at === undefined ? game.position : at.before;
}

export const games: GameApi = { newGame, play, canUndo, canRedo, undo, redo, positionAt };
