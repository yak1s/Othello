package app.tidemark.core.recipe

import app.tidemark.core.model.Recipe
import app.tidemark.core.model.Step
import app.tidemark.core.model.Target
import app.tidemark.core.model.ValueSource
import java.time.LocalDate

/**
 * The safety interlock. Automations read; they never buy, book, bid, or submit. Every button a recipe
 * clicks is scanned; a match blocks saving unless the user types "understood" (the override is shown
 * on the watch permanently).
 */
object SafetyInterlock {
    /** Matched as whole words/phrases, case-insensitive, also in common translations (de, fr, es, it, nl). */
    val DANGEROUS_PHRASES: List<String> = listOf(
        "buy", "buy now", "checkout", "check out", "pay", "pay now", "place order", "order now", "purchase",
        "book", "book now", "reserve", "bid", "place bid", "delete", "remove", "submit", "confirm order",
        "add to cart", "add to bag", "add to basket", "add to trolley", "subscribe", "donate", "sign up",
    )
    const val OVERRIDE_WORD = "understood"

    /** Phrases matched in [text] (a button's accessible name, visible text, value or aria-label). */
    fun scan(text: String): List<String> = TODO("recipe package")

    /** All phrases matched by any Click/Select/Type-submit step target in [steps]. */
    fun scanSteps(steps: List<Step>): List<String> = TODO("recipe package")

    fun isOverride(typed: String): Boolean = typed.trim().equals(OVERRIDE_WORD, ignoreCase = true)
}

/** Abort a run that lands on a cart, checkout, or payment URL. */
object UrlGuard {
    fun isTransactional(url: String): Boolean = TODO("recipe package")
}

/** Date expressions for typed values: "today", "today + 30", "today - 1", "today + 2 weeks", "today + 1 month". */
object DateExpr {
    fun isValid(expression: String): Boolean = TODO("recipe package")
    fun evaluate(expression: String, today: LocalDate): LocalDate = TODO("recipe package")
}

/** Resolves a [ValueSource] to the text to type. Secrets come from [secret]; never logged. */
object ValueResolver {
    fun resolve(source: ValueSource, today: LocalDate, secret: (String) -> String?): String? = TODO("recipe package")
}

/** Plain sentences for the step list, never code: click "UK 10", type your postcode into "Postcode". */
object StepSentences {
    fun describe(step: Step): String = TODO("recipe package")
    fun describeTarget(target: Target): String = TODO("recipe package")
}

data class FragilityReport(
    /** 0 = sturdy, 1 = about to break. Warn at 0.5 and above. */
    val score: Double,
    /** One plain sentence per weak step ("Step 3 finds its button by position only"). */
    val warnings: List<String>,
)

/** Warn before a recipe breaks: position-only targets, css-only targets, long waits, many steps. */
object Fragility {
    fun assess(recipe: Recipe, recentFailures: Int = 0): FragilityReport = TODO("recipe package")
}

/** A network response the recorder captured (fetch/XHR), trimmed. */
data class CapturedResponse(
    val url: String,
    val method: String,
    val status: Int,
    val contentType: String?,
    val body: String,
    val requestHeaders: Map<String, String> = emptyMap(),
    val requestBody: String? = null,
)

/** A request that returns the tracked value directly: the recipe can be promoted to an API tap. */
data class PromotionCandidate(
    val url: String,
    val method: String,
    val jsonPath: String,
    val sampleValue: Double,
    val requestBody: String? = null,
    val headers: Map<String, String> = emptyMap(),
    /** Higher is better: GET, JSON, short path, value appears once, no volatile tokens in the URL. */
    val score: Double,
)

/**
 * Promotion: while recording, find the tracked value in the page's own network requests. A
 * six-second browser session becomes a tiny, fast check, with the recipe kept as a backup.
 */
object PromotionFinder {
    fun find(value: Double, responses: List<CapturedResponse>): List<PromotionCandidate> = TODO("recipe package")
}
