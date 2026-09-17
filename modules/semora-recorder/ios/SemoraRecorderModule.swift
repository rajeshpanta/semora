import ExpoModulesCore
import UIKit

struct RecorderStartOptions: Record {
  @Field var lectureId: String = ""
  @Field var directory: String = ""
  @Field var firstSeq: Int = 0
  @Field var chunkSeconds: Double = 120
  @Field var title: String = ""
  @Field var strings: [String: String] = [:]
}

struct RecorderActivityState: Record {
  @Field var elapsedSeconds: Double = 0
  @Field var savedSeconds: Double = 0
  @Field var paused: Bool = false
  @Field var micStopped: Bool = false
}

/// Semora's lecture recorder. JS: lib/lectureCapture/nativeEngine.ts.
public class SemoraRecorderModule: Module {
  /// Written on the main thread (start / stop / destroy) under `stateLock`;
  /// read under it from wherever getStatus runs. getStatus is called by the
  /// JS tick every second, and a main-thread hop from there stalled JS behind
  /// every transition, keyboard and heavy layout on the way.
  private var capture: LectureCapture?
  /// The last capture's figures after Stop. getStatus returns these until the
  /// next start: Stop's own caller reads the final part count and duration
  /// after stopping, and zeros there declared every lecture empty.
  private var finalStatus: LectureCapture.Status?
  private let stateLock = NSLock()

  private func setState(capture: LectureCapture?, finalStatus: LectureCapture.Status?) {
    stateLock.lock()
    self.capture = capture
    self.finalStatus = finalStatus
    stateLock.unlock()
  }

  private func state() -> (capture: LectureCapture?, finalStatus: LectureCapture.Status?) {
    stateLock.lock()
    defer { stateLock.unlock() }
    return (capture, finalStatus)
  }
  /// The live module instance, for the Darwin notification callbacks (which
  /// cannot capture Swift context).
  fileprivate static weak var current: SemoraRecorderModule?

  public func definition() -> ModuleDefinition {
    Name("SemoraRecorder")

    Events(
      "onChunkClosed",
      "onCaptureStopped",
      "onCaptureResumed",
      "onInputChanged",
      "onFailure",
      "onStopRequested",
      "onPauseToggleRequested",
      "onMarkRequested"
    )

    OnCreate {
      SemoraRecorderModule.current = self
      SemoraRecorderModule.installControlObservers()
      if #available(iOS 16.1, *) {
        LectureActivityController.shared.endStale()
      }
    }

    OnDestroy {
      // The observers stay: they are process-wide and deliver to whichever
      // module instance is current. Removing and re-adding them on every
      // JavaScript reload is how one button press became two.
      if SemoraRecorderModule.current === self {
        SemoraRecorderModule.current = nil
      }
      let current = self.state()
      if let capture = current.capture {
        capture.stop()
        self.setState(capture: nil, finalStatus: current.finalStatus)
        if #available(iOS 16.1, *) {
          LectureActivityController.shared.end()
        }
      }
    }

    AsyncFunction("start") { (options: RecorderStartOptions) in
      guard let directory = URL(string: options.directory), directory.isFileURL else {
        throw Exception(name: "BadDirectory", description: "The lecture folder is not a file URL.")
      }
      self.state().capture?.stop()
      self.setState(capture: nil, finalStatus: nil)
      let strings = options.strings
      let capture = LectureCapture(options: .init(
        directory: directory,
        firstSeq: options.firstSeq,
        chunkSeconds: max(30, options.chunkSeconds),
        pausedTitle: strings["pausedTitle"] ?? "Recording paused",
        pausedBody: strings["pausedBody"] ?? "Open Semora to continue recording your lecture."
      ))
      capture.onEvent = { [weak self] event in self?.forward(event) }
      do {
        try capture.start()
      } catch {
        throw Exception(name: "CaptureStartFailed", description: error.localizedDescription, code: "CAPTURE_START_FAILED")
      }
      self.setState(capture: capture, finalStatus: nil)

      // iOS 17+: the widget extension that draws the activity targets iOS 17,
      // so on 16.x an activity would exist with nothing to show it.
      if #available(iOS 17.0, *) {
        LectureActivityController.shared.start(attributes: .init(
          title: options.title,
          recordingLabel: strings["recording"] ?? "Recording",
          pausedLabel: strings["paused"] ?? "Paused",
          stoppedLabel: strings["micStopped"] ?? "Microphone stopped",
          stopLabel: strings["stop"] ?? "Stop",
          pauseLabel: strings["pause"] ?? "Pause",
          resumeLabel: strings["resume"] ?? "Resume",
          savedLabel: strings["saved"] ?? "saved",
          markLabel: strings["mark"] ?? "Mark"
        ))
      }
    }.runOnQueue(.main)

    AsyncFunction("pause") {
      self.state().capture?.pause()
    }.runOnQueue(.main)

    AsyncFunction("resume") {
      self.state().capture?.resume()
    }.runOnQueue(.main)

    AsyncFunction("restart") {
      guard let capture = self.state().capture else { return }
      do {
        try capture.restart()
      } catch {
        throw Exception(name: "CaptureRestartFailed", description: error.localizedDescription, code: "CAPTURE_START_FAILED")
      }
    }.runOnQueue(.main)

    AsyncFunction("stop") { () -> [String: Any] in
      let current = self.state()
      var final = current.finalStatus
      if let capture = current.capture {
        capture.stop()
        final = capture.status()
      }
      self.setState(capture: nil, finalStatus: final)
      if #available(iOS 16.1, *) {
        LectureActivityController.shared.end()
      }
      return ["nextSeq": final?.nextSeq ?? 0, "closedSeconds": final?.closedSeconds ?? 0]
    }.runOnQueue(.main)

    Function("getStatus") { () -> [String: Any?] in
      let device = UIDevice.current
      let battery: Double? = device.isBatteryMonitoringEnabled && device.batteryLevel >= 0 ? Double(device.batteryLevel) : nil
      let charging = device.batteryState == .charging || device.batteryState == .full
      // Runs on the JS thread. The pointer is read under the lock; status()
      // itself only waits on the capture queue, never on main.
      let current = self.state()
      guard let status = current.capture?.status() ?? current.finalStatus else {
        return [
          "capturing": false, "paused": false, "closedSeconds": 0, "liveChunkSeconds": 0,
          "levelDb": nil, "inputName": nil, "builtInMic": false, "nextSeq": 0,
          "batteryLevel": battery, "charging": charging,
        ]
      }
      return [
        "capturing": status.capturing,
        "paused": status.paused,
        "closedSeconds": status.closedSeconds,
        "liveChunkSeconds": status.liveChunkSeconds,
        "levelDb": status.levelDb,
        "inputName": status.inputName,
        "builtInMic": status.builtInMic,
        "nextSeq": status.nextSeq,
        "batteryLevel": battery,
        "charging": charging,
      ]
    }

    Function("excludeFromBackup") { (uri: String) in
      guard var url = URL(string: uri), url.isFileURL else { return }
      try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? url.setResourceValues(values)
    }

    Function("updateActivity") { (state: RecorderActivityState) in
      if #available(iOS 16.1, *) {
        LectureActivityController.shared.update(
          elapsedSeconds: Int(state.elapsedSeconds),
          savedSeconds: Int(state.savedSeconds),
          paused: state.paused,
          micStopped: state.micStopped
        )
      }
    }
  }

  private static var observersInstalled = false

  /// Lock screen / Dynamic Island buttons → JS events. Installed once per
  /// process (a JS reload creates a new module; a second set of observers
  /// would deliver every press twice, and two pause toggles cancel out).
  private static func installControlObservers() {
    guard !observersInstalled else { return }
    observersInstalled = true
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let names: [(String, String)] = [
      (LectureRecordingControl.stop, "onStopRequested"),
      (LectureRecordingControl.togglePause, "onPauseToggleRequested"),
      (LectureRecordingControl.mark, "onMarkRequested"),
    ]
    for (name, _) in names {
      CFNotificationCenterAddObserver(center, nil, { _, _, received, _, _ in
        guard let received = received?.rawValue as String? else { return }
        let event: String
        switch received {
        case LectureRecordingControl.stop: event = "onStopRequested"
        case LectureRecordingControl.togglePause: event = "onPauseToggleRequested"
        case LectureRecordingControl.mark: event = "onMarkRequested"
        default: return
        }
        DispatchQueue.main.async {
          SemoraRecorderModule.current?.sendEvent(event, [:])
        }
      }, name as CFString, nil, .deliverImmediately)
    }
  }

  private func forward(_ event: LectureCapture.Event) {
    switch event {
    case let .chunkClosed(seq, uri, seconds, bytes, hasGap):
      sendEvent("onChunkClosed", ["seq": seq, "uri": uri, "seconds": seconds, "bytes": bytes, "hasGap": hasGap])
    case let .stopped(atMs):
      sendEvent("onCaptureStopped", ["at": atMs])
      if #available(iOS 16.1, *) {
        DispatchQueue.main.async { LectureActivityController.shared.setMicStopped(true) }
      }
    case let .resumed(atMs):
      sendEvent("onCaptureResumed", ["at": atMs])
      if #available(iOS 16.1, *) {
        DispatchQueue.main.async { LectureActivityController.shared.setMicStopped(false) }
      }
    case let .input(name, builtIn):
      sendEvent("onInputChanged", ["name": name as Any, "builtIn": builtIn])
    case let .failure(stage, code, message):
      sendEvent("onFailure", ["stage": stage, "code": code, "message": message as Any])
    }
  }
}
