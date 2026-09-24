package app.tidemark.data

import android.content.Context
import java.io.File

/**
 * Snapshot files live in filesDir/snapshots and are shared by both processes (same app UID).
 * The checker writes them; the main process reads and prunes them.
 */
class Snapshots(private val context: Context) {
    val dir: File get() = TODO("data package")

    /** Read a gzipped snapshot as text (null if missing). */
    fun readText(path: String): String? = TODO("data package")

    /** Delete snapshots not in [keep], keeping at most [perSource] newest per source directory. */
    suspend fun prune(keep: Set<String>, perSource: Int = 20): Int = TODO("data package")

    companion object {
        /** Used by the checker process (no container there). */
        fun dirFor(context: Context): File = File(context.filesDir, "snapshots").apply { mkdirs() }
    }
}
