# Kissa

Reversi for two, or one. An offline-capable PWA with no accounts, no server, no
analytics and no third-party service that anyone has to pay for.

Three ways to play:

- **Pass & play** — one device, two people.
- **Play a friend** — two devices, connected with a four-digit PIN. The PIN is
  both the room name and the key the traffic is encrypted with, and there is a
  hand-exchange fallback for networks that block everything.
- **Play the computer** — six levels, all of them offline. They are earned one
  at a time: beating the level you are on opens the next one.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
```

The service worker only exists in a production build, so anything to do with
offline needs:

```sh
npm run build
npm run preview    # http://localhost:4173
```

## Checks

`npm run verify` runs the lot: a typecheck, the production build, the unit
tests, and three gates that are checks rather than intentions.

| Script | What it decides |
| --- | --- |
| `npm test` | 180 unit tests: the rules engine (including a 10,000-game fuzz and perft to depth 4), the search, the session state machine, the ladder, and the audio envelopes |
| `npm run test:e2e` | 24 end-to-end tests in a real browser: accessibility, offline, the audio render, the ladder, and two devices meeting on a PIN |
| `npm run check:apca` | 81 foreground/background pairs measured with APCA against the targets in `BRIEF.md` §4.3. Fails the build on any pair under its floor |
| `npm run check:copy` | The anti-slop blocklist, run over every user-facing string and every stylesheet |
| `npm run check:size` | The transfer budget: under 400 KB gzipped excluding fonts |
| `npm run audio:demo` | Renders every sound to a WAV through the app's own engine, so the sound design can be judged by ear |

Two developer pages ride along in `npm run dev` and are never in a release
build — `/dev/audio/`, a slider for every synthesis parameter with a play button
per voice, and `/dev/components/`, every component in every state. The tuner can
be built on its own with `npx vite build --mode tuner` if it needs to be looked
at away from a dev server.

## Where things are

```
src/engine/    the rules, as bigint bitboards. No UI, no DOM, no dependencies
src/ai/        the search: a second board representation tuned for speed, an
               evaluation, six levels and an opening book, all in a worker
src/audio/     synthesis. There are no audio files anywhere in the app
src/net/       the PIN, the transports, and the match state machine
src/ui/        the screens. No framework, no component library
src/data/      settings, the archive, the ladder
src/styles/    tokens first, then base, components, board, screens
scripts/       the gates above, plus the felt, icon and font generators
```

## The three documents

- **`BRIEF.md`** — the specification, verbatim, so any decision can be traced
  back to the clause it came from.
- **`DESIGN.md`** — the design law. Every value in the app comes from here.
  Its **Corrections** log is the useful part: twenty-nine entries, each one a
  place where the brief or an earlier decision was measured and found wrong,
  with the measurement that settled it.
- **`NOTES.md`** — the build log, phase by phase, including a standing list of
  what is *not* done.

## What it does not do

No accounts, no sign-in, no cloud save, no chat, no ads, no analytics, and no
telemetry of any kind. The archive of finished games lives in IndexedDB on the
device and never leaves it.
