#!/usr/bin/env bash
set -euo pipefail

OPENVIC_DIR="${1:-vendor/OpenVic}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../patches" && pwd)"

if [[ ! -d "$OPENVIC_DIR/.git" ]]; then
  echo "OpenVic checkout not found: $OPENVIC_DIR" >&2
  exit 1
fi

for patch in "$PATCH_DIR"/*.patch; do
  echo "Applying $(basename "$patch")"
  git -C "$OPENVIC_DIR" apply --check "$patch"
  git -C "$OPENVIC_DIR" apply "$patch"
done

echo "OpenVic Web patches applied cleanly."
