You are building **Tidemark**, a personal Android app that watches web pages and tells me the instant something I care about changes: a price drops, an item comes back in stock, a flight fare moves, a keyword appears. Build it in phases, not in one pass. Before each phase, write a plan, critique it yourself, and wait for my approval.

---

## 1. Mission

Watch things on the internet that change, and tell me the moment the change is one I care about, without being fooled, without being blocked, and without draining my battery.

The app succeeds or fails on four things, in this order:

1. **Trustworthy detection.** A false alert ("price dropped to $0") is worse than a missed one. A watch that silently stopped working is the worst outcome of all.
2. **Speed to notification.** Seconds, not minutes, from a real change to my phone buzzing.
3. **A dense, fast, fluid UI.** 60 fps, no wasted space. 80 watches should be scannable in about one and a half screens.
4. **Eight-second setup for the common case.** Share a link, confirm, done.

**Hard rules:**
- Local-first. No account, no signup, no telemetry. Works offline.
- Every alert is explainable: tapping it shows what was fetched, what was read, and which rule matched.
- No CAPTCHA solving, no proxy rotation, no fingerprint spoofing. When a site asks for a human, the app asks me.
- Automations read; they never buy, book, bid, or submit anything.
- No dark patterns, streaks, badges, or engagement tricks.

---

## 2. Platform (real recommendations, follow these)

- **Native Android: Kotlin + Jetpack Compose, sideloaded APK.** Do not build a pure PWA. Browsers block cross-site fetching (CORS) and can't run reliable background checks, so a PWA can't do the core job. A PWA can come later as an optional companion backed by a small self-hosted relay.
- **Two processes.** Run the UI, database, scheduling, and notifications in the main process, and put *all* WebView work (background checks, in-app browser, element picker, automation player) in a separate `:checker` process. A crashing web page then can't take down the UI. Because the in-app browser and the checker share one process and one cookie jar, **any login I do by hand is automatically used by the background checks.** That is how member prices, logged-in carts, and region-locked stores work.
- **Widgets in classic RemoteViews + XML, not Glance.** Glance can't use custom fonts, and the design depends on its typeface and aligned numbers. Pass styled text with `TypefaceSpan`.
- **Bake tabular figures into the font at build time** (subset the font with fonttools so digits are fixed-width by default). Numbers then align everywhere, including widgets and notifications.
- Room for storage, WorkManager for scheduling, a foreground service only for the time-boxed "Sprint" mode.

---

## 3. What can be watched

A **Watch** is one thing I care about. It has one or more **Sources** (URLs or endpoints) and one or more **Conditions**. Build every scenario from a small set of primitives (a number, text, a yes/no state, or a set of items), not as special cases.

Support:
- Price drops at all, drops below $X, drops by N% or $N, hits an all-time low.
- Cheapest across several stores (one watch, many sources; the alert names the winning store).
- Back in stock, or a specific variant in stock (size 10, blue).
- New listings matching a search (marketplaces), alerting only on the new items.
- Flight fares for a route and date, and the cheapest date in a flexible window.
- Hotel and rental nightly rates.
- Any change to a chosen element, a keyword appearing or disappearing, or a generic number crossing a threshold ("3 left", ticket counts).
- RSS, JSON, and API endpoints.

Allow at most two-clause combinations, written as sentences ("in stock **and** under $200"). No visual rule builder.

For drop conditions, let me choose the baseline: last reading, 7-day median (the default, because "last reading" fires on noise), 30-day median, or all-time low.

---

## 4. The checking engine

### Fetch ladder: always try the cheapest method that works
1. **API tap.** A JSON endpoint that returns the value directly. Fastest and most reliable; prefer it whenever possible.
2. **Plain page download**, reading structured data (JSON-LD, product meta tags).
3. **Light browser.** JavaScript on, but images, fonts, ads, and trackers blocked.
4. **Full browser.** Everything loads like a real phone, with a short natural pause and a scroll if the page lazy-loads.

Step up automatically after two failures or a bot-wall signal. After sustained success, occasionally test one step down and move down if the result matches, so battery cost drifts lower over time.

### Being polite, which is also what keeps you from being blocked
- One request at a time per site. Never blast in parallel.
- Randomize every schedule by ±25%. Checks landing exactly on the hour are the loudest sign of automation.
- Keep one consistent browser identity and cookie jar per site. Rotating identities is *more* suspicious, not less.
- Use conditional requests (ETag / If-Modified-Since); an "unchanged" reply is a free check.
- Honour "slow down" responses with exponential backoff.
- Respect robots.txt: show a notice when a path disallows bots, and let me choose.
- Heavy checks run on Wi-Fi by default. At low battery, only critical watches run.

### Frequency profiles
Relaxed (~6h), Normal (~1h), Tight (~15m), Aggressive (~5m, Wi-Fi and charging by default), and **Sprint**: 20–60 seconds for a limited window (default 20 min, max 2h), user-started, with a live countdown notification, ending automatically. Sprint exists for restocks and ticket drops.

Adaptive scheduling (on by default): slow down watches that haven't changed in two weeks, speed up ones that just moved, and learn when each site tends to change.

### Reading the value
Try several methods in order: structured data, meta tags, a chosen element, a text pattern, and a currency heuristic that ignores crossed-out prices and "related products".

**Self-healing:** when a site's layout changes and the chosen element disappears, search for the value near where it used to be. If exactly one match is found, confirm it over two checks, adopt it, and quietly tell me ("layout changed; re-found the price, tap to verify"). If not, mark the watch **broken**, never "unchanged", and take me to the picker with the old snapshot side by side.

### The rule that prevents false alerts
**No alert fires on a single reading.** When a change appears:
1. Sanity check: reject values at or below zero, drops over 80%, currency changes, or pages that suddenly look empty.
2. Immediately re-check using a stronger method.
3. Notify only if both readings agree, attaching both to the alert as proof.

Also: stock changes must hold across two checks, the same alert can't repeat within 30 minutes, and "below $X" fires once on crossing and re-arms only after the price rises back above.

### When a site blocks you
Don't fight it. Mark the watch "needs attention", notify me once, and open the page in the in-app browser. I clear the check or log in, the app saves the session and offers "Resume checks", and lowers that site's frequency one step.

### Flights (Google Flights and similar)
Rebuild the search URL from saved fields (route, dates, cabin, stops) on every check; never replay a stale URL. Read prices from the rendered page by anchoring on visible text, since class names change. Optionally ingest Google's own price-alert emails via notification access, and optionally accept a fare-API key (Duffel, Amadeus, Kiwi) as a faster and more reliable path.

---

## 5. Automations ("recipes"): advanced feature

Some values only appear after interaction: picking a size, entering a zip code, choosing dates, dismissing a region pop-up, logging in, pressing "check availability". A **recipe** is a recorded sequence of steps the checker replays before reading the value.

**Steps:** open page, wait for, click, type, select, set date, scroll, dismiss (optional, since banners aren't always there), assert (a guardrail that aborts the run if something's wrong), extract.

**Values while typing** can be fixed, "ask me once", a secret, or a date expression like "today + 30". Dates are recalculated on every run.

**Recording UX:** open the in-app browser in record mode with a slim bottom bar (step count, undo, step list, Done). The page behaves completely normally. After I type in a field, a one-line prompt asks how to remember the value. The step list reads as plain sentences ("click 'UK 10'"), never code. On Done, I tap the value to track, then the app **replays the whole recipe visibly once** and asks "Found £129.00 — looks right?" before it can run on a schedule.

**Make it robust:**
- Target elements by accessible name and role first, then visible text, then labels, then position. Never rely on auto-generated class names. Warn me when a recipe is getting fragile, before it breaks.
- **Abort means abort.** If any step fails, don't read the page. A half-finished recipe is the likeliest source of a wrong number.
- Repair one failed step at a time, with a screenshot of the failure, instead of re-recording everything.

**Promotion (key optimization):** while recording, watch the network requests the page makes. If the value appears in one of them, offer to check that request directly. A six-second browser session becomes a tiny, fast check, with the recipe kept as a backup and re-verified monthly.

**Logins** are separate "session recipes" tied to a site, used only when the app detects I've been logged out. Stop after two failed logins, and hand two-factor prompts to me in the browser.

**Safety, built before recipes can run on a schedule:**
- Scan every button a recipe clicks for words like buy, checkout, pay, place order, book, bid, delete, submit. Block saving on a match; overriding requires typing "understood", and the override is shown on the watch permanently.
- Abort if a run lands on a cart, checkout, or payment URL.
- Store secrets in the Android Keystore, and keep them out of logs, snapshots, and exports.
- Recipes use the full browser and have a 15-minute minimum interval.

---

## 6. Notifications

The notification is where the value is delivered; give it as much care as the main screen.

**Channels:** Price drops & restocks (high), Urgent watches (high, alarm-style sound), Needs attention (silent), Sprint (ongoing, silent), Daily digest (minimal).

**Content:** the title carries the information, not the app name.
> **$179 ↓ 28%**
> Sony WH-1000XM5 · amazon · was $249, lowest since Nov
> [ Open amazon ] [ Snooze 1h ] [ Stop ]

- Build the notification when the change is confirmed, so it posts instantly.
- Restock alerts lead with the state ("In stock — Ooni Koda 16"), and their main button opens the buy page directly.
- Group by collection. If 3+ alerts arrive within a minute, show one summary with one sound.
- Quiet hours hold alerts and deliver them as one digest afterwards, except for urgent watches.
- Everything also lands in the Activity tab, so nothing is lost to a swipe.
- Never notify about the app's own housekeeping.
- Don't rely on full-screen "alarm" alerts; recent Android restricts them. Offer them as an explicit opt-in with an explanation.
- Sprint shows a live countdown (as a Live Update on Android 16+) and posts a closing summary when it ends.

---

## 7. UX and workflow

### Structure
Three tabs: **Watches** (home), **Activity** (alerts, health issues, check log), **Settings**. Everything else is a mode entered in context and exited back to it: in-app browser, element picker, recipe recorder, sprint, bulk edit.

### Navigation
- A **floating bottom pill** (Watches / Activity / Settings, with a fused round **+**). It hides on scroll down and returns on scroll up.
- A **floating top pill**: search, filter count, and a "next check in 4m" ticker, expanding into filters and sort.
- Gestures: swipe right to check now, swipe left to snooze (1h / 1d / until it changes), long-press to multi-select, swipe down to close detail, swipe sideways between watches.

### Adding a watch
Entry points, by importance: the **Android share sheet** (main door), a **clipboard chip** ("Track this link?"), the in-app browser's "Watch this" button, a paste field, and duplicating an existing watch.

The add sheet **starts fetching immediately** and shows the title, image, price, and stock state as they arrive, with a preselected condition ("price drops" if in stock, "back in stock" if not, "fare drops" for flights). One primary button: **Track it**. Advanced options sit behind a single collapsed "More" row.

After saving, the app **self-tests** with three checks over 90 seconds and shows a solid status once the value is stable, or "couldn't read this reliably — fix it" right away.

**Element picker** (when detection fails): the page loads; tap an element to see the parsed value live in the bottom bar ("249.99 USD"); use **wider / tighter** to move up or down the page structure instead of precise tapping; long-press where elements overlap. If the value only appears after interaction, offer **Add steps** to open the recipe recorder.

### Home list
Dense rows, not cards. Three densities: Comfortable (60dp with sparkline), Compact (44dp), Table (36dp, departure-board style).
- **Every value right-aligned on one shared vertical axis down the whole list.** This "numeric rail" is the layout signature; never break it.
- Status is shown by shape, not just color: filled square armed, hollow paused, half snoozed, slash broken, caret needs attention.
- A thin collection color strip on the row edge; the only use of color for identity.
- A **"Now" strip** at the top holds unacknowledged alerts, and takes zero space when empty. No "all caught up" card.
- Sort: recently moved (default), biggest drop, next check, name, health.
- Empty state: one line and one button. "Share a link here to start watching it." [Paste a link]

### Watch detail
Big current value and change, then a history chart. Drag to scrub (the header value follows, with haptic ticks); **long-press the chart to set a threshold at that price.** Below: conditions, sources (with store, price, method, last checked), and a visible **check log** where each entry expands to show method, result, and a snapshot. Alerts appear as marks on the chart and explain why they fired. Bottom actions: Open page, Check now, Sprint.

### Widgets (the surface I'll use most days)
- **Board** (4×2 to 4×4, 3–8 rows): mixed rows, e.g. three flight fares plus one "in stock" item, all aligned on the same rail as the app. Anything that dropped or restocked since I last opened the app shows in the accent color.
- **Single** (2×2): one watch, big number, sparkline.
- **Stock light** (2×1): one yes/no watch as a large shape, readable across the room.
- **Fare strip** (4×2): cheapest date in a window with a tiny 7-day bar chart.
- Widgets **never fetch or schedule anything themselves**; they update when a check finishes, and not while the screen is off. Pinning a watch never secretly changes how often it's checked; if a pinned watch is checked rarely, the setup screen says so and offers a one-tap fix.
- Tapping a row opens detail; tapping a restock value opens the buy page.
- The setup screen shows a **live preview at the exact placed size** above the watch list, with drag-to-reorder.
- Also: a quick-settings tile showing the unread alert count, and an optional permanent "shade board" notification for one collection.
- Follow system light/dark, but don't use Material You wallpaper colors; they'd override the one meaningful accent.

### From A to Z
1. Install. One welcome screen, no carousel, no permissions yet.
2. Share an Amazon link into the app. The price appears in about a second. Track it.
3. Only now, ask for notification permission, with a one-line reason.
4. Self-test passes; status goes solid.
5. A harder site: detection fails, the picker opens, two taps and it reads £399.
6. A shoe that shows its price only after picking a size: record the steps, watch the replay, confirm. The app finds the underlying request and offers the fast check.
7. After a couple of watches, a one-time battery-exemption explanation, never repeated.
8. At five watches, a one-time suggestion to group them into collections.
9. Place a Board widget with three fares and one restock.
10. Days pass. Static watches slow down quietly, with the reason shown in detail.
11. A price drops: confirmed, notified within seconds, one tap to buy.
12. The alert waits in the "Now" strip until dismissed; the chart keeps the mark forever.
13. A site redesigns: self-healing re-finds the price and asks me to verify.
14. A site blocks: I clear it in the in-app browser; checks resume more gently.
15. A console restock at 10 a.m.: start a 30-minute Sprint, get the buy link the moment stock flips.
16. Done with an item: stop watching, optionally keeping its history.
17. Export everything to one JSON file anytime.

---

## 8. Design direction (locked; write these into `DESIGN.md` before any UI code)

**Concept: "Departure board."** A transport timetable and brass instrument panel: information in a rigid right-aligned number column, readable at a glance, on a cool printed-plate background, with exactly one signal color that means *something happened*. The feeling is calm competence, a well-kept log.

**The idea behind it: in this app, down is good.** A falling number is the happy event, so the accent belongs only to drops and restocks. Nothing else may use that color.

**Palette** (six values per mode; don't add more without a written reason):

| Token | Light | Dark |
|---|---|---|
| Ground | `#E9EDEE` cool pale plate | `#1A2224` deep slate |
| Band (alternate rows) | `#E1E7E8` | `#202A2C` |
| Ink | `#16292B` dark spruce | `#DDE5E5` |
| Ink muted | `#62787A` | `#8AA0A2` |
| Rule (the rail axis only) | `#C6D0D1` | `#334345` |
| **Signal (drops/restocks only)** | `#E0A21B` marigold | `#D19A2A` |
| Adverse (price rose / gone) | `#8C3A4A` deep wine | `#A85266` |

**Type:** one family, three widths. **Archivo**: Expanded for big numbers, regular for body, Narrow for dense labels. All numbers use tabular figures. Never use a monospace font for numbers or labels. Sentence case everywhere; no all-caps labels.

**Shape:** a 4dp spacing grid. 3dp corners on rows, inputs, and sheets; **fully rounded only on the two floating bars.** That contrast is the shape signature. Rows are separated by subtle alternating bands, not borders. One soft shadow, used only under the floating bars. Nothing nested in a container inside another container.

**Motion:** quick (140ms standard, 220ms for sheets, springy bottom bar). Motion only responds to actions, with one exception: when a watch triggers, its number counts to the new value once, the row flashes the accent, and the phone gives one haptic tap. No staggered list entrances, no shimmer skeletons (use a thin progress line in the row instead).

**Icons:** one stroked set, 1.5dp line. No emoji in the UI.

**Banned: treat each as a failure.**
- Purple, indigo, violet; purple-to-blue gradients; default Tailwind blue; any decorative gradient or gradient text; glows.
- Glassmorphism, blur, frosted panels.
- Cards in the main list; cards inside cards; grey borders on everything; colored left-border stripes on cards.
- Inter, Poppins, Space Grotesk, Geist, or Roboto as the UI font; monospace as decoration; a single italic serif word in a heading.
- All-caps labels, tiny labels above headings, dot-separated metadata as decoration, arrows appended to button text.
- The "giant number with tiny label and accent dot" hero pattern.
- Cream background with terracotta and serif display; near-black with acid green. These are the most common AI-generated palettes right now.
- Pure white/black backgrounds, or near-black (#0B0B0B, #111) standing in for black.
- Fade-and-slide-up list animations; shimmer skeletons; hover effects on everything.
- Empty states with an illustration, a headline, and three example cards.
- Sparkle icons, "AI" language, chat bubbles for things that aren't conversations.

**Copy:** plain verbs, sentence case, no filler. "How often to check", not "polling interval". Buttons keep their name through the flow ("Track it" → "Tracking"). Errors say what happened and what to do: "Couldn't find a price on this page. Pick it yourself?" Never "Oops!". If a screen needs a paragraph of explanation, the screen is wrong.

**Accessibility:** status always shown by shape as well as color; strong text contrast; 44dp minimum touch targets; full screen-reader labels ("price dropped 28 percent, now 179 dollars 99"); respect reduced motion; layouts that survive 200% text size.

---

## 9. Self-criticism process (follow for every phase)

1. **Plan first, then critique the plan.** Ask: *"Would I have written this same plan for any generic tracker app?"* Wherever the answer is yes, revise it and tell me what changed and why.
2. **Run one alternative design direction before committing.** Generate a long random string with a shell script, find patterns in it, and derive a complete alternative look from them (colors, type, row rhythm, status shape). Build the list and detail screens in both directions, compare them side by side at phone size and thumbnail size, and argue for one. Judge on: can I read 20 rows at a glance, does a triggered alert stand out without shouting, does it look like a person made deliberate choices.
3. **Never approve your own UI.** Screenshot every screen at 390×844 and 300×650 and send only the screenshots to a separate critic subagent that never sees the code. The critic:
   - names the aesthetic the screen is aiming for,
   - imagines how a studio known for information design would execute it,
   - lists the biggest specific gaps, most important first,
   - flags every item from the banned list by name,
   - checks that the accent means only drops and restocks, that numbers sit on one aligned rail, and that hierarchy survives at thumbnail size,
   - names the three least necessary elements,
   - scores out of 10 (5 = competent generic screen, 7 = good but templated, 9 = deliberate designer choices with no significant gap).
   
   Be specific and blunt, not diplomatic. Iterate until the critic scores 9+. Don't tell it the threshold; use the same critic prompt every round. If two rounds don't improve the score, stop and report what's blocking.
4. **Cut before you add.** At the end of each phase, delete the three least load-bearing visual elements on each screen. Keep the deletions nobody misses.
5. **Test on a real phone**, not just the emulator: force-stopped app, Doze, reboot, lock screen, widget refresh.
6. **Keep `PROGRESS.md` updated** after every session: phase status, decisions, gotchas. **Ask me** instead of inventing product behavior the spec doesn't cover.

---

## 10. Build phases

Don't start a phase until the previous one's exit check genuinely passes.

- **Phase −1: Spike.** Throwaway code that fetches three real product pages (one structured-data, one Shopify, one JavaScript-only) from a background worker, including a WebView. *Exit:* all three values read correctly in the background. If the WebView path fails here, stop and tell me.
- **Phase 0: Foundations.** `DESIGN.md`, `ENGINE.md`, the two-process setup, the font subsetting task, the data model, and the condition logic with full tests. *Exit:* tests pass; the checker process can crash and restart without affecting the UI.
- **Phase 1: Cheap checks + basic UI.** Plain downloads, structured-data reading, storage, one notification. Deliberately plain design. *Exit:* a real Amazon and Shopify item tracked end to end, with the double-check visible in the log.
- **Phase 2: Browser checks + element picker.** Light and full browser methods, shared sessions, picker, self-test. *Exit:* three sites that fail plain download work via the picker and survive restart.
- **Phase 3: Design pass.** Apply the design system fully and run the critic loop to 9+. *Exit:* critic score, squint test, banned-list audit.
- **Phase 4: Scheduling.** All profiles, Sprint, adaptive timing, politeness rules, network and battery rules. *Exit:* timing tests pass; measured battery use recorded (target: 100 watches on Normal under 2% per day).
- **Phase 5: Robustness.** Self-healing, sanity checks, health scores, block handoff, snapshots, and a false-alert test suite (fake $0 prices, "unavailable" pages, currency swaps, empty bot-wall pages). *Exit:* zero false alerts.
- **Phase 6: Breadth.** Site adapters (as data files, so new sites don't need an app update), multi-store watches, marketplace searches, flights, API keys, collections, bulk edit, export/import.
- **Phase 6.2: Recipes.** Recorder, player, safety interlock (built first), secrets, network-request promotion, logins, step repair. *Exit:* four real recipes (size, zip, dates, login) survive 50 replays; the interlock blocks a real "Add to cart"; no secret appears in logs, snapshots, or exports.
- **Phase 6.5: Widgets and outside surfaces.** Board, Single, Stock light, Fare strip, live-preview setup, tile, shade board. *Exit:* correct at every size in light and dark, numbers aligned to the pixel, updates within 2 seconds of a check while the screen is on, and survives reboot and app update.
- **Phase 7 (optional): PWA + relay.** Only if I want checks to continue while my phone is off.
- **Phase 8: Release.** Signed APK on GitHub Releases, in-app updater, README with real screenshots and the measured battery figure, and a landing page.

**Performance targets:** cold start under 700ms; smooth scrolling with 200 rows; confirmed change to notification under 3 seconds (under 1 second in Sprint); APK under 20 MB.

---

## 11. Landing page and promotion

- Don't use the template (hero → three feature cards → testimonials → FAQ). Lead with proof: a real screen capture of the dense list where one number falls and the row flashes marigold. One screen, one claim, one action.
- Use real assets, not CSS decoration: generated imagery of a brass departure-board plate, a ledger page, the app on a real phone on a real desk, and a short looping clip of the trigger moment.
- Show the check log. "Here's every request it made and why it decided to tell you" persuades better than any adjective.
- Cut any sentence that describes a feature category instead of a behavior. "Multi-scenario tracking engine" → "Watches 200 things and doesn't lie to you."
- The icon comes from the numeric rail and a falling value, not a glyph in a gradient square.

---

**Start now with Phase −1.** Write the plan, critique it, and wait for my go.
