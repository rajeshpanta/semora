package expo.modules.semorarecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Keeps Semora allowed to use the microphone while the phone is locked or
 * another app is open. It owns no audio itself — LectureRecorderHost does —
 * it only holds the "microphone" foreground-service slot and shows the
 * ongoing notification with Pause and Stop.
 */
class LectureRecordingService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.semorarecorder.START"
    const val ACTION_STOP = "expo.modules.semorarecorder.STOP"
    const val ACTION_TOGGLE_PAUSE = "expo.modules.semorarecorder.TOGGLE_PAUSE"
    const val ACTION_MARK = "expo.modules.semorarecorder.MARK"
    private const val CHANNEL_ID = "lecture-recording"
    const val NOTIFICATION_ID = 7_401

    /** Redraw the ongoing notification after a pause or microphone change. */
    fun refresh(context: Context) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, buildNotification(context))
    }

    private fun buildNotification(context: Context): Notification {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val strings = LectureRecorderHost.strings
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          strings["channel"] ?: "Lecture recording",
          NotificationManager.IMPORTANCE_LOW,
        )
        channel.setShowBadge(false)
        channel.setSound(null, null)
        manager.createNotificationChannel(channel)
      }

      val state = LectureRecorderHost.notificationState
      val status = when {
        state.micStopped -> strings["micStopped"] ?: "Microphone stopped"
        state.paused -> strings["paused"] ?: "Paused"
        else -> strings["recording"] ?: "Recording"
      }
      val immutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
      fun serviceIntent(action: String, code: Int) = PendingIntent.getService(
        context, code, Intent(context, LectureRecordingService::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or immutable,
      )
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        it.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or immutable)
      }

      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, CHANNEL_ID)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }
      builder
        // A monochrome system microphone: the launcher icon is adaptive and
        // renders as a white blob (or breaks) in the status bar.
        .setSmallIcon(R.drawable.semora_recorder_mic)
        .setContentTitle(LectureRecorderHost.title.ifBlank { status })
        .setContentText(status)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(Notification.CATEGORY_SERVICE)
        .setContentIntent(open)
        .addAction(
          Notification.Action.Builder(
            null,
            if (state.paused) strings["resume"] ?: "Resume" else strings["pause"] ?: "Pause",
            serviceIntent(ACTION_TOGGLE_PAUSE, 1),
          ).build(),
        )
        .addAction(Notification.Action.Builder(null, strings["mark"] ?: "Mark", serviceIntent(ACTION_MARK, 3)).build())
        .addAction(Notification.Action.Builder(null, strings["stop"] ?: "Stop", serviceIntent(ACTION_STOP, 2)).build())
      if (!state.paused && !state.micStopped) {
        builder.setUsesChronometer(true).setWhen(System.currentTimeMillis() - state.elapsedSeconds * 1000L)
      } else {
        builder.setShowWhen(false)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
      }
      return builder.build()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        // The student's tap goes to the app, which saves and finishes the
        // lecture. If the app is gone, stop here so the mic is never orphaned.
        if (!LectureRecorderHost.requestStop()) {
          // The app is gone: close the last part, THEN give up the foreground slot.
          Thread({
            LectureRecorderHost.stopCapture()
            android.os.Handler(android.os.Looper.getMainLooper()).post { stopSelfNow() }
          }, "semora-lecture-stop").start()
        }
        return START_NOT_STICKY
      }
      ACTION_TOGGLE_PAUSE -> {
        LectureRecorderHost.requestTogglePause()
        return START_NOT_STICKY
      }
      ACTION_MARK -> {
        LectureRecorderHost.requestMark()
        return START_NOT_STICKY
      }
    }
    // Always promote first: a service started with startForegroundService that
    // does not call startForeground in time crashes the app.
    val notification = buildNotification(this)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (t: Throwable) {
      // Android 14+ refuses a microphone service once the app has left the
      // screen. Without it the recording would die at the lock screen, so it
      // stops now and says why, rather than crashing or pretending.
      LectureRecorderHost.events?.onFailure("capture_prepare", "FOREGROUND_SERVICE_REFUSED", t.message)
      LectureRecorderHost.events?.onStopRequested()
      stopCaptureOffMainThread()
      stopSelf()
      return START_NOT_STICKY
    }
    if (!LectureRecorderHost.isActive()) {
      // Stopped before the service came up, or restarted with nothing to hold.
      stopSelfNow()
    }
    return START_NOT_STICKY
  }

  /**
   * The app was swiped away: keep what was recorded, release the microphone.
   * The service stays in the foreground until the last part is closed, so the
   * process is not reclaimed with a half-written file.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    Thread({
      LectureRecorderHost.stopCapture()
      android.os.Handler(android.os.Looper.getMainLooper()).post { stopSelfNow() }
    }, "semora-lecture-stop").start()
    super.onTaskRemoved(rootIntent)
  }

  /**
   * Stopping waits for the capture thread to close its last part (up to 10 s):
   * never on the main thread, where that wait is an "app not responding".
   */
  private fun stopCaptureOffMainThread() {
    Thread({ LectureRecorderHost.stopCapture() }, "semora-lecture-stop").start()
  }

  private fun stopSelfNow() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }
}
