/* ============================================================================
   The manual exchange (brief §8).

   The genuinely serverless path, for networks that block the signalling media
   or have no internet at all. One peer produces an offer blob, the other pastes
   it in and produces an answer blob, and the two go back through any side
   channel at all — a message, a QR code held up across the table, a piece of
   paper. After that the connection is direct.

   The honest limit, stated plainly in the UI: some networks refuse direct
   connections between devices outright, and getting through those needs a TURN
   server to relay the traffic, which this app does not run.
   ========================================================================= */

import type { Message, Transport } from './protocol';

const CHANNEL = 'kissa';
/** Hard backstop: some networks never report gathering as complete at all. */
const GATHER_TIMEOUT_MS = 4000;
/** Once the candidates stop arriving, waiting longer buys nothing. */
const GATHER_QUIET_MS = 600;

/**
 * Trim the SDP to what a browser actually needs from the far side, then deflate
 * it. A raw offer is well over two kilobytes, which is a dense QR code and a
 * lot to paste; this typically brings it under one.
 */
async function pack(sdp: RTCSessionDescriptionInit): Promise<string> {
  const lines = (sdp.sdp ?? '')
    .split(/\r?\n/)
    // An SDP ends with a line terminator, so splitting leaves a trailing empty
    // string. Carrying it through and then re-adding a terminator on the way
    // back produces a blank line, which every parser rejects outright.
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('a=extmap') && !line.startsWith('a=rtcp-fb')
      && !line.startsWith('a=ssrc') && !line.startsWith('a=rtpmap') && !line.startsWith('a=fmtp'));
  const payload = `${sdp.type === 'offer' ? 'o' : 'a'}\n${lines.join('\n')}`;
  return `K1${await deflate(payload)}`;
}

async function unpack(blob: string): Promise<RTCSessionDescriptionInit> {
  const trimmed = blob.trim();
  if (!trimmed.startsWith('K1')) throw new Error('That is not a Kissa code.');
  const payload = await inflate(trimmed.slice(2));
  const newline = payload.indexOf('\n');
  if (newline < 0) throw new Error('That is not a Kissa code.');
  const kind = payload.slice(0, newline);
  const lines = payload.slice(newline + 1).split('\n').filter((line) => line.length > 0);
  // Exactly one terminator per line, including the last.
  const sdp = `${lines.join('\r\n')}\r\n`;
  return { type: kind === 'o' ? 'offer' : 'answer', sdp };
}

/* CompressionStream is widely available; where it is not, the blob is simply
   longer, which costs a denser QR code and nothing else. */

async function deflate(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return `0${toBase64(bytes)}`;
  const stream = blobOf(bytes).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return `1${toBase64(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}

/** TypeScript's Uint8Array may be backed by a SharedArrayBuffer, which Blob
    will not take; the copy is a few hundred bytes and settles the question. */
const blobOf = (bytes: Uint8Array): Blob => new Blob([bytes.slice().buffer as ArrayBuffer]);

async function inflate(text: string): Promise<string> {
  const bytes = fromBase64(text.slice(1));
  if (text.startsWith('0')) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read that code.');
  const stream = blobOf(bytes).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

/** Base64url, so a blob survives being pasted into anything. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

class ChannelTransport implements Transport {
  private readonly messageFns: ((m: Message, id: string) => void)[] = [];
  private readonly joinFns: ((id: string) => void)[] = [];
  private readonly leaveFns: ((id: string) => void)[] = [];
  readonly selfId = `manual-${Math.random().toString(36).slice(2, 8)}`;
  private readonly peerId = 'manual-peer';

  constructor(private readonly channel: RTCDataChannel, private readonly pc: RTCPeerConnection) {
    channel.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as Message;
        for (const fn of this.messageFns) fn(message, this.peerId);
      } catch {
        // A malformed frame is not worth tearing the match down for.
      }
    };
    channel.onopen = () => { for (const fn of this.joinFns) fn(this.peerId); };
    channel.onclose = () => { for (const fn of this.leaveFns) fn(this.peerId); };
    if (channel.readyState === 'open') queueMicrotask(() => {
      for (const fn of this.joinFns) fn(this.peerId);
    });
  }

  send(message: Message): void {
    if (this.channel.readyState === 'open') this.channel.send(JSON.stringify(message));
  }
  onMessage(fn: (m: Message, id: string) => void): void { this.messageFns.push(fn); }
  onPeerJoin(fn: (id: string) => void): void { this.joinFns.push(fn); }
  onPeerLeave(fn: (id: string) => void): void { this.leaveFns.push(fn); }
  async leave(): Promise<void> { this.channel.close(); this.pc.close(); }
}

function newConnection(): RTCPeerConnection {
  // No STUN or TURN: on a LAN the host candidates are enough, and the brief
  // rules out paying for a relay. Across the internet this path needs the
  // devices to be reachable, which the UI says outright.
  return new RTCPeerConnection({ iceServers: [] });
}

/**
 * Wait for candidates, but not for a promise the browser may never keep.
 * Plenty of networks leave gathering in progress indefinitely — this sandbox
 * does — so the blob is taken as soon as the candidates stop arriving, and the
 * hard timeout is only there for the case where none ever do.
 */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const done = (): void => { clearTimeout(hard); clearTimeout(quiet); resolve(); };
    const hard = setTimeout(done, GATHER_TIMEOUT_MS);
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate === null) { done(); return; }
      clearTimeout(quiet);
      quiet = setTimeout(done, GATHER_QUIET_MS);
    });
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') done();
    });
  });
}

export interface ManualOffer {
  /** The blob to hand over: copyable, and small enough to be a QR code. */
  blob: string;
  /** Feed the answer blob back in; resolves once the channel is open. */
  accept(answerBlob: string): Promise<Transport>;
  cancel(): void;
}

/** The side that starts: produce an offer, then take the answer. */
export async function createOffer(): Promise<ManualOffer> {
  const pc = newConnection();
  const channel = pc.createDataChannel(CHANNEL, { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);

  return {
    blob: await pack(pc.localDescription!),
    async accept(answerBlob: string): Promise<Transport> {
      await pc.setRemoteDescription(await unpack(answerBlob));
      await waitForOpen(channel);
      return new ChannelTransport(channel, pc);
    },
    cancel(): void { pc.close(); },
  };
}

/** The side that joins: take an offer, produce an answer. */
export async function acceptOffer(offerBlob: string): Promise<{ blob: string; transport: Promise<Transport> }> {
  const pc = newConnection();
  const opened = new Promise<RTCDataChannel>((resolve) => {
    pc.ondatachannel = (event) => resolve(event.channel);
  });
  await pc.setRemoteDescription(await unpack(offerBlob));
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);

  return {
    blob: await pack(pc.localDescription!),
    transport: opened.then(async (channel) => {
      await waitForOpen(channel);
      return new ChannelTransport(channel, pc);
    }),
  };
}

function waitForOpen(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    channel.addEventListener('open', () => resolve());
    channel.addEventListener('error', () => reject(new Error('The direct connection failed.')));
    setTimeout(() => reject(new Error('The direct connection timed out.')), 20_000);
  });
}

export const _internals = { pack, unpack };
