package expo.modules.semorarecorder

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.os.Build
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * One lecture, one microphone session — Android.
 *
 * The same design as ios/LectureCapture.swift. AudioRecord is started ONCE,
 * from the visible app inside a microphone foreground service, and read until
 * Stop. Audio is encoded to AAC and written as closed chunks
 * (".seg_NNN.partial.m4a" while writing, renamed to "seg_NNN.m4a" when done):
 * a new encoder and muxer per chunk, the microphone untouched. Pause keeps
 * reading and discards, so Resume never starts anything from the background —
 * which Android 12+ would refuse.
 *
 * Everything below runs on the capture thread except the public calls, which
 * only flip @Volatile flags.
 */
class LectureCapture(
  private val context: Context,
  private val directory: File,
  firstSeq: Int,
  private val chunkSeconds: Double,
  private val listener: Listener,
) {
  interface Listener {
    fun onChunkClosed(seq: Int, uri: String, seconds: Double, bytes: Long, hasGap: Boolean)
    fun onStopped(atMs: Double)
    fun onResumed(atMs: Double)
    fun onFailure(stage: String, code: String, message: String?)
    fun onInputChanged(name: String?, builtIn: Boolean)
  }

  companion object {
    const val SAMPLE_RATE = 16_000
    const val BIT_RATE = 32_000
    private const val STALL_MS = 5_000L

    /**
     * Consecutive failed reads (each followed by a 500 ms wait, so about 3 s)
     * before the microphone is reopened without waiting for the app. A read
     * error such as ERROR_DEAD_OBJECT never clears on its own, and on a locked
     * phone nobody taps Continue.
     */
    const val RESTART_AFTER_NEGATIVE_READS = 6

    /** Wait before automatic reopen attempt [attempt] (1-based): 1 s, 2 s, 4 s … capped at 60 s. */
    fun autoRestartDelayMs(attempt: Int): Long {
      val step = (attempt - 1).coerceIn(0, 6)
      return minOf(60_000L, 1_000L shl step)
    }
  }

  @Volatile private var running = false
  @Volatile private var ended = false
  @Volatile var paused = false
    private set
  @Volatile var levelDb: Double? = null
    private set
  @Volatile private var closedFrames = 0L
  @Volatile private var chunkFrames = 0L
  @Volatile var seq = firstSeq
    private set
  @Volatile private var stalledSince: Long? = null
  @Volatile private var chunkHasGap = false
  @Volatile private var restartRequested = false
  /** The pending restart was requested by the capture thread itself, not the app. */
  @Volatile private var autoRestartPending = false
  /** The capture thread is reopening a failing microphone on its own backoff. */
  @Volatile private var autoRecovering = false
  // Capture thread only. A chunk that would not finalize or rename is lost,
  // but the microphone is fine and the next chunk usually lands: reported
  // once, capture continues, and the next closed part carries the gap. Cleared
  // by a chunk that lands, so a second run of losses is reported again.
  private var finalizeFailureReported = false
  private var renameFailureReported = false

  private var thread: Thread? = null
  private var record: AudioRecord? = null
  private var encoder: MediaCodec? = null
  private var muxer: MediaMuxer? = null
  private var track = -1
  private var muxerStarted = false
  private var partial: File? = null
  private var presentationUs = 0L

  val closedSeconds: Double get() = closedFrames.toDouble() / SAMPLE_RATE
  val liveChunkSeconds: Double get() = chunkFrames.toDouble() / SAMPLE_RATE
  val capturing: Boolean get() = running && !ended && !paused && stalledSince == null

  /** The input the recorder is actually routed to, when Android says. */
  val inputName: String?
    get() = try { record?.routedDevice?.productName?.toString() } catch (_: Throwable) { null }

  val builtInMic: Boolean
    get() = try {
      val type = record?.routedDevice?.type
      type == null || type == android.media.AudioDeviceInfo.TYPE_BUILTIN_MIC
    } catch (_: Throwable) { true }

  @SuppressLint("MissingPermission")
  private fun openRecord(): AudioRecord {
    val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minBuffer, SAMPLE_RATE * 2),
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      throw IllegalStateException("The microphone could not be opened.")
    }
    pinBuiltInMic(recorder)
    recorder.startRecording()
    if (recorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      recorder.release()
      throw IllegalStateException("The microphone did not start.")
    }
    return recorder
  }

  private var deviceCallback: android.media.AudioDeviceCallback? = null
  private var lastInputName: String? = null
  private var lastBuiltIn: Boolean? = null

  fun start() {
    directory.mkdirs()
    record = openRecord()
    running = true
    ended = false
    thread = Thread({ loop() }, "semora-lecture-capture").also { it.start() }
    watchInputs()
  }

  /**
   * The phone's own microphone, always (a Bluetooth headset at the student's
   * ear records the student, not the lecturer), and the app told which input
   * is in use so it can say so.
   */
  private fun pinBuiltInMic(recorder: AudioRecord) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val mic = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
        .firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_MIC }
      if (mic != null) recorder.preferredDevice = mic
    } catch (_: Throwable) {}
  }

  private fun reportInput() {
    val name = inputName
    val builtIn = builtInMic
    if (name != lastInputName || builtIn != lastBuiltIn) {
      lastInputName = name
      lastBuiltIn = builtIn
      listener.onInputChanged(name, builtIn)
    }
  }

  private fun watchInputs() {
    reportInput()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val callback = object : android.media.AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out android.media.AudioDeviceInfo>?) { onRouteChanged() }
        override fun onAudioDevicesRemoved(removedDevices: Array<out android.media.AudioDeviceInfo>?) { onRouteChanged() }
      }
      audioManager.registerAudioDeviceCallback(callback, android.os.Handler(android.os.Looper.getMainLooper()))
      deviceCallback = callback
    } catch (_: Throwable) {}
  }

  private fun onRouteChanged() {
    val r = record ?: return
    pinBuiltInMic(r)
    // The route settles a moment after the callback.
    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ reportInput() }, 500)
  }

  private fun unwatchInputs() {
    val callback = deviceCallback ?: return
    deviceCallback = null
    try {
      (context.getSystemService(Context.AUDIO_SERVICE) as AudioManager).unregisterAudioDeviceCallback(callback)
    } catch (_: Throwable) {}
  }

  fun pause() {
    paused = true
  }

  fun resume() {
    paused = false
  }

  /**
   * Reopen the microphone. The foreground service started while the app was
   * on screen keeps microphone access, so this works from the background too.
   */
  @Synchronized
  fun restart() {
    if (ended) return
    val current = thread
    if (current != null && current.isAlive) {
      // During the recorder's own recovery (a call holding the microphone),
      // a request from the app is one more attempt within that recovery: it
      // neither resets the backoff nor reports the same failure again.
      autoRestartPending = autoRecovering
      restartRequested = true
      return
    }
    // The capture thread died (see loop's catch): a restart has to start a
    // new one, or "Continue recording" would do nothing.
    autoRestartPending = false
    restartRequested = true
    running = true
    thread = Thread({ loop() }, "semora-lecture-capture").also { it.start() }
  }

  @Synchronized
  fun stop() {
    ended = true
    unwatchInputs()
    val current = thread
    current?.join(10_000)
    thread = null
    // The thread releases the microphone itself on the way out. Only if it is
    // wedged is it released here — never under a thread still reading it.
    if (current == null || !current.isAlive) releaseRecord()
    running = false
  }

  private fun releaseRecord() {
    val r = record ?: return
    record = null
    try { r.stop() } catch (_: Throwable) {}
    try { r.release() } catch (_: Throwable) {}
  }

  private fun loop() {
    val frameBuffer = ShortArray(SAMPLE_RATE / 10) // 100 ms
    var lastAudioAt = System.currentTimeMillis()
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    var closeRequested = false
    var failureReported = false
    var silenced = false
    var silenceCheckedAt = 0L
    // Automatic recovery from a microphone that fails every read: reopen it
    // after RESTART_AFTER_NEGATIVE_READS, backing off between attempts, until
    // real audio flows again (which resets all of this).
    var negativeReads = 0
    var autoRestartAttempts = 0
    var nextAutoRestartAt = 0L
    var autoStartFailureReported = false
    fun requestAutoRestart(now: Long) {
      autoRestartAttempts += 1
      nextAutoRestartAt = now + autoRestartDelayMs(autoRestartAttempts)
      negativeReads = 0
      autoRecovering = true
      autoRestartPending = true
      restartRequested = true
    }
    try {
      while (!ended) {
        if (restartRequested) {
          val auto = autoRestartPending
          autoRestartPending = false
          restartRequested = false
          // The app asked (Continue recording): its attempt starts a fresh
          // backoff, and its failure is always reported.
          if (!auto) {
            autoRestartAttempts = 0
            nextAutoRestartAt = 0L
          }
          closeChunk()
          chunkHasGap = true
          try { record?.stop() } catch (_: Throwable) {}
          try { record?.release() } catch (_: Throwable) {}
          record = null
          negativeReads = 0
          try {
            record = openRecord()
            failureReported = false
          } catch (t: Throwable) {
            markStopped(lastAudioAt)
            if (!auto || !autoStartFailureReported) {
              if (auto) autoStartFailureReported = true
              listener.onFailure("capture_prepare", "CAPTURE_START_FAILED", t.message)
            }
            // The next automatic attempt waits out the backoff (see below).
            if (autoRestartAttempts == 0) {
              autoRestartAttempts = 1
              nextAutoRestartAt = System.currentTimeMillis() + autoRestartDelayMs(1)
            }
            Thread.sleep(1_000)
            continue
          }
        }
        val r = record
        if (r == null) {
          // A reopen failed: try again once the backoff allows.
          val now = System.currentTimeMillis()
          if (autoRestartAttempts > 0 && now >= nextAutoRestartAt) {
            requestAutoRestart(now)
            continue
          }
          Thread.sleep(200)
          continue
        }
        val read = r.read(frameBuffer, 0, frameBuffer.size)
        val now = System.currentTimeMillis()
        if (read < 0) {
          markStopped(lastAudioAt)
          if (!failureReported) {
            failureReported = true
            listener.onFailure("capture_prepare", "AUDIORECORD_ERROR_$read", null)
          }
          negativeReads += 1
          if (negativeReads >= RESTART_AFTER_NEGATIVE_READS && now >= nextAutoRestartAt) {
            requestAutoRestart(now)
            continue
          }
          Thread.sleep(500)
          continue
        }
        negativeReads = 0
        if (read == 0) {
          if (now - lastAudioAt > STALL_MS) markStopped(lastAudioAt)
          Thread.sleep(50)
          continue
        }

        // Android 10+: a call or another app can silence this recorder while
        // it keeps delivering (zeroed) buffers.
        // Checked once a second: it is a call into the system.
        if (now - silenceCheckedAt >= 1_000) {
          silenceCheckedAt = now
          silenced = isSilenced(audioManager, r)
        }
        if (silenced) {
          if (now - lastAudioAt > STALL_MS) markStopped(lastAudioAt)
        } else {
          lastAudioAt = now
          failureReported = false
          autoRestartAttempts = 0
          nextAutoRestartAt = 0L
          autoStartFailureReported = false
          autoRecovering = false
          stalledSince?.let {
            stalledSince = null
            listener.onResumed(now.toDouble())
          }
        }

        levelDb = rmsDb(frameBuffer, read)
        if (paused) {
          // A long break never leaves an open file.
          if (!closeRequested && encoder != null) {
            closeChunk()
            closeRequested = true
          }
          continue
        }
        closeRequested = false
        if (silenced) continue

        if (encoder == null) openChunk()
        encode(frameBuffer, read)
        chunkFrames += read
        if (chunkFrames >= (chunkSeconds * SAMPLE_RATE).toLong()) closeChunk()
      }
    } catch (t: Throwable) {
      // The thread is ending. Say so as a stopped microphone, so the app shows
      // it and offers Continue, instead of "Recording" over nothing.
      listener.onFailure("local_commit", "CAPTURE_THREAD_FAILED", t.message)
      try { closeChunk() } catch (_: Throwable) {}
      running = false
      if (!ended && stalledSince == null) {
        stalledSince = System.currentTimeMillis()
        chunkHasGap = true
        listener.onStopped(System.currentTimeMillis().toDouble())
      }
      releaseRecord()
      return
    } finally {
      try { closeChunk() } catch (_: Throwable) {}
    }
    if (ended) releaseRecord()
  }

  private fun isSilenced(audioManager: AudioManager, recorder: AudioRecord): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
    return try {
      audioManager.activeRecordingConfigurations.any {
        it.clientAudioSessionId == recorder.audioSessionId && it.isClientSilenced
      }
    } catch (_: Throwable) {
      false
    }
  }

  private fun markStopped(since: Long) {
    if (stalledSince != null || ended) return
    stalledSince = since
    chunkHasGap = true
    closeChunk()
    listener.onStopped(since.toDouble())
  }

  private fun finalFile(n: Int) = File(directory, String.format("seg_%03d.m4a", n))

  private fun openChunk() {
    while (finalFile(seq).exists()) seq += 1
    val file = File(directory, String.format(".seg_%03d.partial.m4a", seq))
    file.delete()
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, SAMPLE_RATE)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()
    encoder = codec
    muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    track = -1
    muxerStarted = false
    partial = file
    chunkFrames = 0
    presentationUs = 0
  }

  private fun encode(samples: ShortArray, count: Int) {
    val codec = encoder ?: return
    val bytes = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until count) bytes.putShort(samples[i])
    bytes.flip()
    while (bytes.hasRemaining()) {
      val index = codec.dequeueInputBuffer(10_000)
      if (index < 0) {
        drain(false)
        continue
      }
      val input = codec.getInputBuffer(index) ?: continue
      input.clear()
      val chunk = minOf(input.remaining(), bytes.remaining())
      val slice = bytes.slice()
      slice.limit(chunk)
      input.put(slice)
      bytes.position(bytes.position() + chunk)
      codec.queueInputBuffer(index, 0, chunk, presentationUs, 0)
      presentationUs += (chunk / 2) * 1_000_000L / SAMPLE_RATE
      drain(false)
    }
  }

  /** Returns false when end of stream did not come out in time. */
  private fun drain(endOfStream: Boolean): Boolean {
    val codec = encoder ?: return false
    val mux = muxer ?: return false
    val info = MediaCodec.BufferInfo()
    val deadline = System.currentTimeMillis() + 3_000
    while (true) {
      val index = codec.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!endOfStream) return true
          if (System.currentTimeMillis() > deadline) return false
        }
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          // Only once per muxer: a second addTrack after start throws.
          if (!muxerStarted) {
            track = mux.addTrack(codec.outputFormat)
            mux.start()
            muxerStarted = true
          }
        }
        index >= 0 -> {
          val out = codec.getOutputBuffer(index)
          if (out != null && info.size > 0 && muxerStarted && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
            out.position(info.offset)
            out.limit(info.offset + info.size)
            mux.writeSampleData(track, out, info)
          }
          codec.releaseOutputBuffer(index, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return true
        }
      }
    }
  }

  /** Finish the open chunk and publish it. Safe to call with none open. */
  private fun closeChunk() {
    val codec = encoder ?: return
    val file = partial
    val frames = chunkFrames
    var finished = true
    try {
      // End of stream MUST be queued, or drain(true) waits for it forever.
      val deadline = System.currentTimeMillis() + 2_000
      var queued = false
      while (!queued && System.currentTimeMillis() < deadline) {
        val index = codec.dequeueInputBuffer(10_000)
        if (index >= 0) {
          codec.queueInputBuffer(index, 0, 0, presentationUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
          queued = true
        } else {
          drain(false)
        }
      }
      finished = queued && drain(true)
    } catch (_: Throwable) {
      finished = false
    }
    try { codec.stop() } catch (_: Throwable) {}
    try { codec.release() } catch (_: Throwable) {}
    encoder = null
    try {
      if (muxerStarted) muxer?.stop()
    } catch (_: Throwable) {
      // A muxer that cannot finish leaves a file with no index: not audio.
      finished = false
    }
    try { muxer?.release() } catch (_: Throwable) {}
    muxer = null
    val started = muxerStarted && finished
    if (muxerStarted && !finished) {
      chunkHasGap = true
      if (!finalizeFailureReported) {
        finalizeFailureReported = true
        listener.onFailure("capture_finalize", "CHUNK_FINALIZE_FAILED", null)
      }
    }
    muxerStarted = false
    partial = null
    chunkFrames = 0

    if (file == null) return
    val seconds = frames.toDouble() / SAMPLE_RATE
    if (!started || seconds < 0.5) {
      file.delete()
      return
    }
    val target = finalFile(seq)
    if (!file.renameTo(target)) {
      // The .partial stays where the upload queue ignores it: lost to the
      // lecture, so the next part says there is a gap before it.
      chunkHasGap = true
      if (!renameFailureReported) {
        renameFailureReported = true
        listener.onFailure("local_commit", "RENAME_FAILED", null)
      }
      return
    }
    finalizeFailureReported = false
    renameFailureReported = false
    closedFrames += frames
    val gap = chunkHasGap
    chunkHasGap = false
    val closedSeq = seq
    seq += 1
    listener.onChunkClosed(closedSeq, "file://${target.absolutePath}", seconds, target.length(), gap)
  }

  private fun rmsDb(samples: ShortArray, count: Int): Double {
    if (count <= 0) return -160.0
    var sum = 0.0
    for (i in 0 until count) {
      val v = samples[i] / 32768.0
      sum += v * v
    }
    val rms = sqrt(sum / count)
    return if (rms > 0) 20 * log10(rms) else -160.0
  }
}
