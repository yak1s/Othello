package app.tidemark.data.db

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import androidx.room.Upsert
import app.tidemark.core.model.WatchStatus
import kotlinx.coroutines.flow.Flow

/** A watch row plus what the list needs from other tables. */
data class WatchListRow(
    val id: Long,
    val name: String,
    val kind: app.tidemark.core.model.ValueKind,
    val status: WatchStatus,
    val value: Double?,
    val currency: String?,
    val inStock: Boolean?,
    val valueText: String?,
    val previousValue: Double?,
    val unseenMove: Boolean,
    val flashAt: Long?,
    val collectionId: Long?,
    val collectionColorIndex: Int?,
    val collectionName: String?,
    val storeName: String?,
    val lastCheckedAt: Long?,
    val nextCheckAt: Long?,
    val lastChangedAt: Long?,
    val snoozedUntil: Long?,
    val sprintUntil: Long?,
    val healthScore: Int,
    val sortOrder: Int,
    val urgent: Boolean,
)

/** One point for list sparklines. */
data class SparkPoint(val watchId: Long, val at: Long, val number: Double)

@Dao
interface WatchDao {
    @Insert suspend fun insert(watch: WatchEntity): Long
    @Update suspend fun update(watch: WatchEntity)
    @Delete suspend fun delete(watch: WatchEntity)

    @Query("SELECT * FROM watches WHERE id = :id") suspend fun get(id: Long): WatchEntity?
    @Query("SELECT * FROM watches WHERE id = :id") fun observe(id: Long): Flow<WatchEntity?>
    @Query("SELECT * FROM watches WHERE id IN (:ids)") suspend fun getAll(ids: List<Long>): List<WatchEntity>
    @Query("SELECT * FROM watches WHERE archived = 0 ORDER BY sortOrder, id") suspend fun allActive(): List<WatchEntity>
    @Query("SELECT * FROM watches WHERE archived = 0 ORDER BY sortOrder, id") fun observeActive(): Flow<List<WatchEntity>>
    @Query("SELECT * FROM watches WHERE archived = 1 ORDER BY updatedAt DESC") fun observeArchived(): Flow<List<WatchEntity>>
    @Query("SELECT COUNT(*) FROM watches WHERE archived = 0") suspend fun countActive(): Int
    @Query("SELECT COUNT(*) FROM watches WHERE archived = 0") fun observeCountActive(): Flow<Int>

    @Query(
        """
        SELECT w.id, w.name, w.kind, w.status, w.value, w.currency, w.inStock, w.valueText, w.previousValue,
               w.unseenMove, w.flashAt, w.collectionId, c.colorIndex AS collectionColorIndex, c.name AS collectionName,
               s.storeName AS storeName, w.lastCheckedAt, w.nextCheckAt, w.lastChangedAt, w.snoozedUntil,
               w.sprintUntil, w.healthScore, w.sortOrder, w.urgent
        FROM watches w
        LEFT JOIN collections c ON c.id = w.collectionId
        LEFT JOIN sources s ON s.id = COALESCE(w.winningSourceId, (SELECT MIN(id) FROM sources WHERE watchId = w.id))
        WHERE w.archived = 0
        """
    )
    fun observeListRows(): Flow<List<WatchListRow>>

    /** Watches due for a scheduled check at or before [until]: armed, not archived, not snoozed past [now]. */
    @Query(
        """
        SELECT * FROM watches
        WHERE archived = 0 AND status != 'PAUSED'
          AND (snoozedUntil IS NULL OR snoozedUntil <= :now)
          AND (nextCheckAt IS NULL OR nextCheckAt <= :until)
        ORDER BY nextCheckAt
        """
    )
    suspend fun due(now: Long, until: Long): List<WatchEntity>

    @Query("SELECT MIN(nextCheckAt) FROM watches WHERE archived = 0 AND status != 'PAUSED'")
    suspend fun earliestNextCheck(): Long?

    @Query("SELECT MIN(nextCheckAt) FROM watches WHERE archived = 0 AND status != 'PAUSED'")
    fun observeEarliestNextCheck(): Flow<Long?>

    @Query("SELECT * FROM watches WHERE sprintUntil IS NOT NULL AND sprintUntil > :now")
    suspend fun sprinting(now: Long): List<WatchEntity>

    @Query("SELECT * FROM watches WHERE collectionId = :collectionId AND archived = 0 ORDER BY sortOrder, id")
    suspend fun inCollection(collectionId: Long): List<WatchEntity>

    @Query("UPDATE watches SET unseenMove = 0 WHERE unseenMove = 1")
    suspend fun clearUnseenMoves()

    @Query("UPDATE watches SET flashAt = NULL WHERE id = :id")
    suspend fun clearFlash(id: Long)

    @Query("SELECT COALESCE(MAX(sortOrder), 0) FROM watches")
    suspend fun maxSortOrder(): Int
}

@Dao
interface SourceDao {
    @Insert suspend fun insert(source: SourceEntity): Long
    @Insert suspend fun insertAll(sources: List<SourceEntity>): List<Long>
    @Update suspend fun update(source: SourceEntity)
    @Delete suspend fun delete(source: SourceEntity)
    @Query("SELECT * FROM sources WHERE id = :id") suspend fun get(id: Long): SourceEntity?
    @Query("SELECT * FROM sources WHERE watchId = :watchId ORDER BY id") suspend fun forWatch(watchId: Long): List<SourceEntity>
    @Query("SELECT * FROM sources WHERE watchId = :watchId ORDER BY id") fun observeForWatch(watchId: Long): Flow<List<SourceEntity>>
    @Query("SELECT * FROM sources WHERE host = :host") suspend fun forHost(host: String): List<SourceEntity>
    @Query("SELECT * FROM sources WHERE recipeId = :recipeId") suspend fun forRecipe(recipeId: Long): List<SourceEntity>
    @Query("SELECT * FROM sources") suspend fun all(): List<SourceEntity>
}

@Dao
interface ReadingDao {
    @Insert suspend fun insert(reading: ReadingEntity): Long

    @Query("SELECT * FROM readings WHERE watchId = :watchId AND sourceId IS NULL ORDER BY at")
    fun observeWatchHistory(watchId: Long): Flow<List<ReadingEntity>>

    @Query("SELECT * FROM readings WHERE watchId = :watchId AND sourceId IS NULL AND at >= :since ORDER BY at")
    suspend fun watchHistorySince(watchId: Long, since: Long): List<ReadingEntity>

    @Query("SELECT * FROM readings WHERE watchId = :watchId AND sourceId IS NULL ORDER BY at")
    suspend fun watchHistory(watchId: Long): List<ReadingEntity>

    @Query("SELECT * FROM readings WHERE sourceId = :sourceId ORDER BY at DESC LIMIT :limit")
    suspend fun recentForSource(sourceId: Long, limit: Int): List<ReadingEntity>

    /** Sparkline points for all active watches since [since]. */
    @Query(
        """
        SELECT r.watchId AS watchId, r.at AS at, r.number AS number FROM readings r
        JOIN watches w ON w.id = r.watchId
        WHERE r.sourceId IS NULL AND r.number IS NOT NULL AND r.at >= :since AND w.archived = 0
        ORDER BY r.watchId, r.at
        """
    )
    fun observeSparklines(since: Long): Flow<List<SparkPoint>>

    @Query("SELECT r.watchId AS watchId, r.at AS at, r.number AS number FROM readings r WHERE r.watchId = :watchId AND r.sourceId IS NULL AND r.number IS NOT NULL AND r.at >= :since ORDER BY r.at")
    suspend fun sparkline(watchId: Long, since: Long): List<SparkPoint>

    @Query("DELETE FROM readings WHERE watchId = :watchId")
    suspend fun deleteForWatch(watchId: Long)
}

@Dao
interface CheckLogDao {
    @Insert suspend fun insert(entry: CheckLogEntity): Long
    @Query("UPDATE check_log SET alertId = :alertId WHERE id IN (:ids)") suspend fun linkAlert(ids: List<Long>, alertId: Long)
    @Query("SELECT * FROM check_log WHERE watchId = :watchId ORDER BY at DESC, id DESC LIMIT :limit")
    fun observeForWatch(watchId: Long, limit: Int = 200): Flow<List<CheckLogEntity>>
    @Query("SELECT * FROM check_log ORDER BY at DESC, id DESC LIMIT :limit")
    fun observeRecent(limit: Int = 300): Flow<List<CheckLogEntity>>
    @Query("SELECT * FROM check_log WHERE watchId = :watchId ORDER BY at DESC, id DESC LIMIT :limit")
    suspend fun recentForWatch(watchId: Long, limit: Int): List<CheckLogEntity>
    @Query("SELECT * FROM check_log WHERE id = :id") suspend fun get(id: Long): CheckLogEntity?
    /** Keep the log bounded: drop entries older than [before] that aren't linked to an alert. */
    @Query("DELETE FROM check_log WHERE at < :before AND alertId IS NULL") suspend fun prune(before: Long): Int
    @Query("SELECT snapshotPath FROM check_log WHERE snapshotPath IS NOT NULL") suspend fun referencedSnapshots(): List<String>
}

@Dao
interface AlertDao {
    @Insert suspend fun insert(alert: AlertEntity): Long
    @Update suspend fun update(alert: AlertEntity)
    @Query("SELECT * FROM alerts WHERE id = :id") suspend fun get(id: Long): AlertEntity?
    @Query("SELECT * FROM alerts ORDER BY at DESC LIMIT :limit") fun observeRecent(limit: Int = 300): Flow<List<AlertEntity>>
    @Query("SELECT * FROM alerts WHERE acknowledged = 0 AND kind IN ('DROP','RESTOCK','NEW_ITEMS','CHANGE') ORDER BY at DESC")
    fun observeUnacknowledged(): Flow<List<AlertEntity>>
    @Query("SELECT COUNT(*) FROM alerts WHERE acknowledged = 0 AND kind IN ('DROP','RESTOCK','NEW_ITEMS','CHANGE')")
    suspend fun unacknowledgedCount(): Int
    @Query("SELECT COUNT(*) FROM alerts WHERE acknowledged = 0 AND kind IN ('DROP','RESTOCK','NEW_ITEMS','CHANGE')")
    fun observeUnacknowledgedCount(): Flow<Int>
    @Query("SELECT * FROM alerts WHERE watchId = :watchId ORDER BY at") fun observeForWatch(watchId: Long): Flow<List<AlertEntity>>
    @Query("SELECT * FROM alerts WHERE delivered = 0 ORDER BY at") suspend fun undelivered(): List<AlertEntity>
    @Query("SELECT * FROM alerts WHERE at >= :since AND delivered = 1 ORDER BY at") suspend fun deliveredSince(since: Long): List<AlertEntity>
    @Query("UPDATE alerts SET delivered = 1 WHERE id IN (:ids)") suspend fun markDelivered(ids: List<Long>)
    @Query("UPDATE alerts SET acknowledged = 1 WHERE id = :id") suspend fun acknowledge(id: Long)
    @Query("UPDATE alerts SET acknowledged = 1 WHERE watchId = :watchId") suspend fun acknowledgeWatch(watchId: Long)
    @Query("UPDATE alerts SET acknowledged = 1") suspend fun acknowledgeAll()
}

@Dao
interface CollectionDao {
    @Insert suspend fun insert(collection: CollectionEntity): Long
    @Update suspend fun update(collection: CollectionEntity)
    @Delete suspend fun delete(collection: CollectionEntity)
    @Query("SELECT * FROM collections ORDER BY sortOrder, id") fun observeAll(): Flow<List<CollectionEntity>>
    @Query("SELECT * FROM collections ORDER BY sortOrder, id") suspend fun all(): List<CollectionEntity>
    @Query("SELECT * FROM collections WHERE id = :id") suspend fun get(id: Long): CollectionEntity?
}

@Dao
interface ListingItemDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insertAll(items: List<ListingItemEntity>)
    @Query("SELECT itemId FROM listing_items WHERE watchId = :watchId") suspend fun knownIds(watchId: Long): List<String>
    @Query("SELECT * FROM listing_items WHERE watchId = :watchId ORDER BY firstSeenAt DESC LIMIT :limit")
    fun observeRecent(watchId: Long, limit: Int = 50): Flow<List<ListingItemEntity>>
}

@Dao
interface RecipeDao {
    @Insert suspend fun insert(recipe: RecipeEntity): Long
    @Update suspend fun update(recipe: RecipeEntity)
    @Delete suspend fun delete(recipe: RecipeEntity)
    @Query("SELECT * FROM recipes WHERE id = :id") suspend fun get(id: Long): RecipeEntity?
    @Query("SELECT * FROM recipes WHERE id = :id") fun observe(id: Long): Flow<RecipeEntity?>
    @Query("SELECT * FROM recipes WHERE siteHost = :host AND kind = 'LOGIN' LIMIT 1") suspend fun loginFor(host: String): RecipeEntity?
    @Query("SELECT * FROM recipes ORDER BY updatedAt DESC") fun observeAll(): Flow<List<RecipeEntity>>
    @Query("SELECT * FROM recipes") suspend fun all(): List<RecipeEntity>
}

@Dao
interface SecretDao {
    @Upsert suspend fun upsert(secret: SecretEntity)
    @Query("SELECT * FROM secrets WHERE id = :id") suspend fun get(id: String): SecretEntity?
    @Query("SELECT id, label, createdAt FROM secrets ORDER BY createdAt") fun observeLabels(): Flow<List<SecretLabel>>
    @Query("DELETE FROM secrets WHERE id = :id") suspend fun delete(id: String)
}

data class SecretLabel(val id: String, val label: String, val createdAt: Long)

@Dao
interface SiteDao {
    @Upsert suspend fun upsert(site: SiteEntity)
    @Query("SELECT * FROM sites WHERE host = :host") suspend fun get(host: String): SiteEntity?
    @Query("SELECT * FROM sites") suspend fun all(): List<SiteEntity>
}

@Dao
interface WidgetDao {
    @Upsert suspend fun upsert(widget: WidgetEntity)
    @Query("SELECT * FROM widgets WHERE appWidgetId = :id") suspend fun get(id: Int): WidgetEntity?
    @Query("SELECT * FROM widgets") suspend fun all(): List<WidgetEntity>
    @Query("SELECT * FROM widgets") fun observeAll(): Flow<List<WidgetEntity>>
    @Query("DELETE FROM widgets WHERE appWidgetId IN (:ids)") suspend fun delete(ids: List<Int>)
}

@Dao
interface FareDateDao {
    @Upsert suspend fun upsert(fare: FareDateEntity)
    @Query("SELECT * FROM fare_dates WHERE watchId = :watchId ORDER BY date") suspend fun forWatch(watchId: Long): List<FareDateEntity>
    @Query("SELECT * FROM fare_dates WHERE watchId = :watchId ORDER BY date") fun observeForWatch(watchId: Long): Flow<List<FareDateEntity>>
    @Query("DELETE FROM fare_dates WHERE watchId = :watchId AND date < :before") suspend fun pruneBefore(watchId: Long, before: String)
}

/** Multi-table writes that must be atomic. */
@Dao
abstract class TransactionsDao {
    @Insert abstract suspend fun insertWatch(watch: WatchEntity): Long
    @Insert abstract suspend fun insertSources(sources: List<SourceEntity>): List<Long>

    /** Insert a watch and its sources; returns the new watch id. Source watchIds are overwritten. */
    @Transaction
    open suspend fun insertWatchWithSources(watch: WatchEntity, sources: List<SourceEntity>): Long {
        val id = insertWatch(watch)
        insertSources(sources.map { it.copy(id = 0, watchId = id) })
        return id
    }
}
