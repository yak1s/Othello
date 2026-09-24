package app.tidemark.engine

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Foreground service (type dataSync) that exists only while a Sprint runs. */
class SprintService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = TODO("engine package")
}
