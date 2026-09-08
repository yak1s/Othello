import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { encodeQr, formatBits, qrCapacity, qrToPath, versionBits, type EcLevel } from './qr';
import { prng } from '../engine/testkit';

/**
 * jsQR is a development dependency and never ships. It is here because a
 * round-trip through a reader written alongside the encoder would agree with
 * the encoder's own mistakes — and the tables in qr.ts are exactly the kind of
 * transcribed data where a single wrong number produces codes that look right
 * and scan nowhere.
 */
function decode(text: string, ecLevel: EcLevel): string | null {
  const code = encodeQr(text, { ecLevel });
  // A quiet zone of four modules is part of the symbol; without it a decoder is
  // entitled to fail, and a real scanner would.
  const quiet = 4;
  const scale = 3;
  const side = (code.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < code.size; r += 1) {
    for (let c = 0; c < code.size; c += 1) {
      if (!code.modules[r]![c]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const y = (r + quiet) * scale + dy;
          const x = (c + quiet) * scale + dx;
          const i = (y * side + x) * 4;
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
        }
      }
    }
  }
  return jsQR(data, side, side)?.data ?? null;
}

describe('structure', () => {
  it('is the right size for its version', () => {
    for (const version of [1, 7, 20, 40]) {
      const text = 'x'.repeat(qrCapacity(version, 'L'));
      const code = encodeQr(text, { ecLevel: 'L' });
      expect(code.version).toBe(version);
      expect(code.size).toBe(version * 4 + 17);
      expect(code.modules.length).toBe(code.size);
      expect(code.modules.every((row) => row.length === code.size)).toBe(true);
    }
  });

  it('places all three finder patterns and their separators', () => {
    const code = encodeQr('finder', { ecLevel: 'M' });
    const { modules: m, size } = code;
    for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
          expect(m[top + r]![left + c]).toBe(ring !== 2);
        }
      }
    }
    // The separator between a finder and the data is always light.
    for (let i = 0; i < 8; i += 1) {
      expect(m[7]![i]).toBe(false);
      expect(m[i]![7]).toBe(false);
    }
  });

  it('alternates the timing patterns and sets the dark module', () => {
    const code = encodeQr('timing', { ecLevel: 'M' });
    for (let i = 8; i < code.size - 8; i += 1) {
      expect(code.modules[6]![i]).toBe(i % 2 === 0);
      expect(code.modules[i]![6]).toBe(i % 2 === 0);
    }
    expect(code.modules[code.size - 8]![8]).toBe(true);
  });
});

describe('the BCH codes', () => {
  /** The 32 format strings from the specification's table, as bit patterns. */
  const FORMAT_TABLE: Record<string, number[]> = {
    // L (indicator 01) then M (indicator 00), masks 0 through 7.
    L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
    M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
  };

  it('produces the specified format information for every level and mask', () => {
    for (const ec of ['L', 'M'] as EcLevel[]) {
      for (let mask = 0; mask < 8; mask += 1) {
        expect(formatBits(ec, mask)).toBe(FORMAT_TABLE[ec]![mask]);
      }
    }
  });

  it('produces the specified version information from version 7 up', () => {
    // A sample of the specification's version-information table. The top six
    // bits of each word are the version itself, which is what makes a
    // mistranscribed row obvious.
    const known: Record<number, number> = {
      7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3,
      20: 0x149a6, 32: 0x209d5, 40: 0x28c69,
    };
    for (const [version, bits] of Object.entries(known)) {
      expect(bits >> 12).toBe(Number(version));
      expect(versionBits(Number(version))).toBe(bits);
    }
  });
});

describe('round-trips through an independent decoder', () => {
  it('reads back short text at both levels', () => {
    for (const ec of ['L', 'M'] as EcLevel[]) {
      for (const text of ['a', 'kissa', 'https://example.com/#j=ABC-DEF', '0123456789']) {
        expect(decode(text, ec)).toBe(text);
      }
    }
  });

  it('reads back every version at its exact capacity', () => {
    // The capacity boundary is where a wrong block table shows up first.
    for (let version = 1; version <= 40; version += 1) {
      for (const ec of ['L', 'M'] as EcLevel[]) {
        const text = 'A'.repeat(qrCapacity(version, ec));
        const code = encodeQr(text, { ecLevel: ec });
        expect(code.version).toBe(version);
        // Version 23 at level L is the one combination jsQR cannot read, and
        // the fault is jsQR's: its table gives version 23's alignment centres
        // as [6, 30, 54, 74, 102], where the specification spaces them evenly
        // at [6, 30, 54, 78, 102] — see the dedicated test below. Its
        // misplaced pattern corrupts about twenty-five modules, which level M
        // has the redundancy to correct and level L does not, which is exactly
        // why 23-M passes here and 23-L would not.
        if (version === 23 && ec === 'L') continue;
        expect(decode(text, ec)).toBe(text);
      }
    }
  }, 120_000);

  it('places version 23’s alignment patterns where the specification does', () => {
    // The specification spaces the centres evenly between 6 and size - 7
    // whenever the span divides exactly, and for version 23 the span is 96
    // across four intervals — 24 apart, giving 78 for the fourth centre.
    const code = encodeQr('A'.repeat(qrCapacity(23, 'M')), { ecLevel: 'M' });
    expect(code.size).toBe(109);
    // An alignment pattern is a dark centre, a light ring, then a dark ring.
    const isAlignment = (r: number, c: number): boolean => {
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          if (code.modules[r + dr]![c + dc] !== (ring !== 1)) return false;
        }
      }
      return true;
    };
    for (const centre of [30, 54, 78]) {
      expect(isAlignment(78, centre)).toBe(true);
      expect(isAlignment(centre, 78)).toBe(true);
    }
    // And there is no pattern at jsQR's 74.
    expect(isAlignment(74, 74)).toBe(false);
  });

  it('reads back 400 random payloads of varied length', () => {
    const random = prng(0x0ffe);
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=-_.:';
    for (let i = 0; i < 400; i += 1) {
      const length = 1 + Math.floor(random() * 900);
      let text = '';
      for (let j = 0; j < length; j += 1) {
        text += alphabet[Math.floor(random() * alphabet.length)];
      }
      const ec: EcLevel = i % 2 === 0 ? 'L' : 'M';
      const code = encodeQr(text, { ecLevel: ec });
      if (code.version === 23 && ec === 'L') continue;   // jsQR's typo, above
      expect(decode(text, ec)).toBe(text);
    }
  }, 180_000);

  it('reads back a payload the size of a compressed WebRTC offer', () => {
    // The manual fallback is the reason this encoder covers the high versions.
    const random = prng(99);
    let blob = '';
    for (let i = 0; i < 1200; i += 1) blob += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/'[Math.floor(random() * 38)];
    expect(encodeQr(blob, { ecLevel: 'L' }).version).toBeGreaterThan(23);
    expect(decode(blob, 'L')).toBe(blob);
  });
});

describe('version selection', () => {
  it('picks the smallest version that fits, at every boundary', () => {
    for (let version = 1; version <= 40; version += 1) {
      for (const ec of ['L', 'M'] as EcLevel[]) {
        const fits = qrCapacity(version, ec);
        expect(encodeQr('A'.repeat(fits), { ecLevel: ec }).version).toBe(version);
        if (version < 40) {
          expect(encodeQr('A'.repeat(fits + 1), { ecLevel: ec }).version).toBe(version + 1);
        }
      }
    }
  });

  it('honours a minimum version', () => {
    expect(encodeQr('a', { ecLevel: 'M', minVersion: 5 }).version).toBe(5);
  });

  it('refuses more than a QR code can hold', () => {
    expect(() => encodeQr('A'.repeat(4000), { ecLevel: 'L' })).toThrow(/does not fit/);
  });
});

describe('rendering', () => {
  it('emits one path segment per dark module', () => {
    const code = encodeQr('path', { ecLevel: 'M' });
    const dark = code.modules.flat().filter(Boolean).length;
    expect(qrToPath(code).match(/M/g)!.length).toBe(dark);
  });
});
