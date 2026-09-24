package app.tidemark.ui

import androidx.room.Dao

/**
 * Extra queries owned by the ui-screens package (A7: watches, detail, activity). Add any query this package needs here
 * (the shared DAOs in data/db/Daos.kt are frozen). Registered in TidemarkDatabase.
 */
@Dao
interface ScreensDao
