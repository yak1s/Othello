package app.tidemark.data

import app.tidemark.core.model.ApiTap
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.FetchMethod
import app.tidemark.core.model.FlightQuery
import app.tidemark.core.model.FrequencyProfile
import app.tidemark.core.model.Recipe
import app.tidemark.core.model.Rule
import app.tidemark.core.model.SourceKind
import app.tidemark.core.model.ValueKind
import app.tidemark.core.util.Clock
import app.tidemark.data.db.TidemarkDatabase

data class SourceDraft(
    val kind: SourceKind,
    val url: String,
    val spec: ExtractionSpec,
    /** Starting rung of the fetch ladder (from the preview: the cheapest method that worked). */
    val method: FetchMethod = FetchMethod.PLAIN,
    val storeName: String? = null,
    val flight: FlightQuery? = null,
    val apiTap: ApiTap? = null,
    val apiTapUrl: String? = null,
    val adapterName: String? = null,
    val recipeId: Long? = null,
    val robotsDisallowed: Boolean = false,
    val robotsOverride: Boolean = false,
)

data class WatchDraft(
    val name: String,
    val kind: ValueKind,
    val rule: Rule,
    val sources: List<SourceDraft>,
    val profile: FrequencyProfile = FrequencyProfile.NORMAL,
    val collectionId: Long? = null,
    val urgent: Boolean = false,
    val imageUrl: String? = null,
    val overrideWords: List<String> = emptyList(),
    /** Seed values from the add-sheet preview, stored as the first (unconfirmed) display value. */
    val previewValue: Double? = null,
    val previewCurrency: String? = null,
    val previewInStock: Boolean? = null,
)

/** Multi-table user commands. Reads go straight to the DAOs (Flows). */
class WatchRepository(private val db: TidemarkDatabase, private val clock: Clock) {
    suspend fun create(draft: WatchDraft): Long = TODO("data package")
    suspend fun duplicate(watchId: Long): Long = TODO("data package")
    suspend fun rename(watchId: Long, name: String): Unit = TODO("data package")
    suspend fun setRule(watchId: Long, rule: Rule): Unit = TODO("data package")

    /** Long-press on the chart: make (or replace) a "below X" clause, keeping a second clause if present. */
    suspend fun setThreshold(watchId: Long, threshold: Double): Unit = TODO("data package")
    suspend fun setProfile(watchIds: List<Long>, profile: FrequencyProfile): Unit = TODO("data package")
    suspend fun setCollection(watchIds: List<Long>, collectionId: Long?): Unit = TODO("data package")
    suspend fun setUrgent(watchId: Long, urgent: Boolean): Unit = TODO("data package")
    suspend fun pause(watchIds: List<Long>): Unit = TODO("data package")
    suspend fun resume(watchIds: List<Long>): Unit = TODO("data package")

    /** [until] null with [untilChange] = true means "until it changes". */
    suspend fun snooze(watchId: Long, until: Long?, untilChange: Boolean = false): Unit = TODO("data package")
    suspend fun unsnooze(watchId: Long): Unit = TODO("data package")

    /** Stop watching. [keepHistory] archives (history kept, never checked); otherwise deletes everything. */
    suspend fun stop(watchIds: List<Long>, keepHistory: Boolean): Unit = TODO("data package")
    suspend fun reorder(orderedIds: List<Long>): Unit = TODO("data package")

    suspend fun acknowledgeAlert(alertId: Long): Unit = TODO("data package")
    suspend fun acknowledgeWatch(watchId: Long): Unit = TODO("data package")

    /** The user opened the app: clears the "moved since you last looked" accent (widgets). */
    suspend fun markAppOpened(): Unit = TODO("data package")

    suspend fun createCollection(name: String): Long = TODO("data package")
    suspend fun renameCollection(collectionId: Long, name: String): Unit = TODO("data package")
    suspend fun deleteCollection(collectionId: Long): Unit = TODO("data package")

    suspend fun addSource(watchId: Long, draft: SourceDraft): Long = TODO("data package")
    suspend fun removeSource(sourceId: Long): Unit = TODO("data package")

    /** The picker fixed a source: new spec, health back to OK, heal state cleared, watch status re-armed. */
    suspend fun updateSourceSpec(sourceId: Long, spec: ExtractionSpec, method: FetchMethod? = null): Unit = TODO("data package")
    suspend fun setRobotsOverride(sourceId: Long, allow: Boolean): Unit = TODO("data package")

    /** Save a recorded recipe (after the visible replay was confirmed) and attach it to [sourceId] if given. */
    suspend fun saveRecipe(recipe: Recipe, name: String, verified: Boolean, sourceId: Long? = null): Long = TODO("data package")

    /** Promote a source to an API tap found by the recorder; the recipe stays as backup. */
    suspend fun promoteSource(sourceId: Long, tap: ApiTap, tapUrl: String): Unit = TODO("data package")
}
