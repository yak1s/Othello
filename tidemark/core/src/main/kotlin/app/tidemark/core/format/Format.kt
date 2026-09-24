package app.tidemark.core.format

import app.tidemark.core.model.AlertKind
import app.tidemark.core.model.Condition
import app.tidemark.core.model.Reading
import app.tidemark.core.model.Rule
import java.util.Locale

/**
 * Number and money formatting. Digits are tabular in the baked font, so output never pads with
 * spaces for alignment. Uses the minus sign U+2212 and arrows U+2193/U+2191.
 */
object ValueFormat {
    /** "$179", "$179.99", "£1,249.00", "¥12,000". Drops ".00" when [compact]. */
    fun money(amount: Double, currency: String?, locale: Locale = Locale.getDefault(), compact: Boolean = false): String =
        TODO("format package")

    /** "↓ 28%", "↑ 4%", "↓ 0.4%". Returns "" for no change. */
    fun percentChange(from: Double, to: Double): String = TODO("format package")

    /** The value as shown on the rail: money, a plain number, "In stock"/"Sold out", "3 new", "Changed". */
    fun reading(reading: Reading?, locale: Locale = Locale.getDefault(), compact: Boolean = true): String =
        TODO("format package")

    /** Relative time for the check log and ticker: "now", "4m", "2h", "3d". */
    fun shortDuration(millis: Long): String = TODO("format package")
}

/** Rules as sentences, never a visual builder: "price drops below the 7-day median", "in stock and under $200". */
object RuleSentences {
    fun describe(rule: Rule, currency: String?, locale: Locale = Locale.getDefault()): String = TODO("format package")
    fun describe(condition: Condition, currency: String?, locale: Locale = Locale.getDefault()): String =
        TODO("format package")
}

/** Screen-reader text: "price dropped 28 percent, now 179 dollars 99". */
object Spoken {
    fun money(amount: Double, currency: String?): String = TODO("format package")
    fun change(previous: Reading?, current: Reading): String = TODO("format package")
}

/** The notification's words. The title carries the information, not the app name. */
object AlertCopy {
    data class Copy(val title: String, val text: String, val spoken: String)

    /**
     * DROP: title "$179 ↓ 28%", text "Sony WH-1000XM5 · amazon · was $249, lowest since Nov".
     * RESTOCK: title "In stock — Ooni Koda 16" ("In stock, UK 10 — …" when current.variant is set), text "ooni · $399".
     * NEW_ITEMS: title "3 new — Leica M6", text first item titles.
     */
    fun forAlert(
        kind: AlertKind,
        watchName: String,
        storeName: String,
        current: Reading,
        previous: Reading?,
        /** From Stats.lowestSince: the last time it was this low ("lowest since Nov"); null to omit. */
        lowestSinceMillis: Long?,
        newItemTitles: List<String> = emptyList(),
        locale: Locale = Locale.getDefault(),
        zone: java.time.ZoneId = java.time.ZoneOffset.UTC,
    ): Copy = TODO("format package")
}
