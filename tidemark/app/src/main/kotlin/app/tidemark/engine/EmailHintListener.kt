package app.tidemark.engine

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Optional (Settings > Flights > Use Google's price-alert emails). Reads Gmail notifications that look
 * like Google Flights price alerts and triggers an immediate check of the matching flight watch.
 * A hint never alerts on its own.
 */
class EmailHintListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?): Unit = TODO("engine package")
}
