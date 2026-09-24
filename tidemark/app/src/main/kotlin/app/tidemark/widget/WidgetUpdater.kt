package app.tidemark.widget

import android.content.Context
import app.tidemark.AppContainer

/**
 * Widgets never fetch or schedule anything themselves. They re-render when a check finishes, and
 * not while the screen is off (changes are marked dirty and flushed when the screen turns on).
 */
class WidgetUpdater(private val context: Context, private val container: AppContainer) {
    /** Register the screen-on receiver (main process lifetime). */
    fun onAppStart(): Unit = TODO("widget package")

    /** Re-render every widget that shows any of [watchIds]. Debounced; aim for < 2 s after a check. */
    fun onWatchesChanged(watchIds: Collection<Long>): Unit = TODO("widget package")

    fun refreshAll(): Unit = TODO("widget package")
}
