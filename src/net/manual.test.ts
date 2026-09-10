import { describe, expect, it } from 'vitest';
import { _internals } from './manual';

/**
 * A real data-channel offer, captured from Chromium. The exact bytes matter:
 * the first version of the round-trip re-added a line terminator to an SDP that
 * already had one, and the blank line that made was rejected by the parser with
 * nothing but "Invalid SDP line" to go on.
 */
const OFFER_SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:PqfE',
  'a=ice-pwd:xHnLYCZzXBSZ7Fyx0BLoIbkY',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

describe('the manual blob', () => {
  it('round-trips an offer without corrupting the SDP', async () => {
    const blob = await _internals.pack({ type: 'offer', sdp: OFFER_SDP });
    expect(blob.startsWith('K1')).toBe(true);
    const back = await _internals.unpack(blob);
    expect(back.type).toBe('offer');
    expect(back.sdp!.endsWith('\r\n')).toBe(true);
    // No blank lines anywhere: that is the failure this test exists for.
    expect(back.sdp!.split('\r\n').slice(0, -1).every((line) => line.length > 0)).toBe(true);
    // Every line that matters survives, in order.
    for (const line of ['v=0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'a=sctp-port:5000']) {
      expect(back.sdp).toContain(line);
    }
  });

  it('round-trips an answer and keeps its type', async () => {
    const answer = OFFER_SDP.replace('a=setup:actpass', 'a=setup:active');
    const back = await _internals.unpack(await _internals.pack({ type: 'answer', sdp: answer }));
    expect(back.type).toBe('answer');
    expect(back.sdp).toContain('a=setup:active');
  });

  it('is small enough to be a QR code a person can scan', async () => {
    const blob = await _internals.pack({ type: 'offer', sdp: OFFER_SDP });
    // Comfortably inside what version 40 at level L can hold.
    expect(blob.length).toBeLessThan(1200);
  });

  it('refuses something that is not one of ours', async () => {
    await expect(_internals.unpack('hello')).rejects.toThrow(/not a Kissa code/);
    await expect(_internals.unpack('K1')).rejects.toThrow();
  });
});
