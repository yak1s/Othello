# Kissa — project brief

## 1. Role and mission

Lead engineer *and* design lead on a small, permanent, offline-capable board game. Two prior
proposals were rejected for looking templated. This app must feel like a well-made physical
object that happens to run in a browser: quiet, tactile, fast, and specific.

**A Progressive Web App to play Reversi/Othello** with three modes:
- **Pass & play** on one device.
- **Play a friend** on another device, peer-to-peer, no accounts, no server we pay for.
- **Play the computer**, six believable difficulty levels, fully offline.

Non-negotiables: works offline after first load; installable; no sign-in anywhere; no paid or
metered third-party service; no analytics/tracking; no ads; total transferred size under 400 KB
gzipped excluding fonts; runs at 60 fps on a mid-range 2021 Android phone.

## 2. Stack

- **Vite + TypeScript**, strict mode. No UI framework unless justified in one sentence — the DOM
  here is ~70 nodes. If reactivity is needed, Preact (3 KB) or plain signals, not React.
- **No component library.** No Tailwind default palette, no shadcn, no Material.
- **Board rendering:** semantic DOM/SVG first (8x8 CSS grid of `<button>` cells + absolutely
  positioned disc elements) so accessibility and animation come free. Measure; only move to canvas
  on a demonstrated frame-budget failure, and then keep an invisible DOM layer for screen readers.
- **Engine in a Web Worker.** The main thread never blocks.
- **P2P:** `trystero` (MIT). Browsers discover each other and communicate directly with no accounts
  and no infrastructure to deploy, over BitTorrent, Nostr, MQTT, Supabase, Firebase, IPFS, or a
  self-hosted WebSocket relay behind one API. The default package runs on Nostr; strategies are
  swapped by changing the import. Beyond discovery, app data never touches the signaling medium —
  it goes directly peer-to-peer, end-to-end encrypted. Fallbacks in section 8.
- **Zero runtime dependencies besides trystero.** Write the QR encoder, the audio, and the tweens
  ourselves; they are small.
- **Hosting:** any free static host with HTTPS. HTTPS is required for service workers and WebRTC.
- **Tests:** Vitest for the rules engine and engine sanity; Playwright for one offline smoke test
  and one two-tab P2P test.

## 3. Design language — commit to this, do not average it

### 3.1 The direction: *Kissaten, 1973*

Ground the aesthetic in the game's real history rather than generic app style. Reversi is
Victorian; the modern Othello board was commercialised in Japan in 1973 and its physical signature
is **green felt, black-and-cream plastic discs, and a hinged case**. The visual world is a
**Showa-era Japanese coffee house (kissaten) game table**: green baize, dark lacquered wood trim,
brass and ochre metal details, printed-on-paper score cards, and Japanese modernist print
typography. Restrained, warm, slightly aged. Not nostalgic-cute, not skeuomorphic-glossy.

This is the whole aesthetic. Everything else in the app is quiet so the board can be the object.

### 3.2 Tokens

```
/* Surfaces */
--ink:        #16171A;   /* discs (dark), primary text */
--baize:      #2F5D50;   /* board felt */
--baize-deep: #24493F;   /* board felt, alternate square tint (+/- 3% only) */
--lacquer:    #3B2A22;   /* board frame, dark wood */
--card:       #E8E2D2;   /* printed paper: score strip, sheets */
--card-edge:  #CFC6B0;   /* hairline on paper elements */

/* Pieces + accents */
--bone:       #F2EDE1;   /* discs (light) */
--brass:      #A8842C;   /* active turn, focus ring, primary action */
--shu:        #9B3A2E;   /* single alert/danger color — resign, disconnect */

/* Do NOT use: pure #000, pure #FFF, #F4F1EA + #D97757 (a known AI tell),
   any purple, any cyan, any gradient of two hues. */
```

- **Elevation:** exactly three named levels, and only these. `--e0` flat (board, paper);
  `--e1: 0 1px 0 var(--card-edge)` (a *hairline*, not a blur — paper on paper);
  `--e2: 0 8px 24px -8px rgba(22,23,26,.45)` (bottom sheets and modals only). Discs get a `1px`
  inset lower-light rim, not a drop shadow. In an unconstrained build, shadows become visual
  texture and blur/opacity drift per component; depth must be compact, named, and repeatable — a
  modal feels nearer than a card, a dropdown nearer than the page, and that relationship stays
  stable.
- **Radii:** `--r-none: 0` (paper, board frame, strips), `--r-pill: 999px` (discs, score capsules,
  primary buttons). **There is no 8px/12px/16px rounded-rectangle in this app.** Uniform mid-radius
  on everything is the single loudest tell.
- **Spacing:** 4px base; use only 4, 8, 12, 16, 24, 32, 48, 64. Vertical rhythm in multiples of 8.
- **Type:** two families, clearly distinct.
  - *Display / numerals:* **Zen Kaku Gothic New** at 700 for titles and score numerals. Numerals
    tabular where they change.
  - *Body / UI:* **Work Sans** or **Public Sans** at 400/500. **Not Inter, not system-ui as a style
    choice, not a monospace for "data labels."**
  - Scale: 13 / 15 / 17 / 22 / 34 / 56. Line-height 1.45 body, 1.1 display. Letter-spacing: 0
    everywhere except the 56 display, at `-0.02em`.
  - Sentence case throughout. **No ALL-CAPS tracked-out eyebrow labels.** No accenting one word of
    a heading in a different color or weight.
- **Texture:** one subtle, hand-authored felt grain on the board only — an SVG `feTurbulence` at
  <=4% opacity, generated once to a data URI, never animated. Nothing else in the app is textured.
- **Theme:** one theme, dark-lacquer-and-baize, and it is not "dark mode" — it is a green table in
  a dim room. Do not ship a light/dark toggle; do offer three board felts (Baize green, Ink slate,
  Sand) as an aesthetic choice, each with tokens defined in DESIGN.md.

### 3.3 Alternative directions (not chosen)

Swap **wholesale**, never mix: (a) **Swiss game-diagram**; (b) **Stone garden**. Two
half-committed directions read worse than either.

## 4. Anti-slop blocklist (regression suite — check every screen)

**Never produce:**
- Purple->blue, blue->cyan, or any two-hue gradient; gradient orbs, glows, animated background washes.
- Glassmorphism, backdrop-blur panels, neon borders.
- A grid of identical rounded cards with an icon, a heading, and two lines of text.
- Full-width centered hero with a big vague headline. Also forbidden: the three-up feature row and
  the testimonial card — if you can delete an element without missing it, it was slop.
- One oversized centered outline icon above a heading.
- Emoji as UI iconography anywhere, including headings, buttons, and toasts.
- Confetti, particle bursts, bouncing badges, pulsing "AI thinking" dots, typewriter text.
- A right-arrow appended to link or button labels; meta strings joined with a middot; `LABEL — fragment`
  with a spaced em dash.
- A hamburger menu, a bottom tab bar with 5 items, or a settings screen of unlabeled toggle rows.
- `rgba(0,0,0,.1)` soft grey shadow under everything.
- Hover states that do nothing; the same fade-and-slide-up entrance on every element. Motion is the
  gap between a page that looks good and one that feels designed — but it needs a real spec per
  element, not a blanket effect.
- Copy like "Elevate your game," "Seamless multiplayer experience," "Powered by AI."

**Acceptance bar — every screen must pass:**
1. Squint test at thumbnail size: hierarchy readable, regions distinguishable.
2. Every interactive element has default / hover / focus-visible / pressed / disabled / loading
   defined. Missing focus, disabled, error, empty, and loading states are the standard failure.
3. Contrast measured, not assumed. Use APCA rather than the legacy WCAG ratio; target Lc >= 75 for
   body text, >= 45 for large/bold, >= 30 for non-text UI like icons and borders — check every
   text/background pair with a script and fix failures before shipping.
4. Empty state, error state, and offline state exist and are written specifically (section 14).
5. One memorable element per screen, everything else quiet. Remove one decoration before done.
6. Nothing on screen was decided by default: if you cannot say *why* this radius, this weight, this
   spacing, it is not finished.

## 5. Information architecture and element placement

One-handed phone in portrait first, then scale up. The board is the hero and must never be
scrolled, never resized mid-game, and never covered by a keyboard or a toast.

### 5.1 Home (the main menu — there is no hamburger)

```
+------------------------------+
|                              |  safe-area top
|  KISSA                       |  display 56, left-aligned
|  Reversi for two, or one.    |  body 15, --card @70%
|                              |
| +--------------------------+ |  <- resume card, only if a game exists
| | * 12   o 9   your turn   | |     mini board thumbnail 44px
| | Continue                 | |
| +--------------------------+ |
|                              |
|  Pass & play          >      |  full-width rows, 56px tall,
|  Play a friend        >      |  hairline dividers, no cards
|  Play the computer    >      |
|                              |
|  Settings   How to play      |  13px, bottom-left, quiet
+------------------------------+
```

### 5.2 Game screen

```
+------------------------------+
| <        Board 1 of 1        |  36px bar: back, match label
+------------------------------+
| *  You            2 : 2   o  |  score strip on --card paper,
|    ____ active turn underline|  tabular numerals, brass underline
+------------------------------+
|                              |
|      +--------------+        |
|      |              |        |  BOARD: square, width = 100vw - 32,
|      |    8 x 8     |        |  max 480px, optically centered
|      |              |        |  (slightly above true center to
|      +--------------+        |   leave the thumb bar room)
|                              |
+------------------------------+
|  Undo    Hint    Moves   ... |  thumb bar, exactly 4 slots, 56px
+------------------------------+  safe-area bottom
```

Placement rules:
- **Thumb bar holds only frequent, reversible actions.** Undo, Hint, Moves, and the overflow sheet.
  Destructive and rare actions — Resign, New game, Rematch, Settings — live *inside* the sheet,
  never one tap from a thumb.
- In online matches, Undo and Hint render **disabled with a reason on tap** ("Not available in a
  friend match"), not hidden — hiding controls makes the layout shift between modes.
- **Coordinates** (a-h, 1-8) sit outside the felt on the lacquer frame, 11px, 45% opacity, off by
  default, toggleable.
- **Move list** is a bottom sheet on phones, a right-hand column at >=900px wide. Transcript in
  standard notation, current move highlighted, tap to preview (read-only), swipe down to return.
- **Landscape / tablet:** board left, move list and score right; never stretch the board's frame to
  fill.
- **Modals:** bottom sheets, one at a time, dismissible by drag and by backdrop tap, `--e2` only.
  Game-over is a sheet that leaves the final board visible above it.
- **Toasts:** max one, bottom-anchored above the thumb bar, 2.4 s, never for anything the user
  already saw happen.

### 5.3 Settings (grouped, labeled, no bare toggle wall)

`Sound` (master, effects volume, haptics) - `Board` (felt, coordinates, legal-move dots, last-move
marker, disc counters) - `Assist` (hints, undo allowance: unlimited / 3 per game / off) - `Motion`
(full / reduced — pre-checked from `prefers-reduced-motion`) - `Data` (archive size, export games as
JSON, clear stats — `--shu`, with confirm).

## 6. Rules engine — complete mechanics, no shortcuts

Pure, side-effect-free module. No DOM, no audio, no randomness. Everything else reads from it.

**Board and setup.** 8x8. Files `a`-`h` left->right, ranks `1`-`8` top->bottom. Opening four discs:
**White on d4 and e5, Black on d5 and e4**. **Black moves first.**

**Legal move.** A move places a disc on an empty square and must capture at least one opposing
disc. From the placed square, scan all 8 directions; if a direction has one or more contiguous
opposing discs terminated by one of the mover's own discs, every opposing disc in that run flips.
Runs terminated by an empty square or the board edge flip nothing. A move that flips nothing is
illegal. Flips resolve simultaneously; flipped discs do not chain further captures.

**Turn passing.** If the player to move has no legal move, they **pass automatically** — the app
must show this explicitly ("White has no move — Black plays again"), never silently. If **both**
players have no legal move, the game ends. Also terminal: board full, or a player has zero discs on
the board (wipeout).

**Result and scoring.** Winner has more discs. Equal counts are a draw. Provide two margin
displays, switchable in Settings: `Discs` (raw counts, must sum <= 64) and `Tournament` (empty
squares awarded to the winner, so scores always sum to 64) — after an early wipeout these differ,
and both are correct in their own convention.

**Notation and transcripts.** Moves as `d3`, `f5`. Serialize a game as a concatenated lowercase
transcript (`f5d6c3d3c4f4...`); passes are implicit and reconstructible from the position, so do not
encode them — but expose them in the move list. Round-trip must be lossless:
`parse(serialize(game)) === game`. Include a `PositionState` type: 2 bitboards, side to move, move
number, and a Zobrist hash.

**Required API.** `initial()`, `legalMoves(state) -> Move[]`, `apply(state, move) -> {state,
flipped: Square[], passedBy?: Color}`, `isTerminal(state)`, `score(state, mode)`, `undo`/`redo` over
an immutable history stack, `hash(state)`.

**Variants** — build the engine board-size-agnostic and mode-agnostic, but ship only: standard 8x8
(default) and **Reverse Reversi** (fewest discs wins), the latter tucked in the computer-opponent
setup screen, off by default. No 6x6, no random-start, no power-ups.

**Tests.** Unit-test flips in all 8 directions, at all four edges and corners, multi-direction flips
from one move, and the no-flip illegal case. Test forced-pass, double-pass termination, wipeout, and
full-board termination. Test notation round-trip. Fuzz 10,000 random legal games asserting: disc
total = 4 + moves played, no disc ever occupies an off-board square, and every applied move was in
`legalMoves`. Verify the move tree against published Reversi node counts for the first plies (4, 12,
56, 244 games at depths 1-4); look up deeper values before asserting them.

## 7. Computer opponent

Runs in a Web Worker. Never blocks input; never plays an illegal move; never crashes on a pass.

**Representation.** Bitboards. Two `Uint32` halves per color (hi/lo) with precomputed direction
masks, or `BigInt` for clarity — benchmark both and keep the faster on mobile. Move generation and
flip resolution via parallel-prefix (Kogge-Stone / dumb7fill) shifts, not per-square loops.

**Search.** Negamax with alpha-beta, iterative deepening under a **time budget** (not a fixed
depth), principal variation search, a Zobrist transposition table (bounded, replace-on-depth), move
ordering by TT move -> captured-corner -> mobility of resulting position, and killer moves.
**Endgame:** switch to an exact solver — full exact score at <= 14 empties, win/loss/draw at <= 20
(level-dependent). Abort cleanly on `terminate` or a new position.

**Evaluation** (weight by game phase — disc count is nearly worthless before ~50 discs):
- Mobility (own legal moves - opponent's) and potential mobility (opponent discs adjacent to empties).
- Stability: corner ownership, corner-anchored stable edge runs, and X/C-square penalties.
- Frontier discs (own discs adjacent to an empty square) — penalize.
- Parity (who takes the last move in each empty region) — weight up late.
- Square weights only as a small early-game term, never as the whole eval.

**Six levels — make the weak ones *believable*, not random.** Weakness comes from a shallower
horizon plus a controlled human-like error model: sample from the top-k moves with a softmax
temperature and a small blunder rate, rather than picking uniformly at random.

| Level | Budget | Depth target | Error model | Endgame |
|---|---|---|---|---|
| 1 Beginner | 120 ms | 1-2 | temp high, 18% off-best, will take a bad X-square | none |
| 2 Casual | 200 ms | 3 | 10% off-best | none |
| 3 Club | 400 ms | 5-6 | 4% off-best | <= 8 |
| 4 Strong | 800 ms | 7-9 | 1% | <= 12 |
| 5 Expert | 1500 ms | 10-12 | 0 | <= 16 |
| 6 Merciless | 2500 ms | iterative, no cap | 0 | <= 20 exact |

**Opening book.** A small hand-entered book of named human openings (Diagonal, Perpendicular,
Parallel, Tiger, Rose, Buffalo) with a few plies each, used probabilistically so consecutive games
differ. Levels 1-2 ignore it.

**Feel.** If the engine answers in under 300 ms, still wait until 300 ms so the exchange has rhythm
— but never fake a longer delay, and never show a "thinking" indicator before 500 ms. The
indicator, when it appears, is a hairline progress rule under the opponent's score capsule, not
animated dots.

**Hint.** Same engine at Level 4, 400 ms, returning one square with a one-line human-readable reason
drawn from the dominant eval term ("Takes the corner," "Keeps your options open," "Leaves them
nothing safe"). Reuse the worker; never spawn a second.

## 8. Multiplayer — free, accountless, no server we own

**Model: both peers run the full rules engine; moves are messages, not state.** Sender transmits
`{moveNumber, square, stateHashAfter}`. Receiver validates the move is legal in its own state,
applies it, and compares hashes. On mismatch, it requests a full state snapshot from the host and
reconciles. This makes the wire format tiny and cheating detectable.

**Rooms.** 6-character codes from a 26-char alphabet excluding `0 O 1 I L S 5` — display grouped
`ABC-DEF`. Joining is: enter the code, tap a deep link (`/#j=ABC-DEF`), or scan a locally generated
QR (encode it ourselves; no QR API — offline must work on a LAN). Share via `navigator.share` when
available.

**Roles.** Room creator is host: assigns colors (creator picks, or "flip a coin" using a jointly
derived seed), owns rematch and color-swap decisions, and is the snapshot source of truth.

**Connection strategy, in order:**
1. Trystero on its default strategy for one-tap matchmaking.
2. A second strategy (MQTT or torrent) auto-retried if the first yields no peer within ~8 s —
   strategies swap by import, so keep both bundled behind one interface.
3. **Manual code exchange fallback** for hostile networks: show the local SDP offer as a compact
   copyable/QR-able blob, accept the answer the same way. This is the genuinely serverless path —
   peers copy the offer/response to each other through any side channel.
4. Be honest about the limit: some networks simply do not allow direct P2P connections with WebRTC,
   and solving that needs a TURN server to proxy — which we will not run. Failure copy must say so
   plainly and offer pass & play (section 14).

**Lifecycle.** Presence heartbeat every 3 s. On peer loss: freeze the clock, show "Reconnecting —
0:28" for a 30 s grace window, allow resume by rejoining the same code from either side; after
grace, offer "Claim the win" or "Save and exit" (saved games resume from the archive). Handle both
peers reloading. Handle a third device joining a full room (refuse with a clear message). Reject any
move message that is not from the color whose turn it is.

**Communication.** Six fixed emotes (Good move / Nice / Oops / Hurry? / Thanks / Rematch?),
rate-limited to one per turn. No free-text chat — it adds a moderation surface for no gameplay
value. Emote arrives as a small paper chit that slides in under the sender's score capsule and
dismisses itself.

**Timers (optional, per-room, host sets):** none (default), 5+3 Fischer, or 30 min/game. Clock
authority: each peer runs its own clock, exchanges timestamps on every move, and takes the more
conservative value on disagreement. Low-time state at 30 s: capsule numeral turns `--shu`, one soft
tick per second (no beeping).

**Also required:** pass & play with an optional "rotate board between turns" setting (Reversi has no
hidden information, so no hand-off privacy screen — do not build one), and same-LAN play working
with the network fully offline via the manual fallback.

## 9. Animation spec

Motion answers user action or explains a rule. Nothing moves on its own. Motion that answers a
person's action (opening, expanding, confirming) is welcome when it shows what changed; scattered
ambient effects read as generated.

- **Transform and opacity only.** No animating width/height/top/left/box-shadow. Use FLIP for
  anything that must reposition. Apply `will-change` on animation start and remove it on
  `transitionend`.
- **Placing a disc:** scale 0.72 -> 1.04 -> 1.00 with opacity 0 -> 1, 180 ms,
  `cubic-bezier(.34,1.4,.64,1)`. It lands *before* any flips begin.
- **The flip — the one memorable moment in the app.** Each captured disc rotates 180 degrees in 3D
  about the axis **perpendicular to its capture direction**, so a horizontal capture rolls
  vertically and the whole run reads as a single wave travelling outward from the placed disc. Per
  disc: 260 ms, `cubic-bezier(.2,.8,.25,1)`, `perspective: 600px`, backface swap at 50%. **Stagger
  by Chebyshev distance from the placed square: 45 ms per step.** Multi-direction captures start
  their waves simultaneously. A disc's edge highlight tracks its rotation — this is the only
  lighting effect in the app.
- **Legal-move affordance:** static 6px dots at 32% opacity on legal squares (toggleable). On
  press-and-hold or hover, a 22%-opacity ghost disc appears in the cell and every disc that *would*
  flip gets a 1px `--brass` ring — no color flash, no scaling, no motion. Releasing outside the cell
  cancels.
- **Illegal tap:** 90 ms, 3px horizontal shake of the tapped cell's inner content, `--shu` hairline
  at 40% fading over 200 ms. No modal, no toast.
- **Score numerals:** tween the integer over 220 ms starting at the flip wave's midpoint, so the
  number lands as the discs settle. Tabular figures so nothing shifts.
- **Turn change:** the brass underline slides between score capsules, 200 ms, `ease-out`. That is
  the entire turn indicator.
- **Pass:** the passed player's capsule dims to 55% for 900 ms while a single line of paper-card
  copy states what happened. The player must not have to guess why their turn came back.
- **Game over:** one orchestrated moment, once. All discs settle, then a slow single sweep of the
  winner's disc color across the board's specular highlight, 700 ms, and the sheet rises. **No
  confetti, no counter roll-up, no fanfare loop.**
- **Screen transitions:** 180 ms. Sheets translate up with a 92%->100% opacity backdrop. Home<->game
  is a cross-fade with the board scaling 0.98->1. Nothing slides horizontally.
- **`prefers-reduced-motion: reduce`:** discs cross-fade colors in 120 ms with no rotation and no
  stagger; placement is an opacity fade; sheets appear without translation; the sweep is omitted.
  All feedback remains — none of it is decorative-only.
- **Budget:** flipping 18 discs at once must hold 60 fps on a Pixel 4a. Cap concurrent transitions;
  if a wave would exceed 20 discs, compress the stagger to 25 ms rather than dropping frames.

## 10. Audio spec

Sound must feel like plastic discs on felt in a quiet room. Synthesize everything with the Web Audio
API — no audio files, so it works offline at zero bytes and can be tuned parametrically.

| Event | Recipe | Notes |
|---|---|---|
| Disc placed | 8 ms noise burst -> bandpass ~1.8 kHz, + sine thud at 180 Hz, 60 ms decay | +/-4% random pitch per play |
| Disc flipped | short click, ~2.4 kHz, 35 ms | pitch steps up 1 semitone per disc along the wave; max 6 voices, throttle to every other disc past 8 |
| Illegal tap | 90 Hz muted thud, 70 ms, low-passed | quieter than everything else |
| Turn change | soft felt brush, filtered noise, 120 ms | very low level, off by default in pass & play |
| Pass | two-note descending woodblock | must be distinguishable from turn change |
| Timer low | single soft tick per second, 1 kHz, -18 dB | never a beep |
| Game end | three-note plucked figure, minor third resolve, ~900 ms | tasteful, once, never loops |
| UI tap / sheet | 6 ms tick / soft paper slide | -24 dB |
| Peer joined / lost | rising / falling two-note pair | distinct pair, not a chime |

**Engine requirements:** one `AudioContext`, created and resumed **only on the first user gesture**
(iOS requires this); a master chain of gain -> soft compressor -> destination; a voice pool with max
6 concurrent and per-event throttling; a `--muted` state persisted to localStorage and honored
before context creation; graceful no-op if Web Audio is unavailable. Never autoplay anything before
a gesture. iOS silent-switch behavior for Web Audio is inconsistent — always ship a visible mute
control in the game sheet, one tap deep.

**Haptics:** `navigator.vibrate` where supported — 8 ms on place, 4 ms per flip capped at 3 pulses,
20 ms on illegal. Separate toggle from sound. Silent no-op on iOS.

**Build a `/dev/audio` debug page** with sliders for every parameter and a "play" button per voice,
so the recipes can be tuned by ear rather than guessed. Delete it from the production bundle.

## 11. Accessibility

- Board is `role="grid"` with 8 `role="row"`s and cells as real `<button>`s labeled
  `"d3, empty, legal move"` / `"e4, black disc"`. Arrow keys move focus, Enter/Space plays, `?`
  announces the score.
- `aria-live="polite"` region announces every move, flip count, pass, and the result: "Black plays
  d3, flips 4. White has no move." This region is also how a screen-reader user learns the game
  state — write it carefully.
- Visible `focus-visible` ring in `--brass`, 2px, offset 2px, never removed.
- **Colorblind support:** an optional disc marking (dark discs get a subtle inset ring, light discs
  stay plain) so discs are distinguishable without relying on lightness alone — and never encode
  turn state in color alone; the brass underline plus the text label carry it.
- Hit targets >= 44 px. On an 8x8 board at 360 px wide, cells are ~41 px — expand the touch target
  beyond the visual cell with padding, and require a release inside the cell to commit.
- All text meets the APCA targets in section 4. Test with a script, not by eye.
- No time-limited interactions outside the optional chess clock; no motion required to play.

## 12. PWA and platform

- **Manifest:** `name`, `short_name` (<=12 chars), `id`, `start_url: "/?source=pwa"`,
  `display: "standalone"`, `orientation: "any"`, `theme_color: #24493F`,
  `background_color: #16171A`, icons at 192/512 plus a maskable 512 with correct safe-zone padding,
  `screenshots` for both form factors, and `shortcuts` for "Play the computer" and "Pass & play."
- **Service worker:** precache the app shell and fonts, versioned cache, cache-first for all static
  assets, network never required except P2P signaling. On a new version: show a single quiet
  "Update ready - Reload" chit — never auto-reload mid-game.
- **iOS specifics:** `apple-touch-icon`, `viewport-fit=cover` with `env(safe-area-inset-*)` padding
  on the top bar and thumb bar, `100dvh` not `100vh`, `overscroll-behavior: none`,
  `touch-action: manipulation` and `user-select: none` on the board,
  `-webkit-tap-highlight-color: transparent`.
- **Install prompt:** capture `beforeinstallprompt` and surface it once, as a dismissible line on
  the home screen after a completed game — never a modal on first load. On iOS, a one-line "Add to
  Home Screen" note in Settings only.
- **Wake lock** held only during an active online match, released on background.
- **Visibility:** pause clocks and abort the engine search on `visibilitychange` hidden; resume on
  return; verify the board renders correctly after a long background.
- **Lighthouse:** PWA installable, Performance >= 95 on mobile throttling, no console errors, no
  layout shift (CLS 0 — the board's size is computed before first paint).

## 13. Persistence and data

- `localStorage`: settings, mute state, last-used level, install-prompt dismissal. Namespaced and
  version-keyed.
- **IndexedDB:** game archive (transcript, result, mode, level or peer label, timestamps, duration)
  and aggregate stats (record per level, average margin, corner rate, longest win streak). Cap the
  archive at 500 games with FIFO eviction and say so in Settings.
- Schema `version` field with a migration function from day one.
- **Export/import** the whole archive as JSON from Settings — no account means the user's data must
  be portable by hand.
- Autosave the in-progress game after every move so a crash or a killed tab loses nothing; that is
  what powers the home screen's Continue card.
- **Zero network telemetry.** No analytics, no error reporting service, no fonts from a third party
  at runtime (self-host the two families, subset to Latin + the characters actually used).

## 14. Copy and tone

Terse, concrete, a little dry. Sentence case. Active voice. Say what happened.

- Turn: `Your turn` / `White is thinking` — not "Waiting for opponent..."
- Pass: `You have no legal move. White plays again.`
- Illegal: nothing written — the shake and thud are the answer.
- Result: `You win, 38-26.` / `Draw, 32-32.` / `White wins, 41-23.`
- Wipeout: `No white discs left. You win, 64-0.`
- Connection failed: `Couldn't reach your friend. Some networks block direct connections between
  devices. Try the same Wi-Fi, or enter codes manually.` Then two buttons: `Enter codes manually`,
  `Play on this device instead`.
- Peer left: `White disconnected. Waiting 28s...` then `Claim the win` / `Save and exit`.
- Empty archive: `No finished games yet. Beat the computer and it'll show up here.`
- Never: "Oops!", "Something went wrong", "Seamless", "Elevate", "AI-powered", any exclamation mark.

## 15. Performance budgets

JS <= 120 KB gzipped (engine included); CSS <= 14 KB; fonts <= 180 KB subset and self-hosted; zero
images except icons (SVG). First contentful paint < 1.2 s on 4G mid-tier; time to interactive board
< 1.5 s. Engine worker boots lazily on first "Play the computer" tap. 60 fps during the largest
possible flip wave. Main thread idle during search.

## 16. Definition of done

Rules engine passes the full test suite in section 6 including the 10k-game fuzz; the engine never
plays an illegal move across 1,000 self-play games and Level 6 solves a known endgame position
exactly; two devices on different networks complete a game, survive a reload by each peer, and
resolve a forced hash mismatch; the app plays a full game with the network disabled from a cold
install; every screen passes the section 4 acceptance bar with a screenshot review; APCA script
reports zero failures; reduced-motion and screen-reader paths both play a complete game; Lighthouse
targets met.

## 17. Phase plan

1. `DESIGN.md` + `tokens.css` + one component (primary button, score capsule).
2. Rules engine + tests. Headless.
3. Static board.
4. Pass & play.
5. Animation pass.
6. Audio pass.
7. Engine + levels.
8. PWA shell.
9. P2P.
10. Persistence, stats, settings, how-to-play.
11. Accessibility + APCA audit + Lighthouse + copy pass, then the removal pass.

**Standing instruction for every phase:** read `DESIGN.md` before writing any markup, take every
color/size/spacing/duration value from it, and **ask before inventing anything that is not in it**.
If a correction is issued ("no shadows on the score strip"), append it to `DESIGN.md` so it never
comes back.
