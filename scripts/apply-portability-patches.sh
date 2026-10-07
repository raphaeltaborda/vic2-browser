#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENVIC_DIR="${1:-$ROOT/vendor/OpenVic}"
SCRIPTS_DIR="${2:-$ROOT/vendor/OpenVic-scripts}"
SIM_DIR="$OPENVIC_DIR/extension/deps/openvic-simulation"

: "${OPENVIC_COMMIT:?OPENVIC_COMMIT is required}"
: "${OPENVIC_SCRIPTS_COMMIT:?OPENVIC_SCRIPTS_COMMIT is required}"
: "${OPENVIC_SIMULATION_COMMIT:?OPENVIC_SIMULATION_COMMIT is required}"

verify_repo() {
  local label="$1"
  local dir="$2"
  local expected="$3"

  [[ -d "$dir/.git" || -f "$dir/.git" ]] || {
    echo "$label checkout not found: $dir" >&2
    exit 1
  }

  local actual
  actual="$(git -C "$dir" rev-parse HEAD)"
  [[ "$actual" == "$expected" ]] || {
    echo "$label revision mismatch: expected $expected, got $actual" >&2
    exit 1
  }

  [[ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ]] || {
    echo "$label checkout is dirty before patching" >&2
    git -C "$dir" status --short >&2
    exit 1
  }
}

apply_patch() {
  local label="$1"
  local dir="$2"
  local patch="$3"

  echo "Applying $label: $patch"
  git -C "$dir" apply --check "$patch"
  git -C "$dir" apply "$patch"
  git -C "$dir" diff --check
}

verify_repo "OpenVic" "$OPENVIC_DIR" "$OPENVIC_COMMIT"
verify_repo "OpenVic scripts" "$SCRIPTS_DIR" "$OPENVIC_SCRIPTS_COMMIT"
verify_repo "OpenVic-Simulation" "$SIM_DIR" "$OPENVIC_SIMULATION_COMMIT"

apply_patch "OpenVic Web target" "$OPENVIC_DIR"   "$ROOT/patches/openvic/0001-emscripten-side-module.patch"
apply_patch "libc++ ABI namespace" "$SCRIPTS_DIR"   "$ROOT/patches/openvic-scripts/0001-portable-libcpp-abi-namespace.patch"
apply_patch "wasm32 hashing" "$SIM_DIR"   "$ROOT/patches/openvic-simulation/0001-wasm32-size-t-hashing.patch"

echo "Portability patch series applied cleanly."
