package app.tidemark.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Reboot and app update: re-create the scheduling chain and refresh widgets. Never starts SprintService
 * (Android 15 forbids dataSync services from BOOT_COMPLETED): a sprint that was running is ended with its
 * closing summary.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent): Unit = TODO("engine package")
}
