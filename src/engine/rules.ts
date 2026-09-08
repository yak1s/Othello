/* ============================================================================
   Kissa — the rules of Reversi (brief §6).

   Pure and side-effect free: no DOM, no audio, no randomness, no clock. Every
   other module in the app reads its truth from here, so this file is the one
   place where being merely-probably-right is not good enough.
   ========================================================================= */

import {
  BLACK,
  WHITE,
  opponent,
  type ApplyResult,
  type Color,
  type Move,
  type Outcome,
  type PositionState,
  type RulesApi,
  type Score,
  type ScoreMode,
  type Square,
  type TerminalReason,
  type Variant,
} from './types';
import { flipsBitboard, geometry, movesBitboard, popcount, squaresOf } from './bitboard';
import { zobristFor, type ZobristTable } from './zobrist';

/** 8×8 everywhere in the shipped app; the engine itself never assumes it. */
export const DEFAULT_SIZE = 8;

/** The opening position: White on d4 and e5, Black on d5 and e4, Black to move. */
export function initial(size: number = DEFAULT_SIZE): PositionState {
  if (!Number.isInteger(size) || size < 4 || size % 2 !== 0) {
    throw new RangeError(`An opening position needs an even board of at least 4, got ${size}`);
  }
  const mid = size / 2;
  const at = (file: number, rank: number): bigint => 1n << BigInt(rank * size + file);
  const white = at(mid - 1, mid - 1) | at(mid, mid);
  const black = at(mid - 1, mid) | at(mid, mid - 1);
  return {
    black,
    white,
    turn: BLACK,
    moveNumber: 0,
    hash: hashOf(black, white, BLACK, size),
    size,
  };
}

export function legalMoves(state: PositionState): Square[] {
  const g = geometry(state.size);
  const [own, opp] = sides(state);
  return squaresOf(movesBitboard(own, opp, g));
}

export function isLegal(state: PositionState, move: Move): boolean {
  const g = geometry(state.size);
  if (!Number.isInteger(move) || move < 0 || move >= g.cells) return false;
  const bit = 1n << BigInt(move);
  if (((state.black | state.white) & bit) !== 0n) return false;
  const [own, opp] = sides(state);
  return flipsBitboard(own, opp, bit, g) !== 0n;
}

export function apply(state: PositionState, move: Move): ApplyResult {
  const g = geometry(state.size);
  if (!Number.isInteger(move) || move < 0 || move >= g.cells) {
    throw new RangeError(`Square ${move} is off a ${state.size}×${state.size} board`);
  }
  const bit = 1n << BigInt(move);
  if (((state.black | state.white) & bit) !== 0n) {
    throw new Error(`Illegal move: square ${move} is already occupied`);
  }
  const mover = state.turn;
  const [own, opp] = sides(state);
  const flips = flipsBitboard(own, opp, bit, g);
  if (flips === 0n) {
    throw new Error(`Illegal move: square ${move} captures nothing`);
  }

  const nextOwn = own | bit | flips;
  const nextOpp = opp & ~flips;
  const other = opponent(mover);

  // Passing, exactly as the brief specifies it. The opponent gets the turn when
  // they can use it; when they cannot but we can, they are recorded as having
  // passed and we play again; when neither side can move the game is over, and
  // we hand the turn over anyway so the terminal position is well-formed.
  let turn: Color;
  let passedBy: Color | undefined;
  if (movesBitboard(nextOpp, nextOwn, g) !== 0n) {
    turn = other;
  } else if (movesBitboard(nextOwn, nextOpp, g) !== 0n) {
    turn = mover;
    passedBy = other;
  } else {
    turn = other;
    passedBy = other;
  }

  const flipped = squaresOf(flips);
  const z = zobristFor(state.size);
  let hash = state.hash ^ pieceKey(z, mover, move, g.cells);
  for (const s of flipped) {
    hash ^= pieceKey(z, other, s, g.cells) ^ pieceKey(z, mover, s, g.cells);
  }
  if (turn !== state.turn) hash ^= z.side;

  const next: PositionState = {
    black: mover === BLACK ? nextOwn : nextOpp,
    white: mover === BLACK ? nextOpp : nextOwn,
    turn,
    moveNumber: state.moveNumber + 1,
    hash,
    size: state.size,
  };
  return passedBy === undefined ? { state: next, flipped } : { state: next, flipped, passedBy };
}

export function isTerminal(state: PositionState): boolean {
  return terminalReason(state) !== null;
}

export function terminalReason(state: PositionState): TerminalReason | null {
  const g = geometry(state.size);
  // Wipeout is checked first: a 64–0 board is both full and a wipeout, and the
  // wipeout is the thing the player needs told ("No white discs left").
  if (state.black === 0n || state.white === 0n) return 'wipeout';
  if ((state.black | state.white) === g.full) return 'board-full';
  if (movesBitboard(state.black, state.white, g) !== 0n) return null;
  if (movesBitboard(state.white, state.black, g) !== 0n) return null;
  return 'both-pass';
}

export function score(state: PositionState, mode: ScoreMode = 'discs'): Score {
  const black = popcount(state.black);
  const white = popcount(state.white);
  const empty = state.size * state.size - black - white;
  if (mode === 'discs') return { black, white, empty };
  if (black > white) return { black: black + empty, white, empty: 0 };
  if (white > black) return { black, white: white + empty, empty: 0 };
  // A tie splits the empties, which on any even board gives each side exactly
  // size²/2. The floor/ceil pair only matters on odd boards, which never ship.
  const half = empty >> 1;
  return { black: black + half, white: white + (empty - half), empty: 0 };
}

export function outcome(
  state: PositionState,
  variant: Variant = 'standard',
  mode: ScoreMode = 'discs',
): Outcome | null {
  const reason = terminalReason(state);
  if (reason === null) return null;
  // Reverse Reversi is decided on raw discs; the tournament convention exists to
  // make a margin readable, not to change who won.
  const s = variant === 'reverse' ? score(state, 'discs') : score(state, mode);
  if (s.black === s.white) return { kind: 'draw', reason };
  const blackAhead = variant === 'reverse' ? s.black < s.white : s.black > s.white;
  return { kind: 'win', winner: blackAhead ? BLACK : WHITE, reason };
}

export function hash(state: PositionState): bigint {
  return hashOf(state.black, state.white, state.turn, state.size);
}

function hashOf(black: bigint, white: bigint, turn: Color, size: number): bigint {
  const z = zobristFor(size);
  const cells = size * size;
  let h = turn === WHITE ? z.side : 0n;
  for (const s of squaresOf(black)) h ^= pieceKey(z, BLACK, s, cells);
  for (const s of squaresOf(white)) h ^= pieceKey(z, WHITE, s, cells);
  return h;
}

function pieceKey(z: ZobristTable, color: Color, square: Square, cells: number): bigint {
  const k = z.piece[color * cells + square];
  if (k === undefined) throw new RangeError(`No Zobrist key for colour ${color} on square ${square}`);
  return k;
}

/** `[side to move, side to be captured]`. */
function sides(state: PositionState): readonly [bigint, bigint] {
  return state.turn === BLACK ? [state.black, state.white] : [state.white, state.black];
}

export const rules: RulesApi = {
  initial,
  legalMoves,
  isLegal,
  apply,
  isTerminal,
  terminalReason,
  score,
  outcome,
  hash,
};
