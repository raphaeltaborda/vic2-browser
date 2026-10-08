#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${1:?artifact directory is required}"
project_dir="${2:?target Godot project directory is required}"
expected_sha="${3:?expected Stage 1 commit is required}"

for file in WASM_SHA256 GDEXTENSION_SHA256 PATCHES_SHA256 PORT_COMMIT OPENVIC_COMMIT OPENVIC_SIMULATION_COMMIT OPENVIC_DATALOADER_COMMIT EMSCRIPTEN_VERSION; do
  test -s "$artifact_dir/$file"
done

(
  cd "$artifact_dir"
  sha256sum -c WASM_SHA256
  sha256sum -c GDEXTENSION_SHA256
  sha256sum -c PATCHES_SHA256
)

actual_sha="$(tr -d '\r\n' < "$artifact_dir/PORT_COMMIT")"
if [[ "$actual_sha" != "$expected_sha" ]]; then
  echo "Stage 1 provenance mismatch: expected $expected_sha, got $actual_sha" >&2
  exit 1
fi

wasm="$artifact_dir/bin/openvic/libopenvic.web.template_release.wasm32.threads.wasm"
descriptor="$artifact_dir/bin/openvic/openvic.gdextension"
test -s "$wasm"
test -s "$descriptor"
grep -Fqx 'web.wasm32.single.release = "res://bin/openvic/libopenvic.web.template_release.wasm32.threads.wasm"' "$descriptor"

target="$project_dir/bin/openvic"
rm -rf "$target"
mkdir -p "$target"
install -m 0644 "$wasm" "$target/"
install -m 0644 "$descriptor" "$target/"

echo "Installed validated Stage 1 payload from $actual_sha into $target"
