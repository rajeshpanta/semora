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

if [[ "${1:-}" != "--no-prebuild" ]]; then
  echo "==> prebuild (syncs ios/ with app.json)"
  npx expo prebuild -p ios
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

echo
echo "Semora $VERSION ($BUILD) -> $OUT/Semora.ipa"
echo "Upload by dragging it into Transporter.app, or:"
echo "  xcrun altool --upload-app -f \"$OUT/Semora.ipa\" -t ios --apiKey <KEYID> --apiIssuer <ISSUER>"
echo "(altool needs a key with Admin or App Manager access; the Developer-role"
echo " key in ~/.appstoreconnect/private_keys cannot upload.)"
