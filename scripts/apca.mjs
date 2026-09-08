// APCA (Accessible Perceptual Contrast Algorithm) — W3C draft, constants from
// APCA 0.1.9 / SAPC-98G-4g. Returns Lc, a polarity-signed lightness contrast.
// Implemented here rather than pulled from npm: nine constants and twenty lines,
// and the project ships zero runtime dependencies besides trystero.

const mainTRC = 2.4;
const Rco = 0.2126729, Gco = 0.7151522, Bco = 0.0721750;
const normBG = 0.56, normTXT = 0.57, revTXT = 0.62, revBG = 0.65;
const blkThrs = 0.022, blkClmp = 1.414;
const scaleBoW = 1.14, scaleWoB = 1.14;
const loBoWoffset = 0.027, loWoBoffset = 0.027;
const deltaYmin = 0.0005, loClip = 0.1;

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a hex colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  const c = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Simple-alpha composite of `fg` over `bg`, both hex. Returns hex. */
export function blend(fg, bg, alpha) {
  const f = hexToRgb(fg), b = hexToRgb(bg);
  return rgbToHex([0, 1, 2].map((i) => f[i] * alpha + b[i] * (1 - alpha)));
}

function sRGBtoY(rgb) {
  const lin = (c) => Math.pow(c / 255, mainTRC);
  return Rco * lin(rgb[0]) + Gco * lin(rgb[1]) + Bco * lin(rgb[2]);
}

/** Lc for text `txt` on background `bg`. Positive = dark text on light. */
export function apca(txtHex, bgHex) {
  let txtY = sRGBtoY(hexToRgb(txtHex));
  let bgY = sRGBtoY(hexToRgb(bgHex));
  txtY = txtY > blkThrs ? txtY : txtY + Math.pow(blkThrs - txtY, blkClmp);
  bgY = bgY > blkThrs ? bgY : bgY + Math.pow(blkThrs - bgY, blkClmp);
  if (Math.abs(bgY - txtY) < deltaYmin) return 0;
  let out;
  if (bgY > txtY) {
    const sapc = (Math.pow(bgY, normBG) - Math.pow(txtY, normTXT)) * scaleBoW;
    out = sapc < loClip ? 0 : sapc - loBoWoffset;
  } else {
    const sapc = (Math.pow(bgY, revBG) - Math.pow(txtY, revTXT)) * scaleWoB;
    out = sapc > -loClip ? 0 : sapc + loWoBoffset;
  }
  return out * 100;
}

export const lc = (txt, bg) => Math.abs(apca(txt, bg));

/** Parse `--name: #hex;` declarations out of a CSS file, resolving one level of var(). */
export function parseTokens(css) {
  // Comments first: this file's own prose mentions tokens by name, and a
  // sentence like "--lacquer measures Lc 0.0 against --ink: ..." otherwise
  // parses as a declaration and silently overwrites the real value.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const raw = {};
  for (const m of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) raw[m[1]] = m[2].trim();
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    const val = ref ? raw[ref[1]] : v;
    if (val && /^#[0-9a-fA-F]{3,6}$/.test(val)) out[k] = val;
  }
  return out;
}
