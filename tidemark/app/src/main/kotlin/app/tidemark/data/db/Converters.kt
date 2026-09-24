package app.tidemark.data.db

import androidx.room.TypeConverter
import app.tidemark.core.model.ApiTap
import app.tidemark.core.model.ArmState
import app.tidemark.core.model.ExtractionSpec
import app.tidemark.core.model.FlightQuery
import app.tidemark.core.model.HealState
import app.tidemark.core.model.LadderState
import app.tidemark.core.model.Reading
import app.tidemark.core.model.Recipe
import app.tidemark.core.model.Rule
import app.tidemark.core.model.TidemarkStorageJson as TidemarkJson
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer

/** JSON columns for core model types (TidemarkStorageJson: defaults written). Enums are stored by name (Room default). */
class Converters {
    @TypeConverter fun ruleToJson(v: Rule?): String? = v?.let { TidemarkJson.encodeToString(Rule.serializer(), it) }
    @TypeConverter fun ruleFromJson(v: String?): Rule? = v?.let { TidemarkJson.decodeFromString(Rule.serializer(), it) }

    @TypeConverter fun armToJson(v: ArmState?): String? = v?.let { TidemarkJson.encodeToString(ArmState.serializer(), it) }
    @TypeConverter fun armFromJson(v: String?): ArmState? = v?.let { TidemarkJson.decodeFromString(ArmState.serializer(), it) }

    @TypeConverter fun specToJson(v: ExtractionSpec?): String? = v?.let { TidemarkJson.encodeToString(ExtractionSpec.serializer(), it) }
    @TypeConverter fun specFromJson(v: String?): ExtractionSpec? = v?.let { TidemarkJson.decodeFromString(ExtractionSpec.serializer(), it) }

    @TypeConverter fun ladderToJson(v: LadderState?): String? = v?.let { TidemarkJson.encodeToString(LadderState.serializer(), it) }
    @TypeConverter fun ladderFromJson(v: String?): LadderState? = v?.let { TidemarkJson.decodeFromString(LadderState.serializer(), it) }

    @TypeConverter fun healToJson(v: HealState?): String? = v?.let { TidemarkJson.encodeToString(HealState.serializer(), it) }
    @TypeConverter fun healFromJson(v: String?): HealState? = v?.let { TidemarkJson.decodeFromString(HealState.serializer(), it) }

    @TypeConverter fun flightToJson(v: FlightQuery?): String? = v?.let { TidemarkJson.encodeToString(FlightQuery.serializer(), it) }
    @TypeConverter fun flightFromJson(v: String?): FlightQuery? = v?.let { TidemarkJson.decodeFromString(FlightQuery.serializer(), it) }

    @TypeConverter fun tapToJson(v: ApiTap?): String? = v?.let { TidemarkJson.encodeToString(ApiTap.serializer(), it) }
    @TypeConverter fun tapFromJson(v: String?): ApiTap? = v?.let { TidemarkJson.decodeFromString(ApiTap.serializer(), it) }

    @TypeConverter fun readingToJson(v: Reading?): String? = v?.let { TidemarkJson.encodeToString(Reading.serializer(), it) }
    @TypeConverter fun readingFromJson(v: String?): Reading? = v?.let { TidemarkJson.decodeFromString(Reading.serializer(), it) }

    @TypeConverter fun recipeToJson(v: Recipe?): String? = v?.let { TidemarkJson.encodeToString(Recipe.serializer(), it) }
    @TypeConverter fun recipeFromJson(v: String?): Recipe? = v?.let { TidemarkJson.decodeFromString(Recipe.serializer(), it) }

    @TypeConverter fun stringsToJson(v: List<String>?): String? =
        v?.let { TidemarkJson.encodeToString(ListSerializer(String.serializer()), it) }

    @TypeConverter fun stringsFromJson(v: String?): List<String>? =
        v?.let { TidemarkJson.decodeFromString(ListSerializer(String.serializer()), it) }

    @TypeConverter fun longsToJson(v: List<Long>?): String? =
        v?.let { TidemarkJson.encodeToString(ListSerializer(Long.serializer()), it) }

    @TypeConverter fun longsFromJson(v: String?): List<Long>? =
        v?.let { TidemarkJson.decodeFromString(ListSerializer(Long.serializer()), it) }

    @TypeConverter fun intsToJson(v: List<Int>?): String? =
        v?.let { TidemarkJson.encodeToString(ListSerializer(Int.serializer()), it) }

    @TypeConverter fun intsFromJson(v: String?): List<Int>? =
        v?.let { TidemarkJson.decodeFromString(ListSerializer(Int.serializer()), it) }
}
