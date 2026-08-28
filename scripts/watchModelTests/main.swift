// Automated coverage for the pure half of the Watch app.
//
// Run with:
//   scripts/run-watch-model-tests.sh
//
// Named main.swift because Swift only allows top-level code in a file with that
// name; the directory exists solely to give it that name.
//
// The Watch target itself cannot host XCTest without adding a watchOS test
// bundle to a generated Xcode project — which CNG would throw away on the next
// prebuild. So targets/watch/WatchModel.swift is deliberately free of
// WatchConnectivity, and this harness compiles it for macOS and exercises it
// directly. What is covered is exactly what can go wrong silently on a wrist:
// a payload that decodes into the wrong thing, and a date or age that reads
// convincingly but is wrong.

import Foundation

var failures = 0
var checks = 0

func expect(_ actual: String, _ expected: String, _ what: String) {
  checks += 1
  if actual != expected {
    failures += 1
    print("  FAIL \(what)\n       expected: \(expected)\n       actual:   \(actual)")
  }
}

func expect(_ actual: Int, _ expected: Int, _ what: String) {
  expect(String(actual), String(expected), what)
}

func expect(_ actual: Bool, _ expected: Bool, _ what: String) {
  expect(String(actual), String(expected), what)
}

// A calendar pinned to UTC so results do not depend on where this runs.
var cal = Calendar(identifier: .gregorian)
cal.timeZone = TimeZone(identifier: "UTC")!

func date(_ iso: String) -> Date {
  let f = DateFormatter()
  f.dateFormat = "yyyy-MM-dd HH:mm:ss"
  f.calendar = cal
  f.timeZone = cal.timeZone
  return f.date(from: iso)!
}

let now = date("2026-08-28 09:00:00")

// ── decodeWatchSnapshot ─────────────────────────────────────────────────────

print("decodeWatchSnapshot")

// The Phase 2 diagnostic must never overwrite real data.
expect(decodeWatchSnapshot(from: ["type": "semora_watch_test", "dueTodayCount": 3]) == nil,
       true, "rejects the diagnostic payload")
expect(decodeWatchSnapshot(from: [:]) == nil, true, "rejects an empty context")
expect(decodeWatchSnapshot(from: ["type": "something_else"]) == nil, true, "rejects a foreign payload")

let full = decodeWatchSnapshot(from: [
  "type": "semora_watch_snapshot",
  "schemaVersion": 2,
  "state": "ready",
  "dueTodayCount": 2,
  "overdueCount": 5,
  "updatedAt": "2026-08-28T08:55:00Z",
  "items": [
    ["title": "Lab report", "course": "Chem 210", "colorHex": "#FF8800",
     "dueDate": "2026-08-26", "bucket": "overdue"],
    ["title": "Essay", "course": "Eng 101", "colorHex": "#112233",
     "dueDate": "2026-08-28", "dueTime": "23:59:00", "bucket": "today"],
  ],
])!
expect(full.dueTodayCount, 2, "dueTodayCount")
expect(full.overdueCount, 5, "overdueCount")
expect(full.tasks.count, 2, "item count")
expect(full.tasks[0].title, "Lab report", "first title")
expect(full.tasks[0].bucket == .overdue, true, "first bucket")
expect(full.tasks[1].dueTime ?? "-", "23:59:00", "due time preserved")
expect(full.state == .ready, true, "ready state")
expect(full.isFutureSchema, false, "schema 2 is current")

// Counts arriving as Double — what a JS number can become on the wire.
let asDouble = decodeWatchSnapshot(from: [
  "type": "semora_watch_snapshot", "dueTodayCount": 4.0, "overdueCount": 1.0,
])!
expect(asDouble.dueTodayCount, 4, "double-encoded count decodes")

// A partial payload must still refresh what it does carry.
let partial = decodeWatchSnapshot(from: ["type": "semora_watch_snapshot"])!
expect(partial.dueTodayCount, 0, "missing counts default to 0")
expect(partial.tasks.count, 0, "missing items default to empty")
expect(partial.state == .ready, true, "missing state defaults to ready")

// A row with no title is unreadable; drop the row, keep the payload.
let badRow = decodeWatchSnapshot(from: [
  "type": "semora_watch_snapshot",
  "items": [["title": "", "dueDate": "2026-08-28"], ["title": "Good", "dueDate": "2026-08-28"]],
])!
expect(badRow.tasks.count, 1, "untitled row dropped")
expect(badRow.tasks[0].title, "Good", "surviving row")

// Unknown bucket from a newer phone renders rather than disappearing.
let unknownBucket = decodeWatchSnapshot(from: [
  "type": "semora_watch_snapshot",
  "items": [["title": "X", "dueDate": "2026-08-28", "bucket": "someday"]],
])!
expect(unknownBucket.tasks[0].bucket == .upcoming, true, "unknown bucket degrades to upcoming")

let signedOut = decodeWatchSnapshot(from: [
  "type": "semora_watch_snapshot", "state": "signed_out",
])!
expect(signedOut.state == .signedOut, true, "signed_out decodes")

let future = decodeWatchSnapshot(from: [
  "type": "semora_watch_snapshot", "schemaVersion": 99,
])!
expect(future.isFutureSchema, true, "newer schema is flagged")

// ── watchColor ──────────────────────────────────────────────────────────────

print("watchColor")
// Correctness here is "does not crash and does not reject valid input"; the
// exact Color value is not meaningfully comparable.
expect(watchColor(fromHex: "#6B46C1") == watchColor(fromHex: "6B46C1"), true, "leading # optional")
expect(watchColor(fromHex: "nonsense") == watchColor(fromHex: ""), true, "invalid falls back")
expect(watchColor(fromHex: "#FF8800") == watchColor(fromHex: "#FF8801"), false, "distinct colours differ")

// ── WatchFreshness ──────────────────────────────────────────────────────────

print("WatchFreshness")
expect(WatchFreshness.describe(updatedAt: nil, now: now).label, "Not synced yet", "nil label")
expect(WatchFreshness.describe(updatedAt: nil, now: now).isStale, true, "nil is stale")

expect(WatchFreshness.describe(updatedAt: now.addingTimeInterval(-10), now: now).label,
       "Updated just now", "10s")
// Clock skew between two devices must not print a future age.
expect(WatchFreshness.describe(updatedAt: now.addingTimeInterval(5), now: now).label,
       "Updated just now", "small negative age")
expect(WatchFreshness.describe(updatedAt: now.addingTimeInterval(-5 * 60), now: now).label,
       "Updated 5m ago", "5 minutes")
expect(WatchFreshness.describe(updatedAt: now.addingTimeInterval(-90 * 60), now: now).label,
       "Updated 1h ago", "90 minutes")
expect(WatchFreshness.describe(updatedAt: now.addingTimeInterval(-50 * 3600), now: now).label,
       "Updated 2d ago", "50 hours")

// The threshold is the whole point of the freshness line: just inside is calm,
// just outside is loud.
expect(WatchFreshness.describe(updatedAt: now.addingTimeInterval(-(6 * 3600 - 60)), now: now).isStale,
       false, "just under 6h is fresh")
expect(WatchFreshness.describe(updatedAt: now.addingTimeInterval(-(6 * 3600)), now: now).isStale,
       true, "6h is stale")

// ── watchDueLabel ───────────────────────────────────────────────────────────

print("watchDueLabel")
expect(watchDueLabel(dueDate: "2026-08-28", dueTime: nil, now: now, calendar: cal), "Today", "today")
expect(watchDueLabel(dueDate: "2026-08-29", dueTime: nil, now: now, calendar: cal), "Tomorrow", "tomorrow")
expect(watchDueLabel(dueDate: "2026-08-27", dueTime: nil, now: now, calendar: cal), "Yesterday", "yesterday")
expect(watchDueLabel(dueDate: "2026-08-24", dueTime: nil, now: now, calendar: cal), "4d late", "4 days late")
// 2026-08-31 is a Monday.
expect(watchDueLabel(dueDate: "2026-08-31", dueTime: nil, now: now, calendar: cal), "Mon", "within a week")
expect(watchDueLabel(dueDate: "2026-09-15", dueTime: nil, now: now, calendar: cal), "Sep 15", "beyond a week")

// A time only earns space where it changes what you do next.
expect(watchDueLabel(dueDate: "2026-08-28", dueTime: "23:59:00", now: now, calendar: cal),
       "Today 23:59", "time shown today")
expect(watchDueLabel(dueDate: "2026-08-29", dueTime: "09:30", now: now, calendar: cal),
       "Tomorrow 09:30", "time shown tomorrow")
expect(watchDueLabel(dueDate: "2026-09-15", dueTime: "09:30", now: now, calendar: cal),
       "Sep 15", "time hidden far out")
expect(watchDueLabel(dueDate: "2026-08-24", dueTime: "09:30", now: now, calendar: cal),
       "4d late", "time hidden when late")
// A malformed date must render something rather than crash.
expect(watchDueLabel(dueDate: "not-a-date", dueTime: nil, now: now, calendar: cal),
       "not-a-date", "malformed date passes through")

// ── result ──────────────────────────────────────────────────────────────────

print("")
if failures == 0 {
  print("ok | \(checks) checks passed")
  exit(0)
} else {
  print("FAILED | \(failures) of \(checks) checks failed")
  exit(1)
}
