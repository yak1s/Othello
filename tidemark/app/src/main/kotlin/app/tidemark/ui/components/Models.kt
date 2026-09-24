package app.tidemark.ui.components

import androidx.compose.runtime.Immutable
import app.tidemark.core.model.WatchStatus

enum class MainTab { WATCHES, ACTIVITY, SETTINGS }

enum class Direction { DOWN, UP, NONE }

/** Everything a list row (and a widget row) shows. Built by the watches screen from WatchListRow. */
@Immutable
data class WatchRowModel(
    val id: Long,
    val name: String,
    /** Store or source label ("amazon"), or null. */
    val store: String?,
    /** The value on the rail: "$179", "In stock", "3 new", "—" when unknown. */
    val valueText: String,
    /** Change column to the right of the rail: "↓ 28%", "↑ 4%", "". */
    val deltaText: String,
    val direction: Direction,
    /** A drop/restock/new-items the user hasn't acknowledged: the value sits on a Signal plate. */
    val accent: Boolean,
    val status: WatchStatus,
    /** Collection strip color index, or null for no collection. */
    val collectionColorIndex: Int?,
    /** Normalised 0..1 points for the Comfortable sparkline (empty = none). */
    val sparkline: List<Float>,
    /** A check is running: thin progress line in the row. */
    val checking: Boolean,
    /** Run the one-time trigger motion (count to the new value, flash, one haptic tap). */
    val flash: Boolean,
    /** Secondary line in Comfortable ("amazon · checks in 12m"); Table shows it as columns. */
    val meta: String?,
    /** Full screen-reader label ("Sony headphones, price dropped 28 percent, now 179 dollars"). */
    val spoken: String,
)

@Immutable
data class NowItem(val alertId: Long, val watchId: Long, val title: String, val valueText: String, val accent: Boolean)

@Immutable
data class ChartPoint(val at: Long, val value: Double)

/** An alert drawn on the chart; tapping explains why it fired. */
@Immutable
data class ChartMark(val alertId: Long, val at: Long, val value: Double, val label: String)
