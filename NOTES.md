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
