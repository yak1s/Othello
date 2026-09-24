package app.tidemark.core.robots

/**
 * robots.txt per RFC 9309: groups by user-agent (case-insensitive product token match, "*" fallback),
 * Allow/Disallow with longest-match precedence (Allow wins ties), "*" wildcards and "$" end anchors,
 * percent-encoding normalisation. Unparsable or empty files allow everything.
 */
class RobotsTxt private constructor(private val groups: List<Group>) {
    internal data class Group(val agents: List<String>, val rules: List<Pair<Boolean, String>>)

    fun isAllowed(pathAndQuery: String, userAgent: String = "Tidemark"): Boolean = TODO("robots package")

    companion object {
        fun parse(text: String): RobotsTxt = TODO("robots package")
        val ALLOW_ALL: RobotsTxt = RobotsTxt(emptyList())
    }
}
