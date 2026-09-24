package app.tidemark.checker

import android.webkit.WebView
import app.tidemark.core.model.Recipe
import java.time.LocalDate

/** Result of replaying a recipe in a WebView. */
sealed interface RecipeRunResult {
    /**
     * Every step ran; the page is ready to be read (the Extract step's target, if any, is marked
     * `data-tm-picked`). [degradedSteps] only matched through a fallback locator (early fragility warning).
     */
    data class Completed(val finalUrl: String, val degradedSteps: List<Int> = emptyList()) : RecipeRunResult

    /** A step failed. The page must NOT be read ("abort means abort"). */
    data class Aborted(val stepIndex: Int, val reason: String, val screenshotPath: String?) : RecipeRunResult

    /** A run landed on a cart/checkout/payment URL and stopped. */
    data class Transactional(val url: String) : RecipeRunResult

    /** The element a step resolved to looks like buy/book/submit and wasn't overridden. Stopped before pressing it. */
    data class Unsafe(val stepIndex: Int, val phrase: String) : RecipeRunResult
}

/**
 * Replays recipe steps in a WebView (checker process, main thread). Implemented by the browser
 * package (it shares the target-finding JavaScript with the recorder); called by the checker for
 * scheduled recipe checks and by the browser's REPLAY mode.
 *
 * Safety: before every Click, Select, or Type with pressEnter, SafetyInterlock.scan runs on the resolved
 * element's accessible name, text and value (and, for pressEnter, its form's submit button); a phrase not in
 * recipe.overriddenWords → [RecipeRunResult.Unsafe]. After every step, UrlGuard.isTransactional on the current
 * URL → [RecipeRunResult.Transactional]. Before a failure screenshot, every input typed from a Secret and every
 * password field is masked.
 */
object RecipeRunner {
    /**
     * Run [recipe] in [webView] (already created and configured for FULL loading). [secret] resolves
     * secret ids. [onStep] is called before each step (index, plain sentence) for the visible replay.
     * Screenshots of failures are written under [screenshotDir].
     */
    suspend fun run(
        webView: WebView,
        recipe: Recipe,
        today: LocalDate,
        secret: (String) -> String?,
        screenshotDir: java.io.File,
        onStep: (Int, String) -> Unit = { _, _ -> },
    ): RecipeRunResult = TODO("browser package")
}
