package app.tidemark.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * How a recipe finds an element, most robust first: accessible role + name, then visible text,
 * then label, then CSS path, then position. Auto-generated class names are never stored.
 */
@Serializable
data class Target(
    val role: String? = null,
    val name: String? = null,
    val text: String? = null,
    val label: String? = null,
    val cssPath: String? = null,
    /** Index among elements matching the other fields, the last resort. */
    val position: Int? = null,
    val tag: String? = null,
)

/** Where a typed value comes from. Dates are recalculated on every run. */
@Serializable
sealed interface ValueSource {
    @Serializable @SerialName("fixed")
    data class Fixed(val value: String) : ValueSource

    /** Asked once when the recipe is saved; [answer] holds the reply. */
    @Serializable @SerialName("ask_once")
    data class AskOnce(val prompt: String, val answer: String? = null) : ValueSource

    /** Stored in the Android Keystore-backed secret store; only [secretId] is ever serialised. */
    @Serializable @SerialName("secret")
    data class Secret(val secretId: String, val label: String) : ValueSource

    /** "today + 30", "today - 1", "today + 2 weeks"; formatted with [format] (java.time pattern). */
    @Serializable @SerialName("date")
    data class DateExpression(val expression: String, val format: String = "yyyy-MM-dd") : ValueSource
}

@Serializable
sealed interface Step {
    @Serializable @SerialName("open")
    data class Open(val url: String) : Step

    @Serializable @SerialName("wait_for")
    data class WaitFor(val target: Target, val timeoutMs: Long = 10_000) : Step

    @Serializable @SerialName("click")
    data class Click(val target: Target) : Step

    @Serializable @SerialName("type")
    data class Type(val target: Target, val value: ValueSource) : Step

    @Serializable @SerialName("select")
    data class Select(val target: Target, val option: String) : Step

    @Serializable @SerialName("set_date")
    data class SetDate(val target: Target, val value: ValueSource.DateExpression) : Step

    @Serializable @SerialName("scroll")
    data class Scroll(val target: Target? = null, val pixels: Int = 800) : Step

    /** Optional: banners are not always there, so a missing target is not a failure. */
    @Serializable @SerialName("dismiss")
    data class Dismiss(val target: Target) : Step

    /** Guardrail: abort the run unless [target] exists (and contains [text] when given). */
    @Serializable @SerialName("assert")
    data class Assert(val target: Target? = null, val text: String? = null, val urlContains: String? = null) : Step

    @Serializable @SerialName("extract")
    data class Extract(val target: Target, val kind: ValueKind) : Step
}

@Serializable
enum class RecipeKind {
    /** Replayed before reading the value. */
    VALUE,
    /** Session recipe: run only when the app detects it was logged out of the site. */
    LOGIN,
}

@Serializable
data class Recipe(
    val kind: RecipeKind,
    val siteHost: String,
    val steps: List<Step>,
    /** Words the safety interlock matched and the user overrode by typing "understood". Shown on the watch forever. */
    val overriddenWords: List<String> = emptyList(),
)
