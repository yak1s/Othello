import { describe, expect, it } from 'vitest';
import { Search, type SearchOptions } from './search';
import { LEVELS, chooseMove, searchOptionsFor } from './levels';
import { BOOK, bookMove } from './book';
import { WIN_SCORE } from './eval';
import { apply, initial, isLegal, isTerminal, legalMoves, notation, score } from '../engine';
import { fromDiagram, prng } from '../engine/testkit';
import type { PositionState } from '../engine/types';
import type { Level } from '../data/types';

const CORNERS = new Set([0, 7, 56, 63]);
const emptyCorners = (state: PositionState): Set<number> =>
  new Set([...CORNERS].filter((s) => ((state.black | state.white) & (1n << BigInt(s))) === 0n));

/** A deliberately tiny budget: the point is to exercise every path, many times. */
const fast = (variant: 'standard' | 'reverse' = 'standard'): SearchOptions => ({
  budgetMs: 4, maxDepth: 4, exactEmpties: 8, wldEmpties: 10, variant,
});

describe('the search never plays an illegal move', () => {
  /**
   * Brief §16 asks for a thousand self-play games. The loop yields to the event
   * loop every so often: a multi-minute block of uninterrupted synchronous work
   * starves vitest's progress channel, and it then reports an RPC timeout that
   * looks like a failure but is not one.
   */
  it('across 1,000 self-play games', async () => {
    const search = new Search();
    const random = prng(0xa11ce);
    let moves = 0;

    for (let game = 0; game < 1000; game += 1) {
      if (game % 50 === 0) await new Promise((resolve) => { setTimeout(resolve, 0); });
      let state = initial();
      const spec = LEVELS[((game % 6) + 1) as Level];
      while (!isTerminal(state)) {
        const legal = legalMoves(state);
        if (legal.length === 0) break;
        const result = search.search(state, fast());
        expect(result.best).toBeGreaterThanOrEqual(0);
        const chosen = chooseMove(result.ranked, spec, random, emptyCorners(state));
        if (!isLegal(state, chosen)) {
          throw new Error(`game ${game}: illegal move ${chosen} in ${state.black}/${state.white}`);
        }
        // Every scored root move must itself be legal: the error model samples
        // from this list, so a stray entry would eventually be played.
        for (const entry of result.ranked) {
          if (!isLegal(state, entry.square)) throw new Error(`illegal root move ${entry.square}`);
        }
        state = apply(state, chosen).state;
        moves += 1;
      }
    }
    expect(moves).toBeGreaterThan(50_000);
  }, 300_000);

  it('and never crashes on a position where the mover must pass', () => {
    const search = new Search();
    // White to move with nothing to play: the caller should not ask, but asking
    // must return "no move" rather than throwing or inventing one.
    const stuck = fromDiagram(`
      xx......
      xx......
      ........
      ........
      ........
      ........
      ......oo
      ......oo`, 1);
    const result = search.search(stuck, fast());
    expect(result.best).toBe(-1);
    expect(result.ranked).toEqual([]);
  });
});

describe('time and abort', () => {
  it('respects its budget', () => {
    const search = new Search();
    const state = initial();
    for (const budget of [20, 80, 200]) {
      const started = Date.now();
      search.search(state, { budgetMs: budget, maxDepth: 64, exactEmpties: 0, wldEmpties: 0, variant: 'standard' });
      // One depth can overrun the deadline before its next time check; a whole
      // extra budget on top of it would mean the check is not working.
      expect(Date.now() - started).toBeLessThan(budget * 3 + 250);
    }
  });

  it('stops when the signal is raised', () => {
    const search = new Search();
    const signal = { aborted: true };
    const started = Date.now();
    const result = search.search(initial(), {
      budgetMs: 5000, maxDepth: 64, exactEmpties: 0, wldEmpties: 0, variant: 'standard', signal,
    });
    expect(Date.now() - started).toBeLessThan(500);
    expect(result.ranked.length).toBeGreaterThan(0);
  });
});

/**
 * An exhaustive solver over the rules engine — slow, obviously correct, and
 * completely independent of the search. It is the yardstick the endgame solver
 * is measured against.
 */
function exactResult(state: PositionState, passed = false): number {
  if (isTerminal(state)) {
    const s = score(state, 'tournament');
    const mine = state.turn === 0 ? s.black : s.white;
    return mine - (64 - mine);
  }
  const legal = legalMoves(state);
  if (legal.length === 0) {
    if (passed) return 0;
    return -exactResult({ ...state, turn: state.turn === 0 ? 1 : 0 }, true);
  }
  let best = -Infinity;
  for (const move of legal) {
    const next = apply(state, move).state;
    // The engine keeps the turn when the opponent is stuck, so the result is
    // only negated when the side to move actually changed.
    const value = next.turn === state.turn ? exactResult(next) : -exactResult(next);
    best = Math.max(best, value);
  }
  return best;
}

describe('the endgame solver', () => {
  it('agrees exactly with an exhaustive search over the rules engine', () => {
    const search = new Search();
    const random = prng(0xe4d6a);
    let checked = 0;

    // Play forward to a small number of empties, then solve both ways.
    for (let attempt = 0; attempt < 12 && checked < 4; attempt += 1) {
      let state = initial();
      while (!isTerminal(state) && score(state).empty > 9) {
        const legal = legalMoves(state);
        if (legal.length === 0) break;
        state = apply(state, legal[Math.floor(random() * legal.length)]!).state;
      }
      if (isTerminal(state) || legalMoves(state).length === 0) continue;

      const truth = exactResult(state);
      const result = search.search(state, {
        budgetMs: 20_000, maxDepth: 64, exactEmpties: 24, wldEmpties: 24, variant: 'standard',
      });
      expect(result.exact).toBe(true);

      // The search reports a win/loss magnitude plus the disc margin; recover the
      // margin and compare it against the independent answer.
      const margin = result.score === 0 ? 0 : (result.score - Math.sign(result.score) * WIN_SCORE) / 1000;
      expect(Math.sign(margin)).toBe(Math.sign(truth));
      expect(margin).toBe(truth);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  }, 180_000);
});

describe('reverse Reversi', () => {
  it('prefers the opposite outcome to the standard search', () => {
    const search = new Search();
    const random = prng(7);
    let state = initial();
    for (let ply = 0; ply < 30 && !isTerminal(state); ply += 1) {
      const legal = legalMoves(state);
      if (legal.length === 0) break;
      state = apply(state, legal[Math.floor(random() * legal.length)]!).state;
    }
    const standard = search.search(state, { ...fast(), budgetMs: 200, maxDepth: 5 });
    const reverse = search.search(state, { ...fast('reverse'), budgetMs: 200, maxDepth: 5 });
    // Same legal moves, opposite ordering objective: the two rankings should not
    // agree on the whole ordering, or the sign is not being applied.
    const a = standard.ranked.map((m) => m.square).join(',');
    const b = reverse.ranked.map((m) => m.square).join(',');
    expect(standard.ranked.length).toBe(reverse.ranked.length);
    expect(a).not.toBe(b);
  });
});

describe('the level error model', () => {
  const ranked = [
    { square: 19, score: 1000 },
    { square: 26, score: 900 },
    { square: 37, score: -200 },
    { square: 44, score: -3000 },
  ];
  const sample = (level: Level, seed: number, n: number): number[] => {
    const random = prng(seed);
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) out.push(chooseMove(ranked, LEVELS[level], random, new Set([0, 7, 56, 63])));
    return out;
  };

  it('is deterministic under a seeded source', () => {
    expect(sample(1, 42, 200)).toEqual(sample(1, 42, 200));
  });

  it('never deviates from best at levels 5 and 6', () => {
    for (const level of [5, 6] as Level[]) {
      expect(new Set(sample(level, 11, 500))).toEqual(new Set([19]));
    }
  });

  it('deviates more often the weaker the level', () => {
    const rate = (level: Level): number =>
      sample(level, 99, 4000).filter((square) => square !== 19).length / 4000;
    const beginner = rate(1);
    const club = rate(3);
    const strong = rate(4);
    expect(beginner).toBeGreaterThan(club);
    expect(club).toBeGreaterThan(strong);
    // Within a reasonable band of the tabulated off-best rates.
    expect(beginner).toBeGreaterThan(0.08);
    expect(beginner).toBeLessThan(0.2);
    expect(strong).toBeLessThan(0.02);
  });

  it('prefers a near-best move to a bad one when it does deviate', () => {
    const picks = sample(2, 5, 4000).filter((square) => square !== 19);
    const near = picks.filter((square) => square === 26).length;
    const bad = picks.filter((square) => square === 44).length;
    expect(near).toBeGreaterThan(bad * 2);
    expect(near / picks.length).toBeGreaterThan(0.45);
  });

  it('tempts level 1 onto an X-square only while the corner is open', () => {
    const withX = [{ square: 19, score: 1000 }, { square: 9, score: -900 }];
    const tempted = (corners: Set<number>): number => {
      const random = prng(3);
      let count = 0;
      for (let i = 0; i < 4000; i += 1) {
        if (chooseMove(withX, LEVELS[1], random, corners) === 9) count += 1;
      }
      return count;
    };
    expect(tempted(new Set([0]))).toBeGreaterThan(tempted(new Set()));
  });
});

describe('the opening book', () => {
  it('contains only legal lines', () => {
    for (const line of BOOK) {
      expect(() => notation.parse(line.moves)).not.toThrow();
    }
  });

  it('is consulted from level 3 up and ignored below it', () => {
    expect(LEVELS[1].useBook).toBe(false);
    expect(LEVELS[2].useBook).toBe(false);
    for (const level of [3, 4, 5, 6] as Level[]) expect(LEVELS[level].useBook).toBe(true);
  });

  it('varies its reply between games', () => {
    const random = prng(0xb00c);
    const replies = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const reply = bookMove('f5', random);
      if (reply) replies.add(reply);
    }
    // f5 continues into the diagonal, perpendicular and parallel families.
    expect(replies.size).toBeGreaterThanOrEqual(3);
  });

  it('returns null once the game has left the book', () => {
    expect(bookMove('a1', () => 0.5)).toBeNull();
    expect(bookMove('f5d6c3d3c4f4c5', () => 0.5)).toBeNull();
  });

  it('gives every level a sensible search configuration', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as Level[]) {
      const options = searchOptionsFor(level, 'standard');
      expect(options.budgetMs).toBe(LEVELS[level].budgetMs);
      expect(options.exactEmpties).toBeLessThanOrEqual(options.wldEmpties);
    }
  });
});
