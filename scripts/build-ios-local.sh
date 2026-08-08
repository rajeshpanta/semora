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
# Credentials are read from the environment or from the recovery bundle, never
# hardcoded — this repo is public.
#
#   ASC_KEY_ID     defaults to the single key in ~/.appstoreconnect/private_keys
#   ASC_ISSUER_ID  defaults to ~/Semora-Recovery/issuer_id.txt
#
# Usage:  scripts/build-ios-local.sh [--no-prebuild]
# Output: ~/Desktop/SemoraBuild/Semora.ipa
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$HOME/Desktop/SemoraBuild"
KEYS="$HOME/.appstoreconnect/private_keys"
TEAM_ID="7T9897GFKH"

ASC_KEY_ID="${ASC_KEY_ID:-$(ls "$KEYS" 2>/dev/null | sed -n 's/^AuthKey_\(.*\)\.p8$/\1/p' | head -1)}"
# issuer_id.txt is a notes file, not a bare id — pull the UUID out of it. Reading
# the whole file and stripping whitespace yields a 250-char string that every
# Apple API rejects with a bare 401, which reads like a permissions problem and
# is not one.
ASC_ISSUER_ID="${ASC_ISSUER_ID:-$(grep -oE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' "$HOME/Semora-Recovery/issuer_id.txt" 2>/dev/null | head -1)}"

# The API key is optional: if an Apple ID is signed into Xcode, xcodebuild can
# manage provisioning through that session instead.
AUTH=(-allowProvisioningUpdates)
if [[ -n "$ASC_KEY_ID" && -n "$ASC_ISSUER_ID" && -f "$KEYS/AuthKey_$ASC_KEY_ID.p8" ]]; then
  AUTH+=(-authenticationKeyPath "$KEYS/AuthKey_$ASC_KEY_ID.p8"
         -authenticationKeyID "$ASC_KEY_ID"
         -authenticationKeyIssuerID "$ASC_ISSUER_ID")
else
  echo "note: no App Store Connect API key found; relying on the Apple ID signed into Xcode."
fi

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
echo "Upload with:"
echo "  xcrun altool --upload-app -f \"$OUT/Semora.ipa\" -t ios \\"
echo "    --apiKey $ASC_KEY_ID --apiIssuer \"\$ASC_ISSUER_ID\""
echo "or drag it into Transporter.app."
