import SwiftUI

// Empty host for the UI-test bundle. The tests drive the installed Semora app by
// bundle identifier; this app only exists because a UI-test target needs one.
@main
struct HostApp: App {
  var body: some Scene { WindowGroup { Text("Semora navigation regression runner") } }
}
