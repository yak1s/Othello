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
