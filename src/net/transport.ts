/* ============================================================================
   Transports (brief §8).

   Trystero handles discovery: two browsers find each other through a public
   signalling medium and then talk directly, end to end encrypted, with nothing
   for us to deploy or pay for. Its strategies are swapped by changing the
   import, so both are behind this one interface and the second is raced in when
   the first finds nobody.

   Everything here is imported lazily. The board has to reach interactive
   without any of this in the bundle (brief §15), and a person who only ever
   plays the computer should never download a signalling library at all.
   ========================================================================= */

import { STRATEGY_FALLBACK_MS, type Message, type Transport } from './protocol';

const APP_ID = 'kissa-reversi';

/** The shape of the part of trystero we use, so the lazy import stays typed. */
interface Room {
  makeAction<T>(name: string): [
    (data: T, targets?: string | string[]) => void,
    (handler: (data: T, peerId: string) => void) => void,
  ];
  onPeerJoin(handler: (peerId: string) => void): void;
  onPeerLeave(handler: (peerId: string) => void): void;
  leave(): void;
  getPeers(): Record<string, unknown>;
}

interface TrysteroModule {
  joinRoom(
    config: { appId: string; password?: string; relayUrls?: string[] },
    roomId: string,
  ): Room;
  selfId: string;
}

export type StrategyName = 'nostr' | 'torrent';

async function loadStrategy(name: StrategyName): Promise<TrysteroModule> {
  // Static specifiers, so the bundler can see both and split them out.
  const module = name === 'nostr'
    ? await import('trystero/nostr')
    : await import('trystero/torrent');
  return module as unknown as TrysteroModule;
}

class RoomTransport implements Transport {
  private readonly messageFns: ((m: Message, id: string) => void)[] = [];
  private readonly joinFns: ((id: string) => void)[] = [];
  private readonly leaveFns: ((id: string) => void)[] = [];
  private send_: (data: Message) => void = () => {};
  private room: Room | null = null;

  constructor(readonly selfId: string, readonly strategy: StrategyName) {}

  attach(room: Room): void {
    this.room = room;
    const [send, receive] = room.makeAction<Message>('msg');
    this.send_ = send;
    receive((data, peerId) => { for (const fn of this.messageFns) fn(data, peerId); });
    room.onPeerJoin((id) => { for (const fn of this.joinFns) fn(id); });
    room.onPeerLeave((id) => { for (const fn of this.leaveFns) fn(id); });
  }

  hasPeers(): boolean {
    return this.room !== null && Object.keys(this.room.getPeers()).length > 0;
  }

  send(message: Message): void { this.send_(message); }
  onMessage(fn: (m: Message, id: string) => void): void { this.messageFns.push(fn); }
  onPeerJoin(fn: (id: string) => void): void { this.joinFns.push(fn); }
  onPeerLeave(fn: (id: string) => void): void { this.leaveFns.push(fn); }
  async leave(): Promise<void> { this.room?.leave(); this.room = null; }
}

export interface ConnectResult {
  transport: Transport;
  strategy: StrategyName;
}

export interface ConnectOptions {
  /** The four-digit PIN. It names the room and keys its encryption. */
  pin: string;
  /** Called as each strategy is tried, so the UI can say what is happening. */
  onStrategy?: (name: StrategyName) => void;
  signal?: AbortSignal;
  fallbackMs?: number;
  /**
   * Override the signalling relays. The brief allows a self-hosted relay, and
   * the end-to-end test uses one so the whole PIN path can be proved without
   * depending on a stranger's server being up.
   */
  relayUrls?: readonly string[];
}

/**
 * Join a room, racing in the second strategy if the first finds nobody. Both
 * stay joined once started: the peer may be on either medium, and dropping one
 * to try the other is how a connection gets missed.
 */
export async function connect(options: ConnectOptions): Promise<ConnectResult> {
  const fallbackAfter = options.fallbackMs ?? STRATEGY_FALLBACK_MS;
  const joined: RoomTransport[] = [];

  const join = async (name: StrategyName): Promise<RoomTransport> => {
    options.onStrategy?.(name);
    const module = await loadStrategy(name);
    const transport = new RoomTransport(module.selfId, name);
    // The PIN is the password as well as the room name, so what crosses the
    // signalling relay is readable only by someone who was told the number.
    transport.attach(module.joinRoom(
      {
        appId: APP_ID,
        password: options.pin,
        ...(options.relayUrls ? { relayUrls: [...options.relayUrls] } : {}),
      },
      options.pin,
    ));
    joined.push(transport);
    return transport;
  };

  const first = await join('nostr');
  const settled = await Promise.race([
    waitForPeer(first, fallbackAfter, options.signal),
    // Only start the second strategy once the first has had its window.
    sleep(fallbackAfter).then(() => null),
  ]);
  if (settled) return { transport: first, strategy: 'nostr' };

  const second = await join('torrent');
  const which = await Promise.race([
    waitForPeer(first, fallbackAfter * 3, options.signal).then(() => first),
    waitForPeer(second, fallbackAfter * 3, options.signal).then(() => second),
  ]).catch(() => null);

  if (!which) {
    for (const transport of joined) await transport.leave();
    throw new Error('no-peer');
  }
  // The other medium is left joined: a peer arriving late on it still connects.
  return { transport: which, strategy: which.strategy };
}

function waitForPeer(transport: RoomTransport, timeoutMs: number, signal?: AbortSignal): Promise<RoomTransport> {
  return new Promise((resolve, reject) => {
    if (transport.hasPeers()) { resolve(transport); return; }
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    transport.onPeerJoin(() => { clearTimeout(timer); resolve(transport); });
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });
