package expo.modules.semorarecorder

import android.content.Context
import android.content.Intent
import android.os.Build
import java.io.File

/**
 * The one lecture recording in this process. Lives outside the Expo module so
 * a module re-creation does not orphan a running microphone, and so the
 * foreground service can reach it.
 */
object LectureRecorderHost {
  interface Events {
    fun onChunkClosed(seq: Int, uri: String, seconds: Double, bytes: Long, hasGap: Boolean)
    fun onStopped(atMs: Double)
    fun onResumed(atMs: Double)
    fun onFailure(stage: String, code: String, message: String?)
    fun onInputChanged(name: String?, builtIn: Boolean)
    fun onStopRequested()
    fun onPauseToggleRequested()
    fun onMarkRequested()
  }

  data class NotificationState(
    val elapsedSeconds: Int = 0,
    val paused: Boolean = false,
    val micStopped: Boolean = false,
  )

  @Volatile var events: Events? = null
  @Volatile var capture: LectureCapture? = null
    private set
  @Volatile var title: String = ""
    private set
  @Volatile var strings: Map<String, String> = emptyMap()
    private set
  @Volatile var notificationState = NotificationState()
    private set

  /** The last capture's figures after Stop, until the next start (see getStatus). */
  data class FinalFigures(val nextSeq: Int, val closedSeconds: Double)
  @Volatile var finalFigures: FinalFigures? = null
    private set
  private var appContext: Context? = null

  fun isActive() = capture != null

  @Synchronized
  fun start(
    context: Context,
    directory: File,
    firstSeq: Int,
    chunkSeconds: Double,
    title: String,
    strings: Map<String, String>,
  ) {
    stopCapture()
    finalFigures = null
    val app = context.applicationContext
    appContext = app
    this.title = title
    this.strings = strings
    notificationState = NotificationState()

    val next = LectureCapture(app, directory, firstSeq, chunkSeconds, object : LectureCapture.Listener {
      override fun onChunkClosed(seq: Int, uri: String, seconds: Double, bytes: Long, hasGap: Boolean) {
        events?.onChunkClosed(seq, uri, seconds, bytes, hasGap)
      }
      override fun onStopped(atMs: Double) {
        events?.onStopped(atMs)
      }
      override fun onResumed(atMs: Double) {
        events?.onResumed(atMs)
      }
      override fun onFailure(stage: String, code: String, message: String?) {
        events?.onFailure(stage, code, message)
      }
      override fun onInputChanged(name: String?, builtIn: Boolean) {
        events?.onInputChanged(name, builtIn)
      }
    })
    // The microphone first, while the app is certainly on screen; then the
    // service that keeps it allowed once the phone locks.
    next.start()
    capture = next
    try {
      val intent = Intent(app, LectureRecordingService::class.java).setAction(LectureRecordingService.ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(intent) else app.startService(intent)
    } catch (t: Throwable) {
      // Without the service the recording would die when the phone locks:
      // refuse to start rather than pretend.
      next.stop()
      capture = null
      throw t
    }
  }

  @Synchronized
  fun stopCapture() {
    val current = capture ?: return
    capture = null
    current.stop()
    finalFigures = FinalFigures(current.seq, current.closedSeconds)
  }

  @Synchronized
  fun stop() {
    stopCapture()
    val app = appContext ?: return
    try {
      app.stopService(Intent(app, LectureRecordingService::class.java))
    } catch (_: Throwable) {
      // already gone
    }
  }

  /** Returns false when no app is listening (the JS side is gone). */
  fun requestStop(): Boolean {
    val listener = events ?: return false
    listener.onStopRequested()
    return true
  }

  fun requestTogglePause() {
    events?.onPauseToggleRequested()
  }

  fun requestMark() {
    events?.onMarkRequested()
  }

  fun updateNotification(state: NotificationState) {
    val changed = state.paused != notificationState.paused || state.micStopped != notificationState.micStopped
    notificationState = state
    // The chronometer counts on its own; only a state change needs a redraw.
    if (!changed || capture == null) return
    val app = appContext ?: return
    try {
      LectureRecordingService.refresh(app)
    } catch (_: Throwable) {
      // decoration only
    }
  }
}
