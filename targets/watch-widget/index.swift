import WidgetKit
import SwiftUI

// ── Semora complication ──────────────────────────────────────────────────────
//
// One glance, one fact: is anything late, is anything due today, and what is
// next. Everything shown here was decided by the iPhone and delivered to the
// Watch app; this extension reads the snapshot out of the shared container and
// renders it. It has no network, no session, no queries and no opinions.

struct SemoraComplicationEntry: TimelineEntry {
  let date: Date
  let snapshot: ComplicationSnapshot
  /// True when nothing has ever been written — a watch whose phone app has not
  /// been opened since the complication was added.
  let hasData: Bool
}

struct SemoraComplicationProvider: TimelineProvider {
  private func load() -> (ComplicationSnapshot, Bool) {
    guard
      let defaults = UserDefaults(suiteName: ComplicationStore.appGroup),
      let stored = defaults.dictionary(forKey: ComplicationStore.snapshotKey),
      let decoded = decodeComplicationSnapshot(from: stored)
    else {
      return (.empty, false)
    }
    return (decoded, true)
  }

  func placeholder(in context: Context) -> SemoraComplicationEntry {
    // The gallery preview. Shows a plausible reading rather than zeros, so a
    // student choosing a complication can tell what it will look like when it
    // has something to say.
    SemoraComplicationEntry(
      date: Date(),
      snapshot: ComplicationSnapshot(
        state: .ready, dueTodayCount: 2, overdueCount: 1,
        nextTitle: "Essay draft", nextDueDate: nil, nextBucket: "today",
        updatedAt: Date()
      ),
      hasData: true
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (SemoraComplicationEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    let (snapshot, hasData) = load()
    completion(SemoraComplicationEntry(date: Date(), snapshot: snapshot, hasData: hasData))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SemoraComplicationEntry>) -> Void) {
    let now = Date()
    let (snapshot, hasData) = load()

    // A single entry, refreshed on a clock rather than projected forward.
    //
    // There is nothing to project: the counts change only when the phone sends
    // a new snapshot, and it tells us directly by reloading the timeline. The
    // hourly wake exists for the two things that DO change on their own — a
    // due label crossing midnight, and the data going stale.
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
    completion(Timeline(
      entries: [SemoraComplicationEntry(date: now, snapshot: snapshot, hasData: hasData)],
      policy: .after(next)
    ))
  }
}

private let brand = Color(red: 0.42, green: 0.27, blue: 0.76)

struct SemoraComplicationView: View {
  @Environment(\.widgetFamily) private var family
  let entry: SemoraComplicationEntry

  private var tint: Color {
    guard entry.hasData, entry.snapshot.state == .ready else { return .secondary }
    if entry.snapshot.isStale(now: entry.date) { return .orange }
    return entry.snapshot.overdueCount > 0 ? .red : brand
  }

  var body: some View {
    switch family {
    case .accessoryCircular: circular
    case .accessoryInline: inline
    default: rectangular
    }
  }

  // The Smart Stack card, and the widest face slot.
  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text("Semora")
        .font(.caption2)
        .foregroundStyle(brand)

      if !entry.hasData {
        Text(entry.snapshot.strings("complication.openPhone", "Open Semora on iPhone"))
          .font(.caption2)
          .foregroundStyle(.secondary)
      } else {
        Text(complicationHeadline(entry.snapshot))
          .font(.caption)
          .fontWeight(.medium)
          .foregroundStyle(tint)
          .lineLimit(1)

        if let detail = complicationDetail(entry.snapshot, now: entry.date) {
          Text(detail)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        } else if entry.snapshot.state == .ready, !entry.snapshot.hasWork {
          Text(entry.snapshot.strings("complication.empty", "Nothing due or overdue"))
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        // Only said when it matters. A freshness line on every glance is noise;
        // on a stale one it is the most important thing on the face.
        if entry.snapshot.isStale(now: entry.date), entry.snapshot.state == .ready {
          Text(entry.snapshot.strings("complication.stale", "Not synced recently"))
            .font(.system(size: 9))
            .foregroundStyle(.orange)
            .lineLimit(1)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var circular: some View {
    VStack(spacing: -1) {
      Text(entry.hasData ? complicationCompactLabel(entry.snapshot) : "—")
        .font(.title3)
        .fontWeight(.semibold)
        .foregroundStyle(tint)
      Text(entry.snapshot.overdueCount > 0
        ? entry.snapshot.strings("complication.lateLower", "late")
        : entry.snapshot.strings("complication.todayLower", "today"))
        .font(.system(size: 9))
        .foregroundStyle(.secondary)
    }
  }

  private var inline: some View {
    // One line, no styling to speak of — the face owns the typography here.
    Text(entry.hasData
         ? (complicationDetail(entry.snapshot, now: entry.date) ?? complicationHeadline(entry.snapshot))
         : entry.snapshot.strings("complication.inlineSignedOut", "Semora · open on iPhone"))
  }
}

@main
struct SemoraComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "SemoraWatchComplication", provider: SemoraComplicationProvider()) { entry in
      SemoraComplicationView(entry: entry)
        .containerBackground(for: .widget) { Color.clear }
    }
    .configurationDisplayName("Semora")
    .description("What's due today, what's overdue, and what's next.")
    .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}
