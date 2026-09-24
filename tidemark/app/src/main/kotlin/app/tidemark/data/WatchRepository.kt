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
import app.tidemark.browser.NewSecretDto
import app.tidemark.core.util.Clock
import app.tidemark.data.db.TidemarkDatabase
import kotlinx.coroutines.flow.SharedFlow

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
    /** Hotels: "Dates move with time" (see SourceEntity.urlTemplate / urlDates). */
    val urlTemplate: String? = null,
    val urlDates: List<String> = emptyList(),
    /** The ladder is built with core LadderPolicy.initial(kind, method, apiTap != null, recipeId != null, hasFareKey). */
    val hasFareKey: Boolean = false,
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

/** What changed, so the engine (reschedule), widgets, the tile and the shade board can react. */
sealed interface RepoChange {
    data class WatchesChanged(val ids: Set<Long>) : RepoChange
    /** Alerts were acknowledged (tile count, Now strip, widgets' accents). */
    data object AlertsChanged : RepoChange
    /** The user opened the app: widgets drop their "moved since you last looked" accents. */
    data object AppOpened : RepoChange
    /** Watches stopped (archived or deleted): cancel their notifications. */
    data class Stopped(val ids: Set<Long>) : RepoChange
    /** Schedule-relevant change (created, resumed, snoozed, profile changed): Engine.reschedule(). */
    data object ScheduleChanged : RepoChange
}

/**
 * Multi-table user commands. Reads go straight to the DAOs (Flows). Every command emits a [RepoChange];
 * Engine, WidgetUpdater and Notifier subscribe to [changes] in their onAppStart/ensureChannels.
 *
 * Rules that keep alerts honest: create, setRule and setThreshold reset the arm state to `ArmState()`
 * (unseeded) and clear lastAlertKey, so the first reading under a new rule only seeds. create, resume,
 * unsnooze and restore set nextCheckAt = now. snooze never stores WatchStatus.SNOOZED (it's derived from
 * snoozedUntil/snoozeUntilChange, see core effectiveStatus) and sets nextCheckAt = snoozedUntil.
 */
class WatchRepository(
    private val db: TidemarkDatabase,
    private val clock: Clock,
    private val secrets: SecretStore,
    private val settings: SettingsStore,
) {
    val changes: SharedFlow<RepoChange> get() = TODO("data package")

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

    /** Bring stopped (archived) watches back: unarchived, ARMED, due now. */
    suspend fun restore(watchIds: List<Long>): Unit = TODO("data package")

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

    /**
     * Save a recorded recipe (after the visible replay was confirmed) and attach it to [sourceId] if given.
     * [newSecrets] typed while recording are stored first (SecretStore.replace with their ids).
     */
    suspend fun saveRecipe(
        recipe: Recipe,
        name: String,
        verified: Boolean,
        sourceId: Long? = null,
        newSecrets: List<NewSecretDto> = emptyList(),
    ): Long = TODO("data package")

    /**
     * "Reads $20 now (was $249). Looks right?" → yes: store the source's last rejected reading as confirmed
     * (watch value, history row), clear the reject streak and re-arm the watch.
     */
    suspend fun acceptReading(sourceId: Long): Unit = TODO("data package")

    /** Promote a source to an API tap found by the recorder; the recipe stays as backup. */
    suspend fun promoteSource(sourceId: Long, tap: ApiTap, tapUrl: String): Unit = TODO("data package")
}
