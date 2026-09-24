package app.tidemark.core.model

import kotlinx.serialization.Serializable

/**
 * A site adapter, shipped as a data file (assets/adapters/<name>.json) so new sites don't need
 * an app update. Everything is optional; the generic extractor fills the gaps.
 */
@Serializable
data class SiteAdapter(
    val name: String,
    /** Host suffixes this adapter applies to ("amazon.", "myshopify.com"). */
    val hosts: List<String> = emptyList(),
    /** Page markers that identify the platform when the host doesn't ("Shopify.theme", "cdn.shopify.com"). */
    val htmlMarkers: List<String> = emptyList(),
    /** Query parameters to drop when canonicalising URLs (tracking, session). */
    val stripParams: List<String> = emptyList(),
    val priceSelectors: List<String> = emptyList(),
    /** Selectors whose text marks an old/crossed-out/list price to ignore. */
    val ignoreSelectors: List<String> = emptyList(),
    val stockSelectors: List<String> = emptyList(),
    val inStockWords: List<String> = emptyList(),
    val outOfStockWords: List<String> = emptyList(),
    val titleSelectors: List<String> = emptyList(),
    /** API tap template, e.g. "{origin}{path}.js" for Shopify; placeholders: {origin} {path} {query} {handle}. */
    val apiTap: ApiTap? = null,
    /** Cheapest method known to work for this site. */
    val preferredMethod: FetchMethod? = null,
    val listing: ListingSpec? = null,
    /** Minimum gap between two requests to this site, in seconds. */
    val minGapSeconds: Int? = null,
)

/**
 * A JSON endpoint that returns the value directly. Prices may be in minor units ([priceDivisor] = 100).
 * Cookies always come from the checker's shared cookie jar and are never stored here. [headers] never hold
 * Cookie, Authorization, CSRF or token headers; a header value may be a `{secret:<id>}` placeholder that the
 * checker resolves from CheckRequest.secrets.
 */
@Serializable
data class ApiTap(
    val urlTemplate: String,
    /** "GET", or "POST" for a GraphQL query (never a mutation). */
    val method: String = "GET",
    val body: String? = null,
    val contentType: String? = null,
    val priceJsonPath: String? = null,
    val stockJsonPath: String? = null,
    val currencyJsonPath: String? = null,
    val titleJsonPath: String? = null,
    val priceDivisor: Double = 1.0,
    /** When the product has variants, the path to the list and the fields inside each variant. */
    val variantsJsonPath: String? = null,
    val variantTitleField: String? = null,
    val variantPriceField: String? = null,
    val variantAvailableField: String? = null,
    val headers: Map<String, String> = emptyMap(),
)
