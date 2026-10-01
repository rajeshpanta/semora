import XCTest
import ObjectiveC

private let V = (ProcessInfo.processInfo.environment["STANDIN_OUT"] ?? NSTemporaryDirectory()) + "/vmit"

private var quiescenceDisabled = false
private func disableQuiescence() {
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

final class Probe: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "host.exp.Exponent")
  let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
  var udid = ""
  var mode = "base", shape = "normal", script = "cycles", tag = "x", trace = false
  var text = ""
  let t0 = Date()
  var tally: [String: Int] = [:]
  var lastBackPoint: CGPoint? = nil

  func out(_ s: String) {
    let l = String(format: "VR| %7.2f ", Date().timeIntervalSince(t0)) + s
    print(l)
    text += l + "\n"
    try? text.write(toFile: "\(V)/logs/\(tag).log", atomically: true, encoding: .utf8)
  }
  func pause(_ t: TimeInterval) { Thread.sleep(forTimeInterval: t) }
  func shot(_ name: String) {
    let png = XCUIScreen.main.screenshot().pngRepresentation
    do { try png.write(to: URL(fileURLWithPath: "\(V)/shots/\(tag)_\(name).png")) } catch { out("shot write failed \(error)") }
  }
  func bump(_ k: String) { tally[k, default: 0] += 1 }

  // ---- element helpers ---------------------------------------------------------------------
  func el(_ prefix: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
  }
  func exact(_ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
  }
  func pt(_ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y))
  }
  @discardableResult func tap(_ label: String, wait: TimeInterval = 1.2, prefix: Bool = false) -> Bool {
    let e = prefix ? el(label) : exact(label)
    guard e.waitForExistence(timeout: 4) else { out("tap \(label): ELEMENT NOT FOUND"); return false }
    let f = e.frame
    pt(f.midX, f.midY).tap()
    pause(wait)
    return true
  }
  func status() -> String { let e = el("status m="); return e.exists ? e.label : "" }
  func field(_ k: String, _ s: String? = nil) -> String {
    let st = s ?? status()
    for tok in st.split(separator: " ") where tok.hasPrefix("\(k)=") { return String(tok.dropFirst(k.count + 1)) }
    return "?"
  }
  func routes() -> String { field("r") }
  func waitRoutes(not before: String, timeout: TimeInterval) -> String {
    let end = Date().addingTimeInterval(timeout)
    var r = routes()
    while r == before && Date() < end { pause(0.25); r = routes() }
    return r
  }
  func fr(_ f: CGRect) -> String { String(format: "(x=%.1f y=%.1f w=%.1f h=%.1f)", f.minX, f.minY, f.width, f.height) }
  func navBars() -> String {
    let bars = app.navigationBars.allElementsBoundByIndex
    if bars.isEmpty { return "no nav bar in accessibility tree" }
    return bars.map { b in
      let btns = b.buttons.allElementsBoundByIndex.map { "'\($0.label)'\(fr($0.frame))" }
      return "bar['\(b.identifier)'] \(fr(b.frame)) buttons=\(btns)"
    }.joined(separator: " | ")
  }
  var usesJS: Bool { ["A", "A44", "Ap", "A44p", "Ag"].contains(mode) }
  func backEl() -> XCUIElement { usesJS ? exact("js-back") : app.navigationBars.buttons.element(boundBy: 0) }
  func edgeSwipe() {
    let h = app.frame.height
    pt(1, h * 0.55).press(forDuration: 0.05, thenDragTo: pt(app.frame.width * 0.85, h * 0.55), withVelocity: .fast, thenHoldForDuration: 0.0)
  }

  // ---- open the project inside Expo Go and choose the mode ------------------------------------
  func openProject() {
    continueAfterFailure = true
    app.terminate()
    pause(0.5)
    XCUIDevice.shared.system.open(URL(string: "exp://127.0.0.1:8097")!)
    let open = springboard.buttons["Open"]
    if open.waitForExistence(timeout: 4) { open.tap() }
    let home = app.staticTexts["SETUP"]
    var ok = home.waitForExistence(timeout: 90)
    pause(2.5)
    // Expo Go shows its developer-menu sheet (a separate window) on every project open: press Continue.
    let af = app.frame
    pt(af.midX, af.maxY - 75).tap()
    pause(3.0)
    if !ok { ok = home.waitForExistence(timeout: 20) }
    let c0 = el("count:").exists ? el("count:").label : "<absent>"
    var c1 = c0, tries = 0
    while c1 == c0 && tries < 4 { tap("count:", wait: 1.0, prefix: true); c1 = el("count:").exists ? el("count:").label : "<absent>"; tries += 1 }
    out("harness self-check: \(c0) -> \(c1) after \(tries) tap(s) (a synthesized touch reaches the app); SETUP visible=\(ok); screen=\(fr(af))")
    tap("mode-\(mode)", wait: 2.0)
    out("mode chosen: \(status())")
    if trace {
      try? "trace".write(toFile: "\(V)/req/\(udid).req", atomically: true, encoding: .utf8)
      let end = Date().addingTimeInterval(120)
      while !FileManager.default.fileExists(atPath: "\(V)/req/\(udid).done") && Date() < end { pause(0.5) }
      out("lldb trace attached=\(FileManager.default.fileExists(atPath: "\(V)/req/\(udid).done"))")
      pause(1.0)
    }
  }
  var base: String { shape == "dup" ? "Tabs>Tabs" : "Tabs" }
  func makeShape() {
    if shape == "dup" {
      tap("t1-go-detail", wait: 1.5)
      tap("d-replace-tabs", wait: 2.0)
      out("duplicate shape built: \(status())")
    }
    out("START mode=\(mode) shape=\(shape) script=\(script) routes=\(routes()) bars: \(navBars())")
  }

  // ---- one Back action ---------------------------------------------------------------------
  /// Taps the Back control once (centre). Returns WORKED / WORKED_ON_RETRY / DEAD / NO_CONTROL / UNEXPECTED.
  @discardableResult func doBack(_ what: String, expect: String) -> String {
    let before = routes()
    let b = backEl()
    guard b.waitForExistence(timeout: 3) else {
      out("BACK \(what): NO_CONTROL (routes=\(before)) bars: \(navBars())"); bump("NO_CONTROL"); recover(expect); return "NO_CONTROL"
    }
    let f = b.frame
    let lbl = usesJS ? "js-back" : "native '\(b.label)'"
    lastBackPoint = CGPoint(x: f.midX, y: f.midY)
    pt(f.midX, f.midY).tap()
    var r = waitRoutes(not: before, timeout: 2.5)
    var res = ""
    if r == expect { res = "WORKED" }
    else if r != before { res = "UNEXPECTED(\(r))" }
    else {
      var k = 0
      while k < 2 && r == before {
        let b2 = backEl()
        if b2.exists { let f2 = b2.frame; pt(f2.midX, f2.midY).tap() }
        r = waitRoutes(not: before, timeout: 1.5); k += 1
      }
      if r == expect { res = "WORKED_ON_RETRY" } else if r != before { res = "UNEXPECTED(\(r))" } else { res = "DEAD" }
      if res == "DEAD" {
        shot("dead_\(what)")
        edgeSwipe(); pause(1.2)
        let rs = routes()
        out("BACK \(what): control ignored 3 taps; edge swipe -> routes=\(rs) edgeSwipePopped=\(rs == expect)")
        bump(rs == expect ? "DEAD_THEN_SWIPE_OK" : "DEAD_THEN_SWIPE_FAIL")
      }
    }
    pause(0.6)
    out("BACK \(what): control \(lbl) frame=\(fr(f)) \(before) -> expect \(expect) => \(res)")
    bump(res.hasPrefix("UNEXPECTED") ? "UNEXPECTED" : res)
    if routes() != expect { recover(expect) }
    return res
  }
  /// Brings the stack back to `expect` with the in-content JS buttons so the run can continue.
  func recover(_ expect: String) {
    var guardN = 0
    while routes() != expect && guardN < 4 {
      let r = routes()
      if r.hasSuffix(">Deep") { tap("dd-jsback", wait: 1.5) } else if r.hasSuffix(">Detail") { tap("d-jsback", wait: 1.5) } else { break }
      guardN += 1
    }
    out("recover -> routes=\(routes())")
  }
  func push(_ btn: String, expect: String, wait: TimeInterval = 1.3) {
    tap(btn, wait: wait)
    let r = routes()
    if r != expect { out("PUSH \(btn): routes=\(r) expected \(expect)  <-- push did not land") ; bump("PUSH_FAILED") }
  }

  // ---- scripts -----------------------------------------------------------------------------
  func runCycles() {
    let D = base + ">Detail", DD = base + ">Detail>Deep"
    push("t1-go-detail", expect: D); shot("detail"); out("on Detail: bars: \(navBars())")
    doBack("1 Detail->Tabs", expect: base)
    push("t1-go-detail", expect: D); push("d-go-deep", expect: DD); shot("deep"); out("on Deep: bars: \(navBars())")
    doBack("2 Deep->Detail", expect: D)
    doBack("3 Detail->Tabs", expect: base)
    push("t1-go-detail", expect: D)
    doBack("4 Detail->Tabs", expect: base)
    tap("T2, tab", wait: 1.0, prefix: true)
    push("t2-go-detail", expect: D); push("d-go-deep", expect: DD)
    doBack("5 Deep->Detail", expect: D)
    doBack("6 Detail->Tabs", expect: base)
    push("t2-go-detail", expect: D)
    doBack("7 Detail->Tabs", expect: base)
    push("t2-go-detail", expect: D)
    doBack("8 Detail->Tabs", expect: base)
    let eight = tally
    out("EIGHT-CYCLE TALLY: \(eight.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: " "))")
    // edge swipe still works?
    push("t2-go-detail", expect: D)
    edgeSwipe(); pause(1.3)
    var r = routes(); out("EDGE-SWIPE from Detail: routes=\(r) popped=\(r == base)")
    if r != base { recover(base) }
    push("t2-go-detail", expect: D)
    doBack("9 Detail->Tabs (after an edge-swipe pop)", expect: base)
    push("t2-go-detail", expect: D); push("d-go-deep", expect: DD)
    edgeSwipe(); pause(1.3)
    r = routes(); out("EDGE-SWIPE from Deep: routes=\(r) popped=\(r == D)")
    if r != D { recover(D) }
    doBack("10 Detail->Tabs (after an edge-swipe pop from Deep)", expect: base)
    shot("end")
  }

  func tapSeries(_ name: String, _ x: CGFloat, _ y: CGFloat, _ n: Int) {
    var got = 0
    var prev = Int(field("hl")) ?? -1
    for _ in 0..<n {
      pt(x, y).tap(); pause(0.45)
      let now = Int(field("hl")) ?? -1
      if now == prev + 1 { got += 1 }
      prev = now
    }
    out(String(format: "TAPPROBE %@ at (%.1f,%.1f): %d/%d taps reached the JS control", name, x, y, got, n))
  }
  func runTapProbe() {
    let D = base + ">Detail", DD = base + ">Detail>Deep"
    for level in ["Detail", "Deep"] {
      if level == "Detail" { push("t1-go-detail", expect: D) } else { push("d-go-deep", expect: DD) }
      let b = exact("js-back")
      guard b.waitForExistence(timeout: 3) else { out("TAPPROBE \(level): js-back NOT FOUND; bars: \(navBars())"); continue }
      let f = b.frame
      out("TAPPROBE \(level): js-back accessibility frame=\(fr(f)) hittable=\(b.isHittable); bars: \(navBars())")
      shot("tapprobe_\(level)")
      let n = level == "Detail" ? 10 : 5
      tapSeries("\(level) left-edge(+2)", f.minX + 2, f.midY, n)
      tapSeries("\(level) centre", f.midX, f.midY, n)
      tapSeries("\(level) right-edge(-2)", f.maxX - 2, f.midY, n)
      tapSeries("\(level) top-edge(+2)", f.midX, f.minY + 2, n)
      tapSeries("\(level) bottom-edge(-2)", f.midX, f.maxY - 2, n)
      tapSeries("\(level) hitSlop left(-8)", f.minX - 8, f.midY, 5)
      tapSeries("\(level) hitSlop right(+8)", f.maxX + 8, f.midY, 5)
      tapSeries("\(level) hitSlop below(+8)", f.midX, f.maxY + 8, 5)
      tapSeries("\(level) hitSlop above(-8)", f.midX, f.minY - 8, 5)
      tapSeries("\(level) outside right(+30)", f.maxX + 30, f.midY, 3)
    }
  }

  func runSoak() {
    disableQuiescence()
    let D = base + ">Detail", DD = base + ">Detail>Deep"
    // learn the Back control position
    push("t1-go-detail", expect: D); doBack("warm-up Detail", expect: base)
    for i in 1...30 {
      let t = ((i - 1) / 6) % 2 == 0 ? "t1" : "t2"
      if (i - 1) % 6 == 0 { tap(t == "t1" ? "T1, tab" : "T2, tab", wait: 0.8, prefix: true) }
      let go = "\(t)-go-detail"
      let kind = (i - 1) % 6
      switch kind {
      case 0:
        push(go, expect: D); doBack("soak\(i) normal Detail", expect: base)
      case 1, 5:
        // rapid: Back tapped ~0.2 s (kind 1) or ~0.6 s (kind 5, right as the push animation ends) after the push tap, by raw coordinate
        let delay = kind == 1 ? 0.2 : 0.6
        let g = exact(go)
        guard g.waitForExistence(timeout: 3), let bp = lastBackPoint else { out("soak\(i) rapid: setup missing"); bump("SOAK_SETUP_MISSING"); continue }
        let gf = g.frame
        let ta = Date(); pt(gf.midX, gf.midY).tap(); let tb = Date()
        pause(delay)
        let tc = Date(); pt(bp.x, bp.y).tap(); let td = Date()
        pause(2.2)
        let r = routes()
        let name = kind == 1 ? "RAPID02" : "RAPID06"
        out(String(format: "soak%d %@: push tap took %.0f ms; Back tap began %.0f ms after the push tap began and took %.0f ms => routes=%@ %@", i, name, tb.timeIntervalSince(ta) * 1000, tc.timeIntervalSince(ta) * 1000, td.timeIntervalSince(tc) * 1000, r, r == base ? "POPPED" : (r == D ? "EARLY_TAP_IGNORED" : "OTHER")))
        bump(r == base ? "\(name)_POPPED" : (r == D ? "\(name)_IGNORED" : "\(name)_OTHER"))
        if r == D { doBack("soak\(i) normal Back after ignored rapid tap", expect: base) } else if r != base { recover(base) }
      case 2:
        push(go, expect: D); push("d-go-deep", expect: DD)
        doBack("soak\(i) Deep->Detail", expect: D); doBack("soak\(i) Detail->Tabs", expect: base)
      case 3:
        // double tap on the control at the second level: must pop exactly one screen
        push(go, expect: D); push("d-go-deep", expect: DD)
        let b = backEl()
        guard b.waitForExistence(timeout: 3) else { out("soak\(i) dbl-deep: NO_CONTROL"); bump("NO_CONTROL"); recover(base); continue }
        let f = b.frame
        pt(f.midX, f.midY).doubleTap(); pause(2.2)
        let r = routes()
        out("soak\(i) DOUBLE-TAP on Deep: routes=\(r) => \(r == D ? "ONE_POP" : (r == base ? "DOUBLE_POP" : (r == DD ? "IGNORED" : "OTHER")))")
        bump(r == D ? "DBL_DEEP_ONE_POP" : (r == base ? "DBL_DEEP_DOUBLE_POP" : (r == DD ? "DBL_DEEP_IGNORED" : "DBL_DEEP_OTHER")))
        if r == DD { doBack("soak\(i) after ignored double tap Deep->Detail", expect: D) }
        if routes() == D { doBack("soak\(i) Detail->Tabs", expect: base) } else { recover(base) }
      default:
        // double tap on the control at the first level
        push(go, expect: D)
        let b = backEl()
        guard b.waitForExistence(timeout: 3) else { out("soak\(i) dbl-detail: NO_CONTROL"); bump("NO_CONTROL"); recover(base); continue }
        let f = b.frame
        pt(f.midX, f.midY).doubleTap(); pause(2.2)
        let r = routes()
        out("soak\(i) DOUBLE-TAP on Detail: routes=\(r) => \(r == base ? "ONE_POP" : (r == D ? "IGNORED" : "OVER_POP_OR_OTHER"))")
        bump(r == base ? "DBL_DETAIL_ONE_POP" : (r == D ? "DBL_DETAIL_IGNORED" : "DBL_DETAIL_OTHER"))
        if r == D { doBack("soak\(i) after ignored double tap", expect: base) } else if r != base {
          out("soak\(i): stack is now \(r); rebuilding shape")
          if shape == "dup" && r == "Tabs" { tap("t1-go-detail", wait: 1.5); tap("d-replace-tabs", wait: 2.0) }
        }
      }
    }
    shot("soak_end")
  }

  func runSwipes() {
    let D = base + ">Detail", DD = base + ">Detail>Deep"
    var ok = 0, fail = 0
    func swipe(_ what: String, _ expect: String) {
      edgeSwipe(); pause(1.3)
      let r = routes()
      if r == expect { ok += 1 } else { fail += 1; out("SWIPE \(what): routes=\(r) expected \(expect) => NOT POPPED"); recover(expect) }
    }
    for i in 1...10 { push("t1-go-detail", expect: D); swipe("\(i) Detail->Tabs", base) }
    for i in 1...5 { push("t1-go-detail", expect: D); push("d-go-deep", expect: DD); swipe("\(i) Deep->Detail", D); swipe("\(i) Detail->Tabs after Deep", base) }
    out("SWIPES mode=\(mode) shape=\(shape): edge-swipe pops that worked \(ok)/\(ok + fail)")
    // and the Back control still works afterwards
    push("t1-go-detail", expect: D); doBack("after 20 swipes", expect: base)
  }

  func runModal() {
    let D = base + ">Detail", M = base + ">NewCourse", DM = base + ">Detail>NewCourse"
    func swipeDown() {
      let w = app.frame.width
      var y: CGFloat = 110
      for b in app.navigationBars.allElementsBoundByIndex where b.identifier == "New Course" { y = b.frame.midY }
      pt(w / 2, y).press(forDuration: 0.05, thenDragTo: pt(w / 2, y + 650), withVelocity: .fast, thenHoldForDuration: 0.0)
      pause(1.5)
    }
    // modal opened from the tabs, closed by its own button
    push("t1-go-modal", expect: M); out("MODAL from Tabs: bars: \(navBars()) ; js-back present in modal header=\(exact("js-back").exists)"); shot("modal_from_tabs")
    tap("m-close", wait: 1.5); out("MODAL closed by button: routes=\(routes())")
    measure("after-modal-close")
    push("t1-go-detail", expect: D); doBack("m1 after modal(button close)", expect: base)
    // modal opened from the tabs, closed by swipe-down
    push("t1-go-modal", expect: M); swipeDown(); out("MODAL closed by swipe-down: routes=\(routes())"); if routes() != base { tap("m-close", wait: 1.5) }
    push("t1-go-detail", expect: D); doBack("m2 after modal(swipe close)", expect: base)
    // modal opened from a pushed screen
    push("t1-go-detail", expect: D); push("d-go-modal", expect: DM); out("MODAL from Detail: bars: \(navBars()) ; js-back present=\(exact("js-back").exists)"); shot("modal_from_detail")
    tap("m-close", wait: 1.5); out("MODAL closed by button: routes=\(routes())")
    doBack("m3 Detail->Tabs after modal(button close)", expect: base)
    push("t1-go-detail", expect: D); doBack("m4 next Detail->Tabs", expect: base)
    push("t1-go-detail", expect: D); push("d-go-modal", expect: DM); swipeDown(); out("MODAL closed by swipe-down: routes=\(routes())"); if routes() != D { tap("m-close", wait: 1.5) }
    doBack("m5 Detail->Tabs after modal(swipe close)", expect: base)
    push("t1-go-detail", expect: D); doBack("m6 next Detail->Tabs", expect: base)
    measure("end")
  }

  func measure(_ when: String) {
    var parts: [String] = []
    for id in ["t1-title", "t1-count", "t1-go-detail", "t1-top", "t1-sav", "t1-scr"] {
      let e = el(id)
      parts.append(e.exists ? "\(e.label) \(fr(e.frame))" : "\(id) <absent>")
    }
    out("DCOST \(when): \(parts.joined(separator: " ; "))")
    out("DCOST \(when): bars: \(navBars())")
    let before = el("t1-top:").exists ? el("t1-top:").label : "<absent>"
    var f = CGRect.zero
    if el("t1-top:").exists { f = el("t1-top:").frame }
    for _ in 0..<5 { pt(f.midX, f.midY).tap(); pause(0.4) }
    let after = el("t1-top:").exists ? el("t1-top:").label : "<absent>"
    out("DCOST \(when): 5 taps on the button inside the bar band \(fr(f)): \(before) -> \(after)")
    shot("dcost_\(when)")
  }
  func runDCost() {
    measure("initial")
    let D = base + ">Detail"
    push("t1-go-detail", expect: D)
    out("DCOST on Detail: bars: \(navBars())"); shot("dcost_detail")
    doBack("dcost Detail->Tabs", expect: base)
    pause(1.0)
    measure("after-return")
    push("t1-go-detail", expect: D)
    edgeSwipe(); pause(1.5)
    out("DCOST edge swipe: routes=\(routes())")
    if routes() != base { recover(base) }
    measure("after-swipe-return")
  }
  func runHold() {
    // leave the app parked on Deep (pushed twice, one Back tap done) so the view tree can be dumped with lldb afterwards
    let D = base + ">Detail", DD = base + ">Detail>Deep"
    push("t1-go-detail", expect: D)
    doBack("hold 1", expect: base)
    push("t1-go-detail", expect: D)
    if script == "hold2" { push("d-go-deep", expect: DD) }
    out("HOLD: parked at routes=\(routes()) bars: \(navBars())")
    shot("hold")
  }

  func testProbe() {
    udid = ProcessInfo.processInfo.environment["SIMULATOR_UDID"] ?? "unknown"
    let cfg = ((try? String(contentsOfFile: "\(V)/cfg/\(udid).txt", encoding: .utf8)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ").map(String.init)
    if cfg.count >= 4 { mode = cfg[0]; shape = cfg[1]; script = cfg[2]; tag = cfg[3]; trace = cfg.count > 4 && cfg[4] == "trace" }
    out("CONFIG udid=\(udid) mode=\(mode) shape=\(shape) script=\(script) tag=\(tag) trace=\(trace) os=\(UIDevice.current.systemVersion)")
    openProject()
    makeShape()
    switch script {
    case "cycles": runCycles()
    case "tapprobe": runTapProbe()
    case "soak": runSoak()
    case "swipes": runSwipes()
    case "modal": runModal()
    case "dcost": runDCost()
    case "hold", "hold2": runHold()
    default: out("unknown script \(script)")
    }
    out("FINAL TALLY mode=\(mode) shape=\(shape) script=\(script): \(tally.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: " ")) ; final routes=\(routes())")
    try? "stop".write(toFile: "\(V)/req/\(udid).stop", atomically: true, encoding: .utf8)
  }
}
