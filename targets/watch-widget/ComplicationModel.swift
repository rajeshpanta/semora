import Foundation

// ── Semora complication model ────────────────────────────────────────────────
//
// A watch face has room for one fact. This file decides which one.
//
// It reads the SAME payload the Watch app reads — schema v3, the shape defined
// in lib/watchSnapshot.ts and sent by the iPhone. The complication is a third
// consumer of that one contract, not a new one: it invents no field names,
// applies no filters, and decides nothing about what "overdue" or "due today"
// means. Those were settled by the Today tab's queries long before anything
// reached a wrist.
//
// Kept free of WidgetKit so it can be compiled for macOS and checked against
// the Watch app's own decoder — see scripts/watchModelTests.

/// Where the Watch app leaves the snapshot for this extension to find.
///
/// A widget extension runs in its own process and cannot hold a WCSession, so a
/// shared container is the only route. These must match WatchSharedStore in
/// targets/watch/WatchModel.swift; the test harness compiles both and asserts
/// they are equal, because two constants that must agree across a process
/// boundary and live in different targets is exactly the pair that drifts.
enum ComplicationStore {
  static let appGroup = "group.com.rajeshpanta.syllabussnap"
  static let snapshotKey = "semora.watch.snapshot.v1"
}

enum ComplicationState: String {
  case ready
  case signedOut = "signed_out"
}

/// Everything a face can show, and nothing more.
struct ComplicationSnapshot: Equatable {
  var state: ComplicationState
  var dueTodayCount: Int
  var overdueCount: Int
  /// The most urgent outstanding item, if any. The phone ordered the list;
  /// this is simply its head.
  var nextTitle: String?
  var nextDueDate: String?
  var nextBucket: String?
  var updatedAt: Date?

  /// Must match WatchFreshness.staleAfter in the Watch app.
  static let staleAfter: TimeInterval = 6 * 60 * 60

  static let empty = ComplicationSnapshot(
    state: .ready, dueTodayCount: 0, overdueCount: 0,
    nextTitle: nil, nextDueDate: nil, nextBucket: nil, updatedAt: nil
  )

  /// Data old enough that a student should not act on it without checking.
  ///
  /// A complication is glanced at and believed. "0 due today" from a watch that
  /// has been out of range since breakfast is the one output here that can cost
  /// somebody a deadline, so age is treated as part of the reading rather than
  /// as metadata.
  func isStale(now: Date) -> Bool {
    guard let updatedAt else { return true }
    return now.timeIntervalSince(updatedAt) >= Self.staleAfter
  }

  var hasWork: Bool { dueTodayCount > 0 || overdueCount > 0 || nextTitle != nil }
}

/// Decode the shared payload. Returns nil for anything that is not a snapshot.
func decodeComplicationSnapshot(from context: [String: Any]) -> ComplicationSnapshot? {
  guard context["type"] as? String == "semora_watch_snapshot" else { return nil }

  func count(_ key: String) -> Int { (context[key] as? NSNumber)?.intValue ?? 0 }

  let items = context["items"] as? [[String: Any]] ?? []
  // The head of a list the phone already ordered overdue → today → upcoming.
  // Picking any other element, or re-sorting, would be this file deciding what
  // matters — which is the one thing it must not do.
  let next = items.first { ($0["title"] as? String)?.isEmpty == false }

  let raw = context["updatedAt"] as? String ?? ""

  return ComplicationSnapshot(
    state: ComplicationState(rawValue: context["state"] as? String ?? "ready") ?? .ready,
    dueTodayCount: count("dueTodayCount"),
    overdueCount: count("overdueCount"),
    nextTitle: next?["title"] as? String,
    nextDueDate: next?["dueDate"] as? String,
    nextBucket: next?["bucket"] as? String,
    updatedAt: ISO8601DateFormatter().date(from: raw)
  )
}

// ── Presentation ─────────────────────────────────────────────────────────────

/// The one line a rectangular complication leads with.
///
/// Ordered by what would change a student's next ten minutes: something already
/// late, then something due today, then the next thing coming, then the fact
/// that there is nothing.
func complicationHeadline(_ snapshot: ComplicationSnapshot) -> String {
  switch snapshot.state {
  case .signedOut: return "Sign in on iPhone"
  case .ready:
    if snapshot.overdueCount > 0 {
      let plural = snapshot.overdueCount == 1 ? "" : "s"
      if snapshot.dueTodayCount > 0 {
        return "\(snapshot.overdueCount) overdue · \(snapshot.dueTodayCount) today"
      }
      return "\(snapshot.overdueCount) task\(plural) overdue"
    }
    if snapshot.dueTodayCount > 0 {
      let plural = snapshot.dueTodayCount == 1 ? "" : "s"
      return "\(snapshot.dueTodayCount) task\(plural) due today"
    }
    if snapshot.nextTitle != nil { return "Nothing due today" }
    return "All caught up"
  }
}

/// The short form for an inline or circular face, where there is room for a
/// number and almost nothing else.
func complicationCompactLabel(_ snapshot: ComplicationSnapshot) -> String {
  switch snapshot.state {
  case .signedOut: return "—"
  case .ready:
    if snapshot.overdueCount > 0 { return "\(snapshot.overdueCount)!" }
    return "\(snapshot.dueTodayCount)"
  }
}

/// Secondary line: what is actually next, if anything is.
func complicationDetail(_ snapshot: ComplicationSnapshot, now: Date, calendar: Calendar = .current) -> String? {
  guard snapshot.state == .ready else { return nil }
  guard let title = snapshot.nextTitle else { return nil }
  guard let dueDate = snapshot.nextDueDate else { return title }
  return "\(complicationDueLabel(dueDate: dueDate, now: now, calendar: calendar)) · \(title)"
}

/// Day label, recomputed on the watch so a face that said "Tomorrow" last night
/// says "Today" this morning without the phone having synced again.
///
/// Deliberately terser than the Watch app's watchDueLabel — a complication has
/// no room for a time, and the label is only there to say how urgent the title
/// beside it is.
func complicationDueLabel(dueDate: String, now: Date, calendar: Calendar = .current) -> String {
  let parser = DateFormatter()
  parser.dateFormat = "yyyy-MM-dd"
  parser.calendar = calendar
  parser.timeZone = calendar.timeZone
  guard let due = parser.date(from: dueDate) else { return dueDate }

  let days = calendar.dateComponents(
    [.day],
    from: calendar.startOfDay(for: now),
    to: calendar.startOfDay(for: due)
  ).day ?? 0

  switch days {
  case ..<0: return "Late"
  case 0: return "Today"
  case 1: return "Tomorrow"
  case 2...6:
    let weekday = DateFormatter()
    weekday.dateFormat = "EEE"
    weekday.calendar = calendar
    weekday.timeZone = calendar.timeZone
    return weekday.string(from: due)
  default:
    let short = DateFormatter()
    short.dateFormat = "MMM d"
    short.calendar = calendar
    short.timeZone = calendar.timeZone
    return short.string(from: due)
  }
}
