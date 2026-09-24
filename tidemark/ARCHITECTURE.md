# Tidemark architecture

The map of the code: modules, processes, packages, and who owns what. Read with `ENGINE.md`
(behaviour) and `DESIGN.md` (look). The product spec is `docs/SPEC.md`.

## Toolchain

| Piece | Version |
|---|---|
| Android Gradle Plugin | 9.4.1 (built-in Kotlin: no `kotlin-android` plugin) |
| Gradle | 9.8.0 (wrapper) |
| Kotlin / Compose compiler | 2.4.20 |
| KSP | 2.3.12 |
| compileSdk / targetSdk / minSdk | 37 / 36 / 29 |
| Compose BOM | 2026.09.00 |
| Room / WorkManager / DataStore | 2.8.5 / 2.12.0 / 1.2.1 |
| OkHttp / jsoup / kotlinx.serialization | 5.5.0 / 1.23.2 / 1.11.0 |

## Modules

- **`:core`** — pure Kotlin (JVM). The engine's brains: the data model, extraction (jsoup), rules and
  baselines, the confirmation pipeline, scheduling maths, robots.txt, recipes' safety and
  sentences, flights, site adapters, formatting. No Android imports, fully unit-tested.
- **`:app`** — the Android app. Two processes (see `ENGINE.md`): the main process (UI, Room,
  WorkManager, notifications, widgets) and `:checker` (all fetching and every WebView).

## Package map

```
core/src/main/kotlin/app/tidemark/core/
  model/       Reading, Condition/Rule, ExtractionSpec, Recipe, FlightQuery, SiteAdapter, ... (shared contract)
  extract/     HtmlExtractor, JsonExtractor, FeedExtractor, MoneyParser, BotWallDetector, Fingerprints, SelfHealer
  rules/       Stats, RuleEvaluator, SanityCheck, Agreement
  pipeline/    CheckPipeline, LadderPolicy, Aggregator
  schedule/    Jitter, Planner (adaptive), Backoff, RunPolicy, SprintPolicy, Politeness
  robots/      RobotsTxt
  recipe/      SafetyInterlock, UrlGuard, DateExpr, ValueResolver, StepSentences, Fragility, PromotionFinder
  flights/     GoogleFlightsUrl, FlexWindow, FareTextReader, FareApis, FlightEmailHints
  adapters/    AdapterRegistry, UrlCanon   (data files live in app/src/main/assets/adapters/)
  format/      ValueFormat, RuleSentences, Spoken, AlertCopy
  util/        Clock, median, hostOf, storeLabel

app/src/main/kotlin/app/tidemark/
  TidemarkApp, AppContainer, IntentKeys          (shared contract)
  data/db/     Entities, Daos, Converters, TidemarkDatabase   (shared contract)
  data/        SettingsStore, SecretStore, Snapshots, AdapterLoader, WatchRepository, ExportImport
  ipc/         Protocol (shared contract), CheckerClient
  checker/     CheckerService, fetchers, WebView runner, cookie bridge, robots cache      [:checker]
  browser/     BrowserActivity (browse, picker, recorder, replay, repair, resolve block)  [:checker]
  engine/      Engine, CheckCoordinator, workers, SprintService, BootReceiver, EmailHintListener
  notify/      Notifier, channels, NotificationActionReceiver
  tile/        AlertsTileService
  widget/      Board, Single, Stock light, Fare strip providers; WidgetConfigActivity; WidgetUpdater
  ui/theme     Tokens, fonts, TidemarkTheme
  ui/components  WatchRow, StatusShape, pills, charts, sheets, RuleEditor, icons
  ui/watches, ui/detail, ui/activity             main screens
  ui/add, ui/onboarding, ui/settings, ui/bulk, ui/sprint, ui/nav, ui/MainActivity
```

## Data flow of one check

```
TickWorker (main) ── due watches, grouped by host ──► Engine.CheckCoordinator
   │  builds core PipelineInput from Room rows; SourceFetcher = CheckerClient
   ▼
core CheckPipeline ── fetch(source, method) ──► CheckerClient ══ Messenger ══► CheckerService (:checker)
   │                                                              OkHttp (+WebView cookies) / WebView
   │                                                              core Extractor on the HTML/JSON
   │◄───────────────────────────── CheckResult (reading, signals, snapshot path) ◄──┘
   │  sanity → confirm with stronger method → agree → RuleEvaluator
   ▼
PipelineResult ──► Room (readings, sources, check_log, alerts, watch row)
               ──► Notifier.onAlert (posted immediately)   ──► WidgetUpdater (skipped while screen off)
               ──► Planner.next → nextCheckAt → TickWorker re-enqueued at the earliest due time
```

## Ownership rules (for everyone changing code)

- The shared contract files are frozen: `core/model/*`, the public signatures in every
  `core/**` stub, `data/db/Entities.kt`, `data/db/Daos.kt`, `data/db/Converters.kt`,
  `data/db/TidemarkDatabase.kt`, `ipc/Protocol.kt`, `browser/BrowserContracts.kt`,
  `checker/RecipeRunner.kt` (signature), `AppContainer.kt`, `TidemarkApp.kt`, `IntentKeys.kt`,
  `AndroidManifest.xml`, `res/values/colors.xml`, `res/values/strings.xml`.
  Adding a *new* public function or class next to them is fine; changing or removing one is not.
- Each package keeps its extra SQL in its own DAO (`data/DataExtraDao`, `engine/EngineDao`,
  `notify/NotifyDao`, `widget/WidgetQueriesDao`, `ui/ScreensDao`, `ui/AppUiDao`) and its strings in
  its own `res/values/strings_<package>.xml`.
- The main process never touches `WebView`. The checker process never touches `AppContainer`,
  Room, WorkManager or notifications.
- Everything user-visible follows `DESIGN.md`; everything behavioural follows `ENGINE.md`.

## Verifying

- `:core`: `./gradlew :core:test` (in Android Studio: Gradle panel ▸ core ▸ verification ▸ test).
- App: `./gradlew :app:assembleDebug :app:testDebugUnitTest`.
- CI (`.github/workflows/tidemark-android.yml`) builds the debug APK, runs all unit tests, and
  uploads the APK as an artifact on every push that touches `tidemark/`.
