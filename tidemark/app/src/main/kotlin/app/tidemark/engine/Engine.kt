package app.tidemark.engine

import android.content.Context
import app.tidemark.AppContainer
import app.tidemark.core.model.CheckReason
import app.tidemark.core.pipeline.WatchDecision
import kotlinx.coroutines.flow.StateFlow

/**
 * The checking engine's front door (main process). Wires core's CheckPipeline to the database, the
 * checker process, notifications and widgets; owns scheduling (WorkManager), Sprint and self-tests.
 */
class Engine(private val context: Context, private val container: AppContainer) {
    /** Watch ids with a check in flight (the list shows a thin progress line in those rows). */
    val checking: StateFlow<Set<Long>> get() = TODO("engine package")

    /** Ensure the scheduling chain exists (idempotent). Called on app start, boot and app update. */
    fun onAppStart(): Unit = TODO("engine package")

    /** Swipe right / "Check now": runs outside any screen's lifetime. */
    fun checkNow(watchId: Long): Unit = TODO("engine package")

    /** Run one check and wait for the decision (used by self-test, sprint and tests). */
    suspend fun runCheck(watchId: Long, reason: CheckReason): WatchDecision? = TODO("engine package")

    /** Recompute the next wake-up after watches changed (added, edited, snoozed, resumed). */
    fun reschedule(): Unit = TODO("engine package")

    /** Sprint: 20-60 s checks for [minutes] (default 20, max 120), with a live countdown notification. */
    fun startSprint(watchId: Long, minutes: Int): Unit = TODO("engine package")
    fun stopSprint(watchId: Long): Unit = TODO("engine package")

    /** After saving: three checks over 90 seconds, then a solid status or "couldn't read this reliably". */
    fun startSelfTest(watchId: Long): Unit = TODO("engine package")

    /** The user cleared a block in the browser: lower the site's frequency one step and check again. */
    suspend fun resumeAfterBlock(sourceId: Long): Unit = TODO("engine package")
}
