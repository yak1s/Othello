/* ============================================================================
   The engine worker (brief §7). One request at a time; the main thread never
   blocks on it.

   Iterative deepening is driven here rather than inside the search so the
   worker can hand control back to its own message queue between depths — a
   worker cannot receive a message while a synchronous search is running, so
   that gap is the only place a stop can actually be seen.
   ========================================================================= */

import { Search, type SearchOptions } from './search';
import { CORNERS, LEVELS, chooseMove, searchOptionsFor } from './levels';
import { bookMove } from './book';
import { WIN_SCORE } from './eval';
import { isLegal, legalMoves, notation } from '../engine';
import type { PositionState } from '../engine/types';
import type { Request, Response } from './messages';

const search = new Search();

let currentId = 0;
let stopRequested = false;

const post = (message: Response): void => { (self as unknown as Worker).postMessage(message); };

self.onmessage = (event: MessageEvent<Request>): void => {
  const request = event.data;
  if (request.type === 'stop') { stopRequested = true; return; }
  currentId = request.id;
  stopRequested = false;
  void handle(request).catch((error: unknown) => {
    post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  });
};

async function handle(request: Exclude<Request, { type: 'stop' }>): Promise<void> {
  await think(request);
}

async function think(request: Extract<Request, { type: 'think' }>): Promise<void> {
  const spec = LEVELS[request.level];
  const legal = legalMoves(request.position);
  if (legal.length === 0) { post({ type: 'aborted', id: request.id }); return; }
  if (legal.length === 1) {
    post({ type: 'move', id: request.id, square: legal[0]!, score: 0, depth: 0, nodes: 0, exact: false, fromBook: false });
    return;
  }

  // The book comes first, and only for the levels that use it. A beginner that
  // plays four plies of theory and then blunders is not a believable beginner.
  if (spec.useBook) {
    const random = seeded(request.seed);
    const name = bookMove(request.transcript, random);
    if (name) {
      const square = notation.fromName(name);
      if (isLegal(request.position, square)) {
        post({ type: 'move', id: request.id, square, score: 0, depth: 0, nodes: 0, exact: false, fromBook: true });
        return;
      }
    }
  }

  const options = searchOptionsFor(request.level, request.variant);
  const ranked = await deepen(request.position, options, request.id);
  if (!ranked) return;

  const emptyCorners = new Set(CORNERS.filter((square) => {
    const bit = 1n << BigInt(square);
    return ((request.position.black | request.position.white) & bit) === 0n;
  }));
  const square = chooseMove(ranked, spec, seeded(request.seed ^ 0x9e37), emptyCorners);

  post({
    type: 'move',
    id: request.id,
    square,
    score: ranked[0]!.score,
    depth: search.depthReached,
    nodes: search.nodeCount,
    exact: search.isExact,
    fromBook: false,
  });
}

/** Runs the plan one depth at a time, yielding to the message queue between. */
async function deepen(
  position: PositionState,
  options: SearchOptions,
  id: number,
): Promise<ReturnType<Search['runDepth']> | null> {
  const { moves, empties } = search.begin(position, options);
  if (moves.length === 0) { post({ type: 'aborted', id }); return null; }

  let ranked = search.runDepth(1);
  for (const depth of search.plan(options, empties)) {
    if (depth <= 1) continue;
    await yieldToQueue();
    if (stopRequested || id !== currentId) { post({ type: 'aborted', id }); return null; }
    if (search.outOfBudget()) break;
    ranked = search.runDepth(depth);
    if (Math.abs(ranked[0]!.score) >= WIN_SCORE) break;
    if (search.wasAborted) break;
  }
  return ranked;
}

const yieldToQueue = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

/** splitmix32 — the caller supplies the seed, so a game is reproducible. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

post({ type: 'ready' });
