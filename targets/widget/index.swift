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

  static func compute(_ task: WidgetTask, now: Date) -> String {
    guard let raw = task.dueDate, let due = formatter.date(from: raw) else {
      return task.dueLabel
    }
    let cal = Calendar.current
    if cal.isDate(due, inSameDayAs: now) { return "Today" }
    if due < cal.startOfDay(for: now) { return "Overdue" }
    if let tomorrow = cal.date(byAdding: .day, value: 1, to: now), cal.isDate(due, inSameDayAs: tomorrow) {
      return "Tomorrow"
    }
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: due).day ?? 0
    return "In \(days) days"
  }
}

struct WidgetPayload: Codable {
  var updatedAt: String
  var dueTodayCount: Int
  var items: [WidgetTask]
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
      let label = DueLabel.compute(task, now: now)
      Text(label)
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(label == "Today" || label == "Overdue" ? Color.brand : Color.secondary)
    }
  }
}

struct EmptyStateView: View {
  var body: some View {
    VStack(spacing: 4) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 22))
        .foregroundStyle(Color.brand)
      Text("All clear")
        .font(.system(size: 12, weight: .semibold))
      Text("Open Semora to scan a syllabus")
        .font(.system(size: 9))
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
  }
}

struct SmallView: View {
  let payload: WidgetPayload?
  let now: Date
  var body: some View {
    if let p = payload, let first = p.items.first {
      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text("NEXT UP")
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Color.brand)
            .kerning(1)
          Spacer()
          if p.dueTodayCount > 0 {
            Text("\(p.dueTodayCount) today")
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
        Text("\(first.course) · \(DueLabel.compute(first, now: now))")
          .font(.system(size: 10))
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      EmptyStateView()
    }
  }
}

struct MediumView: View {
  let payload: WidgetPayload?
  let now: Date
  var body: some View {
    if let p = payload, !p.items.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text("UP NEXT")
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Color.brand)
            .kerning(1)
          Spacer()
          Text(p.dueTodayCount > 0 ? "\(p.dueTodayCount) due today" : "Nothing due today")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.secondary)
        }
        ForEach(p.items.prefix(3)) { t in
          TaskRow(task: t, now: now)
        }
        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      EmptyStateView()
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
      MediumView(payload: entry.payload, now: entry.date)
    default:
      SmallView(payload: entry.payload, now: entry.date)
    }
  }
}

@main
struct SemoraWidgetBundle: WidgetBundle {
  var body: some Widget {
    SemoraTodayWidget()
  }
}
