import { describe, expect, it } from 'vitest';
import { apply, initial, isTerminal, legalMoves, outcome, score, terminalReason } from './rules';
import { fromName, toName } from './notation';
import { fromDiagram, prng } from './testkit';
import { BLACK, WHITE, type PositionState } from './types';

describe('passing', () => {
  it('skips a player who has no legal move and says who was skipped', () => {
    // Search the opening tree in a fixed order for the first forced pass, then
    // check the rule end to end. Finding one at all is part of the assertion:
    // an engine that never sets passedBy would fail here.
    const found = (() => {
      const stack: PositionState[] = [initial()];
      for (let depth = 0; depth < 12 && stack.length; depth += 1) {
        const next: PositionState[] = [];
        for (const state of stack) {
          for (const move of legalMoves(state)) {
            const r = apply(state, move);
            if (r.passedBy !== undefined && !isTerminal(r.state)) {
              return { before: state, move, ...r };
            }
            next.push(r.state);
          }
        }
        stack.length = 0;
        stack.push(...next.slice(0, 4000));
      }
      return null;
    })();

    expect(found).not.toBeNull();
    const { before, move, state, passedBy } = found!;
    const mover = before.turn;
    expect(passedBy).toBe(mover === BLACK ? WHITE : BLACK);
    // The skipped player really has nothing, and the mover really does.
    expect(legalMoves({ ...state, turn: passedBy! })).toEqual([]);
    expect(legalMoves(state).length).toBeGreaterThan(0);
    // The turn stayed with the mover: they play again.
    expect(state.turn).toBe(mover);
    expect(toName(move)).toMatch(/^[a-h][1-8]$/);
  });

  it('ends the game when neither side can move and squares are still empty', () => {
    // Two isolated same-colour blocks in opposite corners. No ray from any empty
    // square runs through the opponent and lands on the mover, either way round.
    const s = fromDiagram(`
      xx......
      xx......
      ........
      ........
      ........
      ........
      ......oo
      ......oo`, BLACK);
    expect(legalMoves(s)).toEqual([]);
    expect(legalMoves({ ...s, turn: WHITE })).toEqual([]);
    expect(terminalReason(s)).toBe('both-pass');
    expect(isTerminal(s)).toBe(true);
    expect(score(s)).toEqual({ black: 4, white: 4, empty: 56 });
    expect(outcome(s)).toEqual({ kind: 'draw', reason: 'both-pass' });
  });
});

describe('wipeout', () => {
  const wiped = (() => {
    const s = fromDiagram(`
      ........
      ........
      ........
      ...xo...
      ........
      ........
      ........
      ........`, BLACK);
    return apply(s, fromName('f4')).state;
  })();

  it('ends the game the moment a colour has no discs left', () => {
    expect(score(wiped)).toEqual({ black: 3, white: 0, empty: 61 });
    expect(terminalReason(wiped)).toBe('wipeout');
    expect(isTerminal(wiped)).toBe(true);
  });

  it('is where the two scoring conventions legitimately disagree', () => {
    expect(score(wiped, 'discs')).toEqual({ black: 3, white: 0, empty: 61 });
    expect(score(wiped, 'tournament')).toEqual({ black: 64, white: 0, empty: 0 });
    const discs = score(wiped, 'discs');
    expect(discs.black + discs.white + discs.empty).toBe(64);
    const tourney = score(wiped, 'tournament');
    expect(tourney.black + tourney.white).toBe(64);
  });

  it('is a Black win as standard Reversi and a White win in reverse', () => {
    expect(outcome(wiped, 'standard')).toEqual({ kind: 'win', winner: BLACK, reason: 'wipeout' });
    expect(outcome(wiped, 'reverse')).toEqual({ kind: 'win', winner: WHITE, reason: 'wipeout' });
  });
});

describe('a full board', () => {
  it('is terminal, and reachable on the small board the engine also supports', () => {
    // The engine is size-agnostic, so 4×4 is both a real test of that and the
    // cheapest way to reach a genuinely full board by playing it out.
    const random = prng(20260908);
    let reasons = new Set<string>();
    for (let game = 0; game < 400; game += 1) {
      let state = initial(4);
      while (!isTerminal(state)) {
        const moves = legalMoves(state);
        if (moves.length === 0) break;
        state = apply(state, moves[Math.floor(random() * moves.length)]!).state;
      }
      const reason = terminalReason(state);
      if (reason) reasons.add(reason);
      const s = score(state);
      expect(s.black + s.white + s.empty).toBe(16);
    }
    expect(reasons.has('board-full')).toBe(true);
  });

  it('is terminal on a hand-built full 4×4', () => {
    const s = fromDiagram(`
      xxxx
      xoox
      xoox
      xxxo`, BLACK);
    expect(terminalReason(s)).toBe('board-full');
    expect(legalMoves(s)).toEqual([]);
    expect(score(s)).toEqual({ black: 11, white: 5, empty: 0 });
    expect(outcome(s)).toEqual({ kind: 'win', winner: BLACK, reason: 'board-full' });
  });
});

describe('scoring conventions', () => {
  it('agrees on a full board', () => {
    const s = fromDiagram(`
      xxxx
      xoox
      xoox
      xxxo`, BLACK);
    expect(score(s, 'discs')).toEqual(score(s, 'tournament'));
  });

  it('splits the empties on a tie so the tournament total still holds', () => {
    const s = fromDiagram(`
      xx......
      xx......
      ........
      ........
      ........
      ........
      ......oo
      ......oo`, BLACK);
    expect(score(s, 'tournament')).toEqual({ black: 32, white: 32, empty: 0 });
  });

  it('reports no outcome while the game is still running', () => {
    expect(outcome(initial())).toBeNull();
    expect(terminalReason(initial())).toBeNull();
  });
});
