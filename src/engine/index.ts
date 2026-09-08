/* ============================================================================
   Kissa — rules engine, public surface.

   Import from here, never from a file inside the module. Everything below is
   pure: no DOM, no audio, no clock, no randomness (brief §6).
   ========================================================================= */

export * from './types';

export {
  DEFAULT_SIZE,
  apply,
  hash,
  initial,
  isLegal,
  isTerminal,
  legalMoves,
  outcome,
  rules,
  score,
  terminalReason,
} from './rules';

export { canRedo, canUndo, games, newGame, play, positionAt, redo, undo } from './game';

export { fromName, notation, parse, serialize, toName } from './notation';

export {
  flipsBitboard,
  geometry,
  movesBitboard,
  popcount,
  shift,
  squaresOf,
  type Geometry,
  type Shift,
} from './bitboard';

export { ZOBRIST_SEED, splitmix64, zobristFor, type ZobristTable } from './zobrist';
