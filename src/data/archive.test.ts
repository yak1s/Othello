import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_STATS, clearArchive, exportBundle, importBundle, listGames, loadStats, recordFinishedGame, reduceStats } from './archive';
import { migrateStats, CURRENT_DATA_VERSION } from './migrate';
import { DEFAULT_SETTINGS, SettingsStore } from './settings';
import { ARCHIVE_CAP, type ArchivedGame } from './types';
import type { Store as DbStore } from './db';
import { BLACK, WHITE } from '../engine/types';

/** An in-memory Store, injected everywhere, so no dependency is added for tests. */
function memoryDb(): DbStore {
  const data = new Map<string, Map<string, unknown>>();
  const bucket = (store: string): Map<string, unknown> => {
    let b = data.get(store);
    if (!b) { b = new Map(); data.set(store, b); }
    return b;
  };
  return {
    async get<T>(store: string, key: string) { return bucket(store).get(key) as T | undefined; },
    async put(store, key, value) { bucket(store).set(key, value); },
    async delete(store, key) { bucket(store).delete(key); },
    async all<T>(store: string) { return [...bucket(store).values()] as T[]; },
    async clear(store) { bucket(store).clear(); },
  };
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => { map.set(k, v); },
  } as Storage;
}

const game = (over: Partial<ArchivedGame> = {}): Omit<ArchivedGame, 'id'> => ({
  transcript: 'd3c5b6c3',
  variant: 'standard',
  mode: 'computer',
  opponent: 3,
  playerColor: BLACK,
  blackDiscs: 40,
  whiteDiscs: 24,
  winner: BLACK,
  startedAt: 1000,
  finishedAt: 2000,
  durationMs: 1000,
  ...over,
});

describe('the archive', () => {
  let db: DbStore;
  beforeEach(() => { db = memoryDb(); });

  it('keeps games newest first', async () => {
    for (const at of [3000, 1000, 2000]) {
      await recordFinishedGame(game({ finishedAt: at, transcript: `d3${at}` }), db);
    }
    expect((await listGames(db)).map((g) => g.finishedAt)).toEqual([3000, 2000, 1000]);
  });

  it('evicts the oldest at exactly the cap', async () => {
    for (let i = 0; i < ARCHIVE_CAP + 25; i += 1) {
      await recordFinishedGame(game({ finishedAt: 1000 + i, transcript: `d3c5${i}` }), db);
    }
    const all = await listGames(db);
    expect(all).toHaveLength(ARCHIVE_CAP);
    // The oldest 25 are the ones gone.
    expect(all.at(-1)!.finishedAt).toBe(1000 + 25);
    expect(all[0]!.finishedAt).toBe(1000 + ARCHIVE_CAP + 24);
  });

  it('clears completely', async () => {
    await recordFinishedGame(game(), db);
    await clearArchive(db);
    expect(await listGames(db)).toEqual([]);
    expect((await loadStats(db)).gamesFinished).toBe(0);
  });
});

describe('the stats reducer', () => {
  it('records wins, losses and draws by level', () => {
    const stats = reduceStats([
      { ...game({ opponent: 3, winner: BLACK }), id: '1' },
      { ...game({ opponent: 3, winner: WHITE }), id: '2' },
      { ...game({ opponent: 5, winner: 'draw' }), id: '3' },
    ]);
    expect(stats.perLevel[3]).toEqual({ wins: 1, losses: 1, draws: 0 });
    expect(stats.perLevel[5]).toEqual({ wins: 0, losses: 0, draws: 1 });
    expect(stats.gamesFinished).toBe(3);
  });

  it('sums the margin from the local player’s side', () => {
    const stats = reduceStats([
      { ...game({ playerColor: BLACK, blackDiscs: 40, whiteDiscs: 24 }), id: '1' },
      { ...game({ playerColor: WHITE, blackDiscs: 40, whiteDiscs: 24, winner: BLACK }), id: '2' },
    ]);
    expect(stats.totalMargin).toBe(16 - 16);
  });

  it('does not let a draw extend or break a win streak', () => {
    const at = (n: number, winner: ArchivedGame['winner']) =>
      ({ ...game({ finishedAt: n, winner }), id: String(n) });
    const stats = reduceStats([at(1, BLACK), at(2, BLACK), at(3, 'draw'), at(4, BLACK)]);
    expect(stats.currentWinStreak).toBe(3);
    expect(stats.longestWinStreak).toBe(3);

    const broken = reduceStats([at(1, BLACK), at(2, BLACK), at(3, WHITE), at(4, BLACK)]);
    expect(broken.longestWinStreak).toBe(2);
    expect(broken.currentWinStreak).toBe(1);
  });

  it('counts corners out of those available', () => {
    // d3c5b6c3 takes no corner, so the rate is zero out of four.
    const stats = reduceStats([{ ...game(), id: '1' }]);
    expect(stats.cornersAvailable).toBe(4);
    expect(stats.cornersTaken).toBe(0);
  });

  it('ignores pass-and-play games, which have no local player', () => {
    const stats = reduceStats([
      { ...game({ mode: 'pass', playerColor: null, opponent: null }), id: '1' },
    ]);
    expect(stats.totalMargin).toBe(0);
    expect(stats.cornersAvailable).toBe(0);
    expect(stats.gamesFinished).toBe(1);
  });

  it('survives a transcript it cannot replay', () => {
    const stats = reduceStats([{ ...game({ transcript: 'not-a-game' }), id: '1' }]);
    expect(stats.cornersTaken).toBe(0);
    expect(stats.gamesFinished).toBe(1);
  });
});

describe('migration', () => {
  it('passes a current blob through unchanged', () => {
    const stats = { ...EMPTY_STATS, gamesFinished: 7, longestWinStreak: 3 };
    expect(migrateStats(stats)).toEqual(stats);
  });

  it('repairs a blob with fields missing', () => {
    const migrated = migrateStats({ version: 1, gamesFinished: 2 });
    expect(migrated.gamesFinished).toBe(2);
    expect(migrated.perLevel[1]).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(migrated.longestWinStreak).toBe(0);
  });

  it('handles a blob from a future version without losing what it understands', () => {
    const migrated = migrateStats({ version: 99, gamesFinished: 11, somethingNew: 'x' });
    expect(migrated.gamesFinished).toBe(11);
    expect(migrated.version).toBe(CURRENT_DATA_VERSION);
  });

  it('falls back to empty for anything that is not an object', () => {
    for (const bad of [null, undefined, 42, 'stats', []]) {
      expect(migrateStats(bad).gamesFinished).toBe(0);
    }
  });
});

describe('export and import', () => {
  it('round-trips everything', async () => {
    const db = memoryDb();
    await recordFinishedGame(game({ finishedAt: 1000 }), db);
    await recordFinishedGame(game({ finishedAt: 2000, transcript: 'c4e3' }), db);
    const bundle = await exportBundle(DEFAULT_SETTINGS, db);
    expect(bundle.format).toBe('kissa-archive');
    expect(bundle.games).toHaveLength(2);

    const fresh = memoryDb();
    const report = await importBundle(JSON.stringify(bundle), fresh);
    expect(report.added).toBe(2);
    expect(report.duplicates).toBe(0);
    expect((await listGames(fresh)).map((g) => g.finishedAt)).toEqual([2000, 1000]);
    expect((await loadStats(fresh)).gamesFinished).toBe(2);
  });

  it('does not duplicate games that are already here', async () => {
    const db = memoryDb();
    await recordFinishedGame(game({ finishedAt: 1000 }), db);
    const bundle = await exportBundle(DEFAULT_SETTINGS, db);
    const report = await importBundle(JSON.stringify(bundle), db);
    expect(report.added).toBe(0);
    expect(report.duplicates).toBe(1);
    expect(await listGames(db)).toHaveLength(1);
  });

  it('rejects a malformed bundle atomically, writing nothing', async () => {
    const db = memoryDb();
    await recordFinishedGame(game(), db);
    const before = await listGames(db);

    for (const bad of [
      '{}',
      '{"format":"something-else","games":[]}',
      '{"format":"kissa-archive"}',
      '{"format":"kissa-archive","games":[{"id":1}]}',
      '{"format":"kissa-archive","games":[{"id":"a"}]}',
      'not json at all',
    ]) {
      await expect(importBundle(bad, db)).rejects.toThrow();
    }
    expect(await listGames(db)).toEqual(before);
  });
});

describe('settings', () => {
  it('starts from the defaults', () => {
    const store = new SettingsStore(memoryStorage());
    expect(store.get('felt')).toBe('baize');
    expect(store.get('coordinates')).toBe(false);
    expect(store.get('undoAllowance')).toBe('unlimited');
  });

  it('merges over a partial stored blob and ignores unknown keys', () => {
    const storage = memoryStorage({
      'kissa:settings:v1': JSON.stringify({ felt: 'sand', nonsense: 1, coordinates: 'yes' }),
    });
    const store = new SettingsStore(storage);
    expect(store.get('felt')).toBe('sand');
    // The wrong type is rejected rather than adopted.
    expect(store.get('coordinates')).toBe(false);
    expect((store.value as unknown as Record<string, unknown>).nonsense).toBeUndefined();
  });

  it('persists a change and notifies', () => {
    const storage = memoryStorage();
    const store = new SettingsStore(storage);
    let seen = 0;
    store.subscribe(() => { seen += 1; });
    store.set('felt', 'slate');
    expect(seen).toBe(1);
    store.set('felt', 'slate');           // no change, no notification
    expect(seen).toBe(1);
    expect(new SettingsStore(storage).get('felt')).toBe('slate');
  });

  it('survives a storage that throws on write', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
      removeItem: () => {},
    } as unknown as Storage;
    const store = new SettingsStore(hostile);
    expect(() => store.set('felt', 'sand')).not.toThrow();
    expect(store.get('felt')).toBe('sand');
  });

  it('survives no storage at all', () => {
    const store = new SettingsStore(null);
    expect(() => store.set('sound', false)).not.toThrow();
    expect(store.get('sound')).toBe(false);
  });
});
