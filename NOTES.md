# Notes

A running log of what changed each phase and why. Design corrections live in
`DESIGN.md` under **Corrections**; this file is the build log.

## Phase 1 — design language, tokens, first component

- Wrote `DESIGN.md` and `src/styles/tokens.css` from the brief, then measured
  every pair with `scripts/apca.mjs` before building anything.
- Six token values were **solved numerically** rather than chosen: `--brass-lit`,
  `--text-quiet`, `--text-coord`, `--rule`, `--frame-edge`, `--disc-rim-dark`.
- Measurement contradicted the brief in four places, logged as corrections
  C1–C4, and building the button surfaced three more (C7–C10). The two that
  changed the design most:
  - **Brass cannot carry text.** `--ink` on `--brass` is Lc 40.3 and `--card` on
    `--brass` is 49.3; nothing reaches the 75 body target. So the primary button
    is a paper key with a brass keyline, and brass stays a mark everywhere.
  - **A dark disc on felt is Lc 8.9–17.1.** Its rim is what carries the
    silhouette, so `--disc-rim-dark` is mandatory rather than decorative.
- Fonts are self-hosted, latin subset, **58.6 KB** for both families against a
  180 KB budget. Work Sans turned out to be one variable file that Google serves
  once per requested weight, so it ships once under a weight range.
- Specimen page at `dev/components/`, screenshotted with real pseudo-states
  forced through CDP rather than faked with classes.

## Phase 2 — rules engine

- `src/engine/` is pure: no DOM, no clock, no randomness. bigint bitboards with
  direction-shift move generation, so the engine is board-size-agnostic — the
  4×4 board is exercised in the terminal tests, which is also the cheapest way
  to reach a genuinely full board.
- Zobrist keys come from a seeded splitmix64, never `Math.random()`: the P2P
  layer compares hashes across two devices, so the table has to be identical in
  every process and across reloads.
- **56 tests green.** Flips in all eight directions and their empty-terminated
  counterparts, all four edges and corners, rank-boundary wrapping, multi-
  direction capture, non-chaining, every illegality; forced pass found by
  searching the opening tree, double-pass, wipeout, full board; notation
  round-trip including a game that really contains a pass; perft **4, 12, 56,
  244**; and 10,000 random games checking disc totals, disjoint bitboards,
  on-board discs, move legality and hash integrity.
- The fuzz test first took 156 s. Nine million `expect()` calls were the cost,
  not the engine — swapped for plain throws with descriptive messages, and the
  full hash recomputation now samples every eighth ply plus every game's final
  position. **11.5 s**, same guarantees.

## Phases 3–5 — board, pass & play, motion

- The board is a semantic 8×8 grid of real `<button>`s with an absolutely
  positioned disc layer above it. A flip is a **pure composite with no repaint**:
  each disc carries two pre-rotated faces, and the back face is pre-rotated about
  the same axis the flip will use, so it lands upright with its rim at the
  bottom whichever way it rolled (corrections C11, C12).
- Screenshot review of the running app found five defects — all fixed, all
  logged as C13–C16. The alternate-square tint rendered as a chessboard, and the
  board had no visible frame at all because the outer cells' extended hit area
  was painting felt over the lacquer.

## Phase 7 — the computer opponent

- `fastboard.ts` is verified against the rules engine across **20,000
  positions**, in both its uint32 and bigint representations.
- Two bugs the tests found: `begin()` cleared a 65,536-entry transposition table
  on every move, costing more than some of the searches it served (now a
  generation stamp), and level 2's softmax was flat enough to give away a corner
  too often.
- The endgame solver's exact score is checked move for move against an
  **independent exhaustive search over the rules engine**, and the search plays
  1,000 self-play games at mixed levels without one illegal move.
- The three deeper opening-book line *names* (Tiger, Rose, Buffalo) were written
  from memory and want checking against a reference before release. They are
  internal only — never shown — and every line is asserted legal, so a wrong
  name is a documentation issue rather than a defect.

## Phase 9 — multiplayer

- The whole of §8 lives in `session.ts` as a pure state machine with the
  transport, rules engine, clock and random source injected, which is why 26
  tests can cover sync, desync recovery, presence, clocks and emotes with **no
  WebRTC and no network**.
- Writing those tests found a real bug: a single large time jump — exactly what
  a backgrounded tab looks like on resume — made the liveness check declare the
  peer lost before it could possibly have pinged. The session now distinguishes
  "we were not running" from "they went quiet".
- **The QR encoder was the most valuable test of the build.** It is verified
  against jsQR, an independent decoder kept as a dev dependency, because a
  round-trip through a reader written alongside the encoder would have agreed
  with the encoder's own mistakes. It immediately caught a transposed
  Reed-Solomon divisor that made all 80 version/EC combinations unreadable.
  Once fixed, 79 of 80 decode; the last one is **jsQR's** bug, not ours — its
  table gives version 23's alignment centres as [6, 30, 54, 74, 102] where the
  specification spaces them evenly at [6, 30, 54, 78, 102]. Version 23 at level
  M has the redundancy to survive its misplaced pattern and level L does not,
  which is exactly the observed behaviour.
- **The second signalling strategy is torrent, not MQTT.** Both satisfy the
  brief. MQTT pulled a 372 KB chunk (112 KB gzipped); torrent does the same job
  in 0.92 KB gzipped because it shares trystero's strategy core. That is 111 KB
  saved for no loss of function.

## Phases 10 and 11 — persistence, and the end-to-end pass

- 21 persistence tests over an injected in-memory store, so the archive, the
  FIFO cap, the stats reducer, migrations and export/import are all covered
  without adding a dependency. A draw neither extends nor breaks a win streak;
  that rule is documented in the reducer and tested both ways.
- **The offline promise was broken, and only the end-to-end test found it.**
  Vite's preview server answers with `Vary: Origin`. The Cache API honours
  `Vary`, and `cache.addAll()` stores those responses against a request with no
  `Origin` header while a module script sends one — so the shell was served from
  cache and every asset it needed missed. Fixed with `ignoreVary`, and there is
  now a test asserting that **no request fails at all** when offline.
- That fix exposed a second one: the worker's version was hashed from `dist`
  only, excluding `sw.js`. A fix to the caching logic would have shipped with an
  unchanged version and reached nobody. The template is now part of its own hash.
- Three more real bugs came out of driving the multiplayer UI for real:
  - `gathered()` waited the full ICE timeout even when candidates were ready,
    and some networks never report gathering as complete at all. It now cuts off
    once the candidates stop arriving — under a second instead of four.
  - The manual blob's round-trip re-added a line terminator to an SDP that
    already had one, and the blank line was rejected with nothing but "Invalid
    SDP line" to go on. There is a unit test with a real captured offer now.
  - The background search kept running after the person switched to the manual
    exchange, then replaced the sheet they were using with a failure notice.
  - Seats were read before the handshake assigned them, so **both** peers got
    the same colour and each waited for the other.
- The end-to-end suite is four tests: a full game played offline, an assertion
  that nothing hits the network, CLS below 0.01, and two tabs playing in sync
  over a real WebRTC data channel with the offer and answer carried by hand.
  The trystero path needs live relays, which this sandbox blocks, so it is not
  covered there — the part that is ours is.

## The removal pass

Three things came out during the build rather than at the end, each because the
screen said the same thing twice:

- The per-capsule turn rule, once the score strip owned a sliding one (C9).
- The per-capsule disc counts, once the centre carried the score (C15) — the
  same two numbers had been on screen three times.
- A second Data row in Settings reassuring about privacy, which the first line
  already implied.

The one decoration left that I would otherwise cut is the chevron on each home
row: the rows are 56px, hairline-separated and labelled, so they read as
tappable without it. It stays because brief §5.1 draws it.

## What is not done

- **The trystero path is not verified end to end.** This sandbox's proxy refuses
  outbound WebSockets, so the nostr and torrent relays are unreachable here. The
  session logic underneath is covered by 26 tests against a loopback transport,
  and the WebRTC data path is covered end to end through the manual exchange —
  but two devices finding each other over a public relay has not been run.
- **The three deeper opening-book names** (Tiger, Rose, Buffalo) were written
  from memory. Every line is asserted legal and the names are internal, never
  shown, but they want checking against a reference.
- **Lighthouse has not been run** — it is not installed here. The budgets it
  would measure are checked directly instead: JS 51.2 KB gzipped of 120,
  CSS 5.9 of 14, fonts 58.6 of 180, and CLS asserted under 0.01 by a test.
- **60 fps on a Pixel 4a is not measured**, only designed for: the flip is a
  pure composite with no repaint, and the wave compresses its stagger past
  twenty discs rather than dropping frames.

## Two additions after review

- **The board's four guide dots** (C21), at the grid intersections two squares in
  from each corner, where a printed board has them. Under the discs, and
  deliberately unlike a legal-move dot: 5px at a corner where four squares meet,
  against 6px at the centre of a square.
- **The felt grain lifted from 4% to 9%** (C22). At 4% it was invisible at phone
  scale — a texture that cost bytes and gave nothing. The lift forced two
  corrections worth more than the opacity change: the alpha is now baked into
  the tile, so the grain is a background layer on the cell rather than an
  overlay that was texturing the legal-move dots and the last-move marker; and
  each cell offsets the tile by its position, so the weave runs continuously
  across the felt instead of restarting in every square.
