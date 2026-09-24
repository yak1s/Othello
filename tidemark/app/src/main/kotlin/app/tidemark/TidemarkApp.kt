package app.tidemark

import android.app.Application
import android.os.Build

/**
 * Runs in both processes. The main process builds the [AppContainer]; the `:checker` process
 * (WebView + fetching) never touches the database, WorkManager or notifications.
 */
class TidemarkApp : Application() {
    val isCheckerProcess: Boolean by lazy {
        val name = if (Build.VERSION.SDK_INT >= 28) getProcessName() else null
        name?.endsWith(":checker") == true
    }

    /** Main process only. Throws in the checker process to catch accidental use early. */
    val container: AppContainer by lazy {
        check(!isCheckerProcess) { "AppContainer is main-process only" }
        AppContainer(this)
    }

    override fun onCreate() {
        super.onCreate()
        if (isCheckerProcess) {
            app.tidemark.checker.CheckerRuntime.init(this)
            return
        }
        // The main process must never touch WebView (it would lock the shared WebView data directory and
        // crash the checker's WebViews). Make any accidental use fail fast.
        android.webkit.WebView.disableWebView()
        container.onAppStart()
    }
}

/** Shortcut for Android components in the main process. */
val android.content.Context.container: AppContainer
    get() = (applicationContext as TidemarkApp).container
