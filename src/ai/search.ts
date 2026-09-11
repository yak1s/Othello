/* ============================================================================
   The search (brief §7).

   Negamax with alpha-beta and principal variation search, iterative deepening
   under a time budget rather than a fixed depth, a bounded Zobrist
   transposition table, killer moves, and an exact endgame solver. Nothing here
   allocates inside the search: the board is a slot array, the move lists are
   one preallocated buffer per ply, and the table is four typed arrays.
   ========================================================================= */

import {
  MAX_SLOTS, createFastBoard, popcount64, type FastBoard,
} from './fastboard';
import { WIN_SCORE, evaluate } from './eval';
import { BLACK, type Color, type PositionState, type Square, type Variant } from '../engine/types';

export interface StopSignal { aborted: boolean }

export interface SearchOptions {
  /** Wall-clock budget. Iterative deepening stops when it would overrun. */
  budgetMs: number;
  /** Depth ceiling; `Infinity` at level 6, where only the budget stops it. */
  maxDepth: number;
  /** Solve exactly for the final score at or below this many empties. */
  exactEmpties: number;
  /** Solve for win/loss/draw only at or below this many empties. */
  wldEmpties: number;
  variant: Variant;
  now?: () => number;
  signal?: StopSignal;
}

export interface RootMove {
  square: Square;
  score: number;
}

export interface SearchResult {
  best: Square;
  score: number;
  depth: number;
  nodes: number;
  /** Every root move with its score, best first. The level error model samples
      from this rather than from a second search. */
  ranked: RootMove[];
  /** True when the score is an exact final disc difference, not a heuristic. */
  exact: boolean;
}

const MAX_PLY = 64;
const TT_BITS = 16;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const NO_MOVE = -1;
const CHECK_EVERY = 2048;

/* ── Zobrist keys, as 32-bit halves so the hot loop never touches bigint ─── */

function makeKeys(): { lo: Int32Array; hi: Int32Array; sideLo: number; sideHi: number } {
  // splitmix64 over a fixed seed: the table must be identical in every process,
  // and Math.random() would make a search unreproducible from its inputs.
  let s = 0x9e3779b97f4a7c15n;
  const next = (): bigint => {
    s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return (z ^ (z >> 31n)) & 0xffffffffffffffffn;
  };
  const lo = new Int32Array(128);
  const hi = new Int32Array(128);
  for (let i = 0; i < 128; i += 1) {
    const value = next();
    lo[i] = Number(value & 0xffffffffn) | 0;
    hi[i] = Number((value >> 32n) & 0xffffffffn) | 0;
  }
  const side = next();
  return {
    lo, hi,
    sideLo: Number(side & 0xffffffffn) | 0,
    sideHi: Number((side >> 32n) & 0xffffffffn) | 0,
  };
}

const KEYS = makeKeys();

export class Search {
  private readonly board: FastBoard = createFastBoard();
  private readonly moveBuffers: Int32Array[] = [];
  private readonly orderScores = new Int32Array(64);
  private readonly flipScratch = new Int32Array(2);
  private readonly killers = new Int32Array(MAX_PLY * 2).fill(NO_MOVE);

  private readonly ttKeyLo = new Int32Array(TT_SIZE);
  private readonly ttKeyHi = new Int32Array(TT_SIZE);
  private readonly ttMeta = new Int32Array(TT_SIZE);   // depth<<2 | flag, +1 so 0 means empty
  private readonly ttScore = new Int32Array(TT_SIZE);
  private readonly ttMove = new Int8Array(TT_SIZE);
  private readonly ttGen = new Uint16Array(TT_SIZE);

  private nodes = 0;
  private deadline = 0;
  private signal: StopSignal | undefined;
  private now: () => number = () => Date.now();
  private aborted = false;
  private sign = 1;
  private exactMode = false;
  private wldMode = false;
  private completedDepth = 0;
  /* Stamping each entry beats clearing the table: begin() runs once per move,
     and a 65,536-entry fill was costing more than some of the searches. */
  private generation = 0;

  constructor() {
    for (let ply = 0; ply < MAX_PLY + 2; ply += 1) this.moveBuffers.push(new Int32Array(64));
  }

  private rootMoves: Square[] = [];
  private rootHash: [number, number] = [0, 0];
  private lastRanked: RootMove[] = [];

  /**
   * Load a position and prepare the root. Split out from `search` so the worker
   * can drive iterative deepening itself and hand control back between depths:
   * a worker cannot receive a stop message while a search is running, so the
   * gap between two depths is the only place an abort can actually land.
   */
  begin(state: PositionState, options: SearchOptions): { moves: readonly Square[]; empties: number } {
    this.now = options.now ?? (() => Date.now());
    this.signal = options.signal;
    this.deadline = this.now() + options.budgetMs;
    this.aborted = false;
    this.nodes = 0;
    this.completedDepth = 0;
    this.killers.fill(NO_MOVE);
    this.generation = (this.generation + 1) & 0xffff;
    // Reverse Reversi is the same search with the objective negated: the engine
    // is trying to end up with fewer discs, and every heuristic follows.
    this.sign = options.variant === 'reverse' ? -1 : 1;

    const mover = state.turn === BLACK ? state.black : state.white;
    const other = state.turn === BLACK ? state.white : state.black;
    this.board.set(0, mover, other);

    const buffer = this.moveBuffers[0]!;
    const count = this.board.genMoves(0, buffer);
    this.rootMoves = Array.from(buffer.subarray(0, count));
    this.rootHash = hashOf(this.board, 0, state.turn);
    this.lastRanked = this.rootMoves.map((square) => ({ square, score: 0 }));

    const empties = this.board.emptyCount(0);
    this.exactMode = empties <= options.exactEmpties;
    this.wldMode = !this.exactMode && empties <= options.wldEmpties;
    return { moves: this.rootMoves, empties };
  }

  /** The depths `begin` wants run, in order. One entry for an endgame solve. */
  plan(options: SearchOptions, empties: number): number[] {
    if (this.exactMode || this.wldMode) return [empties];
    return depthsUpTo(Math.min(options.maxDepth, empties));
  }

  /** One complete root pass. Returns every root move scored, best first. */
  runDepth(depth: number): RootMove[] {
    const ranked = this.searchRoot(this.rootMoves, depth, this.rootHash);
    // A pass that ran out of time is incomplete, so the previous depth's
    // ordering stands rather than a half-searched one replacing it.
    if (!this.aborted) { this.lastRanked = ranked; this.completedDepth = depth; }
    return this.lastRanked;
  }

  get wasAborted(): boolean { return this.aborted; }
  get depthReached(): number { return this.completedDepth; }
  get nodeCount(): number { return this.nodes; }
  get isExact(): boolean { return this.exactMode; }

  /** True once there is not enough budget left to be worth starting a depth.
      Each ply costs roughly five times the last with this ordering. */
  outOfBudget(): boolean {
    if (this.timeUp()) return true;
    const left = this.deadline - this.now();
    return left <= 0;
  }

  budgetLeft(): number {
    return Math.max(0, this.deadline - this.now());
  }

  /** The whole search, synchronously. Used by tests and the bench. */
  search(state: PositionState, options: SearchOptions): SearchResult {
    const { moves, empties } = this.begin(state, options);
    if (moves.length === 0) {
      return { best: NO_MOVE, score: 0, depth: 0, nodes: 0, ranked: [], exact: false };
    }

    let ranked = this.lastRanked;
    let completed = 0;
    for (const depth of this.plan(options, empties)) {
      const pass = this.runDepth(depth);
      if (this.aborted && completed > 0) break;
      ranked = pass;
      completed = depth;
      if (this.aborted) break;
      if (Math.abs(pass[0]!.score) >= WIN_SCORE) break;
      if (this.outOfBudget()) break;
    }

    return {
      best: ranked[0]!.square,
      score: ranked[0]!.score,
      depth: completed,
      nodes: this.nodes,
      ranked,
      exact: this.exactMode,
    };
  }

  /** One full-width pass over the root, returning every move scored, best first. */
  private searchRoot(moves: readonly Square[], depth: number, hash: [number, number]): RootMove[] {
    const scored: RootMove[] = [];
    let alpha = -Infinity;
    const beta = Infinity;

    for (let i = 0; i < moves.length; i += 1) {
      const square = moves[i]!;
      const flips = this.board.play(0, 1, square, this.flipScratch);
      const next = this.applyHash(hash, square, this.flipScratch, 0);
      let score: number;
      if (i === 0) {
        score = -this.negamax(1, depth - 1, -beta, -alpha, next, 1, false);
      } else {
        // Principal variation search: everything after the first move is tried
        // in a null window and only re-searched if it beats alpha.
        score = -this.negamax(1, depth - 1, -alpha - 1, -alpha, next, 1, false);
        if (score > alpha && !this.aborted) {
          score = -this.negamax(1, depth - 1, -beta, -alpha, next, 1, false);
        }
      }
      void flips;
      if (this.aborted) { scored.push({ square, score: -Infinity }); continue; }
      scored.push({ square, score });
      if (score > alpha) alpha = score;
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  private negamax(
    slot: number,
    depth: number,
    alpha: number,
    beta: number,
    hash: [number, number],
    ply: number,
    passed: boolean,
  ): number {
    this.nodes += 1;
    if ((this.nodes & (CHECK_EVERY - 1)) === 0 && this.timeUp()) this.aborted = true;
    if (this.aborted) return 0;

    const empties = this.board.emptyCount(slot);
    if (depth <= 0 || slot >= MAX_SLOTS - 2) return this.leaf(slot, empties);

    const index = (hash[0] ^ (hash[1] * 0x9e37)) & TT_MASK;
    const meta = this.ttGen[index] === this.generation ? this.ttMeta[index]! : 0;
    let ttMove = NO_MOVE;
    if (meta !== 0 && this.ttKeyLo[index] === hash[0] && this.ttKeyHi[index] === hash[1]) {
      const storedDepth = (meta - 1) >> 2;
      const flag = (meta - 1) & 3;
      ttMove = this.ttMove[index]!;
      if (storedDepth >= depth) {
        const score = this.ttScore[index]!;
        if (flag === EXACT) return score;
        if (flag === LOWER && score >= beta) return score;
        if (flag === UPPER && score <= alpha) return score;
      }
    }

    const buffer = this.moveBuffers[ply]!;
    const count = this.board.genMoves(slot, buffer);
    if (count === 0) {
      // Nobody can move: the game is over and the score is the real one.
      if (passed) return this.finalScore(slot);
      this.board.pass(slot, slot + 1);
      const next: [number, number] = [hash[0] ^ KEYS.sideLo, hash[1] ^ KEYS.sideHi];
      return -this.negamax(slot + 1, depth, -beta, -alpha, next, ply + 1, true);
    }

    const order = this.orderMoves(slot, buffer, count, ttMove, ply, depth);
    const originalAlpha = alpha;
    let best = -Infinity;
    let bestMove = order[0]!;

    for (let i = 0; i < count; i += 1) {
      const square = order[i]!;
      this.board.play(slot, slot + 1, square, this.flipScratch);
      const next = this.applyHash(hash, square, this.flipScratch, slot);
      let score: number;
      if (i === 0) {
        score = -this.negamax(slot + 1, depth - 1, -beta, -alpha, next, ply + 1, false);
      } else {
        score = -this.negamax(slot + 1, depth - 1, -alpha - 1, -alpha, next, ply + 1, false);
        if (score > alpha && score < beta && !this.aborted) {
          score = -this.negamax(slot + 1, depth - 1, -beta, -alpha, next, ply + 1, false);
        }
      }
      if (this.aborted) return 0;

      if (score > best) { best = score; bestMove = square; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        // A quiet move that causes a cutoff is worth trying first at the same
        // ply elsewhere in the tree.
        const slotIndex = ply * 2;
        if (this.killers[slotIndex] !== square) {
          this.killers[slotIndex + 1] = this.killers[slotIndex]!;
          this.killers[slotIndex] = square;
        }
        break;
      }
    }

    const flag = best <= originalAlpha ? UPPER : best >= beta ? LOWER : EXACT;
    this.store(index, hash, depth, flag, best, bestMove);
    return best;
  }

  /** Replace on depth: a deeper result is always worth more than a shallow one. */
  private store(index: number, hash: [number, number], depth: number, flag: number, score: number, move: Square): void {
    const existing = this.ttGen[index] === this.generation ? this.ttMeta[index]! : 0;
    if (existing !== 0 && ((existing - 1) >> 2) > depth
      && (this.ttKeyLo[index] !== hash[0] || this.ttKeyHi[index] !== hash[1])) {
      return;
    }
    this.ttGen[index] = this.generation;
    this.ttKeyLo[index] = hash[0];
    this.ttKeyHi[index] = hash[1];
    this.ttMeta[index] = ((depth << 2) | flag) + 1;
    this.ttScore[index] = Math.max(-2_000_000_000, Math.min(2_000_000_000, Math.round(score)));
    this.ttMove[index] = move;
  }

  /**
   * TT move first, then corners, then the move that leaves the opponent fewest
   * replies, then the killers. Ordering by resulting mobility means playing each
   * move, so it is only paid for where it earns its keep.
   */
  private orderMoves(
    slot: number,
    buffer: Int32Array,
    count: number,
    ttMove: Square,
    ply: number,
    depth: number,
  ): Int32Array {
    const killerA = this.killers[ply * 2]!;
    const killerB = this.killers[ply * 2 + 1]!;
    const deep = depth >= 3;

    for (let i = 0; i < count; i += 1) {
      const square = buffer[i]!;
      let score = 0;
      if (square === ttMove) score = 1 << 24;
      else if (square === 0 || square === 7 || square === 56 || square === 63) score = 1 << 20;
      else if (square === killerA) score = 1 << 18;
      else if (square === killerB) score = 1 << 17;
      if (deep) {
        this.board.play(slot, MAX_SLOTS - 1, square, this.flipScratch);
        score += 4096 - this.board.mobility(MAX_SLOTS - 1) * 64;
      }
      this.orderScores[i] = score;
    }

    // Insertion sort: the lists are at most 32 long and usually far shorter, and
    // this keeps the move buffer in place rather than allocating a sorted copy.
    for (let i = 1; i < count; i += 1) {
      const move = buffer[i]!;
      const score = this.orderScores[i]!;
      let j = i - 1;
      while (j >= 0 && this.orderScores[j]! < score) {
        buffer[j + 1] = buffer[j]!;
        this.orderScores[j + 1] = this.orderScores[j]!;
        j -= 1;
      }
      buffer[j + 1] = move;
      this.orderScores[j + 1] = score;
    }
    return buffer;
  }

  private leaf(slot: number, empties: number): number {
    if (empties === 0) return this.finalScore(slot);
    return this.sign * evaluate(this.board, slot);
  }

  /** Disc difference from the mover's side, scaled so a win outranks any eval. */
  private finalScore(slot: number): number {
    const mine = this.board.discCount(slot, 0);
    const theirs = this.board.discCount(slot, 1);
    const empties = 64 - mine - theirs;
    // Tournament convention: the empties go to whoever is ahead, which is what
    // makes an exact endgame score match the result the player is shown.
    const diff = mine === theirs ? 0 : mine > theirs ? mine + empties - theirs : mine - (theirs + empties);
    const signed = this.sign * diff;
    if (this.wldMode) return Math.sign(signed) * WIN_SCORE;
    return signed === 0 ? 0 : Math.sign(signed) * WIN_SCORE + signed * 1000;
  }

  private applyHash(hash: [number, number], square: Square, flips: Int32Array, slot: number): [number, number] {
    void slot;
    let lo = hash[0] ^ KEYS.sideLo;
    let hi = hash[1] ^ KEYS.sideHi;
    // The mover's key is index 0..63, the opponent's 64..127. A flipped disc
    // leaves one set and joins the other, so both keys toggle.
    lo ^= KEYS.lo[square]!;
    hi ^= KEYS.hi[square]!;
    for (const [word, base] of [[flips[1]!, 0], [flips[0]!, 32]] as const) {
      let bits = word;
      while (bits !== 0) {
        const bit = bits & -bits;
        const s = base + trailingZeros(bit);
        lo ^= KEYS.lo[s]! ^ KEYS.lo[64 + s]!;
        hi ^= KEYS.hi[s]! ^ KEYS.hi[64 + s]!;
        bits ^= bit;
      }
    }
    return [lo | 0, hi | 0];
  }

  private timeUp(): boolean {
    if (this.signal?.aborted) return true;
    return this.now() >= this.deadline;
  }
}

function depthsUpTo(max: number): number[] {
  const out: number[] = [];
  for (let depth = 1; depth <= max; depth += 1) out.push(depth);
  return out;
}

function trailingZeros(bit: number): number {
  return 31 - Math.clz32(bit & -bit);
}

function hashOf(board: FastBoard, slot: number, turn: Color): [number, number] {
  let lo = turn === BLACK ? 0 : KEYS.sideLo;
  let hi = turn === BLACK ? 0 : KEYS.sideHi;
  for (const side of [0, 1] as const) {
    const base = side * 64;
    for (const [word, offset] of [[board.lo(slot, side), 0], [board.hi(slot, side), 32]] as const) {
      let bits = word;
      while (bits !== 0) {
        const bit = bits & -bits;
        const square = offset + trailingZeros(bit);
        lo ^= KEYS.lo[base + square]!;
        hi ^= KEYS.hi[base + square]!;
        bits ^= bit;
      }
    }
  }
  return [lo | 0, hi | 0];
}

export { popcount64 };
