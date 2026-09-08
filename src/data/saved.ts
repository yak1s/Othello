/* ============================================================================
   The single in-progress game, autosaved after every move (brief §13).

   This lives in localStorage rather than IndexedDB deliberately: it is a few
   dozen bytes, it is written after every single move, and a synchronous write
   cannot lose the last move to a tab that is being killed. The archive and the
   stats are larger, written once per game, and belong in IndexedDB.
   ========================================================================= */

import { NS, type SavedGame } from './types';

const KEY = `${NS}:in-progress:v1`;

export function loadSavedGame(storage: Storage | null = safeStorage()): SavedGame | null {
  const raw = storage?.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    if (typeof parsed.transcript !== 'string' || typeof parsed.mode !== 'string') return null;
    return {
      transcript: parsed.transcript,
      variant: parsed.variant === 'reverse' ? 'reverse' : 'standard',
      mode: parsed.mode as SavedGame['mode'],
      opponent: parsed.opponent ?? null,
      playerColor: parsed.playerColor === 0 || parsed.playerColor === 1 ? parsed.playerColor : null,
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : 0,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveGame(game: SavedGame, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(game));
  } catch {
    // Quota or a private window. An autosave that cannot be written must never
    // interrupt the move that triggered it.
  }
}

export function clearSavedGame(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* see above */
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
