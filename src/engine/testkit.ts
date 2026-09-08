/* Test-only helpers. Never imported by app code, so it never reaches a bundle. */

import { DEFAULT_SIZE } from './rules';
import { zobristFor } from './zobrist';
import { squaresOf } from './bitboard';
import { BLACK, WHITE, type Color, type PositionState } from './types';

/**
 * Build a position from an ASCII diagram: `x` black, `o` white, `.` empty.
 * Rows read top to bottom, so the diagram looks exactly like the board does.
 */
export function fromDiagram(art: string, turn: Color = BLACK): PositionState {
  const rows = art.trim().split('\n').map((r) => r.trim()).filter(Boolean);
  const size = rows.length;
  if (rows.some((r) => r.length !== size)) {
    throw new Error(`Diagram is not square: ${rows.map((r) => r.length).join(',')}`);
  }
  let black = 0n;
  let white = 0n;
  rows.forEach((row, rank) => {
    [...row].forEach((ch, file) => {
      const bit = 1n << BigInt(rank * size + file);
      if (ch === 'x') black |= bit;
      else if (ch === 'o') white |= bit;
      else if (ch !== '.') throw new Error(`Unknown diagram character ${ch}`);
    });
  });
  const z = zobristFor(size);
  const cells = size * size;
  let hash = turn === WHITE ? z.side : 0n;
  for (const s of squaresOf(black)) hash ^= z.piece[BLACK * cells + s]!;
  for (const s of squaresOf(white)) hash ^= z.piece[WHITE * cells + s]!;
  return { black, white, turn, moveNumber: 0, hash, size };
}

export function toDiagram(state: PositionState): string {
  const out: string[] = [];
  for (let rank = 0; rank < state.size; rank += 1) {
    let row = '';
    for (let file = 0; file < state.size; file += 1) {
      const bit = 1n << BigInt(rank * state.size + file);
      row += (state.black & bit) !== 0n ? 'x' : (state.white & bit) !== 0n ? 'o' : '.';
    }
    out.push(row);
  }
  return out.join('\n');
}

export const sq = (file: number, rank: number, size = DEFAULT_SIZE): number => rank * size + file;

/**
 * splitmix64-based PRNG. The engine is randomness-free by contract, so every
 * test that needs randomness brings its own and seeds it, making failures
 * reproducible from the seed alone.
 */
export function prng(seed: number): () => number {
  let s = BigInt(seed) & 0xffffffffffffffffn;
  return () => {
    s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    z ^= z >> 31n;
    return Number(z >> 11n) / 2 ** 53;
  };
}
