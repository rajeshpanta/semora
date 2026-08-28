import SwiftUI
import WatchConnectivity

// ── Semora Watch companion ───────────────────────────────────────────────────
//
// A read-only view of the Today tab. Everything on this screen was decided by
// the iPhone: what counts as overdue, what is due today, what comes next, and
// in what order. The watch does no filtering and no sorting of its own — if it
// did, the wrist and the phone would eventually disagree, and the wrist would
// be the one nobody thought to check.
//
// There is no account here, no network, and no second copy of the task model.
// The only input is a WatchConnectivity application context; the only state is
// the last one that arrived.

// ── Connectivity ─────────────────────────────────────────────────────────────

final class WatchConnectivityStore: NSObject, ObservableObject, WCSessionDelegate {
  @Published private(set) var snapshot: WatchSnapshot?
  @Published private(set) var sessionState: String = "starting"
  @Published private(set) var lastError: String?

  override init() {
    super.init()

    guard WCSession.isSupported() else {
      sessionState = "unsupported"
      return
    }

    let session = WCSession.default
    session.delegate = self
    session.activate()

    // The iPhone pushes context whether or not this app is running, and
    // WatchConnectivity keeps only the most recent one. Adopting it at launch
    // is what makes a cold start show real work instead of an empty screen.
    adopt(session.receivedApplicationContext)
  }

  private func adopt(_ context: [String: Any]) {
    guard !context.isEmpty, let decoded = decodeWatchSnapshot(from: context) else { return }
    snapshot = decoded
  }

  func session(_ session: WCSession,
               activationDidCompleteWith activationState: WCSessionActivationState,
               error: Error?) {
    DispatchQueue.main.async {
      switch activationState {
      case .activated: self.sessionState = "activated"
      case .inactive: self.sessionState = "inactive"
      case .notActivated: self.sessionState = "notActivated"
      @unknown default: self.sessionState = "unknown"
      }
      self.lastError = error?.localizedDescription
      // Activation can complete after a context was already waiting.
      self.adopt(session.receivedApplicationContext)
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    // Delivered on a background queue; @Published from off-main is a SwiftUI
    // violation, so the hop is required rather than stylistic.
    DispatchQueue.main.async { self.adopt(context) }
  }
}

// ── UI ───────────────────────────────────────────────────────────────────────

@main
struct SemoraWatchApp: App {
  var body: some Scene {
    WindowGroup { CompanionView() }
  }
}

struct CompanionView: View {
  @StateObject private var store = WatchConnectivityStore()
  /// Drives the relative "updated Nm ago" label without a timer: the view
  /// re-renders when the app comes forward, which is the only moment a wrist
  /// glance can happen anyway.
  @State private var now = Date()

  private let brand = Color(red: 0.42, green: 0.27, blue: 0.76)

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        Text("Semora")
          .font(.headline)
          .foregroundStyle(brand)

        content
      }
      .padding(.horizontal, 2)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .onAppear { now = Date() }
  }

  @ViewBuilder
  private var content: some View {
    if let snapshot = store.snapshot {
      switch snapshot.state {
      case .signedOut:
        // Never a blank "all clear" — that would read as good news.
        MessageBlock(
          title: "Signed out",
          detail: "Sign in on your iPhone to see your work here."
        )
      case .ready:
        readyContent(snapshot)
      }
    } else {
      // A settled state, not a loading one. There is nothing to wait for: if
      // the phone had sent something, it would already be here.
      MessageBlock(
        title: "No data yet",
        detail: store.sessionState == "activated"
          ? "Open Semora on your iPhone to sync."
          : "Connecting to your iPhone…"
      )
    }
  }

  @ViewBuilder
  private func readyContent(_ snapshot: WatchSnapshot) -> some View {
    CountsRow(
      dueToday: snapshot.dueTodayCount,
      overdue: snapshot.overdueCount,
      brand: brand
    )

    let freshness = WatchFreshness.describe(updatedAt: snapshot.updatedAt, now: now)
    Text(freshness.label)
      .font(.caption2)
      .foregroundStyle(freshness.isStale ? .orange : .secondary)

    if snapshot.tasks.isEmpty {
      MessageBlock(
        title: snapshot.overdueCount > 0 ? "Nothing due today" : "You're all caught up",
        detail: snapshot.overdueCount > 0
          ? "Still \(snapshot.overdueCount) overdue on your iPhone."
          : "Nothing due today or coming up."
      )
    } else {
      ForEach(snapshot.tasks) { task in
        TaskRow(task: task, now: now)
      }
    }

    if snapshot.isFutureSchema {
      Text("Update Semora on your Watch to see everything your iPhone is sending.")
        .font(.caption2)
        .foregroundStyle(.orange)
    }
  }
}

private struct CountsRow: View {
  let dueToday: Int
  let overdue: Int
  let brand: Color

  var body: some View {
    HStack(spacing: 8) {
      CountTile(value: dueToday, label: "Today", tint: brand)
      // Overdue only earns a tile when there is something overdue — a
      // permanent "0 overdue" is noise on a screen this size.
      if overdue > 0 {
        CountTile(value: overdue, label: "Overdue", tint: .red)
      }
    }
  }
}

private struct CountTile: View {
  let value: Int
  let label: String
  let tint: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("\(value)")
        .font(.title2)
        .fontWeight(.semibold)
        .foregroundStyle(tint)
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 4)
    .padding(.horizontal, 8)
    .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
  }
}

private struct TaskRow: View {
  let task: WatchTask
  let now: Date

  var body: some View {
    HStack(alignment: .top, spacing: 6) {
      // The course colour is the only thing carrying course identity at a
      // glance; the name is there for when the colour is not enough.
      RoundedRectangle(cornerRadius: 2)
        .fill(task.color)
        .frame(width: 3)

      VStack(alignment: .leading, spacing: 1) {
        Text(task.title)
          .font(.caption)
          .lineLimit(2)

        HStack(spacing: 4) {
          Text(watchDueLabel(dueDate: task.dueDate, dueTime: task.dueTime, now: now))
            .foregroundStyle(task.bucket == .overdue ? .red : .secondary)
          Text("·").foregroundStyle(.secondary)
          Text(task.course)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .font(.caption2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 2)
  }
}

private struct MessageBlock: View {
  let title: String
  let detail: String

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title).font(.caption).fontWeight(.medium)
      Text(detail).font(.caption2).foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

#Preview {
  CompanionView()
}
