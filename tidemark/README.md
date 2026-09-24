# Tidemark

Watches things on the internet that change, and tells you the moment the change is one you care
about: a price drops, an item comes back in stock, a flight fare moves, a keyword appears. Without
being fooled, without being blocked, and without draining your battery.

- **It doesn't lie to you.** No alert fires on a single reading. Every change is sanity-checked, then
  re-read with a stronger method, and you're told only when both readings agree. Both readings are
  attached to the alert.
- **It tells you when it can't see.** A watch whose page changed layout re-finds its value or says
  it's broken. It never quietly reports "unchanged".
- **It's polite.** One request at a time per site, randomised timing, conditional requests,
  robots.txt respected, backs off when asked, and hands you the page when a site wants a human.
- **Local-first.** No account, no sign-up, no telemetry. Everything stays on the phone; export it
  all to one JSON file any time.

## Install

See **[INSTALL.md](INSTALL.md)**: a step-by-step guide from "I've never opened Android Studio" to
the app and its widgets on your phone.

## What's inside

| | |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | The product spec this app is built from |
| [`DESIGN.md`](DESIGN.md) | The locked design system: departure board, one signal colour, the numeric rail |
| [`ENGINE.md`](ENGINE.md) | How checks work: fetch ladder, politeness, confirmation before alerting, self-healing |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Modules, the two processes, packages and ownership |
| [`PROGRESS.md`](PROGRESS.md) | Phase status, decisions, gotchas, and what to test on a real phone |
| `core/` | Pure Kotlin engine (extraction, rules, confirmation pipeline, scheduling maths), unit-tested |
| `app/` | The Android app: Compose UI, Room, WorkManager, the `:checker` process, widgets, notifications |
| `tools/fonts/` | Bakes tabular figures into Archivo so numbers align everywhere |

## Building from the command line

```
./gradlew :core:test                 # engine tests (no Android SDK needed)
./gradlew :app:assembleDebug         # debug APK
./gradlew :app:assembleRelease       # optimised APK (signed with the debug key unless keystore.properties exists)
./gradlew :app:testDebugUnitTest     # app unit tests (Robolectric)
```

Requires JDK 17 or newer (Android Studio's bundled JDK 21 works) and the Android SDK (API 37).
