#!/usr/bin/env bash
#
# Restore the credential bundle from an encrypted offline archive.
#
#   ./scripts/secrets-restore.sh <archive.gpg> [dest]
#
# The archive is NOT in this repo — it lives in your password manager or on an
# external drive. See secrets/README.md for why.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENC="${1:?usage: secrets-restore.sh <archive.gpg> [dest]}"
DEST="${2:-$HOME}"

if [ ! -f "$ENC" ]; then
  echo "error: $ENC not found — point this at your offline archive." >&2
  exit 1
fi

if [ -d "$DEST/Semora-Recovery" ]; then
  echo "error: $DEST/Semora-Recovery already exists." >&2
  echo "       Move or delete it first so this cannot silently overwrite a newer copy." >&2
  exit 1
fi

gpg --quiet --decrypt "$ENC" | tar -xzf - -C "$DEST"

echo "restored to $DEST/Semora-Recovery"
echo
echo "put the App Store Connect key back where the tooling expects it:"
echo "    mkdir -p ~/.appstoreconnect/private_keys"
echo "    cp $DEST/Semora-Recovery/AuthKey_UJ7WBMA5H5.p8 ~/.appstoreconnect/private_keys/"
echo "    cp $DEST/Semora-Recovery/issuer_id.txt          ~/.appstoreconnect/"
echo
echo "and the Sign in with Apple key back into the repo root (it stays gitignored):"
echo "    cp $DEST/Semora-Recovery/AuthKey_DQ64DU246B.p8 $REPO/"
echo "    cp $DEST/Semora-Recovery/env.local.txt         $REPO/.env.local"
