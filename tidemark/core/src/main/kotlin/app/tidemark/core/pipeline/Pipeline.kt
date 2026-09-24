package app.tidemark.core.pipeline

import app.tidemark.core.extract.ExtractionResult
import app.tidemark.core.model.AlertKind
import app.tidemark.core.model.ArmState
import app.tidemark.core.model.CheckReason
import app.tidemark.core.model.ElementFingerprint
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.FetchMethod
import app.tidemark.core.model.HealState
import app.tidemark.core.model.LadderState
import app.tidemark.core.model.ListingItem
import app.tidemark.core.model.Reading
import app.tidemark.core.model.Rule
import app.tidemark.core.model.SourceKind
import app.tidemark.core.model.ValueKind
import app.tidemark.core.rules.Evaluation
import app.tidemark.core.rules.HistoryStats

/** One source of a watch, as the pipeline sees it. */
data class SourceInput(
    val sourceId: Long,
    val storeName: String,
    val kind: SourceKind,
    val spec: ExtractionSpec,
    val ladder: LadderState,
    /** Last confirmed reading from this source. */
    val previous: Reading?,
    val heal: HealState? = null,
    /** Recipes force FULL; FLIGHT forces FULL unless a fare API key exists (then API). */
    val hasRecipe: Boolean = false,
    val typicalTextLength: Int? = null,
)

enum class FetchPurpose { FIRST, CONFIRM, STEP_DOWN_PROBE }

enum class FailureKind { NETWORK, TIMEOUT, HTTP, ROBOTS, CHECKER_CRASHED, RECIPE_ABORTED, POLICY_DEFERRED, OTHER }

sealed interface FetchOutcome {
    val method: FetchMethod

    data class Read(
        override val method: FetchMethod,
        val result: ExtractionResult,
        val httpStatus: Int? = null,
        val snapshotPath: String? = null,
    ) : FetchOutcome

    /** 304 / ETag match: a free "unchanged". */
    data class NotModified(override val method: FetchMethod) : FetchOutcome

    /** The site asked for a human. Never retried automatically. */
    data class Blocked(override val method: FetchMethod, val signal: String, val snapshotPath: String? = null) : FetchOutcome

    data class Failed(
        override val method: FetchMethod,
        val kind: FailureKind,
        val message: String,
        val httpStatus: Int? = null,
        val retryAfterSeconds: Long? = null,
    ) : FetchOutcome
}

/** Supplied by the app: sends a request to the checker process and waits for the outcome. */
fun interface SourceFetcher {
    suspend fun fetch(source: SourceInput, method: FetchMethod, purpose: FetchPurpose): FetchOutcome
}

data class PipelineInput(
    val watchId: Long,
    val rule: Rule,
    val kind: ValueKind,
    val sources: List<SourceInput>,
    val stats: HistoryStats,
    val arm: ArmState,
    /** Last confirmed watch-level reading (for multi-store: the aggregate). */
    val previousWatchReading: Reading?,
    val knownItemIds: Set<String>,
    val lastAlertAt: Long?,
    val lastAlertKey: String?,
    val reason: CheckReason,
    val now: Long,
)

enum class SourceHealth { OK, UNCHANGED, HEALING, BROKEN, BLOCKED, ERROR }

/** What to persist on a source row after this run. */
data class SourceUpdate(
    val sourceId: Long,
    val ladder: LadderState,
    val health: SourceHealth,
    /** Latest confirmed reading of this source, if any this run. */
    val confirmedReading: Reading?,
    val heal: HealState?,
    /** Set when self-healing adopted a new element: replace the source's spec.element with this. */
    val adoptedElement: ElementFingerprint? = null,
    val retryAfterSeconds: Long? = null,
    val blockedSignal: String? = null,
)

/** One line of the visible check log. */
data class LogEntry(
    val sourceId: Long,
    val method: FetchMethod,
    val purpose: FetchPurpose,
    /** "read 179.00 GBP from structured data", "not modified", "blocked: cloudflare challenge". */
    val summary: String,
    val reading: Reading? = null,
    val httpStatus: Int? = null,
    val snapshotPath: String? = null,
    val ok: Boolean,
)

sealed interface WatchDecision {
    /** Nothing moved (or a free 304). */
    data object NoChange : WatchDecision

    /** A confirmed change the rule doesn't alert on (price rose, still out of stock). Stored, no alert. */
    data class ChangedQuietly(val reading: Reading) : WatchDecision

    /** Confirmed by two agreeing readings and the rule fired. */
    data class Alert(
        val kind: AlertKind,
        val first: Reading,
        val confirmation: Reading,
        val winningSourceId: Long,
        val storeName: String,
        val evaluation: Evaluation,
        /** Dedupe key: same key within 30 minutes is suppressed. */
        val key: String,
    ) : WatchDecision

    /** Same alert already sent in the last 30 minutes; the reading is still stored. */
    data class DuplicateSuppressed(val reading: Reading, val key: String) : WatchDecision

    /** Sanity check failed. Nothing is stored as confirmed. */
    data class Rejected(val reason: String) : WatchDecision

    /** Re-check disagreed with the first reading. Nothing stored as confirmed; try again next time. */
    data class Unconfirmed(val first: Reading, val second: Reading?) : WatchDecision

    /** Layout changed; a single candidate was seen once and needs one more matching check. */
    data class Healing(val sourceId: Long) : WatchDecision

    /** Layout changed and the value was re-found over two checks: adopt quietly and ask to verify. */
    data class Healed(val sourceId: Long, val element: ElementFingerprint, val reading: Reading) : WatchDecision

    /** The value can't be read. Never reported as "unchanged". */
    data class Broken(val sourceId: Long, val reason: String) : WatchDecision

    /** A site asked for a human. Notify once, open the in-app browser on tap. */
    data class NeedsAttention(val sourceId: Long, val signal: String) : WatchDecision

    /** Network trouble, timeouts, backoff. Retry on schedule; health drops. */
    data class TransientError(val message: String, val retryAfterSeconds: Long? = null) : WatchDecision
}

data class PipelineResult(
    val decision: WatchDecision,
    /** Watch-level reading to store (confirmed only). */
    val confirmedReading: Reading?,
    /** Source whose value is the watch value (cheapest across stores). */
    val winningSourceId: Long?,
    val arm: ArmState,
    val sourceUpdates: List<SourceUpdate>,
    val log: List<LogEntry>,
    val newItems: List<ListingItem> = emptyList(),
)

/**
 * The whole "no alert fires on a single reading" flow, pure and testable:
 *  1. For each source (one at a time), fetch with the source's current rung; step up after two failures
 *     or a bot-wall signal; occasionally probe one rung down after sustained success.
 *  2. Extract; element missing -> self-heal (one candidate, two checks) or Broken.
 *  3. Aggregate sources (cheapest in-stock wins; names the store).
 *  4. If the value changed: sanity check -> immediately re-check the winning source with a stronger
 *     method -> both agree -> evaluate the rule -> Alert (with both readings) or ChangedQuietly.
 *     Stock changes must hold across two checks (the re-check is the second).
 *  5. Dedupe identical alerts inside 30 minutes.
 */
class CheckPipeline(private val fetcher: SourceFetcher) {
    suspend fun run(input: PipelineInput): PipelineResult = TODO("pipeline package")
}

/** The fetch ladder rules. */
object LadderPolicy {
    const val FAILURES_BEFORE_STEP_UP = 2
    const val SUCCESSES_BEFORE_PROBE = 20
    const val PROBE_EVERY_MILLIS = 3 * 24 * 60 * 60_000L

    /** State after a successful read at [method]. */
    fun onSuccess(state: LadderState, method: FetchMethod): LadderState = TODO("pipeline package")

    /** State after a failure; steps up after [FAILURES_BEFORE_STEP_UP], immediately on a bot wall. */
    fun onFailure(state: LadderState, method: FetchMethod, botWall: Boolean): LadderState = TODO("pipeline package")

    /** Should this run probe one rung down (after sustained success, at most every [PROBE_EVERY_MILLIS])? */
    fun shouldProbeStepDown(state: LadderState, now: Long): Boolean = TODO("pipeline package")

    /** After a probe: move down if the weaker rung read the same value, else stay. */
    fun onProbeResult(state: LadderState, matched: Boolean, now: Long): LadderState = TODO("pipeline package")

    /** The method to confirm a change with: one rung stronger, or the same rung (FULL) after a pause. */
    fun confirmMethod(state: LadderState, usedMethod: FetchMethod): FetchMethod = TODO("pipeline package")
}

/** Cheapest across stores. In-stock sources win over out-of-stock ones; ties go to the lower source id. */
object Aggregator {
    data class Aggregate(val reading: Reading, val sourceId: Long, val storeName: String)

    fun aggregate(kind: ValueKind, readings: List<Pair<SourceInput, Reading>>): Aggregate? = TODO("pipeline package")
}
