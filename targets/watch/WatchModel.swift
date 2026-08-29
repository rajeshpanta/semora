import SwiftUI
import Foundation

// ── Semora Watch model ───────────────────────────────────────────────────────
//
// Everything on this screen is decided by the iPhone. This file holds the parts
// that are pure — decoding the application context, and turning a raw date or a
// timestamp into something readable — so they can be exercised without a watch,
// a simulator, or a paired phone (see scripts/watchModelTests.swift).
//
// The connectivity store lives here too: it is the only thing that mutates, and
// keeping it beside the model it produces makes the data flow readable in one
// file.

// ── Model ────────────────────────────────────────────────────────────────────

enum WatchBucket: String {
  case overdue, today, upcoming

  /// Unknown buckets from a newer phone build render as plain upcoming rows
  /// rather than being dropped — showing the work without its emphasis beats
  /// hiding it.
  init(raw: String?) {
    self = WatchBucket(rawValue: raw ?? "") ?? .upcoming
  }
}

struct WatchTask: Identifiable, Equatable {
  /// The task's own database uuid, sent by the phone. Also what a completion
  /// request names — see the note on WatchTaskItem in lib/watchSnapshot.ts for
  /// why this and not an index or a title.
  var id: String
  var title: String
  var course: String
  var color: Color
  var dueDate: String
  var dueTime: String?
  var bucket: WatchBucket
}

/// The phone's vocabulary for this build's UI.
///
/// The Watch ships no localisation of its own, so every label it draws is
/// looked up here first and falls back to the English it was compiled with.
/// That fallback is the whole safety story: a payload from an older JS bundle
/// carries no strings, an unknown key returns the compiled default, and neither
/// case can fail — the Watch simply looks the way it always did.
struct SurfaceStrings: Equatable {
  private let map: [String: String]

  init(_ map: [String: String]?) {
    self.map = map ?? [:]
  }

  /// The phone's word for this, or the one compiled in.
  func callAsFunction(_ key: String, _ fallback: String) -> String {
    let value = map[key]
    return (value?.isEmpty == false) ? value! : fallback
  }

  /// Same, with the count filled in on THIS device. The number is deliberately
  /// not sent: a freshness label saying "2m ago" would be wrong within a minute.
  func callAsFunction(_ key: String, _ fallback: String, n: Int) -> String {
    callAsFunction(key, fallback).replacingOccurrences(of: "{n}", with: String(n))
  }
}

enum WatchPayloadState: String {
  case ready
  case signedOut = "signed_out"
}

struct WatchSnapshot: Equatable {
  var schemaVersion: Int
  var state: WatchPayloadState
  var dueTodayCount: Int
  var overdueCount: Int
  var tasks: [WatchTask]
  var updatedAt: Date?
  var updatedAtRaw: String
  /// Localised chrome from the phone. Empty means "use the compiled English".
  var strings: SurfaceStrings

  /// Must match WATCH_SCHEMA_VERSION in lib/watchSnapshot.ts.
  static let supportedSchemaVersion = 3
  var isFutureSchema: Bool { schemaVersion > Self.supportedSchemaVersion }
}

/// `#RRGGBB` → Color. Falls back to the brand purple rather than failing a row.
func watchColor(fromHex hex: String) -> Color {
  let brand = Color(red: 0.42, green: 0.27, blue: 0.76)
  var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
  if cleaned.hasPrefix("#") { cleaned.removeFirst() }
  guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else { return brand }
  return Color(
    red: Double((value & 0xFF0000) >> 16) / 255,
    green: Double((value & 0x00FF00) >> 8) / 255,
    blue: Double(value & 0x0000FF) / 255
  )
}

/// Decode an application context into a snapshot.
///
/// Returns nil only when the payload is not ours — the Phase 2 diagnostic
/// (`semora_watch_test`) is deliberately rejected here so a stray test send
/// cannot blank out real data. Missing or wrong-typed FIELDS are defaulted
/// instead: a payload that loses one count should still refresh everything
/// else, and rejecting it wholesale would strand the watch on older data with
/// no way to say why.
func decodeWatchSnapshot(from context: [String: Any]) -> WatchSnapshot? {
  guard let type = context["type"] as? String, type == "semora_watch_snapshot" else {
    return nil
  }

  // Numbers cross the WatchConnectivity boundary as NSNumber. Reading through
  // NSNumber also accepts a value encoded as a Double, which is what a
  // JS-origin number can become.
  func count(_ key: String) -> Int { (context[key] as? NSNumber)?.intValue ?? 0 }

  let rawItems = context["items"] as? [[String: Any]] ?? []
  let tasks: [WatchTask] = rawItems.compactMap { raw in
    guard let title = raw["title"] as? String, !title.isEmpty else { return nil }
    // A row with no id cannot be completed, and a row that cannot be acted on
    // is worse than absent — it looks tappable and does nothing.
    guard let id = raw["id"] as? String, !id.isEmpty else { return nil }
    return WatchTask(
      id: id,
      title: title,
      course: raw["course"] as? String ?? "Course",
      color: watchColor(fromHex: raw["colorHex"] as? String ?? ""),
      dueDate: raw["dueDate"] as? String ?? "",
      dueTime: raw["dueTime"] as? String,
      bucket: WatchBucket(raw: raw["bucket"] as? String)
    )
  }

  let raw = context["updatedAt"] as? String ?? ""
  return WatchSnapshot(
    schemaVersion: count("schemaVersion"),
    state: WatchPayloadState(rawValue: context["state"] as? String ?? "ready") ?? .ready,
    dueTodayCount: count("dueTodayCount"),
    overdueCount: count("overdueCount"),
    tasks: tasks,
    updatedAt: ISO8601DateFormatter().date(from: raw),
    updatedAtRaw: raw,
    strings: SurfaceStrings(context["strings"] as? [String: String])
  )
}

// ── Freshness ────────────────────────────────────────────────────────────────

/// How the last update should be described, and whether to say it loudly.
///
/// Freshness is the one thing the watch genuinely knows better than the phone.
/// Application context arrives opportunistically — a watch out of range all
/// morning shows morning's numbers with no indication anything is wrong, and a
/// student who trusts a stale "0 due today" misses a deadline. So the age of the
/// data is rendered as prominently as the data.
struct WatchFreshness {
  var label: String
  var isStale: Bool

  /// Anything older than this is called out. Chosen against the sync trigger:
  /// the phone pushes on every Today-tab settle, so a gap this long means the
  /// app has not been opened or the watch has not been in range for most of a
  /// day — long enough for the numbers to be wrong.
  static let staleAfter: TimeInterval = 6 * 60 * 60

  /// `strings` defaults to empty so every existing caller and test keeps
  /// working and simply gets the compiled English.
  static func describe(
    updatedAt: Date?,
    now: Date,
    strings: SurfaceStrings = SurfaceStrings(nil)
  ) -> WatchFreshness {
    guard let updatedAt else {
      return WatchFreshness(label: strings("watch.updated.never", "Not synced yet"), isStale: true)
    }

    let age = now.timeIntervalSince(updatedAt)

    // A small negative age is ordinary clock skew between two devices, not a
    // future timestamp; treat it as "just now" rather than printing nonsense.
    if age < 60 {
      return WatchFreshness(label: strings("watch.updated.now", "Updated just now"), isStale: false)
    }

    let stale = age >= staleAfter
    let minutes = Int(age / 60)
    if minutes < 60 {
      return WatchFreshness(label: strings("watch.updated.minutes", "Updated {n}m ago", n: minutes), isStale: stale)
    }
    let hours = minutes / 60
    if hours < 24 {
      return WatchFreshness(label: strings("watch.updated.hours", "Updated {n}h ago", n: hours), isStale: stale)
    }
    let days = hours / 24
    return WatchFreshness(label: strings("watch.updated.days", "Updated {n}d ago", n: days), isStale: stale)
  }
}


/// Formats a date in the SAME calendar and timezone it was parsed in.
///
/// A DateFormatter defaults to the device timezone regardless of the calendar
/// it was given. Parsing "2026-08-31" as UTC midnight and then formatting it in
/// a timezone even one hour behind names the previous day — a row that says
/// "Sun" for work due Monday. The app always passes `.current` on both sides so
/// this never bit a user, but the asymmetry made the function lie whenever its
/// calendar argument was taken seriously.
private func Self_label(format: String, date: Date, calendar: Calendar) -> String {
  let formatter = DateFormatter()
  formatter.dateFormat = format
  formatter.calendar = calendar
  formatter.timeZone = calendar.timeZone
  return formatter.string(from: date)
}

/// "Today", "Tomorrow", "Mon", "Sep 4" — recomputed on the watch from the raw
/// date so a row that said "Tomorrow" last night says "Today" this morning
/// without the phone having synced again.
func watchDueLabel(
  dueDate: String,
  dueTime: String?,
  now: Date,
  calendar: Calendar = .current,
  strings: SurfaceStrings = SurfaceStrings(nil)
) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    guard let due = formatter.date(from: dueDate) else { return dueDate }

    let startOfDue = calendar.startOfDay(for: due)
    let startOfToday = calendar.startOfDay(for: now)
    let days = calendar.dateComponents([.day], from: startOfToday, to: startOfDue).day ?? 0

    let dayLabel: String
    switch days {
    case ..<0:
      dayLabel = days == -1
        ? strings("due.yesterday", "Yesterday")
        : strings("due.daysLate", "{n}d late", n: -days)
    case 0: dayLabel = strings("due.today", "Today")
    case 1: dayLabel = strings("due.tomorrow", "Tomorrow")
    case 2...6:
      // Weekday and month names come from the formatter, which already follows
      // the device locale — the words that had to travel are the relative ones.
      dayLabel = Self_label(format: "EEE", date: due, calendar: calendar)
    default:
      dayLabel = Self_label(format: "MMM d", date: due, calendar: calendar)
    }

    // Times only earn their space on rows where they change what you do next.
    guard days >= 0, days <= 1, let dueTime, dueTime.count >= 5 else { return dayLabel }
    return "\(dayLabel) \(dueTime.prefix(5))"
}


// ── Completion ───────────────────────────────────────────────────────────────

/// What a row looks like while a completion is in flight.
enum WatchRowState: Equatable {
  /// Tappable.
  case idle
  /// Sent; the phone has not answered yet.
  case pending
  /// The phone confirmed. Shown as done until a fresh snapshot drops the row.
  case done
  /// The phone refused or could not do it. Tappable again.
  case failed
}

/// Tracks completions the watch has asked for but the phone has not yet
/// reflected in a snapshot.
///
/// This exists because the two directions are asynchronous and independent. A
/// tap goes out as a queued transfer that may sit for minutes if the phone is
/// away; the snapshot that would prove it worked only arrives when the phone
/// next syncs. Without something in between, a student taps a row and watches
/// nothing happen — so they tap again, which is exactly the input the whole
/// replay-guard chain exists to survive.
struct WatchCompletionTracker: Equatable {
  private struct Entry: Equatable {
    var state: WatchRowState
    var requestId: String
    var at: Date
  }

  private var entries: [String: Entry] = [:]

  /// How long a request may stay unanswered before the row becomes tappable
  /// again. Generous on purpose: a queued transfer to a phone that is off or
  /// out of range is normal, and reverting early would tell the student their
  /// tap was lost while it was still on its way.
  static let pendingExpiry: TimeInterval = 10 * 60

  func state(for taskId: String) -> WatchRowState {
    entries[taskId]?.state ?? .idle
  }

  /// Record that a request has gone out. Returns false if one is already in
  /// flight for this task — the first guard against a double tap, before the
  /// phone's ledger and the database check ever see it.
  mutating func begin(taskId: String, requestId: String, now: Date) -> Bool {
    if let existing = entries[taskId], existing.state == .pending || existing.state == .done {
      return false
    }
    entries[taskId] = Entry(state: .pending, requestId: requestId, at: now)
    return true
  }

  /// Apply the phone's answer. Ignores acks for requests we did not send, and
  /// stale acks for a task that has since been asked about again.
  mutating func resolve(requestId: String, ok: Bool, now: Date) {
    guard let taskId = entries.first(where: { $0.value.requestId == requestId })?.key else { return }
    entries[taskId] = Entry(state: ok ? .done : .failed, requestId: requestId, at: now)
  }

  /// Drop anything the snapshot has moved past.
  ///
  /// A task absent from a fresh snapshot is finished as far as the phone is
  /// concerned, whatever this watch believed. A task still present after a
  /// confirmed completion means the snapshot predates it — keep the local
  /// state until a newer one says otherwise.
  mutating func reconcile(with visibleTaskIds: Set<String>, now: Date) {
    for (taskId, entry) in entries {
      if !visibleTaskIds.contains(taskId) {
        entries.removeValue(forKey: taskId)
      } else if entry.state == .pending, now.timeIntervalSince(entry.at) >= Self.pendingExpiry {
        // Never answered. Let the student try again rather than leaving a row
        // that looks permanently stuck.
        entries[taskId] = Entry(state: .failed, requestId: entry.requestId, at: now)
      }
    }
  }

  /// For persistence across launches: a queued transfer outlives the app.
  var storable: [String: [String: Any]] {
    entries.reduce(into: [:]) { out, pair in
      out[pair.key] = [
        "state": String(describing: pair.value.state),
        "requestId": pair.value.requestId,
        "at": pair.value.at.timeIntervalSince1970,
      ]
    }
  }

  static func restore(from raw: [String: Any]) -> WatchCompletionTracker {
    var tracker = WatchCompletionTracker()
    for (taskId, value) in raw {
      guard
        let fields = value as? [String: Any],
        let stateName = fields["state"] as? String,
        let requestId = fields["requestId"] as? String,
        let at = fields["at"] as? Double
      else { continue }
      let state: WatchRowState
      switch stateName {
      case "pending": state = .pending
      case "done": state = .done
      case "failed": state = .failed
      default: continue
      }
      tracker.entries[taskId] = Entry(
        state: state,
        requestId: requestId,
        at: Date(timeIntervalSince1970: at)
      )
    }
    return tracker
  }
}

/// The phone's answer to one completion request.
struct WatchCompletionAck: Equatable {
  var requestId: String
  var taskId: String
  var ok: Bool
  var reason: String?
}

/// Decode an ack. Returns nil for anything that is not one.
func decodeWatchAck(from userInfo: [String: Any]) -> WatchCompletionAck? {
  guard
    userInfo["type"] as? String == "semora_watch_complete_ack",
    let requestId = userInfo["requestId"] as? String, !requestId.isEmpty,
    let taskId = userInfo["taskId"] as? String, !taskId.isEmpty
  else { return nil }
  // A missing `ok` is treated as failure: the safe reading of a malformed
  // answer is that the work did not happen, because that leaves the row
  // tappable instead of falsely struck through.
  let ok = (userInfo["ok"] as? NSNumber)?.boolValue ?? false
  return WatchCompletionAck(
    requestId: requestId,
    taskId: taskId,
    ok: ok,
    reason: userInfo["reason"] as? String
  )
}

/// Build the payload the watch sends when a row is tapped.
func watchCompletionRequest(taskId: String, requestId: String, now: Date) -> [String: Any] {
  [
    "type": "semora_watch_complete",
    "requestId": requestId,
    "taskId": taskId,
    "requestedAt": ISO8601DateFormatter().string(from: now),
  ]
}

// ── Shared container ─────────────────────────────────────────────────────────

/// Where this app leaves the snapshot for the complication to find.
///
/// A WidgetKit extension runs in its own process and cannot hold a WCSession,
/// so a shared group container is the only route between them. The payload
/// written there is the application context exactly as the iPhone sent it —
/// not a reshaped copy — so the complication decodes the same schema v3 this
/// app does, and there is one format on the wire and on disk rather than two.
///
/// These must match ComplicationStore in
/// targets/watch-widget/ComplicationModel.swift. The two live in different
/// targets and cannot import each other, so scripts/watchModelTests compiles
/// both and asserts they are equal.
enum WatchSharedStore {
  static let appGroup = "group.com.rajeshpanta.syllabussnap"
  static let snapshotKey = "semora.watch.snapshot.v1"
}
