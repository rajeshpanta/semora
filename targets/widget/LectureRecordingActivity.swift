import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// ── Lecture recording Live Activity (widget side) ───────────────────────────
//
// KEEP IN SYNC with modules/semora-recorder/ios/LectureRecordingActivity.swift.
// ActivityKit matches LectureRecordingAttributes across the app and this
// extension by name and shape, and a button's intent must exist in both.
// Strings arrive in the attributes, already localized by the app.

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


public struct LectureRecordingAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var elapsedSeconds: Int
    public var savedSeconds: Int
    public var paused: Bool
    public var micStopped: Bool
    public var measuredAt: Date
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
}

public struct StopLectureRecordingIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Stop recording"
  public init() {}
  public func perform() async throws -> some IntentResult {
    postLectureRecordingControl(LectureRecordingControl.stop)
    return .result()
  }
}

public struct MarkLectureMomentIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Mark this moment important"
  public init() {}
  public func perform() async throws -> some IntentResult {
    postLectureRecordingControl(LectureRecordingControl.mark)
    return .result()
  }
}

public struct ToggleLectureRecordingPauseIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Pause or resume recording"
  public init() {}
  public func perform() async throws -> some IntentResult {
    postLectureRecordingControl(LectureRecordingControl.togglePause)
    return .result()
  }
}

// Tints for icons and button fills only. Text that carries the state is drawn
// in .primary: coral is 3.5:1 and amber 2.35:1 on the light lock screen, and
// the tinted icon next to it says the same thing in colour.
private let coral = Color(red: 0.91, green: 0.36, blue: 0.29)
private let amber = Color(red: 0.88, green: 0.61, blue: 0.24)

private func clock(_ seconds: Int) -> String {
  Duration.seconds(seconds).formatted(.time(pattern: seconds >= 3600 ? .hourMinuteSecond : .minuteSecond))
}

private struct ElapsedText: View {
  let state: LectureRecordingAttributes.ContentState
  var body: some View {
    if state.paused || state.micStopped {
      Text(Duration.seconds(state.elapsedSeconds), format: .time(pattern: state.elapsedSeconds >= 3600 ? .hourMinuteSecond : .minuteSecond))
        .monospacedDigit()
    } else {
      // Counts forward on its own between updates.
      Text(timerInterval: state.measuredAt.addingTimeInterval(-Double(state.elapsedSeconds))...Date.distantFuture, countsDown: false)
        .monospacedDigit()
    }
  }
}

private func statusLabel(_ context: ActivityViewContext<LectureRecordingAttributes>) -> String {
  if context.state.micStopped { return context.attributes.stoppedLabel }
  if context.state.paused { return context.attributes.pausedLabel }
  return context.attributes.recordingLabel
}

/// What VoiceOver says for the clock: the state and the time at the last
/// update, in the app's language ("Recording, 42:10"). A running timer's own
/// label is only digits.
private func clockAccessibilityLabel(_ context: ActivityViewContext<LectureRecordingAttributes>) -> String {
  "\(statusLabel(context)), \(clock(context.state.elapsedSeconds))"
}

private func tint(_ state: LectureRecordingAttributes.ContentState) -> Color {
  state.micStopped ? amber : (state.paused ? .gray : coral)
}

/// "40:00 saved" — how much audio is safely on the phone, which is the figure
/// that matters when the microphone stopped: the elapsed clock alone said
/// "Recording 42:10" about audio that was never captured. Number first so the
/// lowercase label the app sends ("saved" / "guardado") reads in both languages.
private struct SavedText: View {
  let context: ActivityViewContext<LectureRecordingAttributes>
  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: context.state.micStopped ? "mic.slash" : "checkmark.circle.fill")
        .foregroundStyle(context.state.micStopped ? amber : .secondary)
      Text(Duration.seconds(context.state.savedSeconds), format: .time(pattern: context.state.savedSeconds >= 3600 ? .hourMinuteSecond : .minuteSecond))
        .monospacedDigit()
      Text(context.attributes.savedLabel)
    }
    .font(.caption)
    // Stopped: the figure that matters is drawn in full contrast; the amber
    // stays on the icon.
    .foregroundStyle(context.state.micStopped
      ? AnyShapeStyle(HierarchicalShapeStyle.primary)
      : AnyShapeStyle(HierarchicalShapeStyle.secondary))
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(clock(context.state.savedSeconds)) \(context.attributes.savedLabel)")
  }
}

/// Pause / Resume, or — when the microphone stopped — a plain "Microphone
/// stopped" label: Pause on a stopped mic did nothing and read as a fix. A tap
/// on the activity opens the app, which restarts capture. Resume is the
/// prominent button while paused. Two branches because the button styles are
/// different types.
private struct PauseControl: View {
  let context: ActivityViewContext<LectureRecordingAttributes>
  let compact: Bool
  var body: some View {
    if context.state.micStopped {
      if compact {
        Image(systemName: "arrow.up.forward.app")
          .frame(maxWidth: .infinity)
          .foregroundStyle(amber)
          .accessibilityLabel(context.attributes.stoppedLabel)
      } else {
        Label {
          Text(context.attributes.stoppedLabel).foregroundStyle(.primary)
        } icon: {
          Image(systemName: "arrow.up.forward.app").foregroundStyle(amber)
        }
        .frame(maxWidth: .infinity)
      }
    } else if context.state.paused {
      Button(intent: ToggleLectureRecordingPauseIntent()) { content }
        .buttonStyle(.borderedProminent)
        .tint(coral)
    } else {
      Button(intent: ToggleLectureRecordingPauseIntent()) { content }
        .buttonStyle(.bordered)
    }
  }
  @ViewBuilder private var content: some View {
    if compact {
      // Icon only: VoiceOver would otherwise read the symbol's own name in
      // the phone's language ("Play"), not the app's word in the student's.
      Image(systemName: context.state.paused ? "play.fill" : "pause.fill")
        .frame(maxWidth: .infinity)
        .accessibilityLabel(context.state.paused ? context.attributes.resumeLabel : context.attributes.pauseLabel)
    } else {
      Label(context.state.paused ? context.attributes.resumeLabel : context.attributes.pauseLabel,
            systemImage: context.state.paused ? "play.fill" : "pause.fill")
        .frame(maxWidth: .infinity)
    }
  }
}

/// Mark is the button students tap most, so it is the prominent one while
/// recording; while paused it steps back and Resume takes over.
private struct MarkControl: View {
  let context: ActivityViewContext<LectureRecordingAttributes>
  let compact: Bool
  var body: some View {
    if context.state.paused {
      Button(intent: MarkLectureMomentIntent()) { content }
        .buttonStyle(.bordered)
        .tint(amber)
    } else {
      Button(intent: MarkLectureMomentIntent()) { content }
        .buttonStyle(.borderedProminent)
        .tint(amber)
    }
  }
  @ViewBuilder private var content: some View {
    if compact {
      Image(systemName: "star.fill")
        .frame(maxWidth: .infinity)
        .accessibilityLabel(context.attributes.markLabel)
    } else {
      Label(context.attributes.markLabel, systemImage: "star.fill").frame(maxWidth: .infinity)
    }
  }
}

struct LectureRecordingLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LectureRecordingAttributes.self) { context in
      // Lock screen
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 8) {
          Image(systemName: context.state.micStopped ? "mic.slash.fill" : (context.state.paused ? "pause.fill" : "mic.fill"))
            .foregroundStyle(tint(context.state))
            .accessibilityHidden(true)
          Text(statusLabel(context)).font(.headline).foregroundStyle(.primary)
          Spacer()
          ElapsedText(state: context.state)
            .font(.title2.weight(.semibold))
            .accessibilityLabel(clockAccessibilityLabel(context))
        }
        Text(context.attributes.title).font(.subheadline).lineLimit(1).foregroundStyle(.secondary)
        SavedText(context: context)
        HStack(spacing: 10) {
          PauseControl(context: context, compact: false)
          MarkControl(context: context, compact: false)
          Button(intent: StopLectureRecordingIntent()) {
            Label(context.attributes.stopLabel, systemImage: "stop.fill").frame(maxWidth: .infinity)
          }
          .buttonStyle(.bordered)
          .tint(coral)
        }
        .labelStyle(.titleAndIcon)
        .font(.subheadline.weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      }
      .padding(16)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(statusLabel(context), systemImage: context.state.micStopped ? "mic.slash.fill" : "mic.fill")
            .foregroundStyle(tint(context.state))
            .font(.caption.weight(.semibold))
        }
        DynamicIslandExpandedRegion(.trailing) {
          ElapsedText(state: context.state)
            .font(.title3.weight(.semibold))
            .accessibilityLabel(clockAccessibilityLabel(context))
        }
        DynamicIslandExpandedRegion(.center) {
          SavedText(context: context)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 10) {
            PauseControl(context: context, compact: true)
            MarkControl(context: context, compact: true)
            Button(intent: StopLectureRecordingIntent()) {
              Label(context.attributes.stopLabel, systemImage: "stop.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(coral)
          }
        }
      } compactLeading: {
        Image(systemName: context.state.micStopped ? "mic.slash.fill" : "mic.fill")
          .foregroundStyle(tint(context.state))
          .accessibilityLabel(statusLabel(context))
      } compactTrailing: {
        ElapsedText(state: context.state)
          .frame(maxWidth: 56)
          .font(.caption.weight(.semibold))
          .accessibilityLabel(clockAccessibilityLabel(context))
      } minimal: {
        Image(systemName: context.state.micStopped ? "mic.slash.fill" : "mic.fill")
          .foregroundStyle(tint(context.state))
          .accessibilityLabel(clockAccessibilityLabel(context))
      }
    }
  }
}
