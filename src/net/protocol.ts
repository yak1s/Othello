/* ============================================================================
   Kissa — peer-to-peer wire protocol (brief §8).

   Both peers run the full rules engine. Moves are messages, not state: the
   sender transmits the square and the hash it expects afterwards, and the
   receiver validates the move against its own position before applying it.
   That keeps the wire format tiny and makes desync — or cheating — detectable
   on the very next message.
   ========================================================================= */

import type { Color, Square, Variant } from '../engine/types';

/** Bumped whenever a message shape changes. Peers refuse a mismatched major. */
export const PROTOCOL_VERSION = 1;

/** Rooms are named by a four-digit PIN. See ./pin.ts for why four. */
export { PIN_LENGTH } from './pin';

export const HEARTBEAT_MS = 3_000;
export const GRACE_MS = 30_000;
/** How long the first signalling strategy gets before the second is raced in. */
export const STRATEGY_FALLBACK_MS = 8_000;

export type ClockKind = 'none' | 'fischer-5-3' | 'absolute-30';

export interface ClockState {
  readonly kind: ClockKind;
  /** Milliseconds remaining, per colour, indexed by Color. */
  readonly remaining: readonly [number, number];
  /** Wall-clock ms at which the running clock was last started; null when frozen. */
  readonly since: number | null;
}

export type Emote = 'good-move' | 'nice' | 'oops' | 'hurry' | 'thanks' | 'rematch';
export const EMOTES: readonly Emote[] = ['good-move', 'nice', 'oops', 'hurry', 'thanks', 'rematch'];

/** Everything a peer needs to reconstruct the match exactly. The host is the source of truth. */
export interface Snapshot {
  readonly transcript: string;
  readonly variant: Variant;
  /** Which colour the *host* is playing. */
  readonly hostColor: Color;
  readonly clock: ClockState | null;
  readonly moveNumber: number;
  readonly hash: string;
}

export type Message =
  /** Sent by both peers on connect. Mismatched versions abort with a plain message. */
  | { readonly t: 'hello'; readonly v: number; readonly peerId: string; readonly seed: number }
  /** Host only: assigns colours and settles the match parameters. */
  | { readonly t: 'seat'; readonly hostColor: Color; readonly variant: Variant; readonly clock: ClockState | null }
  /** A move. `h` is the Zobrist hash the sender expects the position to have afterwards. */
  | { readonly t: 'move'; readonly n: number; readonly sq: Square; readonly h: string; readonly at: number }
  /** Sent when a received move does not reproduce the sender's hash. */
  | { readonly t: 'resync'; readonly n: number }
  | { readonly t: 'snapshot'; readonly snap: Snapshot }
  | { readonly t: 'emote'; readonly e: Emote; readonly n: number }
  | { readonly t: 'resign'; readonly by: Color }
  | { readonly t: 'rematch'; readonly accept: boolean; readonly swapColors: boolean }
  /** Presence. `at` is the sender's wall clock, used to reconcile the two clocks. */
  | { readonly t: 'ping'; readonly at: number; readonly clock: ClockState | null }
  /** Refusal sent to a third device that tries to join an occupied room. */
  | { readonly t: 'full' };

export type ConnectionPhase =
  | 'idle'
  | 'searching'        // first strategy
  | 'searching-alt'    // second strategy raced in after STRATEGY_FALLBACK_MS
  | 'connected'
  | 'reconnecting'     // peer lost, inside the grace window
  | 'lost'             // grace expired
  | 'failed'           // no peer at all — offer manual exchange or pass & play
  | 'manual';          // manual SDP exchange in progress

export interface ConnectionState {
  readonly phase: ConnectionPhase;
  readonly code: string | null;
  readonly isHost: boolean;
  /** Milliseconds left in the reconnect grace window, when phase is 'reconnecting'. */
  readonly graceLeft: number;
}

/** The one interface both the trystero transports and the manual fallback implement. */
export interface Transport {
  send(msg: Message): void;
  onMessage(fn: (msg: Message, peerId: string) => void): void;
  onPeerJoin(fn: (peerId: string) => void): void;
  onPeerLeave(fn: (peerId: string) => void): void;
  leave(): Promise<void>;
  readonly selfId: string;
}
