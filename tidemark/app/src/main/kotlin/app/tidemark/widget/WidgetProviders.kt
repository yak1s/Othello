package app.tidemark.widget

import android.appwidget.AppWidgetProvider

/** Board (4x2 to 4x4, 3-8 rows on the shared numeric rail). */
class BoardWidgetProvider : AppWidgetProvider()

/** Single (2x2): one watch, big number, sparkline. */
class SingleWidgetProvider : AppWidgetProvider()

/** Stock light (2x1): one yes/no watch as a large shape, readable across the room. */
class StockLightWidgetProvider : AppWidgetProvider()

/** Fare strip (4x2): cheapest date in a window with a tiny 7-day bar chart. */
class FareStripWidgetProvider : AppWidgetProvider()
