# Tidemark design

This file is locked before any UI code. Every screen, widget and notification follows it. When a
rule here conflicts with a convenience, the rule wins; when something isn't covered, ask, don't
invent.

## Concept: departure board

A transport timetable and a brass instrument panel. Information sits in a rigid, right-aligned
number column, readable at a glance, on a cool printed-plate background, with exactly one signal
color that means *something happened*. The feeling is calm competence: a well-kept log.

**In this app, down is good.** A falling number is the happy event, so the accent belongs only to
drops and restocks (and new listings, which are the marketplace form of a restock). Nothing else
may use that color: not buttons, not links, not selection, not focus, not charts' decoration.

## Palette

Six values per mode, plus the ink that sits on the signal. Don't add more without a written reason
in this file.

| Token | Light | Dark | Use |
|---|---|---|---|
| Ground | `#E9EDEE` | `#1A2224` | Screen background, widget background |
| Band | `#E1E7E8` | `#202A2C` | Alternate list rows, sheets, text fields |
| Ink | `#16292B` | `#DDE5E5` | Text, icons, status shapes, chart line, primary buttons |
| Ink muted | `#62787A` | `#8AA0A2` | Secondary text, unselected tabs, axis labels |
| Rule | `#C6D0D1` | `#334345` | The rail axis only (and the chart's threshold line, which lives on the rail) |
| Signal | `#E0A21B` | `#D19A2A` | Drops, restocks, new listings. Only. |
| Adverse | `#8C3A4A` | `#A85266` | Price rose, gone, broken |
| On signal | `#16292B` | `#1A2224` | Text placed on a Signal plate |
| On adverse | `#E9EDEE` | `#1A2224` | Text placed on an Adverse plate |

**Signal is a plate, not a text color.** Marigold text on the pale ground fails contrast (about
2:1). A moved value is drawn as On-signal text on a Signal plate (3dp corners): about 7:1, and it
reads like a lit tile on a departure board. The same rule applies in widgets and the shade board.

**Collection strip hues** (written reason: collections need identity, and the spec allows color
for identity only as the thin strip on a row's edge). Six muted, desaturated hues that never read
as Signal or Adverse and contain no purple, indigo, violet or default blue:

| Index | Light | Dark |
|---|---|---|
| 0 spruce | `#3E6B68` | `#6FA39F` |
| 1 moss | `#7A8B4A` | `#A3B46E` |
| 2 clay | `#A0785A` | `#C79C7C` |
| 3 slate | `#4F6A86` | `#7F9BB8` |
| 4 steel | `#8A8F96` | `#A7ADB4` |
| 5 walnut | `#6E5A4B` | `#9C8676` |

They appear only as the 3dp strip on the leading edge of a row (list, Board widget) and as a 10dp
swatch next to a collection's name in the collection picker.

System light/dark is followed. Material You wallpaper colors are never used (they would override
the one meaningful accent). Status and navigation bars are transparent over Ground.

## Type

One family, three widths, baked with tabular figures (see `tools/fonts/build_fonts.py`): every
digit is the same width by default, so numbers align everywhere, including widgets and
notifications, with no font-feature settings. Never use a monospace font for numbers or labels.

| Style | Font file | Size / line | Use |
|---|---|---|---|
| bigNumber | archivo_expanded_semibold | 44 / 48 sp | Detail header value, Single widget |
| rowValue | archivo_expanded_medium | 17 / 22 sp | Values on the rail (Comfortable, Compact) |
| rowValueDense | archivo_expanded_medium | 14 / 18 sp | Values on the rail (Table) |
| title | archivo_semibold | 20 / 26 sp | Screen and sheet titles |
| body | archivo_regular | 15 / 21 sp | Body text |
| bodyStrong | archivo_medium | 15 / 21 sp | Emphasis, row names in Comfortable |
| rowName | archivo_medium | 15 / 20 sp | Row names in Compact |
| dense | archivo_narrow_regular | 13 / 17 sp | Store, next check, table columns, axis labels, log lines |
| denseStrong | archivo_narrow_medium | 13 / 17 sp | Table-density names, emphasised dense text |
| button | archivo_medium | 15 / 20 sp | Buttons |

Sentence case everywhere. No all-caps labels. No letter-spacing tricks. No italics.

## Shape and space

- 4dp grid. Screen gutters 16dp. Minimum touch target 44dp.
- 3dp corners on rows (when pressed/selected), inputs, plates and sheets. **Fully rounded only on
  the two floating bars.** That contrast is the shape signature.
- Rows are separated by alternating Ground/Band bands, never by borders or dividers.
- One soft shadow, used only under the floating bars.
- Nothing nested in a container inside another container. No cards anywhere in the main list.

## The numeric rail

The layout signature. Never break it.

- Every value in the list is right-aligned to one vertical axis shared by the whole list: the
  **rail**. The rail sits at `x = width − 16dp − 60dp (change column) − 6dp`.
- A continuous 1dp line in Rule color is drawn at the rail from the top of the list to the bottom,
  through every band. It is the only use of Rule.
- Values end 6dp left of the line; the change column ("↓ 28%", "↑ 4%") begins 6dp right of it and
  is left-aligned inside its 60dp.
- The rail's x is the same in all three densities, in the Now strip, and in the detail screen's
  source rows. The Board widget uses its own rail with the same geometry.
- Text values (In stock, Sold out, 3 new, Changed) sit on the rail too.

## List rows

Three densities (Settings > Look): Comfortable 60dp, Compact 44dp (default), Table 36dp. 80 watches
must be scannable in about one and a half screens in Table.

```
| strip 3dp | 13dp | status 10dp | 10dp | name (flex, 1 line)         | value ⟂ | 6 | Δ 60dp | 16dp |
```

- **Comfortable**: name in bodyStrong, below it a dense muted line ("amazon, next check 12m"). A
  56 × 20dp sparkline (1.5dp Ink line, no fill) sits 12dp left of the value column.
- **Compact**: name in rowName, one line. Store name, if shown, as dense muted text to the right of
  the name.
- **Table**: departure-board columns: name in denseStrong, store (72dp, dense muted), next check
  (40dp, dense muted), value in rowValueDense, change.
- Change column: drops in Ink, rises in Adverse. Never Signal.
- A value that moved (drop/restock/new items) and hasn't been acknowledged sits on a Signal plate.
- A check in flight shows a 2dp progress line along the row's bottom edge in Ink at 40%, never a
  shimmer or skeleton.
- Selected rows (multi-select): Ink at 8% over the band and a filled status shape.

## Status by shape

10dp, drawn in Ink unless noted. Color is never the only signal.

| Status | Shape |
|---|---|
| Armed | filled square |
| Paused | hollow square, 1.5dp stroke, Ink muted |
| Snoozed | square, bottom half filled |
| Broken | hollow square with a diagonal slash, Adverse |
| Needs attention | upward caret (chevron), 1.5dp stroke |

## Floating bars

- **Bottom pill**: 56dp high, fully rounded, 16dp above the navigation inset. Tabs Watches /
  Activity / Settings as text (button style), with a fused round + button (56dp circle attached at
  the pill's end, same fill). Selected tab: full-opacity label with a 2dp × 16dp bar under it;
  others at 60%. Hides on scroll down, returns on scroll up (spring, damping 0.7, stiffness 400).
- **Top pill**: 44dp high, fully rounded: search field, filter count ("2 filters"), and the ticker
  ("next check in 4m"). Tapping expands it into filters (collection, status, kind) and sort
  (recently moved, biggest drop, next check, name, health).
- Fill: Ink with Ground content in light mode; Band with Ink content in dark mode. The one soft
  shadow sits under both.
- Only the two floating bars are fully rounded. Everything else uses 3dp corners.

## Screens

- **Watches**: the list, the Now strip at the top (unacknowledged alerts, zero height when empty,
  no "all caught up" card), the two floating bars. Empty state: one line and one button: "Share a
  link here to start watching it." [Paste a link].
- **Watch detail**: big current value (bigNumber) and change, then the history chart. Drag to
  scrub (the header value follows, with haptic ticks); long-press the chart to set a threshold at
  that price. Alerts are marks on the chart (Signal ticks for drops/restocks) and explain why they
  fired. Below: conditions (as a sentence), sources (store, price on the rail, method, last
  checked), and the check log where each entry expands to method, result and a snapshot. Bottom
  actions: Open page, Check now, Sprint. Swipe down closes; swipe sideways moves between watches.
- **Activity**: alerts, health issues, check log, in that order, as dense rows on the rail.
- **Settings**: plain rows. "How often to check", not "polling interval".
- **Add sheet**: starts fetching immediately; title, image, price and stock state appear as they
  arrive; one preselected condition; one primary button "Track it" (becomes "Tracking"); advanced
  options behind a single collapsed "More" row.

## Charts

- Line 1.5dp Ink. No area fill, no gradient, no glow.
- Y labels right-aligned on the rail; X labels dense muted.
- Threshold: 1dp dashed Rule line with its value on the rail.
- Alert marks: 6dp Signal ticks for drops/restocks; Ink ticks for other alerts.
- Scrub cursor: 1dp Ink vertical line and a 6dp Ink dot; the header shows the scrubbed value.

## Motion

- 140ms standard (FastOutSlowIn), 220ms for sheets, the bottom bar springs.
- Motion only responds to actions. **One exception**: when a watch triggers, its number counts to
  the new value once (600ms), the row flashes Signal at 35% fading out over 900ms, and the phone
  gives one haptic tap.
- No staggered list entrances, no fade-and-slide-up, no shimmer skeletons, no hover effects.
- Reduced motion (animator scale 0 or "remove animations") skips the count and the flash; the
  Signal plate alone marks the move.

## Icons

One stroked set, 1.5dp line on a 24dp grid, round caps and joins, Ink. No emoji anywhere in the
UI. No sparkle icons.

## Widgets

Classic RemoteViews + XML, not Glance (Glance can't use the custom fonts). Each styled run of text
is its own TextView with `android:fontFamily="@font/…"`; spans are used only for color and size.

- **Board** (4×2 to 4×4, 3–8 rows): the list's row anatomy on its own rail, Ground background,
  alternating bands, collection strip, status shapes as small vector drawables. Anything that
  dropped or restocked since the app was last opened sits on a Signal plate.
- **Single** (2×2): one watch: name (dense), big number (bigNumber, scaled to fit), change, and a
  sparkline.
- **Stock light** (2×1): one yes/no watch as a large shape readable across the room: a filled
  Signal square with "In stock", or a hollow Ink square with "Sold out".
- **Fare strip** (4×2): cheapest date in the window, its fare on the rail, and a tiny 7-day bar
  chart (bars in Ink muted, the cheapest in Signal only if it dropped).
- Light and dark follow the system via `values-night`. Corners use the system widget radius.
- Tapping a row opens detail; tapping a restock value opens the buy page.

## Notifications

The notification is where the value is delivered; give it as much care as the main screen.

```
$179 ↓ 28%
Sony WH-1000XM5 · amazon · was $249, lowest since Nov
[ Open amazon ] [ Snooze 1h ] [ Stop ]
```

- The title carries the information, not the app name.
- Restock alerts lead with the state ("In stock — Ooni Koda 16") and their main button opens the
  buy page directly.
- Accent color (`setColor`) only on the Price drops & restocks channel.

## Copy

Plain verbs, sentence case, no filler. "How often to check", not "polling interval". Buttons keep
their name through the flow ("Track it" → "Tracking"). Errors say what happened and what to do:
"Couldn't find a price on this page. Pick it yourself?" Never "Oops!". If a screen needs a
paragraph of explanation, the screen is wrong.

## Accessibility

- Status always by shape as well as color.
- Strong text contrast (Signal is a plate, never text on Ground).
- 44dp minimum touch targets.
- Full screen-reader labels: "Sony headphones, price dropped 28 percent, now 179 dollars 99".
- Respect reduced motion.
- Layouts survive 200% text size: rows grow in height, the rail stays; names truncate before
  values do.

## Banned — treat each as a failure

- Purple, indigo, violet; purple-to-blue gradients; default Tailwind blue; any decorative gradient
  or gradient text; glows.
- Glassmorphism, blur, frosted panels.
- Cards in the main list; cards inside cards; grey borders on everything; colored left-border
  stripes on cards.
- Inter, Poppins, Space Grotesk, Geist, or Roboto as the UI font; monospace as decoration; a single
  italic serif word in a heading.
- All-caps labels, tiny labels above headings, dot-separated metadata as decoration, arrows
  appended to button text.
- The "giant number with tiny label and accent dot" hero pattern.
- Cream background with terracotta and serif display; near-black with acid green.
- Pure white/black backgrounds, or near-black (#0B0B0B, #111) standing in for black.
- Fade-and-slide-up list animations; shimmer skeletons; hover effects on everything.
- Empty states with an illustration, a headline, and three example cards.
- Sparkle icons, "AI" language, chat bubbles for things that aren't conversations.

(The notification body's "·" separators are content the spec prescribes, not decoration; they
appear nowhere in the app's own UI.)
