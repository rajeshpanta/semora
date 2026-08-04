#!/usr/bin/env bash
#
# Encrypt the recovery bundle into a single file that is safe to commit to a
# PUBLIC repo, then stage it.
#
#   ./scripts/secrets-seal.sh
#
# Prompts for a passphrase. That passphrase is the ONLY thing that must never
# be in git — put it in a password manager. Everything else lives in the repo
# from here on, so the credentials survive this machine.
#
# Uses gpg symmetric AES-256. The plaintext tarball exists only in a temp file
# that is removed on exit, including if the script is interrupted.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$HOME/Semora-Recovery}"
OUT="$REPO/secrets/semora-secrets.tar.gz.gpg"

if [ ! -d "$SRC" ]; then
  echo "error: no bundle at $SRC" >&2
  echo "       pass a different path as the first argument if it lives elsewhere." >&2
  exit 1
fi

# Refuse to run if the source is empty — sealing nothing and committing it
# would look like success while silently losing everything.
if [ -z "$(ls -A "$SRC" 2>/dev/null)" ]; then
  echo "error: $SRC is empty — nothing to seal." >&2
  exit 1
fi

TMP="$(mktemp -t semora-secrets)"
trap 'rm -f "$TMP"' EXIT INT TERM

echo "Sealing $(find "$SRC" -type f | wc -l | tr -d ' ') files from $SRC"
tar -czf "$TMP" -C "$(dirname "$SRC")" "$(basename "$SRC")"

mkdir -p "$REPO/secrets"
rm -f "$OUT"

# --symmetric      passphrase, no keyring to lose
# --cipher-algo    AES256
# --s2k-*          make an offline guess against the ciphertext expensive
gpg --symmetric \
    --cipher-algo AES256 \
    --s2k-digest-algo SHA512 \
    --s2k-count 65011712 \
    --output "$OUT" \
    "$TMP"

echo
echo "wrote $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"

# Prove it round-trips before anyone trusts it. An archive that cannot be
# opened is worse than no archive, because it feels like a backup.
echo "verifying it decrypts and the contents match..."
CHECK="$(mktemp -d -t semora-verify)"
trap 'rm -f "$TMP"; rm -rf "$CHECK"' EXIT INT TERM
gpg --quiet --decrypt "$OUT" 2>/dev/null | tar -xzf - -C "$CHECK"
BEFORE="$(find "$SRC" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | sort | shasum -a 256)"
AFTER="$(find "$CHECK" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | sort | shasum -a 256)"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "error: round-trip mismatch — the archive does NOT match the source." >&2
  rm -f "$OUT"
  exit 1
fi
echo "verified: decrypted contents are byte-identical to $SRC"

cd "$REPO" && git add -f "$OUT"
echo
echo "staged. commit it with:"
echo "    git commit -m 'Update encrypted secrets bundle' && git push"
