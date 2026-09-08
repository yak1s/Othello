/* ============================================================================
   A small opening book (brief §7).

   It exists so consecutive games do not open identically, not to make the
   engine stronger — the lines are only a few plies deep and the search takes
   over immediately afterwards. Selection is probabilistic and the random source
   is injected, so the module stays pure and a test can pin it.

   Levels 1 and 2 never consult it: a beginner opponent that plays four plies of
   theory and then blunders is not a believable beginner.

   Every line here is asserted legal against the rules engine in book.test.ts,
   so a typo cannot reach a game. The line *names* are the traditional ones and
   are internal only — they are never shown, and NOTES.md records that the three
   deeper names were written from memory and want checking against a reference.
   ========================================================================= */

export interface BookLine {
  name: string;
  /** A transcript prefix, lower case, no passes — the same shape the engine parses. */
  moves: string;
}

/**
 * Black's first move is f5 in every line: the opening position is symmetric, so
 * all four of Black's moves are the same move under reflection.
 */
export const BOOK: readonly BookLine[] = [
  // The three families, named for the shape White's reply makes with f5.
  { name: 'Diagonal', moves: 'f5d6' },
  { name: 'Perpendicular', moves: 'f5f6' },
  { name: 'Parallel', moves: 'f5f4' },
  // Three named continuations, a few plies each.
  { name: 'Tiger', moves: 'f5d6c3d3c4' },
  { name: 'Rose', moves: 'f5d6c3d3c4f4' },
  { name: 'Buffalo', moves: 'f5f6e6f4' },
];

/** The deepest prefix any line reaches, in plies. */
export const BOOK_DEPTH = Math.max(...BOOK.map((line) => line.moves.length / 2));

/**
 * The book's reply to `transcript`, or null when the position has left the book.
 *
 * Every line that extends the transcript is a candidate; one is chosen at
 * random, weighted towards the longer lines so the deeper theory gets played
 * about as often as the bare families do.
 */
export function bookMove(transcript: string, random: () => number): string | null {
  const played = transcript.toLowerCase();
  const candidates = BOOK.filter(
    (line) => line.moves.length > played.length && line.moves.startsWith(played),
  );
  if (candidates.length === 0) return null;

  const weights = candidates.map((line) => line.moves.length / 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    pick -= weights[i]!;
    if (pick <= 0) return candidates[i]!.moves.slice(played.length, played.length + 2);
  }
  return candidates[candidates.length - 1]!.moves.slice(played.length, played.length + 2);
}
