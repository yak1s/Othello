// Writes dist/sw.js with the real precache list and a version derived from the
// built bytes, so a deploy that changes nothing does not invalidate a cache and
// one that changes anything always does.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

/** Everything except the things that must never be served from a stale cache. */
const SKIP = new Set(['sw.js']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(dist)
  .map((f) => relative(dist, f).split('\\').join('/'))
  .filter((f) => !SKIP.has(f))
  .sort();

const hash = createHash('sha256');
for (const file of files) hash.update(file).update(readFileSync(join(dist, file)));
const version = hash.digest('hex').slice(0, 12);

const assets = ['./', ...files.map((f) => `./${f}`)];
const template = readFileSync(new URL('sw-template.js', import.meta.url), 'utf8');
writeFileSync(
  join(dist, 'sw.js'),
  template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets, null, 2)),
);
console.log(`sw.js: ${assets.length} assets precached, version ${version}`);
