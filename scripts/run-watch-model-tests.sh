#!/usr/bin/env bash
# Compiles the pure Watch model for macOS and runs its checks. See
# scripts/watchModelTests/main.swift for why this is not an XCTest bundle.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)/watchmodeltests"
xcrun swiftc -O \
  targets/watch/WatchModel.swift \
  scripts/watchModelTests/main.swift \
  -o "$OUT"
"$OUT"
