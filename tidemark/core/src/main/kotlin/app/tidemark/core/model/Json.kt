package app.tidemark.core.model

import kotlinx.serialization.json.Json

/** The one Json configuration used for storage, IPC and export. Tolerant of unknown keys for forward compatibility. */
val TidemarkJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = false
    explicitNulls = false
    classDiscriminator = "type"
}

/**
 * Json for Room columns and export files: identical to [TidemarkJson] but writes defaults, so a later change
 * to a default value never silently changes the meaning of stored rules, ladders or exports.
 */
val TidemarkStorageJson: Json = Json(TidemarkJson) { encodeDefaults = true }
