/* ============================================================================
   Evaluation (brief §7).

   Everything is scored from the mover's point of view and weighted by phase,
   because disc count is nearly worthless before about fifty discs: holding more
   of them in the middlegame usually means you have fewer moves left, which is
   how beginners lose. The terms are exposed individually as well as summed,
   because the hint feature names whichever one dominated.
   ========================================================================= */

import { neighboursHiLo, popcount64, type FastBoard, type Side } from './fastboard';

export interface EvalTerms {
  mobility: number;
  potential: number;
  stability: number;
  frontier: number;
  parity: number;
  squares: number;
  discs: number;
  total: number;
}

export type Phase = 'early' | 'middle' | 'late';

export function phaseOf(discs: number): Phase {
  if (discs < 20) return 'early';
  if (discs < 50) return 'middle';
  return 'late';
}

/** Weights per phase. Stability dominates throughout because a corner is the
    only thing on this board that cannot be taken back; mobility outranks discs
    everywhere except the last dozen moves, and parity only starts to matter when
    the empty regions are small enough to count. The relative ordering is what
    matters here — the absolute values are a scale, not a measurement. */
const W: Record<Phase, Omit<EvalTerms, 'total'>> = {
  early:  { mobility: 86, potential: 32, stability: 300, frontier: 34, parity: 0,  squares: 12, discs: 0 },
  middle: { mobility: 78, potential: 26, stability: 340, frontier: 26, parity: 8,  squares: 6,  discs: 0 },
  late:   { mobility: 40, potential: 10, stability: 380, frontier: 10, parity: 34, squares: 2,  discs: 12 },
};

const CORNERS: readonly [number, number][] = [[0, 0], [7, 0], [56, 1], [63, 1]];

/**
 * A small early-game positional table. It is a *term*, never the whole
 * evaluation: an engine that plays the table alone gives away every corner it
 * has been told to want.
 */
const SQUARE_VALUE = new Int8Array([
  20, -3, 11, 8, 8, 11, -3, 20,
  -3, -7, -4, 1, 1, -4, -7, -3,
  11, -4, 2, 2, 2, 2, -4, 11,
  8, 1, 2, -3, -3, 2, 1, 8,
  8, 1, 2, -3, -3, 2, 1, 8,
  11, -4, 2, 2, 2, 2, -4, 11,
  -3, -7, -4, 1, 1, -4, -7, -3,
  20, -3, 11, 8, 8, 11, -3, 20,
]);

/** X-squares and C-squares, keyed by the corner they compromise. */
const HAZARDS: readonly { corner: number; x: number; c: readonly [number, number] }[] = [
  { corner: 0, x: 9, c: [1, 8] },
  { corner: 7, x: 14, c: [6, 15] },
  { corner: 56, x: 49, c: [48, 57] },
  { corner: 63, x: 54, c: [55, 62] },
];

/** The two edge rays leaving each corner, for corner-anchored stability. */
const EDGE_RAYS: readonly { corner: number; rays: readonly (readonly number[])[] }[] = [
  { corner: 0, rays: [[1, 2, 3, 4, 5, 6], [8, 16, 24, 32, 40, 48]] },
  { corner: 7, rays: [[6, 5, 4, 3, 2, 1], [15, 23, 31, 39, 47, 55]] },
  { corner: 56, rays: [[57, 58, 59, 60, 61, 62], [48, 40, 32, 24, 16, 8]] },
  { corner: 63, rays: [[62, 61, 60, 59, 58, 57], [55, 47, 39, 31, 23, 15]] },
];

const scratch = new Int32Array(2);

const has = (hi: number, lo: number, square: number): boolean =>
  square < 32 ? (lo & (1 << square)) !== 0 : (hi & (1 << (square - 32))) !== 0;

/** A terminal score, in the same units as `evaluate`, so search can mix them. */
export const WIN_SCORE = 1_000_000;

export function evaluate(board: FastBoard, slot: number): number {
  return terms(board, slot).total;
}

export function terms(board: FastBoard, slot: number): EvalTerms {
  const mHi = board.hi(slot, 0);
  const mLo = board.lo(slot, 0);
  const oHi = board.hi(slot, 1);
  const oLo = board.lo(slot, 1);
  const discs = board.discCount(slot, 0) + board.discCount(slot, 1);
  const w = W[phaseOf(discs)];

  const emptyHi = ~(mHi | oHi);
  const emptyLo = ~(mLo | oLo);

  // Mobility. Normalised rather than raw, so a 6-vs-2 edge in a quiet position
  // does not swamp a corner in a sharp one.
  const mine = board.mobility(slot);
  const theirs = board.opponentMobility(slot);
  const mobility = mine + theirs === 0 ? 0 : (100 * (mine - theirs)) / (mine + theirs);

  // Potential mobility: the empty squares touching the opponent's discs are the
  // moves they are about to be given, so fewer of them is better for us.
  neighboursHiLo(oHi, oLo, scratch);
  const myPotential = popcount64(scratch[0]! & emptyHi, scratch[1]! & emptyLo);
  neighboursHiLo(mHi, mLo, scratch);
  const theirPotential = popcount64(scratch[0]! & emptyHi, scratch[1]! & emptyLo);
  const potential = myPotential + theirPotential === 0
    ? 0
    : (100 * (myPotential - theirPotential)) / (myPotential + theirPotential);

  // Frontier: our discs that touch an empty square are the ones the opponent can
  // reach, so having many of them is a liability.
  neighboursHiLo(emptyHi, emptyLo, scratch);
  const myFrontier = popcount64(scratch[0]! & mHi, scratch[1]! & mLo);
  const theirFrontier = popcount64(scratch[0]! & oHi, scratch[1]! & oLo);
  const frontier = myFrontier + theirFrontier === 0
    ? 0
    : (100 * (theirFrontier - myFrontier)) / (myFrontier + theirFrontier);

  const stability = stabilityOf(mHi, mLo, oHi, oLo);
  const squares = squareValue(mHi, mLo) - squareValue(oHi, oLo);
  const parity = parityOf(emptyHi, emptyLo, 64 - discs);
  const discTerm = discs === 0 ? 0
    : (100 * (board.discCount(slot, 0) - board.discCount(slot, 1))) / discs;

  const total = Math.round(
    w.mobility * mobility
    + w.potential * potential
    + w.stability * stability
    + w.frontier * frontier
    + w.parity * parity
    + w.squares * squares
    + w.discs * discTerm,
  );

  return { mobility, potential, stability, frontier, parity, squares, discs: discTerm, total };
}

/**
 * Corner ownership, the stable edge runs anchored to owned corners, and the
 * X/C penalties. The X/C penalty applies only while its corner is still empty:
 * once the corner is taken, b2 is just a square.
 */
function stabilityOf(mHi: number, mLo: number, oHi: number, oLo: number): number {
  let value = 0;

  for (const [square, half] of CORNERS) {
    void half;
    if (has(mHi, mLo, square)) value += 1;
    else if (has(oHi, oLo, square)) value -= 1;
  }

  for (const { corner, rays } of EDGE_RAYS) {
    const ownedByMe = has(mHi, mLo, corner);
    const ownedByThem = has(oHi, oLo, corner);
    if (!ownedByMe && !ownedByThem) continue;
    const hi = ownedByMe ? mHi : oHi;
    const lo = ownedByMe ? mLo : oLo;
    const sign = ownedByMe ? 1 : -1;
    for (const ray of rays) {
      for (const square of ray) {
        if (!has(hi, lo, square)) break;
        // A disc on an edge, anchored to a corner of the same colour by an
        // unbroken run, can never be turned over again.
        value += sign * 0.35;
      }
    }
  }

  for (const { corner, x, c } of HAZARDS) {
    if (has(mHi, mLo, corner) || has(oHi, oLo, corner)) continue;
    if (has(mHi, mLo, x)) value -= 0.9;
    else if (has(oHi, oLo, x)) value += 0.9;
    for (const square of c) {
      if (has(mHi, mLo, square)) value -= 0.35;
      else if (has(oHi, oLo, square)) value += 0.35;
    }
  }

  return value;
}

function squareValue(hi: number, lo: number): number {
  let total = 0;
  for (let square = 0; square < 32; square += 1) if ((lo & (1 << square)) !== 0) total += SQUARE_VALUE[square]!;
  for (let square = 0; square < 32; square += 1) if ((hi & (1 << square)) !== 0) total += SQUARE_VALUE[square + 32]!;
  return total;
}

const NEIGHBOUR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

/**
 * Who takes the last move in each empty region. With few empties left the
 * regions are flooded properly, because that is where parity actually decides
 * games; above that it costs more than it is worth and the global parity of the
 * empty count is the same answer most of the time.
 */
function parityOf(emptyHi: number, emptyLo: number, empties: number): number {
  if (empties > 16) return empties % 2 === 1 ? 1 : -1;

  const seen = new Set<number>();
  let odd = 0;
  let even = 0;
  for (let square = 0; square < 64; square += 1) {
    if (!has(emptyHi, emptyLo, square) || seen.has(square)) continue;
    let size = 0;
    const stack = [square];
    seen.add(square);
    while (stack.length) {
      const current = stack.pop()!;
      size += 1;
      const file = current % 8;
      const rank = (current / 8) | 0;
      for (const [df, dr] of NEIGHBOUR_OFFSETS) {
        const f = file + df;
        const r = rank + dr;
        if (f < 0 || f > 7 || r < 0 || r > 7) continue;
        const next = r * 8 + f;
        if (seen.has(next) || !has(emptyHi, emptyLo, next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (size % 2 === 1) odd += 1; else even += 1;
  }
  // An odd region hands its last move to whoever moves into it first, which is
  // the side to move. More odd regions than even is worth having.
  return odd - even === 0 ? 0 : Math.sign(odd - even);
}

/** Which term dominated, for the hint's one-line reason. */
export function dominantTerm(before: EvalTerms, after: EvalTerms): keyof Omit<EvalTerms, 'total'> {
  const keys: (keyof Omit<EvalTerms, 'total'>)[] =
    ['stability', 'mobility', 'frontier', 'potential', 'parity', 'squares', 'discs'];
  let best = keys[0]!;
  let bestDelta = -Infinity;
  for (const key of keys) {
    // `after` is the opponent's view of the resulting position, so a term that
    // improved for us shows up as a drop for them.
    const delta = -(after[key]) - (-before[key]);
    if (delta > bestDelta) { bestDelta = delta; best = key; }
  }
  return best;
}

export const REASONS: Record<keyof Omit<EvalTerms, 'total'>, string> = {
  stability: 'Takes ground they cannot turn over',
  mobility: 'Keeps your options open',
  frontier: 'Stays off the front line',
  potential: 'Leaves them nothing safe',
  parity: 'Takes the last move in that corner of the board',
  squares: 'Holds a square worth having',
  discs: 'Wins discs where they still count',
};

/** Corner moves get named for what they are, whatever the eval says. */
export const CORNER_SQUARES: ReadonlySet<number> = new Set([0, 7, 56, 63]);
export const CORNER_REASON = 'Takes the corner';

export type { Side };
