package app.tidemark.data

import app.tidemark.core.util.Clock
import app.tidemark.data.db.TidemarkDatabase
import java.io.InputStream
import java.io.OutputStream

data class ImportSummary(val watches: Int, val collections: Int, val recipes: Int, val skipped: Int)

/** Everything to one JSON file, any time. Secrets are never exported (recipe steps keep only the secret's label). */
class ExportImport(private val db: TidemarkDatabase, private val clock: Clock) {
    suspend fun export(out: OutputStream, includeHistory: Boolean = true): Int = TODO("data package")
    suspend fun import(input: InputStream): ImportSummary = TODO("data package")
}
