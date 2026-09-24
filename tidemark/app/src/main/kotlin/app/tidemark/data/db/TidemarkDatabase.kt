package app.tidemark.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [
        WatchEntity::class, SourceEntity::class, ReadingEntity::class, CheckLogEntity::class, AlertEntity::class,
        CollectionEntity::class, ListingItemEntity::class, RecipeEntity::class, SecretEntity::class, SiteEntity::class,
        WidgetEntity::class, FareDateEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class TidemarkDatabase : RoomDatabase() {
    abstract fun watches(): WatchDao
    abstract fun sources(): SourceDao
    abstract fun readings(): ReadingDao
    abstract fun checkLog(): CheckLogDao
    abstract fun alerts(): AlertDao
    abstract fun collections(): CollectionDao
    abstract fun listingItems(): ListingItemDao
    abstract fun recipes(): RecipeDao
    abstract fun secrets(): SecretDao
    abstract fun sites(): SiteDao
    abstract fun widgets(): WidgetDao
    abstract fun fareDates(): FareDateDao
    abstract fun transactions(): TransactionsDao

    // One extra DAO per package, so packages can add queries without editing shared files.
    abstract fun dataExtra(): app.tidemark.data.DataExtraDao
    abstract fun engineDao(): app.tidemark.engine.EngineDao
    abstract fun notifyDao(): app.tidemark.notify.NotifyDao
    abstract fun widgetQueries(): app.tidemark.widget.WidgetQueriesDao
    abstract fun screensDao(): app.tidemark.ui.ScreensDao
    abstract fun appUiDao(): app.tidemark.ui.AppUiDao

    companion object {
        /** Main process only. The checker process never opens the database. */
        fun create(context: Context): TidemarkDatabase =
            Room.databaseBuilder(context.applicationContext, TidemarkDatabase::class.java, "tidemark.db")
                .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING)
                .build()
    }
}
