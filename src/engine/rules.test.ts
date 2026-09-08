import { describe, expect, it } from 'vitest';
import { apply, initial, isLegal, legalMoves, score } from './rules';
import { fromName, toName } from './notation';
import { fromDiagram, sq } from './testkit';
import { BLACK, DIRECTIONS, WHITE } from './types';

const names = (squares: readonly number[]): string[] => squares.map((s) => toName(s)).sort();

describe('the opening position', () => {
  it('is White on d4 and e5, Black on d5 and e4, Black to move', () => {
    const s = initial();
    expect(names([...(function* () {
      for (let i = 0; i < 64; i += 1) if ((s.black & (1n << BigInt(i))) !== 0n) yield i;
    })()])).toEqual(['d5', 'e4']);
    expect(names([...(function* () {
      for (let i = 0; i < 64; i += 1) if ((s.white & (1n << BigInt(i))) !== 0n) yield i;
    })()])).toEqual(['d4', 'e5']);
    expect(s.turn).toBe(BLACK);
    expect(s.moveNumber).toBe(0);
  });

  it('gives Black exactly d3, c4, f5 and e6', () => {
    expect(names(legalMoves(initial()))).toEqual(['c4', 'd3', 'e6', 'f5']);
  });
});

describe('flips in every direction', () => {
  // For direction d, lay out P, P+d, P+2d, P+3d as empty, white, white, black
  // on an otherwise bare board, and start the ray where all four squares fit.
  const layout = (dx: number, dy: number) => {
    const f0 = dx > 0 ? 1 : dx < 0 ? 6 : 3;
    const r0 = dy > 0 ? 1 : dy < 0 ? 6 : 3;
    const at = (k: number) => sq(f0 + dx * k, r0 + dy * k);
    return { placed: at(0), captured: [at(1), at(2)] as const, anchor: at(3) };
  };

  const board = (blacks: number[], whites: number[]) => {
    const rows: string[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => '.'));
    for (const s of blacks) rows[Math.floor(s / 8)]![s % 8] = 'x';
    for (const s of whites) rows[Math.floor(s / 8)]![s % 8] = 'o';
    return fromDiagram(rows.map((r) => r.join('')).join('\n'), BLACK);
  };

  for (const [dx, dy] of DIRECTIONS) {
    it(`flips a run running (${dx}, ${dy})`, () => {
      const { placed, captured, anchor } = layout(dx, dy);
      const state = board([anchor], [...captured]);
      expect(isLegal(state, placed)).toBe(true);
      const r = apply(state, placed);
      expect(names(r.flipped)).toEqual(names(captured));
      expect(score(r.state)).toEqual({ black: 4, white: 0, empty: 60 });
    });

    it(`flips nothing running (${dx}, ${dy}) when the run ends in an empty square`, () => {
      const { placed, captured } = layout(dx, dy);
      const state = board([], [...captured]);
      expect(isLegal(state, placed)).toBe(false);
      expect(() => apply(state, placed)).toThrow(/captures nothing/);
    });
  }
});

describe('edges and corners', () => {
  it('captures along the top edge into the a1 corner', () => {
    const s = fromDiagram(`
      xoo.....
      ........
      ........
      ........
      ........
      ........
      ........
      ........`, BLACK);
    const r = apply(s, fromName('d1'));
    expect(names(r.flipped)).toEqual(['b1', 'c1']);
  });

  it('captures up the left edge into a8', () => {
    const s = fromDiagram(`
      ........
      ........
      ........
      ........
      ........
      o.......
      o.......
      x.......`, BLACK);
    const r = apply(s, fromName('a5'));
    expect(names(r.flipped)).toEqual(['a6', 'a7']);
  });

  it('captures into the h8 corner along the long diagonal', () => {
    const s = fromDiagram(`
      ........
      ........
      ........
      ........
      ....x...
      .....o..
      ......o.
      ........`, BLACK);
    const r = apply(s, fromName('h8'));
    expect(names(r.flipped)).toEqual(['f6', 'g7']);
  });

  it('never wraps around a rank boundary', () => {
    // h4 and a5 are adjacent in the linear index but not on the board, so a run
    // from g4 rightwards must die at the edge rather than continue onto rank 5.
    const s = fromDiagram(`
      ........
      ........
      ........
      .....xoo
      x.......
      ........
      ........
      ........`, BLACK);
    expect(isLegal(s, fromName('a5'))).toBe(false);
    expect(legalMoves(s).map((m) => toName(m))).not.toContain('a5');
  });
});

describe('multi-direction capture', () => {
  it('flips every direction that closes, and only those', () => {
    // d4 closes north (d3, d2 onto d1), east (e4, f4 onto g4) and south-east
    // (e5 onto f6). West runs into an empty b4 and must flip nothing.
    const s = fromDiagram(`
      ...x....
      ...o....
      ...o....
      ..o.oox.
      ....o...
      .....x..
      ........
      ........`, BLACK);
    const r = apply(s, fromName('d4'));
    expect(names(r.flipped)).toEqual(['d2', 'd3', 'e4', 'e5', 'f4']);
    // c4 is still White: the westward run never closed.
    expect(names(r.flipped)).not.toContain('c4');
  });
});

describe('flips do not chain', () => {
  it('leaves a disc that only a just-flipped disc would have captured', () => {
    // Placing at c4 flips d4 westwards. If d4's new colour chained, the run
    // d3–d2 would flip too and be closed by the black d1. It must not.
    const s = fromDiagram(`
      ...x....
      ...o....
      ...o....
      ..oox...
      ........
      ........
      ........
      ........`, BLACK);
    const r = apply(s, fromName('b4'));
    expect(names(r.flipped)).toEqual(['c4', 'd4']);
    expect(score(r.state)).toEqual({ black: 5, white: 2, empty: 57 });
  });
});

describe('illegality', () => {
  it('rejects an occupied square', () => {
    const s = initial();
    expect(isLegal(s, fromName('d4'))).toBe(false);
    expect(() => apply(s, fromName('d4'))).toThrow(/already occupied/);
  });

  it('rejects an empty square that captures nothing', () => {
    const s = initial();
    expect(isLegal(s, fromName('a1'))).toBe(false);
    expect(() => apply(s, fromName('a1'))).toThrow(/captures nothing/);
  });

  it('rejects a square off the board', () => {
    const s = initial();
    expect(isLegal(s, 64)).toBe(false);
    expect(isLegal(s, -1)).toBe(false);
    expect(() => apply(s, 64)).toThrow(RangeError);
  });

  it('rejects a run of the mover’s own discs', () => {
    const s = fromDiagram(`
      xx......
      ........
      ........
      ........
      ........
      ........
      ........
      ........`, BLACK);
    expect(isLegal(s, fromName('c1'))).toBe(false);
  });
});

describe('white to move', () => {
  it('reads the position from White’s side', () => {
    const s = fromDiagram(`
      ........
      ........
      ..xxo...
      ........
      ........
      ........
      ........
      ........`, WHITE);
    const r = apply(s, fromName('b3'));
    expect(names(r.flipped)).toEqual(['c3', 'd3']);
    expect(score(r.state)).toEqual({ black: 0, white: 4, empty: 60 });
  });
});
