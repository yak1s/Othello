package app.tidemark.core.util

/** Injected time source so every rule, planner and pipeline is testable. Epoch millis. */
fun interface Clock {
    fun now(): Long

    companion object {
        val System: Clock = Clock { java.lang.System.currentTimeMillis() }
    }
}

const val MINUTE = 60_000L
const val HOUR = 60 * MINUTE
const val DAY = 24 * HOUR

fun median(values: List<Double>): Double? {
    if (values.isEmpty()) return null
    val s = values.sorted()
    val m = s.size / 2
    return if (s.size % 2 == 1) s[m] else (s[m - 1] + s[m]) / 2.0
}

/** Lowercase host without "www.", or null for unparsable URLs. */
fun hostOf(url: String): String? = runCatching {
    java.net.URI(url.trim()).host?.lowercase()?.removePrefix("www.")
}.getOrNull()

/** Short store label from a URL: "amazon" for www.amazon.co.uk, "ooni" for ooni.com. */
fun storeLabel(url: String): String {
    val host = hostOf(url) ?: return url
    val parts = host.split('.').filter { it.isNotBlank() }
    if (parts.size <= 1) return host
    val secondLevel = setOf("co", "com", "org", "net", "gov", "ac", "edu")
    val core = if (parts.size >= 3 && parts[parts.size - 2] in secondLevel) parts[parts.size - 3] else parts[parts.size - 2]
    return core
}
