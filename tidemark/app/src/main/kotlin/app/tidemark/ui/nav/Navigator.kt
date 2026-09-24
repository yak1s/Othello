package app.tidemark.ui.nav

import androidx.compose.runtime.staticCompositionLocalOf
import app.tidemark.ui.components.MainTab

/**
 * In-app navigation (ui-app package owns the implementation). Three tabs; everything else is a mode
 * entered in context and exited back to it. Screens get it from [LocalNavigator].
 */
interface Navigator {
    fun openTab(tab: MainTab)

    /** Open detail; [orderedIds] is the current list order so detail can swipe sideways between watches. */
    fun openDetail(watchId: Long, orderedIds: List<Long> = listOf(watchId))

    /** Open the add sheet, optionally prefilled (share sheet, clipboard chip, "Watch this"). */
    fun openAdd(url: String? = null)

    /** Duplicate an existing watch into the add sheet. */
    fun openDuplicate(watchId: Long)

    fun openSprint(watchId: Long)

    /** Close the top-most mode (detail, sheet). Returns false when already at a tab root. */
    fun back(): Boolean
}

val LocalNavigator = staticCompositionLocalOf<Navigator> { error("Navigator missing") }
