package app.tidemark.ui.detail

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Watch detail: big value and change, history chart (scrub, long-press threshold, alert marks),
 * conditions, sources, check log, bottom actions. Swipe down closes ([onClose]); swipe sideways
 * moves through [orderedIds]. Owned by the ui-screens package.
 */
@Composable
fun WatchDetailScreen(watchId: Long, orderedIds: List<Long>, onClose: () -> Unit, modifier: Modifier = Modifier): Unit =
    TODO("ui-screens package")
