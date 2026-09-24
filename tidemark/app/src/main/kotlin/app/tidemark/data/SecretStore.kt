package app.tidemark.data

import app.tidemark.data.db.SecretDao
import app.tidemark.data.db.SecretLabel
import kotlinx.coroutines.flow.Flow

/**
 * Secrets encrypted with an AES-GCM key held in the Android Keystore (alias "tidemark.secrets").
 * Values never appear in logs, snapshots, or exports.
 */
class SecretStore(private val dao: SecretDao) {
    /** Store [value] under a new id and return the id. */
    suspend fun put(label: String, value: String): String = TODO("data package")

    suspend fun replace(id: String, label: String, value: String): Unit = TODO("data package")

    suspend fun get(id: String): String? = TODO("data package")

    suspend fun delete(id: String): Unit = TODO("data package")

    fun labels(): Flow<List<SecretLabel>> = dao.observeLabels()

    /** Decrypt every id in [ids] (missing ones are skipped). For building a CheckRequest. */
    suspend fun resolveAll(ids: Collection<String>): Map<String, String> = TODO("data package")
}
