#!/usr/bin/env bash
#
# Build and export an App Store .ipa on this Mac, with no EAS build credits.
#
# EAS Build is a metered cloud service; the Expo framework itself is not. This
# script is the local replacement: prebuild regenerates ios/ from app.json (the
# version and build number live there, so the native project is always a
# derived artifact), then xcodebuild archives and exports.
#
# Two things that are easy to get wrong and cost an afternoon:
#
#   1. Automatic signing means you must NOT pass CODE_SIGN_IDENTITY. Xcode
#      archives with a development identity and re-signs with the distribution
#      one at export time. Pinning "Apple Distribution" on the archive step
#      fails with "conflicting provisioning settings".
#
#   2. Expo's generated project pins CODE_SIGN_IDENTITY[sdk=iphoneos*] to
#      "iPhone Developer" in the *Release* config. That is why a manual archive
#      reports "Provisioning profile doesn't include signing certificate" —
#      it is a development identity paired with a distribution profile. Passing
#      CODE_SIGN_STYLE=Automatic on the command line is what resolves it, and
#      it has to be a command-line override because prebuild rewrites the
#      pbxproj on every run.
#
# Prerequisite: an Apple ID signed in under Xcode → Settings → Accounts, with
# the Rajesh Panta (7T9897GFKH) team. No secrets live in this file — the repo is
# public — and none are needed; Xcode holds the session.
#
# Usage:  scripts/build-ios-local.sh [--no-prebuild]
# Output: ~/Desktop/SemoraBuild/Semora.ipa
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$HOME/Desktop/SemoraBuild"
TEAM_ID="7T9897GFKH"

# Signing goes through the Apple ID in Xcode → Settings → Accounts.
#
# Deliberately NOT passing -authenticationKeyPath. When an App Store Connect
# API key is supplied, xcodebuild uses it for cloud signing and ignores the
# Xcode account entirely — and the key in ~/.appstoreconnect/private_keys is
# Developer role, i.e. read-only. It cannot create the profile the widget needs,
# so the export dies with "Cloud signing permission error" plus a misleading
# "profile doesn't include the App Groups capability". Removing the key is what
# fixes it. Only reintroduce one if it has Admin or App Manager access.
AUTH=(-allowProvisioningUpdates)

mkdir -p "$OUT"
cd "$ROOT"

# ── Guard 1: the picker patch has to be ON DISK before pods are installed ────
#
# expo-document-picker is a development pod — Podfile.lock points at
# ../node_modules/expo-document-picker/ios and Xcode compiles those files in
# place. So the patch reaches the binary if, and only if, patch-package has
# already run. It normally has, via postinstall. But nothing in this script
# installs anything, so a build on a tree where npm ci was interrupted, or
# where node_modules was restored from a cache taken before the patch landed,
# would produce a binary that silently lacks the one fix it was cut for.
PATCHED_SWIFT="node_modules/expo-document-picker/ios/DocumentPickerModule.swift"
if ! grep -q "PickerHostBusyException" "$PATCHED_SWIFT" 2>/dev/null; then
  echo >&2
  echo "PICKER PATCH NOT APPLIED." >&2
  echo "  $PATCHED_SWIFT does not contain the Semora patch." >&2
  echo "  Run: npx patch-package    (or npm ci, which runs it via postinstall)" >&2
  exit 1
fi
echo "==> picker patch present in node_modules"

# ── Guard 2: is the native runtime the one we think it is? ──────────────────
#
# Informational here rather than fatal: cutting a build is exactly when the
# fingerprint is allowed to move. It is printed so the person releasing sees it
# and remembers to re-record the baseline afterwards.
scripts/check-native-fingerprint.sh || echo "==> (expected for a native release — re-record with --update once this build is cut)"

if [[ "${1:-}" != "--no-prebuild" ]]; then
  # --clean, not an incremental prebuild.
  #
  # An incremental run over an ios/ that already contains the Watch targets
  # crashes inside @bacons/apple-targets:
  #
  #   Target "SemoraWatch" already exists, updating instead of creating a new one
  #   TypeError: Cannot read properties of undefined (reading 'getDefaultConfiguration')
  #
  # createWatchAppConfigurationList looks up the main app target while the
  # project is mid-rewrite and finds a target with no configuration list yet.
  # Regenerating from scratch never reaches that path, which is why every clean
  # prebuild in verification passed while this script failed on its first run
  # after the Watch work landed.
  #
  # Safe because ios/ is a derived artifact: it is gitignored, contains no
  # hand-edits, and every target — app, widget, watch app, complication — comes
  # from app.json plus targets/*/expo-target.config.js. The cost is a full pod
  # install per release build.
  echo "==> prebuild --clean (regenerates ios/ from app.json)"
  npx expo prebuild --clean -p ios
fi

VERSION=$(plutil -extract CFBundleShortVersionString raw ios/Semora/Info.plist)
BUILD=$(plutil -extract CFBundleVersion raw ios/Semora/Info.plist)
echo "==> building Semora $VERSION ($BUILD)"

rm -rf "$OUT/Semora.xcarchive" "$OUT/export"
xcodebuild -workspace ios/Semora.xcworkspace \
  -scheme Semora -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$OUT/Semora.xcarchive" \
  "${AUTH[@]}" \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM_ID" \
  archive | tee "$OUT/archive.log" | grep -E '^\*\*|error:' || true

[[ -d "$OUT/Semora.xcarchive" ]] || { echo "archive failed — see $OUT/archive.log" >&2; exit 1; }

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
  <!--
    Without this, Xcode renumbers the build during export.

    For method "app-store-connect" the key defaults to TRUE, which lets Xcode
    pick the next build number free in App Store Connect and stamp it into the
    .ipa. It stayed invisible through 1.10 only because build 53 had not been
    uploaded yet when its own export ran; a verification export of that same
    archive afterwards came out as 54, while the archive and app.json both still
    said 53. Nothing warns about it.

    app.json is the single source of the version and build number — ios/ is a
    derived artifact regenerated from it — so having the export quietly disagree
    means the number reviewed is not the number shipped.
  -->
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

echo "==> exporting .ipa"
xcodebuild -exportArchive \
  -archivePath "$OUT/Semora.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" \
  "${AUTH[@]}" | tee "$OUT/export.log" | grep -E '^\*\*|error:' || true

IPA=$(find "$OUT/export" -name '*.ipa' | head -1)
[[ -n "$IPA" ]] || { echo "export failed — see $OUT/export.log" >&2; exit 1; }
cp -f "$IPA" "$OUT/Semora.ipa"

# Prove the number that went in is the number that came out.
#
# The manageAppVersionAndBuildNumber=false above is the fix; this is the alarm.
# A silent renumber is invisible in every log, so the only way to know it has
# come back — a new Xcode, a changed default, someone editing the plist — is to
# open the artifact and look.
VERIFY_DIR=$(mktemp -d)
unzip -q "$OUT/Semora.ipa" -d "$VERIFY_DIR"
VERIFY_APP=$(find "$VERIFY_DIR/Payload" -maxdepth 1 -name '*.app' | head -1)
IPA_VERSION=$(plutil -extract CFBundleShortVersionString raw "$VERIFY_APP/Info.plist")
IPA_BUILD=$(plutil -extract CFBundleVersion raw "$VERIFY_APP/Info.plist")
rm -rf "$VERIFY_DIR"

if [[ "$IPA_VERSION" != "$VERSION" || "$IPA_BUILD" != "$BUILD" ]]; then
  echo >&2
  echo "BUILD NUMBER DRIFT: archived $VERSION ($BUILD) but the .ipa says $IPA_VERSION ($IPA_BUILD)." >&2
  echo "The export renumbered the build. Check manageAppVersionAndBuildNumber in ExportOptions." >&2
  exit 1
fi
echo "==> verified .ipa is $IPA_VERSION ($IPA_BUILD), matching app.json"

# ── Guard 3: prove the picker patch is in the BINARY, not just on disk ──────
#
# Swift `reason` strings survive into the compiled binary, so the patch's own
# words are the evidence. Guard 1 checks the source; this checks the artefact,
# which is the only thing that actually ships.
VERIFY2=$(mktemp -d)
unzip -q "$OUT/Semora.ipa" -d "$VERIFY2"
APP_BIN=$(find "$VERIFY2/Payload" -maxdepth 2 -name 'Semora' -type f | head -1)
if ! strings -a "$APP_BIN" 2>/dev/null | grep -q "The screen is already presenting something"; then
  echo >&2
  echo "PICKER PATCH MISSING FROM THE BINARY." >&2
  echo "  The patched Swift was on disk but its strings are not in the app." >&2
  echo "  A stale Pods/ or DerivedData is the usual cause; prebuild --clean fixes it." >&2
  rm -rf "$VERIFY2"; exit 1
fi

# ── Guard 4: OTA updates must be verifiable by the app that receives them ───
CERT_IN_APP=$(plutil -extract EXUpdatesCodeSigningCertificate raw \
  "$(dirname "$APP_BIN")/Expo.plist" 2>/dev/null | head -c 20)
if [[ -z "$CERT_IN_APP" ]]; then
  echo >&2
  echo "OTA CODE-SIGNING CERTIFICATE NOT EMBEDDED." >&2
  echo "  This binary would accept ANY update served on its channel." >&2
  echo "  Check updates.codeSigningCertificate in app.json and re-run prebuild." >&2
  rm -rf "$VERIFY2"; exit 1
fi
rm -rf "$VERIFY2"
echo "==> picker patch and OTA signing certificate both verified in the .ipa"

echo
echo "Semora $VERSION ($BUILD) -> $OUT/Semora.ipa"
echo "Upload by dragging it into Transporter.app, or:"
echo "  xcrun altool --upload-app -f \"$OUT/Semora.ipa\" -t ios --apiKey <KEYID> --apiIssuer <ISSUER>"
echo "(altool needs a key with Admin or App Manager access; the Developer-role"
echo " key in ~/.appstoreconnect/private_keys cannot upload.)"
