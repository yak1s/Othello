package app.tidemark.checker

import android.app.Application
import android.webkit.WebView
import app.tidemark.core.adapters.AdapterRegistry
import app.tidemark.core.model.FetchMethod
import okhttp3.OkHttpClient

/**
 * Shared state of the `:checker` process, so background checks and the in-app browser present one
 * consistent identity per site: one OkHttp client whose cookie jar is the WebView's CookieManager, one
 * user agent (the device's WebView UA), one per-host gate, one WebView configuration. Initialised from
 * TidemarkApp.onCreate in the checker process. Implemented by the checker package; the browser package uses it.
 */
object CheckerRuntime {
    fun init(app: Application): Unit = TODO("checker package")

    val okHttp: OkHttpClient get() = TODO("checker package")
    val userAgent: String get() = TODO("checker package")
    val adapters: AdapterRegistry get() = TODO("checker package")

    /** One request at a time per host, with a minimum gap. Shared by checks and previews. */
    suspend fun <T> withHost(host: String, minGapMillis: Long, block: suspend () -> T): T = TODO("checker package")

    /** Apply Tidemark's WebView settings (JS, DOM storage, default UA, third-party cookies, LIGHT blocking). */
    fun configure(webView: WebView, method: FetchMethod): Unit = TODO("checker package")

    /** Re-read site adapters (Ipc.MSG_RELOAD_ADAPTERS, or when filesDir/adapters changed). */
    fun reloadAdapters(): Unit = TODO("checker package")
}

/**
 * The checker process's WebView budget. Background LIGHT/FULL checks wait while the user is in the in-app
 * browser in an interactive mode (PICK, RECORD, REPLAY, REPAIR_STEP, RESOLVE_BLOCK), so a check can't get the
 * process killed for memory mid-login. At most [MAX_WEBVIEWS] WebViews exist at once.
 */
object WebViewBudget {
    const val MAX_WEBVIEWS = 2

    /** Called by BrowserActivity in onResume/onPause of interactive modes. */
    fun setInteractive(active: Boolean): Unit = TODO("checker package")

    /** Suspends until a background WebView may be created, then runs [block]. */
    suspend fun <T> background(block: suspend () -> T): T = TODO("checker package")
}

/** Secrets handed over with Ipc.MSG_PUT_SECRETS, kept in this process's memory for 5 minutes. */
object SecretsDrop {
    fun put(token: String, secrets: Map<String, String>): Unit = TODO("checker package")

    /** Takes (and removes) the secrets for [token]; empty when expired or unknown. */
    fun take(token: String): Map<String, String> = TODO("checker package")
}
