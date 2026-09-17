package expo.modules.semorarecorder

import android.Manifest
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.BatteryManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

class RecorderStartOptions : Record {
  @Field val lectureId: String = ""
  @Field val directory: String = ""
  @Field val firstSeq: Int = 0
  @Field val chunkSeconds: Double = 120.0
  @Field val title: String = ""
  @Field val strings: Map<String, String> = emptyMap()
}

class RecorderActivityState : Record {
  @Field val elapsedSeconds: Double = 0.0
  @Field val savedSeconds: Double = 0.0
  @Field val paused: Boolean = false
  @Field val micStopped: Boolean = false
}

/** Semora's lecture recorder. JS: lib/lectureCapture/nativeEngine.ts. Same contract as the iOS module. */
class SemoraRecorderModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var batteryReadAt = 0L
  private var batteryLevel: Double? = null
  private var batteryCharging = false

  private val events: LectureRecorderHost.Events = object : LectureRecorderHost.Events {
    override fun onChunkClosed(seq: Int, uri: String, seconds: Double, bytes: Long, hasGap: Boolean) {
      sendEvent("onChunkClosed", mapOf("seq" to seq, "uri" to uri, "seconds" to seconds, "bytes" to bytes.toDouble(), "hasGap" to hasGap))
    }
    override fun onStopped(atMs: Double) {
      sendEvent("onCaptureStopped", mapOf("at" to atMs))
    }
    override fun onResumed(atMs: Double) {
      sendEvent("onCaptureResumed", mapOf("at" to atMs))
    }
    override fun onFailure(stage: String, code: String, message: String?) {
      sendEvent("onFailure", mapOf("stage" to stage, "code" to code, "message" to message))
    }
    override fun onInputChanged(name: String?, builtIn: Boolean) {
      sendEvent("onInputChanged", mapOf("name" to name, "builtIn" to builtIn))
    }
    override fun onStopRequested() {
      sendEvent("onStopRequested", emptyMap<String, Any>())
    }
    override fun onPauseToggleRequested() {
      sendEvent("onPauseToggleRequested", emptyMap<String, Any>())
    }
    override fun onMarkRequested() {
      sendEvent("onMarkRequested", emptyMap<String, Any>())
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SemoraRecorder")

    Events(
      "onChunkClosed",
      "onCaptureStopped",
      "onCaptureResumed",
      "onInputChanged",
      "onFailure",
      "onStopRequested",
      "onPauseToggleRequested",
      "onMarkRequested",
    )

    OnCreate {
      LectureRecorderHost.events = events
    }

    OnDestroy {
      // Same as iOS: the app's JavaScript is gone, so nobody can finish this
      // lecture. Keep the closed chunks on disk and release the microphone.
      // Only this instance's listener is removed: a reload may already have
      // installed the next one.
      if (LectureRecorderHost.events === events) {
        LectureRecorderHost.events = null
        // Off the calling thread: stopping waits for the last part to close.
        Thread({ LectureRecorderHost.stop() }, "semora-lecture-stop").start()
      }
    }

    AsyncFunction("start") { options: RecorderStartOptions ->
      val ctx = context
      if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("MIC_PERMISSION_DENIED", "Microphone permission is not granted.", null)
      }
      val uri = Uri.parse(options.directory)
      val path = uri.path
      if (uri.scheme != "file" || path.isNullOrEmpty()) {
        throw CodedException("BAD_DIRECTORY", "The lecture folder is not a file URL.", null)
      }
      try {
        LectureRecorderHost.start(
          ctx,
          File(path),
          options.firstSeq,
          maxOf(30.0, options.chunkSeconds),
          options.title,
          options.strings,
        )
      } catch (t: Throwable) {
        throw CodedException("CAPTURE_START_FAILED", t.message ?: "The microphone did not start.", t)
      }
    }

    AsyncFunction("pause") {
      LectureRecorderHost.capture?.pause()
    }

    AsyncFunction("resume") {
      LectureRecorderHost.capture?.resume()
    }

    AsyncFunction("restart") {
      LectureRecorderHost.capture?.restart()
    }

    AsyncFunction("stop") {
      LectureRecorderHost.stop()
      val f = LectureRecorderHost.finalFigures
      mapOf("nextSeq" to (f?.nextSeq ?: 0), "closedSeconds" to (f?.closedSeconds ?: 0.0))
    }

    Function("getStatus") {
      // Read once a minute, not once a second: it is a call into the system.
      val now = System.currentTimeMillis()
      if (now - batteryReadAt > 60_000) {
        batteryReadAt = now
        val battery = try {
          context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        } catch (_: Throwable) {
          null
        }
        batteryLevel = battery?.let {
          val l = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
          val s = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
          if (l >= 0 && s > 0) l.toDouble() / s else null
        }
        val plugged = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        batteryCharging = plugged == BatteryManager.BATTERY_STATUS_CHARGING || plugged == BatteryManager.BATTERY_STATUS_FULL
      }
      val level = batteryLevel
      val charging = batteryCharging
      val capture = LectureRecorderHost.capture
      val final = LectureRecorderHost.finalFigures
      mapOf(
        // A capture is open in this process. False after Stop, after the app
        // was swiped away (onTaskRemoved stops it), or when none was started:
        // the JS tick tells a live recording from one that is gone by this.
        "active" to (capture != null),
        "capturing" to (capture?.capturing ?: false),
        "paused" to (capture?.paused ?: false),
        "closedSeconds" to (capture?.closedSeconds ?: final?.closedSeconds ?: 0.0),
        "liveChunkSeconds" to (capture?.liveChunkSeconds ?: 0.0),
        "levelDb" to capture?.levelDb,
        "inputName" to capture?.inputName,
        "builtInMic" to (capture?.builtInMic ?: false),
        "nextSeq" to (capture?.seq ?: final?.nextSeq ?: 0),
        "batteryLevel" to level,
        "charging" to charging,
      )
    }

    // Android backs up app files by the app's backup rules, not per folder;
    // nothing to do here.
    Function("excludeFromBackup") { _: String -> }

    Function("updateActivity") { state: RecorderActivityState ->
      LectureRecorderHost.updateNotification(
        LectureRecorderHost.NotificationState(
          elapsedSeconds = state.elapsedSeconds.toInt(),
          paused = state.paused,
          micStopped = state.micStopped,
        ),
      )
    }
  }
}
