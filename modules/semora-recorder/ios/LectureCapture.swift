import AVFoundation
import UIKit
import UserNotifications

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
    case resumed(atMs: Double)
    case input(name: String?, builtIn: Bool)
    case failure(stage: String, code: String, message: String?)
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

  var onEvent: ((Event) -> Void)?

  private let options: Options
  private let queue = DispatchQueue(label: "com.semora.recorder.capture")
  private var engine = AVAudioEngine()
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
  private var lastBufferAt = Date()
  private var stalledSince: Date?
  private var levelDb: Double?
  private var inputName: String?
  private var builtInMic = false
  private var convertFailureReported = false
  private var writeFailureReported = false

  private var stallTimer: DispatchSourceTimer?
  private var observers: [NSObjectProtocol] = []
  private var engineObserver: NSObjectProtocol?

  init(options: Options) {
    self.options = options
    self.seq = options.firstSeq
  }

  // MARK: - Lifecycle (main thread)

  func start() throws {
    try FileManager.default.createDirectory(at: options.directory, withIntermediateDirectories: true)
    do {
      try configureSession()
    } catch {
      // The category may already be play-and-record: give the session back.
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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
    let stalled = queue.sync { () -> Bool in
      closeChunk()
      writeFailureReported = false
      convertFailureReported = false
      return stalledSince != nil
    }
    clearStoppedNotification()
    if stalled || !engine.isRunning {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
      try configureSession()
      try startEngine()
      queue.sync {
        chunkHasGap = true
        lastBufferAt = Date()
        if stalledSince != nil {
          stalledSince = nil
          emit(.resumed(atMs: Date().timeIntervalSince1970 * 1000))
        }
      }
    }
  }

  func stop() {
    stopStallTimer()
    removeObservers()
    clearStoppedNotification()
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    // Serial queue: this waits for every buffer already handed over.
    queue.sync {
      closeChunk()
      ended = true
      running = false
    }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  /// Undo a start whose engine would not run. Safe on an engine that never
  /// started: removing a tap that was never installed and stopping a stopped
  /// engine are both no-ops.
  private func abortStart() {
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    if let engineObserver { NotificationCenter.default.removeObserver(engineObserver) }
    engineObserver = nil
    queue.sync { converter = nil }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  func status() -> Status {
    queue.sync {
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
  }

  // MARK: - Session and engine

  private func configureSession() throws {
    let session = AVAudioSession.sharedInstance()
    // Mixable: other apps' audio does not interrupt the lecture. No
    // Bluetooth-HFP option: a headset microphone at the student's ear records
    // the student, not the lecturer — the phone's own microphone is used.
    try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
    try session.setActive(true)
    pinBuiltInMic()
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

  private func startEngine() throws {
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw NSError(domain: "SemoraRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone input is available."])
    }
    let converter = AVAudioConverter(from: format, to: targetFormat)
    queue.sync {
      self.converter = converter
      self.convertFailureReported = false
    }
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
      guard let self, let copy = LectureCapture.copy(buffer) else { return }
      self.queue.async { self.consume(copy) }
    }
    engine.prepare()
    try engine.start()
    observeEngineConfiguration()
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

  private func consume(_ buffer: AVAudioPCMBuffer) {
    guard running, !ended else { return }
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
      emit(.resumed(atMs: Date().timeIntervalSince1970 * 1000))
      DispatchQueue.main.async { [weak self] in self?.clearStoppedNotification() }
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
        emit(.failure(stage: "capture_finalize", code: "CONVERT_FAILED", message: error?.localizedDescription))
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
        emit(.failure(stage: "local_commit", code: "WRITE_FAILED", message: error.localizedDescription))
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
      emit(.failure(stage: "local_commit", code: "RENAME_FAILED", message: error.localizedDescription))
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

  private func observeEngineConfiguration() {
    if let engineObserver { NotificationCenter.default.removeObserver(engineObserver) }
    engineObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
    ) { [weak self] _ in
      self?.recoverEngine(reason: "ENGINE_CONFIGURATION_CHANGED")
    }
  }

  private func removeObservers() {
    for o in observers { NotificationCenter.default.removeObserver(o) }
    observers.removeAll()
    if let engineObserver { NotificationCenter.default.removeObserver(engineObserver) }
    engineObserver = nil
  }

  private func handleInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    switch type {
    case .began:
      queue.async { self.markStopped() }
    case .ended:
      recoverEngine(reason: "INTERRUPTION_ENDED")
    @unknown default:
      break
    }
  }

  private func recoverFromReset() {
    // After a media-services reset every audio object is invalid.
    engine = AVAudioEngine()
    recoverEngine(reason: "MEDIA_SERVICES_RESET")
  }

  private func recoverEngine(reason: String) {
    let alive = queue.sync { running && !ended }
    guard alive else { return }
    do {
      try configureSession()
      if !engine.isRunning {
        try startEngine()
      }
    } catch {
      queue.async {
        self.markStopped()
        self.emit(.failure(stage: "capture_prepare", code: "RESTART_FAILED_\(reason)", message: error.localizedDescription))
      }
      notifyCaptureStopped()
    }
  }

  /// Both the delivered notice and one still waiting on its timer.
  private func clearStoppedNotification() {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [LectureCapture.stoppedNotificationId])
    center.removeDeliveredNotifications(withIdentifiers: [LectureCapture.stoppedNotificationId])
  }

  /// Main thread. `after` nil posts now (a restart that failed: nothing is
  /// coming back on its own); a delay posts only if capture is still stopped
  /// then — a request with this identifier replaces any pending one, and a
  /// recovery removes it.
  private func notifyCaptureStopped(after delay: TimeInterval? = nil) {
    guard UIApplication.shared.applicationState != .active else { return }
    guard queue.sync(execute: { stalledSince != nil && running && !ended }) else { return }
    let content = UNMutableNotificationContent()
    content.title = options.pausedTitle
    content.body = options.pausedBody
    content.sound = .default
    let trigger: UNNotificationTrigger? = delay.map {
      UNTimeIntervalNotificationTrigger(timeInterval: max(1, $0), repeats: false)
    }
    let request = UNNotificationRequest(identifier: LectureCapture.stoppedNotificationId, content: content, trigger: trigger)
    UNUserNotificationCenter.current().add(request)
  }
}
