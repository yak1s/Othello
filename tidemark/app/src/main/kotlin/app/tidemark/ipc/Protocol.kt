package app.tidemark.ipc

import app.tidemark.core.model.ApiTap
import app.tidemark.core.model.ElementFingerprint
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.FareApi
import app.tidemark.core.model.FetchMethod
import app.tidemark.core.model.FlightQuery
import app.tidemark.core.model.PageSignals
import app.tidemark.core.model.ReadVia
import app.tidemark.core.model.Reading
import app.tidemark.core.model.Recipe
import app.tidemark.core.model.SourceKind
import app.tidemark.core.model.ValueKind
import kotlinx.serialization.Serializable

/**
 * The contract between the main process (UI, database, scheduling, notifications) and the
 * `:checker` process (all WebView work and all network fetching, so every request shares the
 * in-app browser's cookie jar). Messages travel over a [android.os.Messenger]; each carries one
 * JSON string under [KEY_JSON]. Anything large (HTML snapshots, screenshots) is written to
 * `filesDir/snapshots` by the checker and referenced by path.
 */
object Ipc {
    const val MSG_CHECK = 1
    const val MSG_PREVIEW = 2
    const val MSG_CANCEL = 3
    const val MSG_PING = 4
    const val MSG_CHECK_RESULT = 101
    const val MSG_PREVIEW_EVENT = 102
    const val MSG_PONG = 104
    const val KEY_JSON = "json"
    const val KEY_REQUEST_ID = "requestId"
}

/** Why the main process wants this fetch; only used for logs and politeness exceptions. */
@Serializable
enum class FetchPurposeDto { FIRST, CONFIRM, STEP_DOWN_PROBE, SELF_TEST, SPRINT }

@Serializable
data class CheckRequest(
    val requestId: String,
    val sourceId: Long,
    val watchId: Long,
    val kind: SourceKind,
    /** What to fetch now. For FLIGHT sources the main process rebuilt it from [flight] for this check. */
    val url: String,
    val method: FetchMethod,
    val spec: ExtractionSpec,
    val purpose: FetchPurposeDto,
    val adapterName: String? = null,
    val apiTap: ApiTap? = null,
    val apiTapUrl: String? = null,
    val flight: FlightQuery? = null,
    /** Set when the check should use a fare API (method = API) instead of the page. */
    val fareApi: FareApi? = null,
    val recipe: Recipe? = null,
    /** Session recipe to run first if the checker detects it's logged out. */
    val loginRecipe: Recipe? = null,
    val etag: String? = null,
    val lastModified: String? = null,
    /** The user chose to check a path robots.txt disallows. */
    val ignoreRobots: Boolean = false,
    val saveSnapshot: Boolean = true,
    val timeoutMs: Long = 45_000,
    /** Minimum gap to keep after the previous request to the same host (the checker enforces it too). */
    val minGapMillis: Long = 8_000,
    /**
     * Decrypted secret values for recipe steps and fare API keys, keyed by secret id. Only ever in
     * memory; [toString] redacts them and the checker scrubs them from snapshots.
     */
    val secrets: Map<String, String> = emptyMap(),
) {
    override fun toString(): String =
        "CheckRequest(id=$requestId, source=$sourceId, $kind, $method, $purpose, url=$url, secrets=${secrets.keys})"
}

@Serializable
enum class CheckOutcome {
    /** A value was read ([CheckResult.reading] set). */
    READ,
    /** 304 or matching ETag: unchanged, free. */
    NOT_MODIFIED,
    /** The chosen element is gone; see [CheckResult.healCandidates]. */
    ELEMENT_MISSING,
    /** The page loaded but no value could be read. */
    NOTHING_FOUND,
    /** Bot wall / captcha / access denied ([CheckResult.botWall]). */
    BLOCKED,
    /** robots.txt disallows this path and the user hasn't chosen to check anyway. */
    ROBOTS_DISALLOWED,
    /** A recipe step failed; the page was not read ([CheckResult.failedStepIndex], [CheckResult.screenshotPath]). */
    RECIPE_ABORTED,
    /** A recipe run landed on a cart/checkout/payment URL and stopped. */
    TRANSACTIONAL_URL,
    /** Logged out and there is no working login recipe (or it failed twice / needs 2FA). */
    LOGIN_REQUIRED,
    HTTP_ERROR,
    NETWORK_ERROR,
    TIMEOUT,
    /** The checker itself failed (WebView renderer gone, unexpected exception). */
    INTERNAL_ERROR,
}

@Serializable
data class CandidateDto(
    val value: Double? = null,
    val currency: String? = null,
    val text: String,
    val cssPath: String,
    val score: Double,
    val via: ReadVia,
)

@Serializable
data class HealCandidateDto(val fingerprint: ElementFingerprint, val valueText: String, val score: Double)

@Serializable
data class CheckResult(
    val requestId: String,
    val sourceId: Long,
    val outcome: CheckOutcome,
    val method: FetchMethod,
    val reading: Reading? = null,
    val candidates: List<CandidateDto> = emptyList(),
    val healCandidates: List<HealCandidateDto> = emptyList(),
    val signals: PageSignals = PageSignals(),
    val botWall: String? = null,
    val httpStatus: Int? = null,
    val etag: String? = null,
    val lastModified: String? = null,
    val retryAfterSeconds: Long? = null,
    val finalUrl: String? = null,
    /** Short plain sentence for the check log. Never contains secrets. */
    val message: String? = null,
    val durationMs: Long = 0,
    val bytes: Long = 0,
    /** Gzipped HTML (or JSON/text) of what was read, under filesDir/snapshots. */
    val snapshotPath: String? = null,
    /** PNG of the page when a recipe step failed. */
    val screenshotPath: String? = null,
    val failedStepIndex: Int? = null,
)

@Serializable
data class PreviewRequest(
    val requestId: String,
    val url: String,
    /** Allow stepping up to the light/full browser when the plain download finds nothing. */
    val allowBrowser: Boolean = true,
)

@Serializable
enum class PreviewStage { STARTED, PLAIN_DONE, BROWSER_STARTED, BROWSER_DONE, BLOCKED, FAILED }

/**
 * Streamed while the add sheet is open, so the title, image, price and stock state appear as they
 * arrive. The last event has [final] = true.
 */
@Serializable
data class PreviewEvent(
    val requestId: String,
    val stage: PreviewStage,
    val final: Boolean,
    val finalUrl: String? = null,
    val title: String? = null,
    val imageUrl: String? = null,
    val reading: Reading? = null,
    /** What this page most likely is: a product (PRICE/STOCK), a feed, a search page, a flight search. */
    val kindGuess: ValueKind? = null,
    val sourceKindGuess: SourceKind = SourceKind.PAGE,
    val methodUsed: FetchMethod? = null,
    val adapterName: String? = null,
    val apiTap: ApiTap? = null,
    val apiTapUrl: String? = null,
    val spec: ExtractionSpec? = null,
    val botWall: String? = null,
    val robotsDisallowed: Boolean = false,
    val message: String? = null,
)
