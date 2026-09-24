package app.tidemark.core.model

import kotlinx.serialization.json.Json

/** The one Json configuration used for storage, IPC and export. Tolerant of unknown keys for forward compatibility. */
val TidemarkJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = false
    explicitNulls = false
    classDiscriminator = "type"
}
