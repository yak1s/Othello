// The anti-slop blocklist from brief §4, as a check rather than an intention.
// It reads the user-facing strings out of the source and fails on anything the
// brief forbids. Run: npm run check:copy
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const roots = ['src', 'index.html'].map((p) => fileURLToPath(new URL(`../${p}`, import.meta.url)));

function walk(target) {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target).flatMap((entry) => walk(join(target, entry)));
}

const files = roots.flatMap(walk)
  .filter((f) => /\.(ts|css|html)$/.test(f))
  .filter((f) => !f.endsWith('.test.ts'));

/** Only the strings a person can actually read. */
function userStrings(source, file) {
  const out = [];
  if (file.endsWith('.css')) return out;
  // text:, label:, title:, placeholder:, aria-label: and template/quoted literals
  // passed to el() or thrown as UI copy.
  for (const m of source.matchAll(/(?:text|title|label|placeholder|reason|'aria-label'|unavailableReason):\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
    out.push({ text: m[2], at: m.index });
  }
  for (const m of source.matchAll(/toast\.show\((['"`])((?:\\.|(?!\1).)*)\1/g)) out.push({ text: m[2], at: m.index });
  for (const m of source.matchAll(/say\((['"`])((?:\\.|(?!\1).)*)\1/g)) out.push({ text: m[2], at: m.index });
  return out;
}

const RULES = [
  { name: 'emoji as iconography', test: (s) => /\p{Extended_Pictographic}/u.test(s) },
  { name: 'an arrow on a label', test: (s) => /→|->\s*$/.test(s) },
  { name: 'meta joined with a middot', test: (s) => / · /.test(s) },
  {
    // The tell is a short label with a fragment hung off a dash, not an em dash
    // in flowing prose, which is ordinary English and appears in the brief.
    name: 'LABEL — fragment',
    test: (s) => {
      const at = s.indexOf(' — ');
      if (at < 0) return false;
      const before = s.slice(0, at).trim();
      return before.split(/\s+/).length <= 4 && !/[.?!:]$/.test(before);
    },
  },
  { name: 'an exclamation mark', test: (s) => /!/.test(s) },
  { name: 'ALL-CAPS eyebrow', test: (s) => /\b[A-Z]{4,}\b/.test(s) && !/^[A-Z]{1,3}$/.test(s.trim()) },
  { name: 'banned phrasing', test: (s) => /\b(oops|something went wrong|seamless|elevate|AI-powered|powered by AI)\b/i.test(s) },
];

/** Rules that apply to the stylesheets rather than the prose. */
const CSS_RULES = [
  { name: 'a two-hue gradient', test: (s) => /linear-gradient\([^)]*#[0-9a-f]{3,6}[^)]*#[0-9a-f]{3,6}/i.test(s) },
  { name: 'backdrop-filter (glassmorphism)', test: (s) => /backdrop-filter/i.test(s) },
  { name: 'the default soft grey shadow', test: (s) => /rgba\(0,\s*0,\s*0,\s*\.?0?\.1\)/.test(s) },
  { name: 'a mid rounded-rectangle radius', test: (s) => /border-radius:\s*(?:[4-9]|1[0-9]|2[0-3])px/.test(s) },
  { name: 'a raw hex outside the token file', test: (s) => /#[0-9a-fA-F]{6}\b/.test(s) },
];

let failures = 0;
let checked = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const name = relative(fileURLToPath(new URL('..', import.meta.url)), file);

  if (file.endsWith('.css')) {
    // tokens.css is where the raw values are allowed to live; it is the point.
    const isTokens = name.endsWith('tokens.css') || name.endsWith('.generated.css') || name.endsWith('fonts.css');
    for (const rule of CSS_RULES) {
      if (rule.name.includes('raw hex') && isTokens) continue;
      for (const line of source.split('\n')) {
        if (line.trimStart().startsWith('/*') || line.trimStart().startsWith('*')) continue;
        if (!rule.test(line)) continue;
        console.error(`  ${name}: ${rule.name}\n      ${line.trim()}`);
        failures += 1;
      }
    }
    continue;
  }

  for (const { text } of userStrings(source, file)) {
    checked += 1;
    for (const rule of RULES) {
      if (!rule.test(text)) continue;
      console.error(`  ${name}: ${rule.name}\n      "${text}"`);
      failures += 1;
    }
  }
}

console.log(`${checked} user-facing strings and every stylesheet checked against the blocklist.`);
if (failures) {
  console.error(`\n${failures} blocklist violation(s).`);
  process.exit(1);
}
console.log('nothing on the list.');
