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
  "schemaVersion": 3,
  "state": "ready",
  "dueTodayCount": 2,
  "overdueCount": 5,
  "updatedAt": "2026-08-28T08:55:00Z",
  "items": [
    ["id": "aaaa1111-0000-4000-8000-000000000001", "title": "Lab report",
     "course": "Chem 210", "colorHex": "#FF8800",
     "dueDate": "2026-08-26", "bucket": "overdue"],
    ["id": "aaaa1111-0000-4000-8000-000000000002", "title": "Essay",
     "course": "Eng 101", "colorHex": "#112233",
     "dueDate": "2026-08-28", "dueTime": "23:59:00", "bucket": "today"],
  ],
])!
expect(full.dueTodayCount, 2, "dueTodayCount")
expect(full.overdueCount, 5, "overdueCount")
expect(full.tasks.count, 2, "item count")
expect(full.tasks[0].title, "Lab report", "first title")
expect(full.tasks[0].id, "aaaa1111-0000-4000-8000-000000000001", "task id carried")
expect(full.tasks[0].bucket == .overdue, true, "first bucket")
expect(full.tasks[1].dueTime ?? "-", "23:59:00", "due time preserved")
expect(full.state == .ready, true, "ready state")
expect(full.isFutureSchema, false, "schema 3 is current")

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
  "items": [["id": "x1", "title": "", "dueDate": "2026-08-28"],
            ["title": "No id", "dueDate": "2026-08-28"],
            ["id": "x2", "title": "Good", "dueDate": "2026-08-28"]],
])!
expect(badRow.tasks.count, 1, "untitled row and id-less row both dropped")
expect(badRow.tasks[0].title, "Good", "surviving row")

// Unknown bucket from a newer phone renders rather than disappearing.
let unknownBucket = decodeWatchSnapshot(from: [
  "type": "semora_watch_snapshot",
  "items": [["id": "x3", "title": "X", "dueDate": "2026-08-28", "bucket": "someday"]],
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


// ── completion tracking ─────────────────────────────────────────────────────

print("WatchCompletionTracker")

let T1 = "task-1", T2 = "task-2"
let R1 = "req-1", R2 = "req-2"

do {
  var tracker = WatchCompletionTracker()
  expect(tracker.state(for: T1) == .idle, true, "unknown task is idle")

  expect(tracker.begin(taskId: T1, requestId: R1, now: now), true, "first tap sends")
  expect(tracker.state(for: T1) == .pending, true, "row goes pending")

  // The first of three guards against double completion. The other two are the
  // phone's request ledger and the database's is_completed check.
  expect(tracker.begin(taskId: T1, requestId: R2, now: now), false, "second tap is refused")

  tracker.resolve(requestId: R1, ok: true, now: now)
  expect(tracker.state(for: T1) == .done, true, "ack marks done")

  // Still refused after success — the work is finished.
  expect(tracker.begin(taskId: T1, requestId: "req-3", now: now), false, "done row is not tappable")
}

do {
  var tracker = WatchCompletionTracker()
  _ = tracker.begin(taskId: T1, requestId: R1, now: now)
  tracker.resolve(requestId: R1, ok: false, now: now)
  expect(tracker.state(for: T1) == .failed, true, "refusal marks failed")
  // A failure MUST be retryable, or a student whose phone was briefly away is
  // stuck with a row they can never complete from the wrist.
  expect(tracker.begin(taskId: T1, requestId: R2, now: now), true, "failed row can be retried")
}

do {
  var tracker = WatchCompletionTracker()
  _ = tracker.begin(taskId: T1, requestId: R1, now: now)
  // An ack for something this watch never sent must not disturb anything.
  tracker.resolve(requestId: "unknown-request", ok: true, now: now)
  expect(tracker.state(for: T1) == .pending, true, "foreign ack ignored")
}

do {
  var tracker = WatchCompletionTracker()
  _ = tracker.begin(taskId: T1, requestId: R1, now: now)
  _ = tracker.begin(taskId: T2, requestId: R2, now: now)
  tracker.resolve(requestId: R1, ok: true, now: now)

  // A snapshot that no longer lists T1 is the phone confirming it is finished.
  tracker.reconcile(with: Set([T2]), now: now)
  expect(tracker.state(for: T1) == .idle, true, "completed task drops out on reconcile")
  expect(tracker.state(for: T2) == .pending, true, "still-listed task keeps its state")
}

do {
  var tracker = WatchCompletionTracker()
  _ = tracker.begin(taskId: T1, requestId: R1, now: now)
  // Never answered. The row must become tappable again rather than looking
  // permanently stuck.
  let later = now.addingTimeInterval(WatchCompletionTracker.pendingExpiry + 1)
  tracker.reconcile(with: Set([T1]), now: later)
  expect(tracker.state(for: T1) == .failed, true, "an unanswered request expires to failed")

  var fresh = WatchCompletionTracker()
  _ = fresh.begin(taskId: T1, requestId: R1, now: now)
  fresh.reconcile(with: Set([T1]), now: now.addingTimeInterval(60))
  expect(fresh.state(for: T1) == .pending, true, "a recent request is left alone")
}

do {
  // Survives the app being closed while a transfer is still queued.
  var tracker = WatchCompletionTracker()
  _ = tracker.begin(taskId: T1, requestId: R1, now: now)
  tracker.resolve(requestId: R1, ok: true, now: now)
  _ = tracker.begin(taskId: T2, requestId: R2, now: now)

  let restored = WatchCompletionTracker.restore(from: tracker.storable)
  expect(restored.state(for: T1) == .done, true, "done survives a relaunch")
  expect(restored.state(for: T2) == .pending, true, "pending survives a relaunch")
  expect(restored == tracker, true, "round-trip is lossless")

  expect(WatchCompletionTracker.restore(from: [:]) == WatchCompletionTracker(), true, "empty restore is empty")
  let junk: [String: Any] = ["a": "not a dict", "b": ["state": "nonsense", "requestId": "r", "at": 1.0]]
  expect(WatchCompletionTracker.restore(from: junk) == WatchCompletionTracker(), true, "junk restores to empty")
}

// ── ack decoding ────────────────────────────────────────────────────────────

print("decodeWatchAck")

expect(decodeWatchAck(from: ["type": "semora_watch_snapshot"]) == nil, true, "snapshot is not an ack")
expect(decodeWatchAck(from: [:]) == nil, true, "empty is not an ack")
expect(decodeWatchAck(from: ["type": "semora_watch_complete_ack", "taskId": T1]) == nil, true, "ack needs a requestId")
expect(decodeWatchAck(from: ["type": "semora_watch_complete_ack", "requestId": R1]) == nil, true, "ack needs a taskId")

let okAck = decodeWatchAck(from: [
  "type": "semora_watch_complete_ack", "requestId": R1, "taskId": T1, "ok": true,
])!
expect(okAck.ok, true, "ok decodes")
expect(okAck.requestId, R1, "requestId decodes")

let failAck = decodeWatchAck(from: [
  "type": "semora_watch_complete_ack", "requestId": R1, "taskId": T1, "ok": false, "reason": "not_found",
])!
expect(failAck.ok, false, "failure decodes")
expect(failAck.reason ?? "-", "not_found", "reason decodes")

// A malformed answer is read as failure, which leaves the row tappable rather
// than falsely struck through.
let missingOk = decodeWatchAck(from: [
  "type": "semora_watch_complete_ack", "requestId": R1, "taskId": T1,
])!
expect(missingOk.ok, false, "a missing ok is treated as failure")

// ── request payload ─────────────────────────────────────────────────────────

print("watchCompletionRequest")

let request = watchCompletionRequest(taskId: T1, requestId: R1, now: now)
expect(request["type"] as? String ?? "-", "semora_watch_complete", "request type")
expect(request["taskId"] as? String ?? "-", T1, "request carries the task id")
expect(request["requestId"] as? String ?? "-", R1, "request carries the request id")
// Nothing else may ride along: the watch has no session and no account data to
// send, and this is where an accidental addition would show up.
expect(Set(request.keys) == Set(["type", "requestId", "taskId", "requestedAt"]), true,
       "request carries nothing beyond the two ids and a timestamp")

// ── result ──────────────────────────────────────────────────────────────────

print("")
if failures == 0 {
  print("ok | \(checks) checks passed")
  exit(0)
} else {
  print("FAILED | \(failures) of \(checks) checks failed")
  exit(1)
}
