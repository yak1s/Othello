package app.tidemark.core.model

import kotlinx.serialization.Serializable

/**
 * A robust description of a chosen element. Never relies on auto-generated class names:
 * [stableClasses] holds only classes that look human-written (no hashes, no digits runs).
 */
@Serializable
data class ElementFingerprint(
    /** A CSS path built from stable parts, e.g. `main > div#price-block > span.price`. */
    val cssPath: String,
    val tag: String,
    val id: String? = null,
    val stableClasses: List<String> = emptyList(),
    /** Stable attributes worth matching (itemprop, data-testid, aria-label, name, role). */
    val attributes: Map<String, String> = emptyMap(),
    /** The element's text when picked (trimmed, max 120 chars). */
    val textSample: String = "",
    /** Nearby label text ("Price", "Our price") found in the element's container. */
    val labelText: String? = null,
    /** Child index path from <body>, the last-resort locator and the "where it used to be" anchor. */
    val indexPath: List<Int> = emptyList(),
    /** Text of the nearest ancestor with a stable id or heading, used as a neighbourhood anchor. */
    val anchorText: String? = null,
    val role: String? = null,
    val accessibleName: String? = null,
)

/** A repeated item in search results, found by the picker or by an adapter. */
@Serializable
data class ListingSpec(
    /** CSS selector matching each result item container. */
    val itemSelector: String,
    val titleSelector: String? = null,
    val priceSelector: String? = null,
    val linkSelector: String? = null,
    /** Attribute holding a stable id (data-id, data-listing-id); falls back to the item link. */
    val idAttribute: String? = null,
)

/**
 * How to read the value from a fetched page or response. The extractor tries, in order:
 * adapter hints, structured data, meta tags, [element], [pattern], then the currency heuristic.
 * For API sources only [jsonPath] (and optional [stockJsonPath]) are used.
 */
@Serializable
data class ExtractionSpec(
    val kind: ValueKind,
    val element: ElementFingerprint? = null,
    /** Regex with one capture group for the value, matched against visible text. */
    val pattern: String? = null,
    val jsonPath: String? = null,
    val stockJsonPath: String? = null,
    val currencyJsonPath: String? = null,
    val keyword: String? = null,
    val listing: ListingSpec? = null,
    /** Variant the user cares about ("UK 10", "Blue"); used by stock reading on multi-variant pages. */
    val variant: String? = null,
    /** Expected currency; a reading in another currency fails the sanity check. */
    val currency: String? = null,
    /** When false, skip structured data / meta (the user picked a specific element on purpose). */
    val allowStructuredData: Boolean = true,
    /**
     * Hotels and rentals: the unit the price is quoted per ("night"). The currency heuristic then prefers
     * amounts labelled per night instead of discarding per-unit prices.
     */
    val perUnit: String? = null,
    /** Hotels: nights in the stay, to derive a nightly rate when the page shows only a total. */
    val nights: Int? = null,
)

/**
 * Hints the WebView extractor script adds to the DOM before serialising it. The script writes
 * data attributes that core's extractor understands:
 *  - `data-tm-strike="1"`  computed text-decoration includes line-through
 *  - `data-tm-hidden="1"`  not rendered (display none, visibility hidden, zero size, offscreen)
 *  - `data-tm-fs="24"`     computed font size in CSS px (only on elements with direct text)
 *  - `data-tm-top="812"`   distance from the top of the document in CSS px
 *  - `data-tm-picked="1"`  the element the user tapped in the picker
 * Plain downloads have none of these; the extractor must work without them.
 */
object DomHints {
    const val STRIKE = "data-tm-strike"
    const val HIDDEN = "data-tm-hidden"
    const val FONT_SIZE = "data-tm-fs"
    const val TOP = "data-tm-top"
    const val PICKED = "data-tm-picked"
}

/** Signals about the page as a whole, gathered during fetch and extraction. Used by the sanity check. */
@Serializable
data class PageSignals(
    val httpStatus: Int? = null,
    val visibleTextLength: Int = 0,
    val title: String? = null,
    val finalUrl: String? = null,
    /** Non-null when the page looks like a bot wall, captcha, or "access denied" page. */
    val botWall: String? = null,
    /** True when the page says the product is unavailable / discontinued / not found. */
    val unavailable: Boolean = false,
    val bytes: Long = 0,
    /**
     * The page looks logged out when a session was expected (login form where the product should be, a
     * redirect to a sign-in URL, or the recipe's `loggedOutWhen` matched). Such a reading is never used:
     * a logged-out member-price page shows the higher public price, and trusting it would fake a "drop".
     */
    val loggedOut: Boolean = false,
)
