package app.tidemark.ipc

import app.tidemark.core.model.ApiTap
import app.tidemark.core.model.CheckReason
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
 *
 * Size rule: a JSON payload over [SPILL_BYTES] is written to `cacheDir/ipc/<requestId>.json` and sent as
 * [KEY_JSON_PATH] instead (the receiver reads and deletes it). Results cap candidates at 20, heal candidates
 * at 5, variants at 50, JSON candidates at 50, and every Reading is `bounded()`.
 */
object Ipc {
    const val MSG_CHECK = 1
    const val MSG_PREVIEW = 2
    const val MSG_CANCEL = 3
    const val MSG_PING = 4
    /** Hand decrypted secrets to the checker process for a browser REPLAY/REPAIR: [PutSecretsRequest]; kept in memory for 5 minutes. */
    const val MSG_PUT_SECRETS = 5
    /** Sign out and reset one site (cookies + web storage), or all sites: [ClearSiteDataRequest]. */
    const val MSG_CLEAR_SITE_DATA = 6
    /** Site adapter files changed in filesDir/adapters: reload them. */
    const val MSG_RELOAD_ADAPTERS = 7
    const val MSG_CHECK_RESULT = 101
    const val MSG_PREVIEW_EVENT = 102
    const val MSG_PONG = 104
    const val KEY_JSON = "json"
    const val KEY_JSON_PATH = "jsonPath"
    const val KEY_REQUEST_ID = "requestId"
    const val SPILL_BYTES = 200_000
}

@Serializable
data class PutSecretsRequest(val token: String, val secrets: Map<String, String>) {
    override fun toString(): String = "PutSecretsRequest(token=$token, ids=${secrets.keys})"
}

@Serializable
data class ClearSiteDataRequest(val requestId: String, val host: String? = null)

/** Mirrors core FetchPurpose 1:1 (SELF_TEST and SPRINT are reasons: see [CheckRequest.reason]). */
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
    val reason: CheckReason = CheckReason.SCHEDULED,
    val adapterName: String? = null,
    val apiTap: ApiTap? = null,
    val apiTapUrl: String? = null,
    val flight: FlightQuery? = null,
    /** Set when the check should use a fare API (method = API) instead of the page. */
    val fareApi: FareApi? = null,
    val recipe: Recipe? = null,
    /** Session recipe to run first if the checker detects it's logged out. */
    val loginRecipe: Recipe? = null,
    /** Consecutive failed logins so far; the checker never runs a login recipe at 2 or more. */
    val loginFailures: Int = 0,
    /** Conditional-request validators. Never sent for CONFIRM or STEP_DOWN_PROBE (a 304 there is a failed confirmation). */
    val etag: String? = null,
    val lastModified: String? = null,
    /** The user chose to check a path robots.txt disallows. */
    val ignoreRobots: Boolean = false,
    /** Save a snapshot: FIRST after an edit, CONFIRM, failures, ELEMENT_MISSING; otherwise false (storage). */
    val saveSnapshot: Boolean = true,
    /** Covers the fetch itself; time queued behind the per-host gate doesn't count (the client waits timeoutMs + queue). */
    val timeoutMs: Long = 45_000,
    /** Minimum gap after the previous request to the same host; the checker honours this value (1-3 s for CONFIRM). */
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
    /** A recipe step resolved to a buy/book/submit element the user never overrode; stopped before pressing it. */
    UNSAFE_TARGET,
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
data class VariantDto(val name: String, val inStock: Boolean? = null, val price: Double? = null, val currency: String? = null)

/** A number in a JSON response the user can tap to track (API endpoints). */
@Serializable
data class JsonCandidateDto(val path: String, val value: String, val context: String)

@Serializable
data class FareDateDto(val date: String, val amount: Double? = null, val currency: String? = null)

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
    /** Steps that only matched through a fallback locator (the recipe is getting fragile). */
    val recipeDegradedSteps: List<Int> = emptyList(),
    val loginAttempted: Boolean = false,
    val loginSucceeded: Boolean? = null,
    val needsTwoFactor: Boolean = false,
    val variants: List<VariantDto> = emptyList(),
    /** FLIGHT with a flexible window: every date checked (the reading is the cheapest). */
    val fareDates: List<FareDateDto> = emptyList(),
)

@Serializable
data class PreviewRequest(
    val requestId: String,
    val url: String,
    /** A flight built in the add sheet's form: preview that search instead of [url]. */
    val flight: FlightQuery? = null,
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
    /** Parsed from a shared Google Flights link (null: open the flight form). */
    val flight: FlightQuery? = null,
    val variants: List<VariantDto> = emptyList(),
    val jsonCandidates: List<JsonCandidateDto> = emptyList(),
    /** Thumbnail downloaded by the checker (≤ 64 KB) under filesDir/thumbs. */
    val imagePath: String? = null,
    val snapshotPath: String? = null,
)
