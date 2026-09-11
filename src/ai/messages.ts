/* The worker's wire types. Discriminated unions, so an unhandled case is a
   compile error rather than a silently ignored message. PositionState carries
   bigints, which structured clone handles, so positions cross as they are. */

import type { PositionState, Square, Variant } from '../engine/types';
import type { Level } from '../data/types';

export type Request =
  | { readonly type: 'think'; readonly id: number; readonly position: PositionState; readonly level: Level; readonly variant: Variant; readonly transcript: string; readonly seed: number }
  | { readonly type: 'stop' };

export type Response =
  | { readonly type: 'ready' }
  | { readonly type: 'move'; readonly id: number; readonly square: Square; readonly score: number; readonly depth: number; readonly nodes: number; readonly exact: boolean; readonly fromBook: boolean }
  | { readonly type: 'aborted'; readonly id: number }
  | { readonly type: 'error'; readonly id: number; readonly message: string };
