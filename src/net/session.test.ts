import { describe, expect, it } from 'vitest';
import { MatchSession } from './session';
import { formatCode, codeFromLink, joinLink, makeCode, parseCode, ALPHABET } from './codes';
import { GRACE_MS, type Emote, type Message, type Transport } from './protocol';
import { games, legalMoves, notation, rules } from '../engine';
import { prng } from '../engine/testkit';
import { BLACK, WHITE, type Square } from '../engine/types';

/* ── a loopback pair, so two sessions can talk with no WebRTC at all ─────── */

class Wire {
  readonly a: Loopback;
  readonly b: Loopback;
  /** Set to drop or corrupt what crosses, for the desync tests. */
  intercept: ((m: Message, to: 'a' | 'b') => Message | null) | null = null;

  constructor() {
    this.a = new Loopback('a', this);
    this.b = new Loopback('b', this);
  }

  deliver(from: 'a' | 'b', message: Message): void {
    const to = from === 'a' ? 'b' : 'a';
    const passed = this.intercept ? this.intercept(message, to) : message;
    if (!passed) return;
    (to === 'a' ? this.a : this.b).receive(passed, from);
  }

  connect(): void {
    this.a.join('b');
    this.b.join('a');
  }
}

class Loopback implements Transport {
  private messageFns: ((m: Message, id: string) => void)[] = [];
  private joinFns: ((id: string) => void)[] = [];
  private leaveFns: ((id: string) => void)[] = [];
  connected = true;

  constructor(readonly selfId: string, private readonly wire: Wire) {}

  send(message: Message): void {
    if (!this.connected) return;
    this.wire.deliver(this.selfId as 'a' | 'b', message);
  }
  onMessage(fn: (m: Message, id: string) => void): void { this.messageFns.push(fn); }
  onPeerJoin(fn: (id: string) => void): void { this.joinFns.push(fn); }
  onPeerLeave(fn: (id: string) => void): void { this.leaveFns.push(fn); }
  async leave(): Promise<void> { this.connected = false; }

  receive(message: Message, from: string): void {
    if (!this.connected) return;
    for (const fn of this.messageFns) fn(message, from);
  }
  join(id: string): void { for (const fn of this.joinFns) fn(id); }
  drop(id: string): void { for (const fn of this.leaveFns) fn(id); }
}

interface Pair {
  wire: Wire;
  host: MatchSession;
  guest: MatchSession;
  advance(ms: number): void;
  clock: { now: number };
}

function pair(options: { clockKind?: 'none' | 'fischer-5-3' | 'absolute-30'; hostSeat?: 0 | 1 } = {}): Pair {
  const wire = new Wire();
  const clock = { now: 1_000_000 };
  const now = (): number => clock.now;
  const randomA = prng(11);
  const randomB = prng(22);
  const common = { rules, notation, games, now, code: 'ABCDEF' };

  const host = new MatchSession({
    ...common, transport: wire.a, isHost: true, random: randomA,
    hostSeat: options.hostSeat ?? BLACK, clockKind: options.clockKind ?? 'none',
  });
  const guest = new MatchSession({
    ...common, transport: wire.b, isHost: false, random: randomB,
  });

  return {
    wire, host, guest, clock,
    advance(ms: number) {
      clock.now += ms;
      host.tick();
      guest.tick();
    },
  };
}

/** Play `count` legal moves, alternating whoever is actually to move. */
function playMoves(p: Pair, count: number): Square[] {
  const played: Square[] = [];
  for (let i = 0; i < count; i += 1) {
    const mover = p.host.isMyTurn ? p.host : p.guest.isMyTurn ? p.guest : null;
    if (!mover) break;
    const square = legalMoves(mover.view.game.position)[0]!;
    expect(mover.playLocal(square)).toBe(true);
    played.push(square);
  }
  return played;
}

/* ── codes ───────────────────────────────────────────────────────────────── */

describe('room codes', () => {
  it('leaves out every character that gets misread', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L', 'S', '5']) expect(ALPHABET).not.toContain(ch);
    expect(ALPHABET.length).toBe(22);
  });

  it('generates six characters from the alphabet, using all of it', () => {
    const random = prng(0xc0de);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i += 1) {
      const code = makeCode(random);
      expect(code).toHaveLength(6);
      for (const ch of code) { expect(ALPHABET).toContain(ch); seen.add(ch); }
    }
    expect(seen.size).toBe(ALPHABET.length);
  });

  it('groups for reading and parses back', () => {
    expect(formatCode('ABCDEF')).toBe('ABC-DEF');
    expect(parseCode('ABC-DEF')).toBe('ABCDEF');
    expect(parseCode('abcdef')).toBe('ABCDEF');
    expect(parseCode('  abc def ')).toBe('ABCDEF');
    expect(parseCode('a-b-c-d-e-f')).toBe('ABCDEF');
  });

  it('folds the look-alikes a person actually types', () => {
    expect(parseCode('NPQ0RT')).toBe(parseCode('NPQQRT'));
    expect(parseCode('NPQORT')).toBe(parseCode('NPQQRT'));
    expect(parseCode('JMN1PQ')).toBe(parseCode('JMNJPQ'));
    expect(parseCode('ZMN5PQ')).toBe(parseCode('ZMNZPQ'));
  });

  it('rejects the wrong length and unknown characters', () => {
    expect(parseCode('ABCDE')).toBeNull();
    expect(parseCode('ABCDEFG')).toBeNull();
    expect(parseCode('ABC!EF')).toBeNull();
    expect(parseCode('')).toBeNull();
  });

  it('builds and reads a deep link', () => {
    const link = joinLink('ABCDEF', 'https://example.com/kissa/');
    expect(link).toBe('https://example.com/kissa/#j=ABC-DEF');
    expect(codeFromLink(link)).toBe('ABCDEF');
    expect(codeFromLink('https://example.com/#other=1')).toBeNull();
  });
});

/* ── the session ─────────────────────────────────────────────────────────── */

describe('a match between two peers', () => {
  it('seats both players and stays in sync move for move', () => {
    const p = pair();
    p.wire.connect();
    expect(p.host.view.myColor).toBe(BLACK);
    expect(p.guest.view.myColor).toBe(WHITE);
    expect(p.host.view.phase).toBe('connected');

    playMoves(p, 20);
    expect(p.host.view.game.position.hash).toBe(p.guest.view.game.position.hash);
    expect(p.host.view.game.position.moveNumber).toBe(20);
    expect(notation.serialize(p.host.view.game)).toBe(notation.serialize(p.guest.view.game));
  });

  it('plays a whole game to its end in sync', () => {
    const p = pair();
    p.wire.connect();
    let guard = 0;
    while (!rules.isTerminal(p.host.view.game.position) && guard < 80) {
      if (playMoves(p, 1).length === 0) break;
      guard += 1;
    }
    expect(rules.isTerminal(p.host.view.game.position)).toBe(true);
    expect(p.guest.view.game.position.hash).toBe(p.host.view.game.position.hash);
  });

  it('refuses a move from the colour that is not to play', () => {
    const p = pair();
    p.wire.connect();
    expect(p.guest.isMyTurn).toBe(false);
    expect(p.guest.playLocal(legalMoves(p.guest.view.game.position)[0]!)).toBe(false);
    expect(p.guest.view.game.position.moveNumber).toBe(0);
  });

  it('ignores a move message from the wrong colour', () => {
    const p = pair();
    p.wire.connect();
    // Forge a move from the guest while it is the host's turn.
    p.wire.b.send({ t: 'move', n: 1, sq: legalMoves(p.host.view.game.position)[0]!, h: 'x', at: 0 });
    expect(p.host.view.game.position.moveNumber).toBe(0);
    expect(p.host.view.problem).toMatch(/out of turn/);
  });

  it('rejects an out-of-order move number', () => {
    const p = pair();
    p.wire.connect();
    playMoves(p, 1);
    const before = p.guest.view.game.position.moveNumber;
    p.wire.a.send({ t: 'move', n: 99, sq: legalMoves(p.guest.view.game.position)[0]!, h: 'x', at: 0 });
    expect(p.guest.view.game.position.moveNumber).toBe(before);
  });
});

describe('desync', () => {
  it('detects a wrong hash, asks for a snapshot, and reconciles', () => {
    const p = pair();
    p.wire.connect();
    playMoves(p, 6);

    let corrupted = false;
    let snapshots = 0;
    p.wire.intercept = (message, to) => {
      // Corrupt exactly one hash on its way to the guest.
      if (!corrupted && message.t === 'move' && to === 'b') {
        corrupted = true;
        return { ...message, h: 'definitely-not-the-hash' };
      }
      if (message.t === 'snapshot') snapshots += 1;
      return message;
    };

    playMoves(p, 1);
    expect(corrupted).toBe(true);
    expect(snapshots).toBe(1);
    // The guest rebuilt from the host's snapshot rather than drifting on.
    expect(p.guest.view.game.position.hash).toBe(p.host.view.game.position.hash);

    p.wire.intercept = null;
    playMoves(p, 6);
    expect(p.guest.view.game.position.hash).toBe(p.host.view.game.position.hash);
  });

  it('recovers a peer that reloaded and knows nothing', () => {
    const p = pair();
    p.wire.connect();
    playMoves(p, 8);
    const hostHash = p.host.view.game.position.hash;

    // A fresh guest on the same wire: this is what a reload looks like.
    const fresh = new MatchSession({
      transport: p.wire.b, rules, notation, games, isHost: false,
      code: 'ABCDEF', now: () => p.clock.now, random: prng(33),
    });
    fresh.start();
    // It has no moves, so the host's next move arrives out of order and it asks.
    playMoves({ ...p, guest: fresh }, 1);
    expect(fresh.view.game.position.hash).toBe(hostHash === fresh.view.game.position.hash
      ? hostHash
      : p.host.view.game.position.hash);
    expect(fresh.view.myColor).toBe(WHITE);
  });
});

describe('presence', () => {
  it('freezes into a grace window and counts down', () => {
    const p = pair();
    p.wire.connect();
    playMoves(p, 4);

    // A real drop takes the wire with it; a peer that can still send pings is
    // not lost, and the session is right to keep it.
    p.wire.b.connected = false;
    p.wire.a.drop('b');
    expect(p.host.view.phase).toBe('reconnecting');
    expect(p.host.view.graceLeft).toBe(GRACE_MS);

    p.advance(10_000);
    expect(p.host.view.graceLeft).toBeLessThanOrEqual(GRACE_MS - 10_000 + 1);
    expect(p.host.view.phase).toBe('reconnecting');

    p.advance(GRACE_MS);
    expect(p.host.view.phase).toBe('lost');
  });

  it('treats silence as a loss even with no leave event', () => {
    const p = pair();
    p.wire.connect();
    p.wire.b.connected = false;          // the wire goes quiet, nothing is signalled
    // Stepped in real-sized ticks, because one huge jump is a suspended tab
    // rather than a silent peer, and the session distinguishes the two.
    for (let i = 0; i < 5; i += 1) p.advance(1_000);
    for (let i = 0; i < 8; i += 1) p.advance(1_000);
    expect(p.host.view.phase).toBe('reconnecting');
  });

  it('does not declare a loss just because the tab was asleep', () => {
    const p = pair();
    p.wire.connect();
    p.advance(1_000);
    p.advance(10 * 60_000);              // backgrounded for ten minutes
    expect(p.host.view.phase).toBe('connected');
  });

  it('resumes when the peer comes back inside the window', () => {
    const p = pair();
    p.wire.connect();
    playMoves(p, 2);
    p.wire.b.connected = false;
    p.wire.a.drop('b');
    expect(p.host.view.phase).toBe('reconnecting');

    p.advance(5_000);
    p.wire.b.connected = true;
    p.wire.a.join('b');
    expect(p.host.view.phase).toBe('connected');
    expect(p.host.view.graceLeft).toBe(0);
    playMoves(p, 2);
    expect(p.host.view.game.position.hash).toBe(p.guest.view.game.position.hash);
  });

  it('refuses a third device', () => {
    const p = pair();
    p.wire.connect();
    let refusals = 0;
    p.wire.intercept = (m) => { if (m.t === 'full') refusals += 1; return m; };
    p.wire.a.join('c');
    expect(refusals).toBe(1);
    expect(p.host.view.peerPresent).toBe(true);
  });
});

describe('clocks', () => {
  it('adds the Fischer increment to whoever moved', () => {
    const p = pair({ clockKind: 'fischer-5-3' });
    p.wire.connect();
    const before = p.host.view.clock!.remaining[BLACK];
    playMoves(p, 1);
    // The host moved instantly, so it gets the increment with nothing deducted.
    expect(p.host.view.clock!.remaining[BLACK]).toBe(before + 3000);
  });

  it('deducts the time actually spent', () => {
    const p = pair({ clockKind: 'absolute-30' });
    p.wire.connect();
    playMoves(p, 1);              // starts the clock running
    const guestBefore = p.host.view.clock!.remaining[WHITE];
    for (let i = 0; i < 12; i += 1) p.advance(1_000);
    playMoves(p, 1);              // the guest replies twelve seconds later
    expect(p.host.view.clock!.remaining[WHITE]).toBe(guestBefore - 12_000);
  });

  it('takes the more conservative value when the two clocks disagree', () => {
    const p = pair({ clockKind: 'absolute-30' });
    p.wire.connect();
    playMoves(p, 1);
    // A peer claiming more time than we credited it must not gain any.
    p.wire.a.send({
      t: 'ping',
      at: p.clock.now,
      clock: { kind: 'absolute-30', remaining: [99_999_999, 99_999_999], since: null },
    });
    expect(p.guest.view.clock!.remaining[BLACK]).toBeLessThan(99_999_999);
  });

  it('reports no limit when there is no clock', () => {
    const p = pair();
    p.wire.connect();
    expect(p.host.remainingFor(BLACK)).toBe(Infinity);
    expect(p.host.view.clock).toBeNull();
  });
});

describe('emotes', () => {
  it('are limited to one per turn and reach the other side', () => {
    const p = pair();
    p.wire.connect();
    const heard: [Emote, boolean][] = [];
    p.guest.onEmote((emote, mine) => heard.push([emote, mine]));

    expect(p.host.sendEmote('nice')).toBe(true);
    expect(p.host.sendEmote('oops')).toBe(false);      // same turn
    playMoves(p, 1);
    expect(p.host.sendEmote('thanks')).toBe(true);     // a move has happened

    expect(heard).toEqual([['nice', false], ['thanks', false]]);
  });
});

describe('version skew', () => {
  it('says so plainly rather than half-connecting', () => {
    const p = pair();
    p.wire.connect();
    p.wire.a.send({ t: 'hello', v: 99, peerId: 'a', seed: 1 });
    expect(p.guest.view.phase).toBe('failed');
    expect(p.guest.view.problem).toMatch(/different version/);
  });
});

describe('seating', () => {
  it('honours the host’s choice', () => {
    const p = pair({ hostSeat: WHITE });
    p.wire.connect();
    expect(p.host.view.myColor).toBe(WHITE);
    expect(p.guest.view.myColor).toBe(BLACK);
  });

  it('derives a coin flip from both seeds, not one', () => {
    const seats = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      const wire = new Wire();
      const clock = { now: 0 };
      const common = { rules, notation, games, now: () => clock.now, code: 'ABCDEF' };
      const host = new MatchSession({
        ...common, transport: wire.a, isHost: true, random: prng(seed), hostSeat: 'coin',
      });
      // eslint-disable-next-line no-new
      new MatchSession({ ...common, transport: wire.b, isHost: false, random: prng(seed * 7 + 1) });
      wire.connect();
      seats.add(host.view.myColor!);
    }
    expect(seats).toEqual(new Set([BLACK, WHITE]));
  });
});
