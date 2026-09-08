/* ============================================================================
   Migrations, from day one (brief §13).

   Version 1 is current. The framework exists now so that version 2 is a single
   entry in `STEPS` rather than a rewrite, and so a blob from a future version —
   which happens the moment someone imports a file from a newer install — is
   handled without a crash and without silently discarding their games.
   ========================================================================= */

import { EMPTY_STATS } from './archive';
import type { Stats } from './types';

export const CURRENT_DATA_VERSION = 1;

type Step = (blob: Record<string, unknown>) => Record<string, unknown>;

/** `STEPS[n]` upgrades a version-n blob to version n+1. */
const STEPS: Record<number, Step> = {};

export function migrateStats(blob: unknown): Stats {
  if (typeof blob !== 'object' || blob === null) return EMPTY_STATS;
  let current = { ...(blob as Record<string, unknown>) };
  let version = typeof current.version === 'number' ? current.version : 0;

  // A blob from a newer install is left as it is rather than mangled: unknown
  // fields are dropped by the merge below, and the known ones still read.
  while (version < CURRENT_DATA_VERSION) {
    const step = STEPS[version];
    if (!step) break;
    current = step(current);
    version += 1;
  }

  return {
    ...EMPTY_STATS,
    ...pickKnown(current),
    version: CURRENT_DATA_VERSION,
  };
}

/** Merge only the fields we understand, repairing anything missing or wrong. */
function pickKnown(blob: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(EMPTY_STATS) as (keyof Stats)[]) {
    const value = blob[key];
    if (value === undefined || value === null) continue;
    if (typeof value === typeof EMPTY_STATS[key]) out[key] = value;
  }
  if (typeof blob.perLevel === 'object' && blob.perLevel !== null) {
    out.perLevel = { ...EMPTY_STATS.perLevel, ...(blob.perLevel as Stats['perLevel']) };
  }
  return out;
}
