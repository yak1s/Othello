package app.tidemark.ipc

import android.content.Context
import kotlinx.coroutines.flow.Flow

/**
 * Main-process side of the checker link. Binds to [app.tidemark.checker.CheckerService] in the
 * `:checker` process, sends JSON requests over a Messenger and suspends until the reply.
 *
 * Never throws for checker trouble: a crashed or restarted checker process yields a
 * [CheckResult] with [CheckOutcome.INTERNAL_ERROR] and message "Checker restarted", so the UI and
 * database are never affected by a page taking the checker down.
 */
class CheckerClient(private val context: Context) {
    suspend fun check(request: CheckRequest): CheckResult = TODO("checker package")

    /** Streams preview events until the final one (or the flow is cancelled, which cancels the fetch). */
    fun preview(request: PreviewRequest): Flow<PreviewEvent> = TODO("checker package")

    /** True when the checker process answers within [timeoutMs]. */
    suspend fun ping(timeoutMs: Long = 3_000): Boolean = TODO("checker package")
}
