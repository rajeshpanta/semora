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
  @Published private(set) var tracker = WatchCompletionTracker()

  /// Persisted because a queued transfer outlives the app. Without this, a tap
  /// followed by the watch app being closed would come back looking untapped,
  /// and the student would tap again.
  private static let trackerKey = "semora.watch.pendingCompletions.v1"

  override init() {
    super.init()

    guard WCSession.isSupported() else {
      sessionState = "unsupported"
      return
    }

    if let stored = UserDefaults.standard.dictionary(forKey: Self.trackerKey) {
      tracker = WatchCompletionTracker.restore(from: stored)
    }

    let session = WCSession.default
    session.delegate = self
    session.activate()

    // The iPhone pushes context whether or not this app is running, and
    // WatchConnectivity keeps only the most recent one. Adopting it at launch
    // is what makes a cold start show real work instead of an empty screen.
    adopt(session.receivedApplicationContext)
  }

  private func persistTracker() {
    UserDefaults.standard.set(tracker.storable, forKey: Self.trackerKey)
  }

  /// Ask the phone to complete a task.
  ///
  /// `transferUserInfo`, not `sendMessage`: the phone is frequently not
  /// reachable at the moment of the tap — in a bag, asleep, out of range — and
  /// sendMessage simply fails there. A queued transfer is held by the system,
  /// survives this app being closed, and is delivered when the phone next
  /// comes up, waking it in the background to receive it. Nothing about the
  /// task is decided here; the phone owns that.
  func requestCompletion(for task: WatchTask) {
    guard WCSession.isSupported() else { return }
    let now = Date()
    let requestId = UUID().uuidString.lowercased()
    guard tracker.begin(taskId: task.id, requestId: requestId, now: now) else { return }
    persistTracker()
    send(watchCompletionRequest(taskId: task.id, requestId: requestId, now: now))
  }

  /// Get a payload to the phone by whichever route can actually carry it.
  ///
  /// `sendMessage` when the phone is reachable — the common case, since the two
  /// are usually within a metre of each other, and it arrives in moments rather
  /// than whenever the system feels like flushing a queue. `transferUserInfo`
  /// otherwise: it is held by the system, survives this app being closed, and
  /// wakes the phone in the background when it next comes into range.
  ///
  /// The error fallback can deliver the same request twice — the message may
  /// have arrived even though the reply did not. That is deliberate and safe:
  /// the phone refuses a repeated requestId, and refuses to complete a task
  /// that is already complete. Losing a completion is the failure worth
  /// avoiding; delivering one twice is already handled.
  private func send(_ payload: [String: Any]) {
    let session = WCSession.default
    guard session.activationState == .activated else {
      session.transferUserInfo(payload)
      return
    }
    if session.isReachable {
      session.sendMessage(payload, replyHandler: { _ in }, errorHandler: { _ in
        session.transferUserInfo(payload)
      })
    } else {
      session.transferUserInfo(payload)
    }
  }

  func state(for taskId: String) -> WatchRowState { tracker.state(for: taskId) }

  private func applyAck(_ ack: WatchCompletionAck) {
    tracker.resolve(requestId: ack.requestId, ok: ack.ok, now: Date())
    persistTracker()
  }

  private func adopt(_ context: [String: Any]) {
    guard !context.isEmpty, let decoded = decodeWatchSnapshot(from: context) else { return }
    snapshot = decoded
    // A fresh snapshot is the phone's own account of what is outstanding, so
    // it supersedes anything this watch believed about work in flight.
    tracker.reconcile(with: Set(decoded.tasks.map(\.id)), now: Date())
    persistTracker()
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

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    guard let ack = decodeWatchAck(from: userInfo) else { return }
    DispatchQueue.main.async { self.applyAck(ack) }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    guard let ack = decodeWatchAck(from: message) else { return }
    DispatchQueue.main.async { self.applyAck(ack) }
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
        TaskRow(
          task: task,
          now: now,
          state: store.state(for: task.id),
          onComplete: { store.requestCompletion(for: task) }
        )
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
  let state: WatchRowState
  let onComplete: () -> Void

  var body: some View {
    Button(action: onComplete) { rowBody }
      .buttonStyle(.plain)
      // A row already sent or already confirmed is not tappable: the first of
      // three guards against completing the same task twice.
      .disabled(state == .pending || state == .done)
  }

  private var rowBody: some View {
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
          .strikethrough(state == .done)
          .foregroundStyle(state == .done ? .secondary : .primary)

        HStack(spacing: 4) {
          switch state {
          case .pending:
            // Not a spinner: this can legitimately take minutes if the phone
            // is away, and a spinner would read as "about to finish".
            Text("Sending…").foregroundStyle(.secondary)
          case .done:
            Text("Completed").foregroundStyle(.green)
          case .failed:
            Text("Didn't send · tap to retry").foregroundStyle(.orange)
          case .idle:
            Text(watchDueLabel(dueDate: task.dueDate, dueTime: task.dueTime, now: now))
              .foregroundStyle(task.bucket == .overdue ? .red : .secondary)
            Text("·").foregroundStyle(.secondary)
            Text(task.course)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
        .font(.caption2)
      }

      Spacer(minLength: 0)

      if state == .done {
        Image(systemName: "checkmark.circle.fill")
          .foregroundStyle(.green)
          .font(.caption)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 2)
    .contentShape(Rectangle())
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
