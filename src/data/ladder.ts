/* ============================================================================
   The ladder.

   The computer's six levels are earned one at a time: beating the level you are
   on opens the next one, and nothing else does. Beating a level you have
   already passed changes nothing, a draw is not a win, and a level you have
   opened stays open — losing never takes one back.

   Kept apart from the shell so the rule is one pure function and can be tested
   without a DOM. Reverse Reversi counts, because `rules.outcome` has already
   applied the variant before the result reaches here.
   ========================================================================= */

import type { Level } from './types';

export const TOP_LEVEL: Level = 6;

export const LEVEL_NAMES: Readonly<Record<Level, string>> = {
  1: 'Beginner',
  2: 'Casual',
  3: 'Club',
  4: 'Strong',
  5: 'Expert',
  6: 'Merciless',
};

export interface Unlock {
  readonly unlockedLevel: Level;
  /** What to tell the person, or null when nothing changed. */
  readonly note: string | null;
}

/**
 * @param unlocked the highest level currently open
 * @param level    the level just played
 * @param won      whether the person, not the computer, won it
 */
export function afterGame(unlocked: Level, level: Level, won: boolean): Unlock {
  if (!won || level !== unlocked || unlocked >= TOP_LEVEL) {
    return { unlockedLevel: unlocked, note: null };
  }
  const next = (unlocked + 1) as Level;
  return { unlockedLevel: next, note: `Level ${next}, ${LEVEL_NAMES[next]}, is now open.` };
}

/** The line under the title of the computer sheet. */
export function ladderLine(unlocked: Level): string {
  return unlocked >= TOP_LEVEL
    ? 'Every level is open. Merciless does not hold back.'
    : `Beat a level to open the next one. ${unlocked} of ${TOP_LEVEL} so far.`;
}

/** Why a row cannot be tapped, or null when it can. */
export function lockedReason(unlocked: Level, level: Level): string | null {
  return level <= unlocked ? null : `Beat ${LEVEL_NAMES[(level - 1) as Level]} to open this.`;
}
