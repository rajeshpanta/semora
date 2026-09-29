import WidgetKit
import SwiftUI

// ── Shared payload ──────────────────────────────────────────────
// The app writes this JSON to the App Group on every Today-screen
// refresh (lib/widgetBridge.ts). The widget only ever reads.

struct WidgetTask: Codable, Identifiable {
  var id: String
  var title: String
  var course: String
  var colorHex: String
  // Written-at-sync label, used only as a fallback when dueDate is absent
  // (payloads from older app versions).
  var dueLabel: String
  // Raw "yyyy-MM-dd" — labels are recomputed from this at RENDER time so
  // "Tomorrow" correctly becomes "Today" after midnight even if the app
  // hasn't been opened.
  var dueDate: String?
}

enum DueLabel {
  static let formatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    // Same defect as targets/watch/WatchModel.swift, one step worse: this
    // one set no calendar at all, so it inherited the device's.
    f.locale = Locale(identifier: "en_US_POSIX")
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = TimeZone.current
    return f
  }()

  /// How soon, independent of what it is called.
  ///
  /// Split out from `compute` because the two call sites styled their label by
  /// comparing it to the literal "Today" or "Overdue". That worked only while
  /// the widget was English-only; the moment the phone supplies the words, a
  /// Spanish "Hoy" would silently lose its highlight. Urgency is a fact about
  /// the date, so it is now derived from the date.
  enum Urgency { case overdue, today, later }

  static func urgency(_ task: WidgetTask, now: Date) -> Urgency {
    guard let raw = task.dueDate, let due = formatter.date(from: raw) else { return .later }
    let cal = Calendar.current
    if cal.isDate(due, inSameDayAs: now) { return .today }
    if due < cal.startOfDay(for: now) { return .overdue }
    return .later
  }

  static func compute(_ task: WidgetTask, now: Date, strings: WidgetStrings = WidgetStrings(nil)) -> String {
    guard let raw = task.dueDate, let due = formatter.date(from: raw) else {
      // The label the phone already rendered, which it localised on the way in.
      return task.dueLabel
    }
    let cal = Calendar.current
    if cal.isDate(due, inSameDayAs: now) { return strings("due.today", "Today") }
    if due < cal.startOfDay(for: now) { return strings("widget.overdue", "Overdue") }
    if let tomorrow = cal.date(byAdding: .day, value: 1, to: now), cal.isDate(due, inSameDayAs: tomorrow) {
      return strings("due.tomorrow", "Tomorrow")
    }
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: due).day ?? 0
    return strings("due.inDays", "In {n} days", n: days)
  }
}

// A single "due this week" row for the second widget. Kept minimal +
// glanceable: title, a written-at-sync fallback label, the raw date for
// render-time recomputation, and the course color.
struct DueThisWeekItem: Codable, Identifiable {
  // No stable id in the payload, so synthesize one from the content —
  // Identifiable needs it for ForEach and duplicates are harmless here.
  var id: String { "\(dueDate ?? "")-\(title)" }
  var title: String
  var dueLabel: String
  var colorHex: String
  var dueDate: String?
}

extension DueThisWeekItem {
  // Reuse the Up Next label logic by projecting onto a WidgetTask.
  func computedLabel(now: Date, strings: WidgetStrings = WidgetStrings(nil)) -> String {
    DueLabel.compute(projected, now: now, strings: strings)
  }

  func urgency(now: Date) -> DueLabel.Urgency { DueLabel.urgency(projected, now: now) }

  private var projected: WidgetTask {
    WidgetTask(id: id, title: title, course: "", colorHex: colorHex, dueLabel: dueLabel, dueDate: dueDate)
  }
}

struct WidgetPayload: Codable {
  var updatedAt: String
  var dueTodayCount: Int
  var items: [WidgetTask]
  // ── Additive fields (Wave 2) ──────────────────────────────────
  // Optional so a payload written by an OLDER app version (no streak /
  // dueThisWeek keys) still decodes cleanly into this newer struct.
  var streak: Int?
  var dueThisWeek: [DueThisWeekItem]?
  /// Localised chrome, keyed by lib/surfaceStrings.ts. Optional for the same
  /// reason as the two above: a payload written by an older app version simply
  /// has none, and every label below falls back to the English compiled here.
  var strings: [String: String]?
  /// The phone's own calendar day when it wrote ("yyyy-MM-dd", lib/widgetBridge.ts
  /// todayStr) — the day `dueTodayCount` counts. Without it the widget can only
  /// infer that day from `updatedAt` in ITS time zone, which after a flight or a
  /// time-zone change is a different day. Optional: older JS never sends it.
  var today: String?
}

/// The phone's vocabulary for this build's UI.
///
/// The widget extension ships no localisation of its own, and a `.lproj` would
/// have left every future wording change needing an App Store build. Looking
/// each label up in the payload — with the compiled English as the fallback —
/// localises it and makes its copy changeable over the air at the same time.
struct WidgetStrings {
  private let map: [String: String]

  init(_ map: [String: String]?) { self.map = map ?? [:] }

  func callAsFunction(_ key: String, _ fallback: String) -> String {
    let value = map[key]
    return (value?.isEmpty == false) ? value! : fallback
  }

  func callAsFunction(_ key: String, _ fallback: String, n: Int) -> String {
    callAsFunction(key, fallback).replacingOccurrences(of: "{n}", with: String(n))
  }
}

enum SharedData {
  static let appGroup = "group.com.rajeshpanta.syllabussnap"
  static let payloadKey = "widget_payload"

  static func read() -> WidgetPayload? {
    guard
      let defaults = UserDefaults(suiteName: appGroup),
      let raw = defaults.string(forKey: payloadKey),
      let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetPayload.self, from: data)
  }
}

func colorFromHex(_ hex: String) -> Color {
  var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
  if h.hasPrefix("#") { h.removeFirst() }
  guard h.count == 6, let v = UInt64(h, radix: 16) else { return Color.purple }
  return Color(
    red: Double((v >> 16) & 0xFF) / 255.0,
    green: Double((v >> 8) & 0xFF) / 255.0,
    blue: Double(v & 0xFF) / 255.0
  )
}

extension Color {
  static let brand = Color(red: 107.0 / 255.0, green: 70.0 / 255.0, blue: 193.0 / 255.0)
  // Matches COLORS.coral (#D85A30) — the Due-This-Week widget's accent,
  // consistent with the coral "This week" tone used in-app.
  static let coral = Color(red: 216.0 / 255.0, green: 90.0 / 255.0, blue: 48.0 / 255.0)
}

// ── Timeline ────────────────────────────────────────────────────

struct Entry: TimelineEntry {
  let date: Date
  let payload: WidgetPayload?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    // The Up Next rows carry real dates relative to now. The Home Screen
    // views recompute every label from dueDate, and day 0 / 1 / 3 read
    // "Today" / "Tomorrow" / "In 3 days" — exactly the literals they carried
    // before — so the Home Screen gallery is unchanged. The Lock Screen needs
    // the dates: it places every row on a day and would otherwise find the
    // sample undated and unsynced, and say so in the gallery.
    let now = Date()
    func day(_ offset: Int) -> String? {
      Calendar.current.date(byAdding: .day, value: offset, to: now).map { DueLabel.formatter.string(from: $0) }
    }
    return Entry(
      date: now,
      payload: WidgetPayload(
        updatedAt: LockScreen.isoWriter.string(from: now),
        dueTodayCount: 2,
        items: [
          WidgetTask(id: "1", title: "Problem Set 3", course: "PSYCH 201", colorHex: "#6B46C1", dueLabel: "Today", dueDate: day(0)),
          WidgetTask(id: "2", title: "Midterm Exam", course: "CS 101", colorHex: "#D85A30", dueLabel: "Tomorrow", dueDate: day(1)),
          WidgetTask(id: "3", title: "Lab Report", course: "CHEM 110", colorHex: "#0F6E56", dueLabel: "In 3 days", dueDate: day(3)),
        ],
        streak: 4,
        dueThisWeek: [
          DueThisWeekItem(title: "Problem Set 3", dueLabel: "Today", colorHex: "#6B46C1", dueDate: nil),
          DueThisWeekItem(title: "Midterm Exam", dueLabel: "Tomorrow", colorHex: "#D85A30", dueDate: nil),
          DueThisWeekItem(title: "Reading Response", dueLabel: "In 3 days", colorHex: "#0F6E56", dueDate: nil),
          DueThisWeekItem(title: "Lab Report", dueLabel: "In 4 days", colorHex: "#185FA5", dueDate: nil),
        ],
        today: day(0)
      )
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    let real = SharedData.read()
    completion(Entry(date: Date(), payload: real ?? (context.isPreview ? placeholder(in: context).payload : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let payload = SharedData.read()
    let now = Date()
    var entries = [Entry(date: now, payload: payload)]
    // Midnight entries: labels are computed per entry date, so "Tomorrow"
    // flips to "Today" overnight even if the app is never opened. One per day
    // the snapshot can still speak for, plus the one after it — so the Lock
    // Screen reaches "Updated 2d ago" and then "Not synced recently" even if
    // WidgetKit defers the hourly reload, instead of freezing on day one.
    let cal = Calendar.current
    let startOfToday = cal.startOfDay(for: now)
    for offset in 1...(LockScreen.windowDays + 1) {
      if let midnight = cal.date(byAdding: .day, value: offset, to: startOfToday) {
        entries.append(Entry(date: midnight, payload: payload))
      }
    }
    let next = cal.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
    completion(Timeline(entries: entries, policy: .after(next)))
  }
}

// ── Views ───────────────────────────────────────────────────────

struct TaskRow: View {
  let task: WidgetTask
  let now: Date
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    HStack(spacing: 7) {
      Circle()
        .fill(colorFromHex(task.colorHex))
        .frame(width: 7, height: 7)
      VStack(alignment: .leading, spacing: 0) {
        Text(task.title)
          .font(.system(size: 12, weight: .semibold))
          .lineLimit(1)
        Text(task.course)
          .font(.system(size: 10))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      let label = DueLabel.compute(task, now: now, strings: strings)
      let urgency = DueLabel.urgency(task, now: now)
      Text(label)
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(urgency == .later ? Color.secondary : Color.brand)
    }
  }
}

struct EmptyStateView: View {
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    VStack(spacing: 4) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 22))
        .foregroundStyle(Color.brand)
      Text(strings("widget.allClear", "All clear"))
        .font(.system(size: 12, weight: .semibold))
      Text(strings("widget.scanPrompt", "Open Semora to scan a syllabus"))
        .font(.system(size: 9))
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
  }
}

struct SmallView: View {
  let payload: WidgetPayload?
  let now: Date
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    if let p = payload, let first = p.items.first {
      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(strings("widget.upNext", "Up Next").uppercased())
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Color.brand)
            .kerning(1)
          Spacer()
          if p.dueTodayCount > 0 {
            Text("\(p.dueTodayCount) \(strings("widget.todayLower", "today"))")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(.secondary)
          }
        }
        Spacer(minLength: 0)
        Circle()
          .fill(colorFromHex(first.colorHex))
          .frame(width: 8, height: 8)
        Text(first.title)
          .font(.system(size: 14, weight: .bold, design: .serif))
          .lineLimit(2)
        Text("\(first.course) · \(DueLabel.compute(first, now: now, strings: strings))")
          .font(.system(size: 10))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      EmptyStateView(strings: strings)
    }
  }
}

struct MediumView: View {
  let payload: WidgetPayload?
  let now: Date
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    if let p = payload, !p.items.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          // Was Text("UP NEXT"). SmallView, two structs up, already looked this
          // exact phrase up and uppercased it; this one printed it. So the small
          // widget said LO SIGUIENTE to a Spanish student and the medium one said
          // UP NEXT, on the same Home Screen.
          Text(strings("widget.upNext", "Up Next").uppercased())
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Color.brand)
            .kerning(1)
          Spacer()
          Text(p.dueTodayCount > 0
          ? (p.dueTodayCount == 1
             ? strings("count.dueToday.one", "{n} task due today", n: p.dueTodayCount)
             : strings("count.dueToday.many", "{n} tasks due today", n: p.dueTodayCount))
          : strings("widget.nothingToday", "Nothing due today"))
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.secondary)
        }
        ForEach(p.items.prefix(3)) { t in
          TaskRow(task: t, now: now, strings: strings)
        }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      EmptyStateView(strings: strings)
    }
  }
}

// ── Due This Week views ─────────────────────────────────────────
// Second widget: a grouped "due this week" list plus the current streak.
// Reads the SAME App Group payload — the streak + dueThisWeek fields the
// app writes alongside the Up Next items.

struct StreakBadge: View {
  let streak: Int
  var body: some View {
    // Only meaningful when > 0; callers guard, but be defensive.
    HStack(spacing: 3) {
      Text("🔥")
        .font(.system(size: 10))
      Text("\(streak)")
        .font(.system(size: 10, weight: .heavy))
        .foregroundStyle(Color.brand)
    }
    .padding(.horizontal, 6)
    .padding(.vertical, 2)
    .background(Color.brand.opacity(0.12))
    .clipShape(Capsule())
  }
}

struct DueRow: View {
  let item: DueThisWeekItem
  let now: Date
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    HStack(spacing: 7) {
      RoundedRectangle(cornerRadius: 2)
        .fill(colorFromHex(item.colorHex))
        .frame(width: 3, height: 22)
      Text(item.title)
        .font(.system(size: 12, weight: .semibold))
        .lineLimit(1)
      Spacer(minLength: 4)
      let label = item.computedLabel(now: now, strings: strings)
      let urgency = item.urgency(now: now)
      Text(label)
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(urgency == .later ? Color.secondary : Color.coral)
    }
  }
}

// Group the flat dueThisWeek list into ordered day sections using the
// render-time label ("Today", "Tomorrow", "In N days", "Overdue"), so a
// week with several deadlines reads as a plan, not a flat pile.
struct GroupedDueList: View {
  let items: [DueThisWeekItem]
  let now: Date
  let maxRows: Int

  private var groups: [(label: String, rows: [DueThisWeekItem])] {
    var order: [String] = []
    var map: [String: [DueThisWeekItem]] = [:]
    for it in items.prefix(maxRows) {
      let label = it.computedLabel(now: now, strings: strings)
      if map[label] == nil { order.append(label) }
      map[label, default: []].append(it)
    }
    return order.map { ($0, map[$0] ?? []) }
  }

  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(groups, id: \.label) { group in
        Text(group.label.uppercased())
          .font(.system(size: 8, weight: .heavy))
          .foregroundStyle(.secondary)
          .kerning(0.6)
        ForEach(group.rows) { row in
          DueRow(item: row, now: now, strings: strings)
        }
      }
    }
  }
}

struct DueEmptyStateView: View {
  let streak: Int
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    VStack(spacing: 4) {
      Image(systemName: "calendar.badge.checkmark")
        .font(.system(size: 22))
        .foregroundStyle(Color.coral)
      Text(strings("widget.weekClear", "Week's clear"))
        .font(.system(size: 12, weight: .semibold))
      if streak > 0 {
        StreakBadge(streak: streak)
      } else {
        Text(strings("widget.nothingThisWeek", "Nothing due in the next 7 days"))
          .font(.system(size: 9))
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
    }
  }
}

struct DueSmallView: View {
  let payload: WidgetPayload?
  let now: Date
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    let items = payload?.dueThisWeek ?? []
    let streak = payload?.streak ?? 0
    if !items.isEmpty {
      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(strings("widget.thisWeek", "This week").uppercased())
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Color.coral)
            .kerning(1)
          Spacer()
          if streak > 0 { StreakBadge(streak: streak) }
        }
        Spacer(minLength: 0)
        // Small: a compact count + the two soonest rows.
        GroupedDueList(items: items, now: now, maxRows: 3, strings: strings)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      DueEmptyStateView(streak: streak, strings: strings)
    }
  }
}

struct DueMediumView: View {
  let payload: WidgetPayload?
  let now: Date
  var strings: WidgetStrings = WidgetStrings(nil)
  var body: some View {
    let items = payload?.dueThisWeek ?? []
    let streak = payload?.streak ?? 0
    if !items.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(strings("widget.dueThisWeek", "Due This Week").uppercased())
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Color.coral)
            .kerning(1)
          Spacer()
          if streak > 0 {
            StreakBadge(streak: streak)
          } else {
            // Written out per number rather than assembled: Spanish agrees the
            // noun, so "1 pendiente" and "3 pendientes" differ where "1 due" and
            // "3 due" do not.
            Text(items.count == 1
                 ? strings("widget.dueCount.one", "{n} due", n: items.count)
                 : strings("widget.dueCount.many", "{n} due", n: items.count))
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(.secondary)
          }
        }
        GroupedDueList(items: items, now: now, maxRows: 6, strings: strings)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      DueEmptyStateView(streak: streak, strings: strings)
    }
  }
}

// ── Lock Screen ─────────────────────────────────────────────────
//
// The Up Next data again, as three more families of SemoraTodayWidget rather
// than as a widget of its own:
//
// - lib/widgetBridge.ts reloads timelines BY KIND, naming only
//   SemoraTodayWidget and SemoraDueThisWeekWidget. A new kind would never hear
//   that the app wrote new data, and would trail a completed task by up to an
//   hour until the app learned its name — an app change for no gain.
// - A kind is the identity of every widget already placed. This one keeps its
//   name and both system families, so nothing on anybody's Home Screen moves.
//
// Due This Week gets no Lock Screen families: its rows and streak are Pro-only
// and arrive empty for everyone else.
//
// A Lock Screen is glanced at and believed, and it is read hours or days after
// the app last wrote. The payload is a snapshot of the Today tab at the moment
// of writing (lib/widgetBridge.ts): up to `itemCap` incomplete tasks due from
// that day to `windowDays` days later, soonest first, and an exact count of
// those due that day. Everything below is re-derived for the day being DRAWN,
// and a claim the snapshot cannot support is not made.

enum LockScreen {
  /// useDueSoonTasks: the list runs from the day it was written to 3 days later.
  static let windowDays = 3
  /// widgetBridge.ts keeps `upcoming.slice(0, 4)`. A list this long may have
  /// been cut short, so a count read from it is only a floor.
  static let itemCap = 4
  /// A snapshot this many calendar days old says so on the rectangular face.
  static let staleAfterDays = 2

  enum Reading {
    /// Nothing written yet, or the empty payload clearTodayWidget() writes at
    /// sign-out. The phone sent no words with either, so this state speaks from
    /// the extension's own Localizable.strings.
    case noAccountData
    /// Written too long ago (or, after a clock or time-zone change, "in the
    /// future") to say anything about the day being drawn.
    case unknownToday(daysAgo: Int?)
    /// `dueToday` is exact unless `orMore`; `next` is the soonest task due on
    /// or after the drawn day, if the snapshot holds one.
    case ready(dueToday: Int, orMore: Bool, next: WidgetTask?, daysAgo: Int)
  }

  static func read(_ payload: WidgetPayload?, now: Date, calendar cal: Calendar = .current) -> Reading {
    // clearTodayWidget() is the only writer that omits `strings`, and it
    // always writes an empty list.
    guard let p = payload, !(p.items.isEmpty && p.strings == nil) else { return .noAccountData }
    guard let written = parseUpdatedAt(p.updatedAt) else { return .unknownToday(daysAgo: nil) }

    let today = cal.startOfDay(for: now)
    // The day the phone was counting for. Its own word when it sent one; else
    // the write time's day HERE, which is only a guess (see the agreement check).
    let phoneDay = p.today.flatMap { DueLabel.formatter.date(from: $0) }.map { cal.startOfDay(for: $0) }
    let writtenDay = phoneDay ?? cal.startOfDay(for: written)
    let daysAgo = cal.dateComponents([.day], from: writtenDay, to: today).day ?? -1
    guard (0...windowDays).contains(daysAgo) else {
      return .unknownToday(daysAgo: daysAgo > 0 ? daysAgo : nil)
    }

    // Every listed task the widget can place on a day, in the phone's order.
    let dated: [(task: WidgetTask, day: Date)] = p.items.compactMap { t in
      guard let raw = t.dueDate, let d = DueLabel.formatter.date(from: raw) else { return nil }
      return (t, cal.startOfDay(for: d))
    }
    // Tasks due before the drawn day were open when the phone last looked.
    // Whether they still are is unknown, so they are neither shown nor counted.
    let next = dated.first { $0.day >= today }?.task

    if daysAgo == 0 {
      // Written today: the phone counted every task due today, uncapped —
      // provided "today" meant the same day to the phone as it does here. It
      // does when the phone said so. When it did not (JS older than 1.15.2),
      // trust the count only if the list agrees: nothing listed before today,
      // and the first `dueTodayCount` listed tasks all due today. A phone that
      // wrote late at night in Los Angeles, read after landing in New York, fails
      // that check and falls through to counting the list for the real today.
      let agrees = phoneDay != nil || (
        !dated.contains { $0.day < today } &&
        dated.prefix(min(max(p.dueTodayCount, 0), dated.count)).allSatisfy { $0.day == today }
      )
      if agrees {
        return .ready(dueToday: max(p.dueTodayCount, 0), orMore: false, next: next, daysAgo: 0)
      }
    }

    // A row the widget cannot place on a day (a payload from before dueDate
    // existed) might be due today. Counting around it would claim a number the
    // snapshot does not support.
    if dated.count < p.items.count { return .unknownToday(daysAgo: daysAgo > 0 ? daysAgo : nil) }

    // Written on an earlier day: count today's tasks from the list instead.
    let n = dated.filter { $0.day == today }.count
    // If the list was full and reaches no further than today, more of today's
    // tasks may have been cut off — and if none of it reaches today, today is
    // simply unknown.
    let mayBeCut = p.items.count >= itemCap && (dated.last.map { $0.day <= today } ?? true)
    if mayBeCut && n == 0 { return .unknownToday(daysAgo: daysAgo) }
    return .ready(dueToday: n, orMore: mayBeCut, next: next, daysAgo: daysAgo)
  }

  /// JS `toISOString()` always carries milliseconds ("…T18:03:11.123Z"), which
  /// ISO8601DateFormatter rejects unless told to expect them.
  static func parseUpdatedAt(_ raw: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: raw) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: raw)
  }

  /// The same shape widgetBridge.ts writes, for the gallery sample.
  static let isoWriter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  /// "3", or "3+" when the list may have been cut short.
  static func countText(_ n: Int, orMore: Bool) -> String { orMore ? "\(n)+" : "\(n)" }

  /// "2 tasks due today" / "Nothing due today" — the same sentences (and so the
  /// same words, in both languages) as the medium widget's header. The NUMBER
  /// can differ after midnight until the app next writes: the Home Screen views
  /// still print the phone's dueTodayCount, the Lock Screen re-derives it.
  static func headline(_ n: Int, orMore: Bool, strings: WidgetStrings) -> String {
    if orMore {
      // A floor reads as plural in both languages: "1+ tasks", "1+ tareas".
      return strings("count.dueToday.many", "{n} tasks due today")
        .replacingOccurrences(of: "{n}", with: countText(n, orMore: true))
    }
    if n == 0 { return strings("widget.nothingToday", "Nothing due today") }
    return n == 1
      ? strings("count.dueToday.one", "{n} task due today", n: n)
      : strings("count.dueToday.many", "{n} tasks due today", n: n)
  }
}

// Privacy: titles and course names are marked .privacySensitive(). With the
// default settings nothing changes; a student who turns off Settings → Face
// ID & Passcode → Allow Access When Locked → Lock Screen Widgets gets them
// redacted while the phone is locked. Counts and day labels stay visible —
// "2 tasks due today" names nothing. It has to be the modifier, not a branch on
// \.redactionReasons: the system redacts an already-rendered widget when the
// phone locks and does not re-run this code to ask.

/// Three lines: how many are due today, what is next, and when.
struct LockRectangularView: View {
  let reading: LockScreen.Reading
  let now: Date
  let strings: WidgetStrings

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      switch reading {
      case .noAccountData:
        Text(verbatim: "Semora")
          .font(.headline)
          .widgetAccentable()
        Text("Open Semora to see what's due")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)

      case .unknownToday(let daysAgo):
        Text(strings("complication.stale", "Not synced recently"))
          .font(.headline)
          .widgetAccentable()
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        if let daysAgo, daysAgo > 0 {
          Text(strings("watch.updated.days", "Updated {n}d ago", n: daysAgo))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Text("Open Semora to see what's due")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.8)

      case .ready(let n, let orMore, let next, let daysAgo):
        Text(LockScreen.headline(n, orMore: orMore, strings: strings))
          .font(.headline)
          .widgetAccentable()
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        if let next {
          Text(next.title)
            .font(.body)
            .lineLimit(1)
            .privacySensitive()
          HStack(spacing: 3) {
            Text(DueLabel.compute(next, now: now, strings: strings))
              .fontWeight(.semibold)
              .layoutPriority(1)
            Text(verbatim: "·")
            if daysAgo >= LockScreen.staleAfterDays {
              // Freshness replaces the course, never the due label.
              Text(strings("watch.updated.days", "Updated {n}d ago", n: daysAgo))
            } else {
              Text(next.course)
                .privacySensitive()
            }
          }
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          // Shrink before truncating: "Mañana · Actualizado hace 2 d" is wider
          // than the smallest phone's rectangle at full caption size.
          .minimumScaleFactor(0.75)
        } else if daysAgo >= LockScreen.staleAfterDays {
          Text(strings("watch.updated.days", "Updated {n}d ago", n: daysAgo))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    // headline + body + caption fill ~62 of the smallest phone's 69 pt at the
    // default size; above xLarge the top and bottom lines would clip, and
    // minimumScaleFactor only rescues width. Cap it here, on this face only.
    .dynamicTypeSize(...DynamicTypeSize.xLarge)
  }
}

/// One number: tasks due today. Not always the Watch complication's figure:
/// the Watch shows the OVERDUE count ("3!" / "late") when anything is overdue,
/// and this payload carries no overdue data (useDueSoonTasks starts at today).
struct LockCircularView: View {
  let reading: LockScreen.Reading
  let strings: WidgetStrings

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      switch reading {
      case .noAccountData:
        Image(systemName: "graduationcap.fill")
          .font(.system(size: 20, weight: .semibold))
          .widgetAccentable()
          .accessibilityLabel(Text("Open Semora to see what's due"))
      case .unknownToday:
        figure("—")
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(strings("complication.stale", "Not synced recently"))
      case .ready(let n, let orMore, _, _):
        figure(LockScreen.countText(n, orMore: orMore))
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(LockScreen.headline(n, orMore: orMore, strings: strings))
      }
    }
  }

  private func figure(_ value: String) -> some View {
    VStack(spacing: -2) {
      Text(value)
        .font(.system(size: 22, weight: .semibold, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .widgetAccentable()
      Text(strings("widget.todayLower", "today"))
        .font(.system(size: 10, weight: .medium))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .padding(.horizontal, 4)
  }
}

/// One line beside the date. The system sets the font and truncates; the
/// title goes last so it is what gets cut.
struct LockInlineView: View {
  let reading: LockScreen.Reading
  let now: Date
  let strings: WidgetStrings

  var body: some View {
    switch reading {
    case .noAccountData:
      Text("Open Semora")
    case .unknownToday:
      Text(strings("complication.stale", "Not synced recently"))
    case .ready(let n, let orMore, let next, _):
      if let next, n > 0 {
        // "2 today · Lab Report" — the same words the small widget's header uses.
        // One Text can only be redacted whole, so the line is, count and all.
        Text(verbatim: "\(LockScreen.countText(n, orMore: orMore)) \(strings("widget.todayLower", "today")) · \(next.title)")
          .privacySensitive()
      } else if let next {
        // "Tomorrow · Midterm Exam"
        Text(verbatim: "\(DueLabel.compute(next, now: now, strings: strings)) · \(next.title)")
          .privacySensitive()
      } else {
        Text(LockScreen.headline(n, orMore: orMore, strings: strings))
      }
    }
  }
}

// ── Widget definition ───────────────────────────────────────────

struct SemoraTodayWidget: Widget {
  // NEVER rename. The kind is the identity of every Up Next widget already
  // placed on a Home Screen, and the one lib/widgetBridge.ts reloads.
  let kind: String = "SemoraTodayWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      // The container background is chosen per family inside the entry view:
      // the Home Screen keeps its card, the Lock Screen draws on the wallpaper.
      SemoraWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Up Next")
    .description("Your next deadlines at a glance.")
    .supportedFamilies([
      .systemSmall, .systemMedium,
      .accessoryRectangular, .accessoryCircular, .accessoryInline,
    ])
  }
}

struct SemoraWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  var entry: Provider.Entry

  var body: some View {
    let strings = WidgetStrings(entry.payload?.strings)
    switch family {
    case .accessoryRectangular:
      LockRectangularView(reading: LockScreen.read(entry.payload, now: entry.date), now: entry.date, strings: strings)
        .containerBackground(for: .widget) { Color.clear }
    case .accessoryCircular:
      LockCircularView(reading: LockScreen.read(entry.payload, now: entry.date), strings: strings)
        .containerBackground(for: .widget) { Color.clear }
    case .accessoryInline:
      LockInlineView(reading: LockScreen.read(entry.payload, now: entry.date), now: entry.date, strings: strings)
        .containerBackground(for: .widget) { Color.clear }
    case .systemMedium:
      MediumView(payload: entry.payload, now: entry.date, strings: strings)
        .containerBackground(for: .widget) { Color("$widgetBackground") }
    default:
      SmallView(payload: entry.payload, now: entry.date, strings: strings)
        .containerBackground(for: .widget) { Color("$widgetBackground") }
    }
  }
}

struct SemoraDueThisWeekWidget: Widget {
  let kind: String = "SemoraDueThisWeekWidget"

  var body: some WidgetConfiguration {
    // Reuses the same Provider (same App Group payload) as the Up Next
    // widget — one write in the app feeds both widgets.
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      SemoraDueThisWeekEntryView(entry: entry)
        .containerBackground(for: .widget) {
          Color("$widgetBackground")
        }
    }
    .configurationDisplayName("Due This Week")
    .description("Everything due in the next 7 days, plus your streak.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct SemoraDueThisWeekEntryView: View {
  @Environment(\.widgetFamily) var family
  var entry: Provider.Entry

  var body: some View {
    switch family {
    case .systemMedium:
      DueMediumView(payload: entry.payload, now: entry.date, strings: WidgetStrings(entry.payload?.strings))
    default:
      DueSmallView(payload: entry.payload, now: entry.date, strings: WidgetStrings(entry.payload?.strings))
    }
  }
}

@main
struct SemoraWidgetBundle: WidgetBundle {
  var body: some Widget {
    SemoraTodayWidget()
    SemoraDueThisWeekWidget()
    LectureRecordingLiveActivity()
  }
}

// ── Previews ────────────────────────────────────────────────────
// One timeline per Lock Screen family, one entry per state. Step through the
// entries in the Xcode canvas (the timeline scrubber under the preview).

#if DEBUG
enum LockPreview {
  static let now = Date()

  static func day(_ offset: Int) -> String {
    DueLabel.formatter.string(from: Calendar.current.date(byAdding: .day, value: offset, to: now)!)
  }

  static func written(daysAgo: Int) -> String {
    LockScreen.isoWriter.string(from: Calendar.current.date(byAdding: .day, value: -daysAgo, to: now)!)
  }

  static func task(_ id: String, _ title: String, _ course: String, due offset: Int) -> WidgetTask {
    WidgetTask(id: id, title: title, course: course, colorHex: "#6B46C1", dueLabel: "", dueDate: day(offset))
  }

  /// Just the keys these views read, in Spanish — enough to see truncation.
  static let spanish: [String: String] = [
    "count.dueToday.one": "{n} tarea vence hoy",
    "count.dueToday.many": "{n} tareas vencen hoy",
    "widget.nothingToday": "Hoy no vence nada",
    "widget.todayLower": "hoy",
    "due.today": "Hoy", "due.tomorrow": "Mañana", "due.inDays": "En {n} días",
    "complication.stale": "Sin sincronizar recientemente",
    "watch.updated.days": "Actualizado hace {n} d",
  ]

  static func payload(daysAgo: Int, dueToday: Int, _ items: [WidgetTask], strings: [String: String]? = [:]) -> WidgetPayload {
    WidgetPayload(updatedAt: written(daysAgo: daysAgo), dueTodayCount: dueToday, items: items,
                  streak: 0, dueThisWeek: [], strings: strings, today: day(-daysAgo))
  }

  static var entries: [Entry] {
    [
      // Two due today, written today.
      Entry(date: now, payload: payload(daysAgo: 0, dueToday: 2, [
        task("1", "Problem Set 3", "PSYCH 201", due: 0),
        task("2", "Reading Response", "ENGL 110", due: 0),
        task("3", "Midterm Exam", "CS 101", due: 1),
      ])),
      // Nothing today, next is tomorrow.
      Entry(date: now, payload: payload(daysAgo: 0, dueToday: 0, [task("2", "Midterm Exam", "CS 101", due: 1)])),
      // Signed in, nothing in the next three days.
      Entry(date: now, payload: payload(daysAgo: 0, dueToday: 0, [])),
      // Written yesterday by a full list that reaches only today: a floor.
      Entry(date: now, payload: payload(daysAgo: 1, dueToday: 3, [
        task("a", "Quiz 2", "BIO 101", due: -1), task("b", "Essay", "HIST 210", due: -1),
        task("c", "Lab 4", "CHEM 110", due: 0), task("d", "Problem Set 5", "MATH 221", due: 0),
      ])),
      // Written two days ago: freshness replaces the course.
      Entry(date: now, payload: payload(daysAgo: 2, dueToday: 0, [task("e", "Final Project Proposal", "DES 300", due: 1)])),
      // Written five days ago: past what the snapshot can say.
      Entry(date: now, payload: payload(daysAgo: 5, dueToday: 1, [task("f", "Quiz", "BIO 101", due: -5)])),
      // Signed out (clearTodayWidget writes no strings), and never written.
      Entry(date: now, payload: payload(daysAgo: 0, dueToday: 0, [], strings: nil)),
      Entry(date: now, payload: nil),
      // Spanish, longest words.
      Entry(date: now, payload: payload(daysAgo: 0, dueToday: 12, [
        task("s", "Informe de laboratorio de química orgánica", "QUÍMICA ORGÁNICA II", due: 0),
      ], strings: spanish)),
      // Spanish, two days old: the widest third line there is.
      Entry(date: now, payload: payload(daysAgo: 2, dueToday: 0, [task("m", "Examen parcial", "BIOLOGÍA 101", due: 1)], strings: spanish)),
    ]
  }
}

#Preview("Lock · rectangular", as: .accessoryRectangular) {
  SemoraTodayWidget()
} timeline: {
  for e in LockPreview.entries { e }
}

#Preview("Lock · circular", as: .accessoryCircular) {
  SemoraTodayWidget()
} timeline: {
  for e in LockPreview.entries { e }
}

#Preview("Lock · inline", as: .accessoryInline) {
  SemoraTodayWidget()
} timeline: {
  for e in LockPreview.entries { e }
}

// The two Home Screen families, to confirm moving containerBackground into the
// entry view changed nothing there.
#Preview("Home · small", as: .systemSmall) {
  SemoraTodayWidget()
} timeline: {
  for e in LockPreview.entries { e }
}

#Preview("Home · medium", as: .systemMedium) {
  SemoraTodayWidget()
} timeline: {
  for e in LockPreview.entries { e }
}

// What a locked phone shows with Allow Access When Locked → Lock Screen
// Widgets turned off: titles and courses redacted, counts and days kept.
struct LockRedactedPreviews: PreviewProvider {
  static var previews: some View {
    let entry = LockPreview.entries[0]
    Group {
      SemoraWidgetEntryView(entry: entry)
        .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
        .previewDisplayName("Rectangular · redacted")
      SemoraWidgetEntryView(entry: entry)
        .previewContext(WidgetPreviewContext(family: .accessoryInline))
        .previewDisplayName("Inline · redacted")
    }
    .redacted(reason: .privacy)
  }
}
#endif
