#!/usr/bin/env bash
#
# Restore the recovery bundle from the encrypted file in this repo.
#
#   ./scripts/secrets-open.sh              -> ~/Semora-Recovery
#   ./scripts/secrets-open.sh /some/path   -> /some/path
#
# This is the whole point of sealing them: a fresh `git clone` on any machine
# plus the passphrase from your password manager gets every credential back.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENC="$REPO/secrets/semora-secrets.tar.gz.gpg"
DEST="${1:-$HOME}"

if [ ! -f "$ENC" ]; then
  echo "error: $ENC not found — has the bundle been sealed and committed?" >&2
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
