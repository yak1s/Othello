package app.tidemark.widget

import android.content.Context
import android.widget.RemoteViews

/** One row of a Board-style RemoteViews list (Board widget and the shade board notification). */
data class BoardRow(
    val watchId: Long,
    val name: String,
    val valueText: String,
    val deltaText: String,
    /** -1 down, 0 none, 1 up (drops are Ink, rises Adverse; NUMBER watches Ink both ways). */
    val direction: Int,
    /** Sits on a Signal plate (moved since the app was last opened). */
    val accent: Boolean,
    val status: app.tidemark.core.model.WatchStatus,
    val collectionColorIndex: Int?,
    /** Where tapping the row goes (detail), and where tapping a restocked value goes (buy page), if anywhere. */
    val buyUrl: String? = null,
)

/** Renders Board rows with the shared rail geometry. Implemented by the widget package; the notify package uses it. */
object BoardRows {
    /** A RemoteViews list of up to [maxRows] rows, aligned on the rail, for [context]'s current night mode. */
    fun render(context: Context, rows: List<BoardRow>, maxRows: Int): RemoteViews = TODO("widget package")
}
