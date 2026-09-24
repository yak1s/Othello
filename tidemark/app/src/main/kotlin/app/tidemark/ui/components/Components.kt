package app.tidemark.ui.components

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.tidemark.core.model.Rule
import app.tidemark.core.model.ValueKind
import app.tidemark.core.model.WatchStatus
import app.tidemark.data.Density

/*
 * Design-system components (ui-theme package owns the bodies). Screens use only these plus
 * Compose foundation; no Material components leak their look into the app.
 */

/** Filled square armed, hollow paused, half snoozed, slash broken, caret needs attention. Ink, never color-only. */
@Composable
fun StatusShape(status: WatchStatus, modifier: Modifier = Modifier, size: Dp = 10.dp): Unit = TODO("ui-theme package")

/**
 * A dense list row. Every value is right-aligned on the shared numeric rail; the change column sits
 * to the right of the rail; a thin collection strip on the leading edge; alternating bands come from
 * [index]. Swipe right = check now, swipe left = snooze menu, long-press = multi-select.
 */
@Composable
fun WatchRow(
    model: WatchRowModel,
    density: Density,
    index: Int,
    selected: Boolean,
    selectionMode: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onSwipeCheck: () -> Unit,
    onSwipeSnooze: () -> Unit,
    modifier: Modifier = Modifier,
): Unit = TODO("ui-theme package")

/** Unacknowledged alerts at the top of the list; zero height when empty. */
@Composable
fun NowStrip(items: List<NowItem>, onOpen: (watchId: Long) -> Unit, onDismiss: (alertId: Long) -> Unit, modifier: Modifier = Modifier): Unit =
    TODO("ui-theme package")

@Composable
fun Sparkline(points: List<Float>, modifier: Modifier = Modifier): Unit = TODO("ui-theme package")

/**
 * History chart. Drag to scrub ([onScrub] with the nearest point, null on release; haptic ticks);
 * long-press to set a threshold at that value ([onSetThreshold]); alerts drawn as marks ([onMarkTap]).
 */
@Composable
fun HistoryChart(
    points: List<ChartPoint>,
    marks: List<ChartMark>,
    threshold: Double?,
    modifier: Modifier = Modifier,
    onScrub: (ChartPoint?) -> Unit = {},
    onSetThreshold: (Double) -> Unit = {},
    onMarkTap: (ChartMark) -> Unit = {},
): Unit = TODO("ui-theme package")

/** Floating bottom pill: Watches / Activity / Settings with a fused round +. Hides on scroll down. */
@Composable
fun FloatingBottomPill(
    selected: MainTab,
    visible: Boolean,
    onSelect: (MainTab) -> Unit,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
): Unit = TODO("ui-theme package")

/** Floating top pill: search, filter count, "next check in 4m" ticker; expands into filters and sort. */
@Composable
fun FloatingTopPill(
    query: String,
    onQueryChange: (String) -> Unit,
    filterCount: Int,
    ticker: String?,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    expandedContent: @Composable ColumnScope.() -> Unit = {},
): Unit = TODO("ui-theme package")

/** The thin progress line used instead of shimmer skeletons. */
@Composable
fun ProgressLine(active: Boolean, modifier: Modifier = Modifier): Unit = TODO("ui-theme package")

enum class ButtonKind { PRIMARY, SECONDARY, QUIET, DANGER }

@Composable
fun TmButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.PRIMARY,
    enabled: Boolean = true,
): Unit = TODO("ui-theme package")

@Composable
fun TmTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    numeric: Boolean = false,
    label: String? = null,
): Unit = TODO("ui-theme package")

/** Bottom sheet with 3dp corners, 220 ms. Swipe down to close. */
@Composable
fun TmSheet(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit): Unit = TODO("ui-theme package")

@Composable
fun TmToggleRow(title: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier, detail: String? = null): Unit =
    TODO("ui-theme package")

/** A tappable settings/option row: title on the left, current value on the right. */
@Composable
fun TmChoiceRow(title: String, value: String?, onClick: () -> Unit, modifier: Modifier = Modifier, detail: String? = null): Unit =
    TODO("ui-theme package")

/** A pick-one list shown in a sheet. */
@Composable
fun <T> TmChoiceSheet(title: String, options: List<T>, label: (T) -> String, selected: T?, onPick: (T) -> Unit, onDismiss: () -> Unit): Unit =
    TODO("ui-theme package")

/**
 * The rule as a sentence with tappable parts, never a visual builder. At most two clauses:
 * "Tell me when [the price drops] [below the 7-day median]" + "[and] [it's in stock]".
 */
@Composable
fun RuleEditor(rule: Rule, kind: ValueKind, currency: String?, onChange: (Rule) -> Unit, modifier: Modifier = Modifier): Unit =
    TODO("ui-theme package")

/** Plain one-line empty state with one button. */
@Composable
fun EmptyState(line: String, action: String?, onAction: () -> Unit, modifier: Modifier = Modifier): Unit = TODO("ui-theme package")

/**
 * The one exception to "motion only responds to actions": count from [from] to [to] once (600 ms) when
 * [animate]; otherwise (or under reduced motion, or when [from] is null) show [format] of [to] directly.
 */
@Composable
fun CountingText(
    from: Double?,
    to: Double,
    format: (Double) -> String,
    animate: Boolean,
    modifier: Modifier = Modifier,
    style: androidx.compose.ui.text.TextStyle? = null,
): Unit = TODO("ui-theme package")

/**
 * A generic row on the numeric rail (Now strip, Activity, detail sources and check log): [leading] content
 * on the left, [value] right-aligned to the rail (on a Signal plate when [accent]), [delta] in the change
 * column. Bands alternate by [index].
 */
@Composable
fun RailRow(
    index: Int,
    value: String,
    modifier: Modifier = Modifier,
    delta: String = "",
    direction: Direction = Direction.NONE,
    accent: Boolean = false,
    height: Dp = 44.dp,
    onClick: (() -> Unit)? = null,
    leading: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit,
): Unit = TODO("ui-theme package")

/** Draws the continuous 1dp Rule line at the rail x behind a whole list (apply to the LazyColumn's container). */
fun Modifier.railLine(): Modifier = TODO("ui-theme package")
