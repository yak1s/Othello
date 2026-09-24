package app.tidemark.ui

import androidx.room.Dao

/**
 * Extra queries owned by the ui-app package (A8: add, settings, onboarding, bulk, sprint). Add any query this package needs here
 * (the shared DAOs in data/db/Daos.kt are frozen). Registered in TidemarkDatabase.
 */
@Dao
interface AppUiDao
