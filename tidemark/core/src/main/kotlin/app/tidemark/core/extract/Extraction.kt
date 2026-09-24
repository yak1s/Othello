package app.tidemark.core.extract

import app.tidemark.core.model.ApiTap
import app.tidemark.core.model.ElementFingerprint
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.PageSignals
import app.tidemark.core.model.ReadVia
import app.tidemark.core.model.Reading
import app.tidemark.core.model.SiteAdapter
import app.tidemark.core.model.ValueKind

/** An amount with an optional ISO 4217 currency. */
data class Money(val amount: Double, val currency: String?)

/** A currency amount found in text, with where it was found. */
data class MoneyMatch(val money: Money, val start: Int, val end: Int, val raw: String)

/** A value-looking element the extractor considered, shown in the picker and the check log. */
data class Candidate(
    val value: Double?,
    val currency: String?,
    val text: String,
    val cssPath: String,
    val score: Double,
    val via: ReadVia,
)

/** An element near where the chosen element used to be that looks like the value. */
data class HealCandidate(val fingerprint: ElementFingerprint, val valueText: String, val score: Double)

/** One purchasable variant found on the page (size, colour), so the add sheet can offer a chooser. */
data class VariantInfo(val name: String, val inStock: Boolean?, val price: Double?, val currency: String?)

/** The result of reading one fetched document. */
sealed interface ExtractionResult {
    val signals: PageSignals

    /** [reading] must be [app.tidemark.core.model.bounded]. At most 20 [candidates] and 50 [variants]. */
    data class Found(
        val reading: Reading,
        override val signals: PageSignals,
        val candidates: List<Candidate> = emptyList(),
        val variants: List<VariantInfo> = emptyList(),
    ) : ExtractionResult

    /** The chosen element is gone. [healCandidates] are ranked, best first. Never reported as "unchanged". */
    data class ElementMissing(
        val healCandidates: List<HealCandidate>,
        override val signals: PageSignals,
    ) : ExtractionResult

    data class NothingFound(val reason: String, override val signals: PageSignals) : ExtractionResult
}

/**
 * Reads values from fetched documents. Pure and deterministic: the same input always gives
 * the same result, so every rule here is covered by fixture tests.
 *
 * Order for HTML: adapter selectors, structured data (JSON-LD Product/Offer/AggregateOffer,
 * microdata), meta tags (og:price:amount, product:price:amount, itemprop), the chosen element,
 * the text pattern, then the currency heuristic (ignores crossed-out prices, "was"/"list price",
 * per-unit prices, and "related products"/carousels/recommendations).
 */
object Extractor {
    /** Read an HTML page (plain download, or WebView DOM serialised with [app.tidemark.core.model.DomHints]). */
    fun extractHtml(
        html: String,
        url: String,
        spec: ExtractionSpec,
        adapter: SiteAdapter? = null,
        httpStatus: Int? = null,
    ): ExtractionResult = HtmlExtractor.extract(html, url, spec, adapter, httpStatus)

    /** Read a JSON API response using [spec].jsonPath or the adapter's [tap]. */
    fun extractJson(body: String, spec: ExtractionSpec, tap: ApiTap? = null, httpStatus: Int? = null): ExtractionResult =
        JsonExtractor.extract(body, spec, tap, httpStatus)

    /** Read an RSS 2.0 or Atom feed into ITEMS (or TEXT/keyword over the newest entries). */
    fun extractFeed(xml: String, spec: ExtractionSpec, httpStatus: Int? = null): ExtractionResult =
        FeedExtractor.extract(xml, spec, httpStatus)

    /** Live value shown in the picker's bottom bar for the tapped element's text ("249.99 USD"). */
    fun previewValue(text: String, kind: ValueKind, currencyHint: String? = null): Reading? =
        HtmlExtractor.previewValue(text, kind, currencyHint)
}

/** Implemented in HtmlExtractor.kt. */
internal object HtmlExtractor {
    fun extract(html: String, url: String, spec: ExtractionSpec, adapter: SiteAdapter?, httpStatus: Int?): ExtractionResult =
        TODO("extract package")

    fun previewValue(text: String, kind: ValueKind, currencyHint: String?): Reading? = TODO("extract package")
}

/** Implemented in JsonExtractor.kt. */
internal object JsonExtractor {
    fun extract(body: String, spec: ExtractionSpec, tap: ApiTap?, httpStatus: Int?): ExtractionResult = TODO("extract package")
}

/** Implemented in FeedExtractor.kt. */
internal object FeedExtractor {
    fun extract(xml: String, spec: ExtractionSpec, httpStatus: Int?): ExtractionResult = TODO("extract package")
}

/**
 * Parses money in the formats shops actually print: "$1,234.56", "1.234,56 €", "£129.00",
 * "¥12,000", "1 234,56 zł", "CHF 12.–", "US$ 99", "Rs. 1,299", "EUR 19,99". Returns null for
 * text that isn't a single amount. [hintCurrency] resolves a bare "$" or a missing symbol.
 */
object MoneyParser {
    fun parse(text: String, hintCurrency: String? = null): Money? = TODO("extract package")

    /** Every amount in [text], in order. Ranges ("$10 - $20") yield both ends. */
    fun findAll(text: String, hintCurrency: String? = null): List<MoneyMatch> = TODO("extract package")

    /** ISO 4217 code for a symbol or code prefix/suffix ("$" -> "USD" unless hinted, "£" -> "GBP"). */
    fun currencyOf(symbolOrCode: String, hintCurrency: String? = null): String? = TODO("extract package")
}

/**
 * Recognises bot walls, captchas and "access denied" pages: Cloudflare challenge ("Just a moment",
 * cf-chl), PerimeterX/HUMAN (px-captcha), DataDome, Akamai "Access Denied", Amazon "Robot Check" /
 * "Enter the characters you see", Google "unusual traffic", hCaptcha/reCAPTCHA-only pages, and
 * 403/429/503 with a challenge body. Returns a short signal name or null.
 */
object BotWallDetector {
    fun detect(httpStatus: Int?, body: String, headers: Map<String, String> = emptyMap()): String? = TODO("extract package")
}

/** Builds and locates [ElementFingerprint]s over jsoup documents. */
object Fingerprints {
    /** True for class names that look human-written (not css-modules hashes like "sc-1x2y3z" or "_a8f3k"). */
    fun isStableClass(name: String): Boolean = TODO("extract package")

    /** Fingerprint for [element] (must belong to a parsed document). */
    fun of(element: org.jsoup.nodes.Element): ElementFingerprint = TODO("extract package")

    /** Find the element for [fp]: stable attributes/id, then css path, then index path verified by text shape. */
    fun locate(document: org.jsoup.nodes.Document, fp: ElementFingerprint): org.jsoup.nodes.Element? = TODO("extract package")
}

/**
 * Self-healing search: when the chosen element is gone, look for elements near where it used to be
 * (same anchor/label neighbourhood, similar tag/attributes, similar position) whose text parses as
 * the same kind of value. Returns candidates ranked best first; the pipeline adopts only when exactly
 * one candidate is strong and it is confirmed over two checks.
 */
object SelfHealer {
    /** A candidate at or above this score is "strong". The pipeline adopts only when exactly one is strong. */
    const val STRONG_SCORE = 0.6

    fun candidates(document: org.jsoup.nodes.Document, fp: ElementFingerprint, kind: ValueKind): List<HealCandidate> =
        TODO("extract package")
}

/** Text normalisation shared by TEXT watches and keyword checks. */
object TextNormalizer {
    /** Collapse whitespace, strip zero-width chars, drop volatile tokens (times like "5 minutes ago", counters). */
    fun normalize(text: String): String = TODO("extract package")

    /** Stable short hash (hex SHA-256, first 16 chars) of [normalize]d text. */
    fun hash(text: String): String = TODO("extract package")

    /** Case- and accent-insensitive whole-phrase search. */
    fun containsKeyword(text: String, keyword: String): Boolean = TODO("extract package")
}

/** A tiny JSONPath subset: `$.a.b`, `$.a[0].b`, `$['a b']`, `$.items[*].price` (first match wins). */
object JsonPath {
    fun select(json: kotlinx.serialization.json.JsonElement, path: String): List<kotlinx.serialization.json.JsonElement> =
        TODO("extract package")

    /** Paths to every primitive in [json] whose value equals [target] (number within 0.005, or string). Used by promotion. */
    fun pathsTo(json: kotlinx.serialization.json.JsonElement, target: Double): List<String> = TODO("extract package")
}
