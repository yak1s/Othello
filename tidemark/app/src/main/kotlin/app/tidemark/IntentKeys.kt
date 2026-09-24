package app.tidemark

/** Intent extras and actions shared across components. */
object IntentKeys {
    const val EXTRA_WATCH_ID = "app.tidemark.extra.WATCH_ID"
    const val EXTRA_ALERT_ID = "app.tidemark.extra.ALERT_ID"
    const val EXTRA_SOURCE_ID = "app.tidemark.extra.SOURCE_ID"
    const val EXTRA_URL = "app.tidemark.extra.URL"
    /** Open a tab: "watches", "activity", "settings". */
    const val EXTRA_TAB = "app.tidemark.extra.TAB"
    /** Open the add sheet with [EXTRA_URL] prefilled. */
    const val ACTION_ADD = "app.tidemark.action.ADD"
    const val ACTION_OPEN_WATCH = "app.tidemark.action.OPEN_WATCH"
    /** Open the in-app browser to clear a block for [EXTRA_SOURCE_ID]. */
    const val ACTION_RESOLVE_BLOCK = "app.tidemark.action.RESOLVE_BLOCK"
    /** Re-pick the element for a broken [EXTRA_SOURCE_ID] (old snapshot side by side). */
    const val ACTION_FIX_SOURCE = "app.tidemark.action.FIX_SOURCE"
    const val ACTION_START_SPRINT = "app.tidemark.action.START_SPRINT"
}
