/* A nostr relay, small enough to read, for the end-to-end PIN test.

   Trystero's `relayUrls` config replaces its default relay list outright, so
   pointing the app at one of these proves the whole path — PIN, room,
   signalling, WebRTC, the session handshake — without depending on a stranger's
   server being reachable from wherever the tests happen to run.

   It implements exactly the three messages trystero sends (REQ, EVENT, CLOSE)
   and nothing else. It does not verify signatures: it is a test fixture, not a
   relay anyone should deploy. */

import { WebSocketServer, type WebSocket } from 'ws';

interface Filter { kinds?: number[]; since?: number; [tag: string]: unknown }
interface Event { id: string; kind: number; created_at: number; tags: string[][]; content: string }

export interface Relay {
  url: string;
  /** How many events the relay has passed on. Zero means nothing got through. */
  delivered: number;
  close(): Promise<void>;
}

export async function startRelay(): Promise<Relay> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const subs = new Map<WebSocket, Map<string, Filter>>();
  const relay: Relay = {
    url: '',
    delivered: 0,
    close: () => new Promise((resolve) => {
      // Sockets first. `close()` alone waits for every client to hang up, and
      // the app's are still open — which is a hung fixture, not a failing app.
      for (const socket of server.clients) socket.terminate();
      server.close(() => resolve());
    }),
  };

  const matches = (filter: Filter, event: Event): boolean => {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    for (const [key, want] of Object.entries(filter)) {
      if (!key.startsWith('#') || !Array.isArray(want)) continue;
      const name = key.slice(1);
      const has = event.tags.some(([t, v]) => t === name && want.includes(v));
      if (!has) return false;
    }
    // `since` is deliberately ignored: both peers stamp their events from their
    // own clock, and a relay that drops one because a wall clock is a second
    // behind is a flake, not a test.
    return true;
  };

  server.on('connection', (socket) => {
    subs.set(socket, new Map());
    socket.on('message', (raw) => {
      let frame: unknown;
      try { frame = JSON.parse(String(raw)); } catch { return; }
      if (!Array.isArray(frame)) return;
      const [kind] = frame as [string, ...unknown[]];

      if (kind === 'REQ') {
        const [, subId, filter] = frame as [string, string, Filter];
        subs.get(socket)!.set(subId, filter);
      } else if (kind === 'CLOSE') {
        const [, subId] = frame as [string, string];
        subs.get(socket)!.delete(subId);
      } else if (kind === 'EVENT') {
        const [, event] = frame as [string, Event];
        socket.send(JSON.stringify(['OK', event.id, true, '']));
        for (const [peer, filters] of subs) {
          if (peer === socket || peer.readyState !== peer.OPEN) continue;
          for (const [subId, filter] of filters) {
            if (!matches(filter, event)) continue;
            peer.send(JSON.stringify(['EVENT', subId, event]));
            relay.delivered += 1;
            break;
          }
        }
      }
    });
    socket.on('close', () => subs.delete(socket));
  });

  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('the relay did not bind');
  relay.url = `ws://127.0.0.1:${address.port}`;
  return relay;
}
