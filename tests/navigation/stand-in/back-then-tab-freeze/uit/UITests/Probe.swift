import XCTest

struct Ev { let t: Double; let name: String }

/// Driver for the #4361 probe. Every touch is a synthesized XCUITest touch sent through
/// XCSynthesizedEventRecord (no "wait for idle": Expo Go never reports idle with this project).
/// Facts measured on this Xcode (27.0) before the matrix was designed:
///   - one synthesized tap occupies the event daemon for ~260 ms ("only one gesture can be performed at a time"),
///     so two REAL touches cannot be closer than ~270 ms touch-down to touch-down;
///   - a second finger in the same event that starts after the first has lifted is dropped or replayed wrongly.
/// Hence two methods:
///   touch : pop by a real touch, then a real touch on the tab as soon as the daemon allows (+ optional extra wait)
///   prog  : pop by a real touch, then the tab bar's own onPress code run by a JS timer N ms after the pop action
final class Probe: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "host.exp.Exponent")
  let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
  let base = (ProcessInfo.processInfo.environment["STANDIN_OUT"] ?? NSTemporaryDirectory()) + "/vtab"
  var env: [String: String] { ProcessInfo.processInfo.environment }
  var osTag: String { env["VT_OS"] ?? "osX" }
  var runTag: String { env["VT_TAG"] ?? "run" }
  var port: String { env["VT_PORT"] ?? "8098" }

  var tabF: [String: CGRect] = [:]
  var rowF = CGRect.zero
  var visited: Set<String> = ["A"]
  var needRelaunch = false
  var launches = 0

  // ---------- output ----------
  func out(_ s: String) {
    print("VR| \(s)")
    let path = "\(base)/logs/res_\(osTag)_\(runTag).log"
    let line = "\(s)\n"
    if let h = FileHandle(forWritingAtPath: path) { h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); h.closeFile() }
    else { try? line.write(toFile: path, atomically: true, encoding: .utf8) }
  }
  func pause(_ t: TimeInterval) { Thread.sleep(forTimeInterval: t) }
  func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
  func shot(_ name: String) {
    let png = XCUIScreen.main.screenshot().pngRepresentation
    do { try png.write(to: URL(fileURLWithPath: "\(base)/shots/\(osTag)_\(name).png")) } catch { out("shot write failed \(error)") }
  }

  // ---------- element helpers ----------
  func el(_ prefix: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
  }
  func mid(_ r: CGRect) -> CGPoint { CGPoint(x: r.midX, y: r.midY) }
  func tapPath(_ p: CGPoint, _ down: Double, hold: Double = 0.04) -> [NSNumber] {
    [NSNumber(value: Double(p.x)), NSNumber(value: Double(p.y)), NSNumber(value: down), NSNumber(value: down + hold)]
  }
  func swipePath() -> [NSNumber] {
    // edge swipe: touch down at x=2, hold 50 ms, drag to x=300 over 250 ms in 10 steps, lift at 320 ms
    let y = 430.0
    var a: [NSNumber] = [2, NSNumber(value: y), 0, 2, NSNumber(value: y), 0.05]
    for k in 1...10 {
      a += [NSNumber(value: 2 + 298.0 * Double(k) / 10), NSNumber(value: y), NSNumber(value: 0.05 + 0.25 * Double(k) / 10)]
    }
    a.append(0.32)
    return a
  }
  /// One synthesized tap; returns when the event daemon is free again (~260 ms).
  func tapNow(_ p: CGPoint) {
    let r = Synth.run([tapPath(p, 0)])
    if r != "OK" { out("tap synth problem: \(r)") }
  }
  func status() -> (routes: String, tab: String) {
    let e = el("status|")
    guard e.exists else { return ("<none>", "<none>") }
    var r = "?", t = "?"
    for p in e.label.components(separatedBy: "|") {
      if p.hasPrefix("routes=") { r = String(p.dropFirst(7)) }
      if p.hasPrefix("tab=") { t = String(p.dropFirst(4)) }
    }
    return (r, t)
  }
  func readEv() -> [Ev] {
    let e = el("evlog|")
    guard e.exists else { return [] }
    return e.label.components(separatedBy: "|").dropFirst().compactMap { item in
      guard let i = item.firstIndex(of: ":"), let t = Double(item[..<i]) else { return nil }
      return Ev(t: t, name: String(item[item.index(after: i)...]))
    }
  }
  func evString(since t0: Double) -> String {
    readEv().filter { $0.t >= t0 - 20 }.map { "\(Int($0.t - t0)) \($0.name)" }.joined(separator: "; ")
  }
  func counterVal(_ id: String) -> Int? {
    let e = el("\(id):")
    guard e.exists else { return nil }
    return Int(e.label.components(separatedBy: ":").last ?? "")
  }
  /// Taps a counter at its centre and reports whether the touch reached it: "OK" / "DEAD" / "ABSENT".
  func probe(_ id: String) -> String {
    let e = el("\(id):")
    guard e.exists, let before = counterVal(id) else { return "ABSENT" }
    let f = e.frame
    tapNow(mid(f)); pause(0.35)
    guard let after = counterVal(id) else { return "ABSENT" }
    if after == before + 1 { return "OK" }
    // second attempt before calling it dead
    tapNow(mid(f)); pause(0.5)
    let after2 = counterVal(id) ?? -1
    return after2 > before ? "OK_ON_2ND_TAP(\(before)->\(after)->\(after2))" : "DEAD(\(before)->\(after)->\(after2))"
  }
  func showingTab() -> String { ["A", "B", "C"].first { app.staticTexts["TAB \($0)"].exists } ?? "none" }
  func detailLabel() -> String {
    let d = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'DETAIL'")).firstMatch
    return d.exists ? d.label : "none"
  }
  /// Taps a tab-bar item; true when that tab's screen is then on screen.
  func goTab(_ t: String) -> Bool {
    guard let f = tabF[t] else { return false }
    tapNow(mid(f)); pause(0.4)
    let ok = app.staticTexts["TAB \(t)"].exists
    if ok { visited.insert(t) }
    return ok
  }
  func setControl(_ id: String, _ want: String) -> Bool {
    for _ in 0..<9 {
      let e = el("\(id):")
      guard e.exists else { return false }
      if e.label == "\(id):\(want)" { return true }
      tapNow(mid(e.frame)); pause(0.3)
    }
    return el("\(id):").label == "\(id):\(want)"
  }

  // ---------- launch ----------
  func openProject() {
    continueAfterFailure = true
    app.terminate()
    pause(0.5)
    XCUIDevice.shared.system.open(URL(string: "exp://127.0.0.1:\(port)")!)
    let open = springboard.buttons["Open"]
    if open.waitForExistence(timeout: 4) { open.tap() }
    let home = app.staticTexts["TAB A"]
    let ok = home.waitForExistence(timeout: 90)
    pause(2.5)
    // Expo Go opens its developer-menu sheet over the project; a touch on the dimmed backdrop closes it.
    tapNow(CGPoint(x: 195, y: 330)); pause(1.5)
    launches += 1
    visited = ["A"]
    needRelaunch = false
    for t in ["A", "B", "C"] { tabF[t] = el("tab-\(t)").frame }
    rowF = el("rowA").frame
    var pr = probe("cA")
    if !pr.hasPrefix("OK") { tapNow(CGPoint(x: 195, y: 330)); pause(1.5); pr = probe("cA") }
    out("LAUNCH #\(launches) os=\(osTag) TAB A visible=\(ok) tabs A=\(Int(tabF["A"]!.midX)),\(Int(tabF["A"]!.midY)) B=\(Int(tabF["B"]!.midX)),\(Int(tabF["B"]!.midY)) C=\(Int(tabF["C"]!.midX)),\(Int(tabF["C"]!.midY)) row=\(Int(rowF.midX)),\(Int(rowF.midY)) selfcheck(counter responds before any trial)=\(pr) status=\(status())")
    pause(0.5)
  }

  /// Makes sure we are on the tabs screen, tab A. Returns false if that cannot be reached.
  func ensureHomeA() -> Bool {
    if needRelaunch { openProject() }
    if detailLabel() != "none" {
      let b = el("d-back")
      if b.exists { tapNow(mid(b.frame)); pause(1.2) }
    }
    if !app.staticTexts["TAB A"].exists { _ = goTab("A") }
    if detailLabel() != "none" || !app.staticTexts["TAB A"].exists { openProject() }
    return app.staticTexts["TAB A"].exists && detailLabel() == "none"
  }

  /// After a trial: content on the showing tab, then the tab bar, then the other tab's content.
  func checkResponsive(prefer: String, label: String) -> (String, Bool) {
    var notes: [String] = []
    var frozen = false
    if detailLabel() != "none" {
      // a Detail screen is on top: test its counter, then leave with the JS back button
      let pd = probe("cD")
      notes.append("detail(\(detailLabel())) counter=\(pd)")
      if pd.hasPrefix("DEAD") { frozen = true }
      let b = el("d-back")
      if b.exists { tapNow(mid(b.frame)); pause(1.2) }
      notes.append("afterJsBack detail=\(detailLabel())")
      if detailLabel() != "none" { frozen = true }
    }
    let showing = showingTab()
    let p1 = showing == "none" ? "ABSENT" : probe("c\(showing)")
    notes.append("showing=\(showing) content=\(p1)")
    let other = showing == "A" ? prefer : "A"
    let sw = goTab(other)
    let p2 = sw ? probe("c\(other)") : "NOT_SHOWN"
    notes.append("tabBar->\(other)=\(sw ? "OK" : "FAILED") content=\(p2)")
    if p1.hasPrefix("DEAD") || p1 == "ABSENT" || p2.hasPrefix("DEAD") || !sw { frozen = true }
    if frozen {
      shot("FREEZE_\(label)_t0")
      pause(5.0)
      var again: [String] = []
      for t in ["B", "A", "C"] {
        let s = goTab(t)
        again.append("\(t):bar=\(s ? "OK" : "FAILED"),content=\(s ? probe("c\(t)") : "NOT_SHOWN")")
      }
      let progCtl = el("prog:")
      let pl0 = progCtl.exists ? progCtl.label : "absent"
      if progCtl.exists { tapNow(mid(progCtl.frame)); pause(0.4) }
      let pl1 = el("prog:").exists ? el("prog:").label : "absent"
      notes.append("AFTER_5s_AND_TAB_TOGGLES[\(again.joined(separator: " "))] controlOutsideNavigator(\(pl0)->\(pl1))")
      shot("FREEZE_\(label)_t5")
      // let the host-side watcher attach lldb and dump the view hierarchy
      let marker = "\(base)/logs/FREEZE_MARKER_\(osTag)"
      try? label.write(toFile: marker, atomically: true, encoding: .utf8)
      var waited = 0.0
      while FileManager.default.fileExists(atPath: marker) && waited < 150 { pause(1.0); waited += 1 }
      notes.append("heldForDump=\(Int(waited))s")
      needRelaunch = true
    } else if !app.staticTexts["TAB A"].exists {
      _ = goTab("A")
    }
    return (notes.joined(separator: " | "), frozen)
  }

  func popPath(_ pop: String) -> ([NSNumber], String)? {
    switch pop {
    case "back":
      let back = app.navigationBars.buttons["Back"].firstMatch
      guard back.exists else { return nil }
      return (tapPath(mid(back.frame), 0), "nativeBack@\(Int(back.frame.midX)),\(Int(back.frame.midY)) up@40")
    case "js":
      let b = el("d-back")
      guard b.exists else { return nil }
      return (tapPath(mid(b.frame), 0), "jsGoBack@\(Int(b.frame.midX)),\(Int(b.frame.midY)) up@40")
    default:
      return (swipePath(), "edgeSwipe lift@320")
    }
  }

  // ---------- one matrix trial ----------
  /// method "touch": real tab touch `extra` ms after the daemon is free again.  method "prog": JS timer (value = app's prog setting).
  func trial(method: String, pop: String, value: Int, i: Int) {
    let label = "\(method)_\(pop)_\(value)_n\(i)"
    guard ensureHomeA() else { out("TRIAL \(label) os=\(osTag) INVALID could not reach tab A"); needRelaunch = true; return }
    let target = env["VT_TARGET"] ?? (i % 2 == 1 ? "B" : "C")
    let firstVisitB = !visited.contains("B"), firstVisitC = !visited.contains("C")
    tapNow(mid(rowF))
    let det = app.staticTexts["DETAIL from A"]
    guard det.waitForExistence(timeout: 4) else { out("TRIAL \(label) os=\(osTag) INVALID push did not show Detail; status=\(status())"); needRelaunch = true; return }
    pause(1.2)
    guard let (pp, popDesc) = popPath(pop) else { out("TRIAL \(label) os=\(osTag) INVALID pop control not found"); needRelaunch = true; return }
    let t0 = nowMs()
    let r1 = Synth.run([pp])
    let tFree = nowMs()
    var r2 = "-"
    var tTab = 0.0
    if method == "touch" {
      if value > 0 { pause(Double(value) / 1000) }
      tTab = nowMs()
      r2 = Synth.run([tapPath(mid(tabF[target]!), 0)])
    }
    pause(1.5)
    let evs = evString(since: t0)
    let st = status()
    let popped = detailLabel() == "none"
    let showing = showingTab()
    if showing != "none" { visited.insert(showing) }
    let (chk, frozen) = checkResponsive(prefer: target == "A" ? "B" : target, label: label)
    out("TRIAL \(label) os=\(osTag) method=\(method) pop=\(pop) value=\(value) n=\(i) wantTab=\(method == "touch" ? target : "js-picks") firstVisitB=\(firstVisitB) firstVisitC=\(firstVisitC) synth=\(r1)/\(r2) \(popDesc) daemonFree@\(Int(tFree - t0)) tabCall@\(method == "touch" ? String(Int(tTab - t0)) : "-") || popped=\(popped) showing=\(showing) status=\(st.routes)/\(st.tab) || \(chk) || FROZEN=\(frozen) || EV[\(evs)]")
  }

  func testMatrix() {
    let method = env["VT_METHOD"] ?? "touch"
    let pops = (env["VT_POPS"] ?? "back,swipe,js").components(separatedBy: ",")
    let values = (env["VT_VALUES"] ?? (method == "touch" ? "0,70,170,270" : "0,50,100,200,300")).components(separatedBy: ",").compactMap { Int($0) }
    let n = Int(env["VT_TRIALS"] ?? "8") ?? 8
    let relaunchEach = (env["VT_RELAUNCH_EACH"] ?? "").components(separatedBy: ",")
    out("MATRIX start os=\(osTag) method=\(method) pops=\(pops) values=\(values) trials=\(n) relaunchEachTrialFor=\(relaunchEach)")
    for pop in pops {
      for v in values {
        for i in 1...n {
          if i == 1 || relaunchEach.contains(pop) || needRelaunch {
            openProject()
            let okp = setControl("prog", method == "prog" ? String(v) : "-1")
            let okm = setControl("mode", env["VT_MODE"] ?? "pop")
            out("CELL method=\(method) pop=\(pop) value=\(v) trial=\(i) controls prog=\(okp) mode=\(okm) -> \(el("prog:").label) \(el("mode:").label)")
          }
          trial(method: method, pop: pop, value: v, i: i)
        }
      }
    }
    out("MATRIX end os=\(osTag) launches=\(launches)")
  }

  // ---------- stress (a): tap a row that pushes a screen, then a tab ----------
  func testStressA() {
    let method = env["VT_METHOD"] ?? "touch"
    let values = (env["VT_VALUES"] ?? (method == "touch" ? "0,70" : "0,50,100")).components(separatedBy: ",").compactMap { Int($0) }
    let n = Int(env["VT_TRIALS"] ?? "8") ?? 8
    out("STRESS_A start os=\(osTag) method=\(method) values=\(values) trials=\(n)")
    for v in values {
      for i in 1...n {
        if i == 1 || needRelaunch {
          openProject()
          let okp = setControl("prog", method == "prog" ? String(v) : "-1")
          let okm = setControl("mode", "push")
          out("CELL stressA method=\(method) value=\(v) controls prog=\(okp) mode=\(okm) -> \(el("prog:").label) \(el("mode:").label)")
        }
        let label = "stressA_\(method)_\(v)_n\(i)"
        guard ensureHomeA() else { out("STRESSA \(label) INVALID"); needRelaunch = true; continue }
        let target = i % 2 == 1 ? "B" : "C"
        let t0 = nowMs()
        let r1 = Synth.run([tapPath(mid(rowF), 0)])
        let tFree = nowMs()
        var r2 = "-"; var tTab = 0.0
        if method == "touch" {
          if v > 0 { pause(Double(v) / 1000) }
          tTab = nowMs()
          r2 = Synth.run([tapPath(mid(tabF[target]!), 0)])
        }
        pause(1.8)
        let evs = evString(since: t0)
        let st = status()
        let dl = detailLabel(), showing = showingTab()
        if showing != "none" { visited.insert(showing) }
        let (chk, frozen) = checkResponsive(prefer: target, label: label)
        out("STRESSA \(label) os=\(osTag) method=\(method) value=\(v) n=\(i) wantTab=\(method == "touch" ? target : "js-picks") synth=\(r1)/\(r2) rowUp@40 daemonFree@\(Int(tFree - t0)) tabCall@\(method == "touch" ? String(Int(tTab - t0)) : "-") || after: status=\(st.routes)/\(st.tab) detail=\(dl) tabShowing=\(showing) || \(chk) || FROZEN=\(frozen) || EV[\(evs)]")
      }
    }
    out("STRESS_A end os=\(osTag) launches=\(launches)")
  }

  // ---------- stress (b): pop, tab, then a row on the new tab ----------
  func testStressB() {
    let method = env["VT_METHOD"] ?? "touch"   // touch: tab by real touch; prog: tab by JS timer, row by real touch
    let pops = (env["VT_POPS"] ?? "back").components(separatedBy: ",")
    let values = (env["VT_VALUES"] ?? (method == "touch" ? "0" : "50,100,200")).components(separatedBy: ",").compactMap { Int($0) }
    let n = Int(env["VT_TRIALS"] ?? "8") ?? 8
    let relaunchEach = (env["VT_RELAUNCH_EACH"] ?? "").components(separatedBy: ",")
    out("STRESS_B start os=\(osTag) method=\(method) pops=\(pops) values=\(values) trials=\(n) relaunchEachTrialFor=\(relaunchEach)")
    for pop in pops {
      for v in values {
        for i in 1...n {
          if i == 1 || relaunchEach.contains(pop) || needRelaunch {
            openProject()
            let okp = setControl("prog", method == "prog" ? String(v) : "-1")
            let okm = setControl("mode", "pop")
            out("CELL stressB method=\(method) pop=\(pop) value=\(v) controls prog=\(okp) mode=\(okm) -> \(el("prog:").label) \(el("mode:").label)")
          }
          let label = "stressB_\(method)_\(pop)_\(v)_n\(i)"
          guard ensureHomeA() else { out("STRESSB \(label) INVALID"); needRelaunch = true; continue }
          let target = i % 2 == 1 ? "B" : "C"
          tapNow(mid(rowF))
          let det = app.staticTexts["DETAIL from A"]
          guard det.waitForExistence(timeout: 4) else { out("STRESSB \(label) INVALID push did not show Detail"); needRelaunch = true; continue }
          pause(1.2)
          guard let (pp, popDesc) = popPath(pop) else { out("STRESSB \(label) INVALID pop control not found"); needRelaunch = true; continue }
          let t0 = nowMs()
          let r1 = Synth.run([pp])
          var r2 = "-"; var tTab = 0.0
          if method == "touch" {
            tTab = nowMs()
            r2 = Synth.run([tapPath(mid(tabF[target]!), 0)])
          }
          let tRow = nowMs()
          let r3 = Synth.run([tapPath(mid(rowF), 0)])   // the row sits at the same place on every tab
          pause(2.0)
          let evs = evString(since: t0)
          let st = status()
          let dl = detailLabel(), showing = showingTab()
          if showing != "none" { visited.insert(showing) }
          let (chk, frozen) = checkResponsive(prefer: target, label: label)
          out("STRESSB \(label) os=\(osTag) method=\(method) pop=\(pop) value=\(v) n=\(i) wantTab=\(method == "touch" ? target : "js-picks") synth=\(r1)/\(r2)/\(r3) \(popDesc) tabCall@\(method == "touch" ? String(Int(tTab - t0)) : "-") rowCall@\(Int(tRow - t0)) || after: status=\(st.routes)/\(st.tab) detail=\(dl) tabShowing=\(showing) || \(chk) || FROZEN=\(frozen) || EV[\(evs)]")
        }
      }
    }
    out("STRESS_B end os=\(osTag) launches=\(launches)")
  }

  // ---------- recovery: once frozen, does a later push + pop of another screen clear it? ----------
  func testRecovery() {
    let n = Int(env["VT_TRIALS"] ?? "3") ?? 3
    out("RECOVERY start os=\(osTag) trials=\(n)")
    for i in 1...n {
      openProject()
      _ = setControl("prog", "-1"); _ = setControl("mode", "pop")
      tapNow(mid(rowF))
      guard app.staticTexts["DETAIL from A"].waitForExistence(timeout: 4) else { out("RECOVERY n=\(i) INVALID no Detail"); continue }
      pause(1.2)
      guard let (pp, _) = popPath("back") else { out("RECOVERY n=\(i) INVALID no Back"); continue }
      let t0 = nowMs()
      _ = Synth.run([pp]); _ = Synth.run([tapPath(mid(tabF["B"]!), 0)])
      pause(1.5)
      let ev = evString(since: t0)
      let frozenB = probe("cB")
      // strip of the screen below the stale view (y > 743) and above it
      out("RECOVERY n=\(i) os=\(osTag) after Back+tab: showing=\(showingTab()) content=\(frozenB) EV[\(ev)]")
      guard frozenB.hasPrefix("DEAD") else { out("RECOVERY n=\(i) not frozen, nothing to recover"); continue }
      // (1) time alone: 20 s
      pause(20)
      out("RECOVERY n=\(i) after 20 s idle: content=\(probe("cB"))")
      // (2) background + foreground
      XCUIDevice.shared.press(.home); pause(2.0)
      app.activate(); pause(2.5)
      out("RECOVERY n=\(i) after Home + reopen: showing=\(showingTab()) content=\(probe("cB"))")
      // (3) another screen pushed from outside the tab content, then popped with JS back
      let c = el("ctlpush")
      tapNow(mid(c.frame)); pause(1.5)
      let d1 = detailLabel()
      let pd = d1 == "none" ? "NOT_SHOWN" : probe("cD")
      out("RECOVERY n=\(i) push from outside the tabs: detail=\(d1) itsCounter=\(pd)")
      if d1 != "none" {
        let b = el("d-back"); tapNow(mid(b.frame)); pause(1.5)
        out("RECOVERY n=\(i) after popping it with JS back: detail=\(detailLabel()) showing=\(showingTab()) content=\(probe("c\(showingTab())")) tabBar->A=\(goTab("A")) content=\(probe("cA"))")
      }
      shot("recovery_n\(i)_end")
    }
    out("RECOVERY end os=\(osTag)")
  }

  // ---------- native trace: lldb is attached by the host while this test waits, then three pops are run ----------
  func testTrace() {
    openProject()
    _ = setControl("prog", "-1"); _ = setControl("mode", "pop")
    let marker = "\(base)/logs/ATTACH_MARKER_\(osTag)"
    try? "attach".write(toFile: marker, atomically: true, encoding: .utf8)
    var waited = 0.0
    while FileManager.default.fileExists(atPath: marker) && waited < 120 { pause(1.0); waited += 1 }
    out("TRACE lldb attach wait=\(Int(waited))s; counter still responds=\(probe("cA"))")
    for step in (env["VT_STEPS"] ?? "js,back,backtab").components(separatedBy: ",") {
      tapNow(mid(rowF))
      guard app.staticTexts["DETAIL from A"].waitForExistence(timeout: 6) else { out("TRACE \(step) INVALID no Detail"); continue }
      pause(2.0)
      let pop = step == "js" ? "js" : "back"
      guard let (pp, d) = popPath(pop) else { out("TRACE \(step) INVALID no pop control"); continue }
      out("TRACE step=\(step) begins hostClock=\(String(format: "%.3f", nowMs() / 1000))")
      let t0 = nowMs()
      _ = Synth.run([pp])
      if step == "backtab" { _ = Synth.run([tapPath(mid(tabF["B"]!), 0)]) }
      pause(3.0)
      let showing = showingTab()
      out("TRACE step=\(step) \(d) showing=\(showing) content=\(showing == "none" ? "ABSENT" : probe("c\(showing)")) EV[\(evString(since: t0))]")
    }
    pause(2.0)
    out("TRACE end")
  }

  // ---------- diagnostics / controls ----------
  func testDiag() {
    openProject()
    shot("diag_start")
    out("DIAG caps \(Synth.caps()) buttons=\(app.buttons.allElementsBoundByIndex.map { $0.label })")
    out("DIAG set prog 100: \(setControl("prog", "100")) -> \(el("prog:").label); back to -1: \(setControl("prog", "-1")) -> \(el("prog:").label)")
    // control: each pop on its own, nothing else, to measure how long the pop takes
    for pop in ["back", "back", "js", "swipe"] {
      tapNow(mid(rowF)); pause(1.5)
      if pop == "back" { shot("diag_detail") }
      guard let (pp, d) = popPath(pop) else { out("DIAG \(pop): control not found (bars=\(app.navigationBars.count))"); tapNow(mid(el("d-back").frame)); pause(1.2); continue }
      let t0 = nowMs()
      let r = Synth.run([pp]); let tf = nowMs(); pause(1.8)
      out("DIAG pop alone \(pop) \(d) synth=\(r) daemonFree@\(Int(tf - t0)) popped=\(detailLabel() == "none") status=\(status()) EV[\(evString(since: t0))]")
      if detailLabel() != "none" { tapNow(mid(el("d-back").frame)); pause(1.2); out("DIAG recovered with JS back: \(detailLabel() == "none")") }
      out("DIAG after \(pop): tab A content=\(probe("cA")) tabBar->B=\(goTab("B")) content=\(probe("cB")) tabBar->A=\(goTab("A"))")
    }
    shot("diag_end")
  }
}
