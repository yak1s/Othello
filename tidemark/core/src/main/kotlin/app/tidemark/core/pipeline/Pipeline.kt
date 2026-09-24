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
    /**
     * The source replays a recipe. PLAIN and LIGHT are skipped (see [LadderState.skip]); API is used when the
     * recipe was promoted to a tap; FULL runs the recipe.
     */
    val hasRecipe: Boolean = false,
    /** Rolling average of visible text length on good reads (for the "page suddenly looks empty" check). */
    val typicalTextLength: Int? = null,
    /** Consecutive sanity rejections of this source, and the last rejected reading (see [WatchDecision.NeedsReview]). */
    val rejectStreak: Int = 0,
    val lastRejected: Reading? = null,
    /** Consecutive NothingFound / RECIPE_ABORTED / 404 reads, for "broken after two". */
    val failureStreak: Int = 0,
)

enum class FetchPurpose { FIRST, CONFIRM, STEP_DOWN_PROBE }

/**
 * Why a fetch failed. Only NETWORK, TIMEOUT, HTTP 5xx and (as a Read) NothingFound count toward
 * [LadderPolicy.onFailure] and health; ROBOTS, POLICY_DEFERRED and CHECKER_CRASHED never step the ladder.
 */
enum class FailureKind {
    NETWORK, TIMEOUT, HTTP, ROBOTS, CHECKER_CRASHED, RECIPE_ABORTED, POLICY_DEFERRED,
    /** Logged out and no working login recipe (or it failed twice / needs two-factor). Needs the user. */
    LOGIN_REQUIRED,
    /** A recipe run landed on a cart/checkout/payment page. Never retried: Broken. */
    TRANSACTIONAL,
    /** A recipe step resolved to a buy/book/submit element not overridden by the user. Never retried: Broken. */
    UNSAFE,
    OTHER,
}

/** Everything about one fetch that the engine persists but the decision doesn't need. */
data class FetchMeta(
    val url: String? = null,
    val etag: String? = null,
    val lastModified: String? = null,
    val durationMs: Long = 0,
    val bytes: Long = 0,
    val visibleTextLength: Int? = null,
    val snapshotPath: String? = null,
    val screenshotPath: String? = null,
    val failedStepIndex: Int? = null,
    val recipeDegradedSteps: List<Int> = emptyList(),
    val httpStatus: Int? = null,
)

/** One date of a flexible flight window. */
data class FareDate(val date: String, val amount: Double?, val currency: String?)

/**
 * The checker's reply, as the pipeline sees it. CheckOutcome → FetchOutcome (ENGINE.md has the table):
 * READ → Read(Found); ELEMENT_MISSING → Read(ElementMissing); NOTHING_FOUND → Read(NothingFound);
 * NOT_MODIFIED → NotModified; BLOCKED → Blocked; LOGIN_REQUIRED → Failed(LOGIN_REQUIRED);
 * ROBOTS_DISALLOWED → Failed(ROBOTS); RECIPE_ABORTED → Failed(RECIPE_ABORTED); TRANSACTIONAL_URL →
 * Failed(TRANSACTIONAL); UNSAFE_TARGET → Failed(UNSAFE); HTTP_ERROR → Failed(HTTP);
 * NETWORK_ERROR → Failed(NETWORK); TIMEOUT → Failed(TIMEOUT); INTERNAL_ERROR → Failed(CHECKER_CRASHED).
 */
sealed interface FetchOutcome {
    val method: FetchMethod
    val meta: FetchMeta

    data class Read(
        override val method: FetchMethod,
        val result: ExtractionResult,
        override val meta: FetchMeta = FetchMeta(),
        /** FLIGHT with a flexible window: every date that was checked; the Found reading is the cheapest. */
        val fareDates: List<FareDate> = emptyList(),
    ) : FetchOutcome

    /** 304 / ETag match: a free "unchanged". CONFIRM and probe fetches never send validators. */
    data class NotModified(override val method: FetchMethod, override val meta: FetchMeta = FetchMeta()) : FetchOutcome

    /** The site asked for a human (bot wall, captcha, access denied). Never retried inside a run. */
    data class Blocked(
        override val method: FetchMethod,
        val signal: String,
        /** An interactive captcha/challenge (needs the user at any rung). */
        val interactive: Boolean = false,
        override val meta: FetchMeta = FetchMeta(),
    ) : FetchOutcome

    data class Failed(
        override val method: FetchMethod,
        val kind: FailureKind,
        val message: String,
        val httpStatus: Int? = null,
        val retryAfterSeconds: Long? = null,
        override val meta: FetchMeta = FetchMeta(),
    ) : FetchOutcome
}

/**
 * Supplied by the app: sends a request to the checker process and waits for the outcome.
 * For CONFIRM, [first] is the reading being confirmed (flexible flights re-check only `first.date`).
 */
fun interface SourceFetcher {
    suspend fun fetch(source: SourceInput, method: FetchMethod, purpose: FetchPurpose, first: Reading?): FetchOutcome
}

data class PipelineInput(
    val watchId: Long,
    val rule: Rule,
    val kind: ValueKind,
    /** The watch's currency (first source's, or the spec's); only sources in it compete for "cheapest". */
    val currency: String?,
    val sources: List<SourceInput>,
    val stats: HistoryStats,
    val arm: ArmState,
    /** Last confirmed watch-level reading (for multi-store: the aggregate). Null before the first reading. */
    val previousWatchReading: Reading?,
    val knownItemIds: Set<String>,
    val lastAlertAt: Long?,
    val lastAlertKey: String?,
    val reason: CheckReason,
    val now: Long,
)

enum class SourceHealth { OK, UNCHANGED, HEALING, BROKEN, BLOCKED, ERROR, NEEDS_REVIEW }

/** What to persist on a source row after this run. Null fields mean "keep what's stored". */
data class SourceUpdate(
    val sourceId: Long,
    val ladder: LadderState,
    val health: SourceHealth,
    /** Latest confirmed reading of this source (including an unchanged one that agreed), if any this run. */
    val confirmedReading: Reading?,
    val heal: HealState?,
    /** Set when self-healing adopted a new element: replace the source's spec.element with this. */
    val adoptedElement: ElementFingerprint? = null,
    val retryAfterSeconds: Long? = null,
    val blockedSignal: String? = null,
    val etag: String? = null,
    val lastModified: String? = null,
    val typicalTextLength: Int? = null,
    val rejectStreak: Int = 0,
    val lastRejected: Reading? = null,
    val rejectedReason: String? = null,
    val failureStreak: Int = 0,
    /** The last successful read's snapshot, kept for re-picking a broken watch side by side. */
    val lastGoodSnapshotPath: String? = null,
)

/** One line of the visible check log. */
data class LogEntry(
    val sourceId: Long,
    val at: Long,
    val method: FetchMethod,
    val purpose: FetchPurpose,
    /**
     * Plain sentence: "Read 179.00 USD from structured data (page download)", "Not modified (304)",
     * "Blocked: cloudflare. Needs you". The watch-level verdict is the last entry, starting "Decision: ".
     */
    val summary: String,
    val reading: Reading? = null,
    val ok: Boolean,
    val meta: FetchMeta = FetchMeta(),
)

sealed interface WatchDecision {
    /** Nothing moved (or a free 304). */
    data object NoChange : WatchDecision

    /** A confirmed change the rule doesn't alert on (price rose, still out of stock, first reading). Stored, no alert. */
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

    /**
     * The same "implausible" value was rejected three checks in a row (a real 85% clearance, a currency
     * switch). Never silent: the user is asked "Reads $20 now (was $249). Looks right?".
     */
    data class NeedsReview(val sourceId: Long, val reading: Reading, val reason: String) : WatchDecision

    /** Re-check disagreed with the first reading. Nothing stored as confirmed; try again next time. */
    data class Unconfirmed(val first: Reading, val second: Reading?) : WatchDecision

    /** Layout changed; a single candidate was seen once and needs one more matching check. */
    data class Healing(val sourceId: Long) : WatchDecision

    /** Layout changed and the value was re-found over two checks: adopt quietly and ask to verify. */
    data class Healed(val sourceId: Long, val element: ElementFingerprint, val reading: Reading) : WatchDecision

    /** The value can't be read. Never reported as "unchanged". */
    data class Broken(val sourceId: Long, val reason: String) : WatchDecision

    /** A site asked for a human (bot wall at a browser rung, captcha, login needed, robots). */
    data class NeedsAttention(val sourceId: Long, val signal: String) : WatchDecision

    /** Network trouble, timeouts, backoff, or deferred by network/battery rules. Retry on schedule. */
    data class TransientError(val message: String, val retryAfterSeconds: Long? = null, val deferred: Boolean = false) : WatchDecision
}

data class PipelineResult(
    val decision: WatchDecision,
    /**
     * Watch-level reading confirmed this run, including an unchanged reading that agreed with the previous one.
     * Null only for 304s, failures, rejections and disagreements.
     */
    val confirmedReading: Reading?,
    /** Source whose value is the watch value (cheapest across stores). */
    val winningSourceId: Long?,
    val arm: ArmState,
    val sourceUpdates: List<SourceUpdate>,
    val log: List<LogEntry>,
    val newItems: List<ListingItem> = emptyList(),
    /** Per-date fares of a flexible flight window checked this run. */
    val fareDates: List<FareDate> = emptyList(),
)

/**
 * The whole "no alert fires on a single reading" flow, pure and testable:
 *  1. For each source (one at a time), fetch with the source's current rung. A bot wall at API/PLAIN
 *     saves a step-up to LIGHT for the next check (no retry now, no notification); a bot wall at
 *     LIGHT/FULL, an interactive captcha, a login wall or robots → NeedsAttention. Two failures step up.
 *     After sustained success, occasionally probe one rung down.
 *  2. Extract; element missing → self-heal (exactly one strong candidate, seen on two checks) or Broken.
 *  3. Aggregate sources (cheapest in-stock in the watch currency wins; names the store).
 *  4. If the value changed: sanity check → immediately re-check the winning source with a stronger
 *     method → both agree → evaluate the rule → Alert (with both readings) or ChangedQuietly.
 *     Stock changes must hold across two checks (the re-check is the second).
 *  5. Dedupe identical alerts inside 30 minutes.
 *
 * Decision precedence when sources disagree: if at least one source produced a usable reading, the
 * aggregate's decision wins (Alert > Healed > ChangedQuietly > DuplicateSuppressed > NeedsReview >
 * Unconfirmed > Rejected > NoChange) and per-source problems go only into [PipelineResult.sourceUpdates];
 * otherwise the most severe problem: NeedsAttention > Broken > NeedsReview > Healing > TransientError.
 */
class CheckPipeline(private val fetcher: SourceFetcher) {
    suspend fun run(input: PipelineInput): PipelineResult = TODO("pipeline package")
}

/** The fetch ladder rules. Every function honours floor, ceiling and [LadderState.skip]. */
object LadderPolicy {
    const val FAILURES_BEFORE_STEP_UP = 2
    const val SUCCESSES_BEFORE_PROBE = 20
    const val PROBE_EVERY_MILLIS = 3 * 24 * 60 * 60_000L

    /**
     * The starting ladder for a new source: API_JSON = API only; FEED = PLAIN only; FLIGHT = FULL only
     * (API only with a fare key); a recipe = FULL (plus API when promoted, skipping PLAIN/LIGHT);
     * PAGE/SEARCH = [start] within PLAIN..FULL (API floor when an adapter tap exists).
     */
    fun initial(kind: SourceKind, start: FetchMethod, hasApiTap: Boolean, hasRecipe: Boolean, hasFareKey: Boolean): LadderState =
        TODO("pipeline package")

    /** State after a successful read at [method]. */
    fun onSuccess(state: LadderState, method: FetchMethod): LadderState = TODO("pipeline package")

    /** State after a failure; steps up after [FAILURES_BEFORE_STEP_UP], immediately on a bot wall at API/PLAIN. */
    fun onFailure(state: LadderState, method: FetchMethod, botWall: Boolean): LadderState = TODO("pipeline package")

    /** Should this run probe one rung down (after sustained success, at most every [PROBE_EVERY_MILLIS])? */
    fun shouldProbeStepDown(state: LadderState, now: Long): Boolean = TODO("pipeline package")

    /** After a probe: move down if the weaker rung read the same value, else stay. */
    fun onProbeResult(state: LadderState, matched: Boolean, now: Long): LadderState = TODO("pipeline package")

    /** The method to confirm a change with: one allowed rung stronger, or the same rung (FULL) after a pause. */
    fun confirmMethod(state: LadderState, usedMethod: FetchMethod): FetchMethod = TODO("pipeline package")
}

/**
 * Cheapest across stores. Only sources in [currency] compete (others are excluded from "cheapest");
 * in-stock sources win over out-of-stock ones; ties go to the lower source id.
 */
object Aggregator {
    data class Aggregate(val reading: Reading, val sourceId: Long, val storeName: String)

    fun aggregate(kind: ValueKind, currency: String?, readings: List<Pair<SourceInput, Reading>>): Aggregate? = TODO("pipeline package")
}
