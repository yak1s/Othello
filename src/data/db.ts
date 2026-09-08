/* ============================================================================
   The IndexedDB adapter (brief §13). Two stores: finished games and one stats
   record. The factory is injectable so this is testable, and it degrades to an
   in-memory store when IndexedDB is missing or blocked — the archive is a
   convenience, and losing it must never stop anyone playing.
   ========================================================================= */

import { DB_NAME, DB_VERSION } from './types';

export const GAMES = 'games';
export const META = 'meta';

export interface Store {
  get<T>(store: string, key: string): Promise<T | undefined>;
  put(store: string, key: string, value: unknown): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  all<T>(store: string): Promise<T[]>;
  clear(store: string): Promise<void>;
}

class MemoryStore implements Store {
  private readonly data = new Map<string, Map<string, unknown>>();

  private bucket(store: string): Map<string, unknown> {
    let bucket = this.data.get(store);
    if (!bucket) { bucket = new Map(); this.data.set(store, bucket); }
    return bucket;
  }

  async get<T>(store: string, key: string): Promise<T | undefined> {
    return this.bucket(store).get(key) as T | undefined;
  }

  async put(store: string, key: string, value: unknown): Promise<void> {
    this.bucket(store).set(key, value);
  }

  async delete(store: string, key: string): Promise<void> {
    this.bucket(store).delete(key);
  }

  async all<T>(store: string): Promise<T[]> {
    return [...this.bucket(store).values()] as T[];
  }

  async clear(store: string): Promise<void> {
    this.bucket(store).clear();
  }
}

class IdbStore implements Store {
  constructor(private readonly db: IDBDatabase) {}

  private run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const request = fn(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  }

  get<T>(store: string, key: string): Promise<T | undefined> {
    return this.run<T | undefined>(store, 'readonly', (s) => s.get(key));
  }

  put(store: string, key: string, value: unknown): Promise<void> {
    return this.run<void>(store, 'readwrite', (s) => s.put(value, key));
  }

  delete(store: string, key: string): Promise<void> {
    return this.run<void>(store, 'readwrite', (s) => s.delete(key));
  }

  all<T>(store: string): Promise<T[]> {
    return this.run<T[]>(store, 'readonly', (s) => s.getAll());
  }

  clear(store: string): Promise<void> {
    return this.run<void>(store, 'readwrite', (s) => s.clear());
  }
}

let opened: Promise<Store> | null = null;

export function openStore(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<Store> {
  if (opened) return opened;
  opened = new Promise<Store>((resolve) => {
    if (!factory) { resolve(new MemoryStore()); return; }
    let settled = false;
    const done = (store: Store): void => { if (!settled) { settled = true; resolve(store); } };
    try {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(GAMES)) db.createObjectStore(GAMES);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      request.onsuccess = () => done(new IdbStore(request.result));
      request.onerror = () => done(new MemoryStore());
      request.onblocked = () => done(new MemoryStore());
      // Firefox in private mode never fires either handler.
      setTimeout(() => done(new MemoryStore()), 3000);
    } catch {
      done(new MemoryStore());
    }
  });
  return opened;
}

/** Test seam: drop the memoised connection. */
export function resetStore(): void {
  opened = null;
}
