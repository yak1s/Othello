package app.tidemark.browser

import android.content.Context
import android.content.Intent
import androidx.activity.result.contract.ActivityResultContract
import app.tidemark.core.model.ElementFingerprint
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.Reading
import app.tidemark.core.model.Recipe
import app.tidemark.core.model.Step
import app.tidemark.core.model.TidemarkJson
import app.tidemark.core.model.ValueKind
import app.tidemark.core.recipe.PromotionCandidate
import kotlinx.serialization.Serializable

/**
 * The in-app browser runs in the `:checker` process (same cookie jar as background checks), so the
 * main process talks to it only through these activity-result contracts. Arguments and results
 * travel as JSON strings in the intent.
 */
enum class BrowserMode {
    /** Plain browsing with a "Watch this" button. */
    BROWSE,
    /** Element picker: tap an element, see the parsed value live, wider/tighter, long-press to cycle overlaps. */
    PICK,
    /** Recipe recorder: slim bottom bar with step count, undo, step list, Done. */
    RECORD,
    /** A site asked for a human: clear the check or log in, then "Resume checks". */
    RESOLVE_BLOCK,
    /** Replay a recipe visibly and ask "Found £129.00 — looks right?". */
    REPLAY,
    /** Repair one failed step, with the failure screenshot. */
    REPAIR_STEP,
    /** Show a stored snapshot (JS off). */
    SNAPSHOT,
}

@Serializable
data class BrowserArgs(
    val mode: BrowserMode,
    val url: String,
    val kind: ValueKind = ValueKind.PRICE,
    val watchId: Long? = null,
    val sourceId: Long? = null,
    /** Old snapshot to show side by side when re-picking a broken watch. */
    val oldSnapshotPath: String? = null,
    val oldFingerprint: ElementFingerprint? = null,
    val oldValueText: String? = null,
    /** REPLAY / REPAIR_STEP: the recipe and (for repair) the failed step index and screenshot. */
    val recipe: Recipe? = null,
    val failedStepIndex: Int? = null,
    val failureScreenshotPath: String? = null,
    /** SNAPSHOT: the file to show. */
    val snapshotPath: String? = null,
    /** Secret values for REPLAY, keyed by id. In memory only. */
    val secrets: Map<String, String> = emptyMap(),
) {
    override fun toString(): String = "BrowserArgs($mode, $url, watch=$watchId, source=$sourceId)"
}

@Serializable
data class BrowserResult(
    val mode: BrowserMode,
    /** BROWSE: "Watch this" was tapped on this URL. */
    val watchUrl: String? = null,
    /** PICK / RECORD: the element to read and the value it showed. */
    val fingerprint: ElementFingerprint? = null,
    val spec: ExtractionSpec? = null,
    val reading: Reading? = null,
    /** PICK: the user chose "Add steps" (value only appears after interaction). */
    val wantsSteps: Boolean = false,
    /** RECORD / REPLAY / REPAIR_STEP. */
    val recipe: Recipe? = null,
    val replayConfirmed: Boolean = false,
    /** Words the safety interlock matched and the user overrode by typing "understood". */
    val overriddenWords: List<String> = emptyList(),
    /** RECORD: requests that returned the value directly (offer "check that request directly"). */
    val promotions: List<PromotionCandidateDto> = emptyList(),
    /** RESOLVE_BLOCK: the user tapped "Resume checks". */
    val resume: Boolean = false,
    val repairedStep: Step? = null,
    val repairedStepIndex: Int? = null,
    val finalUrl: String? = null,
)

@Serializable
data class PromotionCandidateDto(
    val url: String,
    val method: String,
    val jsonPath: String,
    val sampleValue: Double,
    val requestBody: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val score: Double,
) {
    companion object {
        fun from(c: PromotionCandidate) = PromotionCandidateDto(c.url, c.method, c.jsonPath, c.sampleValue, c.requestBody, c.headers, c.score)
    }
}

object BrowserIntents {
    const val EXTRA_ARGS = "app.tidemark.browser.ARGS"
    const val EXTRA_RESULT = "app.tidemark.browser.RESULT"

    fun intent(context: Context, args: BrowserArgs): Intent =
        Intent(context, BrowserActivity::class.java).putExtra(EXTRA_ARGS, TidemarkJson.encodeToString(BrowserArgs.serializer(), args))

    fun args(intent: Intent): BrowserArgs? =
        intent.getStringExtra(EXTRA_ARGS)?.let { runCatching { TidemarkJson.decodeFromString(BrowserArgs.serializer(), it) }.getOrNull() }

    fun resultIntent(result: BrowserResult): Intent =
        Intent().putExtra(EXTRA_RESULT, TidemarkJson.encodeToString(BrowserResult.serializer(), result))

    fun result(intent: Intent?): BrowserResult? =
        intent?.getStringExtra(EXTRA_RESULT)?.let { runCatching { TidemarkJson.decodeFromString(BrowserResult.serializer(), it) }.getOrNull() }
}

/** Launch any browser mode and get its result (null when the user backed out). */
class OpenBrowser : ActivityResultContract<BrowserArgs, BrowserResult?>() {
    override fun createIntent(context: Context, input: BrowserArgs): Intent = BrowserIntents.intent(context, input)
    override fun parseResult(resultCode: Int, intent: Intent?): BrowserResult? =
        if (resultCode == android.app.Activity.RESULT_OK) BrowserIntents.result(intent) else null
}
