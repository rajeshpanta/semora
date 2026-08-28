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
  let id = UUID()
  var title: String
  var course: String
  var color: Color
  var dueDate: String
  var dueTime: String?
  var bucket: WatchBucket
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

  /// Must match WATCH_SCHEMA_VERSION in lib/watchSnapshot.ts.
  static let supportedSchemaVersion = 2
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
    return WatchTask(
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
    updatedAtRaw: raw
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

  static func describe(updatedAt: Date?, now: Date) -> WatchFreshness {
    guard let updatedAt else {
      return WatchFreshness(label: "Not synced yet", isStale: true)
    }

    let age = now.timeIntervalSince(updatedAt)

    // A small negative age is ordinary clock skew between two devices, not a
    // future timestamp; treat it as "just now" rather than printing nonsense.
    if age < 60 { return WatchFreshness(label: "Updated just now", isStale: false) }

    let stale = age >= staleAfter
    let minutes = Int(age / 60)
    if minutes < 60 {
      return WatchFreshness(label: "Updated \(minutes)m ago", isStale: stale)
    }
    let hours = minutes / 60
    if hours < 24 {
      return WatchFreshness(label: "Updated \(hours)h ago", isStale: stale)
    }
    let days = hours / 24
    return WatchFreshness(label: "Updated \(days)d ago", isStale: stale)
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
func watchDueLabel(dueDate: String, dueTime: String?, now: Date, calendar: Calendar = .current) -> String {
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
    case ..<0: dayLabel = days == -1 ? "Yesterday" : "\(-days)d late"
    case 0: dayLabel = "Today"
    case 1: dayLabel = "Tomorrow"
    case 2...6:
      dayLabel = Self_label(format: "EEE", date: due, calendar: calendar)
    default:
      dayLabel = Self_label(format: "MMM d", date: due, calendar: calendar)
    }

    // Times only earn their space on rows where they change what you do next.
    guard days >= 0, days <= 1, let dueTime, dueTime.count >= 5 else { return dayLabel }
    return "\(dayLabel) \(dueTime.prefix(5))"
}

