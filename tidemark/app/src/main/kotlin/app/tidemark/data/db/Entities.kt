package app.tidemark.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import app.tidemark.core.model.AlertKind
import app.tidemark.core.model.ApiTap
import app.tidemark.core.model.ArmState
import app.tidemark.core.model.CheckReason
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.FetchMethod
import app.tidemark.core.model.FlightQuery
import app.tidemark.core.model.FrequencyProfile
import app.tidemark.core.model.HealState
import app.tidemark.core.model.LadderState
import app.tidemark.core.model.ReadVia
import app.tidemark.core.model.Reading
import app.tidemark.core.model.Recipe
import app.tidemark.core.model.RecipeKind
import app.tidemark.core.model.Rule
import app.tidemark.core.model.SourceKind
import app.tidemark.core.model.ValueKind
import app.tidemark.core.model.WatchStatus
import app.tidemark.core.pipeline.SourceHealth

enum class SelfTestState { NONE, RUNNING, PASSED, FAILED }

enum class WidgetType { BOARD, SINGLE, STOCK_LIGHT, FARE_STRIP }

/**
 * One thing the user cares about. The latest confirmed watch-level value is denormalised onto the
 * row so the list, widgets and notifications render without joins.
 */
@Entity(
    tableName = "watches",
    indices = [Index("collectionId"), Index("nextCheckAt"), Index("archived")],
)
data class WatchEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val kind: ValueKind,
    val rule: Rule,
    val profile: FrequencyProfile = FrequencyProfile.NORMAL,
    val status: WatchStatus = WatchStatus.ARMED,
    val collectionId: Long? = null,
    /** Urgent watches use the alarm-style channel and ignore quiet hours and low-battery rules. */
    val urgent: Boolean = false,
    val snoozedUntil: Long? = null,
    /** "Snooze until it changes": wakes on the next confirmed change. */
    val snoozeUntilChange: Boolean = false,
    val sprintUntil: Long? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val lastCheckedAt: Long? = null,
    val nextCheckAt: Long? = null,
    val lastChangedAt: Long? = null,
    val value: Double? = null,
    val currency: String? = null,
    val inStock: Boolean? = null,
    /** Short display text for TEXT/ITEMS watches ("Changed", "3 new"). */
    val valueText: String? = null,
    val previousValue: Double? = null,
    val lastReading: Reading? = null,
    val winningSourceId: Long? = null,
    val arm: ArmState = ArmState(),
    val lastAlertAt: Long? = null,
    val lastAlertKey: String? = null,
    /**
     * A drop/restock/new-items alert since the user last opened the app. For widgets and the shade board only;
     * the in-app list's accent comes from unacknowledged alerts (WatchListRow.unacknowledgedMove).
     */
    val unseenMove: Boolean = false,
    /** Epoch millis when the row should run its one-time "count + flash" motion; set only for accent kinds; cleared after. */
    val flashAt: Long? = null,
    /** 0..100, from recent check outcomes. */
    val healthScore: Int = 100,
    val effectiveProfile: FrequencyProfile? = null,
    /** Why adaptive timing changed the pace, shown in detail. */
    val adaptiveReason: String? = null,
    /** One-line status shown in detail ("Layout changed; re-found the price, tap to verify"). */
    val statusNote: String? = null,
    val selfTest: SelfTestState = SelfTestState.NONE,
    val imageUrl: String? = null,
    /** Small thumbnail downloaded by the checker (filesDir/thumbs/…), shown in the add sheet and detail. */
    val imagePath: String? = null,
    val sortOrder: Int = 0,
    /** Stopped, history kept. Hidden from the list and never checked. */
    val archived: Boolean = false,
    /** Words the recipe safety interlock matched and the user overrode. Shown on the watch permanently. */
    val overrideWords: List<String> = emptyList(),
    val robotsNoticeShown: Boolean = false,
)

@Entity(
    tableName = "sources",
    foreignKeys = [ForeignKey(entity = WatchEntity::class, parentColumns = ["id"], childColumns = ["watchId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("watchId"), Index("host")],
)
data class SourceEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val watchId: Long,
    val kind: SourceKind,
    /** Canonical URL. For FLIGHT sources this is informational; the search URL is rebuilt every check. */
    val url: String,
    val host: String,
    val storeName: String,
    val spec: ExtractionSpec,
    val ladder: LadderState,
    val flight: FlightQuery? = null,
    val apiTap: ApiTap? = null,
    val apiTapUrl: String? = null,
    val adapterName: String? = null,
    val recipeId: Long? = null,
    val etag: String? = null,
    val lastModified: String? = null,
    val lastReading: Reading? = null,
    val lastCheckedAt: Long? = null,
    val lastOkAt: Long? = null,
    val lastMethod: FetchMethod? = null,
    val health: SourceHealth = SourceHealth.OK,
    val heal: HealState? = null,
    val blockedSignal: String? = null,
    val robotsDisallowed: Boolean = false,
    val robotsOverride: Boolean = false,
    val typicalTextLength: Int? = null,
    val lastSnapshotPath: String? = null,
    /** Snapshot of the last good read, kept for re-picking a broken watch with the old page side by side. */
    val lastGoodSnapshotPath: String? = null,
    /** Consecutive sanity rejections and the last rejected reading (three identical ones ask the user). */
    val rejectStreak: Int = 0,
    val lastRejected: Reading? = null,
    val lastRejectReason: String? = null,
    /** Consecutive NothingFound / recipe aborts / 404s ("broken after two"). */
    val failureStreak: Int = 0,
    /**
     * Hotels and rentals: the URL with {checkin}/{checkout} placeholders (DateExpr values in [urlDates]),
     * rebuilt on every check like flights, so the dates roll forward. Null = use [url] as is.
     */
    val urlTemplate: String? = null,
    /** "name=expr" pairs for [urlTemplate] placeholders, e.g. "checkin=today + 30", "checkout=today + 33". */
    val urlDates: List<String> = emptyList(),
)

/** Confirmed history. Watch-level rows (sourceId null) feed the chart and baselines. */
@Entity(
    tableName = "readings",
    foreignKeys = [ForeignKey(entity = WatchEntity::class, parentColumns = ["id"], childColumns = ["watchId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index(value = ["watchId", "at"]), Index("sourceId")],
)
data class ReadingEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val watchId: Long,
    /** Null for the watch-level (aggregate) value. */
    val sourceId: Long? = null,
    val at: Long,
    val number: Double? = null,
    val currency: String? = null,
    val inStock: Boolean? = null,
    val textHash: String? = null,
    val keywordPresent: Boolean? = null,
    val text: String? = null,
    val method: FetchMethod? = null,
    val readVia: ReadVia? = null,
)

/** The visible check log: every request, what was read, and why it decided what it decided. */
@Entity(
    tableName = "check_log",
    foreignKeys = [ForeignKey(entity = WatchEntity::class, parentColumns = ["id"], childColumns = ["watchId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index(value = ["watchId", "at"]), Index("at")],
)
data class CheckLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val watchId: Long,
    val sourceId: Long? = null,
    val at: Long,
    val reason: CheckReason,
    /** FIRST, CONFIRM, STEP_DOWN_PROBE, or DECISION for the watch-level verdict line. */
    val purpose: String,
    val method: FetchMethod? = null,
    val ok: Boolean,
    val summary: String,
    val httpStatus: Int? = null,
    val durationMs: Long? = null,
    val bytes: Long? = null,
    val value: Double? = null,
    val currency: String? = null,
    val snapshotPath: String? = null,
    val alertId: Long? = null,
    /** What was fetched (flights and API taps fetch a different URL from the page). */
    val url: String? = null,
    val readVia: ReadVia? = null,
    val evidence: String? = null,
)

@Entity(
    tableName = "alerts",
    foreignKeys = [ForeignKey(entity = WatchEntity::class, parentColumns = ["id"], childColumns = ["watchId"], onDelete = ForeignKey.CASCADE)],
    indices = [Index("watchId"), Index("at"), Index("acknowledged")],
)
data class AlertEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val watchId: Long,
    val at: Long,
    val kind: AlertKind,
    val title: String,
    val text: String,
    val spoken: String,
    val value: Double? = null,
    val previousValue: Double? = null,
    val currency: String? = null,
    val storeName: String? = null,
    /** Where the main button goes (the buy page for restocks). */
    val url: String? = null,
    val ruleSentence: String? = null,
    val explanation: String? = null,
    val firstLogId: Long? = null,
    val confirmLogId: Long? = null,
    val firstReading: Reading? = null,
    val confirmReading: Reading? = null,
    /** NEW_ITEMS: only the new ones (the readings hold every item). */
    val newItemIds: List<String> = emptyList(),
    val acknowledged: Boolean = false,
    /** False while held by quiet hours; delivered in the digest afterwards. */
    val delivered: Boolean = true,
    val collectionId: Long? = null,
)

@Entity(tableName = "collections")
data class CollectionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    /** Index into the collection strip palette (DESIGN.md). */
    val colorIndex: Int,
    val sortOrder: Int = 0,
    val createdAt: Long,
)

/** Items already seen by a NEW_ITEMS watch, so only new ones alert. */
@Entity(
    tableName = "listing_items",
    primaryKeys = ["watchId", "itemId"],
    foreignKeys = [ForeignKey(entity = WatchEntity::class, parentColumns = ["id"], childColumns = ["watchId"], onDelete = ForeignKey.CASCADE)],
)
data class ListingItemEntity(
    val watchId: Long,
    val itemId: String,
    val title: String,
    val price: Double? = null,
    val currency: String? = null,
    val url: String? = null,
    val firstSeenAt: Long,
)

@Entity(tableName = "recipes", indices = [Index("siteHost")])
data class RecipeEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val siteHost: String,
    val kind: RecipeKind,
    val name: String,
    val recipe: Recipe,
    val createdAt: Long,
    val updatedAt: Long,
    /** Set after the visible replay was confirmed ("Found £129.00 — looks right?"). Required before scheduling. */
    val verifiedAt: Long? = null,
    val lastRunAt: Long? = null,
    val lastFailureStep: Int? = null,
    val lastFailureScreenshot: String? = null,
    val failureCount: Int = 0,
    val fragility: Double = 0.0,
    /** The request this recipe was promoted to, kept for monthly re-verification. */
    val promotedTap: ApiTap? = null,
    val promotedUrl: String? = null,
    val lastReverifiedAt: Long? = null,
    /** For LOGIN recipes: consecutive failed logins. Stops at two. */
    val loginFailures: Int = 0,
)

/** Keystore-encrypted secret values. Never exported, logged, or snapshotted. */
@Entity(tableName = "secrets")
data class SecretEntity(
    @PrimaryKey val id: String,
    val label: String,
    val ciphertext: ByteArray,
    val iv: ByteArray,
    val createdAt: Long,
) {
    override fun equals(other: Any?): Boolean = other is SecretEntity && other.id == id
    override fun hashCode(): Int = id.hashCode()
    override fun toString(): String = "SecretEntity(id=$id, label=$label)"
}

/** Per-site politeness and learning. */
@Entity(tableName = "sites")
data class SiteEntity(
    @PrimaryKey val host: String,
    /** Profile steps slower after blocks. */
    val penaltySteps: Int = 0,
    val lastBlockedAt: Long? = null,
    val backoffUntil: Long? = null,
    val backoffMillis: Long? = null,
    val lastRequestAt: Long? = null,
    /** Confirmed changes by local hour (24 buckets). */
    val changeHistogram: List<Int> = List(24) { 0 },
    val loginRecipeId: Long? = null,
    /**
     * After the user cleared a block in the in-app browser, the site's sources use the browser (LIGHT at least)
     * until this time: clearance cookies are tied to the browser and don't carry over to plain downloads.
     */
    val browserOnlyUntil: Long? = null,
)

@Entity(tableName = "widgets")
data class WidgetEntity(
    @PrimaryKey val appWidgetId: Int,
    val type: WidgetType,
    /** Ordered. */
    val watchIds: List<Long> = emptyList(),
    val collectionId: Long? = null,
    val createdAt: Long,
    val lastRenderedAt: Long? = null,
)

/** Cheapest fare per date in a flexible window (Fare strip widget, detail). */
@Entity(
    tableName = "fare_dates",
    primaryKeys = ["watchId", "date"],
    foreignKeys = [ForeignKey(entity = WatchEntity::class, parentColumns = ["id"], childColumns = ["watchId"], onDelete = ForeignKey.CASCADE)],
)
data class FareDateEntity(
    val watchId: Long,
    /** ISO yyyy-MM-dd. */
    val date: String,
    val price: Double? = null,
    val currency: String? = null,
    val checkedAt: Long,
)
