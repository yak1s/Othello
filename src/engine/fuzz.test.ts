import { describe, expect, it } from 'vitest';
import { apply, hash, initial, isTerminal, legalMoves, score, terminalReason } from './rules';
import { parse, serialize } from './notation';
import { newGame, play } from './game';
import { popcount } from './bitboard';
import { prng } from './testkit';

const GAMES = 10_000;
const CELLS = 64;
const FULL = (1n << 64n) - 1n;

/**
 * Invariants inside the hot loop are checked with plain throws rather than
 * `expect`. Roughly nine million assertions run here; vitest's matcher overhead
 * dominated the runtime and pushed the whole suite past two minutes, which is
 * long enough that people stop running it.
 */
function check(ok: boolean, describe: () => string): void {
  if (!ok) throw new Error(describe());
}

describe(`${GAMES.toLocaleString('en')} random legal games`, () => {
  it('never breaks an invariant', () => {
    const random = prng(0x1973);
    const reasons = new Set<string>();
    let longest = 0;
    let totalPlies = 0;

    for (let game = 0; game < GAMES; game += 1) {
      let state = initial();
      let played = 0;
      const transcript: number[] = [];
      const where = (): string => `game ${game}, ply ${played}`;

      while (!isTerminal(state)) {
        const moves = legalMoves(state);
        // legalMoves is empty only in a terminal position: apply hands the turn
        // back to a player who can use it, so a stuck side never gets it.
        check(moves.length > 0, () => `${where()}: no legal move in a non-terminal position`);

        const move = moves[Math.floor(random() * moves.length)]!;
        const before = state;
        const result = apply(state, move);
        state = result.state;
        played += 1;
        transcript.push(move);

        const black = popcount(state.black);
        const white = popcount(state.white);
        check(black + white === 4 + played, () => `${where()}: ${black + white} discs after ${played} moves`);
        check((state.black & state.white) === 0n, () => `${where()}: a square holds two discs`);
        check(((state.black | state.white) & ~FULL) === 0n, () => `${where()}: a disc is off the board`);
        check(state.moveNumber === played, () => `${where()}: moveNumber is ${state.moveNumber}`);
        check(state.hash !== before.hash, () => `${where()}: the position hash did not change`);
        check(result.flipped.length > 0, () => `${where()}: a legal move flipped nothing`);

        // The placed square and every flipped square now belong to the mover,
        // and every flipped square belonged to the opponent a moment ago.
        const moverAfter = before.turn === 0 ? state.black : state.white;
        const oppBefore = before.turn === 0 ? before.white : before.black;
        check(((moverAfter >> BigInt(move)) & 1n) === 1n, () => `${where()}: the placed disc is missing`);
        for (const flipped of result.flipped) {
          check(((moverAfter >> BigInt(flipped)) & 1n) === 1n, () => `${where()}: ${flipped} did not turn over`);
          check(((oppBefore >> BigInt(flipped)) & 1n) === 1n, () => `${where()}: ${flipped} was not the opponent's`);
        }

        // Recomputing the Zobrist hash from scratch is the expensive check, so
        // it samples rather than running on all 580,000 plies. Every game still
        // gets several, and every game's final position is checked below.
        if (played % 8 === 0) {
          check(state.hash === hash(state), () => `${where()}: carried hash drifted from a fresh one`);
        }
      }

      check(state.hash === hash(state), () => `game ${game}: final carried hash drifted`);
      const s = score(state);
      check(s.black + s.white + s.empty === CELLS, () => `game ${game}: discs do not sum to 64`);
      const t = score(state, 'tournament');
      check(t.black + t.white === CELLS, () => `game ${game}: tournament score does not sum to 64`);

      const reason = terminalReason(state);
      check(reason !== null, () => `game ${game}: finished with no terminal reason`);
      reasons.add(reason!);
      longest = Math.max(longest, played);
      totalPlies += played;

      // Every so often take the finished game out through the transcript and
      // back, which exercises notation against real play rather than fixtures.
      if (game % 250 === 0) {
        let replayed = newGame();
        for (const move of transcript) replayed = play(replayed, move);
        check(replayed.position.hash === state.hash, () => `game ${game}: replay diverged`);
        const text = serialize(replayed);
        check(text.length === transcript.length * 2, () => `game ${game}: transcript is the wrong length`);
        check(parse(text).position.hash === state.hash, () => `game ${game}: parse(serialize(g)) diverged`);
      }
    }

    // Random play reaches both common endings. Wipeouts are far rarer and are
    // covered by a constructed position in terminal.test.ts instead.
    expect(reasons.has('board-full')).toBe(true);
    expect(reasons.has('both-pass')).toBe(true);
    expect(longest).toBeLessThanOrEqual(60);
    expect(totalPlies / GAMES).toBeGreaterThan(50);
  }, 120_000);
});
