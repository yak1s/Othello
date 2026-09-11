// Every text and UI pair the app actually renders, measured with APCA against
// the targets in brief §4.3. Exits non-zero on a failure, so contrast is a gate
// rather than an opinion. Run: npm run check:apca
import { readFileSync } from 'node:fs';
import { blend, lc, parseTokens } from './apca.mjs';

const css = ['tokens.css', 'base.css', 'components.css', 'board.css', 'screens.css']
  .map((f) => readFileSync(new URL(`../src/styles/${f}`, import.meta.url), 'utf8'))
  .join('\n');
const T = parseTokens(css);

/** Targets from the brief. `disabled` and `exempt` carry their reason. */
const TARGET = { body: 75, large: 45, ui: 30 };

const FELTS = [['baize', T['--baize']], ['slate', T['--slate']], ['sand', T['--sand']]];
const FELT_ALTS = [['baize', T['--baize-alt']], ['slate', T['--slate-alt']], ['sand', T['--sand-alt']]];

const pairs = [
  // ── text on the dark ground ──
  ['body', 'home lede, status line', T['--text-quiet'], T['--ink']],
  ['body', 'menu row label 17/500', T['--text'], T['--ink']],
  ['body', 'thumb bar label 13', T['--text'], T['--ink']],
  ['body', 'quiet link 13 (Settings, How to play)', T['--text-quiet'], T['--ink']],
  ['body', 'top bar match label 13', T['--text-quiet'], T['--ink']],
  ['body', 'top bar text on lacquer', T['--text'], T['--lacquer']],

  // ── text on paper ──
  ['body', 'sheet body 15 on paper', T['--ink'], T['--card']],
  ['body', 'sheet title 34 on paper', T['--ink'], T['--card']],
  ['body', 'field hint 13 on paper', T['--lacquer'], T['--card']],
  ['body', 'move-list ply number on paper', T['--lacquer'], T['--card']],
  ['body', 'score numeral 22/700 on paper', T['--ink'], T['--card']],
  ['body', 'capsule name 15 on paper', T['--ink'], T['--card']],
  ['body', 'primary button label 17/500', T['--ink'], T['--card']],
  ['body', 'primary button label, hover fill', T['--ink'], T['--bone']],
  ['body', 'primary button label, pressed fill', T['--ink'], T['--press']],
  ['body', 'locked level row label 17/400', T['--ink'], T['--press']],
  ['body', 'locked level note 13', T['--ink'], T['--press']],
  ['body', 'segmented option, unselected', T['--lacquer'], T['--card']],
  ['body', 'segmented option, selected', T['--card'], T['--ink']],
  ['large', 'destructive label 17/600 on paper', T['--shu'], T['--card']],
  ['body', 'destructive label is ink, not shu', T['--ink'], T['--card']],

  // ── the pieces ──
  ...FELTS.map(([name, felt]) => ['ui', `light disc on ${name}`, T['--bone'], felt]),
  ...FELTS.map(([name, felt]) => ['ui', `dark disc rim on ${name}`, T['--disc-rim-dark'], felt]),
  ...FELTS.map(([name, felt]) => ['ui', `light disc rim on ${name}`, T['--disc-rim-light'], felt]),
  ...FELT_ALTS.map(([name, alt]) => ['ui', `dark disc rim on ${name} alt square`, T['--disc-rim-dark'], alt]),
  ...FELT_ALTS.map(([name, alt]) => ['ui', `light disc on ${name} alt square`, T['--bone'], alt]),

  // ── the focus ring, which has to work on every ground in the app ──
  ...FELTS.map(([name, felt]) => ['ui', `focus ring on ${name}`, T['--brass-lit'], felt]),
  ...FELT_ALTS.map(([name, alt]) => ['ui', `focus ring on ${name} alt square`, T['--brass-lit'], alt]),
  ['ui', 'focus ring on the page ground', T['--brass-lit'], T['--ink']],
  ['ui', 'focus ring on paper', T['--brass-lit'], T['--card']],
  ['ui', 'focus ring on the frame', T['--brass-lit'], T['--lacquer']],

  // ── marks and rules ──
  ['body', 'the PIN, 56/700 on paper', T['--ink'], T['--card']],
  ['body', 'the waiting line, 13 on paper', T['--lacquer'], T['--card']],
  ['body', 'the PIN field, 34/700 on bone', T['--ink'], T['--bone']],
  ['ui', 'the PIN field placeholder on bone', T['--disabled'], T['--bone']],
  ['ui', 'the rule under the PIN', T['--brass'], T['--card']],
  ['ui', 'primary button keyline on paper', T['--brass'], T['--card']],
  ['ui', 'turn rule on paper', T['--brass'], T['--card']],
  ['ui', 'divider on the page ground', T['--rule'], T['--ink']],
  ['ui', 'board keyline against the room', T['--frame-edge'], T['--ink']],
  ['ui', 'board keyline against the frame', T['--frame-edge'], T['--lacquer']],
  ['ui', 'destructive rule on paper', T['--shu'], T['--card']],
  ['ui', 'switch track, on', T['--brass'], T['--card']],
  ['ui', 'light disc mark on paper', T['--mark-edge'], T['--card']],
  ['ui', 'dark disc mark on paper', T['--ink'], T['--card']],
  ...FELTS.map(([name, felt]) => ['ui', `legal-move dot on ${name}`, blend(T['--bone'], felt, 0.46), felt]),
  ...FELTS.map(([name, felt]) => ['ui', `last-move marker on ${name}`, T['--brass-lit'], felt]),
  ...FELTS.map(([name, felt]) => ['ui', `ghost disc rim on ${name}`, T['--disc-rim-dark'], felt]),
  ...FELT_ALTS.map(([name, alt]) => ['ui', `legal-move dot on ${name} alt square`, blend(T['--bone'], alt, 0.46), alt]),

  // ── documented exemptions, checked so a regression still shows up ──
  ['disabled', 'disabled control label and border', T['--disabled'], T['--ink']],
  ['ui', 'coordinates on the frame', T['--text-coord'], T['--lacquer']],
  ['exempt', 'paper hairline (--e1), decorative', T['--card-edge'], T['--card']],
  ['exempt', 'locked row recess against paper, a tonal block', T['--press'], T['--card']],
  ...FELTS.map(([name, felt]) => ['exempt', `guide dot on ${name}, a printed mark`, blend(T['--ink'], felt, 0.34), felt]),
  ...FELTS.map(([name, felt], i) => ['exempt', `${name} weave, intentionally near-invisible`, FELT_ALTS[i][1], felt]),
];

const EXEMPT_REASON = {
  disabled: 'disabled controls are exempt; the floor here is the large/bold tier',
  exempt: 'documented in DESIGN.md §3 as decorative, carrying no information',
};

let failures = 0;
let worst = { value: Infinity, label: '' };
const byTier = new Map();

for (const [tier, label, fg, bg] of pairs) {
  if (!fg || !bg) throw new Error(`missing token for "${label}" (${fg} on ${bg})`);
  const value = lc(fg, bg);
  const floor = tier === 'disabled' ? TARGET.large : tier === 'exempt' ? 0 : TARGET[tier];
  const ok = value >= floor;
  if (!ok) failures += 1;
  if (tier !== 'exempt' && value < worst.value) worst = { value, label };
  if (!byTier.has(tier)) byTier.set(tier, []);
  byTier.get(tier).push({ label, fg, bg, value, floor, ok });
}

for (const [tier, rows] of byTier) {
  const floor = tier === 'disabled' ? TARGET.large : tier === 'exempt' ? 0 : TARGET[tier];
  console.log(`\n${tier}${floor ? ` (Lc >= ${floor})` : ''}${EXEMPT_REASON[tier] ? ` — ${EXEMPT_REASON[tier]}` : ''}`);
  for (const row of rows.sort((a, b) => a.value - b.value)) {
    const mark = row.ok ? '  ' : '!!';
    console.log(`  ${mark} ${row.value.toFixed(1).padStart(6)}  ${row.label}  (${row.fg} on ${row.bg})`);
  }
}

console.log(`\n${pairs.length} pairs measured. Tightest non-exempt: ${worst.value.toFixed(1)} — ${worst.label}.`);
if (failures) {
  console.error(`\n${failures} pair(s) below target.`);
  process.exit(1);
}
console.log('zero failures.');
