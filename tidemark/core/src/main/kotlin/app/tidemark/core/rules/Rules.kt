package app.tidemark.core.rules

import app.tidemark.core.model.AlertKind
import app.tidemark.core.model.ArmState
import app.tidemark.core.model.Baseline
import app.tidemark.core.model.Condition
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.HistoryPoint
import app.tidemark.core.model.ListingItem
import app.tidemark.core.model.PageSignals
import app.tidemark.core.model.Reading
import app.tidemark.core.model.Rule

/** Summary of confirmed history, computed from stored points. Only confirmed readings count. */
data class HistoryStats(
    val last: HistoryPoint? = null,
    val median7d: Double? = null,
    val median30d: Double? = null,
    val allTimeLow: Double? = null,
    val allTimeLowAt: Long? = null,
    val count: Int = 0,
    val lastChangeAt: Long? = null,
) {
    companion object {
        val EMPTY = HistoryStats()
    }
}

object Stats {
    /** Compute [HistoryStats] from confirmed points (any order). */
    fun compute(points: List<HistoryPoint>, now: Long): HistoryStats = TODO("rules package")

    /** The number a drop is measured against, or null when there's not enough history (falls back to LAST). */
    fun baselineValue(baseline: Baseline, stats: HistoryStats): Double? = TODO("rules package")
}

data class EvalContext(
    /** Last confirmed reading for this watch (null on the first reading). */
    val previous: Reading?,
    val stats: HistoryStats,
    val arm: ArmState,
    /** Ids of items already seen (NEW_ITEMS). */
    val knownItemIds: Set<String>,
    val now: Long,
)

data class ClauseResult(
    val condition: Condition,
    /** The level: is the clause true right now ("price is below $200"). */
    val satisfied: Boolean,
    /** The edge: did it just become true while armed ("price just crossed below $200"). */
    val fires: Boolean,
    /** Plain sentence for the check log: "179.00 is below 200.00". */
    val detail: String,
)

data class Evaluation(
    val fired: Boolean,
    val kind: AlertKind?,
    val clauses: List<ClauseResult>,
    /** Arm state to persist after this reading (whether or not it fired). */
    val arm: ArmState,
    val newItems: List<ListingItem> = emptyList(),
    /** Why it fired, in a sentence ("Price fell to 179.00, below the 7-day median of 249.00"). */
    val explanation: String,
)

/**
 * Evaluates a [Rule] against a confirmed reading. Crossing conditions (Below, Above, NumberBelow,
 * InStock) fire once on the crossing and re-arm only after the level turns false again. AND fires
 * when both clauses are satisfied and at least one of them fires; OR fires when either fires.
 */
object RuleEvaluator {
    fun evaluate(rule: Rule, current: Reading, ctx: EvalContext): Evaluation = TODO("rules package")
}

sealed interface SanityVerdict {
    data object Ok : SanityVerdict
    data class Reject(val reason: String) : SanityVerdict
}

/**
 * First gate for any new value. Rejects: numbers at or below zero; drops over 80% against the last
 * confirmed value (or the 30-day median when there's no last); a currency different from the
 * previous reading or [ExtractionSpec.currency]; pages that suddenly look empty (visible text under
 * 25% of what's normal, or under 200 chars); bot walls; a price read from a page that says the
 * item is unavailable.
 */
object SanityCheck {
    fun check(
        previous: Reading?,
        current: Reading,
        stats: HistoryStats,
        signals: PageSignals,
        spec: ExtractionSpec,
        typicalTextLength: Int? = null,
    ): SanityVerdict = TODO("rules package")
}

/** Do two readings of the same thing agree? Numbers within 0.5% (or 0.01), same currency, same stock, same text hash. */
object Agreement {
    fun agree(a: Reading, b: Reading): Boolean = TODO("rules package")

    /** Did the value move from [previous] in a way worth confirming? Same tolerance as [agree]. */
    fun changed(previous: Reading?, current: Reading): Boolean = TODO("rules package")
}
