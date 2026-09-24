package app.tidemark.notify

import android.app.Activity
import android.os.Bundle

/**
 * Invisible trampoline for notification buttons that open a web page: acknowledges [app.tidemark.IntentKeys.EXTRA_ALERT_ID]
 * through the container, starts ACTION_VIEW on [app.tidemark.IntentKeys.EXTRA_URL], and finishes. Needed because since
 * Android 12 a notification's BroadcastReceiver may not start activities.
 */
class OpenLinkActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        TODO("notify package")
    }
}
