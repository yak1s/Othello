package app.tidemark.ipc

import app.tidemark.core.pipeline.FetchOutcome

/**
 * Maps a checker reply onto core's [FetchOutcome] for the pipeline. Implemented by the checker
 * package; called by the engine.
 *  READ → Read(Found) · ELEMENT_MISSING → Read(ElementMissing) · NOTHING_FOUND → Read(NothingFound)
 *  NOT_MODIFIED → NotModified · BLOCKED → Blocked · ROBOTS_DISALLOWED → Failed(ROBOTS)
 *  RECIPE_ABORTED / TRANSACTIONAL_URL / LOGIN_REQUIRED → Failed(RECIPE_ABORTED)
 *  HTTP_ERROR → Failed(HTTP) · NETWORK_ERROR → Failed(NETWORK) · TIMEOUT → Failed(TIMEOUT)
 *  INTERNAL_ERROR → Failed(CHECKER_CRASHED)
 */
fun CheckResult.toFetchOutcome(): FetchOutcome = TODO("checker package")

/** Keys under which the engine puts fare API credentials into [CheckRequest.secrets]. */
object FareSecrets {
    const val KEY = "fare.key"
    const val SECRET = "fare.secret"
}
