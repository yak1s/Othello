# Kissa — design language

> **Standing instruction.** Read this file before writing any markup. Take every colour, size,
> spacing, radius and duration from `src/styles/tokens.css`. If a value you need is not here, ask —
> do not invent it. When a correction is issued, append it to the **Corrections** log at the bottom
> so it never comes back.

---

## 1. The direction: Kissaten, 1973

Reversi is Victorian. The modern Othello board was commercialised in Japan in 1973, and its
physical signature is green felt, black-and-cream plastic discs, and a hinged case. This app is a
**Shōwa-era Japanese coffee-house game table**: green baize, dark lacquered wood, brass and ochre
metal, printed paper score cards, Japanese modernist print typography. Restrained, warm, slightly
aged. Not nostalgic-cute. Not skeuomorphic-glossy.

The board is the object. Everything else is quiet so that it can be.

There is **one theme** — dark lacquer and baize. It is not "dark mode"; it is a green table in a dim
room, and there is no light/dark toggle. The only aesthetic choice offered is the felt: Baize green,
Ink slate, Sand.

---

## 2. Colour

| Token | Value | What it is |
|---|---|---|
| `--ink` | `#16171A` | the dim room, and the dark discs |
| `--lacquer` | `#3B2A22` | the hinged case around the felt |
| `--card` | `#E8E2D2` | printed paper: score strip, sheets, chits |
| `--card-edge` | `#CFC6B0` | the paper's own edge — the `--e1` hairline |
| `--bone` | `#F2EDE1` | the light discs |
| `--brass` | `#A8842C` | active turn, primary mark |
| `--shu` | `#9B3A2E` | the one alert colour |

### Felt

Components read `--felt` and `--felt-deep`, never a named felt. Switching felt sets
`data-felt` on `:root` and changes nothing else in the app.

| Felt | `--felt` | `--felt-deep` |
|---|---|---|
| Baize green (default) | `#2F5D50` | `#24493F` |
| Ink slate | `#3A424B` | `#323942` |
| Sand | `#5E5540` | `#554D3A` |

`--felt-deep` is the alternate-square tint. It is within 3% of `--felt` and measures **Lc 0.0**
against it — it is *meant* to be almost invisible, a weave difference you notice only in raking
light. It never carries information.

### Derived tokens

Each was solved numerically against APCA, not picked by eye. `scripts/apca-check.mjs` re-derives
and asserts all of them on every `npm run verify`.

| Token | Value | Why exactly this |
|---|---|---|
| `--brass-lit` | `#B79950` | brass + 20% bone: the least lift that clears **Lc ≥ 30 on all three felts** (31.9 / 38.9 / 31.6). Plain `--brass` is Lc 22.1 on baize and would make the focus ring vanish on the board. |
| `--text` | `#E8E2D2` | `= --card`. Lc 88.2 on ink. |
| `--text-quiet` | `#D2CDBF` | the dimmest tone still clearing **Lc 75** on ink (75.3). |
| `--text-coord` | `#9A8F83` | coordinates on lacquer, Lc 38.3. |
| `--rule` | `#7A7872` | 1px divider on ink, solved to exactly Lc 30.0. |
| `--frame-edge` | `#8D8276` | the case's lit outer keyline. `--lacquer` measures **Lc 0.0** against `--ink`, so without this the board has no silhouette in the room. Lc 35.5 on ink, 31.9 on lacquer. |
| `--disc-rim-dark` | `#B4AFA4` | the dark disc's lower-light rim. Does double duty: a dark disc on felt is only Lc 16.7 (baize) / 8.9 (slate) / 17.1 (sand), so **the rim, not the disc face, is what carries the silhouette** — 42.0 / 49.0 / 41.7. It is not optional. |
| `--disc-rim-light` | `#BDB4A0` | the light disc's shaded rim. |
| `--disabled` | `#6A6864` | card @40% over ink. Reads as unavailable, never as absent. |

### Never

Pure `#000` or `#FFF`. `#F4F1EA` with `#D97757`. Any purple. Any cyan. Any two-hue gradient.
Gradient orbs, glows, animated washes. `rgba(0,0,0,.1)` under anything.

---

## 3. Contrast policy

Targets, per brief §4.3, measured with APCA (`scripts/apca.mjs`, W3C draft constants):
**Lc ≥ 75** body text · **Lc ≥ 45** large or bold text (≥ 22px, or ≥ 17px at 600+)
· **Lc ≥ 30** non-text UI that must be perceived to operate.

Three findings changed the design rather than the other way round:

1. **Brass cannot carry text.** Best case is `--card` on `--brass` at Lc 49.3; `--ink` on `--brass`
   is 40.3. No weight or size rescues body text on a brass fill. Brass is therefore a **mark** —
   ring, rule, underline, dot — and never a text-bearing surface. (Correction C2.)
2. **`--shu` cannot appear on ink.** Lc 17.8. Destructive actions live on paper, where shu reaches
   66.2 and clears the large/bold tier at 17px/600. (Correction C4.)
3. **Dimmed text does not survive on ink.** `--card` at the brief's 70% is Lc 52.6. Hierarchy in
   this app is carried by **size, weight and position**, not by opacity. (Correction C1.)

### Measured exemptions

Two pairs sit below their nominal tier, deliberately and with a mechanism that replaces them:

| Pair | Lc | Why it stands |
|---|---|---|
| `--card-edge` on `--card` (the `--e1` hairline) | 13.4 | This is paper-on-paper, specified as a hairline and not a signal. Nothing is operated by it; the elements it separates are distinguished by their own text and rhythm. |
| `--felt` vs `--felt-deep` | 0.0 | Intentionally invisible weave. Carries no information. |

Coordinate labels were specified at 45% opacity (Lc 29.6). They ship at 55% (**Lc 38.3**) — the
change is invisible at 11px and puts them over the line. (Correction C3.)

---

## 4. Elevation, radii, spacing

**Elevation — three levels, and there is no fourth.**

| Token | Value | Used by |
|---|---|---|
| `--e0` | `none` | board, felt, paper, every row and strip |
| `--e1` | `0 1px 0 var(--card-edge)` | paper on paper. A **hairline, not a blur**. |
| `--e2` | `0 8px 24px -8px rgba(22,23,26,.45)` | bottom sheets and modals only |

Discs get a 1px inset rim, never a drop shadow. A modal is nearer than a sheet-less screen; nothing
else is ever "nearer" than anything. If a component seems to need a fourth level, it is in the wrong
place in the hierarchy.

**Radii — two.** `--r-none: 0` for paper, board frame, strips, sheets, rows, inputs.
`--r-pill: 999px` for discs, score capsules, primary and secondary buttons.
**There is no 8/12/16px rounded rectangle in this app.** Uniform mid-radius is the loudest tell
there is.

**Spacing** — 4px base, only `4 8 12 16 24 32 48 64` (`--s1 --s2 --s3 --s4 --s6 --s8 --s12 --s16`).
Vertical rhythm in multiples of 8.

---

## 5. Type

Two families, clearly distinct, both self-hosted and subset. No third family, ever.

- **Display and numerals** — Zen Kaku Gothic New 700. Titles, score numerals, result lines. It is a
  Japanese modernist grotesque with a strong lowercase and real Latin; it carries the 1973 print
  reference without costume.
- **Body and UI** — Work Sans 400/500. Everything else. **Not Inter. Not system-ui as a style
  choice. Not a monospace for "data labels."**

Scale: **13 / 15 / 17 / 22 / 34 / 56**. Line-height 1.45 body, 1.1 display. Letter-spacing 0
everywhere except the 56, at `-0.02em`. Tabular numerals wherever a number changes in place
(`font-variant-numeric: tabular-nums`) so nothing shifts as the score ticks.

Sentence case throughout. **No ALL-CAPS tracked-out eyebrow labels.** No accenting one word of a
heading in a different colour or weight.

| Role | Size | Family / weight |
|---|---|---|
| App title | 56 | display 700, `-0.02em` |
| Sheet title, result line | 34 | display 700 |
| Score numeral | 22 | display 700, tabular |
| Button label, row label, section head | 17 | body 500 |
| Body, subtitle, transcript | 15 | body 400 |
| Quiet link, caption, stat label | 13 | body 400 |
| Board coordinate | 11 | body 400, `--text-coord` — the one size off-scale, because it must sit inside a 14px frame |

---

## 6. Texture

Exactly one, on the board felt only: `--felt-grain`, an `feTurbulence` fractal-noise tile authored
once by `scripts/gen-felt.mjs` to a 362-character data URI, applied at `--grain-alpha: .04`, never
animated, never used on any other surface.

---

## 7. Layout and the board's sizing maths

Portrait phone first. The board never scrolls, never resizes mid-game, and is never covered.

```
board object   = min(100vw - 2*--board-margin, available height, --board-max)
felt           = board object - 2*--frame-w
cell           = felt / 8
```

At 360×780 with `--board-margin: 16px` and `--frame-w: 14px`: object 328, felt 300, **cell 37.5px**.

**On the 44px target.** Cells are 37.5px at the narrowest supported width, below the 44px minimum.
Three things make that safe, and all three are required:

1. Cells are contiguous — the grid has no gutters, so every point inside the felt belongs to some
   cell and there is no dead space to miss into.
2. Commit is on **release inside the cell**, not on press. Press shows the ghost disc and the brass
   would-flip rings; sliding to a neighbour moves the preview; releasing outside cancels. A mis-aim
   is correctable without cost.
3. The edge and corner cells extend under the lacquer frame, so the board's outer ring — where
   aiming is worst and the stakes are highest — is effectively 51.5px.

The keyboard path (arrows + Enter) and the screen-reader path are full equals, not fallbacks.

**Vertical stack:** `--topbar-h: 36` · score strip `--strip-h: 64` · board · `--thumb-h: 56`, with
`env(safe-area-inset-*)` padding top and bottom. The board is optically centred in what remains —
biased **8px above** true centre, so the thumb bar does not crowd it.

**Coordinates** (a–h, 1–8) sit on the lacquer frame, outside the felt, 11px, `--text-coord`, off by
default. The frame is a constant 14px whether they are shown or not, so toggling them never resizes
the board.

**≥ 900px:** board left, score and move list in a right-hand column. The board's frame never
stretches to fill — it keeps its square and its `--board-max`.

---

## 8. Components

Every interactive element defines **default / hover / focus-visible / pressed / disabled /
loading**. Hover is `@media (hover: hover)` only, so touch never sticks.

**Focus ring, everywhere:** `--focus-w: 2px` solid `--brass-lit`, `--focus-offset: 2px`. Never
removed, never restyled per component. It clears Lc 30 on all three felts, on paper, on lacquer and
on ink — that is why it is `--brass-lit` and not `--brass`.

### Primary button
Paper key on a dark table: `--card` fill, `--ink` label 17/500, `--r-pill`, height 48, padding
`0 --s6`, `--e0`. Brass appears as a 2px `--brass` rule inset at the bottom of the key — the mark
that says *this is the action* — because brass cannot legibly carry a label (§3).

- hover — fill lifts to `--bone`; the brass rule thickens to 3px. No transform, no shadow.
- focus-visible — the ring. Fill unchanged.
- pressed — fill drops to `--press`, the brass rule collapses to 1px, content shifts down 1px.
- disabled — fill `transparent`, 1px `--disabled` border, `--disabled` label, no brass rule,
  `cursor: not-allowed`. Present and readable, not ghosted away.
- loading — label stays in place (no spinner, no dots); a 2px `--brass` rule under the label
  travels left-to-right on a 900ms linear loop. The button is `aria-busy` and non-interactive.

### Secondary button
Transparent fill, 1px `--rule` border, `--text` label 17/500, `--r-pill`, height 48. Hover: border
to `--text-quiet`. Pressed: fill `--rule` at the same 1px border. Disabled as above.

### Destructive action
Lives inside a sheet, on paper, never in the thumb bar. `--ink` label 17/600 with a 2px `--shu`
rule on its leading edge; pressed tints the paper toward shu. Always confirms.

### Menu row (home)
Full width, `--row-h: 56`, `--text` label 17/500, a 1px `--rule` divider between rows, `--r-none`,
no card, no icon, no chevron-plus-arrow-glyph clutter — one 8px `--text-quiet` chevron mark at the
trailing edge. Pressed: row fills with `--rule` at 24% and the label shifts 2px toward the leading
edge, as if pressed into the table.

### PIN and PIN field
The four digits are the whole of the connect flow, so they are set at the display size — 56/700,
`--f-display`, tabular figures — spaced a whole space per digit in the text and a further `.06em`
in CSS, over a 2px `--brass` rule. Nothing else on that sheet is above 17px. The field the other
person types into is the same shape one step down (34/700 on `--bone`, `.5em` tracking, centred with
a matching `text-indent` so the trailing space does not throw the optical centre), and it has **no
`maxlength`** — see C27. The live status under either is `.waiting`: 13px `--lacquer`, set apart by
`--s4`, with a reserved line height so the sheet does not jump when it changes.

### Score capsule
`--r-pill` on `--card` paper, height 40, padding `0 --s3`. A 14px disc mark (`--ink` or `--bone`
with its rim), the player's name at 15/400, and the count at 22/700 display, tabular. The active
player's capsule carries a 2px `--brass` underline that **slides** between capsules on turn change
— that, plus the text label, is the entire turn indicator. Turn is never encoded in colour alone.

### Score strip
Full-bleed `--card` paper band, `--strip-h: 64`, `--r-none`, `--e1` hairline on its lower edge only.
Two capsules pushed to the outer edges, the score `2 : 2` centred at 22/700 tabular. **No shadow on
the strip** beyond `--e1`.

### Paper chit
Small `--card` rectangle, `--r-none`, `--e1`, 13/400 `--ink`. Carries emotes, the pass line, the
update notice. Slides in under the relevant capsule; dismisses itself.

### Bottom sheet
`--card` paper, `--r-none`, `--e2` — the only `--e2` in the app besides modals. Drag handle is a
32×3px `--card-edge` bar. Dismissible by drag and by backdrop tap. Backdrop is `--ink` at 0→92%.
One at a time. Game-over sheet leaves the final board visible above it.

### Thumb bar
`--ink` ground, `--thumb-h: 56`, 1px `--rule` on its top edge, exactly three equal slots. Only
frequent, reversible actions: Undo, Moves, and the overflow sheet. Resign, New game, Rematch
and Settings live **inside** the sheet — never one tap from a thumb. In an online match, Undo
renders unavailable with a reason on tap; it is never hidden, because hiding it would shift
the layout between modes. (The fourth slot was Hint until C23 removed it.)

### Disc
`--r-pill`, inset `--disc-inset: 3px` from the cell edge, `--ink` or `--bone` face, 1px inset rim
(`--disc-rim-dark` / `--disc-rim-light`) on the lower edge. No drop shadow, ever. The rim's angle
tracks the disc's rotation during a flip — the only lighting effect in the app.

### Empty, error, offline
Every screen defines all three, written specifically (§10). No illustration, no oversized centred
outline icon, no "Oops."

---

## 9. Motion — the approved timeline

Motion answers an action or explains a rule. **Nothing moves on its own.** Transform and opacity
only; never width, height, top, left or box-shadow. FLIP for anything that must reposition.
`will-change` is set on animation start and removed on `transitionend`.

| Element | Trigger | Property | Duration | Easing | Delay | Reduced-motion |
|---|---|---|---|---|---|---|
| Disc placed | move committed | `scale .72→1.04→1`, `opacity 0→1` | `--t-place` 180ms | `--e-place` | 0 | opacity fade, 120ms, no scale |
| Disc flipped | after placement lands | `rotate3d` 180° about the axis **perpendicular to its capture direction**; backface swap at 50%; `--flip-perspective: 600px` | `--t-flip` 260ms | `--e-flip` | `--t-stagger` 45ms × Chebyshev distance from the placed square | colour cross-fade 120ms, no rotation, **no stagger** |
| Flip wave > 20 discs | same | as above | 260ms | `--e-flip` | compresses to `--t-stagger-tight` 25ms rather than dropping frames | as above |
| Disc edge highlight | during flip | rim angle tracks rotation | with the flip | `--e-flip` | with the flip | omitted |
| Legal-move dot | position change | none — **static** 6px at 32% | — | — | — | identical |
| Ghost disc + would-flip rings | press-and-hold / hover | `opacity 0→.22`; 1px `--brass` ring on each disc that would flip | 0 (immediate) | — | 0 | identical |
| Illegal tap | tap on illegal square | `translateX` ±3px shake of cell content | `--t-illegal` 90ms | `--e-out` | 0 | `--shu` hairline only, no shake |
| Illegal hairline | same | `--shu` @40% `opacity→0` | `--t-illegal-fade` 200ms | `--e-out` | 0 | identical |
| Score numeral | flips resolve | integer tween, tabular figures | `--t-score` 220ms | `--e-out` | flip wave midpoint | jumps at 120ms |
| Turn underline | turn change | `translateX` between capsules | `--t-turn` 200ms | `--e-out` | 0 | jumps, no slide |
| Pass | forced pass | capsule `opacity 1→.55→1` + paper chit stating what happened | `--t-pass` 900ms | `--e-out` | 0 | chit only, no dim |
| Game over sweep | all discs settled | single specular sweep in the winner's colour across the felt | `--t-sweep` 700ms | `--e-out` | after last flip | **omitted** |
| Sheet | open | `translateY 100%→0`; backdrop `opacity 0→.92` | `--t-screen` 180ms | `--e-out` | 0 | appears without translation |
| Home ↔ game | navigate | cross-fade; board `scale .98→1` | `--t-screen` 180ms | `--e-out` | 0 | cross-fade only |
| Toast | one at a time | fade + 8px rise, auto-dismiss | `--t-toast` 2400ms hold | `--e-out` | 0 | fade only |

**Never:** confetti, particle bursts, bouncing badges, pulsing "thinking" dots, typewriter text,
horizontal screen slides, or the same fade-and-slide-up entrance on every element.

**Budget:** an 18-disc wave holds 60fps on a Pixel 4a. Concurrent transitions are capped; a wave
over 20 discs compresses its stagger rather than dropping frames.

**Thinking indicator:** never before 500ms, and it is a hairline `--brass` progress rule under the
opponent's score capsule. Not dots. If the engine answers in under 300ms the move still waits until
300ms, so the exchange has rhythm — but the delay is never padded beyond that.

---

## 10. Copy

Terse, concrete, a little dry. Sentence case. Active voice. Say what happened.

- `Your turn` / `White is thinking` — not "Waiting for opponent…"
- `You have no legal move. White plays again.`
- Illegal move: **nothing written.** The shake and the thud are the answer.
- `You win, 38–26.` / `Draw, 32–32.` / `White wins, 41–23.`
- `No white discs left. You win, 64–0.`
- `Couldn't reach your friend. Some networks block direct connections between devices. Try the same
  Wi-Fi, or enter codes manually.`
- `White disconnected. Waiting 28s…` → `Claim the win` / `Save and exit`
- `No finished games yet. Beat the computer and it'll show up here.`

**Never:** "Oops!", "Something went wrong", "Seamless", "Elevate", "AI-powered", emoji as
iconography, a `→` on a button label, meta strings joined with ` · `, `LABEL — fragment`, or any
exclamation mark.

---

## 11. Corrections

Append-only. Each entry is a decision that overrides an earlier instruction, with the measurement or
reason that forced it.

- **C1 — Dimmed body text is replaced by size and weight.** Brief §5.1 specifies the home subtitle
  as `--card` at 70%. Measured Lc 52.6 on ink against a 75 target. The dimmest passing tone,
  `--text-quiet` `#D2CDBF` (Lc 75.3), is nearly indistinguishable from full `--card`, so opacity
  cannot carry hierarchy here at all. Hierarchy is size, weight and position. `--text-quiet` is kept
  for the 15px subtitle and nothing smaller.
- **C2 — Brass is a mark, never a text-bearing fill.** `--ink` on `--brass` is Lc 40.3, `--card` on
  `--brass` is 49.3; nothing clears 75. The primary button is therefore a `--card` paper key with an
  `--ink` label and a 2px `--brass` rule. Brass keeps the focus ring, the turn underline, and the
  thinking rule.
- **C3 — Coordinates ship at 55%, not 45%.** 45% measured Lc 29.6 on lacquer, under the 30 floor for
  non-text UI. 55% gives 38.3 and is visually identical at 11px.
- **C4 — `--shu` never appears on `--ink`.** Lc 17.8. Destructive actions live on paper (Lc 66.2)
  at 17px/600, or appear as a shu rule rather than shu text.
- **C5 — The board needs `--frame-edge`.** `--lacquer` measures Lc 0.0 against `--ink`: the case is
  literally invisible against the room. A 1px `#8D8276` outer keyline (Lc 35.5) gives the board its
  silhouette. It is a structural edge, not a bevel — the frame stays flat.
- **C6 — The dark disc's rim is not optional.** A dark disc on felt is Lc 8.9–17.1. The rim at
  `--disc-rim-dark` carries the silhouette at 41.7–49.0 and therefore ships on by default, on every
  felt. The colourblind setting in §5.3 adds a *second*, inner marking on top of it.
- **C7 — The primary button's brass mark is a keyline, not a bottom rule.** A 2px rule along the
  bottom of a `--r-pill` key is clipped by the curve into a short chord and reads as an artifact
  rather than a mark. A 1px `--brass` keyline follows the shape, says *this is the action* without
  competing with the paper fill (already the brightest thing on a dark ground), and leaves the
  bottom edge free for the loading rule.
- **C8 — `--disabled` was raised to `#9A978E` (Lc 45.2).** The first value, card at 40%, measured
  Lc 22.9. Online matches render Undo unavailable *with a reason on tap* (brief §5.2), so a
  disabled label has to stay readable — it is information, not decoration. Disabled controls remain
  exempt from the 75 body target; 45.2 is the deliberate floor.
- **C9 — There is one turn indicator, owned by the score strip.** The brass rule slides between the
  capsules; the capsule itself has no rule of its own. Two mechanisms for one signal is exactly the
  drift the brief warns about. Where no strip exists (the game-over sheet), turn state is past and
  the text carries it.
- **C10 — Fonts live in `src/styles/fonts/`, not `public/`.** Referenced relatively so Vite
  fingerprints them and rewrites the URL for any deploy base; `public/` would force an absolute
  `/fonts/` path and break a sub-path deployment. Work Sans is a variable file that Google serves
  once per requested weight, so it ships once under a `font-weight: 400 500` range — 58.6 KB total
  for both families against a 180 KB budget.
- **C11 — The flip axis is the capture direction itself.** Brief §9 says a disc rotates "about the
  axis perpendicular to its capture direction, so a horizontal capture rolls vertically". Those two
  clauses describe opposite rotations: rotating about the axis *perpendicular* to a horizontal
  capture is `rotateY`, which rolls the disc sideways like a door. The stated visual — rolling
  vertically — is `rotateX`, whose axis is *parallel* to the capture direction. The visual is the
  checkable half and the one that reads as a wave, so it wins: the transform is
  `rotate3d(dx, dy, 0, 180deg)` where `(dx, dy)` is the capture direction, which gives a horizontal
  capture a vertical roll, a vertical capture a horizontal roll, and a diagonal capture a roll about
  its own diagonal.
- **C12 — Both disc faces are pre-rotated about the axis the flip will use.** A disc's rim is on its
  lower edge, so a disc that lands at `rotateX(180deg)` would show its rim at the top. Pre-rotating
  the back face about the same axis makes the composed transform the identity, so the disc lands
  upright with its rim at the bottom whichever way it rolled, and the landing needs no repaint.
- **C13 — The alternate-square tint is 3% off its felt, not 21%.** The brief's own note says
  "+/- 3% only", but the two hexes it gives (`#2F5D50` and `#24493F`) differ by about 21% per
  channel, which renders as an unmistakable chessboard — and an Othello board is not a chessboard.
  `--baize-deep` stays in the palette as the deep felt and as the manifest's theme colour; the
  square tint is a separate `--baize-alt` at a true 3%, with matching `--slate-alt` and `--sand-alt`.
  (APCA reports Lc 0.0 for the original pair, which is its low-contrast clamp rather than a claim
  that they look alike — a reminder that Lc answers "is this legible", not "is this visible".)
- **C14 — A cell's hit area may overhang the lacquer frame; its paint may not.** The outer ring of
  cells extends under the frame so the highest-stakes squares get a bigger target (DESIGN.md §7).
  When the button itself carried the felt background, that overhang painted over the frame and the
  board lost its case entirely. The felt is painted by `.cell__inner`, which is exactly one cell.
- **C15 — The score appears once.** The strip showed the count on each capsule *and* in the centre:
  the same two numbers, three times. The capsules carry the disc mark and the player's name; the
  centre carries the score, as in the brief's §5.2 diagram.
- **C16 — The range input is rebuilt from the app's own vocabulary.** Every browser renders it in a
  saturated blue, which is not a colour this app has. It is now a paper track and an ink disc, the
  same two shapes as the switch.
- **C17 — The last-move marker is `--brass-lit` at full strength.** Specified as `--brass`, it
  measured Lc 22.1 against baize before any transparency; at the 55% it was drawn with, 9.9. The
  marker is information — it is toggleable and it tells you where the last disc landed — so it has
  to clear the 30 floor. `--brass-lit` reaches 31.6–39.6 across all three felts and their alternate
  squares, and at one hairline it stays as quiet as intended.
- **C18 — The legal-move dot is 46%, and the ghost disc has a rim.** Both were specified as flat
  transparencies over felt and both measured under the floor: the dot at the specified 32% is
  Lc 19.8–21.0, and a dark ghost at 22% is Lc **0.0** — literally invisible on green. 46% is the
  least that puts the dot over 30 on every felt. The ghost cannot be solved that way at all, because
  ink on baize is only 16.7 even at full opacity, so it gets the same rim that carries a real disc's
  silhouette (C6) and keeps its 22% fill.
- **C19 — The pressed paper tone is `#D4CCB7`, not `--card-edge`.** Reusing the hairline colour as
  the pressed fill dropped the button's own label to Lc 72.1, under the 75 body target, for as long
  as a finger was down. `#D4CCB7` is the darkest press that keeps the label at 75.3 and is still
  clearly a press.
- **C20 — A light disc *mark* on paper is drawn as a full edge, not a lower rim.** `--bone` on
  `--card` measures **Lc 0.0**: on the score strip and the Continue slip, the white player's mark
  was invisible, which is the one thing those marks exist to say. On felt the lower rim is enough
  (Lc 44.7–52.0), but on paper the whole edge has to carry it, in `--mark-edge` `#A89F8C` (Lc 34.2).
  A single darker rim token could not serve both, because the value that works on paper drops to
  23.7 against the Sand felt.
- **C21 — The board has its four guide dots.** A printed Othello board carries small dots at the
  grid intersections two squares in from each corner, and the brief does not mention them. They are
  in, at `--felt-dot` (`--ink` at 34%), sitting under the discs. They carry no information — they
  are there because the object has them — so they are listed as a measured exemption rather than
  held to the 30 floor, and they must never be mistaken for a legal-move dot: those are 6px and at
  the centre of a square, these are 5px and at a corner where four squares meet.
- **C22 — The felt grain is 9%, not the brief's 4%, and it lives on the cell.** At 4% it was
  invisible at phone scale, which made it a texture that cost bytes and gave nothing. Two changes
  came with the lift: the alpha is now **baked into the tile** by `feComponentTransfer` rather than
  applied with `opacity`, so the grain can be a background layer on `.cell__inner` — as an overlay
  above the cells it also textured the legal-move dots and the last-move marker, which are
  information and should not sit under noise. And each cell offsets the tile by its own place on
  the board, so the weave runs continuously across the felt instead of restarting in every square.
- **C23 — Hints are gone, and the thumb bar is three slots.** Removed on request, and the removal
  goes all the way down: the search's hint entry point, the eval's `dominantTerm` and its table of
  reasons, the worker message pair, the Assist toggle and the `hints` setting. A feature half-removed
  is worse than one kept, because the bytes still ship. The thumb bar keeps four *sized* slots'
  worth of tap target across three, so Undo, Moves and the overflow sheet each get wider rather than
  the bar getting emptier.
- **C24 — A locked level is set into the paper, not dimmed.** `--disabled` was tuned against `--ink`
  and measures Lc 38.7 on `--card`, below even the large/bold floor, so dimming a locked row would
  have made the level's *name* unreadable — and the name is the one thing a person needs in order to
  know what they are working towards. Same medicine as C1: the label stays `--ink`, the row is
  recessed with `--press` (Lc 75.3 for the label, 10.1 for the recess itself against paper), weight
  drops 500 → 400, and the state is said in a word rather than implied. The row is a real, enabled
  button: tapping it says *Beat Casual to open this* rather than swallowing the tap.
- **C25 — The sound is rebuilt around an envelope, a room and two layers.** Asked for smoother, higher
  quality sound, and every fix turned out to be a defect rather than a taste. *One:* every burst
  began with `setValueAtTime(gain)` — an instantaneous jump, which is a step in the waveform, which
  is a click, on every disc placed. Every envelope now opens and closes over at least `MIN_FADE`
  (2.2 ms) and reaches *exactly* zero before its source is stopped; `src/audio/envelope.test.ts`
  replays the automation schedule in arithmetic and fails the build if any of them does not.
  *Two:* the app had no room at all. A 0.9-second impulse is synthesised at unlock — noise under an
  exponential decay, darkened as it falls, the two channels generated independently so the tail has
  width — and every voice sends to it. It costs nothing to ship and it is the difference between
  sounds in a space and sounds stuck to the glass. *Three:* percussion is a bright transient plus a
  body that falls in pitch, and the pitched voices are struck bars (a fundamental with two
  inharmonic partials, each dying faster than the one below) rather than triangle-wave beeps.
  The noise is pink rather than white and is read from a random offset every time, so no two
  placements are the same sound. And a placement is panned to its file, narrowly — the board is
  eight squares wide, not a stage.
- **C26 — Three defects the measurements found that review had not.** The flip wave charged every
  disc's voice budget to the instant it was *scheduled* rather than the instant it would *sound*, so
  a wave longer than six discs went silent after the sixth — for the entire life of the feature.
  The reverb ran un-normalised, and the convolution of a 0.9-second tail pushed the game-over figure
  to 1.02 full scale, i.e. clipping. And the UI tap sat 37 dB under the game-over figure, which on a
  phone speaker is not quiet, it is missing. The mix now spans 24 dB from `end` to `tap`, and
  `tests/e2e/audio.spec.ts` renders every voice through a real browser and fails on clipping, on a
  DC offset, on a tail that never ends, on a mono room, on a pan that does not place, and on any
  voice more than 27 dB from the loudest or below −46 dBFS.
- **C27 — The PIN field has no `maxlength`, and that is deliberate.** The host's sheet shows the PIN
  spaced — *9 8 7 6* — because that is how four digits get read out across a table. Which means the
  thing a person copies is seven characters, and a `maxlength` of four cut it to `98 7` before the
  input handler ever saw it: the field then held **987**, and the join went looking for a room three
  digits long. A wrong-PIN bug with no wrong PIN anywhere in it. The limit now lives in the handler,
  after the non-digits are stripped, so the PIN works pasted, spoken, spaced, or with the sentence
  still wrapped around it. The join fires once per complete PIN rather than once per keystroke after
  the fourth, and re-arms if a digit is corrected.
- **C28 — The connect flow has real styles now.** `.qr`, `.code` and `.code-input` went out with the
  QR encoder and nothing replaced them, so the PIN was rendering at body size on an unstyled input.
  It is the whole of that sheet, so it is set at the display size over a brass rule, with the field
  a step below it in the same shape. Its live status is `.waiting` — a size down, set apart, and
  with its line height reserved so the sheet does not jump when the text changes.
- **C29 — A sheet says what should hold focus; it does not guess and get corrected.** `open()` focused
  the first button, and the PIN screen tried to put that right with a 60-millisecond timer
  afterwards. Two frames apart, and which one won depended on how fast the page had loaded: about
  half the time the Join button took the focus back and digits typed straight away went nowhere.
  A person meets this as *I opened the keyboard, typed my friend's PIN, and nothing happened* — and
  it was invisible to every test until two devices were driven for real. `SheetContent` now carries
  `initialFocus`, so the sheet that exists to take four digits opens with the field focused, said
  once, in the place that decides it.
