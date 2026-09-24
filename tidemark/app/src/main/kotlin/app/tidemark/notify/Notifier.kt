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

/** Everything the app posts. Never notifies about its own housekeeping. */
class Notifier(private val context: Context, private val container: AppContainer) {
    /** Channels: Price drops & restocks, Urgent watches, Needs attention, Sprint, Daily digest. */
    fun ensureChannels(): Unit = TODO("notify package")

    fun canPost(): Boolean = TODO("notify package")

    /** Post a confirmed alert (built from the stored AlertEntity). Quiet hours hold it for the digest unless urgent. */
    suspend fun onAlert(alertId: Long): Unit = TODO("notify package")

    /** A site asked for a human, or the watch broke. Silent, once per episode. */
    suspend fun onNeedsAttention(watchId: Long, sourceId: Long?, reason: String): Unit = TODO("notify package")

    /** "Layout changed; re-found the price, tap to verify". Silent. */
    suspend fun onHealed(watchId: Long): Unit = TODO("notify package")

    /** Quiet hours ended: deliver held alerts as one digest. */
    suspend fun deliverHeld(): Unit = TODO("notify package")

    /** Daily digest (minimal channel), if enabled. */
    suspend fun postDailyDigest(): Unit = TODO("notify package")

    fun sprintNotification(state: SprintUi): Notification = TODO("notify package")
    fun updateSprint(state: SprintUi): Unit = TODO("notify package")
    suspend fun postSprintSummary(watchId: Long, checks: Int, summary: String): Unit = TODO("notify package")

    fun cancelForWatch(watchId: Long): Unit = TODO("notify package")

    /** Optional permanent "shade board" notification for one collection. */
    suspend fun refreshShadeBoard(): Unit = TODO("notify package")

    companion object {
        const val SPRINT_NOTIFICATION_ID = 7001
    }
}
