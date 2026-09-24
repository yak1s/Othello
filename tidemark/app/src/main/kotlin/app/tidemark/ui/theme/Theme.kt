package app.tidemark.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** The six-value palette per mode (DESIGN.md), plus the collection strip hues. */
@Immutable
data class TmColors(
    val ground: Color,
    val band: Color,
    val ink: Color,
    val inkMuted: Color,
    /** The rail axis only. */
    val rule: Color,
    /** Drops and restocks only. */
    val signal: Color,
    /** Text/icons placed on [signal]. */
    val onSignal: Color,
    /** Price rose / gone. */
    val adverse: Color,
    val onAdverse: Color,
    /** Collection identity strip colors, indexed by CollectionEntity.colorIndex. */
    val collection: List<Color>,
    val isDark: Boolean,
)

@Immutable
data class TmTypography(
    /** Detail header value: Archivo Expanded SemiBold. */
    val bigNumber: TextStyle,
    /** Values on the rail in Comfortable/Compact. */
    val rowValue: TextStyle,
    /** Values on the rail in Table density. */
    val rowValueDense: TextStyle,
    /** Screen and sheet titles. */
    val title: TextStyle,
    val body: TextStyle,
    val bodyStrong: TextStyle,
    /** Row names (Archivo regular width). */
    val rowName: TextStyle,
    /** Dense labels: store, next check, table columns (Archivo Narrow). */
    val dense: TextStyle,
    val denseStrong: TextStyle,
    val button: TextStyle,
)

object TmFonts {
    val expanded: FontFamily get() = TODO("ui-theme package")
    val regular: FontFamily get() = TODO("ui-theme package")
    val narrow: FontFamily get() = TODO("ui-theme package")
}

/** 4dp grid, 3dp corners, 44dp touch targets. */
object TmDimens {
    val grid: Dp = 4.dp
    val corner: Dp = 3.dp
    val gutter: Dp = 16.dp
    val touch: Dp = 44.dp
    val rowComfortable: Dp = 60.dp
    val rowCompact: Dp = 44.dp
    val rowTable: Dp = 36.dp
    /** Width of the change column to the right of the rail. */
    val deltaColumn: Dp = 60.dp
    /** Gap between a value's end and the rail line, and between the line and the change column. */
    val railGap: Dp = 6.dp
    val strip: Dp = 3.dp
}

/** Rail geometry. Every screen and component aligns values with this; widgets use res/values/dimens_rail.xml. */
object Rail {
    /** x of the rail line from the start edge, for a container [width] wide. */
    fun lineX(width: Dp): Dp = width - TmDimens.gutter - TmDimens.deltaColumn - TmDimens.railGap

    /** Where a right-aligned value ends. */
    fun valueEnd(width: Dp): Dp = lineX(width) - TmDimens.railGap

    /** Where the change column starts. */
    fun deltaStart(width: Dp): Dp = lineX(width) + TmDimens.railGap

    /** Padding from the end edge to the value's end (end-aligned layouts). */
    val valueEndPadding: Dp get() = TmDimens.gutter + TmDimens.deltaColumn + TmDimens.railGap * 2
}

/** 140 ms standard, 220 ms sheets, springy bottom bar. Respect reduced motion. */
object TmMotion {
    const val STANDARD_MS = 140
    const val SHEET_MS = 220
}

val LocalTmColors = staticCompositionLocalOf<TmColors> { error("TidemarkTheme missing") }
val LocalTmType = staticCompositionLocalOf<TmTypography> { error("TidemarkTheme missing") }

object Tm {
    val colors: TmColors @Composable get() = LocalTmColors.current
    val type: TmTypography @Composable get() = LocalTmType.current
}

object TmPalette {
    val Light: TmColors get() = TODO("ui-theme package")
    val Dark: TmColors get() = TODO("ui-theme package")
}

/** Follows system light/dark; never uses Material You wallpaper colors. */
@Composable
fun TidemarkTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit): Unit = TODO("ui-theme package")
