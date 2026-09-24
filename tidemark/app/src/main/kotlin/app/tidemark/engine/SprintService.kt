package app.tidemark.engine

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * Foreground service (type dataSync) that exists only while a Sprint runs. One sprint at a time: starting
 * another replaces the running one (after its closing summary). Android 15+ gives dataSync services a
 * 6 h/24 h budget and calls [onTimeout]: end the sprint, post the summary, stop.
 */
class SprintService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = TODO("engine package")
    override fun onTimeout(startId: Int, fgsType: Int): Unit = TODO("engine package")
}
