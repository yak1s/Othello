package app.tidemark.data

import app.tidemark.core.util.Clock
import app.tidemark.data.db.TidemarkDatabase
import java.io.InputStream
import java.io.OutputStream

data class ImportSummary(
    val watches: Int,
    val collections: Int,
    val recipes: Int,
    val skipped: Int,
    /** Imported recipes must be replayed visibly again before they run on a schedule. */
    val recipesNeedingReplay: Int = 0,
    /** Secret values are never exported; these recipes will ask for them again. */
    val secretsToReenter: Int = 0,
)

/**
 * Everything to one JSON file, any time (TidemarkStorageJson). Secrets are never exported: recipe steps keep
 * only the secret's id and label, ApiTap headers keep only `{secret:<id>}` placeholders. On import: fresh ids,
 * references remapped, SafetyInterlock.scanSteps re-run, verifiedAt cleared (a visible replay is required
 * again), overrides dropped unless re-typed; malformed rows (SerializationException or IllegalArgumentException)
 * are skipped and counted, never crash the import.
 */
class ExportImport(private val db: TidemarkDatabase, private val clock: Clock) {
    suspend fun export(out: OutputStream, includeHistory: Boolean = true): Int = TODO("data package")
    suspend fun import(input: InputStream): ImportSummary = TODO("data package")
}
