/* ============================================================================
   Kissa — the search's board representation (brief §7).

   The rules engine in `src/engine` is the authority on legality and is written
   for clarity; it is far too slow to sit under a million-node search. This
   module is the other half of that trade: one position is four 32-bit words,
   move generation and flip resolution are parallel-prefix (dumb7fill) shifts
   over all eight rays at once, and nothing allocates inside a search.

   Two representations are implemented behind one interface because the brief
   asks for both to be measured rather than assumed: `u32` keeps a position as
   two halves in an `Int32Array`, `bigint` keeps it as two 64-bit `bigint`s.
   `src/ai/bench.ts` times them; `DEFAULT_BOARD_KIND` records the winner.

   Bit layout follows the engine contract exactly: bit `s` is the square
   `rank * 8 + file`, so a1 = 0, h1 = 7, a8 = 56, h8 = 63. Bits 0–31 live in
   `lo` (ranks 1–4), bits 32–63 in `hi` (ranks 5–8). Every 32-bit value in this
   file is a signed int32 bit pattern — the sign bit is square 31 or 63 and is
   never arithmetically meaningful.
   ========================================================================= */

import type { Color, PositionState, Square } from '../engine/types';

export const BOARD_SIZE = 8;
export const SQUARES = 64;

/** Deepest slot the search addresses: 60 plies of game, plus passes and headroom. */
export const MAX_SLOTS = 80;

export type BoardKind = 'u32' | 'bigint';

/** Which half of a slot: 0 is the side to move, 1 is its opponent. */
export type Side = 0 | 1;

/* ── Direction rays ───────────────────────────────────────────────────────

   Each ray is a shift distance plus the wrap mask that a run may pass through.
   The mask is applied to the *opponent* discs, so a run can never step off the
   a-file onto the h-file: the squares it would have to occupy are not in the
   mask. Horizontal rays exclude files a and h, vertical rays exclude ranks 1
   and 8, diagonals exclude both.                                            */

const HORIZ_HI = 0x7e7e7e7e | 0;
const HORIZ_LO = 0x7e7e7e7e | 0;
const VERT_HI = 0x00ffffff | 0;
const VERT_LO = 0xffffff00 | 0;
const DIAG_HI = 0x007e7e7e | 0;
const DIAG_LO = 0x7e7e7e00 | 0;

/** Shift distance per ray: east/west 1, south/north 8, the diagonals 7 and 9. */
const RAY_K: readonly number[] = [1, 1, 8, 8, 7, 7, 9, 9];
/** True when the ray runs toward higher square indices. */
const RAY_UP: readonly boolean[] = [true, false, true, false, true, false, true, false];
const RAY_MH: readonly number[] = [HORIZ_HI, HORIZ_HI, VERT_HI, VERT_HI, DIAG_HI, DIAG_HI, DIAG_HI, DIAG_HI];
const RAY_ML: readonly number[] = [HORIZ_LO, HORIZ_LO, VERT_LO, VERT_LO, DIAG_LO, DIAG_LO, DIAG_LO, DIAG_LO];

/** A run of opposing discs between two of the mover's own is at most six long. */
const RUN_LIMIT = 5;

const NOT_A_HI = 0xfefefefe | 0;
const NOT_A_LO = 0xfefefefe | 0;
const NOT_H_HI = 0x7f7f7f7f | 0;
const NOT_H_LO = 0x7f7f7f7f | 0;

/* ── 64-bit shifts over an int32 pair ─────────────────────────────────────

   The result lands in module-scope scratch rather than a returned object; a
   two-field allocation per ray per node is the difference between this being
   fast and being pointless.                                                 */

let sHi = 0;
let sLo = 0;

function shiftUp(hi: number, lo: number, k: number): void {
  sHi = ((hi << k) | (lo >>> (32 - k))) | 0;
  sLo = (lo << k) | 0;
}

function shiftDown(hi: number, lo: number, k: number): void {
  sHi = (hi >>> k) | 0;
  sLo = ((lo >>> k) | (hi << (32 - k))) | 0;
}

function shift(hi: number, lo: number, k: number, up: boolean): void {
  if (up) shiftUp(hi, lo, k);
  else shiftDown(hi, lo, k);
}

export function popcount32(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

export function popcount64(hi: number, lo: number): number {
  return popcount32(hi) + popcount32(lo);
}

/**
 * Legal-move mask for the mover, written to `out` as `[hi, lo]`.
 *
 * For each ray: take the mover's discs, step one square along the ray, and
 * keep whatever lands on an opposing disc. Step and re-mask five more times —
 * six steps covers the longest possible run — then one final step lands on the
 * square that would terminate the run. If that square is empty, it is legal.
 */
export function movesHiLo(pHi: number, pLo: number, oHi: number, oLo: number, out: Int32Array): void {
  const eHi = ~(pHi | oHi) | 0;
  const eLo = ~(pLo | oLo) | 0;
  let mHi = 0;
  let mLo = 0;
  for (let d = 0; d < 8; d++) {
    const k = RAY_K[d]!;
    const up = RAY_UP[d]!;
    const maskHi = oHi & RAY_MH[d]!;
    const maskLo = oLo & RAY_ML[d]!;
    shift(pHi, pLo, k, up);
    let fHi = sHi & maskHi;
    let fLo = sLo & maskLo;
    for (let i = 0; i < RUN_LIMIT; i++) {
      shift(fHi, fLo, k, up);
      fHi |= sHi & maskHi;
      fLo |= sLo & maskLo;
    }
    shift(fHi, fLo, k, up);
    mHi |= sHi & eHi;
    mLo |= sLo & eLo;
  }
  out[0] = mHi;
  out[1] = mLo;
}

/**
 * Discs that flip if the mover plays `sq`, written to `out` as `[hi, lo]`.
 * Zero on both halves means the move captures nothing and is therefore illegal.
 */
export function flipsHiLo(
  pHi: number,
  pLo: number,
  oHi: number,
  oLo: number,
  sq: Square,
  out: Int32Array,
): void {
  const bHi = sq >= 32 ? (1 << (sq - 32)) | 0 : 0;
  const bLo = sq >= 32 ? 0 : (1 << sq) | 0;
  let rHi = 0;
  let rLo = 0;
  for (let d = 0; d < 8; d++) {
    const k = RAY_K[d]!;
    const up = RAY_UP[d]!;
    const maskHi = oHi & RAY_MH[d]!;
    const maskLo = oLo & RAY_ML[d]!;
    shift(bHi, bLo, k, up);
    let fHi = sHi & maskHi;
    let fLo = sLo & maskLo;
    for (let i = 0; i < RUN_LIMIT; i++) {
      shift(fHi, fLo, k, up);
      fHi |= sHi & maskHi;
      fLo |= sLo & maskLo;
    }
    shift(fHi, fLo, k, up);
    if (((sHi & pHi) | (sLo & pLo)) !== 0) {
      rHi |= fHi;
      rLo |= fLo;
    }
  }
  out[0] = rHi;
  out[1] = rLo;
}

/** Every square orthogonally or diagonally adjacent to a set bit, as `[hi, lo]`. */
export function neighboursHiLo(hi: number, lo: number, out: Int32Array): void {
  const naHi = hi & NOT_A_HI;
  const naLo = lo & NOT_A_LO;
  const nhHi = hi & NOT_H_HI;
  const nhLo = lo & NOT_H_LO;
  let rHi = 0;
  let rLo = 0;
  shiftDown(hi, lo, 8); rHi |= sHi; rLo |= sLo;
  shiftUp(hi, lo, 8); rHi |= sHi; rLo |= sLo;
  shiftUp(nhHi, nhLo, 1); rHi |= sHi; rLo |= sLo;
  shiftDown(naHi, naLo, 1); rHi |= sHi; rLo |= sLo;
  shiftDown(nhHi, nhLo, 7); rHi |= sHi; rLo |= sLo;
  shiftUp(naHi, naLo, 7); rHi |= sHi; rLo |= sLo;
  shiftDown(naHi, naLo, 9); rHi |= sHi; rLo |= sLo;
  shiftUp(nhHi, nhLo, 9); rHi |= sHi; rLo |= sLo;
  out[0] = rHi;
  out[1] = rLo;
}

/** Set bits of `(hi, lo)` as ascending square indices in `out`; returns the count. */
export function squaresOf(hi: number, lo: number, out: Int32Array): number {
  let n = 0;
  let x = lo;
  while (x !== 0) {
    const low = x & -x;
    out[n++] = 31 - Math.clz32(low >>> 0);
    x = (x & (x - 1)) | 0;
  }
  x = hi;
  while (x !== 0) {
    const low = x & -x;
    out[n++] = 63 - Math.clz32(low >>> 0);
    x = (x & (x - 1)) | 0;
  }
  return n;
}

/* ── Conversion to and from the engine contract ──────────────────────────── */

export function hiOf(bits: bigint): number {
  return Number((bits >> 32n) & 0xffffffffn) | 0;
}

export function loOf(bits: bigint): number {
  return Number(bits & 0xffffffffn) | 0;
}

export function bitsOf(hi: number, lo: number): bigint {
  return ((BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0)) & MASK64;
}

/** The contract's `PositionState` seen from the side to move. */
export function moverOf(state: PositionState): bigint {
  return state.turn === 0 ? state.black : state.white;
}

export function otherOf(state: PositionState): bigint {
  return state.turn === 0 ? state.white : state.black;
}

/**
 * Rebuild a contract `PositionState`. The Zobrist hash belongs to the rules
 * engine — this module keeps its own, seeded differently, for the
 * transposition table — so the caller supplies it; tests that only compare
 * bitboards pass 0n.
 */
export function toPositionState(
  mover: bigint,
  other: bigint,
  turn: Color,
  moveNumber: number,
  hash: bigint = 0n,
  size: number = BOARD_SIZE,
): PositionState {
  return {
    black: turn === 0 ? mover : other,
    white: turn === 0 ? other : mover,
    turn,
    moveNumber,
    hash,
    size,
  };
}

/* ── Notation, local to this module ───────────────────────────────────────
   `src/engine/notation` does this too, but the search worker must not depend
   on the rules engine at runtime (brief §7), and the opening book is keyed by
   transcript text.                                                          */

const FILES = 'abcdefgh';

export function squareName(sq: Square): string {
  return `${FILES[sq & 7]!}${(sq >> 3) + 1}`;
}

/** `"d3"` → 19. Returns -1 rather than throwing: book text is data, not control flow. */
export function squareFromName(name: string): Square {
  if (name.length !== 2) return -1;
  const file = FILES.indexOf(name[0]!.toLowerCase());
  const rank = name.charCodeAt(1) - 49;
  if (file < 0 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}

/* ── The interface both representations implement ─────────────────────────

   Positions live in numbered slots rather than in objects the caller holds,
   so a recursive search can push a child position without allocating: the
   parent is slot `ply`, the child is slot `ply + 1`. Every method that yields
   a bitboard writes `[hi, lo]` into a caller-owned `Int32Array`.            */

export interface FastBoard {
  readonly kind: BoardKind;
  /** Load a position into `slot`, from the mover's point of view. */
  set(slot: number, mover: bigint, other: bigint): void;
  copy(from: number, to: number): void;
  /** `side` 0 is the mover, 1 is the opponent. */
  hi(slot: number, side: Side): number;
  lo(slot: number, side: Side): number;
  bits(slot: number, side: Side): bigint;
  /** Legal squares for the mover, ascending, into `out`; returns the count. */
  genMoves(slot: number, out: Int32Array): number;
  mobility(slot: number): number;
  opponentMobility(slot: number): number;
  /** Flip mask for `sq` into `out` as `[hi, lo]`; returns the number of discs. */
  flips(slot: number, sq: Square, out: Int32Array): number;
  /**
   * Play `sq` from slot `from` into slot `to`, handing the move to the
   * opponent. `flipOut` receives the flip mask as `[hi, lo]`. Returns the
   * number of discs flipped, which is 0 exactly when the move was illegal —
   * the caller is expected to have generated it and never to see that.
   */
  play(from: number, to: number, sq: Square, flipOut: Int32Array): number;
  /** Hand the move to the opponent without placing a disc. */
  pass(from: number, to: number): void;
  discCount(slot: number, side: Side): number;
  emptyCount(slot: number): number;
}

/* ── Representation A: two int32 halves in a flat typed array ────────────── */

class U32Board implements FastBoard {
  readonly kind = 'u32' as const;
  private readonly w = new Int32Array(MAX_SLOTS * 4);
  private readonly scratch = new Int32Array(2);

  set(slot: number, mover: bigint, other: bigint): void {
    const i = slot << 2;
    this.w[i] = hiOf(mover);
    this.w[i + 1] = loOf(mover);
    this.w[i + 2] = hiOf(other);
    this.w[i + 3] = loOf(other);
  }

  copy(from: number, to: number): void {
    const a = from << 2;
    const b = to << 2;
    const w = this.w;
    w[b] = w[a]!;
    w[b + 1] = w[a + 1]!;
    w[b + 2] = w[a + 2]!;
    w[b + 3] = w[a + 3]!;
  }

  hi(slot: number, side: Side): number {
    return this.w[(slot << 2) + (side << 1)]!;
  }

  lo(slot: number, side: Side): number {
    return this.w[(slot << 2) + (side << 1) + 1]!;
  }

  bits(slot: number, side: Side): bigint {
    return bitsOf(this.hi(slot, side), this.lo(slot, side));
  }

  genMoves(slot: number, out: Int32Array): number {
    const i = slot << 2;
    const w = this.w;
    const s = this.scratch;
    movesHiLo(w[i]!, w[i + 1]!, w[i + 2]!, w[i + 3]!, s);
    return squaresOf(s[0]!, s[1]!, out);
  }

  mobility(slot: number): number {
    const i = slot << 2;
    const w = this.w;
    const s = this.scratch;
    movesHiLo(w[i]!, w[i + 1]!, w[i + 2]!, w[i + 3]!, s);
    return popcount64(s[0]!, s[1]!);
  }

  opponentMobility(slot: number): number {
    const i = slot << 2;
    const w = this.w;
    const s = this.scratch;
    movesHiLo(w[i + 2]!, w[i + 3]!, w[i]!, w[i + 1]!, s);
    return popcount64(s[0]!, s[1]!);
  }

  flips(slot: number, sq: Square, out: Int32Array): number {
    const i = slot << 2;
    const w = this.w;
    flipsHiLo(w[i]!, w[i + 1]!, w[i + 2]!, w[i + 3]!, sq, out);
    return popcount64(out[0]!, out[1]!);
  }

  play(from: number, to: number, sq: Square, flipOut: Int32Array): number {
    const a = from << 2;
    const b = to << 2;
    const w = this.w;
    const pHi = w[a]!;
    const pLo = w[a + 1]!;
    const oHi = w[a + 2]!;
    const oLo = w[a + 3]!;
    flipsHiLo(pHi, pLo, oHi, oLo, sq, flipOut);
    const fHi = flipOut[0]!;
    const fLo = flipOut[1]!;
    const bHi = sq >= 32 ? (1 << (sq - 32)) | 0 : 0;
    const bLo = sq >= 32 ? 0 : (1 << sq) | 0;
    w[b] = oHi & ~fHi;
    w[b + 1] = oLo & ~fLo;
    w[b + 2] = pHi | fHi | bHi;
    w[b + 3] = pLo | fLo | bLo;
    return popcount64(fHi, fLo);
  }

  pass(from: number, to: number): void {
    const a = from << 2;
    const b = to << 2;
    const w = this.w;
    const pHi = w[a]!;
    const pLo = w[a + 1]!;
    w[b] = w[a + 2]!;
    w[b + 1] = w[a + 3]!;
    w[b + 2] = pHi;
    w[b + 3] = pLo;
  }

  discCount(slot: number, side: Side): number {
    return popcount64(this.hi(slot, side), this.lo(slot, side));
  }

  emptyCount(slot: number): number {
    const i = slot << 2;
    const w = this.w;
    return 64 - popcount64(w[i]! | w[i + 2]!, w[i + 1]! | w[i + 3]!);
  }
}

/* ── Representation B: one bigint per colour ─────────────────────────────── */

const MASK64 = 0xffffffffffffffffn;
const B_HORIZ = 0x7e7e7e7e7e7e7e7en;
const B_VERT = 0x00ffffffffffff00n;
const B_DIAG = 0x007e7e7e7e7e7e00n;
const B_RAY_K: readonly bigint[] = [1n, 1n, 8n, 8n, 7n, 7n, 9n, 9n];
const B_RAY_MASK: readonly bigint[] = [B_HORIZ, B_HORIZ, B_VERT, B_VERT, B_DIAG, B_DIAG, B_DIAG, B_DIAG];

function bShift(x: bigint, k: bigint, up: boolean): bigint {
  return up ? (x << k) & MASK64 : x >> k;
}

/** Move mask for the mover, as a bigint. Exported so the bench can time it directly. */
export function movesBig(p: bigint, o: bigint): bigint {
  const empty = ~(p | o) & MASK64;
  let moves = 0n;
  for (let d = 0; d < 8; d++) {
    const k = B_RAY_K[d]!;
    const up = RAY_UP[d]!;
    const m = o & B_RAY_MASK[d]!;
    let f = m & bShift(p, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    moves |= bShift(f, k, up) & empty;
  }
  return moves;
}

/** Flip mask for `sq`, as a bigint. */
export function flipsBig(p: bigint, o: bigint, sq: Square): bigint {
  const b = 1n << BigInt(sq);
  let flips = 0n;
  for (let d = 0; d < 8; d++) {
    const k = B_RAY_K[d]!;
    const up = RAY_UP[d]!;
    const m = o & B_RAY_MASK[d]!;
    let f = m & bShift(b, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    f |= m & bShift(f, k, up);
    if ((bShift(f, k, up) & p) !== 0n) flips |= f;
  }
  return flips;
}

function popcountBig(x: bigint): number {
  return popcount64(hiOf(x), loOf(x));
}

class BigBoard implements FastBoard {
  readonly kind = 'bigint' as const;
  private readonly w: bigint[] = new Array<bigint>(MAX_SLOTS * 2).fill(0n);

  set(slot: number, mover: bigint, other: bigint): void {
    this.w[slot << 1] = mover & MASK64;
    this.w[(slot << 1) + 1] = other & MASK64;
  }

  copy(from: number, to: number): void {
    this.w[to << 1] = this.w[from << 1]!;
    this.w[(to << 1) + 1] = this.w[(from << 1) + 1]!;
  }

  hi(slot: number, side: Side): number {
    return hiOf(this.w[(slot << 1) + side]!);
  }

  lo(slot: number, side: Side): number {
    return loOf(this.w[(slot << 1) + side]!);
  }

  bits(slot: number, side: Side): bigint {
    return this.w[(slot << 1) + side]!;
  }

  genMoves(slot: number, out: Int32Array): number {
    const m = movesBig(this.w[slot << 1]!, this.w[(slot << 1) + 1]!);
    return squaresOf(hiOf(m), loOf(m), out);
  }

  mobility(slot: number): number {
    return popcountBig(movesBig(this.w[slot << 1]!, this.w[(slot << 1) + 1]!));
  }

  opponentMobility(slot: number): number {
    return popcountBig(movesBig(this.w[(slot << 1) + 1]!, this.w[slot << 1]!));
  }

  flips(slot: number, sq: Square, out: Int32Array): number {
    const f = flipsBig(this.w[slot << 1]!, this.w[(slot << 1) + 1]!, sq);
    out[0] = hiOf(f);
    out[1] = loOf(f);
    return popcountBig(f);
  }

  play(from: number, to: number, sq: Square, flipOut: Int32Array): number {
    const p = this.w[from << 1]!;
    const o = this.w[(from << 1) + 1]!;
    const f = flipsBig(p, o, sq);
    flipOut[0] = hiOf(f);
    flipOut[1] = loOf(f);
    this.w[to << 1] = o & ~f;
    this.w[(to << 1) + 1] = p | f | (1n << BigInt(sq));
    return popcountBig(f);
  }

  pass(from: number, to: number): void {
    const p = this.w[from << 1]!;
    const o = this.w[(from << 1) + 1]!;
    this.w[to << 1] = o;
    this.w[(to << 1) + 1] = p;
  }

  discCount(slot: number, side: Side): number {
    return popcountBig(this.w[(slot << 1) + side]!);
  }

  emptyCount(slot: number): number {
    return 64 - popcountBig(this.w[slot << 1]! | this.w[(slot << 1) + 1]!);
  }
}

/**
 * Measured on this project's bench (`npm exec -- node` over `src/ai/bench.ts`):
 * the int32-pair representation runs move generation and flip resolution about
 * four times faster than the bigint one and a fixed-depth search about three
 * times faster, because a bigint operation allocates a heap object where a
 * shift-and-mask on two int32s does not. The bigint implementation stays as the
 * cross-check in `fastboard.test.ts`.
 */
export const DEFAULT_BOARD_KIND: BoardKind = 'u32';

export function createFastBoard(kind: BoardKind = DEFAULT_BOARD_KIND): FastBoard {
  return kind === 'bigint' ? new BigBoard() : new U32Board();
}
