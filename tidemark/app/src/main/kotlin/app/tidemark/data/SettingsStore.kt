package app.tidemark.data

import android.content.Context
import app.tidemark.core.model.FareApi
import app.tidemark.core.model.FrequencyProfile
import kotlinx.coroutines.flow.Flow

enum class Density { COMFORTABLE, COMPACT, TABLE }

enum class SortOrder { RECENTLY_MOVED, BIGGEST_DROP, NEXT_CHECK, NAME, HEALTH }

data class Settings(
    val density: Density = Density.COMPACT,
    val sort: SortOrder = SortOrder.RECENTLY_MOVED,
    val defaultProfile: FrequencyProfile = FrequencyProfile.NORMAL,
    val adaptive: Boolean = true,
    val heavyChecksOnWifiOnly: Boolean = true,
    val lowBatteryPercent: Int = 15,
    val quietHoursEnabled: Boolean = false,
    /** Minutes after local midnight. */
    val quietStartMinutes: Int = 22 * 60,
    val quietEndMinutes: Int = 7 * 60,
    /** Opt-in, with an explanation: recent Android restricts full-screen alerts. */
    val fullScreenUrgent: Boolean = false,
    val dailyDigest: Boolean = false,
    val dailyDigestMinutes: Int = 9 * 60,
    /** Collection shown in the permanent "shade board" notification; null = off, -1 = all watches. */
    val shadeBoardCollectionId: Long? = null,
    /** Ingest Google Flights price-alert emails via notification access (hints only). */
    val emailHints: Boolean = false,
    val fareApi: FareApi? = null,
    /** Secret ids in [SecretStore] for the fare API (Amadeus uses both: client id + secret). */
    val fareApiKeyId: String? = null,
    val fareApiSecretId: String? = null,
    // One-time moments, never repeated.
    val welcomed: Boolean = false,
    val notificationPermissionAsked: Boolean = false,
    val batteryExplained: Boolean = false,
    val collectionsSuggested: Boolean = false,
    val lastOpenedAt: Long = 0,
    /** The last clipboard URL we offered, so the chip never nags twice for the same link. */
    val clipboardOffered: String? = null,
)

/** DataStore-backed settings. Main process only. */
class SettingsStore(private val context: Context) {
    val flow: Flow<Settings> get() = TODO("data package")

    suspend fun current(): Settings = TODO("data package")

    suspend fun update(transform: (Settings) -> Settings): Unit = TODO("data package")
}
