/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'watch',

  // No spaces, matching targets/widget: EAS registers credentials under the
  // sanitized name but matches the Xcode target by its literal name, and a
  // space between the two made signing assignment fail with "Could not find
  // target ... in project.pbxproj". The user-visible name comes from
  // displayName below, so nothing is lost by keeping this identifier-safe.
  name: 'SemoraWatch',
  displayName: 'Semora',

  // Leading dot means "append to the host app's identifier" (see the bundleId
  // derivation in @bacons/apple-targets/build/with-widget.js). Written
  // explicitly rather than left to the default: the plugin would otherwise
  // derive `...syllabussnap.watch`, and Apple's convention for a WatchKit app
  // embedded in an iOS app is `.watchkitapp`. The plugin separately wires
  // INFOPLIST_KEY_WKCompanionAppBundleIdentifier to the host app, so the pair
  // is what makes the Watch app find its phone.
  bundleIdentifier: '.watchkitapp',

  // 10.0, not the plugin's 11.0 default. watchOS 11 requires Series 6 or
  // later; 10.0 reaches Series 4 and up, which is a materially larger install
  // base for a companion app whose whole job is glanceability. Nothing in the
  // planned MVP — a list, two counts, and later a WidgetKit complication —
  // needs an API newer than watchOS 10.
  deploymentTarget: '10.0',

  // The Watch app's own icon.
  //
  // Not optional the way the widget's is: Apple's delivery service refuses the
  // whole package without it —
  //
  //   90713  A value for the Info.plist key 'CFBundleIconName' is missing in
  //          the bundle com.rajeshpanta.syllabussnap.watchkitapp
  //   90391  No icons found for watch application Semora.app/Watch/SemoraWatch.app
  //
  // — and neither error surfaces during archive or export, only on upload. A
  // WidgetKit extension has no icon because it never appears on a Home Screen;
  // a WatchKit app does, so it needs one.
  //
  // Reusing the phone app's 1024px icon rather than drawing a watch-specific
  // one: watchOS masks it to a circle, the artwork is already centred, and one
  // source means the two can never drift. The path is resolved relative to this
  // file (see props.icon handling in @bacons/apple-targets/build/with-widget.js).
  icon: '../../assets/images/icon.png',

  // The App Group the complication reads.
  //
  // Phase 1 deliberately shipped this target with no entitlements, on the
  // reasoning that a group buys nothing until something else on the watch needs
  // to read what this app knows. targets/watch-widget is that something: a
  // WidgetKit extension runs in its own process and cannot hold a WCSession, so
  // the only way it sees a snapshot is through a shared container.
  //
  // Reusing the identifier the iPhone app and its widget already use, rather
  // than minting a watch-specific one, because a group identifier is just a
  // name — the CONTAINER it resolves to is per-device. Nothing the phone writes
  // is visible here and nothing written here reaches the phone; the snapshot
  // still arrives only over WatchConnectivity. Reusing the name means no new
  // group has to be registered, only the capability added to two App IDs.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.rajeshpanta.syllabussnap'],
  },
};
