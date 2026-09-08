/* ============================================================================
   Kissa — bitboard geometry, shifts and the parallel-prefix fills.

   Bit `s` of a board means a disc on square `s = rank * size + file`, so moving
   one file right is `<< 1n` and moving one rank down is `<< size`. Every shift
   masks its *source* first: a source square is kept only if its destination is
   still on the board, which is what stops a ray wrapping from file h onto the
   next rank. Because the mask already bounds both file and rank, the shifted
   result needs no second clip against the full board.

   Nothing here is hard-coded to 8. The masks are derived from `size`, and
   `bigint` gives arbitrary width for free.
   ========================================================================= */

import { DIRECTIONS } from './types';

/** One direction step, pre-resolved to a signed distance plus its source mask. */
export interface Shift {
  readonly by: bigint;
  readonly left: boolean;
  readonly mask: bigint;
}

export interface Geometry {
  readonly size: number;
  /** size². */
  readonly cells: number;
  /** Every on-board bit set. */
  readonly full: bigint;
  /**
   * Per direction (in `DIRECTIONS` order), the doubling steps 1, 2, 4 … that the
   * Kogge-Stone fill walks. The last step overshoots the longest possible run,
   * which is what makes the fill exact in ⌈log₂ size⌉ passes instead of size−2.
   */
  readonly steps: readonly (readonly Shift[])[];
}

export function shift(x: bigint, s: Shift): bigint {
  const masked = x & s.mask;
  return s.left ? masked << s.by : masked >> s.by;
}

const cache = new Map<number, Geometry>();

export function geometry(size: number): Geometry {
  const hit = cache.get(size);
  if (hit !== undefined) return hit;
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError(`Board size must be an integer of at least 2, got ${size}`);
  }
  const built = build(size);
  cache.set(size, built);
  return built;
}

function build(size: number): Geometry {
  const cells = size * size;
  const steps = DIRECTIONS.map(([df, dr]) => {
    const out: Shift[] = [];
    for (let k = 1; k < size; k *= 2) {
      let mask = 0n;
      for (let rank = 0; rank < size; rank++) {
        for (let file = 0; file < size; file++) {
          const nf = file + k * df;
          const nr = rank + k * dr;
          if (nf < 0 || nf >= size || nr < 0 || nr >= size) continue;
          mask |= 1n << BigInt(rank * size + file);
        }
      }
      const amount = k * (dr * size + df);
      out.push({ by: BigInt(Math.abs(amount)), left: amount > 0, mask });
    }
    return out;
  });
  return { size, cells, full: (1n << BigInt(cells)) - 1n, steps };
}

/**
 * The classic occluded parallel-prefix fill: `gen` grows from the squares one
 * step off `seed` through contiguous `pro` squares, doubling its reach each
 * pass. Returns the run of `pro` discs adjacent to `seed` in this direction,
 * excluding `seed` itself.
 */
function ray(seed: bigint, pro0: bigint, steps: readonly Shift[], first: Shift): bigint {
  let gen = shift(seed, first) & pro0;
  let pro = pro0;
  let i = 0;
  for (const st of steps) {
    gen |= pro & shift(gen, st);
    i++;
    if (i < steps.length) pro &= shift(pro, st);
  }
  return gen;
}

/** Every square the owner of `own` may legally play against `opp`. */
export function movesBitboard(own: bigint, opp: bigint, g: Geometry): bigint {
  const empty = g.full & ~(own | opp);
  let moves = 0n;
  for (const steps of g.steps) {
    const first = steps[0];
    if (first === undefined) continue;
    moves |= shift(ray(own, opp, steps, first), first) & empty;
  }
  return moves;
}

/**
 * The discs a placement on `seed` captures. Every direction is resolved against
 * the *pre-move* boards, which is precisely why flips never chain: a disc turned
 * by this move is never a terminator for another direction of the same move.
 */
export function flipsBitboard(own: bigint, opp: bigint, seed: bigint, g: Geometry): bigint {
  let flips = 0n;
  for (const steps of g.steps) {
    const first = steps[0];
    if (first === undefined) continue;
    const run = ray(seed, opp, steps, first);
    // A run closed by the board edge or an empty square shifts into nothing of
    // ours, and captures nothing.
    if ((shift(run, first) & own) !== 0n) flips |= run;
  }
  return flips;
}

/** Set bits, ascending. Chunked through 32-bit words so the inner loop is integer work. */
export function squaresOf(board: bigint): number[] {
  const out: number[] = [];
  let rest = board;
  let base = 0;
  while (rest !== 0n) {
    let word = Number(rest & 0xffffffffn);
    while (word !== 0) {
      const low = word & -word;
      out.push(base + 31 - Math.clz32(low));
      word ^= low;
    }
    rest >>= 32n;
    base += 32;
  }
  return out;
}

export function popcount(board: bigint): number {
  let n = 0;
  let rest = board;
  while (rest !== 0n) {
    n += popcount32(Number(rest & 0xffffffffn));
    rest >>= 32n;
  }
  return n;
}

function popcount32(v0: number): number {
  let v = v0 - ((v0 >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}
