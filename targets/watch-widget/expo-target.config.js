/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  // A watchOS WidgetKit extension. @bacons/apple-targets embeds this in the
  // WATCH app target rather than the iPhone app (see with-xcode-changes.js,
  // which looks up isWatchOSTarget() for the embed phase) — which is the
  // relationship watchOS requires: iPhone app → Watch app → widget extension.
  type: 'watch-widget',

  // No spaces, for the same reason targets/widget has none: EAS registers
  // credentials under the sanitized name but matches the Xcode target by its
  // literal name.
  name: 'SemoraWatchComplication',
  displayName: 'Semora',

  // Leading dot appends to the host identifier. Apple requires an extension's
  // identifier to be prefixed by its containing app's, so this must sit under
  // .watchkitapp — the Watch app — not beside it.
  // .widget, not .complication.
  //
  // Apple refused to register …watchkitapp.complication — "cannot be registered
  // to your development team because it is not available" — even though no such
  // identifier exists on this team. The portal appears to reserve that suffix
  // under a .watchkitapp identifier. The name has no functional meaning; what
  // matters is only that an extension's identifier is prefixed by its
  // containing app's, so this mirrors the iPhone widget's .widget suffix.
  bundleIdentifier: '.watchkitapp.widget',

  // Matches targets/watch. Accessory widget families arrived in watchOS 9, so
  // 10.0 is comfortably inside what this needs.
  deploymentTarget: '10.0',

  // The complication runs in its own process and cannot hold a WCSession, so
  // the Watch app hands it data through the shared group container. This is
  // the SAME group identifier the iPhone app and its home-screen widget use —
  // already registered, so no new group has to be created. The container it
  // resolves to is per-device, so nothing crosses between phone and watch here;
  // the phone's data still arrives only over WatchConnectivity.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.rajeshpanta.syllabussnap'],
  },

  colors: {
    $accent: '#6B46C1',
  },
};
