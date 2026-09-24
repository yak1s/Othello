package app.tidemark

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import android.content.Context
import app.tidemark.core.Hello

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Text(Hello.hi()) }
    }
}

@Entity data class Probe(@PrimaryKey val id: Long, val name: String)
@Dao interface ProbeDao { @Query("SELECT * FROM Probe") suspend fun all(): List<Probe> }
@Database(entities = [Probe::class], version = 1) abstract class ProbeDb : RoomDatabase() { abstract fun dao(): ProbeDao }
class ProbeWorker(c: Context, p: WorkerParameters) : CoroutineWorker(c, p) { override suspend fun doWork() = Result.success() }
