import { describe, expect, it } from 'vitest';
import { createFastBoard, bitsOf, type FastBoard } from './fastboard';
import { apply, initial, isTerminal, legalMoves, rules } from '../engine';
import { prng } from '../engine/testkit';
import { BLACK, type PositionState } from '../engine/types';

const KINDS = ['u32', 'bigint'] as const;
const scratch = new Int32Array(2);
const moves = new Int32Array(64);

/** The mover's discs first, which is the point of view the fast board takes. */
function load(board: FastBoard, state: PositionState, slot = 0): void {
  const mover = state.turn === BLACK ? state.black : state.white;
  const other = state.turn === BLACK ? state.white : state.black;
  board.set(slot, mover, other);
}

/** Every position reachable in `plies` random games, as an independent corpus. */
function corpus(count: number, seed: number): PositionState[] {
  const random = prng(seed);
  const out: PositionState[] = [];
  for (let game = 0; out.length < count; game += 1) {
    let state = initial();
    while (!isTerminal(state)) {
      out.push(state);
      const legal = legalMoves(state);
      if (legal.length === 0) break;
      state = apply(state, legal[Math.floor(random() * legal.length)]!).state;
    }
    out.push(state);
  }
  return out.slice(0, count);
}

describe.each(KINDS)('the %s board agrees with the rules engine', (kind) => {
  const positions = corpus(20_000, 0x5eed);

  it('generates exactly the same legal moves', () => {
    const board = createFastBoard(kind);
    for (const state of positions) {
      load(board, state);
      const count = board.genMoves(0, moves);
      const fast = [...moves.subarray(0, count)].sort((a, b) => a - b);
      const slow = [...legalMoves(state)].sort((a, b) => a - b);
      if (fast.length !== slow.length || fast.some((s, i) => s !== slow[i])) {
        throw new Error(`move mismatch at ${state.black}/${state.white}: ${fast} vs ${slow}`);
      }
    }
  });

  it('flips exactly the same discs', () => {
    const board = createFastBoard(kind);
    for (const state of positions) {
      for (const move of legalMoves(state)) {
        load(board, state);
        const flipped = board.flips(0, move, scratch);
        const mask = bitsOf(scratch[0]!, scratch[1]!);
        const expected = apply(state, move).flipped;
        if (flipped !== expected.length) {
          throw new Error(`flip count ${flipped} vs ${expected.length} on ${move}`);
        }
        for (const square of expected) {
          if ((mask & (1n << BigInt(square))) === 0n) throw new Error(`missing flip ${square}`);
        }
      }
    }
  });

  it('produces the same position after playing', () => {
    const board = createFastBoard(kind);
    for (const state of positions) {
      for (const move of legalMoves(state)) {
        load(board, state);
        board.play(0, 1, move, scratch);
        const next = apply(state, move).state;
        // play() always hands the move to the opponent, whereas the engine keeps
        // it when the opponent is stuck. Either way the *discs* are the same, so
        // compare slot 1 against the position seen from the opponent's side.
        expect(board.bits(1, 0)).toBe(state.turn === BLACK ? next.white : next.black);
        expect(board.bits(1, 1)).toBe(state.turn === BLACK ? next.black : next.white);
      }
    }
  });

  it('counts discs and empties the way the engine scores them', () => {
    const board = createFastBoard(kind);
    for (const state of positions) {
      load(board, state);
      const s = rules.score(state);
      const mover = state.turn === BLACK ? s.black : s.white;
      const other = state.turn === BLACK ? s.white : s.black;
      expect(board.discCount(0, 0)).toBe(mover);
      expect(board.discCount(0, 1)).toBe(other);
      expect(board.emptyCount(0)).toBe(s.empty);
    }
  });
});

it('the two representations agree with each other', () => {
  const a = createFastBoard('u32');
  const b = createFastBoard('bigint');
  const alt = new Int32Array(64);
  for (const state of corpus(5_000, 0xc0ffee)) {
    load(a, state);
    load(b, state);
    const countA = a.genMoves(0, moves);
    const countB = b.genMoves(0, alt);
    expect(countA).toBe(countB);
    for (let i = 0; i < countA; i += 1) expect(moves[i]).toBe(alt[i]);
    expect(a.mobility(0)).toBe(b.mobility(0));
    expect(a.opponentMobility(0)).toBe(b.opponentMobility(0));
  }
});
