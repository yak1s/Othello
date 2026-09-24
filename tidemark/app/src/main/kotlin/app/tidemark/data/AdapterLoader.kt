package app.tidemark.data

import android.content.Context
import app.tidemark.core.adapters.AdapterRegistry
import app.tidemark.core.model.SiteAdapter

/**
 * Loads site adapters: the bundled assets/adapters/[*].json, then filesDir/adapters/[*].json (a file with the
 * same name overrides the bundled one), so new sites don't need an app update. Used by both processes.
 */
object AdapterLoader {
    fun load(context: Context): AdapterRegistry = TODO("data package")

    /** Validate and save a user-supplied adapter file into filesDir/adapters (Settings > Add site file). */
    fun install(context: Context, fileName: String, json: String): Result<SiteAdapter> = TODO("data package")

    /** Newest modification time of filesDir/adapters, so the checker can reload when it changes. */
    fun lastModified(context: Context): Long = TODO("data package")
}
