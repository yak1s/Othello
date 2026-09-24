package app.tidemark.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** What a drop is measured against. Default is the 7-day median because "last reading" fires on noise. */
@Serializable
enum class Baseline { LAST, MEDIAN_7D, MEDIAN_30D, ALL_TIME_LOW }

/**
 * A single clause. Every scenario in the spec is one of these (or two joined by [Rule]).
 * Thresholds are in the watch's currency / unit.
 */
@Serializable
sealed interface Condition {
    /** The primitive this clause reads. */
    val reads: ValueKind

    /** Price (or number) drops at all, relative to [baseline]. */
    @Serializable @SerialName("drops")
    data class Drops(val baseline: Baseline = Baseline.MEDIAN_7D) : Condition {
        override val reads get() = ValueKind.PRICE
    }

    /** Fires once when the value crosses to at or below [threshold]; re-arms only after it rises back above. */
    @Serializable @SerialName("below")
    data class Below(val threshold: Double) : Condition {
        override val reads get() = ValueKind.PRICE
    }

    /** Drops by at least [percent] % or at least [amount] (exactly one is set) relative to [baseline]. */
    @Serializable @SerialName("drops_by")
    data class DropsBy(
        val percent: Double? = null,
        val amount: Double? = null,
        val baseline: Baseline = Baseline.MEDIAN_7D,
    ) : Condition {
        override val reads get() = ValueKind.PRICE
    }

    /** Lower than every confirmed reading before it. */
    @Serializable @SerialName("all_time_low")
    data object AllTimeLow : Condition {
        override val reads get() = ValueKind.PRICE
    }

    /** A generic number crosses up to at or above [threshold] (ticket counts, "3 left" going up). Fires once per crossing. */
    @Serializable @SerialName("above")
    data class Above(val threshold: Double) : Condition {
        override val reads get() = ValueKind.NUMBER
    }

    /** A generic number crosses down to at or below [threshold] ("3 left"). Fires once per crossing. */
    @Serializable @SerialName("number_below")
    data class NumberBelow(val threshold: Double) : Condition {
        override val reads get() = ValueKind.NUMBER
    }

    /** Back in stock: false (or unknown after false) -> true, held across two checks. */
    @Serializable @SerialName("in_stock")
    data object InStock : Condition {
        override val reads get() = ValueKind.STOCK
    }

    /** New listings appeared in a set; alerts only on the new items. */
    @Serializable @SerialName("new_items")
    data class NewItems(val mustContain: String? = null, val maxPrice: Double? = null) : Condition {
        override val reads get() = ValueKind.ITEMS
    }

    /** Any change to the chosen element's text. */
    @Serializable @SerialName("any_change")
    data object AnyChange : Condition {
        override val reads get() = ValueKind.TEXT
    }

    @Serializable @SerialName("keyword_appears")
    data class KeywordAppears(val keyword: String) : Condition {
        override val reads get() = ValueKind.TEXT
    }

    @Serializable @SerialName("keyword_disappears")
    data class KeywordDisappears(val keyword: String) : Condition {
        override val reads get() = ValueKind.TEXT
    }
}

@Serializable
enum class Join { AND, OR }

/** At most two clauses, written as a sentence: "in stock and under $200". */
@Serializable
data class Rule(
    val first: Condition,
    val join: Join? = null,
    val second: Condition? = null,
) {
    init {
        require((join == null) == (second == null)) { "join and second clause go together" }
    }

    val clauses: List<Condition> get() = listOfNotNull(first, second)
}

/** Per-clause re-arm state for crossing conditions (Below, Above, NumberBelow, InStock). Index = clause index. */
@Serializable
data class ArmState(val armed: List<Boolean> = listOf(true, true)) {
    fun isArmed(clause: Int): Boolean = armed.getOrElse(clause) { true }
    fun with(clause: Int, value: Boolean): ArmState =
        ArmState(List(maxOf(2, armed.size)) { i -> if (i == clause) value else isArmed(i) })
}

/** What kind of event an alert reports. Decides channel, copy and whether the accent color is allowed. */
@Serializable
enum class AlertKind {
    /** Price or number fell (drops, below, drops by, all-time low, number below). Accent. */
    DROP,
    /** Came back in stock. Accent. */
    RESTOCK,
    /** New listings appeared. Accent. */
    NEW_ITEMS,
    /** Element changed / keyword appeared or disappeared / number rose above. No accent. */
    CHANGE,
    /** Layout changed and the value was re-found; user should verify. Silent. */
    LAYOUT_HEALED,
    /** Site asked for a human, watch broken, login needed. Silent. */
    NEEDS_ATTENTION,
    /** End-of-sprint summary. */
    SPRINT_SUMMARY,
    ;

    val usesAccent: Boolean get() = this == DROP || this == RESTOCK || this == NEW_ITEMS
}
