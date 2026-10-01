import XCTest

// One test, driven by a scenario file:
//   NAVGATE_SCENARIO  absolute path of a .nav file (tests/navigation/ios/scenarios)
//   NAVGATE_OUT       output folder (screenshots, probe handshake, summary.json)
// tools/run.sh sets both (as TEST_RUNNER_* variables) and runs the native probe.
final class NavGateTests: XCTestCase {
  func testScenario() throws {
    continueAfterFailure = true
    disableQuiescence()
    let env = ProcessInfo.processInfo.environment
    guard let path = env["NAVGATE_SCENARIO"], let out = env["NAVGATE_OUT"] else {
      XCTFail("NAVGATE_SCENARIO and NAVGATE_OUT must be set (use tests/navigation/ios/tools/run.sh)")
      return
    }
    let script = try String(contentsOfFile: path, encoding: .utf8)
    let d = SemoraDriver(outDir: out)
    d.log("BEGIN \(path)")
    defer { d.writeSummary(scenario: path) }
    for line in script.split(separator: "\n", omittingEmptySubsequences: false) {
      try d.run(String(line))
    }
    d.log("END counters=\(d.counters) values=\(d.values)")
    for f in d.failures { XCTFail(f) }
  }
}
