/* ============================================================================
   Kissa — persisted data contract (brief §13).

   localStorage holds settings; IndexedDB holds the archive and aggregate stats.
   Both are namespaced and version-keyed, with a migration function from day one.
   Nothing here ever leaves the device.
   ========================================================================= */

import type { Color, ScoreMode, Variant } from '../engine/types';

export const NS = 'kissa';
export const SETTINGS_KEY = `${NS}:settings:v1`;
export const DB_NAME = `${NS}-archive`;
export const DB_VERSION = 1;
/** Brief §13: cap the archive and say so in Settings. */
export const ARCHIVE_CAP = 500;

export type Felt = 'baize' | 'slate' | 'sand';
export type MotionPref = 'full' | 'reduced';
export type UndoAllowance = 'unlimited' | 'three' | 'off';
export type Level = 1 | 2 | 3 | 4 | 5 | 6;
export type Mode = 'pass' | 'friend' | 'computer';

export interface Settings {
  readonly version: number;
  // Sound
  readonly sound: boolean;
  readonly effectsVolume: number;      // 0..1
  readonly haptics: boolean;
  readonly turnSoundInPassPlay: boolean; // brief §10: off by default
  // Board
  readonly felt: Felt;
  readonly coordinates: boolean;       // off by default
  readonly legalDots: boolean;
  readonly lastMoveMarker: boolean;
  readonly discCounters: boolean;
  readonly colorblindMarking: boolean;
  readonly rotateBetweenTurns: boolean; // pass & play only
  readonly scoreMode: ScoreMode;
  // Assist
  readonly hints: boolean;
  readonly undoAllowance: UndoAllowance;
  // Motion
  readonly motion: MotionPref;
  // Sticky choices
  readonly lastLevel: Level;
  readonly lastVariant: Variant;
  readonly installPromptDismissed: boolean;
}

/** One finished game in the archive. */
export interface ArchivedGame {
  readonly id: string;
  readonly transcript: string;
  readonly variant: Variant;
  readonly mode: Mode;
  /** Level when mode is 'computer'; a peer label when 'friend'; null for pass & play. */
  readonly opponent: Level | string | null;
  /** Which colour the local player held. Null for pass & play. */
  readonly playerColor: Color | null;
  readonly blackDiscs: number;
  readonly whiteDiscs: number;
  readonly winner: Color | 'draw';
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
}

/** The single in-progress game, autosaved after every move. Powers the Continue card. */
export interface SavedGame {
  readonly transcript: string;
  readonly variant: Variant;
  readonly mode: Mode;
  readonly opponent: Level | string | null;
  readonly playerColor: Color | null;
  readonly startedAt: number;
  readonly savedAt: number;
}

export interface LevelRecord {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

export interface Stats {
  readonly version: number;
  readonly perLevel: Readonly<Record<Level, LevelRecord>>;
  readonly gamesFinished: number;
  readonly totalMargin: number;      // signed, from the local player's view
  readonly cornersTaken: number;
  readonly cornersAvailable: number;
  readonly longestWinStreak: number;
  readonly currentWinStreak: number;
}

/** The shape of the Settings → Export file. */
export interface ExportBundle {
  readonly format: 'kissa-archive';
  readonly version: number;
  readonly exportedAt: number;
  readonly settings: Settings;
  readonly stats: Stats;
  readonly games: readonly ArchivedGame[];
}
