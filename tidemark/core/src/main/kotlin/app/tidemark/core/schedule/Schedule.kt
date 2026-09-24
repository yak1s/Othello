package app.tidemark.core.schedule

import app.tidemark.core.model.FetchMethod
import app.tidemark.core.model.FrequencyProfile
import kotlin.random.Random

/** Randomise every schedule by ±[fraction]; checks landing exactly on the hour are the loudest sign of automation. */
object Jitter {
    fun apply(millis: Long, random: Random, fraction: Double = 0.25): Long = TODO("schedule package")
}

data class PlanInput(
    val profile: FrequencyProfile,
    val adaptiveEnabled: Boolean,
    val now: Long,
    val createdAt: Long,
    /** Last confirmed change of the value, if any. */
    val lastChangeAt: Long?,
    /** Confirmed changes by local hour of day (24 buckets), for "learn when each site tends to change". */
    val changeHourHistogram: List<Int> = List(24) { 0 },
    /** Local hour of [now] (0-23), supplied by the caller so the planner stays timezone-free. */
    val localHour: Int,
    /** Steps the site's frequency was lowered after blocks (each step = one profile slower). */
    val sitePenaltySteps: Int = 0,
    /** Epoch millis until which the site asked us to slow down (429/503 backoff). */
    val backoffUntil: Long? = null,
    /** The user pinned the watch to a widget or marked it urgent; never silently changes frequency. */
    val urgent: Boolean = false,
)

data class Plan(
    val nextAt: Long,
    val intervalMillis: Long,
    val effectiveProfile: FrequencyProfile,
    /** Shown in detail when adaptive timing changed the pace ("Checked less often: no change in 2 weeks"). */
    val reason: String? = null,
)

/**
 * Adaptive scheduling (on by default): slow down one profile step for watches with no change in two
 * weeks (two steps after six weeks, never slower than RELAXED); speed up one step for 48 hours after
 * a confirmed move (never faster than the user's profile allows: AGGRESSIVE stays AGGRESSIVE); and
 * check up to twice as often during the hours a site tends to change. Site penalty and backoff
 * always win. Jitter is applied last.
 */
object Planner {
    fun next(input: PlanInput, random: Random): Plan = TODO("schedule package")
}

/** Exponential backoff for "slow down" replies (429/503), honouring Retry-After. */
object Backoff {
    const val INITIAL_MILLIS = 5 * 60_000L
    const val MAX_MILLIS = 12 * 60 * 60_000L

    fun next(previousMillis: Long?, retryAfterSeconds: Long?): Long = TODO("schedule package")

    /** Parse a Retry-After header (delta seconds or HTTP date) relative to [now]. */
    fun parseRetryAfter(value: String?, now: Long): Long? = TODO("schedule package")
}

data class DeviceState(
    val connected: Boolean,
    val unmetered: Boolean,
    val charging: Boolean,
    val batteryPercent: Int,
    val powerSave: Boolean,
)

data class RunSettings(
    val heavyChecksOnWifiOnly: Boolean = true,
    val lowBatteryPercent: Int = 15,
    /** Aggressive profile defaults to Wi-Fi and charging. */
    val aggressiveNeedsWifiAndCharging: Boolean = true,
)

sealed interface RunDecision {
    data object Allow : RunDecision
    data class Defer(val reason: String) : RunDecision
}

/** Network and battery rules, decided per source and method before any request. */
object RunPolicy {
    fun decide(
        method: FetchMethod,
        profile: FrequencyProfile,
        urgent: Boolean,
        sprint: Boolean,
        manual: Boolean,
        device: DeviceState,
        settings: RunSettings,
    ): RunDecision = TODO("schedule package")
}

/** Sprint: 20-60 s checks for a limited window, user-started, ending automatically. */
object SprintPolicy {
    const val DEFAULT_MINUTES = 20
    const val MAX_MINUTES = 120
    const val MIN_INTERVAL_MILLIS = 20_000L
    const val MAX_INTERVAL_MILLIS = 60_000L

    fun clampMinutes(minutes: Int): Int = TODO("schedule package")

    /** Next gap inside a sprint: 20-60 s, jittered, never below 20 s per site. */
    fun nextIntervalMillis(random: Random): Long = TODO("schedule package")
}

/** Minimum gap between requests to one site, and the one-at-a-time rule. */
object Politeness {
    const val DEFAULT_MIN_GAP_MILLIS = 8_000L
    const val SPRINT_MIN_GAP_MILLIS = 20_000L

    /** Earliest time the next request to a site may start. */
    fun earliestNext(lastRequestAt: Long?, minGapMillis: Long, backoffUntil: Long?): Long = TODO("schedule package")
}
