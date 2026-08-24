const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Stop `lintVitalRelease` failing on iOS permission strings.
 *
 * app.json maps `locales.es -> ./locales/es.json`, which holds the eight iOS
 * Info.plist permission descriptions (NSCameraUsageDescription and friends).
 * Expo mirrors that file into the ANDROID resource tree as
 * res/values-b+es/strings.xml, where those keys mean nothing at all — Android
 * permission rationale is not sourced from string resources with those names.
 *
 * Because they exist only in the Spanish folder and never in the default one,
 * lint raises ExtraTranslation ("translated here but not found in default
 * locale") eight times, and `lintVitalRelease` aborts the release build. Debug
 * builds do not run it, which is why the app ran fine on the emulator for days
 * before `bundleRelease` was ever attempted.
 *
 * Disabling exactly this one check is deliberate over the alternatives:
 *   · Deleting the generated folder would also withdraw Spanish from Android's
 *     per-app language picker, and prebuild would rewrite it anyway.
 *   · Adding English NS* defaults would satisfy lint by shipping the same dead
 *     strings twice.
 *   · Turning off abortOnError would hide every future lint error too.
 *
 * Everything else lint checks still fails the release build.
 */
module.exports = function withAndroidReleaseLint(config) {
  return withAppBuildGradle(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (src.includes("disable 'ExtraTranslation'")) return cfg;

    const anchor = '    buildTypes {';
    if (!src.includes(anchor)) {
      throw new Error('withAndroidReleaseLint: could not find the buildTypes block to anchor to.');
    }
    const lintBlock = `    lint {
        // See plugins/withAndroidReleaseLint.js — iOS Info.plist strings that
        // Expo mirrors into res/values-b+es and that Android never reads.
        disable 'ExtraTranslation'
    }

`;
    cfg.modResults.contents = src.replace(anchor, lintBlock + anchor);
    return cfg;
  });
};
