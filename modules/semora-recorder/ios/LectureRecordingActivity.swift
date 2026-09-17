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

  public init(title: String, recordingLabel: String, pausedLabel: String, stoppedLabel: String,
              stopLabel: String, pauseLabel: String, resumeLabel: String, savedLabel: String, markLabel: String) {
    self.title = title
    self.recordingLabel = recordingLabel
    self.pausedLabel = pausedLabel
    self.stoppedLabel = stoppedLabel
    self.stopLabel = stopLabel
    self.pauseLabel = pauseLabel
    self.resumeLabel = resumeLabel
    self.savedLabel = savedLabel
    self.markLabel = markLabel
  }
}

@available(iOS 16.1, *)
final class LectureActivityController {
  static let shared = LectureActivityController()
  private var activity: Activity<LectureRecordingAttributes>?
  private var lastState: LectureRecordingAttributes.ContentState?
  private var lastSentAt = Date.distantPast

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
        activity = try Activity.request(attributes: attributes, content: .init(state: state, staleDate: nil), pushType: nil)
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
    update(elapsedSeconds: last.elapsedSeconds, savedSeconds: last.savedSeconds, paused: last.paused, micStopped: stopped)
  }

  /// Throttled: the view counts time forward itself, so an update is only
  /// needed when a state changes or every 30 seconds to correct drift.
  func update(elapsedSeconds: Int, savedSeconds: Int, paused: Bool, micStopped: Bool) {
    guard let activity else { return }
    let state = LectureRecordingAttributes.ContentState(
      elapsedSeconds: elapsedSeconds, savedSeconds: savedSeconds, paused: paused, micStopped: micStopped, measuredAt: Date())
    let changed = lastState?.paused != paused || lastState?.micStopped != micStopped
    guard changed || Date().timeIntervalSince(lastSentAt) >= 30 else { return }
    lastState = state
    lastSentAt = Date()
    Task {
      if #available(iOS 16.2, *) {
        await activity.update(.init(state: state, staleDate: nil))
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
