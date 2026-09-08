/* ============================================================================
   A QR encoder, written here rather than called out to (brief §8).

   Joining a game has to work on a LAN with no internet at all, so a QR service
   is not an option; and the manual WebRTC fallback needs to encode a kilobyte
   or more, so this covers versions 1 to 40 in byte mode at error-correction
   levels L and M.

   It is verified in qr.test.ts against jsQR — an independent decoder, kept as a
   development dependency only. Round-tripping through our own reader would
   agree with our own mistakes; the spec tables below are exactly the kind of
   data that has to be checked against something that did not come from here.
   ========================================================================= */

export type EcLevel = 'L' | 'M';

export interface QrCode {
  version: number;
  size: number;
  /** `modules[row][col]`; true is dark. */
  modules: boolean[][];
  ecLevel: EcLevel;
}

/* ── Galois field GF(256), primitive polynomial 0x11d ────────────────────── */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
}

const mul = (a: number, b: number): number =>
  (a === 0 || b === 0) ? 0 : EXP[LOG[a]! + LOG[b]!]!;

/**
 * The divisor for `degree` error-correction codewords: the product of
 * (x - α^i) for i < degree, highest power first, with the monic leading term
 * dropped because the division loop below never needs it.
 */
function divisorFor(degree: number): Uint8Array {
  // Built lowest power first, which is the natural direction for the recurrence.
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = next[j]! ^ mul(poly[j]!, EXP[i]!);
      next[j + 1] = next[j + 1]! ^ poly[j]!;
    }
    poly = next;
  }
  return poly.slice(0, degree).reverse();
}

const divisorCache = new Map<number, Uint8Array>();
function divisor(degree: number): Uint8Array {
  let value = divisorCache.get(degree);
  if (!value) { value = divisorFor(degree); divisorCache.set(degree, value); }
  return value;
}

function remainder(data: Uint8Array, degree: number): Uint8Array {
  const div = divisor(degree);
  const out = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ out[0]!;
    out.copyWithin(0, 1);
    out[degree - 1] = 0;
    for (let i = 0; i < degree; i += 1) out[i] = out[i]! ^ mul(div[i]!, factor);
  }
  return out;
}

/* ── Version tables (ISO/IEC 18004). Verified against jsQR in the tests. ─── */

/** Error-correction codewords per block, indexed [version - 1], for L then M. */
const EC_PER_BLOCK: Readonly<Record<EcLevel, readonly number[]>> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
    28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};

/** Number of error-correction blocks, indexed [version - 1]. */
const BLOCKS: Readonly<Record<EcLevel, readonly number[]>> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
    8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};

const ALIGNMENT: readonly (readonly number[])[] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
  [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

const sizeOf = (version: number): number => version * 4 + 17;

/**
 * The total codeword count is not tabulated here: it is derived by building the
 * function patterns for the version and counting what is left. That removes a
 * forty-row table and makes the count agree with the matrix by construction.
 */
function totalCodewords(version: number): number {
  return Math.floor(freeModules(version) / 8);
}

function freeModules(version: number): number {
  const size = sizeOf(version);
  const reserved = functionMask(version);
  let free = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) if (!reserved[r]![c]) free += 1;
  }
  return free;
}

const totalCache = new Map<number, number>();
function codewordsFor(version: number): number {
  let value = totalCache.get(version);
  if (value === undefined) { value = totalCodewords(version); totalCache.set(version, value); }
  return value;
}

const dataCodewords = (version: number, ec: EcLevel): number =>
  codewordsFor(version) - EC_PER_BLOCK[ec][version - 1]! * BLOCKS[ec][version - 1]!;

/** Bytes encodable in byte mode, after the mode indicator and length header. */
function capacity(version: number, ec: EcLevel): number {
  const headerBits = 4 + (version < 10 ? 8 : 16);
  return Math.floor((dataCodewords(version, ec) * 8 - headerBits) / 8);
}

/* ── Function patterns ───────────────────────────────────────────────────── */

/** True where a module is reserved: finders, separators, timing, format, version. */
function functionMask(version: number): boolean[][] {
  const size = sizeOf(version);
  const mask = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fill = (top: number, left: number, h: number, w: number): void => {
    for (let r = top; r < top + h; r += 1) {
      for (let c = left; c < left + w; c += 1) {
        if (r >= 0 && r < size && c >= 0 && c < size) mask[r]![c] = true;
      }
    }
  };

  // Finder patterns with their separators.
  fill(0, 0, 9, 9);
  fill(0, size - 8, 9, 8);
  fill(size - 8, 0, 8, 9);

  // Timing patterns.
  for (let i = 0; i < size; i += 1) { mask[6]![i] = true; mask[i]![6] = true; }

  // Alignment patterns, except where they would collide with a finder.
  const centres = ALIGNMENT[version - 1]!;
  for (const r of centres) {
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      fill(r - 2, c - 2, 5, 5);
    }
  }

  // Version information blocks, for version 7 and up.
  if (version >= 7) {
    fill(size - 11, 0, 3, 6);
    fill(0, size - 11, 6, 3);
  }
  return mask;
}

function drawFunctionPatterns(m: boolean[][], version: number): void {
  const size = sizeOf(version);

  const finder = (top: number, left: number): void => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        m[rr]![cc] = ring !== 2 && ring <= 3;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    m[6]![i] = dark;
    m[i]![6] = dark;
  }

  const centres = ALIGNMENT[version - 1]!;
  for (const r of centres) {
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          m[r + dr]![c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }

  // The dark module, which is always set.
  m[size - 8]![8] = true;

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = i % 3;
      m[size - 11 + c]![r] = bit;
      m[r]![size - 11 + c] = bit;
    }
  }
}

/** BCH(18,6) version information. */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  return ((version << 12) | rem) >>> 0;
}

/** BCH(15,5) format information, masked with 0x5412. */
export function formatBits(ec: EcLevel, mask: number): number {
  // The two-bit EC indicator is not in level order: L is 01 and M is 00.
  const indicator = ec === 'L' ? 1 : 0;
  const data = (indicator << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) >>> 0;
}

function drawFormat(m: boolean[][], version: number, ec: EcLevel, mask: number): void {
  const size = sizeOf(version);
  const bits = formatBits(ec, mask);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((bits >> i) & 1) === 1;
    // The first copy runs down column 8 and then along row 8, around the
    // top-left finder, skipping the timing module at row 6.
    if (i < 6) m[i]![8] = bit;
    else if (i === 6) m[7]![8] = bit;
    else if (i === 7) m[8]![8] = bit;
    else if (i === 8) m[8]![7] = bit;
    else m[8]![14 - i] = bit;
    // The duplicate copy, split between the other two finders.
    if (i < 8) m[8]![size - 1 - i] = bit;
    else m[size - 15 + i]![8] = bit;
  }
}

/* ── Encoding ────────────────────────────────────────────────────────────── */

class BitBuffer {
  readonly bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1);
  }
  get length(): number { return this.bits.length; }
  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, i) => { if (bit) out[i >> 3] = out[i >> 3]! | (0x80 >> (i & 7)); });
    return out;
  }
}

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function smallestVersion(byteLength: number, ec: EcLevel): number {
  for (let version = 1; version <= 40; version += 1) {
    if (byteLength <= capacity(version, ec)) return version;
  }
  throw new RangeError(`${byteLength} bytes does not fit in a QR code at level ${ec}`);
}

/** Split the data into blocks, append error correction, and interleave. */
function buildCodewords(data: Uint8Array, version: number, ec: EcLevel): Uint8Array {
  const blockCount = BLOCKS[ec][version - 1]!;
  const ecLength = EC_PER_BLOCK[ec][version - 1]!;
  const total = dataCodewords(version, ec);
  const shortLength = Math.floor(total / blockCount);
  const longBlocks = total % blockCount;

  const blocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i += 1) {
    const length = shortLength + (i >= blockCount - longBlocks ? 1 : 0);
    const block = data.subarray(offset, offset + length);
    offset += length;
    blocks.push(block);
    ecBlocks.push(remainder(block, ecLength));
  }

  const out: number[] = [];
  for (let i = 0; i < shortLength + 1; i += 1) {
    for (const block of blocks) if (i < block.length) out.push(block[i]!);
  }
  for (let i = 0; i < ecLength; i += 1) {
    for (const block of ecBlocks) out.push(block[i]!);
  }
  return new Uint8Array(out);
}

/** Place the codewords in the zig-zag order the spec defines. */
function placeData(m: boolean[][], reserved: boolean[][], version: number, codewords: Uint8Array): void {
  const size = sizeOf(version);
  let bit = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is skipped entirely.
    const col = right <= 6 ? right - 1 : right;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (reserved[row]![c]) continue;
        const byte = codewords[bit >> 3];
        m[row]![c] = byte !== undefined && ((byte >> (7 - (bit & 7))) & 1) === 1;
        bit += 1;
      }
    }
    upward = !upward;
  }
}

const MASKS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The four penalty rules from the specification. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;

  const runScore = (run: number): number => (run >= 5 ? run - 2 : 0);
  for (let r = 0; r < size; r += 1) {
    let runH = 1;
    let runV = 1;
    for (let c = 1; c < size; c += 1) {
      runH = m[r]![c] === m[r]![c - 1] ? runH + 1 : (score += runScore(runH), 1);
      runV = m[c]![r] === m[c - 1]![r] ? runV + 1 : (score += runScore(runV), 1);
    }
    score += runScore(runH) + runScore(runV);
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = m[r]![c];
      if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) score += 3;
    }
  }

  const FINDER = [true, false, true, true, true, false, true, false, false, false, false];
  const REVERSED = [...FINDER].reverse();
  const matches = (line: boolean[], at: number, pattern: boolean[]): boolean =>
    pattern.every((want, i) => line[at + i] === want);
  for (let i = 0; i < size; i += 1) {
    const row = m[i]!;
    const col = m.map((line) => line[i]!);
    for (let j = 0; j + 11 <= size; j += 1) {
      if (matches(row, j, FINDER) || matches(row, j, REVERSED)) score += 40;
      if (matches(col, j, FINDER) || matches(col, j, REVERSED)) score += 40;
    }
  }

  let dark = 0;
  for (const row of m) for (const cell of row) if (cell) dark += 1;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Encode `text` as a QR code, choosing the smallest version that fits. */
export function encodeQr(text: string, options: { ecLevel?: EcLevel; minVersion?: number } = {}): QrCode {
  const ec = options.ecLevel ?? 'M';
  const bytes = toBytes(text);
  const version = Math.max(smallestVersion(bytes.length, ec), options.minVersion ?? 1);
  if (version > 40) throw new RangeError('Too much data for a QR code');

  const buffer = new BitBuffer();
  buffer.put(0b0100, 4);                              // byte mode
  buffer.put(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) buffer.put(byte, 8);

  const capacityBits = dataCodewords(version, ec) * 8;
  buffer.put(0, Math.min(4, capacityBits - buffer.length));   // terminator
  while (buffer.length % 8 !== 0) buffer.put(0, 1);

  const data = new Uint8Array(dataCodewords(version, ec));
  data.set(buffer.toBytes());
  // Pad alternately with the two bytes the spec names, so the remainder is not
  // a long run of one value that the mask has to fight.
  for (let i = buffer.toBytes().length, pad = 0; i < data.length; i += 1, pad += 1) {
    data[i] = pad % 2 === 0 ? 0xec : 0x11;
  }

  const codewords = buildCodewords(data, version, ec);
  const size = sizeOf(version);
  const reserved = functionMask(version);

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const m = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    drawFunctionPatterns(m, version);
    placeData(m, reserved, version, codewords);
    const rule = MASKS[mask]!;
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) if (!reserved[r]![c] && rule(r, c)) m[r]![c] = !m[r]![c];
    }
    drawFormat(m, version, ec, mask);
    const score = penalty(m);
    if (score < bestScore) { bestScore = score; best = m; }
  }

  return { version, size, modules: best!, ecLevel: ec };
}

/** Render a code as an SVG path string, one module per unit. */
export function qrToPath(code: QrCode): string {
  const parts: string[] = [];
  for (let r = 0; r < code.size; r += 1) {
    for (let c = 0; c < code.size; c += 1) {
      if (code.modules[r]![c]) parts.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  return parts.join('');
}

export const qrCapacity = capacity;
