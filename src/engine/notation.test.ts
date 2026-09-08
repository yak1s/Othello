import { describe, expect, it } from 'vitest';
import { fromName, parse, serialize, toName } from './notation';
import { canRedo, canUndo, newGame, play, redo, undo } from './game';
import { initial, isTerminal, legalMoves } from './rules';
import { prng } from './testkit';
import type { Game } from './types';

describe('square names', () => {
  it('round-trips every square on the board', () => {
    for (let s = 0; s < 64; s += 1) expect(fromName(toName(s))).toBe(s);
  });

  it('anchors the corners and the opening four', () => {
    expect(toName(0)).toBe('a1');
    expect(toName(7)).toBe('h1');
    expect(toName(56)).toBe('a8');
    expect(toName(63)).toBe('h8');
    expect(fromName('d4')).toBe(27);
    expect(fromName('e4')).toBe(28);
    expect(fromName('d5')).toBe(35);
    expect(fromName('e5')).toBe(36);
  });

  it('refuses anything off the board or malformed', () => {
    for (const bad of ['i1', 'a9', 'a0', '', 'd', 'd44', '4d', 'zz']) {
      expect(() => fromName(bad)).toThrow();
    }
  });
});

describe('transcripts', () => {
  const playOut = (seed: number): Game => {
    const random = prng(seed);
    let game = newGame();
    while (!isTerminal(game.position)) {
      const moves = legalMoves(game.position);
      if (moves.length === 0) break;
      game = play(game, moves[Math.floor(random() * moves.length)]!);
    }
    return game;
  };

  it('is the played squares, lower case, with passes left out', () => {
    let g = newGame();
    for (const m of ['d3', 'c5', 'b6', 'c3']) g = play(g, fromName(m));
    expect(serialize(g)).toBe('d3c5b6c3');
  });

  it('round-trips losslessly, including the plies and their reconstructed passes', () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const original = playOut(seed);
      const text = serialize(original);
      const back = parse(text);

      expect(serialize(back)).toBe(text);
      expect(back.position.black).toBe(original.position.black);
      expect(back.position.white).toBe(original.position.white);
      expect(back.position.turn).toBe(original.position.turn);
      expect(back.position.moveNumber).toBe(original.position.moveNumber);
      expect(back.position.hash).toBe(original.position.hash);
      expect(back.history.length).toBe(original.history.length);
      original.history.forEach((ply, i) => {
        const other = back.history[i]!;
        expect(other.move).toBe(ply.move);
        expect(other.by).toBe(ply.by);
        expect(other.passedBy).toBe(ply.passedBy);
        expect([...other.flipped].sort()).toEqual([...ply.flipped].sort());
      });
    }
  });

  it('round-trips a game that actually contains a forced pass', () => {
    let withPass: Game | null = null;
    for (let seed = 1; seed <= 400 && !withPass; seed += 1) {
      const g = playOut(seed);
      // A pass mid-game, not just the one the final position may record.
      if (g.history.slice(0, -1).some((p) => p.passedBy !== undefined)) withPass = g;
    }
    expect(withPass).not.toBeNull();
    const text = serialize(withPass!);
    const back = parse(text);
    expect(back.history.filter((p) => p.passedBy !== undefined).length)
      .toBe(withPass!.history.filter((p) => p.passedBy !== undefined).length);
    expect(back.position.hash).toBe(withPass!.position.hash);
  });

  it('parses an empty transcript as a fresh game', () => {
    const g = parse('');
    expect(g.position.hash).toBe(initial().hash);
    expect(g.history).toEqual([]);
  });

  it('rejects a transcript containing an illegal move', () => {
    expect(() => parse('d3a1')).toThrow();
    expect(() => parse('a1')).toThrow();
  });

  it('rejects a malformed transcript', () => {
    expect(() => parse('d3c')).toThrow();
    expect(() => parse('d3zz')).toThrow();
  });

  it('accepts upper case, because a shared code should not care', () => {
    expect(serialize(parse('D3C5'))).toBe('d3c5');
  });
});

describe('the history stack', () => {
  it('undoes and redoes exactly, and playing clears the redo stack', () => {
    let g = newGame();
    const opening = g.position.hash;
    g = play(g, fromName('d3'));
    const afterOne = g.position.hash;
    g = play(g, fromName('c5'));

    let back = undo(g);
    expect(back.position.hash).toBe(afterOne);
    back = undo(back);
    expect(back.position.hash).toBe(opening);
    expect(canUndo(back)).toBe(false);
    expect(canRedo(back)).toBe(true);

    expect(redo(redo(back)).position.hash).toBe(g.position.hash);
    // Playing a different move from the undone position drops the future.
    const diverged = play(back, fromName('c4'));
    expect(canRedo(diverged)).toBe(false);
  });
});
