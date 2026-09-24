package app.tidemark.core.model

import kotlinx.serialization.Serializable

/** How often to check. Base intervals in millis; the planner applies ±25% jitter and adaptive factors. */
@Serializable
enum class FrequencyProfile(val baseMillis: Long, val label: String) {
    RELAXED(6 * 60 * 60_000L, "Relaxed"),
    NORMAL(60 * 60_000L, "Normal"),
    TIGHT(15 * 60_000L, "Tight"),
    AGGRESSIVE(5 * 60_000L, "Aggressive"),
    ;

    fun slower(): FrequencyProfile = entries.getOrElse(ordinal - 1) { RELAXED }
    fun faster(): FrequencyProfile = entries.getOrElse(ordinal + 1) { AGGRESSIVE }
}

/**
 * Shown by shape, never color alone: ARMED filled square, PAUSED hollow square, SNOOZED half square,
 * BROKEN slashed square, NEEDS_ATTENTION caret.
 */
@Serializable
enum class WatchStatus { ARMED, PAUSED, SNOOZED, BROKEN, NEEDS_ATTENTION }

@Serializable
enum class SourceKind {
    /** A product or any web page. */
    PAGE,
    /** A JSON/API endpoint (API tap). */
    API_JSON,
    /** RSS or Atom feed. */
    FEED,
    /** Marketplace search results page (set of listings). */
    SEARCH,
    /** Flight route + dates, rebuilt into a search every check. */
    FLIGHT,
}

/** Why a check is running. Decides politeness exceptions and logging. */
@Serializable
enum class CheckReason { SCHEDULED, MANUAL, SPRINT, SELF_TEST, CONFIRM, EMAIL_HINT, RESUME }

/** Per-source ladder state, persisted on the source row. */
@Serializable
data class LadderState(
    val current: FetchMethod,
    /** The cheapest rung this source can use (API only if an API tap exists; recipes force FULL). */
    val floor: FetchMethod = FetchMethod.PLAIN,
    /** The strongest rung allowed (FULL unless the user restricted it). */
    val ceiling: FetchMethod = FetchMethod.FULL,
    val consecutiveFailures: Int = 0,
    val consecutiveSuccesses: Int = 0,
    /** Epoch millis of the last "try one step down" probe. */
    val lastStepDownProbeAt: Long = 0,
)

/** Self-healing progress for a source whose chosen element disappeared. */
@Serializable
data class HealState(
    val candidate: ElementFingerprint,
    val candidateValue: String,
    val seenCount: Int,
    val firstSeenAt: Long,
)
