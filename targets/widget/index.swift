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
    Entry(
      date: Date(),
      payload: WidgetPayload(
        updatedAt: "",
        dueTodayCount: 2,
        items: [
          WidgetTask(id: "1", title: "Problem Set 3", course: "PSYCH 201", colorHex: "#6B46C1", dueLabel: "Today", dueDate: nil),
          WidgetTask(id: "2", title: "Midterm Exam", course: "CS 101", colorHex: "#D85A30", dueLabel: "Tomorrow", dueDate: nil),
          WidgetTask(id: "3", title: "Lab Report", course: "CHEM 110", colorHex: "#0F6E56", dueLabel: "In 3 days", dueDate: nil),
        ],
        streak: 4,
        dueThisWeek: [
          DueThisWeekItem(title: "Problem Set 3", dueLabel: "Today", colorHex: "#6B46C1", dueDate: nil),
          DueThisWeekItem(title: "Midterm Exam", dueLabel: "Tomorrow", colorHex: "#D85A30", dueDate: nil),
          DueThisWeekItem(title: "Reading Response", dueLabel: "In 3 days", colorHex: "#0F6E56", dueDate: nil),
          DueThisWeekItem(title: "Lab Report", dueLabel: "In 4 days", colorHex: "#185FA5", dueDate: nil),
        ]
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
    // Midnight entry: labels are computed per entry date, so "Tomorrow"
    // flips to "Today" overnight even if the app is never opened.
    let cal = Calendar.current
    if let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) {
      entries.append(Entry(date: midnight, payload: payload))
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
          Text("UP NEXT")
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
      DueEmptyStateView(streak: streak)
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
            Text("\(items.count) due")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(.secondary)
          }
        }
        GroupedDueList(items: items, now: now, maxRows: 6, strings: strings)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      DueEmptyStateView(streak: streak)
    }
  }
}

// ── Widget definition ───────────────────────────────────────────

struct SemoraTodayWidget: Widget {
  let kind: String = "SemoraTodayWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      SemoraWidgetEntryView(entry: entry)
        .containerBackground(for: .widget) {
          Color("$widgetBackground")
        }
    }
    .configurationDisplayName("Up Next")
    .description("Your next deadlines at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct SemoraWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  var entry: Provider.Entry

  var body: some View {
    switch family {
    case .systemMedium:
      MediumView(payload: entry.payload, now: entry.date, strings: WidgetStrings(entry.payload?.strings))
    default:
      SmallView(payload: entry.payload, now: entry.date, strings: WidgetStrings(entry.payload?.strings))
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
  }
}
