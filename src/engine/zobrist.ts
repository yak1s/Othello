/* ============================================================================
   Kissa — Zobrist keys.

   The P2P layer compares hashes across two devices (brief §8), so the table can
   never come from `Math.random()`: it has to be byte-identical in every process
   and across every reload. SplitMix64 from a fixed seed gives that, costs 64
   bytes of source, and passes BigCrush — good enough for keys we only ever XOR.
   ========================================================================= */

const MASK64 = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;
const MIX_A = 0xbf58476d1ce4e5b9n;
const MIX_B = 0x94d049bb133111ebn;

/** Arbitrary, fixed forever. Changing it changes every hash and breaks P2P compatibility. */
export const ZOBRIST_SEED = 0x4b69737361_1973n;

export interface ZobristTable {
  /** Indexed `colour * cells + square`. */
  readonly piece: readonly bigint[];
  /** XORed in when it is White to move. */
  readonly side: bigint;
}

export function splitmix64(seed: bigint): () => bigint {
  let s = seed & MASK64;
  return () => {
    s = (s + GOLDEN) & MASK64;
    let z = s;
    z = ((z ^ (z >> 30n)) * MIX_A) & MASK64;
    z = ((z ^ (z >> 27n)) * MIX_B) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  };
}

const cache = new Map<number, ZobristTable>();

export function zobristFor(size: number): ZobristTable {
  const hit = cache.get(size);
  if (hit !== undefined) return hit;
  const cells = size * size;
  const next = splitmix64(ZOBRIST_SEED);
  const piece: bigint[] = new Array<bigint>(2 * cells);
  for (let i = 0; i < 2 * cells; i++) piece[i] = next();
  const table: ZobristTable = { piece, side: next() };
  cache.set(size, table);
  return table;
}
