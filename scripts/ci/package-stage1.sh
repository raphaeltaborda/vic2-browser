#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${OPENVIC_COMMIT:?OPENVIC_COMMIT is required}"
: "${OPENVIC_SCRIPTS_COMMIT:?OPENVIC_SCRIPTS_COMMIT is required}"
: "${OPENVIC_SIMULATION_COMMIT:?OPENVIC_SIMULATION_COMMIT is required}"
: "${OPENVIC_DATALOADER_COMMIT:?OPENVIC_DATALOADER_COMMIT is required}"
: "${EMSCRIPTEN_VERSION:?EMSCRIPTEN_VERSION is required}"

build_dir="${1:-build/openvic-wasm}"
openvic_dir="${2:-vendor/OpenVic}"
dist="${3:-dist}"

mapfile -t wasm_files < <(find "$build_dir" -type f -name 'libopenvic*.wasm' -print)
if [[ "${#wasm_files[@]}" -ne 1 ]]; then
  printf 'Expected exactly one OpenVic WASM artifact, found %s\n' "${#wasm_files[@]}" >&2
  printf '%s\n' "${wasm_files[@]}" >&2
  exit 1
fi

wasm="${wasm_files[0]}"
descriptor="$openvic_dir/game/bin/openvic.gdextension"
test -s "$wasm"
test -s "$descriptor"
node scripts/validate-stage1-wasm.mjs "$wasm"
grep -Fqx 'web.wasm32.single.release = "res://bin/openvic/libopenvic.web.template_release.wasm32.threads.wasm"' "$descriptor"

rm -rf "$dist"
mkdir -p "$dist/bin/openvic" "$dist/licenses" "$dist/patches"

install -m 0644 "$wasm" "$dist/bin/openvic/libopenvic.web.template_release.wasm32.threads.wasm"
install -m 0644 "$descriptor" "$dist/bin/openvic/openvic.gdextension"
install -m 0644 THIRD_PARTY_NOTICES.md "$dist/licenses/THIRD_PARTY_NOTICES.md"
install -m 0644 "$openvic_dir/LICENSE.md" "$dist/licenses/OpenVic-LICENSE.md"
install -m 0644 "$openvic_dir/COPYRIGHT" "$dist/licenses/OpenVic-COPYRIGHT"

while IFS= read -r -d '' patch; do
  target="$dist/$patch"
  mkdir -p "$(dirname "$target")"
  install -m 0644 "$patch" "$target"
done < <(find patches -type f -name '*.patch' -print0 | sort -z)

printf '%s\n' "$GITHUB_SHA" > "$dist/PORT_COMMIT"
printf '%s\n' "$OPENVIC_COMMIT" > "$dist/OPENVIC_COMMIT"
printf '%s\n' "$OPENVIC_SCRIPTS_COMMIT" > "$dist/OPENVIC_SCRIPTS_COMMIT"
printf '%s\n' "$OPENVIC_SIMULATION_COMMIT" > "$dist/OPENVIC_SIMULATION_COMMIT"
printf '%s\n' "$OPENVIC_DATALOADER_COMMIT" > "$dist/OPENVIC_DATALOADER_COMMIT"
printf '%s\n' "$EMSCRIPTEN_VERSION" > "$dist/EMSCRIPTEN_VERSION"

(
  cd "$dist"
  sha256sum bin/openvic/libopenvic.web.template_release.wasm32.threads.wasm > WASM_SHA256
  sha256sum bin/openvic/openvic.gdextension > GDEXTENSION_SHA256
  find patches -type f -name '*.patch' -print0 | sort -z | xargs -0 sha256sum > PATCHES_SHA256

  test -s PATCHES_SHA256
  sha256sum -c WASM_SHA256
  sha256sum -c GDEXTENSION_SHA256
  sha256sum -c PATCHES_SHA256
)

find "$dist" -type f -print | sort
