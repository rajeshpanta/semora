/**
 * What counts as "the native runtime" for OTA purposes.
 *
 * Semora's runtimeVersion is a fingerprint of the native project, so that two
 * App Store builds whose native code is identical share one runtime and one OTA
 * can reach both. Measured before this file existed, that was not what happened:
 *
 *   1.11 / 55  ->  3d9a15c7...      1.12 / 55  ->  e1bb3cd2...
 *   1.11 / 56  ->  a135520f...      1.12 / 56  ->  03c3bdd8...
 *
 * Four numbers, four runtimes. `version` and `ios.buildNumber` live in app.json
 * and app.json is a fingerprint source, so merely renumbering a build — the one
 * thing every release does, and the one thing that changes no native code at
 * all — minted a brand new runtime that no shipped binary had. That is strictly
 * worse than the appVersion policy this replaced: there, every build of 1.12
 * shared runtime "1.12".
 *
 * ExpoConfigVersions drops version/buildNumber/versionCode from the hash, which
 * is exactly the property we want: renumbering is free, and any real native
 * change — a dependency, a config plugin, a patch, an entitlement — still moves
 * the fingerprint and correctly isolates the new binary.
 *
 * PackageJsonAndroidAndIosScriptsIfNotContainRun is @expo/fingerprint's own
 * default (DEFAULT_SOURCE_SKIPS). Setting sourceSkips REPLACES the default
 * rather than adding to it, so it has to be repeated here or renumbering would
 * be fixed while quietly reintroducing a different source of drift.
 *
 * Skipping a source is a promise that it cannot change behaviour on device.
 * Both entries here are safe under that test: a build number is metadata Apple
 * uses for ordering, and the package.json scripts covered by the default are
 * build-host concerns. Anything that ships code must stay in the hash.
 */
module.exports = {
  sourceSkips: [
    'PackageJsonAndroidAndIosScriptsIfNotContainRun',
    'ExpoConfigVersions',
  ],
};
