#!/usr/bin/env bash
#
# Did the native runtime change?
#
# Since 1.12 Semora's runtimeVersion is a fingerprint of the native project
# rather than the marketing version, which is what lets two App Store builds
# with identical native code share one OTA update. The cost of that is a new
# way to be wrong: the fingerprint can move without anybody deciding it should
# — a dependency bump, a config plugin, a new file under patches/ — and when it
# does, an OTA published afterwards targets a runtime no installed binary has.
# Nothing fails. The update simply reaches nobody, silently, which is the worst
# shape a release problem can take.
#
# So the fingerprint is written down. This compares the current one against the
# committed baseline and says plainly which of the two situations you are in.
#
#   scripts/check-native-fingerprint.sh            check, exit 1 on drift
#   scripts/check-native-fingerprint.sh --update   accept the current one
#
# Run it before publishing an OTA (drift means the update will not land) and
# after any native change (drift is expected, and should be accepted here so the
# next check is meaningful again).
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE="fingerprint.baseline.json"
PLATFORM="${PLATFORM:-ios}"

# Deliberately NOT `expo-updates fingerprint:generate`.
#
# That CLI and the generator the Xcode build runs disagree. Measured here on
# identical state they differ by twelve node_modules files — cross-spawn and its
# dependencies, which the CLI's own process drags into the plugin graph. The
# number that matters is the one written into EXUpdates.bundle, because that is
# what the installed app compares an update against, so this runs the build's
# own generator and the result is byte-identical to what a built .app contains.
current() {
  local out
  out="$(mktemp -d)"
  node node_modules/expo-updates/utils/build/createUpdatesResources.js \
    "$PLATFORM" "$PWD" "$out" only-fingerprint >/dev/null 2>&1 || true
  cat "$out/fingerprint" 2>/dev/null
  rm -rf "$out"
}

CURRENT="$(current)"
[[ -n "$CURRENT" ]] || { echo "could not generate a fingerprint" >&2; exit 2; }

if [[ "${1:-}" == "--update" ]]; then
  VERSION=$(node -p "require('./app.json').expo.version")
  BUILD=$(node -p "require('./app.json').expo.ios.buildNumber")
  cat > "$BASELINE" <<JSON
{
  "//": "The native runtime fingerprint this project expects. Updated deliberately, by scripts/check-native-fingerprint.sh --update, whenever a native change is intended. If this file and the generated fingerprint disagree, something changed the native surface without anyone deciding to.",
  "platform": "$PLATFORM",
  "fingerprint": "$CURRENT",
  "recordedForVersion": "$VERSION",
  "recordedForBuild": "$BUILD"
}
JSON
  echo "baseline updated → $CURRENT  (for $VERSION build $BUILD)"
  exit 0
fi

if [[ ! -f "$BASELINE" ]]; then
  echo "no $BASELINE yet. Current fingerprint is $CURRENT." >&2
  echo "Run: scripts/check-native-fingerprint.sh --update" >&2
  exit 2
fi

EXPECTED=$(node -p "require('./$BASELINE').fingerprint")
RECORDED=$(node -p "const b=require('./$BASELINE'); b.recordedForVersion + ' build ' + b.recordedForBuild")

if [[ "$CURRENT" == "$EXPECTED" ]]; then
  echo "native runtime unchanged: $CURRENT"
  echo "  (baseline recorded for $RECORDED)"
  echo "  An OTA published now will reach binaries built from this native state."
  exit 0
fi

cat >&2 <<MSG

NATIVE RUNTIME FINGERPRINT CHANGED

  expected  $EXPECTED   (recorded for $RECORDED)
  current   $CURRENT

What this means depends on what you are about to do.

  Publishing an OTA?  STOP. The update would be tagged with the current
                      fingerprint, and no installed binary has it. It would
                      reach nobody, and nothing would report an error.

  Cutting a build?    This is expected if you changed native code, a native
                      dependency, app.json, a config plugin or patches/.
                      Accept it:  scripts/check-native-fingerprint.sh --update

To see WHAT moved:
  npx expo-updates fingerprint:generate --platform $PLATFORM > /tmp/now.json
  ...and diff its "sources" against the previous run.

MSG
exit 1
