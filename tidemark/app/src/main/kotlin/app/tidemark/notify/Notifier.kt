package app.tidemark.notify

import android.app.Notification
import android.content.Context
import app.tidemark.AppContainer

/** State of a running sprint, for its ongoing notification. */
data class SprintUi(
    val watchId: Long,
    val watchName: String,
    val startedAt: Long,
    val endsAt: Long,
    val checks: Int,
    val lastValueText: String?,
)

/**
 * Everything the app posts. Never notifies about its own housekeeping.
 *
 * Typography: alerts use DecoratedCustomViewStyle with a custom content view (the value title in
 * archivo_expanded_medium, text in archivo_regular, digits tabular) plus standard contentTitle/contentText
 * for the lock screen, accessibility and wearables. Sprint uses the standard template with ProgressStyle so
 * it can be promoted to a Live Update (custom views can't be). The shade board uses the widget package's
 * Board row layout (widget.BoardRows).
 */
class Notifier(private val context: Context, private val container: AppContainer) {
    /** Channels: Price drops & restocks, Urgent watches, Needs attention, Sprint, Daily digest. */
    fun ensureChannels(): Unit = TODO("notify package")

    fun canPost(): Boolean = TODO("notify package")

    /** Post a confirmed alert (built from the stored AlertEntity). Quiet hours hold it for the digest unless urgent. */
    suspend fun onAlert(alertId: Long): Unit = TODO("notify package")

    /**
     * A site asked for a human, the watch broke, or a value needs review. Silent, once per episode. The engine
     * inserts the AlertEntity (kind NEEDS_ATTENTION) first so it also lands in the Activity tab.
     */
    suspend fun onNeedsAttention(alertId: Long): Unit = TODO("notify package")

    /** "Layout changed; re-found the price, tap to verify". Silent. AlertEntity kind LAYOUT_HEALED. */
    suspend fun onHealed(alertId: Long): Unit = TODO("notify package")

    /** Quiet hours ended: deliver held alerts as one digest. */
    suspend fun deliverHeld(): Unit = TODO("notify package")

    /** Daily digest (minimal channel), if enabled. */
    suspend fun postDailyDigest(): Unit = TODO("notify package")

    fun sprintNotification(state: SprintUi): Notification = TODO("notify package")
    fun updateSprint(state: SprintUi): Unit = TODO("notify package")
    /** Closing summary; the engine inserts the AlertEntity (kind SPRINT_SUMMARY) first. */
    suspend fun postSprintSummary(alertId: Long): Unit = TODO("notify package")

    fun cancelForWatch(watchId: Long): Unit = TODO("notify package")

    /** Optional permanent "shade board" notification for one collection. */
    suspend fun refreshShadeBoard(): Unit = TODO("notify package")

    /** A check finished and watch rows changed: refresh the shade board if it's on. Cheap; call after every check. */
    fun onWatchesChanged(): Unit = TODO("notify package")

    /** Settings changed (quiet hours, digest, shade board): reschedule the quiet-hours-end and digest jobs. */
    fun onSettingsChanged(): Unit = TODO("notify package")

    companion object {
        const val SPRINT_NOTIFICATION_ID = 7001
    }
}
