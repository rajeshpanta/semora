import AVFoundation
import UIKit
import UserNotifications
import os

// ── One lecture, one microphone session ──────────────────────────────────────
//
// Why this exists: the app used to record a lecture as a chain of 5-minute
// files made by STOPPING the recorder and STARTING a new one. iOS lets an app
// keep recording in the background but will not let it start recording there,
// so every part change on a locked phone killed the recording until the app was
// reopened. In the week to 2026-09-16 every "interrupted" event landed on a
// 5-minute boundary.
//
// Here the audio engine starts ONCE, while the app is on screen, and runs until
// Stop. Parts ("chunks") are cut by closing one file and opening the next on a
// serial queue — the microphone never stops, so there is nothing to restart.
// Pause keeps the engine running and simply discards audio, so Resume (from
// the app, the lock screen or the Dynamic Island) never has to start anything.
//
// What a chunk is on disk:
//   .seg_NNN.partial.m4a   while being written (the upload queue ignores it)
//   seg_NNN.m4a            once closed and finalized — renamed atomically
// A kill mid-chunk loses at most that chunk; every closed one is a complete
// m4a the transcription provider accepts.
//
// Threading: tap buffers are copied and handed to `queue`; every piece of
// capture state is only touched on `queue`. The engine itself is started and
// stopped from the main thread.

final class LectureCapture {
  struct Options {
    let directory: URL
    let firstSeq: Int
    let chunkSeconds: Double
    let pausedTitle: String
    let pausedBody: String
  }

  enum Event {
    case chunkClosed(seq: Int, uri: String, seconds: Double, bytes: Int64, hasGap: Bool)
    case stopped(atMs: Double)
    /// `info`: how capture came back (trigger, attempts, the first refusal),
    /// flat and free of personal data — it goes to analytics as is.
    case resumed(atMs: Double, info: [String: Any])
    case input(name: String?, builtIn: Bool)
    /// `detail`: which call failed and the OS error behind it. Same rules as `info`.
    case failure(stage: String, code: String, message: String?, detail: [String: Any])
  }

  struct Status {
    let capturing: Bool
    let paused: Bool
    let closedSeconds: Double
    let liveChunkSeconds: Double
    let levelDb: Double?
    let inputName: String?
    let builtInMic: Bool
    let nextSeq: Int
  }

  static let sampleRate: Double = 16_000
  /// A stretch this long with no audio buffers means capture has stopped.
  static let stallSeconds: TimeInterval = 5
  /// How long capture has to stay stopped before the locked phone is told.
  /// A phone call interrupts the microphone and hands it back when the call
  /// ends; the recorder restarts itself, and "Open Semora to continue" about
  /// a recording that continued on its own only sent students into the app
  /// for nothing. A stall that outlives this is one recovery did not fix.
  static let stoppedNoticeDelay: TimeInterval = 30
  private static let stoppedNotificationId = "semora-lecture-capture-stopped"
  /// Reminders after the first "Recording paused" notice, while capture stays
  /// stopped. One notice is easy to miss in a bag or under a Focus: on
  /// 2026-09-23 a missed one cost a student 33 minutes of a lecture.
  private static let reminderIds = ["semora-lecture-capture-stopped-2", "semora-lecture-capture-stopped-3"]
  static let reminderOffsets: [TimeInterval] = [3 * 60, 10 * 60]

  // ── Bringing the microphone back after an interruption ────────────────────
  //
  // Production, 1.15.1, 2026-09-21 and 09-23: an interruption ended while
  // Semora was in the background and the ONE restart attempt failed; nothing
  // tried again until the student opened the app (33 minutes of one lecture
  // lost).
  //
  // The cause, measured on an iPhone 15 Pro Max (iOS 26.7) with Siri as the
  // interruption: the restart called setCategory again, with the category the
  // session already had. From the background iOS refuses that call ('!int'),
  // and the refused call leaves the session with NO options — .mixWithOthers
  // gone — so every activation after it is refused as well. Leaving an
  // unchanged category alone, the same activation succeeds at once, and the
  // microphone hears the room as before (a test tone at -16 dB both sides of
  // the interruption, over a -60 dB room). See configureSession(recovering:).
  //
  // Around that fix:
  //   - ONE background task is held from the moment the interruption begins
  //     until the microphone is back or the recovery gives up, and a few
  //     seconds more so the failure event and the notice leave the phone;
  //   - attempt 1 stops and starts the SAME engine — what the app's own
  //     restart does, the one that worked on 09-21 — and later attempts build
  //     a new engine, because a reused one can come back after a call with a
  //     tap that never delivers;
  //   - transient refusals are retried on a short ladder;
  //   - only real audio is proof: the engine running AND a buffer from the
  //     tap this attempt installed, after the last configuration change. The
  //     lock-screen Resume touches neither;
  //   - a configuration change is never ignored while the engine is down or a
  //     recovery is in flight: it starts the ladder over, a bounded number of
  //     times;
  //   - every failure says which call failed with which OS code.
  //
  // The category stays .mixWithOthers. A NON-mixable session activated in the
  // background is refused outright ('!int', AVAudioSession.ErrorCode
  // .cannotInterruptOthers: "allowed only when the app is the NowPlaying
  // app"); mixable is what lets a recorder that was running resume there.

  /// Waits (seconds) between recovery attempts; the first runs at once. 15.5 s
  /// in all: inside the ~30 s of background time, and long enough for a call
  /// or Siri to finish releasing the microphone ('!pri', 'siri').
  static let recoveryRetryDelays: [TimeInterval] = [0.5, 1, 2, 4, 8]
  /// A start that reports success but delivers no audio within this long is
  /// a failed start (a tap that went dead after a call).
  static let recoveryVerifySeconds: TimeInterval = 3
  /// After a recovery gives up, background time is kept this much longer: the
  /// failure event goes out over the network from JS and the notice is
  /// posted before iOS suspends the app.
  static let giveUpLingerSeconds: TimeInterval = 4
  /// Times a configuration change (or a media reset) in the middle of a
  /// recovery starts its ladder over. Past this a change counts as the current
  /// attempt's failure and the ladder goes on from where it is.
  static let maxLadderRestarts = 2
  /// Ladders in a row that ended without audio, after which a configuration
  /// change starts no new one: those changes can be the attempts' own doing,
  /// and the capture is already marked stopped with the student told. An
  /// interruption ending, a media reset and the app on screen still do.
  static let maxFailedLadders = 3
  /// backgroundTimeRemaining is effectively unlimited on screen (and while
  /// audio keeps the app running): diagnostics send whole seconds, capped here.
  static let backgroundSecondsCap: Double = 600
  /// OS refusals no retry changes while the app is in the background: iOS has
  /// decided this app may not start recording now. The ladder stops and the
  /// student is told at once; the app coming on screen restarts it as before.
  ///   561145187 '!rec' cannotStartRecording
  ///   560557684 '!int' cannotInterruptOthers
  /// Every other failure is retried: '!pri' insufficientPriority (a call still
  /// holding the audio), 'siri' siriIsRecording, 'inac', '!act', '!res',
  /// 'what', AudioUnit errors, no input format, a tap format the hardware no
  /// longer has, no buffers — an engine rebuilt a moment later clears those.
  static let policyRefusals: Set<Int> = [561_145_187, 560_557_684]
  private static let log = Logger(subsystem: "com.semora.recorder", category: "capture")

  enum RecoveryTrigger: String {
    case interruptionEnded = "INTERRUPTION_ENDED"
    case configurationChanged = "ENGINE_CONFIGURATION_CHANGED"
    case mediaServicesReset = "MEDIA_SERVICES_RESET"
  }

  /// A step of bringing the microphone up that threw, and what it threw.
  /// LocalizedError: callers that show or forward `localizedDescription`
  /// (start, restart) see the OS error's own text, exactly as before.
  private struct StepError: LocalizedError {
    let step: String
    let underlying: Error
    var errorDescription: String? { (underlying as NSError).localizedDescription }
  }

  private struct AttemptFailure {
    let step: String
    let domain: String
    let code: Int
    let message: String
    var fourCC: String? { LectureCapture.fourCC(code) }
    var isPolicyRefusal: Bool { LectureCapture.policyRefusals.contains(code) }

    init(_ error: Error) {
      let stepError = error as? StepError
      let ns = (stepError?.underlying ?? error) as NSError
      step = stepError?.step ?? "unknown"
      domain = ns.domain
      code = ns.code
      message = ns.localizedDescription
    }

    init(step: String, code: Int, message: String) {
      self.step = step
      domain = "SemoraRecorder"
      self.code = code
      self.message = message
    }
  }

  /// An attempt whose engine started: its number, and the real-buffer count
  /// at the moment its tap went in. Proof is a count above that.
  private struct StartedAttempt {
    let attempt: Int
    let heardBefore: Int
  }

  private struct Recovery {
    /// Changes whenever the ladder starts over, so the waits and verifications
    /// of an earlier run find a different number and do nothing.
    var generation: Int
    let trigger: RecoveryTrigger
    /// Attempts in this run of the ladder: attempt 1 reuses the engine, later
    /// ones rebuild it, and the waits are indexed by it.
    var attempt = 0
    /// Every attempt across runs: what the diagnostics report.
    var attempts = 0
    /// Times a configuration change or media reset started the ladder over.
    var restarts = 0
    var first: AttemptFailure?
    var last: AttemptFailure?
    /// The latest attempt whose engine started (kept after its verification
    /// failed: audio arriving late from it is still audio).
    var started: StartedAttempt?
    /// That attempt's verification is still to come.
    var verifyPending = false
  }

  /// '!rec' for 561145187: the four characters an OSStatus is made of, when
  /// they are all printable. Nil for AudioUnit (negative) and plain codes.
  static func fourCC(_ code: Int) -> String? {
    guard code > 0, code <= 0xFFFF_FFFF else { return nil }
    let bytes = [24, 16, 8, 0].map { UInt8((code >> $0) & 0xFF) }
    guard bytes.allSatisfy({ $0 >= 0x20 && $0 <= 0x7E }) else { return nil }
    return String(bytes: bytes, encoding: .ascii)
  }

  var onEvent: ((Event) -> Void)?
  /// Called on the capture queue about every `heartbeatSeconds` while the
  /// capture is open (running, paused or stopped), with the figures of the
  /// moment. It runs from the capture's own timer, so it keeps going on a
  /// locked phone where JavaScript is suspended: the module refreshes the
  /// Live Activity from it, so a live recording never goes stale.
  var onHeartbeat: ((Status) -> Void)?
  static let heartbeatSeconds: TimeInterval = 30

  private let options: Options
  private let queue = DispatchQueue(label: "com.semora.recorder.capture")
  private var engine = AVAudioEngine()
  /// Main thread. A tap of ours is on `engine`'s input. A recovery only
  /// removes a tap it knows is there: asking a media reset's brand-new engine
  /// for its input node would create one before the session is set up.
  private var engineTapped = false
  private let targetFormat = AVAudioFormat(
    commonFormat: .pcmFormatFloat32, sampleRate: LectureCapture.sampleRate, channels: 1, interleaved: false)!

  // All below: only on `queue`.
  private var converter: AVAudioConverter?
  private var file: AVAudioFile?
  private var partialURL: URL?
  private var seq: Int
  private var chunkFrames: AVAudioFramePosition = 0
  private var closedFrames: AVAudioFramePosition = 0
  private var chunkHasGap = false
  private var paused = false
  private var running = false
  private var ended = false
  /// Drives the stall timer. The lock-screen Resume sets it too, so it is
  /// never proof that the microphone works: `heardBuffers` is.
  private var lastBufferAt = Date()
  /// Microphone buffers from the tap currently installed, counted as they
  /// reach consume() — and only there. The one proof a recovery accepts.
  private var heardBuffers = 0
  /// Which installed tap is the current one (startEngine counts it up): a
  /// buffer still on its way from an earlier tap is written, but proves nothing.
  private var tapEpoch = 0
  /// `heardBuffers` when the engine last reported a configuration change: a
  /// recovery needs a buffer after it.
  private var heardAtConfigChange = 0
  private var stalledSince: Date?
  private var levelDb: Double?
  private var inputName: String?
  private var builtInMic = false
  private var convertFailureReported = false
  private var writeFailureReported = false
  /// How the capture being brought back is coming back; sent with the
  /// `.resumed` that the first buffer emits, then cleared.
  private var resumeInfo: [String: Any] = [:]

  // Main thread only: the recovery ladder, the background time, what they report.
  private var recoveryGeneration = 0
  private var recovery: Recovery?
  /// Recoveries in a row that gave up. Reset by audio coming back, with or
  /// without a recovery in flight.
  private var failedLadders = 0
  private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
  /// A recovery just gave up and its report is still leaving the phone.
  private var lingering = false
  private var lingerToken = 0
  /// Between an interruption's .began and its .ended (or a recovery that
  /// heard audio, or the app restarting or stopping capture itself).
  private var interruptionActive = false
  private var interruptionBeganAt: Date?
  private var interruptionReason: UInt?
  private var interruptionShouldResume: Bool?
  private var interruptionBgRemaining: Int?
  /// Counts up whenever the engine observer is removed: a change notification
  /// already on its way to main belongs to a setup that no longer exists.
  private var engineObserverEpoch = 0

  private var stallTimer: DispatchSourceTimer?
  /// Queue only. When the heartbeat last fired.
  private var lastHeartbeatAt = Date()
  private var observers: [NSObjectProtocol] = []
  private var engineObserver: NSObjectProtocol?

  init(options: Options) {
    self.options = options
    self.seq = options.firstSeq
  }

  deinit {
    // A background task left running gets the app killed when it expires.
    // endBackgroundTask may be called from any thread.
    if backgroundTask != .invalid {
      UIApplication.shared.endBackgroundTask(backgroundTask)
    }
  }

  // MARK: - Lifecycle (main thread)

  func start() throws {
    // A capture killed while stopped (force-quit, or iOS reclaiming a
    // suspended app) leaves its timed reminders with the system. Up to ten
    // minutes later they would say "Recording paused" over this healthy one.
    clearStoppedNotification()
    try FileManager.default.createDirectory(at: options.directory, withIntermediateDirectories: true)
    do {
      try configureSession()
    } catch {
      // The category may already be play-and-record: give the session back.
      releaseSession()
      throw error
    }
    do {
      try startEngine()
    } catch {
      // The instance is about to be discarded: nothing must outlive it. The
      // session had been activated and a tap installed on an engine that
      // never started — left alone, both stayed behind a "start failed" the
      // app worded as if nothing were open.
      abortStart()
      throw error
    }
    queue.sync {
      running = true
      ended = false
      lastBufferAt = Date()
    }
    UIDevice.current.isBatteryMonitoringEnabled = true
    observe()
    startStallTimer()
  }

  func pause() {
    queue.sync {
      guard running, !ended else { return }
      paused = true
      // Close what is recorded so a long break never leaves an open file.
      closeChunk()
    }
  }

  func resume() {
    queue.sync {
      guard running, !ended else { return }
      paused = false
      lastBufferAt = Date()
    }
  }

  /// "Continue recording" after capture stopped, and the low-battery save.
  ///
  /// Always closes the open part first, so what is recorded is on disk. When
  /// capture has stopped — the engine is down, OR it claims to run but no
  /// buffers arrive (a dead tap) — the engine is rebuilt from scratch; a plain
  /// "is it running?" check left a dead tap dead.
  func restart() throws {
    // The app's own restart wins over a recovery still retrying: that
    // recovery's next attempt would tear down the engine this one starts.
    cancelRecovery()
    // In the foreground no background time is needed; after a failure here
    // the screen, not a notice, tells the student.
    defer { releaseBackgroundTime() }
    let stalled = queue.sync { () -> Bool in
      closeChunk()
      writeFailureReported = false
      convertFailureReported = false
      return stalledSince != nil
    }
    clearStoppedNotification()
    if stalled || !engine.isRunning {
      engine.inputNode.removeTap(onBus: 0)
      engineTapped = false
      engine.stop()
      try configureSession()
      try startEngine()
      // The microphone is the app's again, whatever interruption took it.
      interruptionActive = false
      failedLadders = 0
      queue.sync {
        chunkHasGap = true
        lastBufferAt = Date()
        resumeInfo = [:]
        if stalledSince != nil {
          stalledSince = nil
          emit(.resumed(atMs: Date().timeIntervalSince1970 * 1000, info: ["trigger": "APP"]))
        }
      }
    }
  }

  func stop() {
    cancelRecovery()
    interruptionActive = false
    stopStallTimer()
    removeObservers()
    clearStoppedNotification()
    engine.inputNode.removeTap(onBus: 0)
    engineTapped = false
    engine.stop()
    // Serial queue: this waits for every buffer already handed over.
    queue.sync {
      closeChunk()
      ended = true
      running = false
    }
    releaseSession()
    releaseBackgroundTime()
  }

  /// Undo a start whose engine would not run. Safe on an engine that never
  /// started: removing a tap that was never installed and stopping a stopped
  /// engine are both no-ops.
  private func abortStart() {
    engine.inputNode.removeTap(onBus: 0)
    engineTapped = false
    engine.stop()
    removeEngineObserver()
    queue.sync { converter = nil }
    releaseSession()
  }

  /// Give the session back: other apps' audio is told it may resume.
  private func releaseSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  func status() -> Status {
    queue.sync { currentStatus() }
  }

  /// Queue only (status() would deadlock there).
  private func currentStatus() -> Status {
    Status(
      capturing: running && !ended && !paused && stalledSince == nil,
      paused: paused,
      closedSeconds: Double(closedFrames) / LectureCapture.sampleRate,
      liveChunkSeconds: Double(chunkFrames) / LectureCapture.sampleRate,
      levelDb: levelDb,
      inputName: inputName,
      builtInMic: builtInMic,
      nextSeq: seq
    )
  }

  // MARK: - Session and engine

  /// `recovering`: bringing the microphone back after iOS stopped it, which
  /// is usually in the background.
  private func configureSession(recovering: Bool = false) throws {
    let session = AVAudioSession.sharedInstance()
    // Mixable: other apps' audio does not interrupt the lecture, and a
    // backgrounded recorder may re-activate after an interruption (a
    // non-mixable one is refused there, '!int'). No Bluetooth-HFP option: a
    // headset microphone at the student's ear records the student, not the
    // lecturer — the phone's own microphone is used.
    //
    // A recovery only sets the category if it is not already this one. After
    // an interruption the session keeps its category but, in the background,
    // setting it again — even to the same value — is refused ('!int') and the
    // refused call strips the options, .mixWithOthers included, so the
    // activation below is refused too and so is every retry (measured, see the
    // top of this class). Something else in the app may also have activated
    // the session already on .ended (expo-audio does); leaving the category
    // alone suits that as well. start() and restart() run on screen, where
    // setting it is always allowed, and keep doing so.
    let alreadySet = session.category == .playAndRecord && session.mode == .default
      && session.categoryOptions == [.mixWithOthers, .defaultToSpeaker]
    if !(recovering && alreadySet) {
      try step("set_category") {
        try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
      }
    }
    try step("set_active") { try session.setActive(true) }
    pinBuiltInMic()
  }

  private func step<T>(_ name: String, _ body: () throws -> T) throws -> T {
    do {
      return try body()
    } catch let error as StepError {
      throw error
    } catch {
      throw StepError(step: name, underlying: error)
    }
  }

  private func pinBuiltInMic() {
    let session = AVAudioSession.sharedInstance()
    if let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
      try? session.setPreferredInput(mic)
    }
    let current = session.currentRoute.inputs.first
    let name = current?.portName
    let builtIn = current?.portType == .builtInMic
    queue.async {
      if name != self.inputName || builtIn != self.builtInMic {
        self.inputName = name
        self.builtInMic = builtIn
        self.emit(.input(name: name, builtIn: builtIn))
      }
    }
  }

  /// Installs the tap and starts the engine. Returns the real-buffer count at
  /// the moment the new tap went in: only buffers from this tap count after it.
  ///
  /// `strictFormat` (recovery attempts): the tap format is checked against the
  /// hardware before installTap, which raises an Objective-C exception —
  /// uncatchable in Swift, it ends the app — when they disagree. Right after a
  /// call or a route change the hardware rate can move under an engine that
  /// still reports the old one. start() and restart() keep today's check.
  @discardableResult
  private func startEngine(strictFormat: Bool = false) throws -> Int {
    let input = engine.inputNode
    // The input node's current output format, read now, never a cached one.
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw StepError(step: "input_format", underlying: NSError(
        domain: "SemoraRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone input is available."]))
    }
    if strictFormat {
      try checkTapFormat(format, input: input)
    }
    let converter = AVAudioConverter(from: format, to: targetFormat)
    let (epoch, heardBefore) = queue.sync { () -> (Int, Int) in
      self.converter = converter
      self.convertFailureReported = false
      self.tapEpoch += 1
      return (self.tapEpoch, self.heardBuffers)
    }
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
      guard let self, let copy = LectureCapture.copy(buffer) else { return }
      self.queue.async { self.consume(copy, tap: epoch) }
    }
    engineTapped = true
    engine.prepare()
    // Watch this engine before it starts: a change during the start is not missed.
    observeEngineConfiguration()
    try step("engine_start") { try engine.start() }
    return heardBefore
  }

  /// A tap format the microphone does not have right now is a transient
  /// failure of this attempt (the next one builds a new engine, which reads
  /// the new format) — never an installTap that takes the app down.
  private func checkTapFormat(_ format: AVAudioFormat, input: AVAudioInputNode) throws {
    let hardware = input.inputFormat(forBus: 0)
    let sessionRate = AVAudioSession.sharedInstance().sampleRate
    let agrees = hardware.sampleRate > 0 && hardware.channelCount > 0 && sessionRate > 0
      && abs(format.sampleRate - hardware.sampleRate) < 1
      && abs(format.sampleRate - sessionRate) < 1
    guard agrees else {
      LectureCapture.log.error(
        "tap format \(format.sampleRate) Hz x\(format.channelCount) vs hardware \(hardware.sampleRate) Hz x\(hardware.channelCount), session \(sessionRate) Hz")
      throw StepError(step: "tap_format", underlying: NSError(
        domain: "SemoraRecorder", code: 4,
        userInfo: [NSLocalizedDescriptionKey: "The microphone's format changed under the recorder."]))
    }
  }

  /// Main thread. One attempt at bringing the microphone back, in the order
  /// the app's own restart() uses: the engine iOS stopped is stopped and its
  /// tap removed, the session set up and activated, then the engine started.
  /// `rebuild` replaces the engine with a new one before starting it.
  /// Returns the real-buffer count its tap started from.
  private func bringUpEngine(rebuild: Bool) throws -> Int {
    // The observer goes first: a change from the engine being torn down is
    // not news, and startEngine watches the engine actually in use again.
    removeEngineObserver()
    if engineTapped {
      engine.inputNode.removeTap(onBus: 0)
      engineTapped = false
    }
    engine.stop()
    if rebuild {
      engine = AVAudioEngine()
    }
    try configureSession(recovering: true)
    return try startEngine(strictFormat: true)
  }

  private static func copy(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let out = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return nil }
    out.frameLength = buffer.frameLength
    let channels = Int(buffer.format.channelCount)
    if let src = buffer.floatChannelData, let dst = out.floatChannelData {
      for c in 0..<channels {
        dst[c].update(from: src[c], count: Int(buffer.frameLength))
      }
      return out
    }
    if let src = buffer.int16ChannelData, let dst = out.int16ChannelData {
      for c in 0..<channels {
        dst[c].update(from: src[c], count: Int(buffer.frameLength))
      }
      return out
    }
    return nil
  }

  // MARK: - Capture (queue)

  private func consume(_ buffer: AVAudioPCMBuffer, tap: Int) {
    guard running, !ended else { return }
    // A real buffer from the microphone: the only thing a recovery counts.
    if tap == tapEpoch { heardBuffers += 1 }
    lastBufferAt = Date()
    levelDb = LectureCapture.rmsDb(buffer)
    // A disk that refused a write refuses the next one too: buffers are dropped
    // until restart() (Continue recording), so the failure is reported once.
    if writeFailureReported { return }
    // Likewise a converter that failed: the same input format fails the same
    // way, so capture stays "stopped" (below) until Continue recording or the
    // input format changes and a new converter is built.
    if convertFailureReported, converter?.inputFormat == buffer.format { return }
    if stalledSince != nil {
      stalledSince = nil
      let info = resumeInfo
      resumeInfo = [:]
      emit(.resumed(atMs: Date().timeIntervalSince1970 * 1000, info: info))
      DispatchQueue.main.async { [weak self] in
        self?.clearStoppedNotification()
        // Finishes a recovery only if this attempt's engine is running and
        // its own tap has delivered since the last configuration change.
        self?.recoveryHeardAudio()
      }
    }
    if paused { return }
    // After a route or configuration change, buffers from the old format can
    // still be queued behind the new converter. A converter is only ever fed
    // the format it was built for.
    if converter == nil || converter?.inputFormat != buffer.format {
      converter = AVAudioConverter(from: buffer.format, to: targetFormat)
      convertFailureReported = false
    }
    guard let converter else { return }

    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 64)
    guard let out = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else { return }
    var handedOver = false
    var error: NSError?
    let status = converter.convert(to: out, error: &error) { _, inputStatus in
      if handedOver {
        inputStatus.pointee = .noDataNow
        return nil
      }
      handedOver = true
      inputStatus.pointee = .haveData
      return buffer
    }
    if status == .error || error != nil {
      // Once, then capture is treated as stopped: every buffer was being
      // dropped while lastBufferAt kept the stall timer quiet, so the screen
      // said "Recording" over a frozen clock. Stopped, it says "Microphone
      // stopped" and offers Continue, which rebuilds the converter.
      if !convertFailureReported {
        convertFailureReported = true
        emit(.failure(stage: "capture_finalize", code: "CONVERT_FAILED", message: error?.localizedDescription,
                      detail: error.map { ["errDomain": $0.domain, "errCode": $0.code] } ?? [:]))
        markStopped()
      }
      return
    }
    guard out.frameLength > 0 else { return }

    do {
      // Autorelease pools around every file operation: before iOS 18 a part is
      // only finished when its AVAudioFile is deallocated, and an autoreleased
      // reference would delay that past the rename.
      try autoreleasepool {
        if file == nil { try openChunk() }
        try file?.write(from: out)
      }
      chunkFrames += AVAudioFramePosition(out.frameLength)
      if Double(chunkFrames) >= options.chunkSeconds * LectureCapture.sampleRate {
        closeChunk()
      }
    } catch {
      // Once, then capture is treated as stopped: a full disk used to fail every
      // buffer (a dozen a second) while the screen said "Recording".
      if !writeFailureReported {
        writeFailureReported = true
        emit(.failure(stage: "local_commit", code: "WRITE_FAILED", message: error.localizedDescription,
                      detail: ["errDomain": (error as NSError).domain, "errCode": (error as NSError).code]))
      }
      closeChunk()
      markStopped()
    }
  }

  private func finalURL(_ n: Int) -> URL {
    options.directory.appendingPathComponent(String(format: "seg_%03d.m4a", n))
  }

  private func openChunk() throws {
    // Never overwrite a finished part: move past any number already on disk.
    while FileManager.default.fileExists(atPath: finalURL(seq).path) {
      seq += 1
    }
    let partial = options.directory.appendingPathComponent(String(format: ".seg_%03d.partial.m4a", seq))
    try? FileManager.default.removeItem(at: partial)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: LectureCapture.sampleRate,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 32_000,
    ]
    file = try AVAudioFile(forWriting: partial, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
    partialURL = partial
    chunkFrames = 0
  }

  /// Finish the open chunk and publish it. Safe to call with none open.
  private func closeChunk() {
    guard let partial = partialURL else { return }
    let frames = chunkFrames
    autoreleasepool {
      if #available(iOS 18.0, *) {
        file?.close()
      }
      // Releasing the file is what finalizes it before iOS 18.
      file = nil
    }
    partialURL = nil
    chunkFrames = 0

    let seconds = Double(frames) / LectureCapture.sampleRate
    guard seconds >= 0.5 else {
      try? FileManager.default.removeItem(at: partial)
      return
    }
    let target = finalURL(seq)
    do {
      try FileManager.default.moveItem(at: partial, to: target)
    } catch {
      // The part stays a .partial the upload queue ignores: its audio is lost
      // to the lecture, so the next part carries the gap.
      chunkHasGap = true
      emit(.failure(stage: "local_commit", code: "RENAME_FAILED", message: error.localizedDescription,
                    detail: ["errDomain": (error as NSError).domain, "errCode": (error as NSError).code]))
      return
    }
    let bytes = (try? FileManager.default.attributesOfItem(atPath: target.path)[.size] as? NSNumber)?.int64Value ?? 0
    closedFrames += frames
    let hasGap = chunkHasGap
    chunkHasGap = false
    let closedSeq = seq
    seq += 1
    emit(.chunkClosed(seq: closedSeq, uri: target.absoluteString, seconds: seconds, bytes: bytes, hasGap: hasGap))
  }

  private func markStopped() {
    guard stalledSince == nil, running, !ended else { return }
    stalledSince = lastBufferAt
    chunkHasGap = true
    // Secure what was recorded before the silence.
    closeChunk()
    emit(.stopped(atMs: lastBufferAt.timeIntervalSince1970 * 1000))
    // The Live Activity flips to "Microphone stopped" at once (the module
    // does that on .stopped). The notification waits: a call gives the
    // microphone back when it ends and consume() cancels the pending request
    // on the first buffer, so a recovered interruption posts nothing. The
    // system delivers a timed request even if this process is suspended
    // meanwhile, which a Dispatch timer would not.
    DispatchQueue.main.async { [weak self] in self?.notifyCaptureStopped(after: LectureCapture.stoppedNoticeDelay) }
  }

  private func emit(_ event: Event) {
    onEvent?(event)
  }

  private static func rmsDb(_ buffer: AVAudioPCMBuffer) -> Double? {
    guard let data = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return nil }
    var sum: Float = 0
    let n = Int(buffer.frameLength)
    for i in 0..<n {
      sum += data[i] * data[i]
    }
    let rms = sqrt(sum / Float(n))
    return rms > 0 ? Double(20 * log10(rms)) : -160
  }

  // MARK: - Watching for trouble

  private func startStallTimer() {
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + 2, repeating: 2)
    timer.setEventHandler { [weak self] in
      guard let self, self.running, !self.ended else { return }
      if self.stalledSince == nil, Date().timeIntervalSince(self.lastBufferAt) > LectureCapture.stallSeconds {
        self.markStopped()
      }
      if Date().timeIntervalSince(self.lastHeartbeatAt) >= LectureCapture.heartbeatSeconds {
        self.lastHeartbeatAt = Date()
        self.onHeartbeat?(self.currentStatus())
      }
    }
    timer.resume()
    stallTimer = timer
  }

  private func stopStallTimer() {
    stallTimer?.cancel()
    stallTimer = nil
  }

  private func observe() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] note in
      self?.handleInterruption(note)
    })
    observers.append(center.addObserver(
      forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.pinBuiltInMic()
    })
    observers.append(center.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.recoverFromReset()
    })
    // The stopped notice is timed, so "is the app on screen?" is decided when
    // it is scheduled, not delivered. On screen the recorder itself shows
    // "Microphone stopped / Continue": drop the pending notice; leaving the
    // screen with capture still stopped puts it back.
    observers.append(center.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.clearStoppedNotification()
    })
    observers.append(center.addObserver(
      forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.notifyCaptureStopped(after: LectureCapture.stoppedNoticeDelay)
    })
  }

  /// Main thread. Watches the engine in use for configuration changes.
  ///
  /// queue nil: the notification arrives on the engine's own queue, and a
  /// main-queue observer makes that queue wait for main — while main may be
  /// inside engine.stop(), waiting for the engine's queue. Nothing here
  /// blocks: the change is marked on the capture queue, in order with the
  /// buffers (only a buffer after it proves anything), and handled on main,
  /// asynchronously.
  private func observeEngineConfiguration() {
    removeEngineObserver()
    let epoch = engineObserverEpoch
    engineObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
    ) { [weak self] _ in
      self?.markConfigurationChange()
      DispatchQueue.main.async { [weak self] in
        self?.engineConfigurationChanged(epoch: epoch)
      }
    }
  }

  private func removeEngineObserver() {
    if let engineObserver { NotificationCenter.default.removeObserver(engineObserver) }
    engineObserver = nil
    engineObserverEpoch += 1
  }

  /// Any thread (the engine's).
  private func markConfigurationChange() {
    queue.async { self.heardAtConfigChange = self.heardBuffers }
  }

  /// Main thread. The engine stopped itself ("the engine stops itself" on
  /// every configuration change — AVAudioEngine.h).
  private func engineConfigurationChanged(epoch: Int) {
    guard epoch == engineObserverEpoch else { return }
    LectureCapture.log.notice(
      "configuration changed recovery=\(self.recovery != nil) running=\(self.engine.isRunning) app=\(LectureCapture.appStateName(), privacy: .public)")
    beginRecovery(.configurationChanged)
  }

  private func removeObservers() {
    for o in observers { NotificationCenter.default.removeObserver(o) }
    observers.removeAll()
    removeEngineObserver()
  }

  private func handleInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    switch type {
    case .began:
      // A recovery still retrying cannot succeed while something else holds
      // the microphone; the .ended that follows starts a new one.
      cancelRecovery()
      interruptionActive = true
      interruptionBeganAt = Date()
      interruptionShouldResume = nil
      interruptionReason = note.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt
      // Keep the process running through a short interruption (a declined
      // call, an alarm stopped, Siri): the part just closed is filed and
      // uploaded, and the process is awake when the interruption ends instead
      // of being woken cold for it. This one task covers the whole recovery.
      holdBackgroundTime()
      interruptionBgRemaining = LectureCapture.backgroundSecondsRemaining()
      LectureCapture.log.notice(
        "interruption began app=\(LectureCapture.appStateName(), privacy: .public) bgRemaining=\(self.interruptionBgRemaining ?? -1)")
      queue.async { self.markStopped() }
    case .ended:
      let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
        .map(AVAudioSession.InterruptionOptions.init(rawValue:))
      interruptionActive = false
      interruptionShouldResume = options?.contains(.shouldResume)
      LectureCapture.log.notice(
        "interruption ended shouldResume=\(self.interruptionShouldResume ?? false) app=\(LectureCapture.appStateName(), privacy: .public) bgRemaining=\(LectureCapture.backgroundSecondsRemaining())")
      // Always, with or without shouldResume: that flag is a hint for players,
      // and a lecture the student started is meant to come back.
      beginRecovery(.interruptionEnded)
      // Nothing to bring back (the capture never stopped): the time held
      // since .began goes now.
      releaseBackgroundTimeIfIdle()
    @unknown default:
      break
    }
  }

  private func recoverFromReset() {
    // After a media-services reset every audio object is invalid: nothing on
    // the old engine is touched, its observer is dropped with it.
    removeEngineObserver()
    engine = AVAudioEngine()
    engineTapped = false
    beginRecovery(.mediaServicesReset)
  }

  // MARK: - Recovery ladder (main thread)

  private func nextGeneration() -> Int {
    recoveryGeneration += 1
    return recoveryGeneration
  }

  private func beginRecovery(_ trigger: RecoveryTrigger) {
    let (alive, stalled) = queue.sync { (running && !ended, stalledSince != nil) }
    guard alive else { return }
    if let current = recovery {
      // Never dropped: something changed under a recovery in flight.
      restartRecovery(current, because: trigger)
      return
    }
    // Nothing to bring back: a capture that is running and hearing audio is
    // never torn down (an interruption-ended notice with no interruption, a
    // configuration change the engine rode out). In the background that
    // teardown would itself be a start iOS may refuse.
    if trigger != .mediaServicesReset, engine.isRunning, !stalled { return }
    if trigger == .configurationChanged, failedLadders >= LectureCapture.maxFailedLadders {
      LectureCapture.log.error("configuration change after \(self.failedLadders) failed recoveries: left to the app")
      return
    }
    runLadder(Recovery(generation: nextGeneration(), trigger: trigger))
  }

  private func runLadder(_ r: Recovery) {
    recovery = r
    // Only if none is held: the task from .began covers the whole ladder.
    holdBackgroundTime()
    let generation = r.generation
    // Off the notification's delivery: an attempt may replace the engine, and
    // an engine must not be released inside a notification it posted.
    DispatchQueue.main.async { [weak self] in self?.attemptRecovery(generation) }
  }

  /// A recovery is in flight and something changed under it.
  private func restartRecovery(_ current: Recovery, because trigger: RecoveryTrigger) {
    var next = current
    if trigger == .interruptionEnded {
      // The interruption this recovery was waiting out is over: a full
      // ladder, reported as the interruption's.
      next = Recovery(generation: 0, trigger: .interruptionEnded)
      next.attempts = current.attempts
      next.first = current.first
      next.last = current.last
    } else if current.restarts < LectureCapture.maxLadderRestarts {
      // The engine being brought up stopped itself, or the whole audio system
      // was reset: nothing the current attempt started can count. Over, at once.
      next.restarts += 1
    } else {
      // Bounded. The change is this attempt's failure, and the ladder goes on
      // (or ends) from where it is; an attempt already waiting reads the new
      // configuration when it runs.
      if current.verifyPending {
        attemptFailed(current.generation, AttemptFailure(
          step: "configuration_changed", code: 5, message: "The audio hardware changed during the attempt."))
      }
      return
    }
    next.generation = nextGeneration()
    next.attempt = 0
    next.started = nil
    next.verifyPending = false
    LectureCapture.log.notice(
      "recovery \(next.trigger.rawValue, privacy: .public) starts over (\(trigger.rawValue, privacy: .public)) restarts=\(next.restarts)")
    runLadder(next)
  }

  private func attemptRecovery(_ generation: Int) {
    guard var current = recovery, current.generation == generation else { return }
    guard queue.sync(execute: { running && !ended }) else {
      cancelRecovery()
      releaseBackgroundTimeIfIdle()
      return
    }
    // Audio came in late from the last attempt's engine: that is the recovery.
    if let started = current.started, heard(since: started) {
      finishRecovery(generation)
      return
    }
    current.attempt += 1
    current.attempts += 1
    current.started = nil
    current.verifyPending = false
    recovery = current
    let attempt = current.attempt
    var info: [String: Any] = ["trigger": current.trigger.rawValue, "attempts": current.attempts]
    if current.restarts > 0 { info["restarts"] = current.restarts }
    if let first = current.first {
      info["firstStep"] = first.step
      info["firstErrCode"] = first.code
      if let fourCC = first.fourCC { info["firstErrFourCC"] = fourCC }
    }
    // Before the engine starts, so the first buffer's .resumed carries it.
    queue.async { self.resumeInfo = info }
    do {
      // Attempt 1: the same engine, stopped and started. Later: a new engine.
      let heardBefore = try bringUpEngine(rebuild: attempt > 1)
      LectureCapture.log.notice(
        "recovery \(current.trigger.rawValue, privacy: .public) attempt \(current.attempts) started rebuild=\(attempt > 1) app=\(LectureCapture.appStateName(), privacy: .public)")
      // Re-read: a notification delivered inside the attempt may have moved on.
      guard var now = recovery, now.generation == generation else { return }
      now.started = StartedAttempt(attempt: attempt, heardBefore: heardBefore)
      now.verifyPending = true
      recovery = now
      // Started is not proof: audio arriving is. consume() finishes the
      // recovery on the first buffer of a stopped capture; this catches a
      // start that delivers nothing, and a configuration change on a capture
      // that never counted as stopped.
      DispatchQueue.main.asyncAfter(deadline: .now() + LectureCapture.recoveryVerifySeconds) { [weak self] in
        self?.verifyRecovery(generation, attempt: attempt)
      }
    } catch {
      // Whatever step failed, the engine in use is watched again: a hardware
      // change is what may let the next attempt succeed.
      if engineObserver == nil { observeEngineConfiguration() }
      attemptFailed(generation, AttemptFailure(error))
    }
  }

  /// The recovery's only proof: the engine is running, and the tap this
  /// attempt installed has delivered a real buffer since it went in and since
  /// the last configuration change.
  private func heard(since started: StartedAttempt) -> Bool {
    guard engine.isRunning else { return false }
    let (count, atChange) = queue.sync { (heardBuffers, heardAtConfigChange) }
    return count > started.heardBefore && count > atChange
  }

  /// consume() saw the first buffer after a stop.
  private func recoveryHeardAudio() {
    guard let current = recovery else {
      // No recovery in flight: the last engine a recovery left running after
      // giving up has delivered after all (or a stall cleared by itself).
      // Audio is back, so the give-up count starts over — otherwise three
      // such late recoveries in one lecture would stop a configuration change
      // from ever starting another ladder. interruptionActive is left alone:
      // this hop to main can land just after a new interruption's .began, and
      // only .ended (or a finished recovery) may say an interruption is over.
      failedLadders = 0
      return
    }
    guard let started = current.started, heard(since: started) else { return }
    finishRecovery(current.generation)
  }

  private func verifyRecovery(_ generation: Int, attempt: Int) {
    guard let current = recovery, current.generation == generation, current.verifyPending,
          let started = current.started, started.attempt == attempt else { return }
    if heard(since: started) {
      finishRecovery(generation)
    } else if engine.isRunning {
      attemptFailed(generation, AttemptFailure(
        step: "no_buffers", code: 2, message: "The microphone started but delivered no audio."))
    } else {
      attemptFailed(generation, AttemptFailure(
        step: "not_running", code: 3, message: "The microphone stopped before any audio arrived."))
    }
  }

  private func attemptFailed(_ generation: Int, _ failure: AttemptFailure) {
    guard var current = recovery, current.generation == generation else { return }
    if current.first == nil { current.first = failure }
    current.last = failure
    current.verifyPending = false
    recovery = current
    LectureCapture.log.error(
      "recovery \(current.trigger.rawValue, privacy: .public) attempt \(current.attempts) failed step=\(failure.step, privacy: .public) \(failure.domain, privacy: .public) \(failure.code) '\(failure.fourCC ?? "-", privacy: .public)' app=\(LectureCapture.appStateName(), privacy: .public) bgRemaining=\(LectureCapture.backgroundSecondsRemaining())")
    // An interruption is still on (a configuration change during a call
    // started this): retrying burns the background time the .ended recovery
    // needs, and a notice mid-call is noise. Wait for .ended, which starts a
    // full ladder; the background time running out ends this instead.
    if interruptionActive { return }
    let index = current.attempt - 1
    guard !failure.isPolicyRefusal, index < LectureCapture.recoveryRetryDelays.count else {
      giveUp(generation)
      return
    }
    let delay = LectureCapture.recoveryRetryDelays[index]
    // Do not start an attempt the background time cannot see through, with
    // its report: the student is better told now than after a suspension.
    let app = UIApplication.shared
    if app.applicationState != .active,
       app.backgroundTimeRemaining < delay + LectureCapture.recoveryVerifySeconds + LectureCapture.giveUpLingerSeconds {
      giveUp(generation)
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      self?.attemptRecovery(generation)
    }
  }

  /// Nothing more will be tried until the app is opened (the JS tick restarts
  /// it there), iOS ends another interruption or the hardware changes. Same
  /// code and stage as the single attempt used to report, so the event keeps
  /// its meaning: the recorder is stopped and will not come back on its own.
  ///
  /// A last engine that started but stayed silent is left running: audio it
  /// delivers later still clears the stop (consume) and the lecture goes on.
  private func giveUp(_ generation: Int, expired: Bool = false) {
    guard let current = recovery, current.generation == generation else { return }
    recovery = nil
    failedLadders += 1
    let detail = diagnostics(current, expired: expired)
    let message = current.last?.message
    LectureCapture.log.error(
      "recovery \(current.trigger.rawValue, privacy: .public) gave up after \(current.attempts) attempts expired=\(expired) bgRemaining=\(LectureCapture.backgroundSecondsRemaining())")
    queue.async {
      self.resumeInfo = [:]
      self.markStopped()
      self.emit(.failure(stage: "capture_prepare", code: "RESTART_FAILED_\(current.trigger.rawValue)",
                         message: message, detail: detail))
    }
    // Now: nothing is coming back on its own. The lock screen lights up too:
    // the Live Activity alerts (sound, expanded Dynamic Island) on top of
    // "Microphone stopped".
    notifyCaptureStopped()
    // Like the notices, only off screen: on screen the recorder already says
    // "Microphone stopped" and offers Continue.
    if #available(iOS 16.2, *), UIApplication.shared.applicationState != .active {
      LectureActivityController.shared.alertMicStopped(title: options.pausedTitle, body: options.pausedBody)
    }
    // Kept a few seconds so the event and the notice leave the phone. Not
    // after expiry: that time is gone, and the expiry handler ends the task.
    if !expired { lingerThenRelease() }
  }

  /// Audio is flowing again.
  private func finishRecovery(_ generation: Int) {
    guard let current = recovery, current.generation == generation else { return }
    recovery = nil
    failedLadders = 0
    // Whatever took the microphone has given it back, .ended or not.
    interruptionActive = false
    queue.async { self.resumeInfo = [:] }
    LectureCapture.log.notice(
      "recovery \(current.trigger.rawValue, privacy: .public) done after \(current.attempts) attempts app=\(LectureCapture.appStateName(), privacy: .public)")
    releaseBackgroundTimeIfIdle()
  }

  private func cancelRecovery() {
    recovery = nil
    recoveryGeneration += 1
    queue.async { self.resumeInfo = [:] }
  }

  /// Flat, personal-data-free facts about a recovery that failed: which call
  /// threw, the OS error, and the circumstances. lib/lectureCaptureError.ts
  /// lists the keys analytics accepts.
  private func diagnostics(_ r: Recovery, expired: Bool) -> [String: Any] {
    let app = UIApplication.shared
    var d: [String: Any] = [
      "trigger": r.trigger.rawValue,
      "attempts": r.attempts,
      "appState": LectureCapture.appStateName(),
      "locked": !app.isProtectedDataAvailable,
      "otherAudio": AVAudioSession.sharedInstance().isOtherAudioPlaying,
      "bgRemaining": LectureCapture.backgroundSecondsRemaining(),
      "final": true,
    ]
    if r.restarts > 0 { d["restarts"] = r.restarts }
    if let last = r.last {
      d["step"] = last.step
      d["errDomain"] = last.domain
      d["errCode"] = last.code
      if let fourCC = last.fourCC { d["errFourCC"] = fourCC }
      d["retryable"] = !last.isPolicyRefusal
    }
    if let first = r.first {
      d["firstStep"] = first.step
      d["firstErrCode"] = first.code
      if let fourCC = first.fourCC { d["firstErrFourCC"] = fourCC }
    }
    if r.trigger == .interruptionEnded {
      if let resume = interruptionShouldResume { d["shouldResume"] = resume }
      if let reason = interruptionReason { d["interruptionReason"] = Int(reason) }
      if let began = interruptionBeganAt { d["sinceBeganMs"] = Int(Date().timeIntervalSince(began) * 1000) }
      if let atBegan = interruptionBgRemaining { d["bgRemainingAtBegan"] = atBegan }
    }
    if expired { d["expired"] = true }
    return d
  }

  private static func appStateName() -> String {
    switch UIApplication.shared.applicationState {
    case .active: return "active"
    case .inactive: return "inactive"
    case .background: return "background"
    @unknown default: return "unknown"
    }
  }

  /// UIApplication.backgroundTimeRemaining in whole seconds, capped.
  private static func backgroundSecondsRemaining() -> Int {
    let remaining = UIApplication.shared.backgroundTimeRemaining
    guard remaining.isFinite, remaining >= 0 else { return Int(backgroundSecondsCap) }
    return Int(min(remaining, backgroundSecondsCap))
  }

  // MARK: - Background time (main thread)
  //
  // One task at a time, begun only when none is held: a second task adds no
  // time (backgroundTimeRemaining belongs to the app, not the task), and
  // ending one to begin another can leave a gap. It is ended by stop(),
  // restart(), a recovery that finishes, a recovery that gave up (a few
  // seconds later), an interruption that ended with nothing to recover, and
  // its own expiry handler.

  private func holdBackgroundTime() {
    guard backgroundTask == .invalid else { return }
    var id = UIBackgroundTaskIdentifier.invalid
    id = UIApplication.shared.beginBackgroundTask(withName: "semora-lecture-microphone") { [weak self] in
      // Main thread. iOS kills an app whose task outlives this handler, so the
      // handler ends its own task, whatever else happens.
      self?.backgroundTimeExpired(id)
      UIApplication.shared.endBackgroundTask(id)
    }
    backgroundTask = id
  }

  private func backgroundTimeExpired(_ id: UIBackgroundTaskIdentifier) {
    guard backgroundTask == id else { return }
    // The handler that called this ends the task.
    backgroundTask = .invalid
    lingering = false
    guard let current = recovery else { return }
    if current.verifyPending, engine.isRunning {
      // The engine is up and its proof is on the way: verification decides.
      // A running engine keeps the app running; one that stays silent fails
      // verification and the ladder, out of time, gives up then.
      LectureCapture.log.notice("background time expired while verifying: left to verification")
      return
    }
    giveUp(current.generation, expired: true)
  }

  /// Ends the task unless something still needs it: an interruption not yet
  /// over, a recovery in flight, or a report still leaving the phone.
  private func releaseBackgroundTimeIfIdle() {
    guard recovery == nil, !interruptionActive, !lingering else { return }
    releaseBackgroundTime()
  }

  private func lingerThenRelease() {
    lingerToken += 1
    let token = lingerToken
    lingering = true
    DispatchQueue.main.asyncAfter(deadline: .now() + LectureCapture.giveUpLingerSeconds) { [weak self] in
      guard let self, self.lingerToken == token else { return }
      self.lingering = false
      self.releaseBackgroundTimeIfIdle()
    }
  }

  private func releaseBackgroundTime() {
    lingering = false
    lingerToken += 1
    guard backgroundTask != .invalid else { return }
    let id = backgroundTask
    backgroundTask = .invalid
    UIApplication.shared.endBackgroundTask(id)
  }

  /// Both the delivered notices and those still waiting on their timers.
  private func clearStoppedNotification() {
    LectureCapture.clearStoppedNotices()
  }

  /// Also called when the module is created: a capture killed while stopped
  /// (force-quit, or iOS reclaiming the suspended app) leaves its timed
  /// reminders with the system, and a new process has no capture to clear
  /// them. They would say "Open Semora to continue" about a lecture the app
  /// has already told the student was saved.
  static func clearStoppedNotices() {
    let center = UNUserNotificationCenter.current()
    let ids = [LectureCapture.stoppedNotificationId] + LectureCapture.reminderIds
    center.removePendingNotificationRequests(withIdentifiers: ids)
    center.removeDeliveredNotifications(withIdentifiers: ids)
  }

  /// Main thread. `after` nil posts now (a restart that failed: nothing is
  /// coming back on its own); a delay posts only if capture is still stopped
  /// then — a request with the same identifier replaces a pending one, and a
  /// recovery removes them all. Reminders follow at `reminderOffsets`.
  private func notifyCaptureStopped(after delay: TimeInterval? = nil) {
    guard UIApplication.shared.applicationState != .active else { return }
    guard queue.sync(execute: { stalledSince != nil && running && !ended }) else { return }
    postStoppedNotice(id: LectureCapture.stoppedNotificationId, after: delay)
    for (id, offset) in zip(LectureCapture.reminderIds, LectureCapture.reminderOffsets) {
      postStoppedNotice(id: id, after: (delay ?? 0) + offset)
    }
  }

  private func postStoppedNotice(id: String, after delay: TimeInterval?) {
    let content = UNMutableNotificationContent()
    content.title = options.pausedTitle
    content.body = options.pausedBody
    content.sound = .default
    content.threadIdentifier = "semora-lecture-capture"
    // A student in class is often in a Focus, which holds back ordinary
    // notices until it ends — after the lecture. The app has the
    // time-sensitive entitlement (app.json).
    content.interruptionLevel = .timeSensitive
    content.relevanceScore = 1
    let trigger: UNNotificationTrigger? = delay.map {
      UNTimeIntervalNotificationTrigger(timeInterval: max(1, $0), repeats: false)
    }
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
  }
}
