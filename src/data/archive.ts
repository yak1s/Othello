/* ============================================================================
   The game archive and the aggregate stats (brief §13).

   Capped at 500 games with the oldest dropping off first, and exportable by
   hand — with no account, the only way anyone's record survives a new phone is
   if they can carry the file themselves.
   ========================================================================= */

import { GAMES, META, openStore, type Store } from './db';
import { migrateStats, CURRENT_DATA_VERSION } from './migrate';
import {
  ARCHIVE_CAP,
  type ArchivedGame, type ExportBundle, type Level, type LevelRecord,
  type Settings, type Stats,
} from './types';
import { BLACK } from '../engine/types';
import { notation } from '../engine';

const STATS_KEY = 'stats';
const CORNERS = [0, 7, 56, 63];

export const EMPTY_STATS: Stats = {
  version: CURRENT_DATA_VERSION,
  perLevel: {
    1: emptyRecord(), 2: emptyRecord(), 3: emptyRecord(),
    4: emptyRecord(), 5: emptyRecord(), 6: emptyRecord(),
  },
  gamesFinished: 0,
  totalMargin: 0,
  cornersTaken: 0,
  cornersAvailable: 0,
  longestWinStreak: 0,
  currentWinStreak: 0,
};

function emptyRecord(): LevelRecord {
  return { wins: 0, losses: 0, draws: 0 };
}

export async function recordFinishedGame(
  game: Omit<ArchivedGame, 'id'>,
  store?: Store,
): Promise<ArchivedGame> {
  const db = store ?? await openStore();
  const record: ArchivedGame = { ...game, id: `${game.finishedAt}-${game.transcript.length}` };
  await db.put(GAMES, record.id, record);
  await evict(db);
  await db.put(META, STATS_KEY, reduceStats(await listGames(db)));
  return record;
}

export async function listGames(store?: Store): Promise<ArchivedGame[]> {
  const db = store ?? await openStore();
  const all = await db.all<ArchivedGame>(GAMES);
  return all.sort((a, b) => b.finishedAt - a.finishedAt);
}

export async function loadStats(store?: Store): Promise<Stats> {
  const db = store ?? await openStore();
  return migrateStats(await db.get<unknown>(META, STATS_KEY));
}

export async function clearArchive(store?: Store): Promise<void> {
  const db = store ?? await openStore();
  await db.clear(GAMES);
  await db.put(META, STATS_KEY, EMPTY_STATS);
}

/** Oldest first, so the cap always removes the least interesting record. */
async function evict(db: Store): Promise<void> {
  const all = await listGames(db);
  for (const game of all.slice(ARCHIVE_CAP)) await db.delete(GAMES, game.id);
}

/**
 * The pure reducer, so an import can rebuild the stats from the games alone
 * rather than trusting a number that arrived in a file.
 *
 * A draw neither extends nor breaks a win streak: it is not a win, so the
 * streak cannot grow, and it is not a loss, so nothing was lost. That is the
 * reading most people expect, and it is the one tested.
 */
export function reduceStats(games: readonly ArchivedGame[]): Stats {
  const perLevel: Record<Level, LevelRecord> = {
    1: emptyRecord(), 2: emptyRecord(), 3: emptyRecord(),
    4: emptyRecord(), 5: emptyRecord(), 6: emptyRecord(),
  };
  let totalMargin = 0;
  let cornersTaken = 0;
  let cornersAvailable = 0;
  let longest = 0;
  let current = 0;

  // Oldest first, so the streaks run forward through time.
  for (const game of [...games].sort((a, b) => a.finishedAt - b.finishedAt)) {
    const mine = game.playerColor;
    const won = mine !== null && game.winner === mine;
    const drew = game.winner === 'draw';
    const lost = !won && !drew;

    if (mine !== null) {
      const own = mine === BLACK ? game.blackDiscs : game.whiteDiscs;
      const theirs = mine === BLACK ? game.whiteDiscs : game.blackDiscs;
      totalMargin += own - theirs;
    }

    if (game.mode === 'computer' && typeof game.opponent === 'number') {
      const record = perLevel[game.opponent as Level];
      if (record) {
        perLevel[game.opponent as Level] = {
          wins: record.wins + (won ? 1 : 0),
          losses: record.losses + (lost ? 1 : 0),
          draws: record.draws + (drew ? 1 : 0),
        };
      }
    }

    if (mine !== null) {
      cornersAvailable += CORNERS.length;
      cornersTaken += cornersHeldBy(game, mine);
    }

    if (won) { current += 1; longest = Math.max(longest, current); }
    else if (lost) current = 0;
  }

  return {
    version: CURRENT_DATA_VERSION,
    perLevel,
    gamesFinished: games.length,
    totalMargin,
    cornersTaken,
    cornersAvailable,
    longestWinStreak: longest,
    currentWinStreak: current,
  };
}

/** Replays the transcript far enough to see who ended up holding the corners. */
function cornersHeldBy(game: ArchivedGame, color: 0 | 1): number {
  try {
    const position = notation.parse(game.transcript, game.variant).position;
    const board = color === BLACK ? position.black : position.white;
    return CORNERS.filter((square) => (board & (1n << BigInt(square))) !== 0n).length;
  } catch {
    return 0;
  }
}

/* ── export and import ──────────────────────────────────────────────────── */

export async function exportBundle(settings: Settings, store?: Store): Promise<ExportBundle> {
  const db = store ?? await openStore();
  return {
    format: 'kissa-archive',
    version: CURRENT_DATA_VERSION,
    exportedAt: Date.now(),
    settings,
    stats: await loadStats(db),
    games: await listGames(db),
  };
}

export interface ImportReport {
  added: number;
  duplicates: number;
  settings: Settings | null;
}

/**
 * Validates the whole bundle before writing anything, so a malformed file fails
 * cleanly rather than leaving half an archive behind.
 */
export async function importBundle(text: string, store?: Store): Promise<ImportReport> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not a Kissa archive');
  const bundle = parsed as Partial<ExportBundle>;
  if (bundle.format !== 'kissa-archive') throw new Error('Not a Kissa archive');
  if (!Array.isArray(bundle.games)) throw new Error('The archive has no games');
  for (const game of bundle.games) {
    if (typeof game?.id !== 'string' || typeof game.transcript !== 'string') {
      throw new Error('A game in the archive is malformed');
    }
  }

  const db = store ?? await openStore();
  const existing = new Set((await listGames(db)).map((g) => g.id));
  let added = 0;
  let duplicates = 0;
  for (const game of bundle.games) {
    if (existing.has(game.id)) { duplicates += 1; continue; }
    await db.put(GAMES, game.id, game);
    added += 1;
  }
  await evict(db);
  await db.put(META, STATS_KEY, reduceStats(await listGames(db)));
  return { added, duplicates, settings: bundle.settings ?? null };
}
