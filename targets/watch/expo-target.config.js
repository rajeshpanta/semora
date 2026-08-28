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

  // Deliberately NO entitlements in this phase.
  //
  // An App Group would have to be enabled on a brand-new App ID before this
  // could sign, and it would buy nothing yet: App Groups are shared between an
  // app and its extensions ON ONE DEVICE, so the group the iPhone widget uses
  // cannot carry data to a separate Watch. The Watch gets its data over
  // WatchConnectivity in a later phase; if the complication later needs to
  // share with the Watch app, the group added then is a watch-side one.
};
