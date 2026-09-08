/* ============================================================================
   The match session (brief §8).

   Both peers run the full rules engine, so a move is a message and never a
   board: the sender says which square and what the position should hash to
   afterwards, and the receiver checks the move is legal in *its own* position
   before applying it. A desync — or a peer sending something it should not —
   shows up on the very next message rather than three moves later.

   Everything here is pure with respect to the outside world: the transport, the
   rules engine, the clock and the random source are all injected, which is what
   makes the whole of §8 testable with no WebRTC and no network.
   ========================================================================= */

import {
  GRACE_MS, HEARTBEAT_MS, PROTOCOL_VERSION,
  type ClockKind, type ClockState, type ConnectionPhase, type Emote,
  type Message, type Snapshot, type Transport,
} from './protocol';
import { BLACK, WHITE, type Color, type Game, type GameApi, type NotationApi, type RulesApi, type Square, type Variant } from '../engine/types';

export interface SessionDeps {
  transport: Transport;
  rules: RulesApi;
  notation: NotationApi;
  games: GameApi;
  isHost: boolean;
  code: string;
  variant?: Variant;
  clockKind?: ClockKind;
  /** The host's chosen colour, or 'coin' to derive it jointly from both seeds. */
  hostSeat?: Color | 'coin';
  now: () => number;
  random: () => number;
}

export interface SessionView {
  phase: ConnectionPhase;
  code: string;
  isHost: boolean;
  /** Null until the host has assigned seats. */
  myColor: Color | null;
  game: Game;
  clock: ClockState | null;
  graceLeft: number;
  /** The last thing that went wrong, for the UI to show plainly. */
  problem: string | null;
  peerPresent: boolean;
}

type Listener = (view: SessionView) => void;

const FISCHER_BASE = 5 * 60_000;
const FISCHER_INCREMENT = 3_000;
const ABSOLUTE = 30 * 60_000;

export class MatchSession {
  private readonly d: SessionDeps;
  private readonly listeners = new Set<Listener>();
  private readonly moveListeners = new Set<(square: Square, by: Color) => void>();
  private readonly emoteListeners = new Set<(emote: Emote, mine: boolean) => void>();

  private phase: ConnectionPhase = 'searching';
  private game: Game;
  private myColor: Color | null = null;
  private variant: Variant;
  private clock: ClockState | null = null;
  private peerId: string | null = null;
  private mySeed: number;
  private peerSeed: number | null = null;
  private problem: string | null = null;

  private lastHeartbeatSent = 0;
  private lastHeardFrom = 0;
  private lastTickAt = 0;
  private lostAt: number | null = null;
  private emoteSentAtMove = -1;
  private disposed = false;

  constructor(deps: SessionDeps) {
    this.d = deps;
    this.variant = deps.variant ?? 'standard';
    this.game = deps.games.newGame(this.variant);
    this.mySeed = Math.floor(deps.random() * 0x7fffffff);
    this.clock = makeClock(deps.clockKind ?? 'none');

    deps.transport.onMessage((message, from) => this.receive(message, from));
    deps.transport.onPeerJoin((id) => this.peerJoined(id));
    deps.transport.onPeerLeave((id) => this.peerLeft(id));
  }

  /* ── the view ────────────────────────────────────────────────────────── */

  get view(): SessionView {
    return {
      phase: this.phase,
      code: this.d.code,
      isHost: this.d.isHost,
      myColor: this.myColor,
      game: this.game,
      clock: this.clock,
      graceLeft: this.lostAt === null ? 0 : Math.max(0, GRACE_MS - (this.d.now() - this.lostAt)),
      problem: this.problem,
      peerPresent: this.peerId !== null,
    };
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onRemoteMove(fn: (square: Square, by: Color) => void): () => void {
    this.moveListeners.add(fn);
    return () => this.moveListeners.delete(fn);
  }

  onEmote(fn: (emote: Emote, mine: boolean) => void): () => void {
    this.emoteListeners.add(fn);
    return () => this.emoteListeners.delete(fn);
  }

  private changed(): void {
    const view = this.view;
    for (const listener of this.listeners) listener(view);
  }

  /* ── lifecycle ───────────────────────────────────────────────────────── */

  start(): void {
    this.send({ t: 'hello', v: PROTOCOL_VERSION, peerId: this.d.transport.selfId, seed: this.mySeed });
  }

  /** Drive presence, the grace countdown and the clocks. Call about every second. */
  tick(): void {
    if (this.disposed) return;
    const now = this.d.now();

    // A gap longer than the heartbeat means *we* were not running — a
    // backgrounded tab, a sleeping phone. The peer has had no chance to be
    // heard from in that time, so re-arm rather than declaring it lost the
    // instant we wake up.
    const wasSuspended = this.lastTickAt !== 0 && now - this.lastTickAt > HEARTBEAT_MS;
    this.lastTickAt = now;
    if (wasSuspended) this.lastHeardFrom = now;

    if (this.peerId !== null && now - this.lastHeartbeatSent >= HEARTBEAT_MS) {
      this.lastHeartbeatSent = now;
      this.send({ t: 'ping', at: now, clock: this.clock });
    }

    // A peer that stops answering is treated as lost even without a leave event,
    // because a dropped connection often produces no event at all.
    if (!wasSuspended && this.phase === 'connected' && this.peerId !== null
      && now - this.lastHeardFrom > HEARTBEAT_MS * 3) {
      this.peerLeft(this.peerId);
      return;
    }

    if (this.phase === 'reconnecting' && this.lostAt !== null && now - this.lostAt >= GRACE_MS) {
      this.phase = 'lost';
      this.lostAt = null;
      this.changed();
      return;
    }
    if (this.phase === 'reconnecting') this.changed();
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.moveListeners.clear();
    this.emoteListeners.clear();
    void this.d.transport.leave();
  }

  /* ── playing ─────────────────────────────────────────────────────────── */

  get isMyTurn(): boolean {
    return this.myColor !== null
      && this.game.position.turn === this.myColor
      && !this.d.rules.isTerminal(this.game.position);
  }

  /** Play a move locally and tell the peer. Returns false if it was not ours to play. */
  playLocal(square: Square): boolean {
    if (!this.isMyTurn || !this.d.rules.isLegal(this.game.position, square)) return false;
    const before = this.game.position.moveNumber;
    this.game = this.d.games.play(this.game, square);
    this.applyClockAfterMove();
    this.send({
      t: 'move',
      n: before + 1,
      sq: square,
      h: this.game.position.hash.toString(36),
      at: this.d.now(),
    });
    this.changed();
    return true;
  }

  sendEmote(emote: Emote): boolean {
    // One per turn, so an emote stays a gesture rather than a channel.
    if (this.emoteSentAtMove === this.game.position.moveNumber) return false;
    this.emoteSentAtMove = this.game.position.moveNumber;
    this.send({ t: 'emote', e: emote, n: this.game.position.moveNumber });
    for (const listener of this.emoteListeners) listener(emote, true);
    return true;
  }

  resign(): void {
    if (this.myColor === null) return;
    this.send({ t: 'resign', by: this.myColor });
  }

  /** Host only: offer a rematch, optionally swapping colours. */
  requestRematch(swapColors: boolean): void {
    this.send({ t: 'rematch', accept: true, swapColors });
    if (this.d.isHost) this.restart(swapColors);
  }

  /* ── receiving ───────────────────────────────────────────────────────── */

  private peerJoined(id: string): void {
    if (this.peerId !== null && this.peerId !== id) {
      // A third device. Refuse it plainly rather than letting it half-join.
      this.d.transport.send({ t: 'full' });
      return;
    }
    this.peerId = id;
    this.lastHeardFrom = this.d.now();
    this.lostAt = null;
    this.phase = 'connected';
    this.problem = null;
    this.start();
    this.changed();
  }

  private peerLeft(id: string): void {
    if (id !== this.peerId) return;
    this.peerId = null;
    this.lostAt = this.d.now();
    this.phase = 'reconnecting';
    // The clock freezes while nobody is there to play against.
    if (this.clock) this.clock = { ...this.clock, since: null };
    this.changed();
  }

  private receive(message: Message, from: string): void {
    if (this.disposed) return;
    this.lastHeardFrom = this.d.now();

    switch (message.t) {
      case 'hello': return this.onHello(message, from);
      case 'seat': return this.onSeat(message);
      case 'move': return this.onMove(message);
      case 'resync': return this.onResync(message);
      case 'snapshot': return this.onSnapshot(message);
      case 'emote': return this.onEmoteMessage(message);
      case 'resign': return this.onResign(message);
      case 'rematch': return this.onRematch(message);
      case 'ping': return this.onPing(message);
      case 'full': return this.onFull();
      default: return;
    }
  }

  private onHello(message: Extract<Message, { t: 'hello' }>, from: string): void {
    if (message.v !== PROTOCOL_VERSION) {
      this.problem = 'Your friend is running a different version of Kissa. One of you needs to reload.';
      this.phase = 'failed';
      this.changed();
      return;
    }
    if (this.peerId === null) this.peerId = from;
    this.peerSeed = message.seed;
    this.phase = 'connected';

    if (this.d.isHost) {
      const hostColor = this.decideSeat();
      this.myColor = hostColor;
      this.send({ t: 'seat', hostColor, variant: this.variant, clock: this.clock });
    }
    this.changed();
  }

  /**
   * Colours: the host's own choice, or a coin flip neither side can steer,
   * derived from both seeds so it cannot be decided after seeing the other's.
   */
  private decideSeat(): Color {
    const seat = this.d.hostSeat ?? 'coin';
    if (seat !== 'coin') return seat;
    const joint = (this.mySeed ^ (this.peerSeed ?? 0)) >>> 0;
    return (joint & 1) === 0 ? BLACK : WHITE;
  }

  private onSeat(message: Extract<Message, { t: 'seat' }>): void {
    if (this.d.isHost) return;   // the host is the one who assigns them
    this.myColor = message.hostColor === BLACK ? WHITE : BLACK;
    this.variant = message.variant;
    this.clock = message.clock;
    this.game = this.d.games.newGame(this.variant);
    this.phase = 'connected';
    this.changed();
  }

  private onMove(message: Extract<Message, { t: 'move' }>): void {
    const state = this.game.position;
    const expected = state.moveNumber + 1;

    if (message.n !== expected) {
      // Out of order, or we have already applied it. Ask for the truth rather
      // than guessing which of us is behind.
      this.requestResync();
      return;
    }
    if (this.myColor !== null && state.turn === this.myColor) {
      this.problem = 'Your friend played out of turn. The move was ignored.';
      this.changed();
      return;
    }
    if (!this.d.rules.isLegal(state, message.sq)) {
      this.problem = 'Your friend sent a move that is not legal here.';
      this.requestResync();
      return;
    }

    const by = state.turn;
    this.game = this.d.games.play(this.game, message.sq);

    if (this.game.position.hash.toString(36) !== message.h) {
      // The move was legal but we disagree about the result: the two boards
      // have drifted. The host is the source of truth.
      this.requestResync();
      return;
    }

    this.applyClockAfterMove();
    this.problem = null;
    for (const listener of this.moveListeners) listener(message.sq, by);
    this.changed();
  }

  private requestResync(): void {
    if (this.d.isHost) return;   // the host has nothing to ask
    this.send({ t: 'resync', n: this.game.position.moveNumber });
  }

  private onResync(message: Extract<Message, { t: 'resync' }>): void {
    void message;
    if (!this.d.isHost) return;
    this.send({ t: 'snapshot', snap: this.snapshot() });
  }

  private snapshot(): Snapshot {
    return {
      transcript: this.d.notation.serialize(this.game),
      variant: this.variant,
      hostColor: this.myColor ?? BLACK,
      clock: this.clock,
      moveNumber: this.game.position.moveNumber,
      hash: this.game.position.hash.toString(36),
    };
  }

  private onSnapshot(message: Extract<Message, { t: 'snapshot' }>): void {
    if (this.d.isHost) return;
    try {
      const rebuilt = this.d.notation.parse(message.snap.transcript, message.snap.variant);
      if (rebuilt.position.hash.toString(36) !== message.snap.hash) {
        this.problem = 'The two boards could not be reconciled. Start a new game.';
        this.changed();
        return;
      }
      this.game = rebuilt;
      this.variant = message.snap.variant;
      this.myColor = message.snap.hostColor === BLACK ? WHITE : BLACK;
      this.clock = message.snap.clock;
      this.problem = null;
      this.phase = 'connected';
      this.changed();
    } catch {
      this.problem = 'The two boards could not be reconciled. Start a new game.';
      this.changed();
    }
  }

  private onEmoteMessage(message: Extract<Message, { t: 'emote' }>): void {
    for (const listener of this.emoteListeners) listener(message.e, false);
  }

  private onResign(message: Extract<Message, { t: 'resign' }>): void {
    this.problem = `${message.by === BLACK ? 'Black' : 'White'} resigned.`;
    this.changed();
  }

  private onRematch(message: Extract<Message, { t: 'rematch' }>): void {
    if (!message.accept) return;
    this.restart(message.swapColors);
  }

  private restart(swapColors: boolean): void {
    this.game = this.d.games.newGame(this.variant);
    if (swapColors && this.myColor !== null) this.myColor = this.myColor === BLACK ? WHITE : BLACK;
    this.clock = makeClock(this.clock?.kind ?? 'none');
    this.emoteSentAtMove = -1;
    this.problem = null;
    this.changed();
  }

  private onPing(message: Extract<Message, { t: 'ping' }>): void {
    if (this.phase === 'reconnecting' || this.phase === 'lost') {
      this.phase = 'connected';
      this.lostAt = null;
      // The clock was frozen while they were away; restart it from now so the
      // absence is not charged to whoever happened to be on move.
      if (this.clock && this.clock.since === null) {
        this.clock = { ...this.clock, since: this.d.now() };
      }
    }
    this.reconcileClock(message.clock);
    this.changed();
  }

  private onFull(): void {
    this.phase = 'failed';
    this.problem = 'That game already has two players.';
    this.changed();
  }

  /* ── clocks ──────────────────────────────────────────────────────────── */

  private applyClockAfterMove(): void {
    if (!this.clock || this.clock.kind === 'none') return;
    const mover = this.game.position.turn === BLACK ? WHITE : BLACK;
    const now = this.d.now();
    const elapsed = this.clock.since === null ? 0 : now - this.clock.since;
    const remaining: [number, number] = [...this.clock.remaining] as [number, number];
    remaining[mover] = Math.max(0, remaining[mover] - elapsed);
    if (this.clock.kind === 'fischer-5-3') remaining[mover] += FISCHER_INCREMENT;
    this.clock = { ...this.clock, remaining, since: now };
  }

  /**
   * Two clocks will always disagree a little. Take the more conservative value
   * — the smaller remaining time for each side — so a lagging peer can never
   * gain time by being slow to report.
   */
  private reconcileClock(theirs: ClockState | null): void {
    if (!this.clock || !theirs || this.clock.kind !== theirs.kind) return;
    this.clock = {
      ...this.clock,
      remaining: [
        Math.min(this.clock.remaining[0], theirs.remaining[0]),
        Math.min(this.clock.remaining[1], theirs.remaining[1]),
      ],
    };
  }

  /** Milliseconds left for `color`, counting down from the last move. */
  remainingFor(color: Color): number {
    if (!this.clock || this.clock.kind === 'none') return Infinity;
    const running = this.game.position.turn === color && this.clock.since !== null;
    const elapsed = running ? this.d.now() - this.clock.since! : 0;
    return Math.max(0, this.clock.remaining[color] - elapsed);
  }

  private send(message: Message): void {
    this.d.transport.send(message);
  }
}

function makeClock(kind: ClockKind): ClockState | null {
  if (kind === 'none') return null;
  const base = kind === 'fischer-5-3' ? FISCHER_BASE : ABSOLUTE;
  return { kind, remaining: [base, base], since: null };
}

export const CLOCK_LOW_MS = 30_000;
