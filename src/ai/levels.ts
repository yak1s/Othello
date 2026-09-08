/* ============================================================================
   The six levels (brief §7).

   Weakness has to be believable. A weak player does not choose uniformly at
   random — they see less far and they misjudge, so the weak levels here get a
   shallower horizon plus a controlled error model: with some probability the
   move is sampled from the root moves by softmax over their scores, at a
   temperature that widens as the level drops. Level 1 additionally finds an
   X-square tempting, which is the mistake a real beginner actually makes.
   ========================================================================= */

import type { RootMove, SearchOptions } from './search';
import type { Level } from '../data/types';
import type { Variant } from '../engine/types';

export interface LevelSpec {
  level: Level;
  name: string;
  budgetMs: number;
  maxDepth: number;
  exactEmpties: number;
  wldEmpties: number;
  /** How often the move is sampled rather than simply taken from the top. */
  offBest: number;
  /** Softmax temperature, in evaluation units. Wider means flatter sampling. */
  temperature: number;
  /** Extra weight an X-square gets while its corner is empty. Level 1 only. */
  xSquareBias: number;
  useBook: boolean;
}

const X_SQUARES: ReadonlySet<number> = new Set([9, 14, 49, 54]);
const CORNER_OF: Readonly<Record<number, number>> = { 9: 0, 14: 7, 49: 56, 54: 63 };

/**
 * The endgame thresholds are the table's, read as the *exact* depth. Levels 5
 * and 6 additionally solve win/loss/draw a few empties earlier than that, which
 * is what the brief's "exact score at ≤14, win/loss/draw at ≤20" describes.
 */
export const LEVELS: Readonly<Record<Level, LevelSpec>> = {
  1: { level: 1, name: 'Beginner', budgetMs: 120, maxDepth: 2, exactEmpties: 0, wldEmpties: 0, offBest: 0.18, temperature: 9000, xSquareBias: 2.5, useBook: false },
  2: { level: 2, name: 'Casual', budgetMs: 200, maxDepth: 3, exactEmpties: 0, wldEmpties: 0, offBest: 0.10, temperature: 2600, xSquareBias: 0, useBook: false },
  3: { level: 3, name: 'Club', budgetMs: 400, maxDepth: 6, exactEmpties: 8, wldEmpties: 8, offBest: 0.04, temperature: 2000, xSquareBias: 0, useBook: true },
  4: { level: 4, name: 'Strong', budgetMs: 800, maxDepth: 9, exactEmpties: 12, wldEmpties: 14, offBest: 0.01, temperature: 900, xSquareBias: 0, useBook: true },
  5: { level: 5, name: 'Expert', budgetMs: 1500, maxDepth: 12, exactEmpties: 16, wldEmpties: 20, offBest: 0, temperature: 0, xSquareBias: 0, useBook: true },
  6: { level: 6, name: 'Merciless', budgetMs: 2500, maxDepth: Infinity, exactEmpties: 20, wldEmpties: 24, offBest: 0, temperature: 0, xSquareBias: 0, useBook: true },
};

export function searchOptionsFor(level: Level, variant: Variant): SearchOptions {
  const spec = LEVELS[level];
  return {
    budgetMs: spec.budgetMs,
    maxDepth: spec.maxDepth,
    exactEmpties: spec.exactEmpties,
    wldEmpties: spec.wldEmpties,
    variant,
  };
}

/**
 * Pick the move actually played, given every root move scored by the search.
 *
 * `ranked` must be best first. `emptyCorners` names the corners still unclaimed,
 * so the level-1 X-square temptation only applies while the corner it gives away
 * is actually available.
 */
export function chooseMove(
  ranked: readonly RootMove[],
  spec: LevelSpec,
  random: () => number,
  emptyCorners: ReadonlySet<number>,
): number {
  const best = ranked[0];
  if (!best) throw new Error('chooseMove needs at least one root move');
  if (ranked.length === 1 || spec.offBest <= 0) return best.square;
  if (random() >= spec.offBest) return best.square;

  // Sample by softmax over the score deficit, so a move that is nearly as good
  // is picked far more often than one that is clearly bad. This is what makes a
  // weak level read as a weak player rather than a broken one.
  const weights = ranked.map((move) => {
    const deficit = best.score - move.score;
    let weight = Math.exp(-deficit / Math.max(1, spec.temperature));
    if (spec.xSquareBias > 0 && X_SQUARES.has(move.square)) {
      const corner = CORNER_OF[move.square];
      if (corner !== undefined && emptyCorners.has(corner)) weight *= spec.xSquareBias;
    }
    return weight;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total <= 0) return best.square;
  let pick = random() * total;
  for (let i = 0; i < ranked.length; i += 1) {
    pick -= weights[i]!;
    if (pick <= 0) return ranked[i]!.square;
  }
  return best.square;
}

export const CORNERS: readonly number[] = [0, 7, 56, 63];
