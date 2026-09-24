package app.tidemark.checker

import android.webkit.WebView
import app.tidemark.core.model.Recipe
import java.time.LocalDate

/** Result of replaying a recipe in a WebView. */
sealed interface RecipeRunResult {
    /** Every step ran; the page is ready to be read (the Extract step's target, if any, is marked `data-tm-picked`). */
    data class Completed(val finalUrl: String) : RecipeRunResult

    /** A step failed. The page must NOT be read ("abort means abort"). */
    data class Aborted(val stepIndex: Int, val reason: String, val screenshotPath: String?) : RecipeRunResult

    /** A run landed on a cart/checkout/payment URL and stopped. */
    data class Transactional(val url: String) : RecipeRunResult
}

/**
 * Replays recipe steps in a WebView (checker process, main thread). Implemented by the browser
 * package (it shares the target-finding JavaScript with the recorder); called by the checker for
 * scheduled recipe checks and by the browser's REPLAY mode.
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
