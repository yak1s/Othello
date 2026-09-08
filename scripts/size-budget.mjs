// Checks the built output against the budgets in brief §15. Run after a build;
// exits non-zero on a breach, so it can gate a release.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

const BUDGETS = {
  js: 120 * 1024,
  css: 14 * 1024,
  fonts: 180 * 1024,
  /** Everything transferred except fonts, which the brief excludes. */
  total: 400 * 1024,
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const groups = { js: 0, css: 0, fonts: 0, other: 0 };
const rows = [];

for (const file of walk(dist)) {
  const name = relative(dist, file);
  const bytes = readFileSync(file);
  const ext = extname(name);
  // Fonts and PNGs are already compressed; gzipping them again is not what the
  // wire does, so they count at their real size.
  const precompressed = ext === '.woff2' || ext === '.png';
  const size = precompressed ? bytes.length : gzipSync(bytes, { level: 9 }).length;
  const group = ext === '.woff2' ? 'fonts' : ext === '.js' ? 'js' : ext === '.css' ? 'css' : 'other';
  groups[group] += size;
  rows.push({ name, group, size });
}

rows.sort((a, b) => b.size - a.size);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log('largest files (gzipped, except fonts and images)');
for (const row of rows.slice(0, 12)) console.log(`  ${kb(row.size).padStart(9)}  ${row.name}`);

const totalNoFonts = groups.js + groups.css + groups.other;
const checks = [
  ['JavaScript', groups.js, BUDGETS.js],
  ['CSS', groups.css, BUDGETS.css],
  ['Fonts', groups.fonts, BUDGETS.fonts],
  ['Total excluding fonts', totalNoFonts, BUDGETS.total],
];

console.log('\nbudgets');
let failed = 0;
for (const [label, used, budget] of checks) {
  const ok = used <= budget;
  if (!ok) failed += 1;
  const pct = ((used / budget) * 100).toFixed(0);
  console.log(`  ${ok ? 'ok  ' : 'OVER'}  ${label.padEnd(24)} ${kb(used).padStart(9)} of ${kb(budget).padStart(9)}  (${pct}%)`);
}
console.log(`  ---   images and other ${kb(groups.other).padStart(20)}`);

if (failed) {
  console.error(`\n${failed} budget(s) exceeded.`);
  process.exit(1);
}
console.log('\nevery budget met.');
