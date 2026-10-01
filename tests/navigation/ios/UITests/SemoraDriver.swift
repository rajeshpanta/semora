import XCTest
import ObjectiveC

// Drives the INSTALLED Semora app (any build: simulator Debug/Release, or a
// device build) with real synthesized touches, from a small scenario language.
// Ported from the 2026-10-01 diagnosis probe. See ../../README.md.
//
// Safety: navigation and observation only. A tap whose label contains any word
// in `deny` is refused, so a scenario cannot save, create, delete, buy, sign out,
// record or send anything on the account it runs as.

private var quiescenceDisabled = false
// Semora animates continuously on several screens, so XCTest's "wait for the app
// to be idle" before every action times out (60 s each). Steps wait on elements
// or fixed sleeps instead.
func disableQuiescence() {
  if quiescenceDisabled { return }
  quiescenceDisabled = true
  guard let cls = NSClassFromString("XCUIApplicationProcess") else { return }
  if let m = class_getInstanceMethod(cls, NSSelectorFromString("waitForQuiescenceIncludingAnimationsIdle:")) {
    let b: @convention(block) (AnyObject, Bool) -> Void = { _, _ in }
    method_setImplementation(m, imp_implementationWithBlock(b))
  }
  if let m = class_getInstanceMethod(cls, NSSelectorFromString("waitForQuiescenceIncludingAnimationsIdle:isPreEvent:")) {
    let b: @convention(block) (AnyObject, Bool, Bool) -> Void = { _, _, _ in }
    method_setImplementation(m, imp_implementationWithBlock(b))
  }
}

final class SemoraDriver {
  let app = XCUIApplication(bundleIdentifier: "com.rajeshpanta.syllabussnap")
  let outDir: String
  var lines: [String] = []
  var counters: [String: [String: Int]] = [:]
  var values: [String: [String]] = [:]
  var failures: [String] = []
  var skipped: String? = nil
  private var probeSeq = 0

  let deny = ["Cerrar sesión", "Sign out", "Sign Out", "Guardar", "Save", "Eliminar", "Delete", "Conectar", "Connect",
              "Importar", "Import", "Sincronizar", "Sync", "Comprar", "Suscri", "Subscribe", "Restaurar", "Restore",
              "Enviar", "Send", "Grabar", "Record", "Compartir", "Share", "Marcar", "Mark", "Calificar", "Rate",
              "Quitar", "Remove", "Crear", "Create", "Purchase", "Añadir", "Agregar tarea", "Add Task"]

  init(outDir: String) {
    self.outDir = outDir
    try? FileManager.default.createDirectory(atPath: outDir + "/shots", withIntermediateDirectories: true)
    try? FileManager.default.createDirectory(atPath: outDir + "/probe", withIntermediateDirectories: true)
  }

  func log(_ s: String) {
    let line = "NAVGATE \(String(format: "%.3f", Date().timeIntervalSince1970)) \(s)"
    print(line)
    lines.append(line)
  }
  func count(_ group: String, _ key: String, _ by: Int = 1) { counters[group, default: [:]][key, default: 0] += by }
  func record(_ group: String, _ value: String) { values[group, default: []].append(value) }

  // ---- element lookup ------------------------------------------------------
  // `labels` is "A/B/C": alternatives (e.g. Spanish/English); first match wins.
  func find(_ labels: String) -> XCUIElement? {
    let alts = labels.split(separator: "/").map { String($0).trimmingCharacters(in: .whitespaces) }
    for a in alts {
      let p = NSPredicate(format: "label == %@", a)
      let b = app.buttons.matching(p).firstMatch
      if b.exists { return b }
      let any = app.descendants(matching: .any).matching(p).firstMatch
      if any.exists { return any }
    }
    for a in alts {
      let loose = NSPredicate(format: "label CONTAINS %@", a)
      let lb = app.buttons.matching(loose).firstMatch
      if lb.exists { return lb }
      let any = app.descendants(matching: .any).matching(loose).firstMatch
      if any.exists { return any }
    }
    return nil
  }
  func waitFind(_ labels: String, _ timeout: Double) -> XCUIElement? {
    let end = Date().addingTimeInterval(timeout)
    repeat { if let e = find(labels) { return e }; Thread.sleep(forTimeInterval: 0.25) } while Date() < end
    return nil
  }
  func safe(_ e: XCUIElement) -> Bool {
    let l = e.label
    for d in deny where l.contains(d) { log("REFUSED tap on '\(l)' (deny word '\(d)')"); return false }
    return true
  }
  func desc(_ e: XCUIElement) -> String {
    if !e.exists { return "exists=false" }
    let f = e.frame
    return "label='\(e.label)' enabled=\(e.isEnabled) hittable=\(e.isHittable) frame=(\(Int(f.minX)),\(Int(f.minY)),\(Int(f.width)),\(Int(f.height)))"
  }
  // The native navigation-bar Back button (react-native-screens draws it; no JS).
  func backButton() -> XCUIElement { app.navigationBars.buttons.element(boundBy: 0) }
  // React Navigation's JS tab bar labels its buttons "<name>, tab, N of M".
  func tabButton(_ n: Int) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "tab, \(n) of")).firstMatch
  }
  // Tap a tab if the tab bar is on screen; false (no test failure) if it is not.
  func tapTab(_ n: Int) -> Bool {
    let b = tabButton(n)
    guard b.waitForExistence(timeout: 3) else { return false }
    b.tap(); return true
  }
  func screenSummary() -> String {
    let nb = app.navigationBars
    if nb.count == 0 { return "navbar: none" }
    var parts: [String] = []
    for i in 0..<nb.count {
      let n = nb.element(boundBy: i)
      var btns: [String] = []
      for j in 0..<n.buttons.count { btns.append(n.buttons.element(boundBy: j).label) }
      parts.append("navbar[\(i)] buttons=\(btns)")
    }
    return parts.joined(separator: " | ")
  }
  func shot(_ name: String) {
    let png = XCUIScreen.main.screenshot().pngRepresentation
    try? png.write(to: URL(fileURLWithPath: "\(outDir)/shots/\(name).png"))
  }
  // Overlays that are not the app's UI and would swallow a test tap:
  //  - React Native's native RedBox, which a DEBUG native build raises for any
  //    console.error (on a simulator: RN-IAP "receipt-failed" at every launch);
  //    Release builds never show it.
  //  - the simulator's "Apple Account Verification" system alert.
  // Dismissed and logged, so a run can show what it cleared.
  let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
  func clearOverlays() {
    for _ in 0..<3 {
      let dismiss = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Dismiss'")).firstMatch
      let reload = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Reload'")).firstMatch
      guard dismiss.exists && reload.exists else { break }
      dismiss.tap(); log("cleared RedBox (debug native build)"); Thread.sleep(forTimeInterval: 0.6)
    }
    let notNow = springboard.buttons["Not Now"]
    if notNow.exists { notNow.tap(); log("cleared system alert (Not Now)"); Thread.sleep(forTimeInterval: 0.6) }
  }
  func edgeSwipe() {
    let a = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
    let b = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
    a.press(forDuration: 0.05, thenDragTo: b, withVelocity: .fast, thenHoldForDuration: 0.0)
  }

  // ---- native probe: tests/navigation/ios/tools/native_probe.py answers ------
  // Asks the host to attach lldb to the app and read native state (the root
  // UINavigationController's screens, the Back button's userInteractionEnabled).
  func probe(_ cmd: String) -> String {
    probeSeq += 1
    let req = "\(outDir)/probe/\(probeSeq).req"
    let resp = "\(outDir)/probe/\(probeSeq).resp"
    try? cmd.write(toFile: req, atomically: true, encoding: .utf8)
    let end = Date().addingTimeInterval(90)
    while Date() < end {
      if let s = try? String(contentsOfFile: resp, encoding: .utf8) { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
      Thread.sleep(forTimeInterval: 0.3)
    }
    return "timeout (is native_probe.py running?)"
  }

  // ---- scenario language ----------------------------------------------------
  func run(_ raw: String) throws {
    let t = raw.trimmingCharacters(in: .whitespaces)
    if t.isEmpty || t.hasPrefix("#") { return }
    let sp = t.split(separator: " ", maxSplits: 1).map(String.init)
    let cmd = sp[0]
    let arg = sp.count > 1 ? sp[1] : ""
    switch cmd {
    case "note": log("NOTE \(arg)")
    case "require-free-account":
      if ProcessInfo.processInfo.environment["NAVGATE_FREE_ACCOUNT"] != "1" {
        skipped = "needs a signed-in FREE (non-Pro) account; set --free-account when one is installed"
        throw XCTSkip(skipped!)
      }
    case "launch":
      app.launch(); log("launched (fresh process)")
    case "activate":
      app.activate(); log("activated")
    case "terminate":
      app.terminate(); log("terminated")
    case "sleep":
      Thread.sleep(forTimeInterval: Double(arg) ?? 1)
    case "shot":
      shot(arg)
    case "where":
      log("where \(screenSummary())")
    // assert-tabs <group>: the tab bar must be on screen (we really are back on
    // the tabs). Without this, a flow whose tap did not register looks the same
    // to `rootstack` as a flow that left a second tab navigator behind.
    case "assert-tabs":
      clearOverlays()
      if tabButton(1).waitForExistence(timeout: 4) { log("assert-tabs \(arg): tab bar visible") }
      else { log("assert-tabs \(arg): NO tab bar ; \(screenSummary())"); shot("\(arg)-no-tabs"); failures.append("assert-tabs \(arg): not on the tabs") }
    // backpoint: tap the native Back button by screen coordinate (as tabfreeze
    // does) and report whether the screen popped.
    case "backpoint":
      let b = backButton()
      guard b.waitForExistence(timeout: 4) else { log("backpoint: no Back button"); return }
      let f = b.frame
      let p = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: f.midX, dy: f.midY))
      p.tap(); Thread.sleep(forTimeInterval: 1.5)
      log("backpoint frame=(\(Int(f.minX)),\(Int(f.minY)),\(Int(f.width)),\(Int(f.height))) => \(backButton().exists ? "NOT_POPPED" : "POPPED")")
    case "tree":
      // Full accessibility tree, for diagnosing a step that cannot find its target.
      try? app.debugDescription.write(toFile: "\(outDir)/tree-\(arg.isEmpty ? "x" : arg).txt", atomically: true, encoding: .utf8)
      log("tree written: tree-\(arg.isEmpty ? "x" : arg).txt")
    case "openurl":
      XCUIDevice.shared.system.open(URL(string: arg)!); log("openurl \(arg)")
    case "clear":
      clearOverlays()
    case "tap", "tapif":
      clearOverlays()
      if let e = waitFind(arg, cmd == "tapif" ? 2.5 : 6) {
        if !safe(e) { return }
        let d = desc(e); e.tap(); log("\(cmd) '\(arg)' -> \(d)")
      } else if cmd == "tap" {
        log("tap '\(arg)' NOT FOUND ; \(screenSummary())"); failures.append("tap target not found: \(arg)")
      } else { log("tapif '\(arg)' absent (ok)") }
    case "tab":
      clearOverlays()
      let n = Int(arg) ?? 1
      let b = tabButton(n)
      if b.waitForExistence(timeout: 5) { b.tap(); log("tab \(n) -> '\(b.label)'") }
      else { log("tab \(n) NOT FOUND"); failures.append("tab \(n) not found") }
    case "scroll":
      let v = arg.split(separator: " ").compactMap { Double($0) }
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: v[0]))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: v[1])), withVelocity: .slow, thenHoldForDuration: 0.2)
      log("scroll \(v)")
    case "pulldown":
      let v = arg.split(separator: " ").compactMap { Double($0) }
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: v[0]))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: v[1])), withVelocity: .fast, thenHoldForDuration: 0.0)
      log("pulldown \(v)")
    case "edgeswipe":
      edgeSwipe(); log("edgeswipe")

    // rootstack <group> [expect=N]
    // Native count of screens in the root UINavigationController (one per route
    // in the app's root stack; presented modals are not in this list).
    case "rootstack":
      let a = arg.split(separator: " ").map(String.init)
      let group = a.first ?? "rootstack"
      let r = probe("rootstack")
      log("rootstack \(group): \(r)")
      let n = Int(r.components(separatedBy: "count=").dropFirst().first?.prefix(while: { $0.isNumber }) ?? "") ?? -1
      record(group, String(n))
      if let ex = a.first(where: { $0.hasPrefix("expect=") }), let want = Int(ex.dropFirst(7)), want != n {
        failures.append("rootstack \(group): \(n) screen(s), expected \(want)")
      }
    case "backstate":
      let r = probe("backstate"); log("backstate \(arg): \(r)"); record(arg.isEmpty ? "backstate" : arg, r)

    // cycle <group>|<n>|<rowsA;rowsB>|<waitBeforeBack>
    // Open a first-level screen from the current tab, tap the native Back
    // button, and classify: POPPED, POPPED_ON_RETRY (3 retries 1 s apart),
    // DEAD (still there after the retries; recovered with an edge swipe).
    case "cycle":
      let a = arg.split(separator: "|").map(String.init)
      let group = a[0]
      let n = Int(a[1]) ?? 1
      let rows = a[2].split(separator: ";").map(String.init)
      let w = Double(a.count > 3 ? a[3] : "1.5") ?? 1.5
      for i in 1...n {
        clearOverlays()
        let rowLabels = rows[(i - 1) % rows.count]
        guard let e = waitFind(rowLabels, 6) else { log("cycle \(group)#\(i) row '\(rowLabels)' NOT FOUND ; \(screenSummary())"); count(group, "row_not_found"); continue }
        if !safe(e) { return }
        e.tap()
        Thread.sleep(forTimeInterval: w)
        let b = backButton()
        guard b.waitForExistence(timeout: 4) else { log("cycle \(group)#\(i) no Back button after opening '\(rowLabels)' ; \(screenSummary())"); count(group, "no_back_button"); continue }
        clearOverlays()
        let d = desc(b)
        b.tap()
        Thread.sleep(forTimeInterval: 1.5)
        var still = backButton().exists
        var result = "POPPED"
        if still {
          var r = 0
          while r < 3 && still { clearOverlays(); backButton().tap(); Thread.sleep(forTimeInterval: 1.0); still = backButton().exists; r += 1 }
          if still {
            result = "DEAD"
            shot("\(group)-\(i)-dead")
            edgeSwipe(); Thread.sleep(forTimeInterval: 1.5)
            let swiped = !backButton().exists
            result += swiped ? " (edge swipe popped)" : " (edge swipe did NOT pop)"
            if !swiped { count(group, "stuck") }
          } else { result = "POPPED_ON_RETRY" }
        }
        count(group, result.hasPrefix("DEAD") ? "dead" : (result == "POPPED" ? "popped" : "popped_on_retry"))
        count(group, "cycles")
        log("cycle \(group)#\(i) '\(rowLabels)' back=[\(d)] => \(result)")
      }

    // tabfreeze <group>|<n>|<rowAlts>|<tabAfterBack>|<tabOfRow>|<backMethod tap|swipe>|<relaunchEach yes|no>
    // Back (or edge swipe) from a first-level screen, then IMMEDIATELY tap another
    // tab (the harness can fire about 0.27 s after Back at the earliest). Then go
    // back to the row's tab and try to open the row again: if nothing opens, the
    // tab content is dead (the tab bar itself keeps working in that failure).
    case "tabfreeze":
      let a = arg.split(separator: "|").map(String.init)
      let group = a[0]; let n = Int(a[1]) ?? 1; let row = a[2]
      let otherTab = Int(a[3]) ?? 1; let rowTab = Int(a[4]) ?? 5
      let method = a.count > 5 ? a[5] : "tap"; let relaunch = a.count > 6 && a[6] == "yes"
      for i in 1...n {
        if relaunch { app.launch(); Thread.sleep(forTimeInterval: 5); _ = waitFind("Cerrar/Close", 1.5).map { if safe($0) { $0.tap() } } }
        clearOverlays()
        guard tapTab(rowTab) else { log("tabfreeze \(group)#\(i) tab bar not found at start"); count(group, "no_tab_bar_at_start"); app.launch(); Thread.sleep(forTimeInterval: 5); continue }
        Thread.sleep(forTimeInterval: 1.0)
        guard let e = waitFind(row, 6) else { log("tabfreeze \(group)#\(i) row NOT FOUND"); count(group, "row_not_found"); continue }
        // The tab bar is hidden under a pushed screen, so its position is read
        // now, while it is on screen (it does not move).
        let of = tabButton(otherTab).frame
        e.tap(); Thread.sleep(forTimeInterval: 1.5)
        guard backButton().waitForExistence(timeout: 4) else { log("tabfreeze \(group)#\(i) screen did not open"); count(group, "did_not_open"); continue }
        // Both targets are resolved to screen points BEFORE the Back action, so
        // the tab tap is the very next synthesized event (no element query in
        // between); the harness cannot inject it sooner than ~0.27 s.
        let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let bf = backButton().frame
        let backPoint = origin.withOffset(CGVector(dx: bf.midX, dy: bf.midY))
        let tabPoint = origin.withOffset(CGVector(dx: of.midX, dy: of.midY))
        let t0 = Date()
        if method == "swipe" { edgeSwipe() } else { backPoint.tap() }
        let t1 = Date()
        tabPoint.tap()
        let t2 = Date()
        let gap = t2.timeIntervalSince(t1) * 1000
        log(String(format: "tabfreeze %@#%d timing: back action %.0f ms, then tab tap took %.0f ms", group, i, t1.timeIntervalSince(t0) * 1000, gap))
        Thread.sleep(forTimeInterval: 1.5)
        clearOverlays()
        count(group, "trials")
        // Outcome 1: the pushed screen is still (or again) in front - the pop
        // was undone. Record whether the Back button still works from there.
        if backButton().exists {
          shot("\(group)-\(i)-pop-undone")
          backButton().tap(); Thread.sleep(forTimeInterval: 1.5)
          let backOk = !backButton().exists
          count(group, backOk ? "pop_undone_back_ok" : "pop_undone_back_dead")
          log(String(format: "tabfreeze %@#%d back=%@ then tab %d (%.0f ms) => POP_UNDONE (pushed screen still in front; Back afterwards %@)", group, i, method, otherTab, gap, backOk ? "works" : "DEAD"))
          if !backOk { edgeSwipe(); Thread.sleep(forTimeInterval: 1.5) }
          if backButton().exists || !relaunch { app.launch(); Thread.sleep(forTimeInterval: 5) }
          continue
        }
        // Outcome 2/3: back on the tabs - does the content still respond?
        var alive = false
        if tapTab(rowTab) {
          Thread.sleep(forTimeInterval: 1.0)
          if let again = waitFind(row, 3) {
            again.tap(); Thread.sleep(forTimeInterval: 1.5)
            alive = backButton().exists
            if alive { edgeSwipe(); Thread.sleep(forTimeInterval: 1.5) }
          }
        }
        if !alive { shot("\(group)-\(i)-frozen") }
        count(group, alive ? "alive" : "frozen")
        log(String(format: "tabfreeze %@#%d back=%@ then tab %d (tab tap %.0f ms right after the back action) => %@", group, i, method, otherTab, gap, alive ? "CONTENT_RESPONDS" : "CONTENT_FROZEN"))
        if !alive && !relaunch { app.launch(); Thread.sleep(forTimeInterval: 5) }
      }

    // expect <group> <key><op><int>   e.g.  expect back-normal dead=0   expect stack max<=1
    case "expect":
      let a = arg.split(separator: " ").map(String.init)
      let group = a[0]
      let cond = a[1]
      for op in ["<=", ">=", "="] {
        if let r = cond.range(of: op) {
          let key = String(cond[..<r.lowerBound]); let want = Int(cond[r.upperBound...]) ?? 0
          let got: Int
          if key == "max" { got = (values[group] ?? []).compactMap { Int($0) }.max() ?? -1 }
          else { got = counters[group]?[key] ?? 0 }
          let ok = op == "=" ? got == want : (op == "<=" ? got <= want : got >= want)
          log("expect \(group) \(key)\(op)\(want): got \(got) => \(ok ? "OK" : "FAIL")")
          if !ok { failures.append("expect \(group) \(key)\(op)\(want), got \(got)") }
          break
        }
      }
    default:
      log("UNKNOWN COMMAND: \(t)"); failures.append("unknown command \(cmd)")
    }
  }

  func writeSummary(scenario: String) {
    let summary: [String: Any] = ["scenario": scenario, "counters": counters, "values": values, "failures": failures, "skipped": skipped as Any]
    if let data = try? JSONSerialization.data(withJSONObject: summary, options: [.prettyPrinted, .sortedKeys]) {
      try? data.write(to: URL(fileURLWithPath: "\(outDir)/summary.json"))
    }
    try? lines.joined(separator: "\n").write(toFile: "\(outDir)/log.txt", atomically: true, encoding: .utf8)
  }
}
