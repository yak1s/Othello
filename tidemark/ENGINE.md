# Tidemark checking engine

How Tidemark decides what to fetch, how it reads a value, and when it's allowed to tell you
something. Trustworthy detection comes first: a false alert is worse than a missed one, and a
watch that silently stopped working is the worst outcome of all.

Pure logic lives in `:core` (no Android), so every rule below is covered by JVM tests. The app
wires it to the database, the checker process, notifications and widgets.

## Processes

| Process | Owns |
|---|---|
| main (`app.tidemark`) | UI, Room database, WorkManager scheduling, Sprint foreground service, notifications, widgets, tile |
| `:checker` | Every network fetch (OkHttp) and every WebView: background checks, the in-app browser, element picker, recipe recorder and player |

The main process sends a `CheckRequest` (JSON over a `Messenger`) to `CheckerService` and waits for a
`CheckResult`. The checker never opens the database. Large things (HTML snapshots, failure
screenshots) are written to `filesDir/snapshots` and passed by path.

**Why all fetching is in the checker:** the in-app browser and the background checks share one
process and one cookie jar (`android.webkit.CookieManager`). OkHttp reads and writes the same jar
through a `CookieJar` bridge. So any login done by hand in the in-app browser is automatically used
by background checks — member prices, logged-in carts, region-locked stores.

**Crash isolation:** if a page crashes the WebView renderer (`onRenderProcessGone` returns true and
the check fails) or kills the checker process, the main process sees a dead binder, records the
check as `INTERNAL_ERROR` ("Checker restarted"), rebinds on the next request, and the UI never
notices.

## The fetch ladder

Always try the cheapest method that works.

| Rung | Method | When available |
|---|---|---|
| API | JSON endpoint that returns the value directly | An API tap exists (site adapter, e.g. Shopify `…/products/<handle>.js`, or a promoted recipe request), or a fare API key for flights |
| PLAIN | Plain page download, read for structured data | PAGE, SEARCH, FEED |
| LIGHT | WebView, JavaScript on; images, fonts, media, ads and trackers blocked | PAGE, SEARCH |
| FULL | WebView loading everything like a real phone, a 1.5–3.5 s natural pause, and a slow scroll if the page lazy-loads | PAGE, SEARCH, FLIGHT, recipes |

- **Step up** after two consecutive failures at a rung, or immediately on a bot-wall signal.
- **Step down**: after 20 consecutive successes, at most every 3 days, probe one rung down. If the
  weaker rung reads the same value, move down; battery cost drifts lower over time.
- Recipes force FULL. Flights use FULL unless a fare API key is set (then API).
- The add sheet's preview decides the starting rung: whatever worked first.

## Being polite (which is also what keeps you from being blocked)

- **One request at a time per site.** Enforced twice: the main process groups due checks by host
  and runs each host's checks in sequence; the checker holds a per-host mutex. Different sites run
  in parallel (at most 3 at once).
- **Minimum gap per site**: 8 s (20 s in Sprint), or the adapter's `minGapSeconds`.
- **±25% jitter on every schedule.** Nothing lands on the hour.
- **One consistent identity per site**: the device's own WebView user agent and one cookie jar,
  for plain downloads and browser checks alike. Identities never rotate (rotation is *more*
  suspicious, not less).
- **Conditional requests**: `If-None-Match` / `If-Modified-Since`; a 304 is a free "unchanged".
- **Slow-down replies** (429, 503) back off exponentially from 5 minutes up to 12 hours,
  honouring `Retry-After`.
- **robots.txt** is fetched per host (cached 24 h). If a path is disallowed, the add sheet shows a
  notice and lets you choose; the choice is stored on the source (`robotsOverride`).
- **Heavy checks on Wi-Fi by default**: LIGHT/FULL checks defer on metered networks unless the
  watch is urgent, in a Sprint, or run by hand. **Low battery** (≤ 15%, not charging, or battery
  saver on): only urgent watches run. **Aggressive** defaults to Wi-Fi and charging.

## How often

| Profile | Base interval |
|---|---|
| Relaxed | ~6 h |
| Normal | ~1 h |
| Tight | ~15 min |
| Aggressive | ~5 min (Wi-Fi and charging by default) |
| Sprint | 20–60 s for a limited window (default 20 min, max 2 h), user-started, live countdown, ends automatically |

**Adaptive scheduling** (on by default):
- No confirmed change in 14 days → one profile slower; 42 days → two slower (never slower than
  Relaxed). The reason is shown in detail ("Checked less often: no change in 2 weeks").
- A confirmed move → one profile faster for 48 h (never beyond the user's own profile for
  Aggressive, and never faster than Tight unless the user chose faster).
- Learned hours: when a site's confirmed changes cluster in certain local hours, checks in those
  hours run up to twice as often.
- Site penalty (after blocks) and backoff always win. Pinning a watch to a widget never changes how
  often it's checked; the widget setup screen says so and offers a one-tap fix.

**Scheduling mechanics**: every watch has `nextCheckAt`. One unique WorkManager job ("tick") wakes
at the earliest `nextCheckAt` (network-connected constraint), runs everything due in the next
minute (grouped by host), then re-enqueues itself for the next earliest time. A periodic 15-minute
watchdog job re-creates the tick if the chain ever breaks, and `BootReceiver` re-creates it after a
reboot or app update. Sprint runs in `SprintService` (foreground, type `dataSync`) and loops on its
own.

## Reading the value

`core/extract` reads HTML the same way whether it came from a plain download or from the WebView
(the WebView serialises its DOM after adding hints: `data-tm-strike`, `data-tm-hidden`,
`data-tm-fs`, `data-tm-top`). In order:

1. Site adapter selectors (data files in `assets/adapters/*.json`).
2. Structured data: JSON-LD `Product` / `Offer` / `AggregateOffer` (lowPrice), microdata
   `itemprop=price`, availability (`schema.org/InStock`, `OutOfStock`, `PreOrder`, …).
3. Meta tags: `product:price:amount`, `og:price:amount`, `…:currency`, `product:availability`.
4. The chosen element (fingerprint: stable attributes, stable CSS path, index path verified by
   the text's shape).
5. A text pattern (regex with one capture group).
6. The currency heuristic: every amount on the page is scored; crossed-out prices (`<del>`, `<s>`,
   `<strike>`, `line-through`), "was"/"list price"/"RRP"/"save", per-unit prices ("/kg", "per
   100 g"), instalments ("4 × $25"), shipping, and anything inside related-products,
   recommendations, carousels, headers, footers and navigation are ignored; larger, higher, more
   central amounts near the title and the buy button win.

Stock is read from structured availability, then adapter stock selectors, then buy-button and
status text ("Add to cart" vs "Sold out", "Out of stock", "Notify me", "Currently unavailable"),
honouring a chosen variant ("UK 10").

## Self-healing

When the chosen element disappears, the extractor searches near where it used to be (same label or
anchor neighbourhood, similar tag and attributes, similar position) for text of the same kind.

- Exactly one strong candidate → remember it (`HealState`). If the next check finds the same
  candidate with a consistent value, adopt it, keep checking, and quietly tell the user: "Layout
  changed; re-found the price, tap to verify."
- Zero or several candidates → the watch is **broken**, never "unchanged". Tapping it opens the
  picker with the old snapshot side by side.

## The rule that prevents false alerts

**No alert fires on a single reading.** When a value changes:

1. **Sanity check**, rejecting: values at or below zero; drops over 80% (against the last
   confirmed value, or the 30-day median); a currency different from the last reading or the
   watch's currency; pages that suddenly look empty (visible text under 25% of normal, or under 200
   characters); bot walls; a price read from a page that says the item is unavailable.
2. **Immediately re-check** the winning source with a stronger method (one rung up; at FULL, FULL
   again after a short pause).
3. **Notify only if both readings agree** (numbers within 0.5% or 0.01; same currency; same stock
   state; same text hash). Both readings are attached to the alert and to the check log as proof.

Also:
- Stock changes must hold across two checks (the re-check is the second).
- The same alert can't repeat within 30 minutes (key = kind + value).
- Crossing conditions ("below $X", "number below", "above", "in stock") fire once on crossing and
  re-arm only after the level turns false again (price back above $X).
- Only confirmed readings enter history; baselines (last, 7-day median — the default — 30-day
  median, all-time low) use confirmed history only.

## Conditions

A watch reads one primitive — a number (price), text, a yes/no state (stock), or a set of items —
and has at most two clauses joined by *and* / *or*, written as a sentence:

- price drops (against a chosen baseline), drops below $X, drops by N% or $N, hits an all-time low
- back in stock (a specific variant when chosen)
- new listings matching a search (alerts only on the new items)
- any change to a chosen element; a keyword appears or disappears
- a generic number crosses a threshold ("3 left", ticket counts)

Multi-store watches take the cheapest in-stock source; the alert names the winning store.

## When a site blocks

Don't fight it. The watch goes to "needs attention", one silent notification is posted, and tapping
it opens the page in the in-app browser. After the user clears the check or logs in, the session is
saved (it's the same cookie jar), "Resume checks" re-arms the watch, and the site's frequency drops
one profile step. No CAPTCHA solving, no proxy rotation, no fingerprint spoofing — ever.

## Flights

The Google Flights search URL is rebuilt from saved fields (route, dates, cabin, stops, adults) on
every check; a stale URL is never replayed. Prices are read from the rendered page by anchoring on
visible text (class names change). Flexible windows check each date in the window (spaced by the
site gap) and keep the cheapest date; the Fare strip widget shows the 7-day bars. Optional: a fare
API key (Duffel, Amadeus, Kiwi) as a faster, more reliable path, and Google's own price-alert
emails via notification access, used only as a hint to check now (never an alert by itself).

## Recipes

A recipe is a recorded list of steps replayed before reading the value: open page, wait for, click,
type, select, set date, scroll, dismiss (optional), assert (guardrail), extract. Values can be
fixed, asked once, a secret, or a date expression recalculated on every run ("today + 30").

- Targets by accessible role and name first, then visible text, then label, then CSS path, then
  position. Never auto-generated class names. A fragility score warns before a recipe breaks.
- **Abort means abort.** If any step fails, the page is not read. A half-finished recipe is the
  likeliest source of a wrong number.
- Repair one failed step at a time, with a screenshot of the failure.
- **Promotion**: while recording, the page's own fetch/XHR responses are captured; if the tracked
  value appears in one, the app offers to check that request directly (an API tap), keeping the
  recipe as a backup re-verified monthly.
- **Logins** are separate session recipes tied to a site, run only when the app detects it was
  logged out. Two failed logins stop them; two-factor prompts go to the user in the browser.

**Safety, enforced before any recipe can run on a schedule:**
- Every clicked button is scanned for buy, checkout, pay, place order, book, bid, delete, submit,
  add to cart (and translations). A match blocks saving; overriding requires typing "understood",
  and the override is shown on the watch permanently.
- A run that lands on a cart, checkout or payment URL aborts.
- Secrets live in the Android Keystore-backed store and never appear in logs, snapshots or exports.
- Recipes use the full browser and have a 15-minute minimum interval.

## Health

Each watch has a 0–100 health score from its last 20 checks: successes count fully, 304s count as
successes, transient errors cost 5, blocks cost 25, broken costs everything. Health is shown by the
status shape and in detail; the list can sort by it.

## Retention

- Check log: 30 days, except entries linked to an alert (kept forever, like the chart marks).
- Snapshots: the 20 newest per source, plus any referenced by an alert.
- Confirmed readings: forever (they're small), unless the user deletes the watch.

## Measuring

- Confirmed change to notification under 3 s (under 1 s in Sprint): the notification is built when
  the change is confirmed and posted immediately.
- Battery target: 100 watches on Normal under 2% per day. Measure with
  `adb shell dumpsys batterystats --charged app.tidemark` after a day off the charger and record the
  figure in PROGRESS.md.
