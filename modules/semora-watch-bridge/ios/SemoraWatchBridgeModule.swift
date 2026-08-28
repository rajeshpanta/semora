import ExpoModulesCore
import WatchConnectivity

// ── Semora ⇄ Watch bridge (iPhone side) ──────────────────────────────────────
//
// Phase 2 scope: prove the pipe. This module activates WCSession, reports what
// the pairing actually looks like, and pushes ONE hard-coded diagnostic payload.
//
// A deliberate design note on the payload: JavaScript cannot supply arbitrary
// keys. `sendTestSnapshot` takes two integers and nothing else — the dictionary
// itself is assembled here, in native code, from constants. That is not
// ceremony. WatchConnectivity writes application context to disk on both
// devices, so anything handed to it outlives the process; making the payload
// un-extendable from JS means a later caller cannot accidentally route a
// session token or an email address through this bridge without a native
// change and the review that comes with it.

/// Keys the Watch app decodes. Kept in one place so the two sides cannot drift.
private enum PayloadKey {
  static let schemaVersion = "schemaVersion"
  static let type = "type"
  static let message = "message"
  static let dueTodayCount = "dueTodayCount"
  static let overdueCount = "overdueCount"
  static let updatedAt = "updatedAt"
}

private enum Payload {
  /// Bump only alongside the Watch-side decoder.
  static let schemaVersion = 1
  static let type = "semora_watch_test"
  static let message = "Hello from Semora"
}

/// The real snapshot. Kept separate from the diagnostic above so the two can
/// never be confused on the wire: the Watch switches on `type`, and a build
/// that only understands one of them ignores the other rather than rendering
/// half a payload.
private enum SnapshotPayload {
  /// Must match WATCH_SCHEMA_VERSION in lib/watchSnapshot.ts.
  static let schemaVersion = 3
  static let type = "semora_watch_snapshot"
}

/// The real snapshot, as a typed record.
///
/// This is the security boundary. JavaScript cannot hand the bridge a free-form
/// dictionary: it fills these fields or nothing. WatchConnectivity persists
/// application context to disk on BOTH devices, so a payload outlives the
/// process that sent it — a token or an email address routed through here by a
/// careless caller would sit on the watch indefinitely. Widening what can cross
/// requires editing this struct, which is a change a reviewer can see.
struct WatchTaskRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var course: String = ""
  @Field var colorHex: String = "#6B46C1"
  @Field var dueDate: String = ""
  @Field var dueTime: String? = nil
  @Field var bucket: String = "upcoming"

  func asDictionary() -> [String: Any] {
    var out: [String: Any] = [
      "id": id,
      "title": title,
      "course": course,
      "colorHex": colorHex,
      "dueDate": dueDate,
      "bucket": bucket,
    ]
    // Omitted rather than sent as NSNull: the Watch treats a missing key and a
    // null the same way, and property-list encoding is happier without it.
    if let dueTime, !dueTime.isEmpty { out["dueTime"] = dueTime }
    return out
  }
}

struct WatchSnapshotRecord: Record {
  /// "ready" or "signed_out" — see lib/watchSnapshot.ts.
  @Field var state: String = "ready"
  @Field var dueTodayCount: Int = 0
  @Field var overdueCount: Int = 0
  @Field var items: [WatchTaskRecord] = []
}

/// The phone's answer to one completion request.
struct WatchAckRecord: Record {
  @Field var requestId: String = ""
  @Field var taskId: String = ""
  @Field var ok: Bool = false
  /// One of the WatchCompletionFailure values in lib/watchCompletion.ts.
  @Field var reason: String? = nil
}

/// Owns WCSession for the app's lifetime.
///
/// Separate from the Expo `Module` on purpose: `Module` is not an `NSObject`
/// (it is `AnyModule & BaseModule`), and `WCSessionDelegate` requires
/// `NSObjectProtocol`. A dedicated coordinator also survives the module being
/// torn down and recreated, which matters because WCSession must have exactly
/// one delegate per process.
final class SemoraWatchSessionCoordinator: NSObject, WCSessionDelegate {
  static let shared = SemoraWatchSessionCoordinator()

  /// Last activation error, surfaced to JS for diagnosis. Never thrown.
  private var lastActivationError: String?
  private var didRequestActivation = false

  /// Set once JavaScript is listening.
  var onCompletionRequest: (([String: Any]) -> Void)?

  /// Requests that arrived before JavaScript was ready.
  ///
  /// This is the whole reason a completion tapped on a wrist survives a phone
  /// that was not running: iOS wakes the app to deliver the transfer, and the
  /// React Native runtime takes time to come up. Anything delivered in that gap
  /// would otherwise be handed to nobody and lost silently — the one failure
  /// mode a student could never diagnose, because the tap looked like it
  /// worked. Bounded so a pathological queue cannot grow without limit.
  private var bufferedRequests: [[String: Any]] = []
  private let maxBufferedRequests = 50

  /// The most recent snapshot we were asked to send but could not.
  ///
  /// A send can arrive before the session finishes activating, before a watch
  /// is paired, or before the watch app is installed — all three are ordinary,
  /// and all three used to drop the payload silently. The Today tab only pushes
  /// when its data changes, so a student whose week is settled would then see
  /// nothing on the wrist until something happened to change it. Holding the
  /// last one and flushing it when the state changes is what makes the first
  /// launch after installing the watch app show real work.
  private var undeliveredContext: [String: Any]?

  private override init() {
    super.init()
  }

  /// Idempotent. Safe to call from anywhere, including a device with no Watch.
  func start() {
    // `isSupported()` is false on iPad and on any platform without the
    // framework. Touching `WCSession.default` when unsupported is documented as
    // a programmer error, so this guard is load-bearing, not defensive noise.
    guard WCSession.isSupported() else { return }

    let session = WCSession.default
    if session.delegate !== self {
      session.delegate = self
    }
    // Activating an already-activated session is a no-op, but re-activating a
    // session that is mid-activation is wasteful — track it.
    if session.activationState != .activated || !didRequestActivation {
      didRequestActivation = true
      session.activate()
    }
  }

  private static func describe(_ state: WCSessionActivationState) -> String {
    switch state {
    case .notActivated: return "notActivated"
    case .inactive: return "inactive"
    case .activated: return "activated"
    @unknown default: return "unknown"
    }
  }

  /// A full picture of the pairing. Every field is safe to read with no Watch.
  func status() -> [String: Any] {
    guard WCSession.isSupported() else {
      return [
        "supported": false,
        "paired": false,
        "watchAppInstalled": false,
        "activationState": "unsupported",
        "reachable": false,
        "activationError": lastActivationError as Any,
      ]
    }

    let session = WCSession.default
    return [
      "supported": true,
      "paired": session.isPaired,
      "watchAppInstalled": session.isWatchAppInstalled,
      "activationState": Self.describe(session.activationState),
      "reachable": session.isReachable,
      "activationError": lastActivationError as Any,
    ]
  }

  /// Pushes the diagnostic snapshot as application context.
  ///
  /// `updateApplicationContext` is the right primitive here and not
  /// `sendMessage`: it is latest-state-wins. A newer call overwrites whatever
  /// was queued but not yet delivered, and the receiver is handed the newest
  /// state whether or not it ever saw the older one. That is exactly the
  /// semantics a "how many things are due" screen wants — a missed intermediate
  /// value is not a lost update, it is a value that was already stale.
  ///
  /// Returns a result rather than throwing. Phase 2's contract with the iPhone
  /// app is that talking to a Watch can fail quietly and the app carries on.
  func sendSnapshot(dueTodayCount: Int, overdueCount: Int) -> [String: Any] {
    let context: [String: Any] = [
      PayloadKey.schemaVersion: Payload.schemaVersion,
      PayloadKey.type: Payload.type,
      PayloadKey.message: Payload.message,
      PayloadKey.dueTodayCount: dueTodayCount,
      PayloadKey.overdueCount: overdueCount,
      PayloadKey.updatedAt: ISO8601DateFormatter().string(from: Date()),
    ]

    return deliver(context)
  }

  /// The one place a context actually reaches WatchConnectivity.
  ///
  /// Every precondition lives here so the diagnostic and the real snapshot
  /// cannot drift into disagreeing about when a send is possible. Returns a
  /// result instead of throwing: Phase 2's contract with the iPhone app is that
  /// talking to a Watch can fail quietly and the app carries on.
  private func deliver(_ context: [String: Any]) -> [String: Any] {
    guard WCSession.isSupported() else {
      return ["ok": false, "reason": "unsupported"]
    }

    start()

    let session = WCSession.default

    guard session.activationState == .activated else {
      remember(context)
      return ["ok": false, "reason": "not_activated",
              "activationState": Self.describe(session.activationState)]
    }
    guard session.isPaired else {
      remember(context)
      return ["ok": false, "reason": "no_watch_paired"]
    }
    guard session.isWatchAppInstalled else {
      remember(context)
      return ["ok": false, "reason": "watch_app_not_installed"]
    }

    do {
      try session.updateApplicationContext(context)
      undeliveredContext = nil
      return ["ok": true, "reason": NSNull()]
    } catch {
      // Thrown when the session is not activated or the payload is not
      // property-list encodable. Neither should reach here, but a Watch call
      // must never be the reason Semora dies.
      return ["ok": false, "reason": "update_failed",
              "error": error.localizedDescription]
    }
  }

  /// Pushes the real snapshot.
  ///
  /// Shares every guard with the diagnostic path deliberately — one set of
  /// preconditions, so "why did nothing arrive" has one answer regardless of
  /// which payload was being sent.
  func sendSnapshot(_ snapshot: WatchSnapshotRecord) -> [String: Any] {
    let context: [String: Any] = [
      PayloadKey.schemaVersion: SnapshotPayload.schemaVersion,
      PayloadKey.type: SnapshotPayload.type,
      PayloadKey.updatedAt: ISO8601DateFormatter().string(from: Date()),
      "state": snapshot.state,
      PayloadKey.dueTodayCount: snapshot.dueTodayCount,
      PayloadKey.overdueCount: snapshot.overdueCount,
      "items": snapshot.items.map { $0.asDictionary() },
    ]
    return deliver(context)
  }

  /// Only snapshots are held. An ack is about one request at one moment and is
  /// worse than useless once stale — the watch expires its own pending rows.
  private func remember(_ context: [String: Any]) {
    guard context["type"] as? String == "semora_watch_snapshot" else { return }
    undeliveredContext = context
  }

  /// Re-send whatever was held, if anything.
  private func flushUndelivered() {
    guard let pending = undeliveredContext else { return }
    undeliveredContext = nil
    // deliver() will hold it again if the state still is not ready, so this
    // cannot spin: each attempt either succeeds or re-arms exactly once.
    _ = deliver(pending)
  }

  // ── WCSessionDelegate ──────────────────────────────────────────────────────

  func session(_ session: WCSession,
               activationDidCompleteWith activationState: WCSessionActivationState,
               error: Error?) {
    lastActivationError = error?.localizedDescription
    if activationState == .activated {
      flushUndelivered()
    }
  }

  /// Fires when a watch is paired or unpaired, or the watch app is installed or
  /// removed. Installing the watch app is the common one: until this, every
  /// send was correctly refused, and the payload held back is exactly what the
  /// newly installed app should open to.
  func sessionWatchStateDidChange(_ session: WCSession) {
    DispatchQueue.main.async { self.flushUndelivered() }
  }

  // Required on iOS. The system deactivates the session when the user switches
  // to a different Watch; reactivating is what keeps the bridge usable after
  // that without the app being relaunched.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    // Only completion requests are accepted inbound. Anything else is ignored
    // rather than forwarded — the JS side re-validates too, but a payload we do
    // not recognise has no business reaching it.
    guard userInfo["type"] as? String == "semora_watch_complete" else { return }

    DispatchQueue.main.async {
      if let handler = self.onCompletionRequest {
        handler(userInfo)
      } else if self.bufferedRequests.count < self.maxBufferedRequests {
        self.bufferedRequests.append(userInfo)
      }
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any],
               replyHandler: @escaping ([String: Any]) -> Void) {
    // Reply immediately and unconditionally. WatchConnectivity expects a
    // prompt answer, and the real work — a database read and a write — takes
    // far longer than it will wait. The watch is told what happened by a
    // separate ack, not by this reply.
    replyHandler(["received": true])
    self.session(session, didReceiveUserInfo: message)
  }

  /// Hand over anything that arrived before JavaScript was listening.
  func drainBufferedRequests() -> [[String: Any]] {
    let pending = bufferedRequests
    bufferedRequests = []
    return pending
  }

  /// Tell the watch what happened.
  ///
  /// `transferUserInfo` rather than `sendMessage`: the watch app is usually not
  /// in the foreground by the time the phone has finished writing, and a queued
  /// transfer is delivered whenever it next is. Without this the watch could
  /// only guess, and a failed completion would look identical to a successful
  /// one.
  func sendAck(_ ack: WatchAckRecord) -> [String: Any] {
    guard WCSession.isSupported() else { return ["ok": false, "reason": "unsupported"] }
    start()
    let session = WCSession.default
    guard session.activationState == .activated else {
      return ["ok": false, "reason": "not_activated"]
    }
    guard session.isPaired, session.isWatchAppInstalled else {
      return ["ok": false, "reason": "no_watch_paired"]
    }
    var info: [String: Any] = [
      "type": "semora_watch_complete_ack",
      "requestId": ack.requestId,
      "taskId": ack.taskId,
      "ok": ack.ok,
    ]
    if let reason = ack.reason { info["reason"] = reason }
    // Same reasoning as the watch side: straight through when the watch app is
    // reachable, queued when it is not. A duplicate ack is harmless — the watch
    // ignores one whose requestId it does not recognise, and applying the same
    // answer twice reaches the same state.
    if session.isReachable {
      session.sendMessage(info, replyHandler: nil, errorHandler: { _ in
        session.transferUserInfo(info)
      })
    } else {
      session.transferUserInfo(info)
    }
    return ["ok": true, "reason": NSNull()]
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    didRequestActivation = false
    session.activate()
  }
}

public class SemoraWatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SemoraWatchBridge")

    // Activate as early as the module exists. WCSession reports `isPaired` and
    // `isWatchAppInstalled` as false until activation completes, so starting
    // lazily on first send would make the first status read misleading.
    OnCreate {
      SemoraWatchSessionCoordinator.shared.start()
    }

    Function("getStatus") { () -> [String: Any] in
      SemoraWatchSessionCoordinator.shared.status()
    }

    AsyncFunction("sendTestSnapshot") { (dueTodayCount: Int, overdueCount: Int) -> [String: Any] in
      SemoraWatchSessionCoordinator.shared.sendSnapshot(
        dueTodayCount: dueTodayCount,
        overdueCount: overdueCount
      )
    }

    AsyncFunction("sendSnapshot") { (snapshot: WatchSnapshotRecord) -> [String: Any] in
      SemoraWatchSessionCoordinator.shared.sendSnapshot(snapshot)
    }

    AsyncFunction("sendCompletionAck") { (ack: WatchAckRecord) -> [String: Any] in
      SemoraWatchSessionCoordinator.shared.sendAck(ack)
    }

    Events("onWatchCompletionRequest")

    OnStartObserving {
      let coordinator = SemoraWatchSessionCoordinator.shared
      coordinator.onCompletionRequest = { [weak self] request in
        self?.sendEvent("onWatchCompletionRequest", request)
      }
      // Flush anything that arrived while the app was starting up.
      for request in coordinator.drainBufferedRequests() {
        self.sendEvent("onWatchCompletionRequest", request)
      }
    }

    OnStopObserving {
      // Back to buffering. Dropping the handler without this would silently
      // discard every request until JS subscribed again.
      SemoraWatchSessionCoordinator.shared.onCompletionRequest = nil
    }
  }
}
