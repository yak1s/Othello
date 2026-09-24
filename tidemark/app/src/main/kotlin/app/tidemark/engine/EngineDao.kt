package app.tidemark.engine

import androidx.room.Dao

/**
 * Extra queries owned by the engine package (A3). Add any query this package needs here
 * (the shared DAOs in data/db/Daos.kt are frozen). Registered in TidemarkDatabase.
 */
@Dao
interface EngineDao
