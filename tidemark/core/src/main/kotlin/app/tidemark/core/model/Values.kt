package app.tidemark.core.model

import kotlinx.serialization.Serializable

/**
 * The four primitives every watch is built from. PRICE is a NUMBER that carries a currency.
 * A single [Reading] may carry more than one primitive (a product page yields both a price
 * and a stock state), and each [Condition] picks the one it needs.
 */
@Serializable
enum class ValueKind { PRICE, NUMBER, TEXT, STOCK, ITEMS }

/**
 * The fetch ladder, cheapest first. Order matters: [ordinal] is the rung.
 * API = a JSON endpoint that returns the value directly; PLAIN = plain page download read
 * for structured data; LIGHT = WebView with JS but no images/fonts/ads/trackers;
 * FULL = WebView that loads everything, pauses naturally and scrolls.
 */
@Serializable
enum class FetchMethod {
    API, PLAIN, LIGHT, FULL;

    val usesBrowser: Boolean get() = this == LIGHT || this == FULL

    fun stronger(): FetchMethod? = entries.getOrNull(ordinal + 1)
    fun weaker(): FetchMethod? = entries.getOrNull(ordinal - 1)
}

/** Which reading method produced a value. Shown in the check log ("read from structured data"). */
@Serializable
enum class ReadVia {
    STRUCTURED_DATA, META_TAG, ELEMENT, HEALED_ELEMENT, PATTERN, CURRENCY_HEURISTIC,
    STOCK_SIGNALS, JSON_PATH, FEED, LISTING, VISIBLE_TEXT, KEYWORD, PAGE_TEXT, ADAPTER, FARE_API, RECIPE,
}

/** One item in a set (marketplace search results, feed entries). [id] is stable across checks. */
@Serializable
data class ListingItem(
    val id: String,
    val title: String,
    val price: Double? = null,
    val currency: String? = null,
    val url: String? = null,
)

/**
 * One observation of one source. Numbers are plain doubles in major units (179.99), with an
 * ISO 4217 [currency] when the number is a price. Compare with [app.tidemark.core.rules.Agreement],
 * never with ==.
 */
@Serializable
data class Reading(
    val kind: ValueKind,
    val number: Double? = null,
    val currency: String? = null,
    val inStock: Boolean? = null,
    /** Normalised text of the watched element or page region (TEXT watches, keyword context). */
    val text: String? = null,
    /** Stable hash of [text] after normalisation; used for "any change". */
    val textHash: String? = null,
    /** For keyword watches: is the keyword present right now. */
    val keywordPresent: Boolean? = null,
    val items: List<ListingItem> = emptyList(),
    val title: String? = null,
    val imageUrl: String? = null,
    val readVia: ReadVia,
    /** Up to ~240 chars of the page text the value was read from. Never contains secrets. */
    val evidence: String? = null,
) {
    /** The single primitive the watch's kind cares about, as a display-independent string. */
    fun primaryKey(): String = when (kind) {
        ValueKind.PRICE, ValueKind.NUMBER -> "${number}|${currency}"
        ValueKind.STOCK -> "stock=$inStock"
        ValueKind.TEXT -> "text=$textHash|kw=$keywordPresent"
        ValueKind.ITEMS -> "items=" + items.joinToString(",") { it.id }
    }
}

/** A point of stored history, as the rules engine sees it. [at] is epoch millis. */
@Serializable
data class HistoryPoint(
    val at: Long,
    val number: Double? = null,
    val currency: String? = null,
    val inStock: Boolean? = null,
    val textHash: String? = null,
    val keywordPresent: Boolean? = null,
)
