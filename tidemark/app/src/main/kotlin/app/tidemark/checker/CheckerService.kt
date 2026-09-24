package app.tidemark.checker

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * Runs in the `:checker` process (see the manifest). Receives [app.tidemark.ipc.CheckRequest] and
 * [app.tidemark.ipc.PreviewRequest] messages, fetches with OkHttp (sharing the WebView cookie jar) or
 * a WebView, extracts with core, and replies with results. All WebView use happens on this process's
 * main thread.
 */
class CheckerService : Service() {
    override fun onBind(intent: Intent?): IBinder? = TODO("checker package")
}
