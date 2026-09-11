import { describe, expect, it } from 'vitest';
import { LEVEL_NAMES, TOP_LEVEL, afterGame, ladderLine, lockedReason } from './ladder';
import type { Level } from './types';

const LEVELS: Level[] = [1, 2, 3, 4, 5, 6];

describe('the ladder', () => {
  it('starts with only the first level open', () => {
    expect(lockedReason(1, 1)).toBeNull();
    for (const level of LEVELS.slice(1)) expect(lockedReason(1, level)).not.toBeNull();
  });

  it('opens the next level when you beat the one you are on', () => {
    const { unlockedLevel, note } = afterGame(1, 1, true);
    expect(unlockedLevel).toBe(2);
    expect(note).toBe('Level 2, Casual, is now open.');
  });

  it('does not open anything for a loss or a draw', () => {
    expect(afterGame(3, 3, false)).toEqual({ unlockedLevel: 3, note: null });
  });

  it('does not skip ahead when you beat a level you already passed', () => {
    expect(afterGame(4, 2, true)).toEqual({ unlockedLevel: 4, note: null });
  });

  it('cannot be raced past the level you are on', () => {
    // Nothing can hand you level 5 while you are on 2: a locked level cannot be
    // played, and a win at one below the frontier is not the frontier.
    expect(afterGame(2, 1, true).unlockedLevel).toBe(2);
    expect(afterGame(2, 5, true).unlockedLevel).toBe(2);
  });

  it('stops at the top and stays there', () => {
    expect(afterGame(TOP_LEVEL, TOP_LEVEL, true)).toEqual({ unlockedLevel: 6, note: null });
    expect(ladderLine(TOP_LEVEL)).toContain('Every level is open');
  });

  it('walks the whole ladder one win at a time', () => {
    let unlocked: Level = 1;
    const opened: Level[] = [1];
    for (let i = 0; i < 20; i += 1) {
      const step = afterGame(unlocked, unlocked, true);
      if (step.unlockedLevel !== unlocked) opened.push(step.unlockedLevel);
      unlocked = step.unlockedLevel;
    }
    expect(opened).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('names every level and locks each behind the one before it', () => {
    for (const level of LEVELS.slice(1)) {
      expect(lockedReason(level - 1 as Level, level))
        .toBe(`Beat ${LEVEL_NAMES[(level - 1) as Level]} to open this.`);
    }
  });

  it('counts progress in the sheet line', () => {
    expect(ladderLine(3)).toBe('Beat a level to open the next one. 3 of 6 so far.');
  });
});
