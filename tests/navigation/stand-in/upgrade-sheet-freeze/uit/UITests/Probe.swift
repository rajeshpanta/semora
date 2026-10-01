import XCTest

final class Probe: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "host.exp.Exponent")
  let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
  let shots = (ProcessInfo.processInfo.environment["STANDIN_OUT"] ?? NSTemporaryDirectory()) + "/vmodal/shots"

  func out(_ s: String) { print("VR| \(s)"); NSLog("VR| %@", s) }
  func pause(_ t: TimeInterval) { Thread.sleep(forTimeInterval: t) }

  func shot(_ name: String) {
    let png = XCUIScreen.main.screenshot().pngRepresentation
    do { try png.write(to: URL(fileURLWithPath: "\(shots)/\(name).png")) } catch { out("shot write failed \(error)") }
  }

  func openProject() {
    continueAfterFailure = true
    app.terminate()
    pause(0.5)
    XCUIDevice.shared.system.open(URL(string: "exp://127.0.0.1:8097")!)
    let open = springboard.buttons["Open"]
    if open.waitForExistence(timeout: 4) { open.tap() }
    let home = app.staticTexts["HOME"]
    var ok = home.waitForExistence(timeout: 60)
    // Expo Go shows its developer-menu sheet (a separate window) on every project open: press Continue.
    pause(2.5)
    let af = app.frame
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: af.midX, dy: af.maxY - 75)).tap()
    pause(3.0)
    if !ok { ok = home.waitForExistence(timeout: 20) }
    let c0 = counter("count")
    let cf = el("count:").frame
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: cf.midX, dy: cf.midY)).tap(); pause(0.8)
    out("harness self-check: count \(c0) -> \(counter("count")) (touches reach the app before the test starts)")
    out("project open, HOME visible=\(ok)")
    pause(1.0)
  }

  func el(_ prefix: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
  }
  func has(_ text: String) -> Bool { app.staticTexts[text].exists }

  /// Synthesizes a real touch at the element's centre, whatever is on top of it.
  @discardableResult func tap(_ prefix: String, wait: TimeInterval = 1.2) -> Bool {
    let e = el(prefix)
    guard e.waitForExistence(timeout: 3) else { out("tap \(prefix): ELEMENT NOT FOUND"); return false }
    let f = e.frame
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: f.midX, dy: f.midY)).tap()
    out("tap \(prefix) at (\(Int(f.midX)),\(Int(f.midY)))")
    pause(wait)
    return true
  }
  func tapPoint(_ x: CGFloat, _ y: CGFloat, _ why: String, wait: TimeInterval = 1.2) {
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y)).tap()
    out("tap point (\(Int(x)),\(Int(y))) \(why)")
    pause(wait)
  }
  func counter(_ id: String) -> String { let e = el("\(id):"); return e.exists ? e.label : "<absent>" }
  /// Taps a counter and reports whether the touch reached it.
  func probeCounter(_ id: String, _ tag: String) {
    let before = counter(id)
    tap("\(id):", wait: 0.8)
    let after = counter(id)
    out("\(tag): counter \(before) -> \(after)  TOUCH_REACHED=\(before != after && after != "<absent>")")
  }
  func status() -> String { let e = el("status"); return e.exists ? e.label : "<no status>" }
  func navBars() -> String {
    let bars = app.navigationBars.allElementsBoundByIndex
    return bars.map { b in
      let btns = b.buttons.allElementsBoundByIndex.map { "\($0.label)@\(Int($0.frame.minX)),\(Int($0.frame.minY)),\(Int($0.frame.width))x\(Int($0.frame.height))" }
      return "bar[\(b.identifier)] frame=\(Int(b.frame.minX)),\(Int(b.frame.minY)),\(Int(b.frame.width))x\(Int(b.frame.height)) buttons=\(btns)"
    }.joined(separator: " | ")
  }
  func tapNativeBack(_ tag: String) {
    let back = app.navigationBars.buttons["Back"].firstMatch
    if back.exists {
      let f = back.frame
      tapPoint(f.midX, f.midY, "native Back (\(tag)) frame=\(f)")
    } else {
      out("\(tag): no native Back button in accessibility tree; bars: \(navBars())")
    }
  }

  func testT0_diag() {
    openProject()
    shot("T0_start")
    for i in 0..<3 {
      let c = el("count:")
      out("diag[\(i)]: count exists=\(c.exists) hittable=\(c.isHittable) label=\(c.exists ? c.label : "-")")
      c.tap(); pause(1.0)
      out("diag[\(i)]: after element.tap(): \(counter("count"))")
      tapPoint(200, 170, "count by coordinate")
      out("diag[\(i)]: after coordinate tap: \(counter("count"))")
      app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 200, dy: 170)).press(forDuration: 0.3); pause(1.0)
      out("diag[\(i)]: after 0.3s press: \(counter("count"))")
    }
    shot("T0_end")
  }

  // ---- control: modal opened and closed, no wall ------------------------------------------
  func testT1_control() {
    openProject()
    tap("go-detail"); out("bars: \(navBars())")
    tap("d-go-modal"); out("modal visible=\(has("NEW COURSE FORM")) bars: \(navBars())")
    shot("T1_modal")
    tap("close-modal", wait: 1.5)
    probeCounter("count2", "T1 after closing modal (no wall)")
    tapNativeBack("T1")
    out("T1 result: after native Back, HOME visible=\(has("HOME")) DETAIL visible=\(has("DETAIL"))")
  }

  // ---- A: wall tapped inside a modal screen, reached from a card screen with native Back ---
  func testT2_wallThenBack() {
    openProject()
    tap("go-detail")
    tap("d-go-modal")
    tap("wall", wait: 2.5)
    out("T2: after wall tap inside modal: ROOT SHEET visible=\(has("ROOT SHEET")) form visible=\(has("NEW COURSE FORM"))")
    shot("T2_after_wall")
    probeCounter("count3", "T2 inside the modal after the failed wall")
    tap("close-modal", wait: 2.0)
    out("T2: modal closed: form visible=\(has("NEW COURSE FORM")) DETAIL visible=\(has("DETAIL")) ROOT SHEET visible=\(has("ROOT SHEET")) \(status())")
    shot("T2_after_close")
    probeCounter("count2", "T2 on Detail after closing the modal")
    tapNativeBack("T2")
    out("T2 result: after native Back tap, HOME visible=\(has("HOME")) DETAIL visible=\(has("DETAIL"))")
    tap("d-back")
    out("T2 result: after JS back button tap, HOME visible=\(has("HOME")) DETAIL visible=\(has("DETAIL"))")
    // edge-swipe back
    let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 2, dy: 400))
    let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 300, dy: 400))
    start.press(forDuration: 0.05, thenDragTo: end); pause(1.2)
    out("T2 result: after edge swipe, HOME visible=\(has("HOME")) DETAIL visible=\(has("DETAIL"))")
    shot("T2_end")
  }

  // ---- A: the production path: New Course opened from the tabs, closed by swipe-down -------
  func testT3_wallFromHomeSwipeClose() {
    openProject()
    probeCounter("count", "T3 baseline on Home")
    tap("go-modal")
    tap("wall", wait: 2.5)
    out("T3: after wall tap inside modal: ROOT SHEET visible=\(has("ROOT SHEET"))")
    // swipe the sheet down by its header
    let bar = app.navigationBars.firstMatch
    let y = bar.exists ? bar.frame.midY : 90
    let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 200, dy: y))
    let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 200, dy: y + 600))
    start.press(forDuration: 0.05, thenDragTo: end); pause(2.0)
    out("T3: after swipe-down: form visible=\(has("NEW COURSE FORM")) HOME visible=\(has("HOME")) \(status())")
    shot("T3_after_swipe")
    probeCounter("count", "T3 on Home after closing the modal")
    tap("go-detail")
    out("T3 result: go-detail tapped: DETAIL visible=\(has("DETAIL"))")
    tap("root-sheet", wait: 2.0)
    out("T3 result: later wall from a card context: ROOT SHEET visible=\(has("ROOT SHEET"))")
  }

  // ---- A control: wall from a card screen works and closes ---------------------------------
  func testT3b_wallFromCard() {
    openProject()
    tap("root-sheet", wait: 2.0)
    out("T3b: ROOT SHEET visible=\(has("ROOT SHEET")) \(status())")
    tap("sheet-close", wait: 1.5)
    probeCounter("count", "T3b after closing a normally presented sheet")
  }

  // ---- B: card route pushed while a modal screen is on top ---------------------------------
  func testT4_cardOverModal() {
    openProject()
    tap("go-modal")
    out("T4: modal bars: \(navBars())")
    tap("push-card", wait: 2.0)
    out("T4: after push-card: DETAIL visible=\(has("DETAIL")) form visible=\(has("NEW COURSE FORM")) bars: \(navBars())")
    shot("T4_card_over_modal")
    let d = el("count2:")
    out("T4: count2 frame=\(d.exists ? "\(d.frame)" : "absent")")
    probeCounter("count2", "T4 on the pushed screen")
    tap("d-back", wait: 1.5)
    out("T4: after JS back: DETAIL visible=\(has("DETAIL")) form visible=\(has("NEW COURSE FORM"))")
  }

  // ---- D: close one Modal and open a sibling Modal in the same tick ------------------------
  func testT5_handoff() {
    openProject()
    tap("menu")
    out("T5: MENU visible=\(has("MENU"))")
    tap("menu-handoff", wait: 2.0)
    out("T5: after handoff: SIBLING SHEET visible=\(has("SIBLING SHEET")) MENU visible=\(has("MENU"))")
    shot("T5_handoff")
    if has("SIBLING SHEET") { tap("sibling-close", wait: 1.5) }
    probeCounter("count", "T5 on Home afterwards")
    tap("menu"); out("T5: menu reopens=\(has("MENU"))")
  }

  // ---- D: close a Modal and push a modal screen in the same tick ---------------------------
  func testT6_menuGoModal() {
    openProject()
    for i in 1...3 {
      tap("menu")
      tap("menu-go-modal", wait: 2.0)
      out("T6[\(i)]: form visible=\(has("NEW COURSE FORM")) MENU visible=\(has("MENU"))")
      tap("close-modal", wait: 1.5)
      probeCounter("count", "T6[\(i)] on Home afterwards")
    }
    tap("menu"); tap("menu-go-detail", wait: 1.5)
    out("T6: menu-go-detail: DETAIL visible=\(has("DETAIL")) bars: \(navBars())")
    tapNativeBack("T6")
    out("T6 result: after native Back, HOME visible=\(has("HOME"))")
  }

  // ---- D: root sheet from a card context, Continue -> fullScreenModal ----------------------
  func testT7_sheetContinue() {
    openProject()
    for i in 1...3 {
      tap("root-sheet", wait: 1.5)
      tap("sheet-continue", wait: 2.0)
      out("T7[\(i)]: PAYWALL visible=\(has("PAYWALL")) ROOT SHEET visible=\(has("ROOT SHEET"))")
      tap("paywall-close", wait: 1.5)
      probeCounter("count", "T7[\(i)] on Home afterwards")
    }
  }

  // ---- D: upload.tsx shape: sheet inside a modal screen; close + pop in one tick -----------
  func testT8_ownClosePop() {
    openProject()
    for i in 1...3 {
      tap("go-modal")
      tap("own-sheet", wait: 1.5)
      out("T8[\(i)]: OWN SHEET visible=\(has("OWN SHEET"))")
      tap("own-close-pop", wait: 2.0)
      out("T8[\(i)]: after close+pop: form visible=\(has("NEW COURSE FORM")) OWN SHEET visible=\(has("OWN SHEET")) HOME visible=\(has("HOME"))")
      probeCounter("count", "T8[\(i)] on Home afterwards")
    }
    tap("go-modal"); tap("own-sheet", wait: 1.5)
    tap("own-close-pop-paywall", wait: 2.5)
    out("T8: close+pop+paywall: PAYWALL visible=\(has("PAYWALL")) form visible=\(has("NEW COURSE FORM"))")
    shot("T8_paywall")
    tap("paywall-close", wait: 1.5)
    probeCounter("count", "T8 after paywall closed")
    tap("go-modal"); out("T8 result: a modal screen still opens afterwards=\(has("NEW COURSE FORM"))")
  }

  // ---- D: a timer opens a Modal while another Modal is up (not closing) --------------------
  func testT9_lateTimer() {
    openProject()
    tap("menu-then-late", wait: 3.0)
    out("T9: after timer: LATE SHEET visible=\(has("LATE SHEET")) MENU visible=\(has("MENU"))")
    shot("T9_late")
    tap("menu-close", wait: 2.0)
    out("T9: menu closed: LATE SHEET visible=\(has("LATE SHEET")) MENU visible=\(has("MENU")) HOME visible=\(has("HOME"))")
    probeCounter("count", "T9 on Home after the menu closed")
    shot("T9_end")
  }

  // ---- E: natural pill widths, measured by React Native itself ------------------------------
  func testT12_pills() {
    openProject()
    tap("go-pills", wait: 2.5)
    out("T12 bars: \(navBars())")
    out("T12 \(el("pills").exists ? el("pills").label : "<no pills>")")
    shot("T12_pills")
  }

  // ---- new: an RN Modal is UP (presented) and a modal screen is pushed without closing it ----
  func testT10_modalUpThenModalScreen() {
    openProject()
    tap("late-then-modal", wait: 4.5)
    out("T10: LATE SHEET visible=\(has("LATE SHEET")) form visible=\(has("NEW COURSE FORM"))")
    shot("T10_a")
    if has("NEW COURSE FORM") { tap("close-modal", wait: 2.0) }
    out("T10: after closing the modal screen: LATE SHEET visible=\(has("LATE SHEET")) HOME visible=\(has("HOME"))")
    probeCounter("count", "T10 on Home afterwards")
    shot("T10_b")
  }
  func testT11_rootSheetUpThenModalScreen() {
    openProject()
    tap("root-then-modal", wait: 4.5)
    out("T11: ROOT SHEET visible=\(has("ROOT SHEET")) form visible=\(has("NEW COURSE FORM")) \(status())")
    if has("NEW COURSE FORM") { tap("close-modal", wait: 2.0) }
    out("T11: after closing the modal screen: ROOT SHEET visible=\(has("ROOT SHEET")) HOME visible=\(has("HOME")) \(status())")
    probeCounter("count", "T11 on Home afterwards")
  }

  // ---- D: an Alert button pops the modal screen it sits on (upload.tsx "Pick Another") -------
  func testT13_alertBack() {
    openProject()
    for i in 1...3 {
      tap("go-modal")
      tap("alert-back", wait: 1.5)
      let b = app.alerts.buttons["Pick Another"]
      out("T13[\(i)]: alert button exists=\(b.exists)")
      if b.exists { b.tap() }
      pause(2.0)
      out("T13[\(i)]: after Pick Another: form visible=\(has("NEW COURSE FORM")) HOME visible=\(has("HOME")) alerts=\(app.alerts.count)")
      probeCounter("count", "T13[\(i)] on Home afterwards")
    }
    tap("go-modal")
    tap("alert-open", wait: 1.5)
    let o = app.alerts.buttons["Open it"]
    if o.exists { o.tap() }
    pause(2.0)
    out("T13: after Open it: DETAIL visible=\(has("DETAIL")) bars: \(navBars())")
    shot("T13_open_it")
  }
}
