/* ============================================================================
   Kissa — rules engine contract.

   This file is the interface every other module compiles against. It is pure
   types and constants: no logic, no DOM, no randomness. Implementations may add
   to it, but must not change an existing signature without updating every caller.
   ========================================================================= */

/** 0 = Black, 1 = White. Black moves first (brief §6). */
export type Color = 0 | 1;
export const BLACK: Color = 0;
export const WHITE: Color = 1;
export const opponent = (c: Color): Color => (c === 0 ? 1 : 0);

/**
 * A board square as a linear index, `rank * size + file`.
 * Files a–h run left→right (file 0 = 'a'), ranks 1–8 run top→bottom (rank 0 = '1').
 * So on 8×8: a1 = 0, h1 = 7, a8 = 56, h8 = 63, d4 = 27, e4 = 28, d5 = 35, e5 = 36.
 */
export type Square = number;

/** A move is the square a disc is placed on. Passes are never moves — see `apply`. */
export type Move = Square;

/** Shipped variants only (brief §6): standard, and fewest-discs-wins. */
export type Variant = 'standard' | 'reverse';

/** Scoring convention. Both are correct; they differ after an early wipeout. */
export type ScoreMode = 'discs' | 'tournament';

/**
 * An immutable position.
 *
 * `black` and `white` are bitboards: bit `s` set means a disc of that colour
 * occupies square `s`. They are `bigint` in the rules engine — arbitrary width
 * keeps the engine board-size-agnostic and the code readable. The search worker
 * uses a separate Uint32 hi/lo representation for speed; `src/ai/bitboard.ts`
 * and this module are cross-checked against each other in tests.
 */
export interface PositionState {
  readonly black: bigint;
  readonly white: bigint;
  /** Whose turn it is to place a disc. */
  readonly turn: Color;
  /** Discs placed so far. The opening position is 0; after Black's first move, 1. */
  readonly moveNumber: number;
  /** Zobrist hash of (black, white, turn). Stable across processes and reloads. */
  readonly hash: bigint;
  /** Board edge length. 8 everywhere in the shipped app. */
  readonly size: number;
}

/** One applied ply, retained so undo is exact rather than recomputed. */
export interface Ply {
  /** The square played. */
  readonly move: Move;
  /** The colour that played it. */
  readonly by: Color;
  /** Every square whose disc flipped, in no guaranteed order. */
  readonly flipped: readonly Square[];
  /**
   * Set when, *after* this move, the side due to play had no legal move and was
   * skipped. The value is the colour that was forced to pass. The UI must state
   * this explicitly; it is never silent (brief §6).
   */
  readonly passedBy?: Color;
  /** The position before this ply, for exact undo. */
  readonly before: PositionState;
}

/** A game: a position plus its undo and redo stacks. Immutable; every op returns a new one. */
export interface Game {
  readonly position: PositionState;
  readonly history: readonly Ply[];
  readonly future: readonly Ply[];
  readonly variant: Variant;
}

/** Result of applying a move. */
export interface ApplyResult {
  readonly state: PositionState;
  readonly flipped: readonly Square[];
  readonly passedBy?: Color;
}

export interface Score {
  readonly black: number;
  readonly white: number;
  readonly empty: number;
}

export type Outcome =
  | { readonly kind: 'win'; readonly winner: Color; readonly reason: TerminalReason }
  | { readonly kind: 'draw'; readonly reason: TerminalReason };

/** Why the game ended. All four are reachable (brief §6). */
export type TerminalReason = 'both-pass' | 'board-full' | 'wipeout';

/* ── The required API (brief §6). Implemented in ./rules.ts, re-exported by ./index.ts ── */

export interface RulesApi {
  /** The opening position: White on d4 and e5, Black on d5 and e4, Black to move. */
  initial(size?: number): PositionState;
  /** Every square the side to move may legally play. Empty means they must pass. */
  legalMoves(state: PositionState): Square[];
  /** True if `move` is in `legalMoves(state)`. */
  isLegal(state: PositionState, move: Move): boolean;
  /**
   * Apply a legal move. Throws on an illegal one — callers validate first.
   *
   * After the flips resolve, if the opponent has no legal move but the mover
   * does, the returned `state.turn` stays with the mover and `passedBy` names
   * the opponent. If neither side can move, the turn passes to the opponent and
   * `isTerminal` becomes true, so the terminal position is still well-formed.
   */
  apply(state: PositionState, move: Move): ApplyResult;
  /** Both players stuck, board full, or one colour wiped out. */
  isTerminal(state: PositionState): boolean;
  terminalReason(state: PositionState): TerminalReason | null;
  /** Disc counts. `tournament` awards the empties to the winner so the total is always size². */
  score(state: PositionState, mode?: ScoreMode): Score;
  /** Who won, honouring `variant` — under 'reverse', fewest discs wins. */
  outcome(state: PositionState, variant?: Variant, mode?: ScoreMode): Outcome | null;
  /** Zobrist hash of the position. Equal positions hash equal; used to detect P2P desync. */
  hash(state: PositionState): bigint;
}

/* ── Notation (brief §6) ────────────────────────────────────────────────── */

export interface NotationApi {
  /** 27 → "d4" */
  toName(square: Square, size?: number): string;
  /** "d4" → 27. Throws on anything off-board or malformed. */
  fromName(name: string, size?: number): Square;
  /** A game → "f5d6c3d3c4f4…". Passes are implicit and are not encoded. */
  serialize(game: Game): string;
  /** "f5d6c3…" → a game. Throws if any move in the transcript is illegal. */
  parse(transcript: string, variant?: Variant, size?: number): Game;
}

/* ── Game-level operations over the history stack ───────────────────────── */

export interface GameApi {
  newGame(variant?: Variant, size?: number): Game;
  play(game: Game, move: Move): Game;
  canUndo(game: Game): boolean;
  canRedo(game: Game): boolean;
  /** Steps back one ply, restoring the exact prior position. Redo replays it. */
  undo(game: Game): Game;
  redo(game: Game): Game;
  /** The position after `n` plies, for read-only move-list preview. */
  positionAt(game: Game, ply: number): PositionState;
}

/** Convenience: the eight ray directions as (dFile, dRank). */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], /*      */ [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
