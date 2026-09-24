package app.tidemark

import android.content.Context
import app.tidemark.core.adapters.AdapterRegistry
import app.tidemark.core.util.Clock
import app.tidemark.data.AdapterLoader
import app.tidemark.data.ExportImport
import app.tidemark.data.SecretStore
import app.tidemark.data.SettingsStore
import app.tidemark.data.Snapshots
import app.tidemark.data.WatchRepository
import app.tidemark.data.db.TidemarkDatabase
import app.tidemark.engine.Engine
import app.tidemark.ipc.CheckerClient
import app.tidemark.notify.Notifier
import app.tidemark.widget.WidgetUpdater
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Manual dependency wiring for the main process. Everything is lazy so cold start stays fast. */
class AppContainer(val context: Context) {
    val clock: Clock = Clock.System

    /** Lives as long as the process. For work that must outlive a screen (check now, self-test kick-off). */
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val db: TidemarkDatabase by lazy { TidemarkDatabase.create(context) }
    val settings: SettingsStore by lazy { SettingsStore(context) }
    val secrets: SecretStore by lazy { SecretStore(db.secrets()) }
    val snapshots: Snapshots by lazy { Snapshots(context) }
    val adapters: AdapterRegistry by lazy { AdapterLoader.load(context) }
    val watches: WatchRepository by lazy { WatchRepository(db, clock, secrets, settings) }
    val exportImport: ExportImport by lazy { ExportImport(db, clock) }
    val checker: CheckerClient by lazy { CheckerClient(context) }
    val notifier: Notifier by lazy { Notifier(context, this) }
    val widgets: WidgetUpdater by lazy { WidgetUpdater(context, this) }
    val engine: Engine by lazy { Engine(context, this) }

    /** Called from Application.onCreate in the main process. Keep it cheap. */
    fun onAppStart() {
        notifier.ensureChannels()
        engine.onAppStart()
        widgets.onAppStart()
    }
}
