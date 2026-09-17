import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(AppIntents)
import AppIntents
#endif

// ── The lecture recording Live Activity ─────────────────────────────────────
//
// Lock screen + Dynamic Island: how long the recording has run, how much is
// saved, whether it is paused or the microphone stopped, and Stop / Pause
// buttons. A student who locks their phone in class can see it is still
// recording and stop it without unlocking.
//
// KEEP IN SYNC with targets/widget/LectureRecordingActivity.swift. ActivityKit
// matches the attributes type across the app and the widget extension by name
// and shape, and an intent a widget button runs must exist in both targets.

public enum LectureRecordingControl {
  public static let stop = "com.semora.lecture-recording.stop"
  public static let togglePause = "com.semora.lecture-recording.toggle-pause"
  public static let mark = "com.semora.lecture-recording.mark"
}

/// Posted across processes. A Live Activity button's intent may run in the
/// widget extension rather than the app, and an in-process notification from
/// there would never reach the recorder; a Darwin notification reaches the app
/// wherever the intent ran.
func postLectureRecordingControl(_ name: String) {
  CFNotificationCenterPostNotification(
    CFNotificationCenterGetDarwinNotifyCenter(),
    CFNotificationName(name as CFString),
    nil, nil, true)
}


#if canImport(ActivityKit)
@available(iOS 16.1, *)
public struct LectureRecordingAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var elapsedSeconds: Int
    public var savedSeconds: Int
    public var paused: Bool
    public var micStopped: Bool
    /// When elapsedSeconds was measured; lets the view count forward on its own.
    public var measuredAt: Date

    public init(elapsedSeconds: Int, savedSeconds: Int, paused: Bool, micStopped: Bool, measuredAt: Date) {
      self.elapsedSeconds = elapsedSeconds
      self.savedSeconds = savedSeconds
      self.paused = paused
      self.micStopped = micStopped
      self.measuredAt = measuredAt
    }
  }

  public var title: String
  public var recordingLabel: String
  public var pausedLabel: String
  public var stoppedLabel: String
  public var stopLabel: String
  public var pauseLabel: String
  public var resumeLabel: String
  public var savedLabel: String
  public var markLabel: String
  /// Shown once the activity is stale: no update for `staleAfter` seconds
  /// means the app is gone ("Semora closed. Open to check your recording").
  /// Optional so an activity encoded without it still decodes.
  public var closedLabel: String?

  public init(title: String, recordingLabel: String, pausedLabel: String, stoppedLabel: String,
              stopLabel: String, pauseLabel: String, resumeLabel: String, savedLabel: String, markLabel: String,
              closedLabel: String? = nil) {
    self.title = title
    self.recordingLabel = recordingLabel
    self.pausedLabel = pausedLabel
    self.stoppedLabel = stoppedLabel
    self.stopLabel = stopLabel
    self.pauseLabel = pauseLabel
    self.resumeLabel = resumeLabel
    self.savedLabel = savedLabel
    self.markLabel = markLabel
    self.closedLabel = closedLabel
  }
}

@available(iOS 16.1, *)
final class LectureActivityController {
  static let shared = LectureActivityController()
  private var activity: Activity<LectureRecordingAttributes>?
  private var lastState: LectureRecordingAttributes.ContentState?
  private var lastSentAt = Date.distantPast

  /// Every request and update carries a stale date this far out. A healthy
  /// recording refreshes the activity at least every `heartbeatSeconds` from
  /// native code (see refresh), so only a dead process lets it pass — and the
  /// widget then stops the running clock and says Semora closed, instead of
  /// "Recording" counting up over nothing until the app next starts.
  static let staleAfter: TimeInterval = 90
  static let heartbeatSeconds: TimeInterval = 30

  private static func staleDate() -> Date {
    Date().addingTimeInterval(staleAfter)
  }

  /// Activities left by a process that died mid-lecture (a kill, a force-quit,
  /// an update) keep counting on the lock screen and their buttons reach
  /// nothing. Ended on every launch and before every start.
  func endStale() {
    for stale in Activity<LectureRecordingAttributes>.activities {
      Task {
        if #available(iOS 16.2, *) {
          await stale.end(nil, dismissalPolicy: .immediate)
        } else {
          await stale.end(dismissalPolicy: .immediate)
        }
      }
    }
  }

  func start(attributes: LectureRecordingAttributes) {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    end()
    endStale()
    let state = LectureRecordingAttributes.ContentState(
      elapsedSeconds: 0, savedSeconds: 0, paused: false, micStopped: false, measuredAt: Date())
    do {
      if #available(iOS 16.2, *) {
        activity = try Activity.request(attributes: attributes, content: .init(state: state, staleDate: LectureActivityController.staleDate()), pushType: nil)
      } else {
        activity = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
      }
      lastState = state
      lastSentAt = Date()
    } catch {
      activity = nil
    }
  }

  /// The microphone stopped or came back, from the native recorder itself:
  /// the JS tick that normally drives this is not running on a locked phone.
  func setMicStopped(_ stopped: Bool) {
    guard let last = lastState, last.micStopped != stopped else { return }
    // The clock was counting forward on its own since the last update: freeze
    // it where it had got to, not where it was then.
    let elapsed = !last.paused && !last.micStopped
      ? last.elapsedSeconds + max(0, Int(Date().timeIntervalSince(last.measuredAt)))
      : last.elapsedSeconds
    update(elapsedSeconds: elapsed, savedSeconds: last.savedSeconds, paused: last.paused, micStopped: stopped)
  }

  /// Throttled: the view counts time forward itself, so an update is only
  /// needed when a state changes or every 30 seconds to correct drift.
  func update(elapsedSeconds: Int, savedSeconds: Int, paused: Bool, micStopped: Bool) {
    guard let activity else { return }
    let state = LectureRecordingAttributes.ContentState(
      elapsedSeconds: elapsedSeconds, savedSeconds: savedSeconds, paused: paused, micStopped: micStopped, measuredAt: Date())
    let changed = lastState?.paused != paused || lastState?.micStopped != micStopped
    guard changed || Date().timeIntervalSince(lastSentAt) >= LectureActivityController.heartbeatSeconds else { return }
    send(state, to: activity)
  }

  /// The native heartbeat (main thread), from the capture's own timer: keeps a
  /// locked-phone recording fresh while JavaScript is suspended and the JS
  /// tick that calls update() is not running. Carries the last paused /
  /// stopped flags forward, advances the clock only while it is running, and
  /// takes the saved figure from the recorder.
  func refresh(savedSeconds: Int) {
    guard let activity, let last = lastState else { return }
    guard Date().timeIntervalSince(lastSentAt) >= LectureActivityController.heartbeatSeconds - 5 else { return }
    let now = Date()
    let running = !last.paused && !last.micStopped
    let elapsed = running
      ? last.elapsedSeconds + max(0, Int(now.timeIntervalSince(last.measuredAt)))
      : last.elapsedSeconds
    let state = LectureRecordingAttributes.ContentState(
      elapsedSeconds: elapsed, savedSeconds: max(last.savedSeconds, savedSeconds),
      paused: last.paused, micStopped: last.micStopped, measuredAt: now)
    send(state, to: activity)
  }

  private func send(_ state: LectureRecordingAttributes.ContentState, to activity: Activity<LectureRecordingAttributes>) {
    lastState = state
    lastSentAt = Date()
    Task {
      if #available(iOS 16.2, *) {
        await activity.update(.init(state: state, staleDate: LectureActivityController.staleDate()))
      } else {
        await activity.update(using: state)
      }
    }
  }

  func end() {
    guard let activity else { return }
    self.activity = nil
    lastState = nil
    Task {
      if #available(iOS 16.2, *) {
        await activity.end(nil, dismissalPolicy: .immediate)
      } else {
        await activity.end(dismissalPolicy: .immediate)
      }
    }
  }
}
#endif

#if canImport(AppIntents)
@available(iOS 17.0, *)
public struct StopLectureRecordingIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Stop recording"
  public init() {}
  public func perform() async throws -> some IntentResult {
    postLectureRecordingControl(LectureRecordingControl.stop)
    return .result()
  }
}

@available(iOS 17.0, *)
public struct MarkLectureMomentIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Mark this moment important"
  public init() {}
  public func perform() async throws -> some IntentResult {
    postLectureRecordingControl(LectureRecordingControl.mark)
    return .result()
  }
}

@available(iOS 17.0, *)
public struct ToggleLectureRecordingPauseIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Pause or resume recording"
  public init() {}
  public func perform() async throws -> some IntentResult {
    postLectureRecordingControl(LectureRecordingControl.togglePause)
    return .result()
  }
}
#endif
